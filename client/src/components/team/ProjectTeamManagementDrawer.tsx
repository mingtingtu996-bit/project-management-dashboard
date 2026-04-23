import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ProjectTeamManagementPanel } from '@/components/team/ProjectTeamManagementPanel'

interface ProjectTeamManagementDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName?: string | null
}

export function ProjectTeamManagementDrawer({ open, onOpenChange, projectId, projectName }: ProjectTeamManagementDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-screen max-h-screen w-full max-w-[920px] translate-x-0 translate-y-0 overflow-y-auto rounded-none border-l border-slate-200 p-0 sm:max-w-[920px]">
        <div className="border-b border-slate-200 bg-white px-6 py-5">
          <DialogHeader>
            <DialogTitle>团队管理</DialogTitle>
            <DialogDescription>团队管理已并入 Header 用户菜单，成员管理、负责人转让、邀请码和密码重置都在这里完成。</DialogDescription>
          </DialogHeader>
        </div>
        <div className="p-6">
          <ProjectTeamManagementPanel projectId={projectId} projectName={projectName} layout="drawer" onClose={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default ProjectTeamManagementDrawer
