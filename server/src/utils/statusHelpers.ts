export function normalizeStatus(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function isTruthyFlag(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}
