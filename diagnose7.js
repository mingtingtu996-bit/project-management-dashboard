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
    return { ok: false, err: e.message.slice(0, 300) };
  }
}

async function main() {
  // When we have full file, esbuild says Unexpected } on line 3187
  // This means somewhere before line 3187, esbuild thinks the main function ended
  // Let's find: at what line does a COMPLETE valid parse start failing differently?
  
  // Key question: does line 3186 (just `}` on its own) cause the issue?
  // Test 3185 lines (stops at `)` of return statement)
  const r3185 = await testAt(3185);
  const r3186 = await testAt(3186);  
  const r3187 = await testAt(3187);
  console.log(`3185: ${r3185.ok ? 'OK' : 'FAIL - ' + r3185.err.slice(0,100)}`);
  console.log(`3186: ${r3186.ok ? 'OK' : 'FAIL - ' + r3186.err.slice(0,100)}`);
  console.log(`3187: ${r3187.ok ? 'OK' : 'FAIL - ' + r3187.err.slice(0,100)}`);
  
  // Find the REAL break - last line where adding it changes from "unexpected end of file" to "unexpected }"
  // We need to find the line that causes the "extra }" interpretation
  
  // Let's test with a line appended that forces closure
  // Replace last } with nothing to see if it helps
  const withoutLast = [...lines];
  withoutLast.pop(); // remove empty
  withoutLast.pop(); // remove }
  const testContent = withoutLast.join('\n');
  try {
    await esbuild.transform(testContent, { loader: 'tsx', jsx: 'automatic' });
    console.log('\nWithout last }: OK');
  } catch(e) {
    console.log('\nWithout last }: FAIL - ' + e.message.slice(0,200));
  }
  
  // What if we add an extra { at the beginning?
  const withExtra = ['// extra {', ...lines].join('\n');
  try {
    await esbuild.transform(withExtra, { loader: 'tsx', jsx: 'automatic' });
    console.log('With extra {: OK');
  } catch(e) {
    console.log('With extra {: FAIL - ' + e.message.slice(0,200));
  }
}

main().catch(console.error);
