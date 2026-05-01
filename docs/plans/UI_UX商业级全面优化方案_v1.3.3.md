# UI/UX 商业级全面优化方案 v1.3.3

## 修订说明

本文件承接 `UI_UX商业级全面优化方案_v1.3.2.md`，用于收口 v1.3.2 修复后仍存在的结构性落差。

本版不再只按截图或页面观感复核，而是按当前代码基线做生产源码审计。核心目标是把 v1.3 的设计原则落成可执行规则：Token 化、组件 SSOT、极值容错、键盘与异步交互一致性。

## 审计口径

- 审计日期：2026-05-01
- 范围：`client/src`
- 排除：`**/__tests__/**`
- 计数方式：`rg` 静态扫描 + 重点位置人工复核
- 说明：`任意 px`、`.map()`、`focus:*` 等扫描结果包含部分合理使用场景，因此本文件同时给出“扫描命中数”和“确认需要治理数”。

## 总体裁决

| 类别 | 结论 | 数量口径 | 优先级 |
|---|---:|---:|---|
| Token 化残留 | 属实 | 任意 px 166 处；重点 layout magic number 17 处；TS/TSX HEX 160 处；CSS 非 token 直接样式 8 处 | P1 |
| SSOT 断层 | 属实且最影响后续维护 | 卡片体系 4 套；`card-*` 命中 48 处；`Card + card-unified` 19 处；手写 card surface 138 处；MetricCard 8 套 | P0 |
| 极值与容错 | 属实，原报告数量需校正 | 空态缺失/空白占位确认 6 类；长文本风险 17 个扫描命中、重点确认 10+；数值/百分比裸渲染确认 12 类；null fallback 确认 8 类 | P1 |
| 流转态与微交互 | 属实且影响可用性 | legacy `focus:*` 152 处；`disabled:opacity-30/60` 5 处；`hover:scale-110` 1 处；loading 文案/disabled 命中 43 处；手写 fixed modal/drawer 12 处 | P0 |

## Phase 0：先建立 v1.3.3 基线门禁

### 0.1 保存当前扫描基线

将以下扫描输出保存到 `logs/uiux-v1.3.3/`，作为修复前后对比依据。

```powershell
rg -n "(?:h|w|min-h|min-w|max-h|max-w|top|left|right|bottom|inset|p|px|py|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y)-\[[0-9]+px\]" client/src -g "*.tsx" -g "*.ts" -g "*.css" -g "!**/__tests__/**"
rg -n "#[0-9A-Fa-f]{3,8}\b" client/src -g "*.tsx" -g "*.ts" -g "*.css" -g "!**/__tests__/**"
rg -n "card-unified|card-l1|card-l2|card-l3|border-slate-200.*shadow-sm|shadow-sm.*border-slate-200" client/src -g "*.tsx" -g "*.css" -g "!**/__tests__/**"
rg -n "focus:ring-|focus:outline-none|focus:border-|focus:opacity|disabled:opacity-(30|60)|hover:scale-" client/src -g "*.tsx" -g "*.ts" -g "!**/__tests__/**"
```

### 0.2 增加契约测试

新增或扩展以下测试，允许先写 failing contract：

- `client/src/components/ui/__tests__/card.test.tsx`：Card variants 只使用统一 border/elevation token，不再叠加 `.card-unified`。
- `client/src/components/ui/__tests__/button.test.tsx`：loading spinner、disabled opacity、focus-visible。
- `client/src/components/ui/__tests__/dialog-select.test.tsx`：Dialog 必须具备 Radix focus trap、ESC、aria 语义。
- `client/src/pages/__tests__/uiux-v1-3-3.contract.test.tsx`：禁止新增裸 HEX、禁止新增 `focus:ring-*`、禁止新增 `hover:scale-*`。

## Phase 1：Token 化残留修复

