const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export function isPermissionSystemDisabled(): boolean {
  const runtime = String(process.env.NODE_ENV ?? '').trim().toLowerCase()
  if (runtime !== 'development' && runtime !== 'test') return false
  return TRUE_VALUES.has(String(process.env.DISABLE_PERMISSION_SYSTEM ?? '').trim().toLowerCase())
}
