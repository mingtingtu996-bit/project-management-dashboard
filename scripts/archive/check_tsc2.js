const { execSync } = require('child_process');
try {
  execSync('npx tsc -p tsconfig.json --noEmit', {
    cwd: 'c:/Users/jjj64/WorkBuddy/20260318232610/server',
    encoding: 'utf8',
    timeout: 120000,
    stdio: 'pipe'
  });
  console.log('TS OK: 0 errors');
} catch (e) {
  const out = e.stdout ? e.stdout.toString() : '';
  const err = e.stderr ? e.stderr.toString() : '';
  console.log(out || err || 'Unknown error');
}
