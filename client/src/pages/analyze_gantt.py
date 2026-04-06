import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('GanttView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
    lines = content.split('\n')

print(f"Total lines: {len(lines)}")
print(f"Total size: {len(content)} bytes")

# Find major JSX blocks and function definitions
print("\n=== JSX Component/Function boundaries (return statements at function scope) ===")
indent_stack = []
for i, line in enumerate(lines):
    stripped = line.strip()
    # Find large function/component definitions
    if stripped.startswith('function ') or (stripped.startswith('const ') and '=>' in stripped and '{' in stripped):
        print(f"L{i+1}: {stripped[:100]}")
    # Find return( statements in component  
    if stripped == 'return (' or stripped == 'return(':
        # Count indent level
        indent = len(line) - len(line.lstrip())
        print(f"  -> return() at L{i+1}, indent={indent}")

print("\n=== Large JSX blocks (lines with deep nesting) ===")
# Find lines that are pure JSX render returns  
in_render = False
render_start = 0
brace_depth = 0
for i, line in enumerate(lines[1310:], 1311):
    if '  return (' == line.rstrip() or '  return(' == line.rstrip():
        in_render = True
        render_start = i
        print(f"Main render starts at L{i}")
        break

print("\n=== Key section markers ===")
sections = []
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith('// ─') or stripped.startswith('// ==') or stripped.startswith('// --'):
        sections.append((i+1, stripped[:80]))
        
for line_no, text in sections:
    print(f"L{line_no}: {text}")