### 1.1 Layout magic number

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| 任意 px Tailwind 扫描命中 | 166 处 / 93 文件 | 弹窗宽度、表格列宽、图表高度、固定栏宽度 | 先分类为 `layout token`、`component size`、`table/grid track`、`允许保留` 四类 |
| v1.3 重点 magic number | 17 处 | `Header.tsx h-[72px]`、`Sidebar.tsx w-[72px]`、`BaselinePage.tsx min-h-[172px]`、`ResponsibilityView.tsx top-[88px]` | 定义 `--header-height`、`--sidebar-collapsed-width`、`--content-max-width`、`--sticky-toolbar-top`、`--dialog-sm/md/lg` |
| `p-8` padding 不一致 | 7 处 / 6 文件 | `CompanyCockpit.tsx`、`DrawingDetailDrawer.tsx`、`WBSTemplates.tsx`、`CertificateLedger.tsx`、`CertificateDetailDrawer.tsx`、`MonitoringDashboard.tsx` | 不归入任意 px magic number，但必须归入 CardContent/空态 padding 不一致治理 |

执行要求：

- `Header` 高度统一使用 `h-[var(--header-height)]`。
- `Sidebar` 收起宽度统一使用 `w-[var(--sidebar-collapsed-width)]`。
- 页面最大宽度统一使用 `.page-shell` 的 `--content-max-width`，不在页面里重复写 `max-w-[1440px]`。
- 表格列宽允许保留像 `w-[110px]` 这类数据表 grid track，但必须集中在表格 schema 或局部常量中。

### 1.2 裸 HEX 色值

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| TS/TSX/CSS HEX 总命中 | 175 处 | 全量扫描 | 不作为全量问题数，因为 `chartPalette.ts` 和 CSS 变量本身允许存 HEX |
| TS/TSX HEX 命中 | 160 处 / 15 文件 | `CriticalPathGraph.tsx`、`TaskTimelineView.tsx`、`Dashboard.tsx`、`Materials.tsx` | 所有图表和 SVG 颜色迁移到 `client/src/lib/chartPalette.ts` |
| 排除 `chartPalette.ts` 后 HEX | 145 处 / 14 文件 | 同上 | 修复目标是降到 0，允许仅 `chartPalette.ts` 保留 |
| `index.css` 非 token 直接样式 | 8 处 | body background/color、skeleton gradient、`.ms-lv1/2/3` | body 改 `@apply bg-background text-foreground`；skeleton 用 slate token；milestone level 用 `@apply border-l-*` |

执行要求：

- 扩展现有 `chartPalette.ts`，不要新建第二套 palette。
- 新增 `CRITICAL_PATH_PALETTE`、`GANTT_BAR_PALETTE`、`ACCEPTANCE_FLOW_PALETTE`、`MATERIAL_CATEGORY_PALETTE`。
- `Sparkline` 默认色改为 `CHART_SERIES.primary`。
- `acceptanceApi.ts` 不再直接输出裸 HEX，改导入 palette 或输出语义 key。

## Phase 2：结构复用 SSOT 收口

### 2.1 Card 系统统一

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| 竞争卡片系统 | 4 套 | `Card` variants、`.card-unified`、`.card-l1/l2/l3`、手写 `border-slate-200 shadow-sm` | 统一到 `Card` variants |
| `.card-unified/.card-l*` 命中 | 48 处 / 19 文件 | `index.css`、`Dashboard.tsx`、`Reports.tsx`、`Materials.tsx` | 删除 `.card-unified/.card-l*` 或仅保留迁移期 alias |
| `<Card className="card-unified ...">` | 19 处 / 12 文件 | `Reports` 图表、`Materials`、`Milestones` | 改为 `<Card variant="surface/detail/metric">` |
| 手写 card surface | 138 处 / 48 文件 | 多页面 `border-slate-200 shadow-sm` | 按语义替换为 `Card`、`Panel`、`TableShell` |

执行要求：

- `Card` 成为唯一 SSOT：`default`、`surface`、`metric`、`detail`、`ghost`。
- `.card-unified`、`.card-l1/l2/l3` 从业务页面移除。
- `shadow-sm` 不作为业务页面 elevation，统一使用 `shadow-[var(--el-*)]`。
- 对表格/列表容器新增 `SurfaceShell` 或 `TableShell`，避免所有容器都伪装成 Card。

