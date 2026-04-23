# Claude Code 项目指引

## 当前任务

按 `EXECUTION_PROGRESS.json` 的当前步骤推进对应阶段方案；不要跳阶段，也不要混用不同方案文件。

## 执行入口

- **1.x-7.x / 主线 Phase 8 方案文件**：`v1收尾阶段实施方案_执行版_20260406.md`
- **8.1 / 8.2b / 8.4-8.6 专项方案文件**：`v1收尾阶段后续专项方案_20260406.md`
- **9.x / 10.x 结束阶段方案文件**：`v1结束阶段最终执行方案_20260406.md`
- **10.1 / 10.2a-g / 10.8a-c / 10.9 / 10.10 / 10.10a 业务流程优化实施步骤**：`业务流程优化实施专项方案.md`
- **10.3-10.7 施工图纸/证照管理步骤**：`v1结束阶段最终执行方案_20260406.md` + 对应专项方案
- **11.x 关键路径专项方案文件**：`关键路径改造专项方案_20260407.md`
- **12.x 前期证照专项方案文件**：`前期证照实施专项方案_20260408.md`
- **13.x 验收流程轴专项方案文件**：`验收流程轴实施专项方案_20260408.md`
- **14.x 页面/导航收口实施步骤**：`页面导航收口实施专项方案.md`
- **15.x 计划编制实施步骤**：`计划编制实施专项方案.md`
- **进度文件**：`EXECUTION_PROGRESS.json`

## 每次会话启动流程

1. **读取** `EXECUTION_PROGRESS.json`，确定当前进度
2. 先读取 `execution_order / current_execution_scope / execution_policy / parent_steps`：
   - `execution_order` 是当前自动执行的唯一权威队列
   - `current_execution_scope.excluded_prefixes` 命中的步骤属于平行专项轨道，当前会话跳过
   - `execution_policy` 定义连续执行、暂停条件与提问边界
   - `parent_steps` 只做状态汇总，不是直接执行单元
3. 如果 `execution_order` 中有步骤处于 `in_progress`，优先继续该叶子步骤；不要跳到更高阶段
3. **根据步骤编号选择方案文件**：
   - `1.x-7.x` 与主线 `8.0-8.3`：`v1收尾阶段实施方案_执行版_20260406.md`
   - `8.1.x / 8.2b.x / 8.4.x / 8.5.x / 8.6.x`：`v1收尾阶段后续专项方案_20260406.md`
   - `9.x / 10.0 / 10.3-10.7`：`v1结束阶段最终执行方案_20260406.md`
   - `10.1 / 10.2a-g / 10.8a-c / 10.9 / 10.10 / 10.10a`：`业务流程优化实施专项方案.md`
   - `11.x`：`关键路径改造专项方案_20260407.md`
   - `12.x`：`前期证照实施专项方案_20260408.md`
   - `13.x`：`验收流程轴实施专项方案_20260408.md`
   - `14.x`：`页面导航收口实施专项方案.md`
   - `15.x`：`计划编制实施专项方案.md`
4. **定位**当前叶子步骤：若无 `in_progress`，则从 `execution_order` 中找第一个 `pending` 叶子步骤；不要直接扫描整个 `steps` 去找第一个 `pending`
5. **执行**该叶子步骤，完成后立即更新 `EXECUTION_PROGRESS.json`
6. 若 `execution_policy.auto_continue = true` 且未命中 `stop_conditions`，则自动进入下一个叶子步骤；不要在每完成一步后询问“是否继续”
7. 父步骤仅在其全部子步骤完成后再汇总更新状态，不作为当前会话的直接执行目标
8. 优先连续执行到：`当前父步骤完成` 或 `已连续完成 3 个叶子步骤`；只有命中 `stop_conditions` 才暂停
9. 继续下一步，直到当前 Phase 结束或上下文接近上限

## 执行规则

- 严格按方案文件的步骤顺序执行，不跳阶段
- 当前自动执行范围仅限 `EXECUTION_PROGRESS.json.execution_order` 中列出的叶子步骤；`steps` 中存在但不在该队列里的 `pending` 项，视为平行专项轨道或后续阶段，不主动进入
- 默认连续执行，不在每个叶子步骤完成后征求“是否继续”；仅在 `EXECUTION_PROGRESS.json.execution_policy.ask_user_only_when` 命中的场景下才向用户提问
- 只有当前一阶段已无需要继续执行的 `pending / in_progress` 步骤时，才允许进入下一阶段
- 每完成一步，必须更新 `EXECUTION_PROGRESS.json`
- 遇到“停止”条件时，标记该步为 `blocked`，记录原因，继续下一步
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

