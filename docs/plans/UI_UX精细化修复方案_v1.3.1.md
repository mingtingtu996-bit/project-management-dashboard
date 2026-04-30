# v1.3.1.1 — UI/UX 精细化修复方案（修订执行版）

## 修订说明

本文件由原 `v1.3.1 — UI/UX 精细化修复方案（精确执行版）` 修订而来。原文件列出的问题方向大多属实，但存在统计过期、局部重复、部分条目互相冲突、测试门禁不足的问题；本版按当前仓库代码重新校正。

**当前状态**：已按本修订版实施完成，本地待提交/待部署复验。

**最终验证记录**：

- `npx tsc -p client/tsconfig.json --noEmit`：通过。
- `npx vitest run --config vitest.config.ts`（client）：83 个测试文件、461 个测试全部通过。
- `rg -n -g "*.tsx" -- "green-[0-9]|purple-|violet-|teal-|cyan-|text-slate-400" client/src`：0 命中。
- 乱码特征扫描（`client/src` 与本计划文件）：0 命中。
- `git diff --check`：无内容级 diff 错误，仅剩当前仓库 Windows 换行提示。

**执行边界**：

- 仅前端改动。
- 不改后端接口。
- 不改路由结构。
- 不提交或推送本文件，除非用户另行明确要求。

**当前代码审计快照（2026-04-29，本地工作树）**：

| 项目 | 当前结果 | 结论 |
|------|----------|------|
| `npx tsc -p client/tsconfig.json --noEmit` | 通过 | 当前基线类型可用 |
| `text-slate-400` | 249 处 / 74 文件 | 原计划 151 处 / 50 文件已过期，需重新按规则筛选 |
| `green-[0-9]` | 59 处 / 20 文件 | 原计划 41 处 / 21 文件已过期 |
| `purple-*` | 31 处 / 10 文件 | 原计划 14 处 / 5 文件已过期 |
| `violet-*` | 31 处 / 10 文件 | 原计划 13 处 / 9 文件已过期 |
| `teal-*` | 1 处 / 1 文件 | 原计划判断基本属实 |
| `cyan-*` | 76 处 / 25 文件 | 原计划“1 处 / 清理后 0”不属实，需单独处理 |

## 已解决的方案冲突

- `GanttView loadProjectMembers`：原 Phase 2.3 要加 toast，原 Phase 6.1 又把同一位置列为 KEEP SILENT。本版判定为 **ADD TOAST**，因为该加载发生在任务/条件/强制满足等用户操作上下文中，失败应可感知。
- `BaselineBottomBar 禁用按钮 tooltip`：原 5.7 与 2.7 重复。本版只保留在 2.7。
- `OnboardingGuide 增加第 6 步`：原 5.2 已判定重复。本版移入“不执行项”，不再作为执行步骤。
- `Button disabled cursor`：原 5.8 先写要改、后写保持现状。本版明确为不执行项。
- `DialogDescription 默认 sr-only`：原 6.6 为保持现状。本版移入不执行项。
- `cyan-*`：原计划只处理 `BaselineBottomBar` 1 处。本版改为独立调色板收口步骤，不能再用“清理后 0”作为 Phase 2.7 的自然结果。

## 不执行项

| 原编号 | 决策 | 原因 |
|--------|------|------|
| 5.2 | 不执行 | 现有 `guideSteps[2]` 已覆盖 planning onboarding target，新增第 6 步会重复指向同一 DOM |
| 5.7 | 合并到 2.7 | 与 `BaselineBottomBar` 禁用按钮 tooltip 重复 |
| 5.8 | 不执行 | `disabled:pointer-events-none` 是当前 Button 约定；如需 tooltip，由外层 trigger 承担 |
| 6.6 | 不执行 | `DialogDescription` 默认 `sr-only` 保持；个别需要可见描述时在调用处覆盖 |

## Phase 0：实施前基线与测试补强

### 0.1 生成当前 UI 违规清单

执行并保存输出到本地日志，不提交：

