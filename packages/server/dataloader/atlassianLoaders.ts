import DataLoader from 'dataloader'
import {decode} from 'jsonwebtoken'
import JiraIssueId from 'parabol-client/shared/gqlIds/JiraIssueId'
import {JiraGetIssueRes, JiraProject} from 'parabol-client/utils/AtlassianManager'
import {AtlassianAuth} from '../postgres/queries/getAtlassianAuthByUserIdTeamId'
import insertTaskEstimate from '../postgres/queries/insertTaskEstimate'
import {downloadAndCacheImages, updateJiraImageUrls} from '../utils/atlassian/jiraImages'
import AtlassianServerManager from '../utils/AtlassianServerManager'
import {isNotNull} from '../utils/predicates'
import sendToSentry from '../utils/sendToSentry'
import RootDataLoader from './RootDataLoader'
import getAtlassianAuthsByUserId from '../postgres/queries/getAtlassianAuthsByUserId'
import upsertAtlassianAuths from '../postgres/queries/upsertAtlassianAuths'

type TeamUserKey = {teamId: string; userId: string}
export interface JiraRemoteProjectKey {
  userId: string
  teamId: string
  cloudId: string
  projectKey: string
}

export interface JiraIssueKey {
  teamId: string
  userId: string
  cloudId: string
  issueKey: string
  taskId?: string
}

export const freshAtlassianAuth = (parent: RootDataLoader) => {
  return new DataLoader<TeamUserKey, AtlassianAuth | null, string>(
    async (keys) => {
      const results = await Promise.allSettled(
        keys.map(async ({userId, teamId}) => {
          const userAtlassianAuths = await getAtlassianAuthsByUserId(userId)
          const atlassianAuthToRefresh = userAtlassianAuths.find(
            (atlassianAuth) => atlassianAuth.teamId === teamId
          )
          if (!atlassianAuthToRefresh) {
            return null
          }

          const {accessToken: existingAccessToken, refreshToken} = atlassianAuthToRefresh
          const decodedToken = existingAccessToken && (decode(existingAccessToken) as any)
          const now = new Date()
          const inAMinute = Math.floor((now.getTime() + 60000) / 1000)
          if (!decodedToken || decodedToken.exp < inAMinute) {
            const oauthRes = await AtlassianServerManager.refresh(refreshToken)
            if (oauthRes instanceof Error) {
              sendToSentry(oauthRes)
              return null
            }
            const {accessToken, refreshToken: newRefreshToken} = oauthRes
            const updatedRefreshToken = newRefreshToken ?? atlassianAuthToRefresh.refreshToken
            // if user integrated the same Jira account with using different teams we need to update them as well
            // reference: https://github.com/ParabolInc/parabol/issues/5601
            const updatedSameJiraAccountAtlassianAuths = userAtlassianAuths
              .filter((auth) => auth.accountId === atlassianAuthToRefresh.accountId)
              .map((auth) => ({
                ...auth,
                accessToken,
                refreshToken: updatedRefreshToken
              }))
            await upsertAtlassianAuths(updatedSameJiraAccountAtlassianAuths)
          }

          return atlassianAuthToRefresh
        })
      )
      return results.map((result) => (result.status === 'fulfilled' ? result.value : null))
    },
    {
      ...parent.dataLoaderOptions,
      cacheKeyFn: (key) => `${key.userId}:${key.teamId}`
    }
  )
}

export const jiraRemoteProject = (parent: RootDataLoader) => {
  return new DataLoader<JiraRemoteProjectKey, JiraProject | null, string>(
    async (keys) => {
      const results = await Promise.allSettled(
        keys.map(async ({userId, teamId, cloudId, projectKey}) => {
          const auth = await parent.get('freshAtlassianAuth').load({teamId, userId})
          if (!auth) return null
          const {accessToken} = auth
          const manager = new AtlassianServerManager(accessToken)
          const projectRes = await manager.getProject(cloudId, projectKey)
          if (projectRes instanceof Error) {
            sendToSentry(projectRes, {userId, tags: {teamId, projectKey}})
            return null
          }
          return projectRes
        })
      )
      return results.map((result) => (result.status === 'fulfilled' ? result.value : null))
    },
    {
      ...parent.dataLoaderOptions,
      cacheKeyFn: (key) => `${key.projectKey}:${key.cloudId}`
    }
  )
}

