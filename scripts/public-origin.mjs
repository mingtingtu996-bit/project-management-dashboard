export function normalizePublicHttpsOrigin(value) {
  const raw = String(value ?? '').trim()
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new Error('public origin must be an exact HTTPS origin')
  }
  if (url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || raw !== url.origin) {
    throw new Error('public origin must be an exact HTTPS origin')
  }
  return url.origin
}

export function resolvePublicHttpsOrigin({ apiBaseUrl, publicOrigin }) {
  const explicitOrigin = String(publicOrigin ?? '').trim()
  if (explicitOrigin) return normalizePublicHttpsOrigin(explicitOrigin)

  let apiUrl
  try {
    apiUrl = new URL(apiBaseUrl)
  } catch {
    throw new Error('apiBaseUrl must be an absolute URL')
  }
  if (apiUrl.protocol !== 'https:') {
    throw new Error('public origin is required when the API uses a loopback or non-HTTPS URL')
  }
  return normalizePublicHttpsOrigin(apiUrl.origin)
}
