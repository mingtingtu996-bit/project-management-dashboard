import { toast } from '@/hooks/use-toast'

const STORAGE_WARNING_EVENT = 'workbuddy:storage-warning'

export const APP_STORAGE_KEY_PREFIXES = [
  'pm_',
  'workbuddy_',
  'auth_',
  'access_token',
  'device_id',
  'storage_mode',
  'pending_sync_ops',
  'modal_manager_',
  'user_feedback',
  'gantt_',
  'wbs_template_',
  'wbs-template',
] as const

type StorageWarningDetail = {
  key: string
  message: string
}

declare global {
  interface WindowEventMap {
    [STORAGE_WARNING_EVENT]: CustomEvent<StorageWarningDetail>
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false
  return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
}

function dispatchStorageWarning(key: string, message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<StorageWarningDetail>(STORAGE_WARNING_EVENT, {
      detail: { key, message },
    }),
  )
}

export function getBrowserStorage(storage?: Storage): Storage | null {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function safeStorageGet(storage: Storage | null | undefined, key: string): string | null {
  const resolvedStorage = getBrowserStorage(storage ?? undefined)
  if (!resolvedStorage) return null
  try {
    return resolvedStorage.getItem(key)
  } catch (error) {
    console.error(`[storage] failed to read ${key}`, error)
    return null
  }
}

export function safeStorageSet(storage: Storage | null | undefined, key: string, value: string): boolean {
  const resolvedStorage = getBrowserStorage(storage ?? undefined)
  if (!resolvedStorage) return false
  try {
    resolvedStorage.setItem(key, value)
    return true
  } catch (error) {
    if (isQuotaExceededError(error)) {
      dispatchStorageWarning(key, '本地缓存空间已满，请清理旧数据或切换到后端同步模式后再试。')
      return false
    }

    console.error(`[storage] failed to write ${key}`, error)
    return false
  }
}

export function safeStorageRemove(storage: Storage | null | undefined, key: string): boolean {
  const resolvedStorage = getBrowserStorage(storage ?? undefined)
  if (!resolvedStorage) return false
  try {
    resolvedStorage.removeItem(key)
    return true
  } catch (error) {
    console.error(`[storage] failed to remove ${key}`, error)
    return false
  }
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T, label = 'json'): T {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return fallback
  }

  try {
    return JSON.parse(raw) as T
  } catch (error) {
    console.error(`[storage] failed to parse ${label}`, error)
    return fallback
  }
}

export function listAppStorageKeys(storage?: Storage): string[] {
  const resolvedStorage = getBrowserStorage(storage)
  if (!resolvedStorage) return []
  const keys: string[] = []

  for (let index = 0; index < resolvedStorage.length; index += 1) {
    const key = resolvedStorage.key(index)
    if (!key) continue
    if (APP_STORAGE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keys.push(key)
    }
  }

  return keys
}

export function clearAppStorage(options?: {
  storage?: Storage
  projectName?: string
  confirmationText?: string
}): number {
  const storage = getBrowserStorage(options?.storage)
  if (!storage) return 0
  const projectName = options?.projectName?.trim()
  const confirmationText = options?.confirmationText?.trim()

  if (projectName && confirmationText !== projectName) {
    throw new Error('确认文本不匹配，已取消清理。')
  }

  const keys = listAppStorageKeys(storage)
  keys.forEach((key) => {
    safeStorageRemove(storage, key)
  })

  return keys.length
}

let storageWarningListenerBound = false

export function bindStorageWarningToToast(): void {
  if (typeof window === 'undefined' || storageWarningListenerBound) return

  window.addEventListener(STORAGE_WARNING_EVENT, (event) => {
    toast({
      title: '本地缓存空间不足',
      description: event.detail.message,
      variant: 'destructive',
    })
  })

  storageWarningListenerBound = true
}
