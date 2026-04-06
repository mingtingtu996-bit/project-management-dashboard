import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('GanttView.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
print("\n=== useState/useRef with complex generics (first 1310 lines) ===")
for i, line in enumerate(lines[:1310]):
    stripped = line.strip()
    if 'useState<' in stripped or 'useRef<' in stripped:
        print(f"L{i+1}: {stripped}")

print("\n=== Lines around 1305-1315 ===")
for i in range(1300, min(1315, len(lines))):
    print(f"L{i+1}: {lines[i]}", end='')
