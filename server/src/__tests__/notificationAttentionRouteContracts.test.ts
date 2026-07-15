import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function readSrc(relPath: string) {
  const candidates = [resolve(serverRoot, relPath)]
  for (const candidate of candidates) {
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8')
  }
  throw new Error(`Unable to read ${relPath}`)
}

describe('notification route attention governance contracts', () => {
  it('excludes expired notifications from fast and persisted list paths', () => {
    const route = readSrc('src/routes/notifications.ts')
    const store = readSrc('src/services/notificationStore.ts')
    const persistedScope = route.match(
      /async function listPersistedNotificationsForScope[\s\S]*?\n}/,
    )?.[0]

    expect(route).toContain('(n.expires_at IS NULL OR n.expires_at > now())')
    expect(route).toContain('isNotificationCurrentlyVisible')
    expect(persistedScope).toBeDefined()
    expect(persistedScope?.match(/listNotifications\(/g)?.length ?? 0).toBe(2)
    expect(store).toContain('(expires_at IS NULL OR expires_at > ?)')
  })

  it('clears both list caches and attention summary cache after personal mutations', () => {
    const route = readSrc('src/routes/notifications.ts')

    expect(route).toContain('clearAttentionSummaryCache')
    expect(route.match(/clearNotificationFastCaches\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(route.match(/clearAttentionSummaryCache\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
  })

  it('schedules automatic source reconciliation for notification lifecycle cleanup', () => {
    const scheduler = readSrc('src/scheduler.ts')

    expect(scheduler).toContain('reconcileResolvedNotifications')
    expect(scheduler).toContain('NotificationReconciliationJob')
    expect(scheduler).toContain('notificationReconciliationJob.start')
  })

  it('documents and wires the producer closure contract for new algorithms and seeds', () => {
    const service = readSrc('src/services/notificationTouchpointService.ts')
    const docs = readSrc('../docs/specs/notification-attention-governance.md')

    expect(service).toContain('applyNotificationProducerContract')
    expect(service).toContain('notificationProducerContract')
    expect(docs).toContain('Producer Closure Contract')
    expect(docs).toContain('candidate_only')
    expect(docs).toContain('owner_confirmation')
    expect(docs).toContain('notificationProducerContract')
  })

  it('wires notification diagnostics, producer audit, and reconciliation matrix endpoints', () => {
    const route = readSrc('src/routes/notifications.ts')
    const docs = readSrc('../docs/specs/notification-attention-governance.md')

    expect(route).toContain("'/diagnostics'")
    expect(route).toContain('getNotificationProducerAudit')
    expect(route).toContain('getNotificationReconciliationCoverageMatrix')
    expect(docs).toContain('Producer Audit')
    expect(docs).toContain('Delivery Governance')
    expect(docs).toContain('Diagnostics Endpoint')
  })
})
