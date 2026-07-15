import { useEffect, useState } from 'react'

import { useAuth } from '@/context/AuthContext'
import {
  CURRENT_COMPANY_CONTEXT_CHANGED_EVENT,
  getCurrentCompanyContextSnapshot,
  type CurrentCompanyContextSnapshot,
} from '@/lib/currentCompanyContext'
import { resolveCurrentCompanyRole, type CompanyRole } from '@/lib/companyRole'

export function useCurrentCompanyRole(): CompanyRole {
  const { user } = useAuth()
  const [workspaceContext, setWorkspaceContext] = useState<CurrentCompanyContextSnapshot>(() => getCurrentCompanyContextSnapshot())

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleContextChanged = (event: Event) => {
      const detail = (event as CustomEvent<CurrentCompanyContextSnapshot>).detail
      setWorkspaceContext(detail ?? getCurrentCompanyContextSnapshot())
    }

    window.addEventListener(CURRENT_COMPANY_CONTEXT_CHANGED_EVENT, handleContextChanged)
    return () => window.removeEventListener(CURRENT_COMPANY_CONTEXT_CHANGED_EVENT, handleContextChanged)
  }, [])

  return resolveCurrentCompanyRole(
    workspaceContext.resolved ? workspaceContext.role : user?.currentCompanyRole,
  )
}
