import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useApi } from '@/hooks/useApi'
import { getApiErrorMessage } from '@/lib/apiClient'

export interface ReminderSettings {
  condition_reminder_days: number[]
  obstacle_reminder_days: number[]
  acceptance_reminder_days: number[]
  enable_popup: boolean
  enable_notification: boolean
}

interface ReminderItem {
  id: string
  title: string
  content?: string | null
  is_dismissed?: boolean
}

const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  condition_reminder_days: [3, 1],
  obstacle_reminder_days: [3, 7],
  acceptance_reminder_days: [7, 3, 1],
  enable_popup: true,
  enable_notification: true,
}

function normalizeDayList(value: unknown, fallback: number[]) {
  if (!Array.isArray(value)) return [...fallback]
  const normalized = value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0)
  return Array.from(new Set(normalized)).sort((left, right) => right - left)
}

function normalizeReminderSettings(value: Partial<ReminderSettings> | null | undefined): ReminderSettings {
  return {
    condition_reminder_days: normalizeDayList(value?.condition_reminder_days, DEFAULT_REMINDER_SETTINGS.condition_reminder_days),
    obstacle_reminder_days: normalizeDayList(value?.obstacle_reminder_days, DEFAULT_REMINDER_SETTINGS.obstacle_reminder_days),
    acceptance_reminder_days: normalizeDayList(value?.acceptance_reminder_days, DEFAULT_REMINDER_SETTINGS.acceptance_reminder_days),
    enable_popup: typeof value?.enable_popup === 'boolean' ? value.enable_popup : DEFAULT_REMINDER_SETTINGS.enable_popup,
    enable_notification: typeof value?.enable_notification === 'boolean' ? value.enable_notification : DEFAULT_REMINDER_SETTINGS.enable_notification,
  }
}

function readSeenReminderIds(storageKey: string) {
  if (typeof window === 'undefined') return new Set<string>()
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return new Set<string>()
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function writeSeenReminderIds(storageKey: string, ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids)))
  } catch {
    // Ignore storage failures in restricted browsers.
  }
}

export function useReminderSettings(projectId?: string, options?: { enabled?: boolean }) {
  const api = useApi()
  const enabled = options?.enabled ?? true
  const storageKey = useMemo(
    () => `workbuddy-reminder-seen:${projectId || 'company'}`,
    [projectId],
  )
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(DEFAULT_REMINDER_SETTINGS)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seenReminderIdsRef = useRef<Set<string>>(readSeenReminderIds(storageKey))
  const permissionRequestInFlightRef = useRef(false)

  useEffect(() => {
    seenReminderIdsRef.current = readSeenReminderIds(storageKey)
  }, [storageKey])

  const loadReminderSettings = useCallback(async () => {
    if (!enabled) {
      setError(null)
      setLoading(false)
      return DEFAULT_REMINDER_SETTINGS
    }

    setLoading(true)
    setError(null)
    try {
      let url = '/api/reminders/settings'
      if (projectId) {
        url += `?projectId=${encodeURIComponent(projectId)}`
      }
      const response = await api.get<Partial<ReminderSettings>>(url)
      const nextSettings = normalizeReminderSettings(response)
      setReminderSettings(nextSettings)
      return nextSettings
    } catch (loadError) {
      const message = getApiErrorMessage(loadError, '提醒设置加载失败')
      setError(message)
      setReminderSettings(DEFAULT_REMINDER_SETTINGS)
      return DEFAULT_REMINDER_SETTINGS
    } finally {
      setLoading(false)
    }
  }, [api, enabled, projectId])

  const ensureNotificationPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied' as NotificationPermission
    }

    if (window.Notification.permission !== 'default') {
      return window.Notification.permission
    }

    if (permissionRequestInFlightRef.current) {
      return window.Notification.permission
    }

    permissionRequestInFlightRef.current = true
    try {
      return await window.Notification.requestPermission()
    } catch {
      return window.Notification.permission
    } finally {
      permissionRequestInFlightRef.current = false
    }
  }, [])

  const syncPopupReminders = useCallback(async (settings: ReminderSettings = reminderSettings) => {
    if (!enabled) return [] as ReminderItem[]
    if (typeof window === 'undefined') return [] as ReminderItem[]

    const popupEnabled = settings.enable_popup && settings.enable_notification
    if (popupEnabled) {
      const permission = await ensureNotificationPermission()
      if (permission !== 'granted') {
        return [] as ReminderItem[]
      }
    }

    let url = '/api/reminders/active'
    if (projectId) {
      url += `?projectId=${encodeURIComponent(projectId)}`
    }

    const response = await api.get<ReminderItem[]>(url)
    const activeReminders = Array.isArray(response)
      ? response.filter((item) => !item.is_dismissed)
      : []

    if (!popupEnabled) {
      return activeReminders
    }

    const seen = seenReminderIdsRef.current
    for (const reminder of activeReminders) {
      if (seen.has(reminder.id)) continue
      seen.add(reminder.id)
      new window.Notification(reminder.title, {
        body: reminder.content || '',
        tag: reminder.id,
      })
    }

    writeSeenReminderIds(storageKey, seen)
    return activeReminders
  }, [api, enabled, ensureNotificationPermission, projectId, reminderSettings, storageKey])

  const saveReminderSettings = useCallback(async (nextSettings?: ReminderSettings) => {
    if (!enabled) return false

    setSaving(true)
    setError(null)
    const payload = normalizeReminderSettings(nextSettings ?? reminderSettings)

    try {
      let url = '/api/reminders/settings'
      if (projectId) {
        url += `?projectId=${encodeURIComponent(projectId)}`
      }
      await api.put(url, payload)
      setReminderSettings(payload)
      return true
    } catch (saveError) {
      const message = getApiErrorMessage(saveError, '提醒设置保存失败')
      setError(message)
      return false
    } finally {
      setSaving(false)
    }
  }, [api, enabled, projectId, reminderSettings])

  useEffect(() => {
    void loadReminderSettings()
  }, [loadReminderSettings])

  useEffect(() => {
    if (!enabled) return

    const scheduleSync = () => {
      void syncPopupReminders()
    }

    scheduleSync()
    const interval = window.setInterval(scheduleSync, 60_000)
    return () => window.clearInterval(interval)
  }, [enabled, syncPopupReminders])

  return {
    reminderSettings,
    setReminderSettings,
    loading,
    saving,
    error,
    loadReminderSettings,
    saveReminderSettings,
    syncPopupReminders,
  }
}
