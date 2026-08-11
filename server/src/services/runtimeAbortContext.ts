import { AsyncLocalStorage } from 'node:async_hooks'

const runtimeAbortSignalStorage = new AsyncLocalStorage<AbortSignal>()

export function getRuntimeAbortSignal() {
  return runtimeAbortSignalStorage.getStore() ?? null
}

export function combineAbortSignals(
  ...signals: Array<AbortSignal | null | undefined>
) {
  const uniqueSignals = [...new Set(signals.filter((signal): signal is AbortSignal => Boolean(signal)))]
  if (uniqueSignals.length === 0) return undefined
  if (uniqueSignals.length === 1) return uniqueSignals[0]
  return AbortSignal.any(uniqueSignals)
}

export function runWithRuntimeAbortSignal<T>(
  signal: AbortSignal,
  runner: () => Promise<T>,
) {
  const effectiveSignal = combineAbortSignals(getRuntimeAbortSignal(), signal) ?? signal
  return runtimeAbortSignalStorage.run(effectiveSignal, runner)
}