### 2.2 CardContent padding

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| 显式 padding override | 至少 38 处 / 26+ 文件 | `p-0/p-4/p-5/p-6/p-8` 混用 | Card 增加 `density` 或 `padding` variant |
| `p-8` | 7 处 / 6 文件 | `CompanyCockpit.tsx:523`、`DrawingDetailDrawer.tsx:93`、`WBSTemplates.tsx:818`、`CertificateLedger.tsx:234/238`、`CertificateDetailDrawer.tsx:332`、`MonitoringDashboard.tsx:91` | 保留在问题清单，作为 padding 不一致和空态过重的一部分修复 |

执行要求：

- `CardContent` 默认 `p-5 pt-0` 保留。
- 业务侧只能使用 `padding="none|sm|md|lg"` 或 Card variant，不再直接写 `p-4/p-6`。
- 图表卡片统一 `padding="none"` + 内部 chart body 自己控制 spacing。

### 2.3 MetricCard 统一

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| 独立 MetricCard 实现 | 8 处 / 7 文件 | `DashboardMetricCards`、`MaterialMetricCard`、`Reports MetricCard`、`ResponsibilityView MetricCard`、`SummaryMetricCard`、`TaskSummary MetricCard`、`WBSTemplates MetricCard` | 新增共享 `MetricCard` / `MetricGrid` |
| props 命名不一致 | 6+ 套 | `label/title`、`trend/hint/detail`、`sparkline/icon` | 统一为 `title`、`value`、`hint`、`trend`、`icon`、`sparkline`、`tone` |

执行要求：

- 共享组件放在 `client/src/components/MetricCard.tsx` 或 `client/src/components/ui/metric-card.tsx`。
- 所有指标值统一走 `formatMetricValue`，百分比统一 clamp 到 `0..100`。
- `sparklineColor` 只接收 palette token key，不接收裸 HEX。

### 2.4 Dialog 系统统一

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| 手写 fixed modal/drawer overlay | 12 处 / 12 文件 | `ChangePasswordDialog`、`EditProfileDialog`、`LoginDialog`、`FeedbackModal`、`ConflictResolutionModal`、`ConditionsDialog`、`MilestoneDialog`、`CertificateDetailDrawer`、`WBSTemplates/*Modal` | 迁移到 Radix `Dialog` 或统一 Drawer primitive |
| 手写 modal/drawer 中有部分 role/aria 但非 Radix | 4 处 | `ChangePasswordDialog`、`EditProfileDialog`、`LoginDialog`、`CertificateDetailDrawer` | 仍缺统一焦点陷阱和一致 ESC 行为，继续迁移 |
| 手写 modal 中无 role/aria | 8 处 | `FeedbackModal`、`ConflictResolutionModal`、`ConditionsDialog`、`MilestoneDialog`、`WBSTemplates/*Modal` | P0 迁移 |

执行要求：

- 所有弹窗使用 `components/ui/dialog.tsx`。
- 复杂弹窗统一 `max-h-[calc(100vh-64px)] overflow-y-auto`。
- 关闭按钮统一 44px 点击区域、`aria-label="关闭对话框"`。
- 保留 `DialogDescription`，无可见说明时使用 `sr-only`。

### 2.5 Section spacing

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| `space-y-4/space-y-6` 混用 | 175 处 / 68 文件 | 页面 shell、CardContent、TabContent、Dialog body 混用 | 建立语义 spacing token |

执行要求：

- 页面级：`page-stack` = `space-y-6`。
- 区块级：`section-stack` = `space-y-4`。
- 表单级：`form-stack` = `space-y-4`。
- 列表项：`list-stack` = `space-y-3`。

## Phase 3：极值边界与容错

### 3.1 EmptyState 与空白占位

