import re

input_file = r'c:\Users\jjj64\WorkBuddy\20260318232610\server\migrations\CLEAN_MIGRATION.sql'
output_file = r'c:\Users\jjj64\WorkBuddy\20260318232610\server\migrations\CLEAN_MIGRATION_V2.sql'

with open(input_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace DROP POLICY IF EXISTS with safe version
def replace_drop_policy(m):
    policy_name = m.group(1)
    table_name = m.group(2).strip().rstrip(';')
    return 'DO $$ BEGIN DROP POLICY "{}" ON {}; EXCEPTION WHEN undefined_object THEN NULL; END $$;'.format(policy_name, table_name)

pattern = r'DROP POLICY IF EXISTS "([^"]+)" ON ([^;]+);'
new_content = re.sub(pattern, replace_drop_policy, content)

count_before = content.count('DROP POLICY IF EXISTS')
count_after = new_content.count('DROP POLICY IF EXISTS')

with open(output_file, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Replaced: {}, Remaining: {}'.format(count_before, count_after))
print('Output file: {}'.format(output_file))
print('File size: {} bytes'.format(len(new_content.encode('utf-8'))))
