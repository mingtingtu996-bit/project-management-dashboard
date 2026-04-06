import { createContext, useContext, ReactNode } from 'react'
import { useStore } from '@/hooks/useStore'
import type { Project } from '@/lib/supabase'

interface ProjectContextValue {
  currentProject: Project | null
  setCurrentProject: (project: Project | null) => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { currentProject, setCurrentProject } = useStore()
  return (
    <ProjectContext.Provider value={{ currentProject, setCurrentProject }}>
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    // 降级：直接读 store，避免组件在 Provider 外崩溃
    const { currentProject, setCurrentProject } = useStore.getState()
    return { currentProject, setCurrentProject }
  }
  return ctx
}
