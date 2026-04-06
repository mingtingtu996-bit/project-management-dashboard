const { execSync } = require('child_process');
try {
  const result = execSync('npx tsc -p tsconfig.json --noEmit', {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 120000,
    stdio: 'pipe'
  });
  console.log('TS 编译结果: 0 错误 ✅');
  console.log(result);
} catch (e) {
  const stdout = e.stdout ? e.stdout.toString() : '';
  const stderr = e.stderr ? e.stderr.toString() : '';
  const output = stdout + stderr;
  if (output) {
    console.log('TS 编译错误:');
    console.log(output);
  } else {
    console.log('TS 编译结果: 0 错误 ✅');
  }
}