| 问题 | 确认数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| `.map()` 机械命中 | 多处 | 大量选项、图例、骨架屏也会命中 | 不作为问题数 |
| 空态缺失或空白占位 | 6 类确认 | `AcceptanceLedger filteredGroups`、`Reports secondarySummaryCards`、`Reports delayStatisticsRows`、`Reports monthlyTrend`、`changeLogSourceSummary`、部分矩阵零数据 | 统一 `EmptyState` |
| 已有空态但表达偏弱 | 4 类确认 | 风险矩阵、问题趋势、材料到场、责任贡献 | 文案补齐筛选/数据口径/清除动作 |

执行要求：

- 所有业务数据列表渲染前必须有 `loading/error/empty/content` 四态。
- 空白 `<div className="... border-dashed ... " />` 禁止作为空态。
- 筛选导致为空时使用 `EmptyState variant="filter"` 并提供清除筛选动作。
- 数据不存在时使用 `EmptyState variant="empty"` 并说明数据来源。

### 3.2 长文本保护

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| 未保护动态文本扫描命中 | 17 处 / 12 文件 | `Notifications item.title/content`、`Materials material_name`、`Reports row.title/risk.title/entry.owner`、`Baseline row.title` | 按容器加 `min-w-0 truncate` 或 `line-clamp-2` |
| 重点确认需修复字段 | 10+ 字段 | 通知标题/内容、材料名称、延期统计标题、近期问题标题、重点风险标题、责任主体 label、健康热力状态 label | Tooltip 显示完整文本 |

执行要求：

- 单行标题：`min-w-0 truncate`。
- 描述正文：`line-clamp-2`，详情视图再展开。
- 表格单元格：外层 `max-w-* min-w-0`，内容 `truncate`。
- Tooltip 只展示完整原文，不重复解释功能。

### 3.3 数值、百分比、NaN 防护

| 问题 | 确认数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| 裸数字/百分比 | 12 类确认 | `CompanyHero`、`CompanyHealthHeatmap`、`Materials MetricCard/MiniMetric`、`Reports DetailStatCard`、`Milestones`、`GanttViewRowSections` | `formatMetricValue` + `clampPercent` |
| 进度条 width 已 clamp 但显示未 clamp | 2 处 | `CompanyHealthHeatmap item.progress`、`CompanyHero healthHistory.thisMonth` | 文字和 style 共用同一个 normalized value |
| 可能出现 NaN/undefined | 8 类确认 | `Reports row.delayDays/owner`、`Dashboard t.title`、`ResponsibilityView task assignee/unit/status_label` | `safeNumber`、`safeText`、`?? '--'` |

执行要求：

- 新增或复用 `formatNumber`、`formatPercent`、`clampPercent`。
- 所有 progress bar 的文字和 width 使用同一 normalized value。
- 数字缺失显示 `--`，不要显示 `undefined`、`NaN`、空字符串。
- 关键 KPI 可继续使用 `AnimatedNumber`，但格式化必须先做。

## Phase 4：流转态与微交互

### 4.1 focus-visible

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| legacy `focus:*` 扫描命中 | 152 处 / 28 文件 | `ChangePasswordDialog`、`MilestoneDialog`、`ConditionsDialog`、`CertificateWorkItemDialog`、`RiskManagement`、`BaselineRevisionActions` | 替换为 `focus-visible:*` |
| `outline-none/ring-0` 且无可见焦点 | 重点确认 15+ | 风险/验收/基线相关 input textarea | 补 `focus-visible:ring-2 focus-visible:ring-blue-500` |

执行要求：

- 鼠标点击不强制出现 ring，键盘聚焦必须出现。
- 基础组件 `Input/Textarea/Select/Button/Tabs/DialogClose` 保持 `focus-visible`。
- 业务手写 input 全部迁移到基础组件；无法迁移时按同一 className 模板补齐。

### 4.2 disabled 状态

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| `disabled:opacity-30` | 1 处 | `AcceptanceTimeline.tsx` | 改 `disabled:opacity-50` |
| `disabled:opacity-60` | 4 处 | `GanttViewPanels.tsx`、`BaselinePage.tsx` 3 处 | 改 `disabled:opacity-50` |

