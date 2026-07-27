import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasCompanySummaryRouteCompletionEvidence,
  parseQueryEvidence,
} from './capture-c18-l14-company-summary-route-evidence.mjs';

test('company-summary route completion evidence does not require warm-cache DB queries', () => {
  const logText = [
    '{"level":30,"method":"GET","path":"/api/company/dashboard/company-summary","msg":"Incoming request"}',
    '{"level":30,"method":"GET","path":"/company-summary","status":200,"durationMs":42,"msg":"Request completed"}',
  ].join('\n');

  assert.equal(parseQueryEvidence(logText).queryCount, 0);
  assert.equal(hasCompanySummaryRouteCompletionEvidence(logText), true);
});

test('company-summary route completion evidence rejects unrelated completed requests', () => {
  const logText = '{"level":30,"method":"GET","path":"/api/projects/project-1/dashboard/project-summary","status":200,"msg":"Request completed"}';

  assert.equal(hasCompanySummaryRouteCompletionEvidence(logText), false);
});