```powershell
rg -n -g "*.tsx" -- "text-slate-400" client/src
rg -n -g "*.tsx" -- "green-[0-9]|purple-|violet-|teal-|cyan-" client/src
rg -n -- "focus:ring|rounded-2xl|CardDescription|totalAttentionCount" client/src/components client/src/pages
```

### 0.2 先补测试骨架

新增或扩展以下测试，允许先写 failing contract，再实施修复：

- `client/src/components/ui/__tests__/button.test.tsx`：Button 圆角、loading/disabled、focus-visible。
- 新增 `client/src/components/ui/__tests__/card.test.tsx`：`CardDescription` 必须渲染文本，Card variants 使用 elevation token。
- 新增 `client/src/components/ui/__tests__/dialog-select.test.tsx`：Dialog close 44px，SelectTrigger 使用 `focus-visible`。
- `client/src/pages/__tests__/Notifications.test.tsx`：通知操作失败 toast。
- `client/src/pages/__tests__/Materials.test.tsx`：批量输入 aria-label。
- `client/src/pages/__tests__/Dashboard.test.tsx`：无真实时间序列时不渲染伪 sparkline；TodayLive 空状态文案。
- `client/src/pages/__tests__/PlanningWorkspace.test.tsx`：共享链接 Badge 中文化。
- `client/src/components/__tests__/OnboardingGuide.test.tsx`：有 currentProject 时工作流步骤为链接。

## Phase 1：全局基础组件与 token 修复

### 1.1 修复主按钮 hover 色

- **文件**：`client/src/index.css`
- **当前**：`--brand-primary-hover: #2563EB`
- **改动**：改为 `--brand-primary-hover: #1D4ED8`
- **测试**：source contract 断言变量值。

### 1.2 Card elevation token 与 variant 区分

- **文件**：`client/src/components/ui/card.tsx`
- **当前**：`shadow-sm / shadow-md / shadow-lg`，未使用 `--el-*`；`metric` 未加左侧蓝色识别条。
- **改动**：
  - `default`：`shadow-[var(--el-1)] hover:shadow-[var(--el-2)]`
  - `surface`：`shadow-[var(--el-1)] hover:shadow-[var(--el-2)] bg-white/95 backdrop-blur-sm`
  - `metric`：`shadow-[var(--el-1)] hover:shadow-[var(--el-2)] border-l-4 border-l-blue-500`
  - `detail`：`shadow-[var(--el-2)] hover:shadow-[var(--el-3)]`
  - `CardHeader/CardContent/CardFooter`：`p-6` 改为 `p-5`
- **测试**：`card.test.tsx` 断言 variants class 包含 `var(--el-*)` 与 `border-l-blue-500`。

### 1.3 CardDescription 空实现修复

- **文件**：`client/src/components/ui/card.tsx`
- **当前**：`(_props, _ref) => null`
- **改动**：正常渲染 `<p ref={ref} className={cn('text-sm text-slate-500', className)} {...props} />`
- **测试**：渲染 `<CardDescription>说明</CardDescription>` 后文本可见。

### 1.4 OfflineBanner 宽度对齐

- **文件**：`client/src/components/OfflineBanner.tsx`
- **当前**：`max-w-[1680px]`
- **改动**：改为 `max-w-[1440px]`
- **测试**：source contract。

### 1.5 Dialog 关闭按钮触摸目标

- **文件**：`client/src/components/ui/dialog.tsx`
- **当前**：关闭按钮无 44px 最小触摸目标，且仍用 `focus:ring`。
- **改动**：关闭按钮增加 `min-h-[44px] min-w-[44px] flex items-center justify-center`，focus 改为 `focus-visible:*`。
- **测试**：`dialog-select.test.tsx` 断言 close button class。

### 1.6 Sidebar 风险 badge 数据源修复

- **文件**：`client/src/components/layout/Sidebar.tsx`
- **当前**：`notifications` 与 `risks` 都读 `totalAttentionCount`。
- **改动**：`risks` 读取 `attentionSnapshot.activeRiskCount`。
- **测试**：新增 source contract 或组件测试，构造 `totalAttentionCount !== activeRiskCount` 时风险 badge 显示 active risk。

