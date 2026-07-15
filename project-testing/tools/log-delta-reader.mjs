import { access, readFile, stat } from 'node:fs/promises';

export async function fileSize(filePath) {
  try {
    return (await stat(filePath)).size;
  } catch {
    return 0;
  }
}

export async function readLogDelta(filePath, startOffset) {
  try {
    const buffer = await readFile(filePath);
    return buffer.subarray(Math.max(0, startOffset)).toString('utf8');
  } catch {
    return '';
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForLogDelta(filePath, startOffset, predicate, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(0, options.timeoutMs) : 2500;
  const intervalMs = Number.isFinite(options.intervalMs) ? Math.max(25, options.intervalMs) : 100;
  if (options.requireExisting === true) {
    try {
      await access(filePath);
    } catch {
      throw new Error(`Required server log file not found: ${filePath}`);
    }
  }
  const startedAt = Date.now();
  let latestText = '';

  while (Date.now() - startedAt <= timeoutMs) {
    latestText = await readLogDelta(filePath, startOffset);
    if (predicate(latestText)) {
      return latestText;
    }
    await sleep(intervalMs);
  }

  return latestText;
}
