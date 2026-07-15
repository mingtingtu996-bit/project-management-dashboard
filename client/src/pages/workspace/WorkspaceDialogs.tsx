// v1.4.20.1: dialogs kept out of WorkspacePage so page code stays orchestration-focused.

import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, Search } from 'lucide-react'

import { EmptyState } from '@/components/EmptyState'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { toast } from '@/hooks/use-toast'
import type { JoinableProject, WorkspaceCompany, WorkspaceInvitation } from '@/hooks/useWorkspaceData'
import { zhCN } from '@/i18n/zh-CN'
import { apiGet, apiPost, getApiErrorMessage } from '@/lib/apiClient'
import { cn } from '@/lib/utils'

const W = zhCN.workspace

type CompanySearchResult = {
  id: string
  name: string
  discoverability?: string
  join_policy?: string
}

function normalizeCompanyActive(company: WorkspaceCompany) {
  return company.isCurrent || company.active
}

export function CompanySwitcherDialog({
  open,
  companies,
  actionKey,
  onOpenChange,
  onSwitch,
}: {
  open: boolean
  companies: WorkspaceCompany[]
  actionKey: string | null
  onOpenChange: (open: boolean) => void
  onSwitch: (companyId: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{W.dialogs.switchCompany}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">{W.dialogs.switchCompanyDescription}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {companies.map((company) => {
            const active = normalizeCompanyActive(company)
            return (
              <Button unstyled
                key={company.id}
                type="button"
                disabled={active || actionKey === `switch:${company.id}`}
                className={cn(
                  'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                  active ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white hover:bg-slate-50',
                )}
                onClick={() => onSwitch(company.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{company.name}</span>
                  <span className="text-xs text-slate-500">{company.role === 'company_admin' ? W.roles.companyAdmin : W.roles.regular}</span>
                </span>
                {actionKey === `switch:${company.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? <CheckCircle2 className="h-4 w-4" /> : null}
              </Button>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function InvitationConfirmDialog({
  action,
  loading,
  onOpenChange,
  onConfirm,
}: {
  action: { type: 'accept' | 'decline'; invitation: WorkspaceInvitation } | null
  loading: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const isAccept = action?.type === 'accept'
  return (
    <AlertDialog open={Boolean(action)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isAccept ? W.dialogs.acceptInvitation : W.dialogs.declineInvitation}</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-slate-500">
            {isAccept ? W.dialogs.acceptInvitationDescription : W.dialogs.declineInvitationDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{action?.invitation.projectName || W.dialogs.projectInvitation}</div>
        <AlertDialogFooter>
          <AlertDialogCancel>{W.dialogs.cancel}</AlertDialogCancel>
          <AlertDialogAction loading={loading} onClick={(event) => { event.preventDefault(); onConfirm() }}>
            {isAccept ? W.dialogs.confirmAccept : W.dialogs.confirmDecline}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function RequestJoinSheet({
  project,
  submitting,
  onClose,
  onSubmit,
}: {
  project: JoinableProject | null
  submitting: boolean
  onClose: () => void
  onSubmit: (projectId: string, reason: string) => Promise<void> | void
}) {
  const [reason, setReason] = useState('')
  const [inlineError, setInlineError] = useState<string | null>(null)
  const open = Boolean(project)

  useEffect(() => {
    setInlineError(null)
    setReason('')
  }, [project?.id])

  const handleSubmit = async () => {
    if (!project) return
    setInlineError(null)
    try {
      await onSubmit(project.id, reason.trim())
    } catch (error) {
      const message = getApiErrorMessage(error, W.dialogs.requestJoinError)
      setInlineError(message)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose() }}>
      <SheetContent data-testid="workspace-request-join-sheet">
        <SheetHeader>
          <SheetTitle>{W.dialogs.requestJoin}</SheetTitle>
          <SheetDescription>{W.dialogs.requestJoinDescription}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm font-medium text-slate-900">{project?.name}</div>
            {project?.ownerName ? <div className="mt-1 text-xs text-slate-500">{project.ownerName}</div> : null}
          </div>
          <textarea
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              setInlineError(null)
            }}
            placeholder={W.dialogs.requestJoinPlaceholder}
            data-testid="workspace-request-join-reason"
            className="min-h-28 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          />
          {inlineError ? (
            <div data-testid="workspace-request-join-error" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {inlineError}
            </div>
          ) : null}
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={onClose}>{W.dialogs.cancel}</Button>
          {inlineError ? <Button variant="ghost" onClick={onClose}>{W.dialogs.backToWorkspace}</Button> : null}
          <Button loading={submitting} onClick={() => { void handleSubmit() }}>{W.dialogs.submitRequest}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export const RequestJoinDialog = RequestJoinSheet

export function CompanyJoinDialog({
  open,
  onOpenChange,
  onJoined,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onJoined: () => Promise<void>
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CompanySearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)

  const search = async () => {
    if (query.trim().length < 2) {
      toast({ title: W.dialogs.searchMinLength })
      return
    }
    setLoading(true)
    try {
      const data = await apiGet<CompanySearchResult[]>(`/api/workspace/companies/search?q=${encodeURIComponent(query.trim())}`)
      setResults(data)
    } catch (error) {
      toast({ title: W.dialogs.searchFailed, description: getApiErrorMessage(error), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const join = async (company: CompanySearchResult) => {
    setJoiningId(company.id)
    try {
      await apiPost(`/api/workspace/companies/${company.id}/join`, { message: W.dialogs.joinCompanyMessage })
      await onJoined()
      onOpenChange(false)
      toast({ title: W.dialogs.joinCompanySubmitted, description: company.name })
    } catch (error) {
      toast({ title: W.dialogs.requestNotSubmitted, description: getApiErrorMessage(error), variant: 'destructive' })
    } finally {
      setJoiningId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{W.start.joinCompany}</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">{W.dialogs.joinCompanyDescription}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={W.dialogs.companySearchPlaceholder} onKeyDown={(event) => { if (event.key === 'Enter') void search() }} />
          <Button variant="outline" loading={loading} onClick={() => { void search() }}>{W.dialogs.search}</Button>
        </div>
        <div className="max-h-72 space-y-2 overflow-y-auto">
          {results.length === 0 ? (
            <EmptyState icon={Search} title={W.dialogs.noSearchResult} description={W.dialogs.noSearchResultDescription} />
          ) : results.map((company) => (
            <div key={company.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{company.name}</p>
                <p className="text-xs text-slate-500">{company.join_policy === 'open' ? W.dialogs.openJoin : W.dialogs.approvalRequired}</p>
              </div>
              <Button size="sm" loading={joiningId === company.id} onClick={() => { void join(company) }}>{W.joinable.apply}</Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
