const INSECURE_PROBE_PATHS = new Set([
  '/api/livez',
  '/api/readyz',
])

export function shouldRejectInsecureProductionRequest(input: {
  nodeEnv?: string
  path?: string
  secure?: boolean
  forwardedProto?: string | null
}) {
  if (input.nodeEnv !== 'production') return false
  const path = String(input.path ?? '').split('?', 1)[0].replace(/\/+$/, '') || '/'
  if (INSECURE_PROBE_PATHS.has(path)) return false
  if (input.secure) return false

  const forwardedProto = String(input.forwardedProto ?? '')
    .split(',', 1)[0]
    .trim()
    .toLowerCase()
  return forwardedProto !== 'https'
}
