import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function readDoc() {
  const candidates = [
    join(process.cwd(), '..', 'docs/specs/deletion-retention-governance.md'),
    join(process.cwd(), 'docs/specs/deletion-retention-governance.md'),
  ]
  const docPath = candidates.find(existsSync)
  if (!docPath) throw new Error('deletion-retention-governance.md not found')
  return readFileSync(docPath, 'utf8')
}

describe('deletion retention governance documentation', () => {
  it('documents the unified action, coverage matrix, diagnostics, and source-deleted contracts', () => {
    const doc = readDoc()

    expect(doc).toContain('Unified Dangerous Action')
    expect(doc).toContain('Coverage Matrix')
    expect(doc).toContain('Executor Registry')
    expect(doc).toContain('Diagnostics Endpoint')
    expect(doc).toContain('Pending Manual Close')
    expect(doc).toContain('Source Deleted')
    expect(doc).toContain('Confirmation Hardening')
    expect(doc).toContain('decision_token_hash')
    expect(doc).toContain('buildRetentionBlockedHttpStatus')
    expect(doc).toContain('plaintext `decision_token`')
    expect(doc).toContain('confirmed_action_result')
    expect(doc).toContain('createRetentionConfirmationTransactionPlan')
    expect(doc).toContain('stale confirming events')
    expect(doc).toContain('bound to the original `actor_id`')
    expect(doc).toContain('RETENTION_CONFIRMATION_FAILED')
    expect(doc).toContain('operatorAttention')
    expect(doc).toContain('transactionMode')
    expect(doc).toContain('/api/deletion-retention/diagnostics')
    expect(doc).toContain('visible project')
    expect(doc).toContain('/api/deletion-retention/preview')
    expect(doc).toContain('/api/deletion-retention/operator-actions')
    expect(doc).toContain('createRetentionConfirmationTransactionBoundary')
    expect(doc).toContain('executeRetentionConfirmationTransactionBoundary')
    expect(doc).toContain('RETENTION_OPERATOR_ACTION_NOT_ATTENTION_STATUS')
    expect(doc).toContain('previewOnly')
  })
})
