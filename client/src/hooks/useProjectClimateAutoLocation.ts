import { useEffect } from 'react'

import { safeJsonParse, safeStorageGet, safeStorageSet } from '@/lib/browserStorage'
import { recordProjectBrowserLocation } from '@/services/projectClimateApi'

const STORAGE_KEY_PREFIX = 'workbuddy_project_climate_auto_location:'
const SUCCESS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000
const SKIP_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000
const inflightProjectIds = new Set<string>()

type LocationSyncState = {
  attemptedAt: number
  status: 'recorded' | 'skipped'
  reason?: string
}

function getStorageKey(projectId: string) {
  return `${STORAGE_KEY_PREFIX}${projectId}`
}

function readSyncState(projectId: string): LocationSyncState | null {
  if (typeof window === 'undefined') return null
  return safeJsonParse<LocationSyncState | null>(
    safeStorageGet(window.localStorage, getStorageKey(projectId)),
    null,
    'project climate auto location',
  )
}

function writeSyncState(projectId: string, status: LocationSyncState['status'], reason?: string) {
  if (typeof window === 'undefined') return
  safeStorageSet(window.localStorage, getStorageKey(projectId), JSON.stringify({
    attemptedAt: Date.now(),
    status,
    reason,
  }))
}

function isInCooldown(projectId: string) {
  const state = readSyncState(projectId)
  if (!state?.attemptedAt) return false
  const cooldown = state.status === 'recorded' ? SUCCESS_COOLDOWN_MS : SKIP_COOLDOWN_MS
  return Date.now() - state.attemptedAt < cooldown
}

function isGeolocationAvailable() {
  if (typeof window === 'undefined') return false
  if (!('geolocation' in navigator)) return false
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

async function readGeolocationPermission(): Promise<PermissionState | null> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return null
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state
  } catch {
    return null
  }
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: 6 * 60 * 60 * 1000,
      timeout: 8000,
    })
  })
}

export function useProjectClimateAutoLocation(projectId: string | null | undefined, enabled = true) {
  useEffect(() => {
    if (!enabled || !projectId) return undefined
    if (!isGeolocationAvailable()) {
      writeSyncState(projectId, 'skipped', 'geolocation_unavailable')
      return undefined
    }
    if (inflightProjectIds.has(projectId) || isInCooldown(projectId)) return undefined

    let cancelled = false
    inflightProjectIds.add(projectId)

    const run = async () => {
      try {
        const permission = await readGeolocationPermission()
        if (permission === 'denied') {
          writeSyncState(projectId, 'skipped', 'permission_denied')
          return
        }

        const position = await getCurrentPosition()
        if (cancelled) return

        const result = await recordProjectBrowserLocation(projectId, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        })
        writeSyncState(projectId, result.status, result.reason ?? undefined)
      } catch (error) {
        const geolocationCode = typeof error === 'object' && error && 'code' in error
          ? Number((error as { code?: unknown }).code)
          : Number.NaN
        const reason = Number.isFinite(geolocationCode)
          ? `geolocation_error_${geolocationCode}`
          : error instanceof Error
            ? error.name || 'location_sync_failed'
            : 'location_sync_failed'
        writeSyncState(projectId, 'skipped', reason)
        if (import.meta.env.DEV) {
          console.debug('[project-climate] auto city sync skipped', { projectId, reason })
        }
      } finally {
        inflightProjectIds.delete(projectId)
      }
    }

    void run()

    return () => {
      cancelled = true
      inflightProjectIds.delete(projectId)
    }
  }, [enabled, projectId])
}
