import sys
sys.stdout.reconfigure(encoding='utf-8')
import subprocess
import json

with open('GanttView.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 逐行增量测试 80-210 行之间哪一行开始出错
# 直接测试每5行一个区间
test_script = """
const esbuild = require('../../../node_modules/esbuild');
const fs = require('fs');
const lines = fs.readFileSync('GanttView.tsx', 'utf8').split('\\n');

async function test(n) {
  const partial = lines.slice(0, n).join('\\n');
  try {
    await esbuild.transform(partial, { loader: 'tsx', jsx: 'automatic' });
    return true;
  } catch(e) {
    return false;
  }
}

async function main() {
  // Fine-grained search around 80-210
  let lo = 80, hi = 220;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await test(mid)) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  console.log('Problem line:', lo);
  const allLines = fs.readFileSync('GanttView.tsx', 'utf8').split('\\n');
  for(let i = lo-3; i <= lo+2; i++) {
    console.log((i+1) + ': ' + allLines[i]);
  }
}

main().catch(console.error);
"""

with open('find_problem_line.js', 'w') as f:
    f.write(test_script)

print("Script written. Run: node find_problem_line.js")