export const jiraIssue = (parent: RootDataLoader) => {
  return new DataLoader<JiraIssueKey, JiraGetIssueRes['fields'] | null, string>(
    async (keys) => {
      const results = await Promise.allSettled(
        keys.map(async ({teamId, userId, cloudId, issueKey, taskId}) => {
          const [auth, estimates] = await Promise.all([
            parent.get('freshAtlassianAuth').load({teamId, userId}),
            taskId ? parent.get('latestTaskEstimates').load(taskId) : []
          ])
          if (!auth) return null
          const {accessToken} = auth
          const manager = new AtlassianServerManager(accessToken)
          const estimateFieldIds = estimates
            .map((estimate) => estimate.jiraFieldId)
            .filter(isNotNull)

          const issueRes = await manager.getIssue(cloudId, issueKey, estimateFieldIds)
          if (issueRes instanceof Error) {
            sendToSentry(issueRes, {userId, tags: {cloudId, issueKey, teamId}})
            return null
          }
          const {fields} = issueRes

          const {updatedDescription, imageUrlToHash} = updateJiraImageUrls(
            cloudId,
            issueRes.fields.descriptionHTML
          )
          downloadAndCacheImages(manager, imageUrlToHash)

          // update our records
          await Promise.all(
            estimates.map((estimate) => {
              const {jiraFieldId, label, discussionId, name, taskId, userId} = estimate
              const freshEstimate = String(fields[jiraFieldId])
              if (freshEstimate === label) return undefined
              // mutate current dataloader
              estimate.label = freshEstimate
              return insertTaskEstimate({
                changeSource: 'external',
                // keep the link to the discussion alive, if possible
                discussionId,
                jiraFieldId,
                label: freshEstimate,
                name,
                meetingId: null,
                stageId: null,
                taskId,
                userId
              })
            })
          )

          return {
            ...fields,
            descriptionHTML: updatedDescription,
            teamId,
            userId
          }
        })
      )
      return results.map((result) => (result.status === 'fulfilled' ? result.value : null))
    },
    {
      ...parent.dataLoaderOptions,
      cacheKeyFn: ({cloudId, issueKey}) => JiraIssueId.join(cloudId, issueKey)
    }
  )
}

interface CloudNameLookup {
  [cloudId: string]: string
}
export const atlassianCloudNameLookup = (parent: RootDataLoader) => {
  return new DataLoader<TeamUserKey, CloudNameLookup, string>(
    async (keys) => {
      const results = await Promise.allSettled(
        keys.map(async ({teamId, userId}) => {
          const auth = await parent.get('freshAtlassianAuth').load({teamId, userId})
          if (!auth) return {}
          const {accessToken} = auth
          const manager = new AtlassianServerManager(accessToken)
          const result = await manager.getCloudNameLookup()
          if (result instanceof Error) {
            sendToSentry(result, {userId, tags: {teamId}})
            return {}
          }
          return result
        })
      )
      return results.map((result) => (result.status === 'fulfilled' ? result.value : {}))
    },
    {
      ...parent.dataLoaderOptions,
      cacheKeyFn: ({teamId, userId}) => `${teamId}:${userId}`
    }
  )
}

interface CloudNameKey extends TeamUserKey {
  cloudId: string
}

export const atlassianCloudName = (parent: RootDataLoader) => {
  return new DataLoader<CloudNameKey, string, string>(
    async (keys) => {
      const results = await Promise.allSettled(
        keys.map(async ({cloudId, teamId, userId}) => {
          const lookup = await parent.get('atlassianCloudNameLookup').load({teamId, userId})
          return lookup[cloudId] ?? ''
        })
      )
      return results.map((result) => (result.status === 'fulfilled' ? result.value : ''))
    },
    {
      ...parent.dataLoaderOptions,
      cacheKeyFn: ({cloudId}) => cloudId
    }
  )
}
