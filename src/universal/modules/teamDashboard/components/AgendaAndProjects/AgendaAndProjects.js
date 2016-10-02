import React, {PropTypes} from 'react';
import withStyles from 'universal/styles/withStyles';
import {css} from 'aphrodite';
import layout from 'universal/styles/layout';
import ui from 'universal/styles/ui';
import TeamAgenda from 'universal/modules/teamDashboard/components/TeamAgenda/TeamAgenda';
import TeamColumnsContainer from 'universal/modules/teamDashboard/containers/TeamColumns/TeamColumnsContainer';
import TeamProjectsHeader from 'universal/modules/teamDashboard/components/TeamProjectsHeader/TeamProjectsHeader';

const AgendaAndProjects = (props) => {
  const {params: {teamId}, styles} = props;
  return (
    <div className={css(styles.root)}>
      <div className={css(styles.inner)}>
        <div className={css(styles.agendaLayout)}>
          <TeamAgenda teamId={teamId}/>
        </div>
        <div className={css(styles.projectsLayout)}>
          <div className={css(styles.root, styles.projects)}>
            <TeamProjectsHeader
              teamId={teamId}
            />
            <TeamColumnsContainer
              teamId={teamId}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

AgendaAndProjects.propTypes = {
  params: PropTypes.object,
  teamId: PropTypes.string,
  teamMembers: PropTypes.array
};

const borderColor = ui.dashBorderColor;
const styleThunk = () => ({
  root: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    width: '100%'
  },

  inner: {
    display: 'flex',
    flex: 1,
    width: '100%'
  },

  projects: {
    flex: 1,
    flexDirection: 'column',
  },

  agendaLayout: {
    borderRight: `2px solid ${borderColor}`,
    boxSizing: 'content-box',
    display: 'flex',
    flexDirection: 'column',
    width: layout.dashAgendaWidth
  },

  projectsLayout: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    paddingLeft: '1rem'
  }
});

export default withStyles(styleThunk)(AgendaAndProjects);
