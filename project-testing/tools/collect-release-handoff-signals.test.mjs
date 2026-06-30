import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const collectorPath = path.join(repoRoot, 'project-testing/tools/collect-release-handoff-signals.mjs');

test('handoff signal collector discovers C15 candidates from the live canary candidate table', async () => {
  const collectorSource = await readFile(collectorPath, 'utf8');

  assert.match(collectorSource, /duration_context_policy_canary_candidates/);
  assert.doesNotMatch(collectorSource, /duration_context_policy_candidates/);
  assert.match(collectorSource, /duration-context-policy-canary-candidates/);
});
