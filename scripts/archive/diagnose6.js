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
  // Try replacing all U+2500 lines with regular dashes
  const fixed = lines.map((line, i) => {
    if (line.includes('\u2500')) {
      const newLine = line.replace(/\u2500/g, '-');
      console.log(`Fixed line ${i+1}: replaced U+2500 chars`);
      return newLine;
    }
    return line;
  });
  
  const fixedContent = fixed.join('\n');
  try {
    await esbuild.transform(fixedContent, { loader: 'tsx', jsx: 'automatic' });
    console.log('\nFULL FILE WITH U+2500 REPLACED: OK - U+2500 is the cause!');
  } catch(e) {
    console.log('\nFull file with U+2500 replaced: FAIL - not U+2500');
    console.log(e.message.slice(0, 200));
  }
  
  // Original
  const origContent = lines.join('\n');
  try {
    await esbuild.transform(origContent, { loader: 'tsx', jsx: 'automatic' });
    console.log('Original full: OK (unexpected!)');
  } catch(e) {
    console.log('Original full: FAIL - ' + e.message.slice(0, 100));
  }
}

main().catch(console.error);
