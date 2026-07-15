import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_SCANNED_FILE_BYTES = 2 * 1024 * 1024
const PLACEHOLDER_PATTERN = /^(?:postgres|password|secret|runtime-secret|postgres-password|test(?:-password)?|dummy|changeme|replace[-_]?me|example|your[-_].*|redacted|x{4,}|<.*>|\[.*\]|\$\{.*\}|%[A-Z0-9_]+%)$/i
const LOCAL_OR_EXAMPLE_HOST_PATTERN = /^(?:localhost|127\.0\.0\.1|::1|example(?:\.test)?|[^.]*\.example(?:\.com)?|db\.xxxx(?:\..*)?|203\.0\.113\.\d+)$/i

function lineNumberAt(text, index) {
  let line = 1
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1
  }
  return line
}

function shannonEntropy(value) {
  if (!value) return 0
  const counts = new Map()
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1)
  let entropy = 0
  for (const count of counts.values()) {
    const probability = count / value.length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

function credentialLooksReal(value) {
  let normalized = value.trim()
  try {
    normalized = decodeURIComponent(normalized)
  } catch {
    // An invalid URI escape does not make a credential safe.
  }
  normalized = normalized.replace(/^\[|\]$/g, '')
  if (!normalized || PLACEHOLDER_PATTERN.test(normalized)) return false

  const characterClassCount = [
    /[a-z]/.test(normalized),
    /[A-Z]/.test(normalized),
    /\d/.test(normalized),
    /[^A-Za-z0-9]/.test(normalized),
  ].filter(Boolean).length
  const entropy = shannonEntropy(normalized)

  return (normalized.length >= 10 && characterClassCount >= 3 && entropy >= 3)
    || (normalized.length >= 24 && characterClassCount >= 2 && entropy >= 3.5)
}

function decodeJwtPayload(token) {
  const payload = token.split('.')[1]
  if (!payload) return null
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return decoded && typeof decoded === 'object' ? decoded : null
  } catch {
    return null
  }
}

export function scanTextForSecrets(path, text) {
  const findings = []
  const findingKeys = new Set()

  const addFinding = (ruleId, index) => {
    const line = lineNumberAt(text, index)
    const key = `${ruleId}:${line}`
    if (findingKeys.has(key)) return
    findingKeys.add(key)
    findings.push({ ruleId, path: path.replaceAll('\\', '/'), line })
  }

  const databaseUrlPattern = /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/'"<>]+:([^\s@/'"<>]+)@([^\s/:?#'"<>]+)/gi
  for (const match of text.matchAll(databaseUrlPattern)) {
    const password = match[1] ?? ''
    const host = match[2] ?? ''
    if (!LOCAL_OR_EXAMPLE_HOST_PATTERN.test(host) && credentialLooksReal(password)) {
      addFinding('credentialed-database-url', match.index ?? 0)
    }
  }

  const patternRules = [
    ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
    ['github-token', /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g],
    ['aws-access-key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
    ['openai-api-key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
    ['stripe-live-secret', /\bsk_live_[A-Za-z0-9]{16,}\b/g],
  ]

  for (const [ruleId, pattern] of patternRules) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0] ?? ''
      if (PLACEHOLDER_PATTERN.test(value) || /(?:example|not-a-real|xxxxx|dummy)/i.test(value)) continue
      addFinding(ruleId, match.index ?? 0)
    }
  }

  const jwtPattern = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/g
  for (const match of text.matchAll(jwtPattern)) {
    const payload = decodeJwtPayload(match[0] ?? '')
    if (payload?.role === 'service_role') {
      addFinding('supabase-service-role-jwt', match.index ?? 0)
    }
  }

  return findings.sort((left, right) => left.line - right.line || left.ruleId.localeCompare(right.ruleId))
}

export function formatSecretScanReport(findings, scannedFileCount) {
  return JSON.stringify({
    status: findings.length === 0 ? 'passed' : 'blocked',
    scannedFileCount,
    findings,
  }, null, 2)
}

function listRepositoryFiles(root) {
  const output = execFileSync('git', [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ], {
    cwd: root,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  return output.toString('utf8').split('\0').filter(Boolean)
}

function shouldSkipFile(path) {
  const normalized = path.replaceAll('\\', '/')
  return normalized.includes('/node_modules/')
    || normalized.startsWith('node_modules/')
    || normalized.includes('/dist/')
    || normalized.startsWith('dist/')
    || normalized.includes('/coverage/')
    || normalized.startsWith('coverage/')
}

export function scanRepository(root = process.cwd()) {
  const findings = []
  let scannedFileCount = 0

  for (const repositoryPath of listRepositoryFiles(root)) {
    if (shouldSkipFile(repositoryPath)) continue
    const absolutePath = resolve(root, repositoryPath)
    let buffer
    try {
      if (statSync(absolutePath).size > MAX_SCANNED_FILE_BYTES) continue
      buffer = readFileSync(absolutePath)
    } catch {
      continue
    }
    if (buffer.subarray(0, 8192).includes(0)) continue
    scannedFileCount += 1
    findings.push(...scanTextForSecrets(
      relative(root, absolutePath),
      buffer.toString('utf8'),
    ))
  }

  return { findings, scannedFileCount }
}

async function main() {
  const root = resolve(process.cwd())
  const result = scanRepository(root)
  process.stdout.write(`${formatSecretScanReport(result.findings, result.scannedFileCount)}\n`)
  if (result.findings.length > 0) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
