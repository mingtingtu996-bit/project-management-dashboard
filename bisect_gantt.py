import sys
import subprocess
import os
sys.stdout.reconfigure(encoding='utf-8')

with open('client/src/pages/GanttView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
total = len(lines)
print(f'Total lines: {total}')

esbuild_exe = 'node_modules\\.bin\\esbuild.cmd'

def test_esbuild(line_count, lines):
    test_content = '\n'.join(lines[:line_count])
    with open('client/src/pages/GanttViewTest.tsx', 'w', encoding='utf-8') as f:
        f.write(test_content)
    
    result = subprocess.run(
        [esbuild_exe, '--bundle=false', '--loader=tsx', 
         'client/src/pages/GanttViewTest.tsx'],
        capture_output=True, text=True, encoding='utf-8', errors='replace',
        shell=True
    )
    success = result.returncode == 0
    return success, result.stderr[:300] if not success else ''

# Test full file first
ok, err = test_esbuild(total, lines)
print(f'Full file ({total} lines): {"OK" if ok else "FAIL"}')
if not ok:
    print(f'Error: {err[:200]}')
    
    # Binary search
    lo, hi = 1, total
    last_good = 0

    while lo < hi:
        mid = (lo + hi) // 2
        ok2, _ = test_esbuild(mid, lines)
        if ok2:
            lo = mid + 1
            last_good = mid
        else:
            hi = mid
    
    print(f'\nBreaks starting at line {lo} (last good: {last_good})')
    print('Lines around break point:')
    for i in range(max(0, lo-6), min(total, lo+4)):
        print(f'  {i+1}: {lines[i]}')

# cleanup
try:
    os.remove('client/src/pages/GanttViewTest.tsx')
except:
    pass
