import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  checkC19RuntimePreflight,
  parseArgs,
} from './check-c19-runtime-preflight.mjs';

test('C19 preflight blocks when duration samples and runtime publications are missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'workbuddy-c19-preflight-'));
  const output = path.join(root, 'c19-preflight.json');
  const queryExec = async (sql) => {
    if (sql.includes('FROM public.duration_experience_samples')) {
      return [{ duration_sample_count: 0, t2_window_sample_count: 0 }];
    }
    if (sql.includes('FROM public.t2_rhythm_schedule_runtime_publications')) {
      return [{ publication_count: 0, latest_publication_key: null }];
    }
    if (sql.includes('FROM public.t2_rhythm_schedule_runtime_events')) {
      return [{ event_count: 0, monitoring_count: 0, rollback_count: 0 }];
    }
    if (sql.includes('FROM public.tasks')) {
      return [{ completed_actual_task_count: 90, t2_metadata_task_count: 0 }];
    }
    return [];
  };

  try {
    const report = await checkC19RuntimePreflight({
      projectId: 'project-1',
      output,
      queryExec,
      now: new Date('2026-06-29T06:30:00.000Z'),
    });

    assert.equal(report.status, 'blocked');
    assert.equal(report.dbMutation, false);
    assert.ok(report.reasonCodes.includes('duration_experience_samples_missing'));
    assert.ok(report.reasonCodes.includes('t2_window_metadata_missing'));
    assert.ok(report.reasonCodes.includes('runtime_publication_missing'));
    assert.equal(report.taskReadiness.completedActualTaskCount, 90);

    const written = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(written.status, 'blocked');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C19 preflight passes when replay samples, publication, monitoring, and rollback exist', async () => {
  const report = await checkC19RuntimePreflight({
    projectId: 'project-1',
    queryExec: async (sql) => {
      if (sql.includes('FROM public.duration_experience_samples')) {
        return [{ duration_sample_count: 25, t2_window_sample_count: 25 }];
      }
      if (sql.includes('FROM public.t2_rhythm_schedule_runtime_publications')) {
        return [{ publication_count: 1, latest_publication_key: 'publication-1' }];
      }
      if (sql.includes('FROM public.t2_rhythm_schedule_runtime_events')) {
        return [{ event_count: 3, monitoring_count: 1, rollback_count: 1 }];
      }
      if (sql.includes('FROM public.tasks')) {
        return [{ completed_actual_task_count: 90, t2_metadata_task_count: 25 }];
      }
      return [];
    },
    now: new Date('2026-06-29T06:30:00.000Z'),
  });

  assert.equal(report.status, 'ready');
  assert.deepEqual(report.reasonCodes, []);
});

test('C19 preflight closes query executors that expose a close hook', async () => {
  let closed = false;
  const queryExec = async (sql) => {
    if (sql.includes('FROM public.duration_experience_samples')) return [{ duration_sample_count: 0, t2_window_sample_count: 0 }];
    if (sql.includes('FROM public.t2_rhythm_schedule_runtime_publications')) return [{ publication_count: 0, latest_publication_key: null }];
    if (sql.includes('FROM public.t2_rhythm_schedule_runtime_events')) return [{ event_count: 0, monitoring_count: 0, rollback_count: 0 }];
    if (sql.includes('FROM public.tasks')) return [{ completed_actual_task_count: 0, t2_metadata_task_count: 0 }];
    return [];
  };
  queryExec.close = async () => {
    closed = true;
  };

  await checkC19RuntimePreflight({
    projectId: 'project-1',
    queryExec,
    now: new Date('2026-06-29T06:30:00.000Z'),
  });

  assert.equal(closed, true);
});

test('C19 preflight argument parser accepts read-only inputs', () => {
  const parsed = parseArgs([
    '--project-id',
    'project-1',
    '--output',
    'project-testing/reports/c19-preflight.json',
  ]);

  assert.equal(parsed.projectId, 'project-1');
  assert.match(parsed.output, /c19-preflight\.json$/);
});
