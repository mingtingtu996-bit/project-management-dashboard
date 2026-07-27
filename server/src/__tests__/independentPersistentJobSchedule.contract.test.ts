import { describe, expect, it } from 'vitest'
import {
  discoverRuntimeRecurringTimersFromRepositorySource,
  discoverRuntimeRecurringTimersInSource,
} from './helpers/runtimeRecurringTimerSourceDiscovery.js'

const approvedRecurringTimers = [
  {
    sourcePath: 'server/src/services/realtimeServer.ts',
    sourceSymbol: 'ensureHeartbeatLoop.setInterval',
    classification: 'approved_realtime_connection_heartbeat',
    owner: 'realtimeServer',
    reason: 'WebSocket liveness requires a connection-scoped protocol heartbeat; business jobs use persistent wall-clock schedules.',
  },
] as const

describe('independent persistent job schedule contract', () => {
  it('finds syntax-level recurring timers without matching comments or strings', () => {
    const discovered = discoverRuntimeRecurringTimersInSource(`
      import { setInterval as repeat } from 'node:timers'
      const documentation = 'setInterval(() => businessJob(), 1000)'
      // setInterval(() => commentedOutJob(), 1000)
      function start() {
        setInterval(() => heartbeat(), 1000)
        globalThis.setInterval(() => secondHeartbeat(), 1000)
        scheduler.setInterval(() => businessTimer(), 1000)
        repeat(() => importedTimer(), 1000)
      }
    `, 'server/src/example.ts')

    expect(discovered).toEqual([
      { sourcePath: 'server/src/example.ts', sourceSymbol: 'start.setInterval#1', line: 6 },
      { sourcePath: 'server/src/example.ts', sourceSymbol: 'start.setInterval#2', line: 7 },
      { sourcePath: 'server/src/example.ts', sourceSymbol: 'start.setInterval#3', line: 8 },
      { sourcePath: 'server/src/example.ts', sourceSymbol: 'start.setInterval#4', line: 9 },
    ])
  })

  it('allows only explicitly classified recurring timers in repository runtime source', () => {
    const discovered = discoverRuntimeRecurringTimersFromRepositorySource()
      .map(({ sourcePath, sourceSymbol }) => ({ sourcePath, sourceSymbol }))
    const approved = approvedRecurringTimers
      .map(({ sourcePath, sourceSymbol }) => ({ sourcePath, sourceSymbol }))

    expect(discovered).toEqual(approved)
    expect(approvedRecurringTimers).toHaveLength(1)
    for (const timer of approvedRecurringTimers) {
      expect(timer.classification).toBe('approved_realtime_connection_heartbeat')
      expect(timer.owner.trim()).not.toBe('')
      expect(timer.reason.trim()).not.toBe('')
    }
  })
})
