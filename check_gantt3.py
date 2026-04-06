import sys
sys.stdout.reconfigure(encoding='utf-8')

# 测试策略：读取文件，逐渐截断，找出哪行之后esbuild开始报错
# 先用纯语法检查——找出是否有模板字符串内的非法字符

with open('client/src/pages/GanttView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')

# 查找所有模板字符串（包含反引号的行）
print('=== Lines with backticks ===')
for i, line in enumerate(lines, 1):
    if '`' in line:
        count = line.count('`')
        print(f'Line {i} ({count} backticks): {line[:120]}')
