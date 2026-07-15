import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

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

export function generateId(): string {
  return generateUuid()
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '—'
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(d.getTime())) return '—'
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${formatDate(d)} ${hours}:${minutes}`
}
