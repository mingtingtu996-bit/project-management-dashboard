import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkC15LiveLearningPreflight,
  parseArgs,
} from './check-c15-live-learning-preflight.mjs';

test('C15 preflight blocks when reward targets are future and no candidate exists', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c15-preflight-'));
  const output = path.join(root, 'c15-preflight.json');
  const queries = [];
  const queryExec = async (sql, params = []) => {
    queries.push({ sql, params });
    if (sql.includes('FROM public.duration_context_policy_decisions')) {
      return [{
        decision_count: 28,
        pending_count: 28,
        evaluated_count: 0,
        eligible_now_count: 0,
        future_pending_count: 28,
        min_target_reward_date: '2026-07-23T16:00:00.000Z',
        max_target_reward_date: '2026-07-26T16:00:00.000Z',
      }];
    }
    if (sql.includes('FROM public.duration_context_policy_canary_candidates')) {
      return [{ candidate_count: 0, latest_candidate_id: null }];
    }
    if (sql.includes('FROM public.project_productivity_compensation_calibrations')) {
      return [{ calibration_count: 87, latest_window_end_date: '2026-06-26T16:00:00.000Z' }];
    }
    return [];
  };

  try {
    const report = await checkC15LiveLearningPreflight({
      projectId: 'project-1',
      companyId: 'company-1',
      metricWindow: '2026-06-29T06:00:00Z/2026-06-29T07:00:00Z',
      output,
      queryExec,
      now: new Date('2026-06-29T06:00:00.000Z'),
    });

    assert.equal(report.status, 'blocked');
    assert.equal(report.dbMutation, false);
    assert.equal(report.readiness.candidateReady, false);
    assert.ok(report.reasonCodes.includes('reward_targets_not_due'));
    assert.ok(report.reasonCodes.includes('canary_candidate_missing'));
    assert.ok(!queries.some((query) => /\b(insert|update|delete|drop)\b/i.test(query.sql)));

    const written = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(written.status, 'blocked');
    assert.equal(written.metricWindow, '2026-06-29T06:00:00Z/2026-06-29T07:00:00Z');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C15 preflight passes when evaluated decisions and candidate are present', async () => {
  const report = await checkC15LiveLearningPreflight({
    projectId: 'project-1',
    companyId: 'company-1',
    metricWindow: '2026-06-29T06:00:00Z/2026-06-29T07:00:00Z',
    queryExec: async (sql) => {
      if (sql.includes('FROM public.duration_context_policy_decisions')) {
        return [{
          decision_count: 28,
          pending_count: 0,
          evaluated_count: 28,
          eligible_now_count: 0,
          future_pending_count: 0,
          min_target_reward_date: '2026-06-01T00:00:00.000Z',
          max_target_reward_date: '2026-06-10T00:00:00.000Z',
        }];
      }
      if (sql.includes('FROM public.duration_context_policy_canary_candidates')) {
        return [{ candidate_count: 1, latest_candidate_id: 'candidate-1' }];
      }
      if (sql.includes('FROM public.project_productivity_compensation_calibrations')) {
        return [{ calibration_count: 10, latest_window_end_date: '2026-06-20T00:00:00.000Z' }];
      }
      return [];
    },
    now: new Date('2026-06-29T06:00:00.000Z'),
  });

  assert.equal(report.status, 'ready');
  assert.equal(report.readiness.rewardEvaluationReady, true);
  assert.equal(report.readiness.candidateReady, true);
  assert.deepEqual(report.reasonCodes, []);
});

test('C15 preflight closes query executors that expose a close hook', async () => {
  let closed = false;
  const queryExec = async (sql) => {
    if (sql.includes('FROM public.duration_context_policy_decisions')) {
      return [{ decision_count: 0, pending_count: 0, evaluated_count: 0, eligible_now_count: 0, future_pending_count: 0 }];
    }
    if (sql.includes('FROM public.duration_context_policy_canary_candidates')) {
      return [{ candidate_count: 0, latest_candidate_id: null }];
    }
    if (sql.includes('FROM public.project_productivity_compensation_calibrations')) {
      return [{ calibration_count: 0, latest_window_end_date: null }];
    }
    return [];
  };
  queryExec.close = async () => {
    closed = true;
  };

  await checkC15LiveLearningPreflight({
    projectId: 'project-1',
    queryExec,
    now: new Date('2026-06-29T06:10:00.000Z'),
  });

  assert.equal(closed, true);
});

test('C15 preflight closes query executors after read failure', async () => {
  let closed = false;
  const queryExec = async () => {
    throw new Error('read failed');
  };
  queryExec.close = async () => {
    closed = true;
  };

  await assert.rejects(
    checkC15LiveLearningPreflight({
      projectId: 'project-1',
      queryExec,
      now: new Date('2026-06-29T06:10:00.000Z'),
    }),
    /read failed/,
  );

  assert.equal(closed, true);
});

test('C15 preflight argument parser accepts read-only DB inputs', () => {
  const parsed = parseArgs([
    '--project-id',
    'project-1',
    '--company-id',
    'company-1',
    '--metric-window',
    '2026-06-29T06:00:00Z/2026-06-29T07:00:00Z',
    '--output',
    'project-testing/reports/c15-preflight.json',
  ]);

  assert.equal(parsed.projectId, 'project-1');
  assert.equal(parsed.companyId, 'company-1');
  assert.match(parsed.output, /c15-preflight\.json$/);
});
