const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on'])

export function isPermissionSystemDisabled(): boolean {
  return TRUE_VALUES.has(String(import.meta.env.VITE_DISABLE_PERMISSION_SYSTEM ?? '').trim().toLowerCase())
}
