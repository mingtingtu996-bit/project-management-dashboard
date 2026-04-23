import sys
import re
sys.stdout.reconfigure(encoding='utf-8')

with open('client/src/pages/GanttView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
    lines = content.split('\n')

# Strategy: find JSX attribute patterns where a template literal contains another template literal
# Pattern: className={`...`...`} or similar JSX attribute with nested backticks
# 
# More robust: scan all template literals and check if they're nested

# Actually let's find all lines where within a JSX attribute expression {`...`},
# there's ANOTHER backtick inside the ${} interpolation

results = []
for i, line in enumerate(lines, 1):
    # Look for pattern: ={`...${...`...`...}...`} 
    # Simplified: any line in JSX that has pattern ={` with more backticks inside
    stripped = line.strip()
    
    # Count backtick chars
    bt_count = line.count('`')
    if bt_count >= 4:
        results.append((i, bt_count, line.rstrip()))
    elif bt_count == 3:
        # Could be multiline expression or actual nested
        results.append((i, bt_count, line.rstrip()))

print(f'Lines with 3+ backticks ({len(results)} total):')
for r in results:
    print(f'  Line {r[0]} ({r[1]} backticks): {r[2][:150]}')

# Also look for specific JSX attribute pattern with nested template literal
print('\n=== Checking for nested template literal in JSX attributes ===')
# Pattern: ={`...${expr ? `...` : ...}...`}
nested_pattern = re.compile(r'=\{`[^`]*\$\{[^}]*`[^`]*`')
for i, line in enumerate(lines, 1):
    if nested_pattern.search(line):
        print(f'  Line {i}: {line.rstrip()[:200]}')
