import type { V14231ReadinessEvaluationContext } from './v14231CapabilityReadinessService.js'

type ReadinessRuntimeEnv = Partial<Record<
  | 'RELEASE_SHA'
  | 'DEPLOY_TARGET',
  string
>>

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function loadV14231ReadinessEvaluationContext(
  env: ReadinessRuntimeEnv = process.env,
  now = new Date(),
): V14231ReadinessEvaluationContext {
  const releaseSha = text(env.RELEASE_SHA)
  const expectedTargetEnvironment = text(env.DEPLOY_TARGET)
  return {
    expectedReleaseDigest: releaseSha ? `git:${releaseSha}` : null,
    expectedTargetEnvironment: expectedTargetEnvironment || null,
    now,
  }
}
