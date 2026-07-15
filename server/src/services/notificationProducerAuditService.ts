import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

type ProducerSourceInput = {
  file: string
  content: string
}

export type NotificationProducerAuditFinding = {
  file: string
  emitIndex: number
  missing: string[]
  touchpointHint: string
}

export type NotificationProducerAuditReport = {
  totalFiles: number
  totalEmitCalls: number
  findings: NotificationProducerAuditFinding[]
  summary: {
    missingSourceIdentityCount: number
    missingDedupeCount: number
    missingTargetRouteCount: number
    missingActionDueForTodoCount: number
  }
}

const EMIT_PATTERN = /notificationTouchpointService\.emit\s*\(\s*\{([\s\S]*?)\n\s*\}\s*\)/g

function includesAny(content: string, tokens: string[]) {
  return tokens.some((token) => content.includes(token))
}

function getTouchpointHint(body: string) {
  const match = body.match(/touchpoint_type\s*:\s*['"`]([^'"`]+)['"`]/)
  if (match?.[1]) return match[1]
  if (/notification_type\s*:\s*['"`](business-warning|business_warning|flow-reminder|flow_reminder)['"`]/.test(body)) {
    return 'dashboard_todo'
  }
  return 'unknown'
}

function isTodoLike(body: string) {
  const touchpointHint = getTouchpointHint(body)
  return touchpointHint === 'dashboard_todo'
}

function auditEmitBody(file: string, body: string, emitIndex: number): NotificationProducerAuditFinding | null {
  const missing: string[] = []
  const hasSourceIdentity = includesAny(body, ['source_entity_type', 'sourceEntityType'])
    && includesAny(body, ['source_entity_id', 'sourceEntityId'])
  const hasDedupe = includesAny(body, ['dedupe_key', 'dedupeKey']) || hasSourceIdentity
  const hasTargetRoute = includesAny(body, ['target_route', 'targetRoute'])
  const hasActionDue = includesAny(body, ['action_due_at', 'actionDueAt', 'due_at', 'dueAt', 'expected_resolution_date'])

  if (!hasSourceIdentity) missing.push('source_identity')
  if (!hasDedupe) missing.push('dedupe_key')
  if (!hasTargetRoute) missing.push('target_route')
  if (isTodoLike(body) && !hasActionDue) missing.push('action_due_at')

  if (missing.length === 0) return null
  return {
    file,
    emitIndex,
    missing,
    touchpointHint: getTouchpointHint(body),
  }
}

export function auditNotificationProducerSources(sources: ProducerSourceInput[]): NotificationProducerAuditReport {
  const findings: NotificationProducerAuditFinding[] = []
  let totalEmitCalls = 0

  for (const source of sources) {
    const matches = source.content.matchAll(EMIT_PATTERN)
    let emitIndex = 0
    for (const match of matches) {
      totalEmitCalls += 1
      emitIndex += 1
      const finding = auditEmitBody(source.file, match[1] ?? '', emitIndex)
      if (finding) findings.push(finding)
    }
  }

  return {
    totalFiles: sources.length,
    totalEmitCalls,
    findings,
    summary: {
      missingSourceIdentityCount: findings.filter((finding) => finding.missing.includes('source_identity')).length,
      missingDedupeCount: findings.filter((finding) => finding.missing.includes('dedupe_key')).length,
      missingTargetRouteCount: findings.filter((finding) => finding.missing.includes('target_route')).length,
      missingActionDueForTodoCount: findings.filter((finding) => finding.missing.includes('action_due_at')).length,
    },
  }
}

function walkTypescriptFiles(dir: string, results: string[]) {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walkTypescriptFiles(fullPath, results)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(fullPath)
    }
  }
}

export function getNotificationProducerAudit(rootDir = process.cwd()): NotificationProducerAuditReport {
  const serviceDirCandidates = [
    join(rootDir, 'src', 'services'),
    join(rootDir, 'server', 'src', 'services'),
  ]
  const serviceDir = serviceDirCandidates.find(existsSync) ?? serviceDirCandidates[0]
  const files: string[] = []
  walkTypescriptFiles(serviceDir, files)

  return auditNotificationProducerSources(files.map((file) => ({
    file: relative(rootDir, file).replace(/\\/g, '/'),
    content: readFileSync(file, 'utf8'),
  })))
}