执行要求：

- 全站 disabled opacity 统一 `disabled:opacity-50`。
- 对需要说明原因的 disabled 操作，用 `DisabledReasonTooltip` 包裹，不用降低更多透明度表达原因。

### 4.3 异步按钮 loading

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| loading/disabled/文案切换扫描命中 | 43 处 / 15 文件 | `Materials`、`GanttViewDialogs`、`ScopeDimensionsDialog`、`ParticipantUnitsDialog`、`ProjectInfoCard`、`AcceptanceDetailDrawer` | 提交类按钮使用 `Button loading` |
| 明确缺 spinner 的提交按钮 | 12+ 处 | `Materials` 4 处、`GanttViewDialogs` 1 处、`ParticipantUnitsDialog` 1 处、`ScopeDimensionsDialog` 1+ 处、`ProjectInfoCard` 2 处、`CompanyCockpitDialogs` 1 处、`BaselineBottomBar` 1 处、`AcceptanceDetailDrawer` 多处 | 统一 spinner |

执行要求：

- 主提交按钮写 `loading={saving}`，不要只改文案为“保存中...”。
- 取消按钮可继续 `disabled={saving}`，不需要 spinner。
- `useLoadingButton` 要么推广到所有 submit 场景，要么删除并统一用 `Button loading`。

### 4.4 可点击元素键盘可达性

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| 可点击 Card 无键盘语义 | 2 处确认 | `WBSTemplates/components/TemplateCard.tsx`、`WBSTemplates.tsx TemplateCardItem` | 改为 `button`/`Button asChild` 或补 `role/tabIndex/onKeyDown` |
| 自定义 div checkbox/菜单热区 | 1+ 处确认 | `TemplateCard.tsx` 左上角选择框 | 改为真实 `Checkbox` 或 `button` |
| `AcceptanceFlowNode` | 0 处问题 | 当前已是 `<Button>` | 从原问题清单移除 |

执行要求：

- 首选真实 `<button>` 或 `Button`。
- 必须支持 `Enter` 和 `Space`。
- 必须有 `focus-visible:ring-*`。

### 4.5 hover scale

| 问题 | 当前数量 | 代表位置 | 解决方案 |
|---|---:|---|---|
| `hover:scale-*` | 1 处 | `FeedbackModal.tsx hover:scale-110` | 改为颜色/阴影/位移，不用 scale |

## Phase 5：执行顺序

### P0：先修结构和可访问性

1. Dialog 迁移：`ConditionsDialog`、`MilestoneDialog`、`WBSTemplates` 四个 Modal、`FeedbackModal`、`LoginDialog`。
2. Card SSOT：先改 `Card + card-unified` 19 处，再处理 `border-slate-200 shadow-sm` 高频页面。
3. MetricCard 统一：先迁移 Dashboard、Reports、Materials、RiskManagement。
4. focus-visible：先处理表单输入和手写弹窗。
5. loading：先处理 Materials、Gantt、AcceptanceDetailDrawer 的提交按钮。

### P1：再修 token 和容错

1. 扩展 `chartPalette.ts`，迁移所有 TS/TSX 裸 HEX。
2. 定义 layout token 并替换重点 magic number 17 处。
3. 修复空白 EmptyState、长文本截断、数值格式化、null fallback。
4. 统一 disabled opacity 和 hover 动效。

### P2：最后做视觉一致性扫尾

1. Section spacing token 化。
2. 表格列宽 schema 化。
3. 清理迁移期 alias：`.card-unified/.card-l1/.card-l2/.card-l3`。
4. 更新 v1.3.3 contract test，防止回归。

## 当前执行记录（2026-05-01）

本轮先处理 v1.3.2 推送后用户复核仍指出的“页面元素重叠与遮挡”问题，再继续执行 v1.3.3 的结构性治理。当前已完成以下事项：

