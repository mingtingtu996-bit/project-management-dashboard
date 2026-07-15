import type { GlobalRole } from '@/lib/roleLabels'

export const CURRENT_COMPANY_CONTEXT_CHANGED_EVENT = 'workbuddy:current-company-context-changed'

export interface CurrentCompanyContextSnapshot {
  companyId: string | null
  role: GlobalRole | null
  resolved: boolean
}

let currentCompanyContextSnapshot: CurrentCompanyContextSnapshot = {
  companyId: null,
  role: null,
  resolved: false,
}

export function getCurrentCompanyContextSnapshot(): CurrentCompanyContextSnapshot {
  return currentCompanyContextSnapshot
}

export function setCurrentCompanyContextSnapshot(snapshot: CurrentCompanyContextSnapshot): void {
  currentCompanyContextSnapshot = snapshot
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CURRENT_COMPANY_CONTEXT_CHANGED_EVENT, { detail: snapshot }))
}
