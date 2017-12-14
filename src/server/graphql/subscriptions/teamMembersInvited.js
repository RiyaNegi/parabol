import {GraphQLID, GraphQLNonNull} from 'graphql';
import makeSubscribeIter from 'server/graphql/makeSubscribeIter';
import {requireTeamMember} from 'server/utils/authorization';
import InviteTeamMembersPayload from 'server/graphql/types/InviteTeamMembersPayload';
import {TEAM_MEMBERS_INVITED} from 'universal/utils/constants';

export default {
  type: new GraphQLNonNull(InviteTeamMembersPayload),
  args: {
    teamId: {
      type: new GraphQLNonNull(GraphQLID)
    }
  },
  subscribe: (source, {teamId}, {authToken, dataLoader, socketId}) => {
    // AUTH
    requireTeamMember(authToken, teamId);

    // RESOLUTION
    const channelName = `${TEAM_MEMBERS_INVITED}.${teamId}`;
    const filterFn = (value) => value.mutatorId !== socketId;
    return makeSubscribeIter(channelName, {filterFn, dataLoader});
  }
};