| 执行项 | 状态 | 证据 |
|---|---|---|
| 真实页面重叠复核 | 已通过 | `artifacts/uiux-overlap-v133-combined/overlap-summary.json`：Dashboard、Gantt、Materials、PlanningBaseline、Large-Gantt 各 2 个桌面视口，共 10 次运行，`passed 10 / failed 0 / findings 0 / horizontalOverflow 0` |
| Card SSOT 迁移 | 已完成本轮目标 | 业务页面不再使用 `card-unified/card-l1/card-l2/card-l3`；保留的类名仅作为 `index.css` 迁移期 alias |
| MetricCard 统一 | 已完成本轮目标 | Dashboard、Reports、Materials、RiskManagement、ResponsibilityView、TaskSummary、TemplateQualityPanel 已迁移到共享 `components/ui/metric-card.tsx` |
| Dialog/Drawer 统一 | 已完成本轮目标 | Login、ConflictResolution、WBSTemplates 四个 Modal、PreMilestones 明细抽屉、PlanningBaseline 明细抽屉已迁移到 `components/ui/dialog.tsx` |
| 手写 fixed modal/drawer 扫描 | 已收敛 | 业务弹窗/抽屉 P0 清单不再命中手写 `fixed inset-* + role="dialog"/aria-modal`；剩余命中为基础 primitive、Sidebar、TemplateCard 菜单、context-menu dismiss overlay |
| 契约测试 | 已补齐并通过 | `client/src/pages/__tests__/uiux-v1-3-3.contract.test.ts` 覆盖 MetricCard、Card alias、Dialog 迁移、disabled/hover/focus 回归 |
| 构建与单测 | 已通过 | `cd client && npm run build`；`npx vite build`；`npx vitest run --root client src/pages/__tests__/uiux-v1-3-3.contract.test.ts src/components/__tests__/Wave4DialogsAndGuards.test.tsx src/components/ui/__tests__/dialog-select.test.tsx` |

## P1/P2 执行记录（2026-05-01）

| 执行项 | 状态 | 证据 |
|---|---|---|
| 裸 HEX 收口 | 已完成本轮目标 | 业务 `TS/TSX/CSS` 裸 HEX 已清零；仅 `client/src/lib/chartPalette.ts` 和 `client/src/index.css` 变量定义保留颜色源 |
| 图表 palette SSOT | 已完成本轮目标 | Materials、Reports、Dashboard 月趋势、Gantt 时间轴、关键路径、验收连线、风险趋势、S 曲线、公司里程碑图统一从 `chartPalette.ts` 取色 |
| Layout magic number token 化 | 已完成重点项 | `--content-max-width`、`--header-height`、`--sidebar-collapsed-width`、`--sticky-toolbar-top` 已落到 `index.css`；重点 `1440px/72px/88px` 页面类名扫描为 0 |
| Section spacing token | 已落基线 | 新增 `.page-stack/.section-stack/.form-stack/.list-stack`，后续页面迁移按语义类推进 |
| EmptyState 与空白占位 | 已修本轮高风险项 | Reports 延期统计、WBS 模板质量建议、基线修订篮、WBS 模板列表、Monitoring API 空态已从空白 dashed div 改为 `EmptyState` |
| P1/P2 真实页面复核 | 已通过 | `artifacts/uiux-overlap-v133-p1p2-combined/overlap-summary.json`：Dashboard、Gantt、Materials、PlanningBaseline、Large-Gantt 各 2 个桌面视口，共 10 次运行，`passed 10 / failed 0 / findings 0 / horizontalOverflow 0` |
| P1/P2 构建与单测 | 已通过 | `cd client && npm run build`；`npx vitest run --root client src/pages/__tests__/uiux-v1-3-3.contract.test.ts src/components/__tests__/Wave4DialogsAndGuards.test.tsx src/components/ui/__tests__/dialog-select.test.tsx` |

## P1/P2 扫尾记录（2026-05-01）

