import { describe, expect, it } from 'vitest'

import {
  buildRetentionDecisionDialogModel,
  buildRetentionDecisionPayload,
  getRetentionApiUserMessage,
  getRetentionDecisionTokenFromError,
  isRetentionConfirmationError,
  parseRetentionApiError,
} from '../retentionError'

describe('retentionError', () => {
  it('parses confirmation-required retention errors from API payloads', () => {
    const error = {
      status: 409,
      rawText: JSON.stringify({
        error: {
          code: 'RETENTION_CONFIRMATION_REQUIRED',
          message: 'The record has history consumers and will be retained.',
          details: {
            entity_type: 'task',
            entity_id: 'task-1',
            resolved_action: 'soft_delete',
            execution_mode: 'require_user_confirm',
            requires_user_confirmation: true,
            decision_token: 'event.token',
            reference_summary: { task_baseline_items: 1 },
          },
        },
      }),
    }

    const parsed = parseRetentionApiError(error)

    expect(isRetentionConfirmationError(error)).toBe(true)
    expect(getRetentionDecisionTokenFromError(error)).toBe('event.token')
    expect(parsed).toMatchObject({
      code: 'RETENTION_CONFIRMATION_REQUIRED',
      decisionToken: 'event.token',
      resolvedAction: 'soft_delete',
      requiresUserConfirmation: true,
    })
  })

  it('builds a shared dialog model for retention confirmation', () => {
    const model = buildRetentionDecisionDialogModel({
      title: '删除任务',
      entityName: '地下室结构施工',
      fallbackDescription: '确认删除？',
      retention: {
        code: 'RETENTION_CONFIRMATION_REQUIRED',
        message: 'The record has history consumers and will be retained.',
        decisionToken: 'event.token',
        resolvedAction: 'archive',
        executionMode: 'require_user_confirm',
        requiresUserConfirmation: true,
        referenceSummary: { change_logs: 2 },
        details: {},
      },
    })

    expect(model).toMatchObject({
      title: '确认归档保留',
      confirmLabel: '确认归档保留',
      confirmTone: 'default',
    })
    expect(model.description).toContain('地下室结构施工')
    expect(model.description).toContain('change_logs: 2')
  })

  it('normalizes retention details payloads from guarded delete flows', () => {
    const parsed = buildRetentionDecisionPayload({
      reason_code: 'history_consumer_retained',
      resolved_action: 'soft_delete',
      execution_mode: 'require_user_confirm',
      requires_user_confirmation: true,
      decision_token: 'event.token',
      reference_summary: { task_baseline_items: 1 },
    })

    expect(parsed).toMatchObject({
      code: 'RETENTION_CONFIRMATION_REQUIRED',
      decisionToken: 'event.token',
      resolvedAction: 'soft_delete',
      executionMode: 'require_user_confirm',
      requiresUserConfirmation: true,
      referenceSummary: { task_baseline_items: 1 },
    })
  })

  it('returns a stable user-facing message for expired retention tokens', () => {
    const error = {
      status: 409,
      rawText: JSON.stringify({
        error: {
          code: 'ENTITY_RETENTION_DECISION_EXPIRED',
          message: 'ENTITY_RETENTION_DECISION_EXPIRED',
        },
      }),
    }

    expect(getRetentionApiUserMessage(error)).toBe('保留处置凭证已过期或引用关系已变化，请刷新后重新发起操作。')
  })

  it('returns a stable user-facing message for in-flight retention confirmations', () => {
    const error = {
      status: 409,
      rawText: JSON.stringify({
        error: {
          code: 'RETENTION_DECISION_CONFIRMING',
          message: 'RETENTION_DECISION_CONFIRMING',
        },
      }),
    }

    expect(getRetentionApiUserMessage(error)).toBe('保留处置正在确认中，请稍后刷新查看结果。')
  })
})