### 1.7 `text-slate-400` 对比度修复

- **当前**：249 处 / 74 文件。
- **目标**：实施后重新统计，最终 `text-slate-400` 仅允许保留在装饰图标、空状态占位、趋势符号、已有 hover 变色按钮和明确禁用态中。
- **改动规则**：
  - 文本标签、helper text、日期、WBS 编码、人员、列表序号、section eyebrow：改为 `text-slate-500`。
  - 主要正文或需要读数的表格单元：改为 `text-slate-600`。
  - 装饰图标、占位空状态、禁用态：可保留 `text-slate-400`。
- **测试**：新增 allowlist 文件或测试内 allowlist；不能只用总数阈值。

### 1.8 Button 圆角修正

- **文件**：`client/src/components/ui/button.tsx`
- **当前**：base class 为 `rounded-2xl`。
- **改动**：改为 `rounded-xl`；`link` variant 保持 `rounded-none`。
- **测试**：`button.test.tsx` 断言默认按钮包含 `rounded-xl` 且不包含 `rounded-2xl`。

## Phase 2：交互失败反馈与可访问性修复

### 2.1 Notifications 用户操作失败 toast

- **文件**：`client/src/pages/Notifications.tsx`
- **当前**：acknowledge/mute/batch/read-all catch 仅 `console.error`。
- **改动**：
  - 确认通知失败：`确认通知失败，请重试`
  - 静音通知失败：`静音通知失败，请重试`
  - 批量确认失败：`批量确认失败，请重试`
  - 批量静音失败：`批量静音失败，请重试`
  - 全部标记已读失败：`全部标记已读失败，请重试`
- **测试**：mock API reject，断言 destructive toast title。

### 2.2 DrawingsPage 静默加载失败 toast

- **文件**：`client/src/pages/Drawings/DrawingsPage.tsx`
- **当前**：board/ledger/package detail/version rows catch 只记录 console 或返回空值。
- **改动**：用户主动可见加载失败时 toast `加载图纸数据失败`；AbortError 不 toast。
- **测试**：扩展 Drawings 相关测试，mock 非 abort 失败。

### 2.3 GanttView loadProjectMembers 失败 toast

- **文件**：`client/src/pages/GanttView.tsx`
- **当前**：catch 只 `console.warn`。
- **改动**：非 AbortError 时 toast `加载项目成员失败`。
- **测试**：source contract 或组件测试覆盖该 catch 逻辑。

### 2.4 AcceptanceTimeline 筛选器折叠

- **文件**：`client/src/pages/AcceptanceTimeline.tsx`
- **当前**：7 个筛选项全部展开。
- **改动**：默认显示范围/楼栋/阶段/状态；阻塞/即将到期/时间尺度进入 `CollapsibleSection`，默认折叠，按钮文字 `更多筛选(3)`。
- **测试**：页面测试断言默认仅 4 个主筛选可见，点击后 3 个高级筛选出现。

### 2.5 Materials 批量输入 aria-label

- **文件**：`client/src/pages/Materials.tsx`
- **当前**：批量输入区 input/select/checkbox 缺少可访问名称。
- **改动**：
  - 材料名称：`aria-label="材料名称"`
  - 专业：`aria-label="专业"`
  - 单位：`aria-label="单位"`
  - 进场日期：`aria-label="进场日期"`
  - 取样数量/取样确认：按真实字段使用 `aria-label="取样确认"`
  - 检验批次/送检确认：按真实字段使用 `aria-label="送检确认"`
- **测试**：`Materials.test.tsx` 使用 `getByLabelText`。

### 2.6 TemplateCard 菜单键盘支持

- **文件**：`client/src/pages/WBSTemplates/components/TemplateCard.tsx`
- **当前**：菜单 backdrop 是不可聚焦 div，只能点击关闭。
- **修订方案**：不要给 backdrop 增加无语义 `role="button"`。改为：
  - 菜单触发按钮增加 `aria-haspopup="menu"`、`aria-expanded`、`aria-label="更多操作"`。
  - 菜单打开时在容器或触发按钮上处理 `Escape` 关闭。
  - 菜单项继续使用真实 `Button`。
