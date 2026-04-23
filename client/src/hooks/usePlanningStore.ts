import { create } from 'zustand'

export type PlanningWorkspaceTab = 'baseline' | 'monthly' | 'revision-pool' | 'deviation'
export type PlanningDraftStatus = 'idle' | 'editing' | 'dirty' | 'saving' | 'locked'
export type PlanningConfirmTarget = 'baseline' | 'monthly' | 'month_close' | 'revision'

export interface PlanningValidationIssue {
  id: string
  level: 'error' | 'warning' | 'info'
  title: string
  detail?: string
}

export interface PlanningConfirmDialogState {
  open: boolean
  target: PlanningConfirmTarget | null
  title: string
  description: string
}

export interface PlanningStore {
  activeWorkspace: PlanningWorkspaceTab
  setActiveWorkspace: (workspace: PlanningWorkspaceTab) => void

  selectedItemIds: string[]
  setSelectedItemIds: (ids: string[]) => void
  toggleSelectedItem: (id: string) => void
  clearSelection: () => void

  draftStatus: PlanningDraftStatus
  setDraftStatus: (status: PlanningDraftStatus) => void

  validationIssues: PlanningValidationIssue[]
  setValidationIssues: (issues: PlanningValidationIssue[]) => void
  addValidationIssue: (issue: PlanningValidationIssue) => void
  clearValidationIssues: () => void

  confirmDialog: PlanningConfirmDialogState
  openConfirmDialog: (target: PlanningConfirmTarget, meta?: Partial<PlanningConfirmDialogState>) => void
  closeConfirmDialog: () => void
}

const DEFAULT_CONFIRM_DIALOG: PlanningConfirmDialogState = {
  open: false,
  target: null,
  title: '',
  description: '',
}

export const usePlanningStore = create<PlanningStore>((set) => ({
  activeWorkspace: 'baseline',
  setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),

  selectedItemIds: [],
  setSelectedItemIds: (ids) => set({ selectedItemIds: ids }),
  toggleSelectedItem: (id) =>
    set((state) => ({
      selectedItemIds: state.selectedItemIds.includes(id)
        ? state.selectedItemIds.filter((itemId) => itemId !== id)
        : [...state.selectedItemIds, id],
    })),
  clearSelection: () => set({ selectedItemIds: [] }),

  draftStatus: 'idle',
  setDraftStatus: (status) => set({ draftStatus: status }),

  validationIssues: [],
  setValidationIssues: (issues) => set({ validationIssues: issues }),
  addValidationIssue: (issue) =>
    set((state) => ({
      validationIssues: [...state.validationIssues, issue],
    })),
  clearValidationIssues: () => set({ validationIssues: [] }),

  confirmDialog: DEFAULT_CONFIRM_DIALOG,
  openConfirmDialog: (target, meta = {}) =>
    set({
      confirmDialog: {
        open: true,
        target,
        title: meta.title ?? '确认操作',
        description: meta.description ?? '确认后将写入计划编制域的冻结状态。',
      },
    }),
  closeConfirmDialog: () => set({ confirmDialog: DEFAULT_CONFIRM_DIALOG }),
}))

export const usePlanningSelectedCount = () =>
  usePlanningStore((state) => state.selectedItemIds.length)

export const usePlanningConfirmDialog = () =>
  usePlanningStore((state) => state.confirmDialog)
