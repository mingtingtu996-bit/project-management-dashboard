const esbuild = require('./node_modules/esbuild');
const fs = require('fs');

const content = fs.readFileSync('client/src/pages/GanttView.tsx', 'utf-8');
const lines = content.split('\n');

// Test: does line 152 cause the issue?
async function test() {
  // Test lines 1-157 (should be OK)
  const ok157 = lines.slice(0, 157).join('\n');
  try {
    await esbuild.transform(ok157, { loader: 'tsx', jsx: 'automatic' });
    console.log('Lines 1-157: OK');
  } catch(e) {
    console.log('Lines 1-157: FAIL -', e.message.slice(0, 100));
  }

  // Test lines 1-158 (should fail)
  const fail158 = lines.slice(0, 158).join('\n');
  try {
    await esbuild.transform(fail158, { loader: 'tsx', jsx: 'automatic' });
    console.log('Lines 1-158: OK');
  } catch(e) {
    console.log('Lines 1-158: FAIL -', e.message.slice(0, 200));
  }
  
  // Test: replace line 152 ─── with --- and try 1-158 again
  const fixed = [...lines];
  fixed[151] = fixed[151].replace(/\u2500/g, '-');
  const fixed158 = fixed.slice(0, 158).join('\n');
  try {
    await esbuild.transform(fixed158, { loader: 'tsx', jsx: 'automatic' });
    console.log('Lines 1-158 (fixed line 152): OK - LINE 152 IS THE CULPRIT!');
  } catch(e) {
    console.log('Lines 1-158 (fixed line 152): FAIL - not line 152');
  }
}

test().catch(console.error);
