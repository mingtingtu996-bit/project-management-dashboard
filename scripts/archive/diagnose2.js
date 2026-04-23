const esbuild = require('./node_modules/esbuild');
const fs = require('fs');

const content = fs.readFileSync('client/src/pages/GanttView.tsx', 'utf-8');
const lines = content.split('\n');
const total = lines.length;

// Binary search - but this time find the LAST line that when included causes failure
// vs success with one less line
async function findBreakPoint() {
  // We know 157 lines is OK, full is FAIL
  // Let's scan from 158 upward to find all "break" points
  
  let results = [];
  let lo = 157, hi = total;
  let lastGood = 157;
  
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const testContent = lines.slice(0, mid).join('\n');
    try {
      await esbuild.transform(testContent, { loader: 'tsx', jsx: 'automatic' });
      lo = mid + 1;
      lastGood = mid;
      results.push(`OK: ${mid}`);
    } catch(e) {
      hi = mid;
      results.push(`FAIL: ${mid} - ${e.message.slice(0,80)}`);
    }
  }
  
  console.log(`\nBreak point: line ${lo} (last good: ${lastGood})`);
  console.log('Binary search log:');
  results.forEach(r => console.log(' ', r));
  
  console.log('\nLines around break:');
  for (let i = Math.max(0, lo-5); i < Math.min(total, lo+3); i++) {
    console.log(`  ${i+1}: ${lines[i]}`);
  }
}

findBreakPoint().catch(console.error);
