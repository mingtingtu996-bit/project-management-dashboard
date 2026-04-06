import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('client/src/pages/GanttView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
print(f'Total lines: {len(lines)}')

# count braces
open_b = 0
close_b = 0
for c in content:
    if c == '{':
        open_b += 1
    elif c == '}':
        close_b += 1
print(f'Open braces: {open_b}, Close braces: {close_b}, diff: {open_b - close_b}')

# find non-standard chars
found = []
for i, line in enumerate(lines, 1):
    for j, char in enumerate(line):
        code = ord(char)
        # emoji range and special
        if (0x1F000 <= code <= 0x1FFFF) or (0x2600 <= code <= 0x27FF) or code == 0xFEFF:
            found.append((i, j, code, line[:100]))

print(f'Found {len(found)} special chars:')
for item in found:
    print(f'  Line {item[0]} col {item[1]}: U+{item[2]:04X} : {item[3][:80]}')
