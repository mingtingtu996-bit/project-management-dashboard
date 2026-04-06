import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('client/src/pages/GanttView.tsx', 'rb') as f:
    raw = f.read()

# Check for BOM
if raw[:3] == b'\xef\xbb\xbf':
    print('BOM found at start')
else:
    print('No BOM')

# Check for null bytes
nulls = [i for i, b in enumerate(raw) if b == 0]
if nulls:
    print(f'Null bytes at positions: {nulls[:20]}')
else:
    print('No null bytes')

# Decode and check line endings
content = raw.decode('utf-8')
lines = content.split('\n')
print(f'Total lines: {len(lines)}')
print(f'Last 5 lines:')
for i, line in enumerate(lines[-5:], len(lines)-4):
    print(f'  {i}: {repr(line)}')

# Look for any hidden control chars outside normal range  
suspicious = []
for i, line in enumerate(content.split('\n'), 1):
    for j, ch in enumerate(line):
        code = ord(ch)
        # control chars 0x00-0x08, 0x0B-0x0C, 0x0E-0x1F (not tab/lf/cr)
        if code in range(0, 9) or code in range(11, 13) or code in range(14, 32):
            suspicious.append((i, j, code))

if suspicious:
    print(f'\nSuspicious control chars: {len(suspicious)}')
    for s in suspicious[:20]:
        print(f'  Line {s[0]} col {s[1]}: U+{s[2]:04X}')
else:
    print('\nNo suspicious control chars')
    
# check last 100 chars raw
print(f'\nLast 200 raw bytes (hex): {raw[-200:].hex()}')