| 执行项 | 状态 | 证据 |
|---|---|---|
| 百分比格式统一 | 已完成本轮重点页 | `client/src/lib/formatters.ts` 新增 `formatWholePercent`、`formatRatioPercent`；Materials、Reports、ResponsibilityView 的可见百分比已改为公共格式化，比例型 `delay_probability/confidence_score` 不再直接拼 `%` |
| 表格列宽 schema 化 | 已完成本轮重点表格 | `PlanningTreeView`、`Materials` 批量/材料表、`DrawingLedger` 改为局部列宽 schema + `table-fixed/minWidth`，移除本轮重点文件中的 `min-w-[980px]`、`min-w-[1040px]`、`w-[110px]`、`w-[80px]`、`max-w-[320px]`、`max-w-[180px]` 残留 |
| 长文本保护 | 已完成本轮重点字段 | Materials 材料名 `truncate + title`，关联任务说明 `line-clamp-2`；DrawingLedger 图纸名/编号/专业/审批人/图纸包/备注等长字段 `truncate + title` |
| 空态补齐 | 已完成本轮重点占位 | Materials 近期到场、AI 工期估算、无关联任务、提醒列表；Reports 下钻明细、关键路径摘要、材料到场摘要、单位到场记录、月度趋势均从空白 dashed 占位改为 `EmptyState` |
| 类型检查 | 已通过 | `npx tsc -p client/tsconfig.json --noEmit --pretty false`，`status 0` |
| 定点单测 | 已通过 | `npx vitest run --root client src/pages/__tests__/uiux-v1-3-3.contract.test.ts src/pages/__tests__/Materials.test.tsx src/pages/__tests__/Reports.test.tsx src/pages/__tests__/ResponsibilityView.test.tsx`：4 files / 25 tests passed |
| 客户端构建 | 已通过 | `npm run build --workspace=client`，Vite build success |
| 真实重叠抽检 | 已通过 | `artifacts/uiux-overlap-v133-sweep/overlap-summary.json`：Materials、PlanningBaseline 各 2 个桌面视口，共 4 次运行，`findings 0 / horizontalOverflow 0` |
| 页面浏览器脚本 | 已通过 | `node scripts/run-browser-suite.mjs verify:materials verify:reports verify:responsibility verify:drawings`：4 个脚本均无 `apiFailures/consoleErrors/pageErrors` |

剩余 v1.3.3 工作不影响本轮“重叠与遮挡”结论，但后续继续推进时仍可继续做深水区扫尾：表格列宽 schema 化扩大到所有表格、全量长文本 Tooltip 化、全量数值/百分比显示与 progress bar 共用 normalized value。

## 深水区空态/表格治理记录（2026-05-01）

本轮继续把“重点页修复”推进为更接近全量的治理：凡是可见空态、图表替代表格、长文本表格列、弹窗内列表、关键路径/甘特/证照/驾驶舱等复杂页面，统一按 v1.3.3 原则收口为 `EmptyState`、`LoadingState`、固定列宽 schema、`table-fixed + minWidth`、`truncate/line-clamp + title`。

