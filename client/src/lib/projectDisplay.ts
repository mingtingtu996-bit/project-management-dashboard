const PLACEHOLDER_ONLY_PATTERN = /^[?\s]+$/
const REPEATED_REPLACEMENT_PATTERN = /^(?:\uFFFD|\?){2,}$/

export function isUnreadableProjectText(value?: string | null): boolean {
  const text = String(value ?? '').trim()
  if (!text) return true
  return PLACEHOLDER_ONLY_PATTERN.test(text) || REPEATED_REPLACEMENT_PATTERN.test(text)
}

export function getProjectDisplayName(value?: string | null, fallback = '未命名项目'): string {
  const text = String(value ?? '').trim()
  return isUnreadableProjectText(text) ? fallback : text
}

export function getProjectDisplayDescription(value?: string | null, fallback = '项目工作台'): string {
  const text = String(value ?? '').trim()
  return isUnreadableProjectText(text) ? fallback : text
}
