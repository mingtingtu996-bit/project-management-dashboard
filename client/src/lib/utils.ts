import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { safeStorageGet, safeStorageSet } from '@/lib/browserStorage'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function fallbackUuid() {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  let randomBuffer: Uint8Array | null = null

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    randomBuffer = globalThis.crypto.getRandomValues(new Uint8Array(16))
  }

  let randomIndex = 0

  return template.replace(/[xy]/g, (char) => {
    const randomValue = randomBuffer
      ? randomBuffer[randomIndex++] % 16
      : Math.floor(Math.random() * 16)
    const value = char === 'x' ? randomValue : (randomValue & 0x3) | 0x8
    return value.toString(16)
  })
}

export function generateUuid(): string {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID()
  }

  return fallbackUuid()
}

export function generateDeviceId(): string {
  let deviceId = safeStorageGet(localStorage, 'device_id')
  if (!deviceId) {
    deviceId = generateUuid()
    safeStorageSet(localStorage, 'device_id', deviceId)
  }
  return deviceId
}

export function generateId(): string {
  return generateUuid()
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
