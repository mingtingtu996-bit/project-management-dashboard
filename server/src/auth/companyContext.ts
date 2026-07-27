import type { Request } from 'express'

function isCompanyIdLike(value?: string | null): value is string {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? '').trim(),
  )
}

export function getRequestCompanyId(req: Request): string | null {
  const headerValue = req.headers?.['x-company-id']
  const raw = Array.isArray(headerValue)
    ? headerValue[0]
    : headerValue
      ?? req.query?.currentCompanyId
      ?? req.query?.companyId
      ?? req.query?.company_id
      ?? (typeof req.body === 'object' && req.body
        ? (req.body.currentCompanyId ?? req.body.companyId ?? req.body.company_id)
        : null)
  const normalized = String(raw ?? '').trim()
  return isCompanyIdLike(normalized) ? normalized : null
}
