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

async function main() {
  // Find the break between 1500 and 1601
  // Binary search
  let lo = 1500, hi = 1601, lastGood = 1500;
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
  
  console.log(`Break at line ${lo}, last good: ${lastGood}`);
  console.log('\nLines around break:');
  for (let i = lastGood - 5; i <= lo + 3; i++) {
    if (i >= 0 && i < total) {
      const mark = (i + 1 === lo) ? '>>>' : '   ';
      console.log(`${mark} ${i+1}: ${lines[i]}`);
    }
  }
}

main().catch(console.error);
