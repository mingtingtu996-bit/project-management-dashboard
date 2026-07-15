import { create } from 'zustand'

export type PlanningDraftStatus = 'idle' | 'editing' | 'dirty' | 'saving' | 'locked'

export interface PlanningValidationIssue {
  id: string
  level: 'error' | 'warning' | 'info'
  title: string
  detail?: string
}

export interface PlanningStore {
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
}

export const usePlanningStore = create<PlanningStore>((set) => ({
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
}))
