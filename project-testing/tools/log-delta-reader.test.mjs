import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { fileSize, readLogDelta, waitForLogDelta } from './log-delta-reader.mjs';

test('readLogDelta uses byte offsets before UTF-8 decoding', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workbuddy-log-delta-'));
  const logPath = path.join(dir, 'server.log');

  try {
    await writeFile(logPath, '中文日志前缀\n', 'utf8');
    const offset = await fileSize(logPath);
    await writeFile(logPath, '中文日志前缀\nExecuted query { table: "project_daily_snapshot" }\n', 'utf8');

    const delta = await readLogDelta(logPath, offset);

    assert.equal(delta, 'Executed query { table: "project_daily_snapshot" }\n');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('waitForLogDelta returns the latest delta when predicate becomes true', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workbuddy-log-wait-'));
  const logPath = path.join(dir, 'server.log');

  try {
    await writeFile(logPath, '启动日志\n', 'utf8');
    const offset = await fileSize(logPath);
    const appendLater = new Promise((resolve) => {
      setTimeout(async () => {
        await writeFile(logPath, '启动日志\nExecuted query {\nRequest completed\n', 'utf8');
        resolve();
      }, 50);
    });

    const delta = await waitForLogDelta(
      logPath,
      offset,
      (text) => text.includes('Executed query') && text.includes('Request completed'),
      { timeoutMs: 1000, intervalMs: 25 },
    );
    await appendLater;

    assert.match(delta, /Executed query/);
    assert.match(delta, /Request completed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('waitForLogDelta can fail fast when the log file is missing', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'workbuddy-log-missing-'));
  const logPath = path.join(dir, 'missing-server.log');

  try {
    await assert.rejects(
      waitForLogDelta(
        logPath,
        0,
        () => false,
        { timeoutMs: 1, intervalMs: 25, requireExisting: true },
      ),
      /Required server log file not found/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
