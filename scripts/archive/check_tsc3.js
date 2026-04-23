const { execSync } = require('child_process');
let out = '';
try {
  execSync('npx tsc -p tsconfig.json --noEmit', {
    cwd: 'c:/Users/jjj64/WorkBuddy/20260318232610/server',
    encoding: 'utf8',
    timeout: 120000,
    stdio: 'pipe'
  });
  console.log('TS OK: 0 errors');
} catch (e) {
  out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
  if (out.includes('warningService')) {
    console.log('WARNING SERVICE ERRORS:');
    console.log(out.split('\n').filter(l => l.includes('warningService')).join('\n'));
  } else {
    console.log('warningService.ts: no errors');
    console.log('Other errors:');
    console.log(out);
  }
}
