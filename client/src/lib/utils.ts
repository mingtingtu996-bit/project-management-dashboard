import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateDeviceId(): string {
  let deviceId = safeStorageGet(localStorage, 'device_id')
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    safeStorageSet(localStorage, 'device_id', deviceId)
  }
  return deviceId
}

export function generateId(): string {
  return crypto.randomUUID()
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
