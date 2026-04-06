const esbuild = require('./node_modules/esbuild');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client/src/pages/GanttView.tsx');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');
const total = lines.length;

console.log(`Total lines: ${total}`);

async function testLines(count) {
  const testContent = lines.slice(0, count).join('\n');
  try {
    await esbuild.transform(testContent, {
      loader: 'tsx',
      jsx: 'automatic',
    });
    return true;
  } catch(e) {
    return false;
  }
}

async function bisect() {
  // First test full
  const fullOk = await testLines(total);
  console.log(`Full file (${total}): ${fullOk ? 'OK' : 'FAIL'}`);
  
  if (fullOk) {
    console.log('No problem found!');
    return;
  }
  
  let lo = 1, hi = total, lastGood = 0;
  
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const ok = await testLines(mid);
    console.log(`  Test ${mid} lines: ${ok ? 'OK' : 'FAIL'}`);
    if (ok) {
      lo = mid + 1;
      lastGood = mid;
    } else {
      hi = mid;
    }
  }
  
  console.log(`\nBreaks at line ${lo} (last good: ${lastGood})`);
  console.log('Lines around break:');
  for (let i = Math.max(0, lo - 6); i < Math.min(total, lo + 3); i++) {
    console.log(`  ${i+1}: ${lines[i]}`);
  }
}

bisect().catch(console.error);