- **测试**：`WBSTemplates.test.tsx` 按 Escape 后菜单关闭。

### 2.7 BaselineBottomBar CTA 层级与 tooltip

- **文件**：`client/src/pages/planning/components/BaselineBottomBar.tsx`
- **当前**：保存草稿使用 cyan CTA，确认基线使用 emerald CTA。
- **改动**：
  - 保存草稿：`bg-white border border-slate-300 text-slate-700 hover:bg-slate-50`
  - 确认基线：`bg-blue-600 text-white hover:bg-blue-500`
  - 禁用确认时用 Tooltip 说明 `请先保存草稿`
- **测试**：planning shared UI 测试断言 CTA class 与 tooltip 文案。

## Phase 3：调色板收口

### 3.1 green / purple / violet / teal 收口

- **当前**：
  - `green-[0-9]`：59 处 / 20 文件。
  - `purple-*`：31 处 / 10 文件。
  - `violet-*`：31 处 / 10 文件。
  - `teal-*`：1 处 / 1 文件。
- **映射规则**：
  - `green-*` 表示成功/完成/通过：统一改为 `emerald-*`。
  - `purple-*`：
    - 风险/活跃风险语义：改为 `red-*`。
    - 合并/确认/普通强调：改为 `blue-*`。
    - 单位类型/汇总进度/AI 推荐：改为 `blue-*`。
  - `violet-*`：默认改为 `indigo-*`，如语义实际为主操作则改为 `blue-*`。
  - `teal-*`：`from-emerald-50 to-teal-50` 改为 `from-emerald-50 to-emerald-100`。
- **测试**：source contract 断言生产代码中无 `green-[0-9]`、`purple-`、`violet-`、`teal-`。测试文件中的 fixture 如需保留，必须进入 allowlist。

### 3.2 cyan 收口（新增修订项）

- **当前**：76 处 / 25 文件，主要在 planning 相关页面和组件，不是原计划所说的 1 处。
- **映射规则**：
  - 主要 CTA 或执行按钮：`cyan-*` 改为 `blue-*`。
  - 信息型底色/边框：`cyan-50/100/200/300` 改为 `blue-50/100/200/300` 或 `slate-*`，按是否表达“主信息”判断。
  - 计划治理、异常、差异等需要提示但非主操作的区域：优先 `amber-*` 或 `slate-*`，不要继续用 cyan 表达语义。
  - 图表系列色如确需保留，必须迁移到统一 chart token，不直接写 Tailwind cyan class。
- **测试**：source contract 断言生产代码中无 `cyan-`；若存在 chart token 例外，写明 allowlist。

## Phase 4：信息架构与数据展示修复

### 4.1 Dashboard Sparkline 数据修正

- **文件**：`client/src/pages/Dashboard.tsx`
- **当前**：4 个 sparkline 用不相关分类值拼接，且无条件渲染。
- **改动**：
  - 不新增后端字段。
  - 如果现有 `summaryData` 没有真实时间序列字段，则 `sparkline: []`。
  - 渲染处改为 `{metric.sparkline.length > 1 && <Sparkline ... />}`。
  - 保留 TODO：后端后续可补 `trendHistory/dailySnapshots`。
- **测试**：Dashboard 测试断言无真实序列时不渲染趋势微图。

### 4.2 Dashboard Hero Badge 语义色

- **文件**：`client/src/pages/Dashboard.tsx`
- **改动**：
  - 进度：`>=80` emerald，`60-79` amber，`<60` red。
  - 逾期节点：有逾期 red，无逾期 slate。
  - 交付：保持 slate 信息态。
- **测试**：Dashboard 测试覆盖三档进度和逾期节点。

### 4.3 Dashboard 今日待办趋势硬编码

- **文件**：`client/src/pages/Dashboard.tsx`
- **当前**：`formatMetricTrend(0)`。
- **改动**：不改后端接口。若当前 summary 类型无 `yesterdayTodoCount`，保持 0 并加清晰 TODO；不要伪造趋势。
- **测试**：source contract 确认没有用其他分类值伪造待办趋势。

