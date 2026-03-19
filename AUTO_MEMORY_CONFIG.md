# 自动记忆配置

## 启用状态: ✅ 已启用

## 触发规则

| 触发场景 | 记录类型 | 示例 |
|---------|---------|------|
| AI说"我决定使用X" | 技术决策 | "决定使用 React + TypeScript" |
| AI说"已完成X功能" | 项目进展 | "已完成登录功能" |
| AI说"遇到X错误" | 问题解决 | "遇到 CORS 错误，已解决" |
| AI说"我们约定X" | 项目约定 | "约定文件名用 PascalCase" |
| 生成配置文件 | 配置信息 | 创建 .env、package.json |

## 快照设置

- **快照目录**: `.project-snapshots/`
- **快照格式**: `snapshot_YYYYMMDD_HHMMSS.json`
- **手动运行**: `python auto-snapshot.py <project_path>`

## Git 钩子

- **pre-commit**: 提交前生成项目状态
- **post-commit**: 提交后自动创建快照

## 记忆存储

- **长期记忆**: PROJECT_CONTEXT.md
- **短期记忆**: 每次会话的记忆更新
- **快照历史**: .project-snapshots/

---

*此配置由 AI 自动管理*
