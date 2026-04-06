import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('client/src/pages/GanttView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')

# Show hex for lines 150-160
for i in range(149, 162):
    line = lines[i]
    chars_info = []
    for ch in line:
        if ord(ch) > 127:
            chars_info.append(f'[U+{ord(ch):04X}={ch}]')
    print(f'Line {i+1}: {repr(line[:80])} {" ".join(chars_info)}')
