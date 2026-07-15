import type { GlobalRole } from '@/lib/roleLabels'

export type CompanyRole = GlobalRole

export function normalizeCompanyRole(value?: string | null): CompanyRole {
  return value === 'company_admin' ? 'company_admin' : 'regular'
}

export function resolveCurrentCompanyRole(
  currentCompanyRole?: string | null,
): CompanyRole {
  return normalizeCompanyRole(currentCompanyRole)
}

export function isCompanyAdminRole(value?: string | null): boolean {
  return normalizeCompanyRole(value) === 'company_admin'
}
