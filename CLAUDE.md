# Claude Code 项目指引

## 当前任务

正在执行 v1 收尾阶段实施方案，目标是按顺序完成 8 个 Phase、~30 个步骤的代码清理与修复。

## 执行入口

- **方案文件**：`v1收尾阶段实施方案_执行版_20260406.md`
- **进度文件**：`EXECUTION_PROGRESS.json`

## 每次会话启动流程

1. **读取** `EXECUTION_PROGRESS.json`，确定当前进度
2. 如果有步骤处于 `in_progress`，先运行该步的验证命令确认是否已完成
3. **定位**第一个 `pending` 步骤，读取方案文件中对应内容
4. **执行**该步骤，完成后立即更新 `EXECUTION_PROGRESS.json`
5. 继续下一步，直到 Phase 结束或上下文接近上限

## 执行规则

- 严格按方案文件的步骤顺序执行，不跳阶段
- 每完成一步，必须更新 `EXECUTION_PROGRESS.json`
- 遇到"停止"条件时，标记该步为 `blocked`，记录原因，继续下一步
- 有 `前置步骤` 字段的步骤，先检查前置是否 `completed`
- 读取大文件优先用 `rg` 定位关键行，不全文读取
- 每完成一个 Phase 后评估上下文量，必要时结束会话

## 默认工作目录

```
C:\Users\jjj64\WorkBuddy\20260318232610
```

## 通用验证命令

```powershell
# 前端
npx tsc -p client/tsconfig.json --noEmit
npx vitest run --config client/vitest.config.ts

# 后端
npx tsc -p server/tsconfig.json --noEmit
npx vitest run --config server/vitest.config.ts
```
