import re

input_file = r'c:\Users\jjj64\WorkBuddy\20260318232610\server\migrations\CLEAN_MIGRATION_V2.sql'
output_file = r'c:\Users\jjj64\WorkBuddy\20260318232610\server\migrations\CLEAN_MIGRATION_V3.sql'

with open(input_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove inline COMMENT '...' syntax (MySQL-style, not valid in PostgreSQL)
# Pattern: COMMENT '...' at end of column definition line
# We just strip the COMMENT part, keeping the rest of the line
pattern = r"\s+COMMENT\s+'[^']*'"
new_content = re.sub(pattern, '', content)

count = len(re.findall(r"COMMENT\s+'", content))
remaining = len(re.findall(r"COMMENT\s+'", new_content))

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f'Removed inline COMMENTs: {count}')
print(f'Remaining: {remaining}')
print(f'File size: {len(new_content)} chars')
