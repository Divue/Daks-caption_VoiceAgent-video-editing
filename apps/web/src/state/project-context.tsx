import { createContext, useContext, useMemo, useReducer } from 'react'
import type { Dispatch, ReactNode } from 'react'
import { Project } from '@captions/shared'
import demoProjectFixture from '@captions/shared/fixtures/demo-project.json'
import { createInitialState, projectReducer } from './project-reducer'
import type { ProjectAction } from './project-reducer'

interface ProjectContextValue {
  project: Project
  dispatch: Dispatch<ProjectAction>
  canUndo: boolean
  canRedo: boolean
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(
    projectReducer,
    undefined,
    () => createInitialState(Project.parse(demoProjectFixture)),
  )

  const value = useMemo<ProjectContextValue>(
    () => ({
      project: state.present,
      dispatch,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
    }),
    [state],
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return context
}
