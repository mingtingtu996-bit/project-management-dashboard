import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, describe, expect, it, vi } from 'vitest'

describe('logger persistence', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('writes JSON logs to a persisted file when enabled', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'workbuddy-logs-'))
    const logFilePath = path.join(tempDir, 'server.log')

    process.env.NODE_ENV = 'test'
    process.env.LOG_PERSIST_IN_TEST = 'true'
    process.env.LOG_FILE_PATH = logFilePath
    process.env.LOG_LEVEL = 'info'

    const { logger } = await import('../middleware/logger.js')

    logger.info('test persistence message', { scope: 'unit-test', foo: 'bar' })

    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(existsSync(logFilePath)).toBe(true)

    const content = readFileSync(logFilePath, 'utf8')
    expect(content).toContain('"msg":"test persistence message"')
    expect(content).toContain('"scope":"unit-test"')

    rmSync(tempDir, { recursive: true, force: true })
  })
})
