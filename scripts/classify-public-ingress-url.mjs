import { isIP } from 'node:net'
import { pathToFileURL } from 'node:url'

const SUPPORTED_ENVIRONMENTS = new Set(['production', 'staging'])
const SUPPORTED_INGRESS_MODES = new Set(['domain_hsts', 'temporary_ip_tls'])

function normalizedHostname(url) {
  return url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname
}

function normalizedExpectedHost(value) {
  const text = String(value ?? '').trim().toLowerCase()
  const unwrapped = text.startsWith('[') && text.endsWith(']') ? text.slice(1, -1) : text
  return unwrapped.endsWith('.') ? unwrapped.slice(0, -1) : unwrapped
}

function hostKindOf(url) {
  const version = isIP(normalizedHostname(url))
  if (version === 4) return 'ipv4'
  if (version === 6) return 'ipv6'
  return 'dns'
}

function isGloballyRoutableIpv4(hostname) {
  if (isIP(hostname) !== 4) return false
  const [a, b, c] = hostname.split('.').map(Number)

  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 192 && b === 0 && [0, 2].includes(c)) return false
  if (a === 192 && b === 88 && c === 99) return false
  if (a === 198 && [18, 19].includes(b)) return false
  if (a === 198 && b === 51 && c === 100) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

function isPublicDnsHostname(hostname) {
  if (isIP(hostname) !== 0 || hostname.length > 253) return false
  const labels = hostname.toLowerCase().replace(/\.$/u, '').split('.')
  if (labels.length < 2) return false
  if (['example', 'invalid', 'local', 'localhost', 'test'].includes(labels.at(-1))) return false
  return labels.every(
    (label) => label.length > 0
      && label.length <= 63
      && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
  )
}

function effectivePort(url) {
  if (url.port) return Number(url.port)
  return url.protocol === 'https:' ? 443 : 80
}

function parseUrl(value, reasonCode, blockingReasonCodes) {
  try {
    return new URL(value)
  } catch {
    blockingReasonCodes.push(reasonCode)
    return null
  }
}

export function classifyPublicIngressUrl({ environment, expectedHost, expectedMode, redirectValue, value }) {
  const blockingReasonCodes = []
  const advisoryReasonCodes = []

  if (!SUPPORTED_ENVIRONMENTS.has(environment)) {
    blockingReasonCodes.push('environment_unsupported')
  }
  if (!SUPPORTED_INGRESS_MODES.has(expectedMode)) {
    blockingReasonCodes.push('ingress_mode_unsupported')
  }

  const url = parseUrl(value, 'url_invalid', blockingReasonCodes)
  if (!url) {
    return {
      environment,
      hostKind: 'invalid',
      hstsUserAgentPolicyApplicable: false,
      ingressMode: 'unknown',
      pass: false,
      port: null,
      reasonCodes: [...blockingReasonCodes, 'url_invalid'],
    }
  }

  const redirectUrl = parseUrl(redirectValue, 'redirect_url_invalid', blockingReasonCodes)

  if (url.protocol !== 'https:') blockingReasonCodes.push('https_required')
  if (url.pathname !== '/api/readyz' || url.search || url.hash) {
    blockingReasonCodes.push('readyz_url_required')
  }
  if (url.username || url.password) blockingReasonCodes.push('credentials_forbidden')

  const hostKind = hostKindOf(url)
  const hostname = normalizedHostname(url).toLowerCase()
  const expectedHostname = normalizedExpectedHost(expectedHost)
  const ipLiteral = hostKind === 'ipv4' || hostKind === 'ipv6'
  const ingressMode = ipLiteral ? 'temporary_ip_tls' : 'domain_hsts'

  if (!expectedHostname) blockingReasonCodes.push('expected_host_required')
  if (hostname !== expectedHostname) blockingReasonCodes.push('health_host_mismatch')

  if (ipLiteral) {
    advisoryReasonCodes.push('hsts_policy_inapplicable_ip_literal')
    if (expectedMode !== 'temporary_ip_tls') {
      blockingReasonCodes.push('temporary_ip_tls_mode_required')
    }
    if (hostKind !== 'ipv4' || !isGloballyRoutableIpv4(hostname)) {
      blockingReasonCodes.push('public_ipv4_required')
    }
  } else if (expectedMode !== 'domain_hsts') {
    blockingReasonCodes.push('domain_hsts_mode_required')
  } else if (!isPublicDnsHostname(hostname)) {
    blockingReasonCodes.push('public_dns_hostname_required')
  }

  const expectedHealthPort = expectedMode === 'temporary_ip_tls' && environment === 'staging'
    ? 8443
    : 443
  if (effectivePort(url) !== expectedHealthPort) {
    blockingReasonCodes.push('health_port_mismatch')
  }

  if (redirectUrl) {
    const expectedRedirectPath = expectedMode === 'temporary_ip_tls' && environment === 'staging'
      ? '/staging-redirect/api/readyz'
      : '/api/readyz'
    if (redirectUrl.protocol !== 'http:') blockingReasonCodes.push('redirect_http_required')
    if (redirectUrl.username || redirectUrl.password) blockingReasonCodes.push('redirect_credentials_forbidden')
    if (redirectUrl.search || redirectUrl.hash) blockingReasonCodes.push('redirect_readyz_url_required')
    if (redirectUrl.pathname !== expectedRedirectPath) blockingReasonCodes.push('redirect_readyz_url_required')
    if (effectivePort(redirectUrl) !== 80) blockingReasonCodes.push('redirect_port_mismatch')
    if (normalizedHostname(redirectUrl).toLowerCase() !== hostname) {
      blockingReasonCodes.push('redirect_host_mismatch')
    }
  }

  return {
    environment,
    hostKind,
    hstsUserAgentPolicyApplicable: !ipLiteral,
    ingressMode,
    pass: blockingReasonCodes.length === 0,
    port: effectivePort(url),
    reasonCodes: [...blockingReasonCodes, ...advisoryReasonCodes],
  }
}

function readOption(argv, name) {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

function runCli(argv) {
  const result = classifyPublicIngressUrl({
    environment: readOption(argv, '--environment'),
    expectedHost: readOption(argv, '--expected-host'),
    expectedMode: readOption(argv, '--expected-mode'),
    redirectValue: readOption(argv, '--redirect-url'),
    value: readOption(argv, '--url'),
  })

  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.pass) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli(process.argv.slice(2))
}