### 4.4 RiskManagement PipelineFlow 说明文字

- **文件**：`client/src/pages/RiskManagement.tsx`
- **当前**：已有简短说明，但不包含“下方按类型查看详情”的连接说明。
- **改动**：补充说明：`流程阶段展示风险从识别到监控的处置进度，下方按类型查看详情`。
- **测试**：RiskManagement 测试断言说明文字存在。

### 4.5 PlanningWorkspace 治理面板默认折叠

- **文件**：`client/src/pages/planning/PlanningWorkspace.tsx`
- **当前**：`defaultOpen={false}` 已存在。
- **改动**：保留现状，只补测试验证实际默认折叠。
- **测试**：`PlanningWorkspace.test.tsx` 断言治理内容默认不可见，点击后可见。

### 4.6 PlanningWorkspace 英文 Badge 中文化

- **文件**：`client/src/pages/planning/PlanningWorkspace.tsx`
- **当前**：`Planning shared links / Gantt / Risk / Reports / Closeout`。
- **改动**：
  - `Planning shared links` → `快捷链接`
  - `Gantt` → `甘特图`
  - `Risk` → `风险`
  - `Reports` → `报表`
  - `Closeout` → `关账`
- **测试**：断言英文不再出现，中文出现。

### 4.7 CompanyCockpit 零项目空状态

- **文件**：`client/src/pages/CompanyCockpit.tsx`
- **当前**：直接渲染 `CompanyHero`。
- **改动**：`projects.length === 0` 时显示空状态，提供创建项目入口；有项目时保持现有 `CompanyHero`。
- **测试**：sharedSummary 或 CompanyCockpit 测试覆盖零项目。

## Phase 5：可用性与转化引导修复

### 5.1 OnboardingGuide 工作流步骤可点击

- **文件**：`client/src/components/OnboardingGuide.tsx`
- **当前**：`workflowSteps` 是字符串数组，渲染为静态文本。
- **改动**：
  - 引入 `useStore` 获取 `currentProject?.id`。
  - 引入 `Link`。
  - `workflowSteps` 改为 `{ label, path }[]`。
  - 有 projectId 时渲染 Link；无 projectId 时保留 span。
- **测试**：有 currentProject 时 `Dashboard 查看概况` 等步骤为 link，href 指向当前项目。

### 5.2 DataConfidenceBreakdown 位置提升

- **文件**：`client/src/pages/RiskManagement.tsx`
- **当前**：存在于页面靠后位置的 `数据可靠性`折叠卡。
- **改动**：移动到 Metric Cards 下方，以 inline banner 方式展示；保留折叠能力但提高首屏可见性。
- **测试**：RiskManagement 测试断言 `risk-data-quality-banner` 在主要指标区域之后、列表区之前。

### 5.3 Dashboard TodayLive 空状态引导

- **文件**：`client/src/pages/Dashboard.tsx`
- **当前**：使用通用 EmptyState，文案为 `今日暂无待处理事项`。
- **改动**：改为内联空状态：
  - 标题：`今日事项已全部处理`
  - 描述：`干得漂亮！`
  - 图标：`CheckCircle`，`text-emerald-400`
- **测试**：Dashboard 测试覆盖 0 todo。

### 5.4 GanttView 筛选器折叠提示

- **文件**：`client/src/pages/GanttView.tsx`
- **当前**：已有 `点击展开筛选` 文本，但缺少图标和 active filter dot 的完整提示结构。
- **改动**：折叠态按钮显示 Filter 图标、`点击展开筛选`、activeFilterCount > 0 时显示蓝点。
- **测试**：source contract 或页面测试覆盖 active filter 时蓝点存在。

## Phase 6：二次审计项

### 6.1 静默错误 toast 收口

- **目标**：只对用户可感知操作失败加 toast；框架级、自动刷新、已有 fallback 的加载失败可保持静默。
- **ADD TOAST 必做**：
  - `CompanyCockpit.tsx` 公司数据加载失败：`加载公司数据失败`。
  - `PreMilestoneDependenciesDialog.tsx` 创建依赖失败：`创建依赖失败`。
  - `PreMilestoneDependenciesDialog.tsx` 删除依赖失败：`删除依赖失败`。
  - Phase 2 中 Notifications / DrawingsPage / GanttView 三类失败。