| 执行项 | 状态 | 证据 |
|---|---|---|
| 通用 EmptyState 扩展 | 已完成本轮目标 | `EmptyState` 新增 `testId`；Dashboard、Gantt/关键路径、Reports 图表、PreMilestones、CompanyCockpit、RiskManagement、TaskSummary、team、planning validation/loading、DashboardHealth/RiskTrend 等裸空态已迁移到统一组件 |
| 表格稳定性扩大 | 已完成本轮目标 | `CertificateLedger`、`CertificateDependencyMatrix`、`DeviationDetailTable` 增加列宽常量、`table-fixed`、稳定 `minWidth`、长文本截断与 title |
| 图表数据表替代稳定 | 已完成本轮目标 | `ChartAccessibleWrapper` 内置数据表使用动态 `minWidth`、`table-fixed`、`max-w-0`、`truncate`，避免图表说明/数据表在窄视口互相挤压 |
| 弹窗/抽屉内空态 | 已完成本轮目标 | 证照依赖、前置条件、关联风险/问题/预警、关键路径插入、参与单位、甘特条件/障碍等列表空态统一改为 `EmptyState` |
| 长文本保护 | 已完成本轮目标 | 任务名、责任单位、证照名称、依赖链路、状态记录、风险/问题标题等高风险字段增加 `truncate` 或 `line-clamp`，并保留 title 供查看完整值 |
| 第二轮空态扫尾 | 已完成本轮目标 | CompanyCockpit 项目/风险空态、DrawingLedger、DrawingPackageBoard、DrawingDetailDrawer、Milestones、Gantt 行内条件、Closeout、MonthlyPlan、WBSTemplates Apply/Preview、TaskSummary、Acceptance 明细联动、Baseline 对比/留痕均收口为 `EmptyState` |
| 空白 dashed 占位扫描 | 已通过 | `rg "<div...border-dashed.../>|暂无.*border-dashed|没有.*border-dashed"` 无命中 |
| 手写空态文本扫描 | 已收敛 | `rg "<div...>暂无/当前没有/没有匹配"` 剩余 5 处均为字段值兜底或指标占位：关账月份、月计划更新时间、偏差原因、风险备注、关账进度，不再是整块空白区域 |
| 表格实现扫描 | 已收敛 | 页面与组件内 `<Table>/<table>` 剩余为 7 处稳定实现：通用图表数据表、Materials、DrawingLedger、CertificateDependencyMatrix、CertificateLedger、DeviationDetailTable，均已使用 `table-fixed` 或局部列宽 schema |
| 类型检查 | 已通过 | `npx tsc -p client/tsconfig.json --noEmit --pretty false`，`status 0` |
| 定点单测 | 已通过 | `npx vitest run --root client src/pages/__tests__/uiux-v1-3-3.contract.test.ts src/pages/__tests__/DrawingsLedger.test.tsx src/pages/__tests__/DrawingsBoard.test.tsx src/pages/__tests__/Milestones.test.tsx src/pages/__tests__/TaskSummary.test.tsx src/pages/__tests__/AcceptanceTimeline.test.tsx src/pages/__tests__/PlanningRealPages.test.tsx`：7 files / 29 tests passed |
| 客户端构建 | 已通过 | `npm run build --workspace=client`，Vite build success |
| 浏览器页面脚本 | 已通过 | `artifacts/browser-checks/suite-manifest.json`：CompanyCockpit、Drawings、Milestones、TaskSummary、Acceptance、PlanningMonthly、PlanningCloseout、PlanningBaseline、WBSTemplates 共 9 个脚本全部 `passed` |

## 验收标准

修复完成后必须满足：

| 验收项 | 目标 |
|---|---:|
| TS/TSX 裸 HEX，排除 `chartPalette.ts` | 0 |
| `<Card className="card-unified...">` | 0 |
| `.card-l1/.card-l2/.card-l3` 业务使用 | 0 |
| 手写 fixed modal/drawer，排除 `ui/dialog` 和 `ui/alert-dialog` | 0 |
| `focus:ring-*` / `focus:outline-none` 新增量 | 0 |
| `disabled:opacity-30/60` | 0 |
| `hover:scale-*` | 0 |
| 空白 dashed div 空态 | 0 |
| submit 类按钮仅 `disabled + 文案切换` | 0 |
| 可点击非 button 且无键盘语义 | 0 |

## 已校正的原报告误差

- `AcceptanceFlowNode` 已使用 `<Button>`，不计入键盘不可达问题。
- `p-8` 当前检出 7 处 / 6 文件，必须计入 CardContent padding 不一致与空态过重问题；此前“未检出”结论作废。
- `.map()` 不能按机械命中数作为问题数；只统计缺空态或空白占位的业务列表。
- `CompanyHealthHeatmap` 的进度条 width 已 clamp，但文字显示仍需统一格式化。
- `chartPalette.ts` 中保留 HEX 是允许项，但其它文件不得保留裸 HEX。
