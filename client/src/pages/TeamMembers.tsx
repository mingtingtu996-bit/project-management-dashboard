import { useParams } from 'react-router-dom'

import { Breadcrumb } from '@/components/Breadcrumb'
import { PageHeader } from '@/components/PageHeader'
import { ProjectTeamManagementPanel } from '@/components/team/ProjectTeamManagementPanel'
import { useCurrentProject, useProjects } from '@/hooks/useStore'

export default function TeamMembers() {
  const { id } = useParams<{ id: string }>()
  const currentProject = useCurrentProject()
  const projects = useProjects()

  if (!id) return null

  const projectName = currentProject?.id === id
    ? currentProject?.name
    : projects.find((project) => project.id === id)?.name

  return (
    <div className="space-y-6 page-enter" data-testid="team-members-page">
      <Breadcrumb
        items={[
          { label: projectName || '项目', href: `/projects/${id}/dashboard` },
          { label: '辅助能力' },
          { label: '团队管理' },
        ]}
      />
      <PageHeader
        eyebrow="辅助能力"
        title="团队管理"
      />
      <ProjectTeamManagementPanel projectId={id} projectName={projectName} layout="page" />
    </div>
  )
}