- **已有 toast 的条目**：实施时必须逐项确认；确认已有则不重复添加。
- **KEEP SILENT**：AbortError、后台刷新、已有明确 fallback UI 且非用户主动触发的加载。
- **测试**：对新增 toast 的三个文件补测试；不得只依赖人工检查。

### 6.2 ChangePasswordDialog label/htmlFor

- **文件**：`client/src/components/ChangePasswordDialog.tsx`
- **当前**：错误文本有 id，但 input 缺少稳定 id 与 label htmlFor。
- **改动**：
  - old password：`change-pwd-old`
  - new password：`change-pwd-new`
  - confirm password：`change-pwd-confirm`
- **测试**：组件测试用 `getByLabelText` 找到三个输入框。

### 6.3 EditProfileDialog label/htmlFor

- **文件**：`client/src/components/EditProfileDialog.tsx`
- **改动**：
  - username：`edit-profile-username`
  - display name：`edit-profile-displayname`
  - email：`edit-profile-email`
- **测试**：组件测试用 `getByLabelText` 找到三个输入框。

### 6.4 SelectTrigger focus-visible

- **文件**：`client/src/components/ui/select.tsx`
- **当前**：`focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`
- **改动**：改为 `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`
- **测试**：source contract 断言 `focus:ring` 不存在，`focus-visible:ring` 存在。

### 6.5 图标按钮 aria-label 补全

- **范围**：主要检查 `Sidebar.tsx`、`GanttView*.tsx`、`TemplateCard.tsx`。
- **执行方式**：
  - 搜索只有图标、无文本、无 tooltip trigger 文本的 `<Button>` / `<button>`。
  - 优先补 `aria-label`；已有可见文本或 `aria-labelledby` 的不重复加。
  - 手写 SVG 图标按钮应同步考虑替换为 Lucide 图标。
- **测试**：新增 accessibility source contract，禁止裸图标按钮。

## 最终验证门禁

实施完成后必须全部通过：

```powershell
npx tsc -p client/tsconfig.json --noEmit
npx vitest run --config client/vitest.config.ts
```

新增/更新的 UI contract 必须验证：

```powershell
rg -n -g "*.tsx" -- "green-[0-9]|purple-|violet-|teal-|cyan-" client/src
rg -n -- "focus:ring" client/src/components/ui/select.tsx
rg -n -- "rounded-2xl" client/src/components/ui/button.tsx
rg -n -- "=> null" client/src/components/ui/card.tsx
```

预期：

- 生产代码无 `green-[0-9]`、`purple-`、`violet-`、`teal-`、`cyan-`，除非测试 allowlist 明确说明。
- `select.tsx` 无 `focus:ring`，只有 `focus-visible:ring`。
- `button.tsx` 默认圆角为 `rounded-xl`。
- `CardDescription` 不再返回 null。
- Dashboard 不再渲染伪时间序列 sparkline。
- 新增 toast、label、aria-label、中文化、空状态都有自动化断言。

## 实施顺序

| Phase | 内容 | 风险 | 依赖 |
|-------|------|------|------|
| 0 | 基线与测试骨架 | 低 | 无 |
| 1 | 基础组件/token | 中 | 先做，影响面最大 |
| 2 | 交互反馈/可访问性 | 低 | Phase 1 后 |
| 3 | 调色板收口 | 中 | Phase 2.7 后，需按当前清单执行 |
| 4 | 信息架构 | 中 | Phase 1 后 |
| 5 | 可用性引导 | 低 | Phase 1 后 |
| 6 | 二次审计项 | 低 | 可与 Phase 2/5 合并实施 |

**暂停条件**：

- 发现需要后端新增字段或修改 API。
- 调色板清理导致设计语义无法判断。
- 测试显示现有行为依赖旧样式或旧文案。
- 任何步骤触及路由结构。
