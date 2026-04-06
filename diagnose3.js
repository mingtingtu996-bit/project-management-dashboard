const esbuild = require('./node_modules/esbuild');
const fs = require('fs');

const content = fs.readFileSync('client/src/pages/GanttView.tsx', 'utf-8');
const lines = content.split('\n');
const total = lines.length;

async function testAt(count) {
  const testContent = lines.slice(0, count).join('\n');
  try {
    await esbuild.transform(testContent, { loader: 'tsx', jsx: 'automatic' });
    return { ok: true };
  } catch(e) {
    return { ok: false, err: e.message.slice(0, 200) };
  }
}

async function findBreakFrom(startGood, endBad) {
  // startGood = last known good, endBad = first known bad
  let lo = startGood + 1, hi = endBad;
  let lastGood = startGood;
  
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const r = await testAt(mid);
    if (r.ok) {
      lo = mid + 1;
      lastGood = mid;
    } else {
      hi = mid;
    }
  }
  return { breakAt: lo, lastGood };
}

async function main() {
  // We know full (3188) fails. Let's find the actual problematic line
  // that causes the FINAL Unexpected "}" error
  
  // First test with 2000, 2500, 3000 to find where "Unexpected }" first appears
  for (const count of [1000, 1500, 1672, 1700, 2000, 2500, 3000, total]) {
    const r = await testAt(count);
    console.log(`${count}: ${r.ok ? 'OK' : 'FAIL - ' + r.err.slice(0,100)}`);
  }
  
  // Find precise break for 1672 area
  console.log('\n--- Precise bisect around 1672 ---');
  const r1671 = await testAt(1671);
  const r1673 = await testAt(1673);
  console.log(`1671: ${r1671.ok ? 'OK' : 'FAIL - ' + r1671.err}`);
  console.log(`1673: ${r1673.ok ? 'OK' : 'FAIL - ' + r1673.err}`);
  
  const result = await findBreakFrom(1600, 1700);
  console.log(`\nBreak at ${result.breakAt}, last good: ${result.lastGood}`);
  console.log('\nLines around break:');
  for (let i = result.lastGood - 3; i <= result.breakAt + 2; i++) {
    if (i >= 0 && i < total) {
      console.log(`  ${i+1}: ${lines[i]}`);
    }
  }
}

main().catch(console.error);
