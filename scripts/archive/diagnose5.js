const esbuild = require('./node_modules/esbuild');
const fs = require('fs');

const content = fs.readFileSync('client/src/pages/GanttView.tsx', 'utf-8');
const lines = content.split('\n');

async function testAt(count) {
  const testContent = lines.slice(0, count).join('\n');
  try {
    await esbuild.transform(testContent, { loader: 'tsx', jsx: 'automatic' });
    return { ok: true };
  } catch(e) {
    return { ok: false, err: e.message.slice(0, 300) };
  }
}

async function main() {
  // Let's find ALL break points - scan in ranges
  // We know 1500 is ok, 1501+ is not
  // Check all lines from 1487 to 1505 individually
  console.log('=== Scanning lines 1480-1520 ===');
  for (let i = 1485; i <= 1510; i++) {
    const r = await testAt(i);
    console.log(`${i}: ${r.ok ? 'OK' : 'FAIL - ' + r.err.slice(0, 80)}`);
  }
}

main().catch(console.error);
