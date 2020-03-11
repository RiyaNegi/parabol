import graphql from 'babel-plugin-relay/macro'
import React from 'react'
import {createFragmentContainer} from 'react-relay'
import {ThreadedReplyComment_comment} from '__generated__/ThreadedReplyComment_comment.graphql'
import {ThreadedReplyComment_meeting} from '__generated__/ThreadedReplyComment_meeting.graphql'
import ThreadedCommentBase from './ThreadedCommentBase'

interface Props {
  comment: ThreadedReplyComment_comment
  meeting: ThreadedReplyComment_meeting
  reflectionGroupId: string
  setReplyingToComment: (commentId: string) => void
}

export const ThreadedComment = (props: Props) => {
  const {comment, reflectionGroupId, setReplyingToComment, meeting} = props
  return (
    <ThreadedCommentBase
      comment={comment}
      meeting={meeting}
      isReply
      reflectionGroupId={reflectionGroupId}
      setReplyingToComment={setReplyingToComment}
    />
  )
}

export default createFragmentContainer(ThreadedComment, {
  meeting: graphql`
    fragment ThreadedReplyComment_meeting on RetrospectiveMeeting {
      ...ThreadedCommentBase_meeting
    }
  `,
  comment: graphql`
    fragment ThreadedReplyComment_comment on Comment {
      ...ThreadedCommentBase_comment
    }
  `
})
