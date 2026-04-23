import sys
import re
sys.stdout.reconfigure(encoding='utf-8')

with open('client/src/pages/GanttView.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find lines in JSX attributes that have nested backticks: {...`...`...`...`...}
for i, line in enumerate(lines, 1):
    # Pattern: className={`...${...`...`...}...`}
    # Simple detection: a line that has 4 backticks  
    count = line.count('`')
    if count >= 4:
        print(f'Line {i} ({count} backticks): {line.rstrip()}')
    # Or 3 backticks (outer template + 1 nested opening)
    elif count == 3:
        print(f'Line {i} ({count} backticks): {line.rstrip()}')
