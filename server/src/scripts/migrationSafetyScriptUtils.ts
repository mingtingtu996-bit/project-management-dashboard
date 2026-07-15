import { promises as fs } from 'node:fs'

import type { MigrationChecksumReconciliationRecord } from '../services/migrationSafetyGateService.js'

export async function readAdoptedBaselineLedgerRows(path: string) {
  const raw = await fs.readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '[]'
    throw error
  })
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    throw new Error('adopted baseline registry must be a JSON array of migration filenames')
  }

  return parsed.map((filename) => filename.trim()).filter(Boolean)
}

export async function readChecksumReconciliations(path: string): Promise<MigrationChecksumReconciliationRecord[]> {
  const raw = await fs.readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return '[]'
    throw error
  })
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error('checksum reconciliation registry must be a JSON array')
  }

  return parsed.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('checksum reconciliation registry entries must be objects')
    }
    const record = item as Record<string, unknown>
    const requiredFields = [
      'filename',
      'version',
      'currentFileChecksum',
      'appliedLedgerChecksum',
      'reviewedAt',
      'reviewedBy',
      'evidence',
    ] as const

    for (const field of requiredFields) {
      if (typeof record[field] !== 'string' || !record[field].trim()) {
        throw new Error(`checksum reconciliation registry entry missing required field: ${field}`)
      }
    }

    return {
      filename: readRequiredString(record, 'filename'),
      version: readRequiredString(record, 'version'),
      currentFileChecksum: readRequiredString(record, 'currentFileChecksum'),
      appliedLedgerChecksum: readRequiredString(record, 'appliedLedgerChecksum'),
      reviewedAt: readRequiredString(record, 'reviewedAt'),
      reviewedBy: readRequiredString(record, 'reviewedBy'),
      evidence: readRequiredString(record, 'evidence'),
    }
  })
}

function readRequiredString(record: Record<string, unknown>, field: string) {
  const value = record[field]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`checksum reconciliation registry entry missing required field: ${field}`)
  }
  return value.trim()
}
