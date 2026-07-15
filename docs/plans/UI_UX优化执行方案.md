# UI/UX 商业级优化 — 具体执行方案

> 本文件是 `UI_UX商业级全面优化方案_v1.3.md` 的逐步可执行版本。
> 每步给出：文件路径 + 改动描述 + 关键代码。
> 设计原则见 `CLAUDE.md`「UI/UX 设计语言规范」节。

## 执行约束

- 每完成一个叶子步骤，立即更新 `EXECUTION_PROGRESS.json`
- review 步骤必须运行编译+测试
- 前端：`npx tsc -p client/tsconfig.json --noEmit` + `npx vitest run --config client/vitest.config.ts`
- 后端：`npx tsc -p server/tsconfig.json --noEmit` + `npx vitest run --config server/vitest.config.ts`
- 编译/测试失败当场修复再标 completed
- `[前置: X]` = 等 X completed；`[后端]` = 涉及 server

## 防跑偏硬约束（每步执行前回顾）

- 颜色：只用 `slate-*`，禁止 `gray-*`/`neutral-*`/`zinc-*`
- 圆角：`rounded-lg`(8px) / `rounded-xl`(12px) / `rounded-2xl`(16px)
- 阴影：`shadow-[var(--el-1)]` ~ `shadow-[var(--el-4)]`
- 字号：禁止 `text-[Npx]` 任意值
- 动画：必须 `motion-safe:` 前缀
- 图标：Lucide SVG，禁止 emoji
- 确认弹窗：`ConfirmActionDialog`，禁止 `window.confirm()`
- Tooltip：Radix Tooltip，禁止 `title=`
- 容器：`.page-shell`（max-w-[1440px]）
- 指标行：最多 `xl:grid-cols-4`
- 数字列：`tabular-nums text-right`

---

## Phase 0A: 配置文件 & CSS 变量

### U0.1 — index.css 新增 elevation + 动画

文件：`client/src/index.css`

在 `:root` 块内追加：
```css
--background: #F8FAFC; /* slate-50，替换原有 --background 值 */
--accent: #F97316;
--el-1: 0 1px 3px rgba(0,0,0,0.04);
--el-2: 0 4px 12px rgba(0,0,0,0.06);
--el-3: 0 8px 24px rgba(0,0,0,0.08);
--el-4: 0 20px 40px rgba(0,0,0,0.12);
```

如果 `:root` 中已有 `--background`，将其值改为 `#F8FAFC`（slate-50）。

在 `@layer components` 之后追加 keyframes：
```css
@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes expand-down {
  from { height: 0; opacity: 0; overflow: hidden; }
  to { height: var(--radix-collapsible-content-height); opacity: 1; }
}
```

### U0.2 — tailwind.config.js Token 对齐

文件：`client/tailwind.config.js`

在 `theme.extend` 中添加/修改：
```js
colors: {
  accent: {
    DEFAULT: '#F97316', // orange-500
    foreground: '#FFFFFF',
  },
},
fontFamily: {
  sans: ['"Plus Jakarta Sans"', 'Inter', ...defaultTheme.fontFamily.sans],
},
borderRadius: {
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
},
boxShadow: {
  'el-1': '0 1px 3px rgba(0,0,0,0.04)',
  'el-2': '0 4px 12px rgba(0,0,0,0.06)',
  'el-3': '0 8px 24px rgba(0,0,0,0.08)',
  'el-4': '0 20px 40px rgba(0,0,0,0.12)',
},
animation: {
  'fade-in': 'fade-in 300ms ease-out',
  'expand-down': 'expand-down 300ms ease-out',
},
transitionTimingFunction: {
  bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
},
```

顶部引入 `const defaultTheme = require('tailwindcss/defaultTheme')`

### U0.3 — index.css 新增全局工具类

文件：`client/src/index.css`

在 `@layer components` 中追加：
```css
.page-shell {
  @apply max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8 py-6 lg:py-8 space-y-8;
}
.card-unified {
  @apply rounded-xl bg-white p-5 border border-slate-200/60;
  box-shadow: var(--el-1);
}
.card-hover {
  @apply cursor-pointer;
}
```

motion-safe 动画（必须用 `@media` 包裹，不能省略）：
```css
@media (prefers-reduced-motion: no-preference) {
  .page-shell { animation: fade-in 300ms ease-out; }
  .card-hover { transition: all 200ms ease-out; }
  .card-hover:hover {
    box-shadow: var(--el-2);
    transform: translateY(-2px);
  }
}
```

减弱动画覆盖：
```css
@media (prefers-reduced-motion: reduce) {
  .page-shell { animation: none !important; }
  .card-hover { transition: none !important; }
  .card-hover:hover { transform: none !important; }
}
```

同步更新已有 `.card-l1`/`.card-l2`/`.card-l3` 的 shadow 值：
```css
.card-l1 { box-shadow: var(--el-1); } /* 替换原 shadow-sm */
.card-l2 { box-shadow: var(--el-2); } /* 替换原 shadow-md */
.card-l3 { box-shadow: var(--el-3); } /* 替换原 shadow-lg */
```

### U0.4 — index.html 字体引入

文件：`client/index.html`

在 `<head>` 中 `<meta charset>` 之后加：
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

文件：`client/src/index.css`

第 1 行 `@import url('...Inter...')` 改为：
```css
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap');
```

### U0.4r — 0A 编译验证 [前置: U0.4]

运行 `npx tsc -p client/tsconfig.json --noEmit`，确认无报错。浏览器打开确认字体加载。

---

## Phase 0B: 全局批量替换

### U0.5 — gray-* → slate-* [361处/28文件]

替换规则（对 `client/src/` 下所有 `.tsx`/`.ts`）：
```
gray-50 → slate-50
gray-100 → slate-100
gray-200 → slate-200
gray-300 → slate-300
gray-400 → slate-400
gray-500 → slate-500
gray-600 → slate-600
gray-700 → slate-700
gray-800 → slate-800
gray-900 → slate-900
```

不替换：注释中的 gray、字符串常量（如 `"gray"` 作为颜色名传参）。

重点文件（按数量排序）：
- `PreviewModal.tsx` (37处)
- `ConditionsDialog.tsx` (27处)
- `GanttViewRowSections.tsx` (22处)
- `CreateModal.tsx` (21处)
- `GanttViewDialogs.tsx` (20处)
- `ChangePasswordDialog.tsx` (12处)
- `EditProfileDialog.tsx` (10处)
- `BatchActionBar.tsx` / `AssigneeProgressCard.tsx` / `ConflictResolutionModal.tsx` / `CriticalPathGraph.tsx`

替换后编译验证。

### U0.6 — 任意字号 → 标准字号

替换规则：
- `text-[10px]` → `text-xs`（保留 Sidebar.tsx 行93 badge 的 `text-[10px]` 1处）
- `text-[11px]` → `text-xs`
- `text-[22px]` → `text-lg`
- `text-[26px]` → `text-2xl`

### U0.7 — 任意圆角 → 标准圆角

替换规则：
- `rounded-3xl` → `rounded-2xl`
- `rounded-[24px]` → `rounded-2xl`
- `rounded-[28px]` → `rounded-2xl`

### U0.8 — bg-blue-500 → bg-blue-600 [75处]

替换规则：`bg-blue-500` → `bg-blue-600`

注意：逐一检查是否为 primary 按钮/链接场景。语义色场景（如进度条信息态）保留 `bg-blue-500`。

同时更新 `index.css` 中 `--brand-primary: #3B82F6` → `--brand-primary: #2563EB`。

### U0.9 — 任意 tracking → tracking-wider

替换规则：
- `tracking-[0.16em]` → `tracking-wider`
- `tracking-[0.18em]` → `tracking-wider`
- `tracking-[0.22em]` → `tracking-wider`

### U0.10 — shadow-blue 修复 [7处/4文件]

逐文件修复：
- `EmptyState.tsx` (1处)：`shadow-blue` → `shadow-sm`
- `Sidebar.tsx` (4处)：active 态 `shadow-blue` → `shadow-lg shadow-blue-950/20`
- `ApplyModal.tsx` (1处)：`shadow-blue` → `shadow-sm`
- `PreviewModal.tsx` (1处)：`shadow-blue` → `shadow-sm`

### U0.11 — 数据表格数字列加 tabular-nums

搜索所有 `<TableCell>` / `<td>` 中渲染数字的列，加 `tabular-nums` class。

重点文件：DeviationDetailTable / Materials 表格 / DrawingsPage 表格 / AcceptanceLedger / BaselinePage 树表 / MonthlyPlanPage 树表。

### U0.11b — 数字格式化工具函数 [覆盖: A1/A2/A3]

文件：`client/src/lib/formatters.ts`（新建）

```ts
export function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN')
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`
}

export function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
```

各页面 Metric Card / 表格数字列 / 百分比 / 日期统一调用这些函数。百分比渲染时 `%` 用 `text-slate-400 text-sm`。日期列统一 `tabular-nums text-slate-500`。

### U0.11c — Sparkline 复合组件 [覆盖: A5]

文件：`client/src/components/Sparkline.tsx`（新建）

```tsx
import { ResponsiveContainer, LineChart, Line } from 'recharts'

interface Props {
  data: { value: number }[]
  color?: string
  className?: string
}

export function Sparkline({ data, color = '#3B82F6', className }: Props) {
  return (
    <div className={className ?? 'h-8 w-20'}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

用于 Dashboard/RiskManagement/CompanyCockpit/ResponsibilityView 的 Metric Card 内嵌 7 日趋势微图。

### U0.11d — AnimatedNumber 数字滚动组件 [覆盖: A4]

文件：`client/src/components/AnimatedNumber.tsx`（新建）

依赖 framer-motion（已有）。Metric Card 大数字切换时 300ms ease-out 滚动动画。

```tsx
import { useEffect, useRef } from 'react'
import { useSpring, useTransform, motion } from 'framer-motion'

interface Props {
  value: number
  className?: string
}

export function AnimatedNumber({ value, className }: Props) {
  const spring = useSpring(0, { duration: 300 })
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString('zh-CN'))
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => { spring.set(value) }, [spring, value])

  return <motion.span ref={ref} className={className}>{display}</motion.span>
}
```

加 `motion-safe:` 前缀：外层包裹 `<span className="motion-safe:contents motion-reduce:contents">`，motion-reduce 时直接渲染静态数字。

### U0.11e — useLoadingButton hook [覆盖: A6]

文件：`client/src/hooks/useLoadingButton.ts`（新建）

```ts
import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'

export function useLoadingButton(asyncFn: () => Promise<void>, timeoutMs = 10000) {
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const run = useCallback(async () => {
    if (loading) return
    setLoading(true)
    timerRef.current = setTimeout(() => {
      setLoading(false)
      toast.error('操作超时，请重试')
    }, timeoutMs)
    try {
      await asyncFn()
    } catch {
      toast.error('操作失败')
    } finally {
      clearTimeout(timerRef.current)
      setLoading(false)
    }
  }, [asyncFn, loading, timeoutMs])

  return { loading, run }
}
```

所有异步提交按钮使用：`<Button disabled={loading} onClick={run}>{loading ? '提交中...' : '提交'}</Button>`。

### U0.11f — 图表数据表格替代 [覆盖: A8]

所有 recharts 图表（LineChart/BarChart/PieChart/ScatterChart/AreaChart）外层包裹可访问性数据表替代：

```tsx
<div>
  {/* 图表本身 */}
  <ResponsiveContainer>...</ResponsiveContainer>
  {/* 数据表替代 */}
  <details className="mt-2">
    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
      查看数据表
    </summary>
    <table className="mt-2 w-full text-xs">
      <thead><tr>{columns.map(c => <th key={c} className="text-left py-1 text-slate-500">{c}</th>)}</tr></thead>
      <tbody>{rows.map(...)}</tbody>
    </table>
  </details>
</div>
```

建议新建 `components/ChartAccessibleWrapper.tsx` 复合组件统一包裹，接收 `columns` + `rows` props。

涉及文件（15+ 处图表）：
- Dashboard：sparkline/趋势图（DashboardMonthlyTrend）
- Reports：SCurveChart/BaselineDumbbellChart/MonthlyStackedBarChart/ExecutionScatterChart
- RiskManagement：热力图/趋势多折线图
- CompanyCockpit：sparkline
- ResponsibilityView：sparkline
- Materials：分类饼图
- Milestones：进度条图表
- AcceptanceTimeline：进度概览条

### U0.12 — 图标尺寸标准化

替换规则：
- `h-3 w-3` → `h-3.5 w-3.5`（约70处）
- `h-10 w-10` 纯图标场景 → `h-8 w-8`（容器级 `h-10 w-10` 保留）

### U0.12r — 0B 编译验证 + 残留检查 [前置: U0.12]

编译+测试。grep 确认：
```bash
rg "gray-[0-9]" client/src/ --type ts --type tsx  # 应为 0
rg "text-\[1[01]px\]" client/src/  # 应仅剩 Sidebar badge 1处
rg "rounded-3xl" client/src/  # 应为 0
rg "shadow-blue" client/src/  # 应为 0
```

---

## Phase 0C: 基础 UI 组件对齐

### U0.13 — shadcn 组件圆角对齐

6个文件 `rounded-md` → `rounded-lg`：
- `client/src/components/ui/input.tsx`
- `client/src/components/ui/select.tsx`（trigger 部分）
- `client/src/components/ui/tabs.tsx`（trigger 部分）
- `client/src/components/ui/toast.tsx`
- `client/src/components/ui/skeleton.tsx`
- `client/src/components/ui/page-skeleton.tsx`：`rounded-[28px]`/`rounded-[24px]` → `rounded-2xl`

### U0.13b — 表格规范统一 [覆盖: B2/B5/B7/B8/B10]

所有数据表格统一以下规范：

1. **组件**：必须使用 shadcn `<Table>` 组件（`TableHeader/TableBody/TableRow/TableCell`），禁止 `div + grid` 模拟表格
2. **表头 sticky**：`<TableHeader className="sticky top-0 z-10 bg-white">`
3. **行高**：`<TableRow className="py-3">`（统一行高）
4. **斑马纹**：`<TableRow className="even:bg-slate-50/50 hover:bg-slate-100/60">`
5. **行选中**：选中行加 `ring-2 ring-blue-500`
6. **排序列**：排序列 header `text-slate-900 font-semibold` + 排序箭头图标
7. **操作列**：`opacity-0 group-hover:opacity-100 transition-opacity`
8. **数字列**：`tabular-nums text-right`（U0.11 已覆盖）
9. **pb-20 补偿**：有 fixed 底部栏的页面（GanttView/BaselinePage/MonthlyPlanPage/CloseoutPage）内容区加 `pb-20`

涉及文件：
- `Materials.tsx` 材料表格
- `DrawingsPage.tsx` 图纸表格
- `BaselinePage.tsx` 树表
- `MonthlyPlanPage.tsx` 树表
- `AcceptanceLedger` 验收台账
- `DeviationDetailTable` 偏差详情表
- `Notifications.tsx` 通知列表
- `PreMilestones.tsx` 台账视图

验收命令：
```bash
# 检查是否还有 div+grid 模拟表格
rg 'grid-cols.*border' client/src/pages/ --glob '*.tsx' | grep -v 'xl:grid-cols-4\|md:grid-cols-2\|grid-cols-1' | head -20

# 检�� sticky header
rg 'TableHeader' client/src/ --glob '*.tsx' -A1 | grep -c 'sticky'

# 检查 pb-20 补偿
for f in GanttView BaselinePage MonthlyPlanPage CloseoutPage; do
  rg "pb-20\|pb-\[80px\]" client/src/pages/ --glob "*${f}*" -c || echo "WARN: ${f} missing pb-20"
done
```

### U0.14 — 新建 ui/tooltip.tsx

文件：`client/src/components/ui/tooltip.tsx`

```tsx
import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/utils'

const TooltipProvider = TooltipPrimitive.Provider
const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-white shadow-[var(--el-2)]',
      'animate-in fade-in-0 zoom-in-95',
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```

确保 `@radix-ui/react-tooltip` 已安装，未安装则 `npm install @radix-ui/react-tooltip`。

在 `App.tsx` 根级包裹 `<TooltipProvider delayDuration={300}>`。

### U0.15 — 新建 ui/separator.tsx

文件：`client/src/components/ui/separator.tsx`

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

const Separator = React.forwardRef<
  HTMLHRElement,
  React.HTMLAttributes<HTMLHRElement> & { orientation?: 'horizontal' | 'vertical' }
>(({ className, orientation = 'horizontal', ...props }, ref) => (
  <hr
    ref={ref}
    className={cn(
      'shrink-0 border-slate-200',
      orientation === 'horizontal' ? 'h-[1px] w-full border-t' : 'h-full w-[1px] border-l',
      className
    )}
    {...props}
  />
))
Separator.displayName = 'Separator'

export { Separator }
```

替换 239 处内联 border 分隔线（`border-b`/`border-t` 用作分隔的 `<div>`/`<hr>`）→ `<Separator />`。

重点文件（按数量）：
- `CertificateWorkItemDialog.tsx` (12处)
- `CriticalPathGraph.tsx` (11处)
- `Materials.tsx` (9处)
- `AcceptanceDetailDrawer.tsx` (8处)
- `Notifications.tsx` (7处)
- `AcceptanceLedger.tsx` (7处)
- `TemplateCard.tsx` (6处)
- `GanttViewPanels.tsx` (6处)
- `GanttViewFilters.tsx` (6处)
- `DrawingsPage.tsx` (6处)
- `MonitoringDashboard.tsx` (6处)
- `RiskManagement.tsx` (5处)
- 其余 28 个文件各 1-5 处

注意：仅替换用作视觉分隔的 border，不替换布局边框（如卡片 border、表格 border）。

验收命令：
```bash
# 替换后应大幅减少（不会归零，因为布局边框保留）
rg 'border-b|border-t' client/src/ --glob '*.tsx' -c | awk -F: '{sum+=$2} END{print sum}'
# 确认 Separator 引用增加
rg '<Separator' client/src/ --glob '*.tsx' -c | awk -F: '{sum+=$2} END{print sum}'
```

每处理 5 个文件编译验证一次。

### U0.15b — Checkbox 组件（备用）

文件：新建 `client/src/components/ui/checkbox.tsx`

基于 Radix UI Checkbox：

```tsx
import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-4 w-4 shrink-0 rounded border border-slate-300 ring-offset-white',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      <Check className="h-3.5 w-3.5" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = 'Checkbox'

export { Checkbox }
```

确保 `@radix-ui/react-checkbox` 已安装：`npm install @radix-ui/react-checkbox`

此组件为备用，按需在表单中启用。

### U0.16 — ConfirmDialog 统一收口

1. 文件 `client/src/components/ConfirmActionDialog.tsx`：
   - 确认样式为 `rounded-2xl shadow-[var(--el-4)]`
   - 破坏性操作按钮 `bg-red-600 hover:bg-red-500`

2. 文件 `client/src/components/planning/ConfirmDialog.tsx`：
   - 内部改为调用 `ConfirmActionDialog`，保持原有 Props API 兼容
   - 不删除文件（避免大量 import 变更），只改内部实现

3. 文件 `client/src/pages/Drawings/DrawingsPage.tsx`：
   - 搜索 `window.confirm(`，替换为 `ConfirmActionDialog` 调用
   - 需要引入 `useConfirmDialog` hook 或直接用 state 控制

### U0.16r — 0C 编译验证 [前置: U0.16]

### U0.16b — Dialog 尺寸分级 + 遮罩 blur + 入场动画 [覆盖: B3]

所有 Dialog/Sheet 组件统一以下规范：

1. **尺寸分级**（在各 Dialog 的 `DialogContent` 上设置 `className`）：
   - 简单确认：`max-w-[440px] w-[90%]`
   - 标准表单：`max-w-[560px] w-[90%]`
   - 复杂内容（多步骤/对比）：`max-w-[720px] w-[90%]`

2. **遮罩 blur**：`DialogOverlay` 加 `backdrop-blur-[4px]`（如 shadcn 默认无此效果）

3. **入场动画**：`DialogContent` 加 `data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95` + `ease-bounce duration-200`

4. **统一圆角阴影**：`rounded-2xl shadow-[var(--el-4)]`

涉及文件（10+ Dialog）：
- `ConfirmActionDialog.tsx` / `planning/ConfirmDialog.tsx`
- `ChangePasswordDialog.tsx` / `EditProfileDialog.tsx` / `LoginDialog.tsx`
- `MilestoneDialog.tsx` / `ApplyModal.tsx` / `CreateModal.tsx`
- `SkeletonDiffDialog.tsx` / `RegenerationDialog.tsx`
- `TypeManagerDialog.tsx` / `CriticalPathDialog.tsx`
- `ConflictResolutionModal.tsx` / `PreviewModal.tsx`

---

## Phase 0D: 页面基础设施

### U0.17 — PageErrorBoundary

文件：`client/src/components/PageErrorBoundary.tsx`

```tsx
import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class PageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="page-shell flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertTriangle className="h-12 w-12 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">页面加载出错</h2>
          <Button onClick={() => window.location.reload()}>刷新页面</Button>
        </div>
      )
    }
    return this.props.children
  }
}
```

在 `App.tsx` 中用 `<PageErrorBoundary>` 包裹路由 `<Routes>`。

### U0.17b — Skip Link [覆盖: A7]

文件：`client/src/App.tsx`（或 Layout 组件）

在 `<body>` 最顶部（`<div id="root">` 内第一个元素）加 Skip Link：

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
>
  跳转到主内容
</a>
```

在主内容区容器（`.page-shell` 或 `<main>`）加 `id="main-content"`。

### U0.18 — useScrollRestoration

文件：`client/src/hooks/useScrollRestoration.ts`

```ts
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useScrollRestoration() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
}
```

在 `App.tsx` 根组件中调用 `useScrollRestoration()`。

### U0.19 — PageSkeleton

文件：`client/src/components/PageSkeleton.tsx`

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export function PageSkeleton() {
  return (
    <div className="page-shell">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}
```

### U0.19b — PageSkeleton 挂载到路由 [覆盖: B6]

文件：`client/src/App.tsx`（或路由配置文件）

将各页面路由用 `<Suspense fallback={<PageSkeleton />}>` 包裹，确保首次加载和 lazy load 时显示骨架屏：

```tsx
import { Suspense, lazy } from 'react'
import { PageSkeleton } from '@/components/PageSkeleton'

// 如果页面已 lazy：
const Dashboard = lazy(() => import('@/pages/Dashboard'))

// 路由中：
<Route path="/projects/:id/dashboard" element={
  <Suspense fallback={<PageSkeleton />}>
    <Dashboard />
  </Suspense>
} />
```

如果页面未使用 lazy import，则在页面组件内部的数据加载阶段使用 PageSkeleton：
```tsx
if (isLoading) return <PageSkeleton />
```

覆盖所有 16 个主页面。

### U0.19c — EmptyState 分级变体 [覆盖: A11/A12]

文件：`client/src/components/EmptyState.tsx`（已有，扩展 variant）

新增 2 个变体 prop：

```tsx
interface EmptyStateProps {
  variant?: 'default' | 'filter' | 'error'
  title?: string
  description?: string
  action?: ReactNode
  onRetry?: () => void
  onClearFilter?: () => void
}

export function EmptyState({ variant = 'default', title, description, action, onRetry, onClearFilter }: EmptyStateProps) {
  const config = {
    default: {
      icon: <Inbox className="h-12 w-12 text-slate-300" />,
      defaultTitle: '暂无数据',
      defaultDesc: '当前没有可显示的内容',
    },
    filter: {
      icon: <SearchX className="h-8 w-8 text-slate-400" />,
      defaultTitle: '未找到匹配项',
      defaultDesc: '尝试调整筛选条件',
    },
    error: {
      icon: <AlertTriangle className="h-8 w-8 text-red-400" />,
      defaultTitle: '加载失败',
      defaultDesc: '请稍后重试',
    },
  }[variant]

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      {config.icon}
      <h3 className="text-sm font-medium text-slate-900">{title ?? config.defaultTitle}</h3>
      <p className="text-xs text-slate-500">{description ?? config.defaultDesc}</p>
      {variant === 'filter' && onClearFilter && (
        <Button variant="outline" size="sm" onClick={onClearFilter}>清除筛选</Button>
      )}
      {variant === 'error' && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>重试</Button>
      )}
      {variant === 'default' && action}
    </div>
  )
}
```

使用场景：
- `variant="default"`：首次无数据（大图标 h-12 + 标题 + 引导 CTA）
- `variant="filter"`：筛选无结果（小图标 h-8 + "未找到匹配项" + "清除筛选"按钮）
- `variant="error"`：加载失败（小图标 h-8 + "加载失败" + "重试"按钮）

各页面列表/表格的空状态统一使用对应 variant。

### U0.20 — NotFoundPage + 路由

文件：`client/src/components/NotFoundPage.tsx`

```tsx
import { FileQuestion } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="page-shell flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <FileQuestion className="h-12 w-12 text-slate-400" />
      <h2 className="text-lg font-semibold text-slate-900">页面不存在</h2>
      <p className="text-sm text-slate-500">请检查地址是否正确</p>
      <Button asChild><Link to="/company">返回首页</Link></Button>
    </div>
  )
}
```

文件：`client/src/App.tsx`（或路由配置文件）

在 `<Routes>` 末尾加：
```tsx
<Route path="*" element={<NotFoundPage />} />
```

### U0.21 — SectionHeader

文件：`client/src/components/SectionHeader.tsx`

```tsx
import type { ReactNode } from 'react'

interface Props {
  title: string
  action?: ReactNode
  count?: number
}

export function SectionHeader({ title, action, count }: Props) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-semibold text-slate-900">
        {title}
        {count != null && (
          <span className="ml-2 text-sm font-normal text-slate-400">({count})</span>
        )}
      </h3>
      {action}
    </div>
  )
}
```

### U0.22 — CollapsibleSection

文件：`client/src/components/CollapsibleSection.tsx`

```tsx
import { useState, type ReactNode } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  count?: number
}

export function CollapsibleSection({ title, defaultOpen = true, children, count }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className="flex w-full items-center justify-between py-2 cursor-pointer group">
        <h3 className="text-lg font-semibold text-slate-900">
          {title}
          {count != null && <span className="ml-2 text-sm font-normal text-slate-400">({count})</span>}
        </h3>
        <ChevronDown className={cn('h-5 w-5 text-slate-400 transition-transform duration-200', open && 'rotate-180')} />
      </Collapsible.Trigger>
      <Collapsible.Content className="overflow-hidden data-[state=open]:animate-expand-down data-[state=closed]:animate-collapse-up">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
```

确保 `@radix-ui/react-collapsible` 已安装。

### U0.22r — 0D 编译验证 [前置: U0.22]

---

## Phase 0E: 全局替换（title→Tooltip / 原生→组件）

### U0.23 — title= → Radix Tooltip [125处/37文件] [前置: U0.14]

替换模式：
```tsx
// 之前
<SomeElement title="提示文字">内容</SomeElement>

// 之后
<Tooltip>
  <TooltipTrigger asChild>
    <SomeElement>内容</SomeElement>
  </TooltipTrigger>
  <TooltipContent>提示文字</TooltipContent>
</Tooltip>
```

完整文件清单（37 文件，按数量降序）：
- `GanttViewRowSections.tsx` (12)
- `AcceptanceDetailDrawer.tsx` (12)
- `RiskManagement.tsx` (10)
- `ResponsibilityView.tsx` (10)
- `Dashboard.tsx` (9)
- `Milestones.tsx` (8)
- `Reports.tsx` (4)
- `PlanningWorkspace.tsx` (3)
- `CertificateDetailDrawer.tsx` (3)
- `Notifications.tsx` (3)
- `GanttViewDialogs.tsx` (3)
- `AcceptanceLedger.tsx` (3)
- `MonthlyPlanPage.tsx` (2)
- `CloseoutPage.tsx` (2)
- `BaselinePage.tsx` (2)
- `WBSTemplates.tsx` (2)
- `MilestoneToolbar.tsx` (2)
- `MilestoneCard.tsx` (2)
- `FourCertificateBoard.tsx` (2)
- `PreMilestones.tsx` (2)
- `Materials.tsx` (2)
- `GanttViewRows.tsx` (2)
- `ProjectOverviewSection.tsx` (2)
- `AcceptanceTimeline.tsx` (2)
- `MonitoringDashboard.tsx` (2)
- 其余 12 文件各 1 处

跳过测试文件（`__tests__/` 下的 `title=` 不替换）。

每处理 5 个文件编译验证一次。

验收命令：
```bash
# 替换后 title= 应仅剩测试文件中的
rg 'title="' client/src/ --glob '*.tsx' --glob '*.ts' --glob '!*test*' --glob '!*__tests__*' -c | awk -F: '{sum+=$2} END{print "remaining:", sum}'
# 应接近 0（HTML title 标签除外）
```

### U0.24 — 原生 select → Select 组件

文件：`client/src/pages/GanttView.tsx` 的 GanttViewFilters 区域

4处 `<select>` → shadcn `<Select><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>...</SelectContent></Select>`

### U0.25 — 原生 button → Button 组件 [120+处/25文件]

完整文件清单（按数量降序，仅列 pages/ 和 components/ 中非 ui/ 的文件）：
- `TemplateCard.tsx` (15)
- `GanttViewTaskContextMenu.tsx` (13)
- `GanttViewRowSections.tsx` (12)
- `CertificateLedger.tsx` (9)
- `GanttViewDialogs.tsx` (8)
- `AcceptanceTimeline.tsx` (8)
- `ConditionsDialog.tsx` (7)
- `AcceptanceLedger.tsx` (7)
- `PreviewModal.tsx` (6)
- `ConflictResolutionModal.tsx` (6)
- `ChangePasswordDialog.tsx` (6)
- `MilestoneDialog.tsx` (4)
- `MilestoneCard.tsx` (4)
- `TaskTimelineView.tsx` (4)
- `GanttViewPanels.tsx` (4)
- `PlanningTreeView.tsx` (4)
- `FeedbackModal.tsx` (4)
- `MonthlyPlanPage.tsx` (3)
- `BaselinePage.tsx` (3)
- `Sidebar.tsx` (3) — 已在 U0.30 处理
- `ProjectLayout.tsx` (3)
- `EditProfileDialog.tsx` (3)
- `LoginDialog.tsx` (2) — 已在 U0.28 处理
- `RecentTasksCard.tsx` (2)
- `DashboardCompareCard.tsx` (2)

替换时确保保留原有 onClick/disabled/className 逻辑，仅换组件。
跳过已在其他步骤处理的文件（Sidebar U0.30、LoginDialog U0.28）。

验收命令：
```bash
# 原生 button 应大幅减少（不会归零，因为 shadcn 组件内部用 button）
rg '<button\b' client/src/pages/ client/src/components/ --glob '*.tsx' --glob '!ui/*' -c | awk -F: '{sum+=$2} END{print "remaining:", sum}'
```

### U0.25b — Button active 状态 [覆盖: A9]

文件：`client/src/components/ui/button.tsx`

在 Button 组件的 `buttonVariants` 中，为所有 variant 的基础 class 追加 active 状态：

```
active:scale-[0.98] transition-transform duration-75
```

具体：在 `cva()` 的第一个参数（base class 字符串）末尾追加上述 class。这样所有 Button variant 自动继承 active 按压效果。

### U0.26 — PageHeader badge → Badge 组件

搜索 PageHeader 组件中的内联 `<span className="...rounded-full...">` badge，替换为 `<Badge variant="secondary">`。

### U0.27 — Avatar 替换

文件：`AssigneeProgressCard.tsx` / `CompanyCockpit.tsx`

自建 `<div className="rounded-full ...">` 头像 → shadcn `<Avatar><AvatarImage/><AvatarFallback/></Avatar>`

### U0.28 — LoginDialog 表单增强

文件：`client/src/components/LoginDialog.tsx`

1. 密码输入框加 Eye/EyeOff toggle：
```tsx
const [showPassword, setShowPassword] = useState(false)
// input type={showPassword ? 'text' : 'password'}
// 右侧按钮：<button onClick={() => setShowPassword(!showPassword)}>
//   {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
// </button>
```

2. 所有 Dialog 表单统一 onBlur 校验（LoginDialog / EditProfileDialog / ChangePasswordDialog / MilestoneDialog）：
```tsx
<Input onBlur={() => { if (!value) setError('此字段必填') }} />
{error && <p className="text-sm text-red-600" role="alert">{error}</p>}
```

### U0.28b — ApplyModal/CreateModal 表单校验 [覆盖: B4]

文件：
- `client/src/pages/Drawings/ApplyModal.tsx`
- `client/src/pages/Drawings/CreateModal.tsx`

与 U0.28 同样的表单增强规范：

1. 所有 `<input>` / `<textarea>` 必须有关联 `<label>`（`htmlFor` 绑定），禁止 placeholder-only
2. onBlur 实时校验：
```tsx
<Input onBlur={() => { if (!value) setError('此字段必填') }} />
{error && <p className="text-sm text-red-600" role="alert">{error}</p>}
```
3. 提交按钮使用 `useLoadingButton` hook（U0.11e）防重复提交
4. 错误样式：`border-red-500` + 下方 `text-sm text-red-600` + `role="alert"`

### U0.28r — 0E 编译验证 [前置: U0.28]

---

## Phase 0F: Card 收口 + Sidebar 精细化

### U0.29 — 105处 Card div → Card 组件 [40文件]

搜索模式：`className="...rounded-xl...bg-white..."` 或 `className="...rounded-lg...border...bg-white..."`

替换为 `<Card>` 组件（已有 `ui/card.tsx`），根据阴影层级选择 variant。

完整文件清单（40 文件，按数量降序）：
- `Materials.tsx` (20)
- `Reports.tsx` (8)
- `ProjectOverviewSection.tsx` (8)
- `PreviewModal.tsx` (6)
- `Notifications.tsx` (4)
- `AcceptanceDetailDrawer.tsx` (4)
- `BaselineRevisionPoolDialog.tsx` (3)
- `BaselineRevisionActions.tsx` (3)
- `BaselinePage.tsx` (3)
- `TemplateQualityPanel.tsx` (3)
- `TaskTimelineView.tsx` (3)
- `AcceptanceFlowNode.tsx` (3)
- `ProjectInfoCard.tsx` (3)
- `CriticalPathGraph.tsx` (3)
- `MonthlyPlanExceptionSummary.tsx` (2)
- `CloseoutDetailDrawer.tsx` (2)
- `TemplateCard.tsx` (2)
- `ConditionsDialog.tsx` (2)
- `CertificateLedger.tsx` (2)
- 其余 21 文件各 1 处

每处理 10 处编译验证一次。

验收命令：
```bash
# Card 组件引用应大幅增加
rg '<Card\b' client/src/ --glob '*.tsx' -c | awk -F: '{sum+=$2} END{print "Card refs:", sum}'
# 原始模式应大幅减少
rg 'rounded-xl.*bg-white|bg-white.*rounded-xl' client/src/ --glob '*.tsx' -c | awk -F: '{sum+=$2} END{print "remaining:", sum}'
```

### U0.30 — Sidebar.tsx 精细化

文件：`client/src/components/layout/Sidebar.tsx`

8项改动：
1. 行140/206/226：`rounded-2xl` → `rounded-xl`
2. 行140：删除 `hover:scale-105`，改为 `hover:bg-slate-100 hover:shadow-sm`
3. 行84等4处：`shadow-blue` → `shadow-lg shadow-blue-950/20`
4. 行207：`text-[11px]` → `text-xs`
5. 行207：`tracking-[0.18em]` → `tracking-wider`
6. 行79-98 导航链接：加 `cursor-pointer`
7. 导航项加 `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none`
8. 行87/118 折叠态 `title=` → Radix Tooltip（如果 U0.23 未覆盖则此处处理）

### U0.31 — MASTER.md 同步更新

文件：`design-system/workbuddy/MASTER.md`

1. Primary Button `background: #F97316` → `background: #2563EB`
2. Shadow Depths 表：
   - `--shadow-sm` → `--el-1: 0 1px 3px rgba(0,0,0,0.04)`
   - `--shadow-md` → `--el-2: 0 4px 12px rgba(0,0,0,0.06)`
   - `--shadow-lg` → `--el-3: 0 8px 24px rgba(0,0,0,0.08)`
   - `--shadow-xl` → `--el-4: 0 20px 40px rgba(0,0,0,0.12)`

### U0.31r — 0F 编译验证 [前置: U0.31]

### U0.final — Phase 0 全量验证 [前置: U0.31r]

编译+测试+浏览器验证+grep残留检查：
```bash
# 残留检查
rg "gray-[0-9]" client/src/ --type tsx --type ts -c
rg "text-\[[0-9]+px\]" client/src/ -c
rg "rounded-3xl|rounded-\[" client/src/ -c
rg "shadow-blue" client/src/ -c
rg "tracking-\[0\." client/src/ -c
```

---

## Phase 14: 面包屑 + 页面 title

### U14.1 — 全页面 Breadcrumb + document.title

文件：所有页面组件（16个）

已有组件：`client/src/components/Breadcrumb.tsx`

每个页面顶部加 `<Breadcrumb>` + `useEffect` 设置 `document.title`：

```tsx
// 在每个页面组件内部顶层加：
useEffect(() => { document.title = '页面名 | WorkBuddy' }, [])
```

页面-title 映射表：
| 页面文件 | Breadcrumb 路径 | document.title |
|---------|----------------|----------------|
| Dashboard.tsx | 项目名 / 项目概览 | 项目概览 \| WorkBuddy |
| Reports.tsx | 项目名 / 分析报表 | 分析报表 \| WorkBuddy |
| RiskManagement.tsx | 项目名 / 风险管理 | 风险管理 \| WorkBuddy |
| Materials.tsx | 项目名 / 材料管理 | 材料管理 \| WorkBuddy |
| Milestones.tsx | 项目名 / 里程碑 | 里程碑 \| WorkBuddy |
| Notifications.tsx | 通知中心 | 通知中心 \| WorkBuddy |
| AcceptanceTimeline.tsx | 项目名 / 验收流程 | 验收流程 \| WorkBuddy |
| GanttView.tsx | 项目名 / 甘特图 | 甘特图 \| WorkBuddy |
| Drawings/DrawingsPage.tsx | 项目名 / 施工图纸 | 施工图纸 \| WorkBuddy |
| PreMilestones.tsx | 项目名 / 前期证照 | 前期证照 \| WorkBuddy |
| TaskSummary.tsx | 项目名 / 任务汇总 | 任务汇总 \| WorkBuddy |
| CompanyCockpit.tsx | 公司驾驶舱 | 公司驾驶舱 \| WorkBuddy |
| ResponsibilityView.tsx | 项目名 / 责任主体 | 责任主体 \| WorkBuddy |
| planning/PlanningWorkspace.tsx | 项目名 / 计划编制 | 计划编制 \| WorkBuddy |
| planning/BaselinePage.tsx | 项目名 / 计划编制 / 项目基线 | 项目基线 \| WorkBuddy |
| planning/MonthlyPlanPage.tsx | 项目名 / 计划编制 / 月度计划 | 月度计划 \| WorkBuddy |
| planning/CloseoutPage.tsx | 项目名 / 计划编制 / 关闭管理 | 关闭管理 \| WorkBuddy |

### U14.r — Phase 14 编译验证 [前置: U14.1]

---

## Phase 1: Dashboard

### U1.0 — Dashboard 后端聚合接口 [后端]

文件：`server/src/routes/dashboard.ts`

新增 `/api/projects/:id/dashboard/today-live` 接口（项目级，与现有 dashboard 路由前缀一致）：

> 注意：商业方案写 `/api/dashboard/today-live`，此处统一为项目级路径 `/api/projects/:id/dashboard/today-live`，因为 TodayLive 数据是项目维度的。前后端必须使用同一路径。

```ts
// GET /api/projects/:id/dashboard/today-live
// 返回按优先级排序的今日事项列表
interface TodayLiveItem {
  type: 'warning' | 'due_task' | 'change' | 'new_risk'
  priority: number // 1=最高
  title: string
  detail: string
  created_at: string
}
// 聚合逻辑：
// 1. 从 risks 取今日新增/升级的风险 → type='new_risk', priority=4
// 2. 从 tasks 取今日到期 → type='due_task', priority=2
// 3. 从 conditions/obstacles 取今日触发预警 → type='warning', priority=1
// 4. 从 change-logs 取今日变更 → type='change', priority=3
// 按 priority ASC 排序返回
```

### U1.1 — Dashboard 容器 + 字号修复 [前置: U0.final]

文件：`client/src/pages/Dashboard.tsx`

1. 行1466附近：`max-w-[1680px]` → 替换为 `page-shell` class
2. 行1543/1586：`text-[26px]` → `text-2xl`
3. 行387：`text-[11px]` → `text-xs`

### U1.2 — Compact Header 替换 ProjectInfoCard

文件：`client/src/pages/Dashboard.tsx`

移除 ProjectInfoCard 首屏占位，替换为 Compact Header：

```tsx
<div className="flex items-center justify-between rounded-xl bg-white p-4 shadow-[var(--el-1)] border border-slate-200/60">
  <div className="flex items-center gap-3">
    <h1 className="text-lg font-semibold text-slate-900">{currentProject?.name}</h1>
    <Badge variant="secondary">{currentProject?.phase}</Badge>
    {/* 健康分 pill */}
    <span className={cn(
      'rounded-full px-2.5 py-0.5 text-xs font-medium',
      healthScore >= 80 ? 'bg-green-50 text-green-700' :
      healthScore >= 60 ? 'bg-amber-50 text-amber-700' :
      'bg-red-50 text-red-700'
    )}>
      {healthScore >= 80 ? '良好' : healthScore >= 60 ? '一般' : '预警'} {healthScore}分
    </span>
  </div>
  <CollapsibleTrigger asChild>
    <Button variant="ghost" size="sm">
      {open ? '收起' : '展开详情'}
      <ChevronDown className={cn('ml-1 h-4 w-4 transition-transform', open && 'rotate-180')} />
    </Button>
  </CollapsibleTrigger>
</div>
{/* CollapsibleContent 内放原 ProjectInfoCard 内容 */}
```

### U1.3 — 核心指标区 4 Metric Cards

文件：`client/src/pages/Dashboard.tsx`

在 Compact Header 下方加 4 卡片网格：

```tsx
<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
  {[
    { label: '整体进度', value: overallProgress, unit: '%', trend: progressTrend },
    { label: '本月偏差', value: monthDeviation, unit: '天', trend: deviationTrend },
    { label: '活跃风险', value: activeRisks, trend: riskTrend },
    { label: '今日待办', value: todayTodos, trend: todoTrend },
  ].map((m, i) => (
    <div
      key={m.label}
      className="card-unified motion-safe:animate-fade-in"
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <div className="text-xs uppercase tracking-wider text-slate-400">{m.label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{m.value}</span>
        {m.unit && <span className="text-sm text-slate-400">{m.unit}</span>}
        <span className={cn('text-sm font-medium',
          m.trend > 0 ? 'text-green-600' : m.trend < 0 ? 'text-red-600' : 'text-slate-400'
        )}>
          {m.trend > 0 ? `↑+${m.trend}` : m.trend < 0 ? `↓${m.trend}` : '→'}
        </span>
      </div>
      {/* sparkline 微图：recharts LineChart 无轴 h-8 w-20 */}
    </div>
  ))}
</div>
```

### U1.4 — TodayLive 紧凑列表

文件：`client/src/pages/Dashboard.tsx`

4 张独立 TodayLiveCard → 1 个紧凑列表卡片：

```tsx
const typeConfig = {
  warning: { color: 'border-l-red-500', label: '预警' },
  due_task: { color: 'border-l-amber-500', label: '到期' },
  change: { color: 'border-l-blue-500', label: '变更' },
  new_risk: { color: 'border-l-slate-400', label: '新增' },
}

<div className="card-unified">
  <SectionHeader title="今日待处理" action={
    totalCount > 5 ? <Link to={`/projects/${projectId}/notifications`} className="text-sm text-blue-600 hover:underline">查看全部({totalCount})</Link> : null
  } />
  {items.length === 0 ? (
    <EmptyState icon={CheckCircle} title="今日暂无待处理事项" />
  ) : (
    <ul className="space-y-1">
      {items.slice(0, 5).map(item => (
        <li key={item.id} className={cn('flex items-center gap-3 rounded-lg border-l-4 px-3 py-2', typeConfig[item.type].color)}>
          <span className="text-xs font-medium text-slate-400">{typeConfig[item.type].label}</span>
          <span className="flex-1 truncate text-sm text-slate-700">{item.title}</span>
          <span className="text-xs tabular-nums text-slate-400">{item.time}</span>
        </li>
      ))}
    </ul>
  )}
</div>
```

### U1.5 — 分析区 Tab 化

文件：`client/src/pages/Dashboard.tsx`

将 DashboardMonthlyTrend / MilestoneCard / UnitProgressCard / RecentTasksCard / CompareCard / WeeklyDigestPanel 6 个 section 收入 Tab：

```tsx
<Tabs defaultValue="trend">
  <TabsList>
    <TabsTrigger value="trend">进度趋势</TabsTrigger>
    <TabsTrigger value="milestone">
      里程碑
      {overdueMilestones > 0 && <Badge variant="destructive" className="ml-1.5">{overdueMilestones}</Badge>}
    </TabsTrigger>
    <TabsTrigger value="unit">单位工程</TabsTrigger>
    <TabsTrigger value="tasks">
      近期任务
      <Badge variant="secondary" className="ml-1.5">{recentTaskCount}</Badge>
    </TabsTrigger>
  </TabsList>
  <div className="min-h-[400px]">
    <TabsContent value="trend"><DashboardMonthlyTrend ... /></TabsContent>
    <TabsContent value="milestone"><MilestoneCard ... /></TabsContent>
    <TabsContent value="unit"><UnitProgressCard ... /></TabsContent>
    <TabsContent value="tasks"><RecentTasksCard ... /></TabsContent>
  </div>
</Tabs>
```

WeeklyDigestPanel 和 CompareCard 合并入"进度趋势" Tab 内。

### U1.r — Phase 1 编译验证 [前置: U1.5]

---

## Phase 2: Reports

### U2.0 — Reports 后端 S-Curve 接口 [后端]

文件：`server/src/analytics/metricRegistry.ts` 或 `server/src/routes/reports.ts`

新增 S-Curve 数据接口：

```ts
// GET /api/projects/:id/reports/s-curve
// 返回累计计划 vs 实际进度时间序列
interface SCurvePoint { date: string; planned_cumulative: number; actual_cumulative: number }
// 从 project_daily_snapshot 或 projectExecutionSummaryService 聚合
// 按天粒度，返回项目开始至今的累计数据
```

### U2.1 — Reports 容器 + 模块 chip 角标 [前置: U0.final]

文件：`client/src/pages/Reports.tsx`

1. 加 `.page-shell` 容器
2. 顶部模块切换 chip 加语义角标：

```tsx
const chips = [
  { key: 'progress', label: '进度总览', badge: null, active: true },
  { key: 'progress_deviation', label: '进度偏差', badge: deviationCount, color: 'amber' },
  { key: 'risk', label: `风险(${activeRiskCount} 活跃)`, badge: activeRiskCount, color: 'red' },
  { key: 'change_log', label: `变更(${monthChangeCount} 本月)`, badge: monthChangeCount, color: 'blue' },
]
// key 必须与 Reports.tsx 现有路由状态 key 一致：progress / progress_deviation / risk / change_log
// 选中 chip: bg-blue-600 text-white rounded-lg px-3 py-1.5
// 未选中: bg-slate-100 text-slate-600 hover:bg-slate-200
// 切换时 fade-in duration-200
```

### U2.2 — 模块 A 进度总览

文件：`client/src/pages/Reports.tsx`

1. 顶部 3 Metric Cards `xl:grid-cols-3 gap-4`（总任务数/完成率/本月新增）
2. 主体 `xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]`：
   - 左：SCurveChart 卡片 `card-unified p-5`
   - 右：关键节点列表，每项 `日期(tabular-nums) + 节点名 + 状态色点`

### U2.3 — 模块 B 进度偏差

文件：`client/src/pages/Reports.tsx`

1. 统一 grid 比例：行1964/1972/2274/2869 四处 → `xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]`
2. DeviationTabs 4 个 sub-chip 加数字角标
3. 图表统一 `card-unified p-5`
4. DeviationDetailTable 应用表格规范：`even:bg-slate-50/50 hover:bg-slate-100/60`，数字列 `tabular-nums text-right`

### U2.4 — 模块 C 风险与问题

1. 顶部 2 Metric Cards + 7日趋势 sparkline
2. 左：风险矩阵热力图（影响×概率 5×5 grid）
3. 右：最新风险列表 + chips 筛选 + "查看全部(N)"
4. 列表每项：左色条(高=red/中=amber/低=green) + 风险名 + 责任人 + 日期

### U2.5 — 模块 D 变更记录

1. 顶部 2 Metric Cards（本月变更数/审批中数量）
2. 时间线列表：日期(`tabular-nums`) + 变更类型左色条 + 标题 + 状态 Badge
3. 应用表格规范 + 底部分页

### U2.r — Phase 2 编译验证 [前置: U2.5]

---

## Phase 3: RiskManagement

### U3.0 — RiskManagement 后端管道阶段计数 [后端]

文件：`server/src/services/riskStatisticsService.ts`

在风险统计接口补充按处置阶段计数：

```ts
// 在 getRiskStatistics 返回值中新增：
pipelineStages: {
  identified: number   // 已识别
  assessed: number     // 已评估
  responded: number    // 已应对
  monitored: number    // 监控中
}
// 从 risks 表按 status 字段映射到 4 阶段
```

### U3.1 — RiskManagement 容器 + 指标区 [前置: U0.final]

文件：`client/src/pages/RiskManagement.tsx`

1. 加 `.page-shell` 容器
2. 4 MetricCards → 统一复合组件 `xl:grid-cols-4 gap-4`
3. DataQualityBanner 移到页面底部折叠区（默认收起）

### U3.2 — 链路流程图（视觉焦点）

文件：`client/src/pages/RiskManagement.tsx`

新增纯 CSS 流程图：

```tsx
const stages = [
  { label: '识别', count: pipeline.identified, status: pipeline.identified > 0 ? 'active' : 'empty' },
  { label: '评估', count: pipeline.assessed, status: pipeline.assessed > 0 ? 'active' : 'empty' },
  { label: '应对', count: pipeline.responded, status: pipeline.responded > 0 ? 'active' : 'empty' },
  { label: '监控', count: pipeline.monitored, status: 'done' },
]

<div className="flex items-center justify-center gap-2">
  {stages.map((s, i) => (
    <Fragment key={s.label}>
      <div className={cn(
        'flex flex-col items-center gap-1 rounded-xl px-6 py-3',
        s.status === 'active' ? 'bg-orange-500 text-white' :
        s.status === 'done' ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'
      )}>
        <span className="text-sm font-medium">{s.label}</span>
        <span className="text-lg font-bold tabular-nums">{s.count}项</span>
      </div>
      {i < stages.length - 1 && (
        <ChevronRight className="h-5 w-5 text-slate-300 motion-safe:transition-all motion-safe:duration-300" />
      )}
    </Fragment>
  ))}
</div>
```

### U3.3 — OverviewCard 左色条区分

3 卡片加左边框色条：
- 预警：`border-l-4 border-amber-500`
- 风险：`border-l-4 border-red-500`
- 问题：`border-l-4 border-blue-500`

每卡内部：数字+趋势 → 最近3条列表 → "查看全部(N)"。卡片加 `card-hover`。

### U3.4 — TrendSummary 合并为多折线图

4 个独立趋势卡片 → 1 个 recharts `<LineChart>` 多折线：
- 4 条线：预警/风险/问题/已关闭
- 图例可点击切换显示/隐藏
- 卡片 `card-unified p-5`

### U3.5 — 列表区统一

应用统一列表模式：内嵌搜索 + chips 筛选(等级/状态/责任人) + 列表 + 分页

### U3.6 — 三流关系提示

Tab 切换区域上方加微型流程提示：

```tsx
<div className="flex items-center gap-2 text-xs">
  {['预警', '风险', '问题'].map((label, i) => (
    <Fragment key={label}>
      <span className={cn(
        'rounded-full px-2 py-0.5',
        activeTab === label.toLowerCase() ? 'bg-blue-600 text-white' : 'text-slate-400'
      )}>{label}</span>
      {i < 2 && <span className="text-slate-300">→</span>}
    </Fragment>
  ))}
</div>
```

### U3.r — Phase 3 编译验证 [前置: U3.6]

---

## Phase 8: GanttView

### U8.1 — GanttView 错误处理 toast [前置: U0.final]

文件：`client/src/pages/GanttView.tsx`（13 处 console.error）

搜索 `console.error`，每处在 catch 块中追加 `toast.error("操作失败: ...")`，保留 console.error 用于调试。

替换模式：
```tsx
// 之前
catch (err) { console.error('xxx failed', err) }

// 之后
catch (err) {
  console.error('xxx failed', err)
  toast.error('操作失败，请重试')
}
```

确保文件顶部已引入 toast：`import { toast } from 'sonner'` 或项目已有的 toast 方案。

验收命令：
```bash
# 确认每个 console.error 附近都有 toast
rg 'console\.error' client/src/pages/GanttView.tsx -n -A2 | grep -c 'toast'
# 应等于 13
```

### U8.2 — Dialog 色调统一

文件：GanttView 相关 Dialog 文件

所有 dialog：`rounded-2xl shadow-[var(--el-4)]`，色调限制为 primary(blue-600) + 1语义色 + slate。
清理 9+ 种混用色调。

### U8.3 — TypeManagerDialog 分步表单

文件：GanttView TypeManagerDialog

9 个 state 变量管理表单 → Tab 式分步表单，降低认知负担。

### U8.4 — 右键菜单优化

文件：`GanttViewTaskContextMenu.tsx`

1. hover/transition：`hover:bg-slate-50 transition-colors duration-150`
2. 间距 `py-2 px-3`，分组用 Separator
3. 破坏性操作 `text-red-600` + ConfirmDialog
4. 13 项按功能分组：编辑操作 / 层级操作 / 关键路径操作 / 危险操作
5. 关键路径 6 项各加 `text-xs text-slate-400` 描述行
6. 视口边界检测防溢出

### U8.5 — 底部操作栏统一

```tsx
// 统一底部栏
<div className="fixed bottom-4 left-1/2 z-40 w-full max-w-[1440px] -translate-x-1/2">
  <div className="mx-4 flex items-center justify-between rounded-2xl bg-white p-3 shadow-[var(--el-3)] border border-slate-200/60">
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-600">已选 {count} 项</span>
      <Button variant="ghost" size="sm" onClick={clearSelection}>清除</Button>
    </div>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm">状态变更</Button>
      <Button variant="destructive" size="sm">删除</Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">更多操作</Button></DropdownMenuTrigger>
        <DropdownMenuContent>{/* 指派/单位/日期偏移 */}</DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</div>
```

### U8.6 — 关键路径图谱优化

文件：`CriticalPathDialog.tsx` + `CriticalPathGraph.tsx`

1. 标题旁加说明 `text-xs text-slate-400 "红色链路为影响工期的关键路径"`
2. 节点 hover → Tooltip（任务名+工期+浮动时间）
3. 图谱下方加色块图例：`flex gap-4 text-xs`（红=关键/琥珀=关注/橙=手动/灰=非关键）
4. 循环依赖警告加 tooltip
5. 缩放控件加 `text-xs` 标签

### U8.7 — 横道图视图优化

文件：`TaskTimelineView.tsx` 相关

1. 视图切换按钮 → Tab 风格
2. 任务数 >50 时显示操作提示
3. 筛选栏默认隐藏 + "点击展开筛选" 提示
4. GovernanceBanner 阶段 Badge 加 tooltip

### U8.8 — 统计卡片精简

6 个指标卡片 → 4 个（总任务/进行中/已完成/异常）：
- "滞后" 合并入 "异常" + tooltip "进度落后但未超期的任务"
- "逾期" 加 tooltip "已超过计划完成日期"

### U8.9 — 筛选栏实时生效

去掉"应用"按钮，所有筛选 `onChange` 即触发，仅保留"重置"按钮。

### U8.10 — 任务行 hover 按钮精简

保留 2 个常用（编辑/展开详情），其余收入 `···` DropdownMenu。

### U8.11 — 双击编辑视觉提示

任务标题 hover 时显示铅笔图标：
```tsx
<Pencil className="opacity-0 group-hover:opacity-60 h-3.5 w-3.5 text-slate-400 transition-opacity" />
```

### U8.12 — 数据质量提示优化

严重度 Badge 各加 tooltip：
- 高="影响关键路径计算准确性"
- 中="可能导致进度统计偏差"
- 低="建议修正但不影响核心功能"

整体加说明 `text-xs text-slate-400 "以下数据问题可能影响分析准确性，建议尽快处理"`

### U8.r — Phase 8 编译验证 [前置: U8.12]

---

## Phase 9: Planning 模块

### Phase 9a: PlanningWorkspace

#### U9a.1 — PlanningWorkspace 容器对齐 [前置: U0.final]

文件：`client/src/pages/planning/PlanningWorkspace.tsx`

`PlanningPageShell` 内部对齐 `.page-shell` 的 max-width 和 padding。

#### U9a.2 — 治理仪表盘横向 + 默认折叠

3 面板纵向堆叠 → 横向 `xl:grid-cols-3`，默认折叠为一行摘要：

```tsx
<CollapsibleSection
  title={`治理健康度 ${healthScore} 分 · ${healthScore >= 80 ? '良好' : '一般'}`}
  defaultOpen={false}
>
  <div className="grid gap-4 xl:grid-cols-3">
    {/* health / integrity / anomaly 3 面板 */}
  </div>
</CollapsibleSection>
```

#### U9a.3 — 无基线引导横幅

```tsx
{!hasConfirmedBaseline && (
  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
    <p className="text-sm text-blue-800">当前项目尚未建立基线，请先在「项目基线」页面创建并确认基线。</p>
    <Link to={`/projects/${projectId}/planning/baseline`}
      className="mt-2 inline-flex items-center text-sm font-medium text-blue-600 hover:underline">
      前往项目基线 <ArrowRight className="ml-1 h-4 w-4" />
    </Link>
  </div>
)}
```

#### U9a.r — 9a 编译验证

### Phase 9b: BaselinePage

#### U9b.1 — 树表列控制

文件：`client/src/pages/planning/BaselinePage.tsx`

默认 8 列（序号/WBS/任务名/开始/结束/工期/状态/责任人），其余 10 列折叠到"更多列" Popover。

列宽：任务名 `min-w-[200px]`，日期列 `w-[110px] tabular-nums`，数字列 `w-[80px] text-right tabular-nums`。

#### U9b.2 — BottomBar 居中修复 + 按钮分组

应用统一底部栏规范（同 U8.5 模式）：
- 左=辅助（导出/撤销/历史），超过 4 个收入 DropdownMenu
- 右=主操作（保存草稿/提交审批）
- 居中=选中计数 `"已选 N 项"`

#### U9b.3 — ConfirmDialog 分层

默认摘要视图 + 展开详情：

```tsx
<div className="space-y-3">
  <div className="flex items-center gap-2">
    <span className="text-2xl font-bold tabular-nums">{changeCount}</span>
    <span className="text-sm text-slate-500">项变更</span>
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
      changePercent < 5 ? 'bg-green-50 text-green-700' :
      changePercent > 20 ? 'bg-orange-50 text-orange-700' : 'bg-amber-50 text-amber-700'
    )}>
      {changePercent < 5 ? '影响较小，可安全确认' : '影响范围较大，建议仔细检查'}
    </span>
  </div>
  {/* top-3 关键变更 */}
  <CollapsibleSection title="查看详情" defaultOpen={false}>
    {/* 完整变更列表 */}
  </CollapsibleSection>
</div>
```

#### U9b.4 — RevisionPoolDialog 分步引导

3 步骤：选择变更 → 确认已选 → 标注暂缓原因。顶部进度条指示器。

#### U9b.5 — 详情抽屉统一模板

改用统一抽屉模板：Header(标题+状态Badge+关闭) → Body(信息分组+Separator) → Footer(操作按钮)。

#### U9b.6 — 创建入口视觉引导

"空白创建" `bg-blue-600 text-white`（推荐），其余两个加描述行。

#### U9b.7 — 双击编辑 + 键盘快捷键提示

hover 铅笔图标 + 编辑态显示 `text-xs text-slate-400 "Tab 下一格 · Enter 确认 · Esc 取消"`。

#### U9b.8 — 层级操作术语

「提升为上级」→「升级」+ tooltip "将此任务提升一个层级"
「降为子级」→「降级」+ tooltip "将此任务变为上方任务的子任务"

#### U9b.9 — 版本切换高亮 + 草稿锁 tooltip

当前版本 `bg-blue-600 text-white rounded-lg`，历史版本 `bg-slate-100 text-slate-600`。
草稿锁 tooltip "其他用户正在编辑，暂时无法修改"。

#### U9b.r — 9b 编译验证

### Phase 9c: MonthlyPlanPage

#### U9c.1 — 树表列控制 + 底部栏

同 BaselinePage 模式（默认 8 列 + 统一底部栏）。

#### U9c.2 — Dialog 统一

- SkeletonDiffDialog：`rounded-2xl shadow-[var(--el-4)]`，差异红/绿高亮
- RegenerationDialog：分步确认（选择范围 → 确认影响 → 执行）

#### U9c.3 — 双数据源选择器

当前源 `bg-blue-50 border-blue-500 font-semibold`，备选源 `bg-slate-50 border-slate-200 text-slate-500`。

#### U9c.4 — 快速确认 vs 标准确认

快速确认旁 tooltip "所有条件已满足时可用"；不满足时 `disabled` + tooltip。

#### U9c.5 — 月滑块 + 批量操作术语

当前月 `ring-2 ring-blue-500 bg-blue-50`。
「批量移入」→「纳入本月计划」，「批量移出」→「移出本月计划」+ ConfirmDialog。

#### U9c.6 — 重新生成来源描述 + 草稿恢复时间戳

3 来源选项各加描述行。草稿恢复显示时间戳 `tabular-nums text-slate-500`。

#### U9c.7 — 撤销/重做快捷键提示

底部栏撤销 tooltip `"Ctrl+Z"`，重做 tooltip `"Ctrl+Y"`。

#### U9c.r — 9c 编译验证

### Phase 9d: CloseoutPage

#### U9d.1 — 级联选择器优化

文件：`client/src/pages/planning/CloseoutPage.tsx`

1. 加面包屑路径 `根 > 分类A > 子分类B`
2. 每级显示子项数量角标
3. 已选路径 `bg-blue-50` 高亮
4. 顶级分支加描述文字

#### U9d.2 — CloseoutBatchBar + DetailDrawer

统一底部栏 + 统一抽屉模板（Header→Body→Footer）。

#### U9d.3 — 升级阶梯说明

```tsx
<div className="flex items-center gap-2 text-xs text-slate-400">
  <span>逾期 3 天系统提醒</span>
  <span>→</span>
  <span>5 天通知上级</span>
  <span>→</span>
  <span>7 天自动关闭</span>
</div>
```

#### U9d.r — 9d 编译验证

---

## Phase 4: Materials

### U4.0 — Materials 后端分类饼图接口 [后端]

文件：`server/src/services/materialReportsService.ts`

在材料汇总接口补充 `byCategory` 分组：

```ts
// 在返回值中新增：
byCategory: Array<{ category: string; count: number; percentage: number }>
// 分组：钢材/混凝土/管材/电气/其他
```

### U4.1 — Materials 容器 + 指标区 [前置: U0.final]

文件：`client/src/pages/Materials.tsx`

1. 加 `.page-shell` 容器
2. 6 卡片(`xl:grid-cols-6`) → 4 卡片 `xl:grid-cols-4 gap-4`
   - 合并：总数+已到场→"到场率"、已验收+不合格→"验收情况"
   - 统一 Metric 复合组件

### U4.2 — 主体 7:3 分栏

```tsx
<div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]">
  {/* 左：工具栏 + 表格 + 分页 */}
  <div className="space-y-4">
    {/* 工具栏：Select筛选(类型/状态) + 搜索框 + 操作按钮组 */}
    {/* 表格：斑马纹 + hover + 操作列 group-hover */}
  </div>
  {/* 右：快速统计 + 分类饼图 + 近期到场 */}
  <div className="space-y-4">
    {/* 3 mini metric + PieChart + 列表 */}
  </div>
</div>
```

### U4.3 — 删除操作 ConfirmDialog

所有删除操作加 `ConfirmActionDialog`（当前缺失）。

### U4.4 — 表格规范

斑马纹 `even:bg-slate-50/50`，hover `hover:bg-slate-100/60`，数字列 `tabular-nums text-right`，操作列 `group-hover:opacity-100`，状态列语义色 dot + 文字。

### U4.r — Phase 4 编译验证 [前置: U4.4]

---

## Phase 5: Milestones

### U5.1 — Milestones 容器 + 指标区 [前置: U0.final]

文件：`client/src/pages/Milestones.tsx`

1. 行705：`max-w-[1600px]` → `.page-shell`
2. 行743：5 卡片(`xl:grid-cols-5`) → 4 卡片 `xl:grid-cols-4 gap-4`（合并 2 个相关指标）

### U5.2 — HealthSummary 精简

pill badges 过多 → top-3 + "更多(N)" 展开。

### U5.3 — 里程碑列表左色条

左色条区分状态：
- 完成=`border-l-4 border-green-500`
- 进行中=`border-l-4 border-blue-500`
- 延期=`border-l-4 border-red-500`

每项：里程碑名 + 计划日期(`tabular-nums`) + 实际日期 + 偏差天数(趋势色)。
进度条 `motion-safe:transition-[width] duration-700 ease-out`。

### U5.r — Phase 5 编译验证 [前置: U5.3]

---

## Phase 7: AcceptanceTimeline

### U7.1 — AcceptanceTimeline 容器 + 指标区 [前置: U0.final]

文件：`client/src/pages/AcceptanceTimeline.tsx`

1. 加 `.page-shell` 容器
2. 7 StatCards(7色tone) → 4 卡片 `xl:grid-cols-4 gap-4`
   - 按验收大阶段合并（基础/主体/竣工/专项）
   - 去除 tone-based 着色 → 统一 slate 底 + 左色条（最多 3 语义色）
   - 每卡：阶段名 + 通过率大数字 + 进度条

### U7.2 — 进度概览条（视觉焦点）

```tsx
<div className="card-unified p-5">
  <div className="flex items-center justify-between mb-3">
    <span className="text-lg font-semibold text-slate-900">验收总进度</span>
    <span className="text-2xl font-bold tabular-nums">{totalPercent}%</span>
  </div>
  {/* 多段进度条 */}
  <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
    {stages.map(s => (
      <div key={s.label} className={cn('h-full motion-safe:transition-[width] duration-700 ease-out', s.color)}
        style={{ width: `${s.percent}%` }} />
    ))}
  </div>
  {/* 分段标签 */}
  <div className="mt-2 flex gap-4 text-xs text-slate-500">
    {stages.map(s => <span key={s.label}>{s.label} {s.percent}%</span>)}
  </div>
</div>
```

### U7.3 — 圆角 + z-index 修复

1. `rounded-3xl` → `rounded-xl`（Phase 0 全局覆盖）
2. z-index 修复：FlowNode z-10 / FlowBoard header z-20 / 浮层 z-30+

### U7.4 — 详情抽屉统一模板

AcceptanceDetailDrawer → 统一模板（Header→信息分组→Footer），30+ 处内联卡片 → Card 组件。

### U7.5 — 流程图节点优化

已完成=green-500，进行中=blue-500，未开始=slate-200。
节点 hover `hover:shadow-[var(--el-2)] cursor-pointer`。
箭头 `motion-safe:transition-all duration-300`。

### U7.6 — 视图切换 Tab 化

FlowBoard vs Ledger 切换 → Tab 组件 `"流程图(N)" | "台账(N)"`。

### U7.r — Phase 7 编译验证 [前置: U7.6]

---

## Phase 12: PreMilestones

### U12.1 — PreMilestones 容器 [前置: U0.final]

文件：`client/src/pages/PreMilestones.tsx` + 13 子组件

加 `.page-shell` 容器。

### U12.2 — 视图切换 Tab + 过渡

Tab 组件：`"看板(N)" | "台账(N)"`，切换 `fade-in duration-200`。

### U12.3 — Board 视图卡片

卡片 `.card-unified` + `.card-hover`。
每卡：证照名(`text-base font-medium`) + 状态 Badge + 到期日(`tabular-nums`) + 责任人。
按状态分列（待办/进行中/已完成），列标题加计数。

### U12.4 — Ledger 视图表格

应用表格规范（斑马纹/hover/操作列 `group-hover:opacity-100`）。
状态列语义色 dot + 文字，日期列 `tabular-nums`。

### U12.5 — 详情抽屉统一

Header(证照名+状态Badge+关闭) → Body(基本信息/条件清单/关联文件) → Footer(编辑+状态变更)。

### U12.6 — 看板与台账维度对齐

看板按阶段分列，台账也默认按阶段分组显示，quick filter 作为二级筛选叠加。

### U12.r — Phase 12 编译验证 [前置: U12.6]

---

## Phase 11: Drawings

### U11.1 — Drawings 容器 + 指标区 [前置: U0.final]

文件：`client/src/pages/Drawings/DrawingsPage.tsx`

1. 加 `.page-shell` 容器
2. 7 就绪度指标 → 4 核心 `xl:grid-cols-4 gap-4`（总图纸数/已审批/待审批/逾期）
3. 其余 3 指标折叠到"详细统计"展开区

### U11.2 — 表格优化

18+ 列 → 默认 8 列（序号/图纸名/专业/版本/状态/审批人/日期/操作），其余折叠到"更多列" Popover。
应用表格规范。

### U11.3 — 工具栏 + Focus View 描述

Select 筛选(专业/状态/版本) + 搜索框 + 批量操作。
Focus View 下拉选项各加 `text-xs text-slate-400` 描述行。

### U11.4 — 就绪度可视化

顶部总进度条 + 按专业分组 mini 进度条。

### U11.5 — window.confirm → ConfirmActionDialog

行498 `window.confirm()` → `ConfirmActionDialog`。

### U11.r — Phase 11 编译验证 [前置: U11.5]

---

## Phase 6: Notifications

### U6.1 — Notifications 容器 [前置: U0.final]

文件：`client/src/pages/Notifications.tsx`

加 `.page-shell` 容器。

### U6.2 — Header 精简

7+ 按钮 → 搜索框 + 筛选 Select(类型/状态) + 设置齿轮。
其余收入"更多操作" DropdownMenu（全部已读/批量删除/导出）。

### U6.3 — Tab 精简

5 Tab → 3 Tab（全部/未读/已处理）。
类型筛选（业务预警/系统异常/流程提醒）改为 chips 筛选器放 Tab 下方。

### U6.4 — Settings 面板 z-index 修复

`absolute z-20` → Popover 组件 `z-50` + backdrop 点击关闭 + `rounded-xl shadow-[var(--el-3)]`。

### U6.5 — 通知条目精简

6 Badge → 2 Badge（类型+状态），其余移入展开详情行。
未读 `bg-blue-50/50 border-l-4 border-blue-500`，已读 `bg-white`。
分组标题：日期 + 未读数 Badge。

### U6.6 — 空状态

无通知时 EmptyState "暂无新通知"。

### U6.r — Phase 6 编译验证 [前置: U6.6]

---

## Phase 13: TaskSummary

### U13.1 — TaskSummary 容器 + 字号 [前置: U0.final]

文件：`client/src/pages/TaskSummary.tsx`

1. 行332：`container mx-auto` → `.page-shell`
2. `text-[22px]` → `text-lg`（Phase 0 全局覆盖）

### U13.2 — 汇总指标

顶部 2 Metric Cards `xl:grid-cols-2 gap-4`（总任务数/完成率）。

### U13.3 — 分组 Section 优化

每组 Section 标题 `text-lg font-semibold text-slate-900` + 右侧任务计数 Badge。
默认展开前 3 组，其余折叠 + "展开更多(N)"。
折叠动画 `expand-down duration-300`。

### U13.4 — 任务列表规范

斑马纹/hover/操作列。每项：任务名 + 状态色点 + 责任人 + 截止日期(`tabular-nums`)。
逾期任务 `text-red-600` + 逾期天数。

### U13.r — Phase 13 编译验证 [前置: U13.4]

---

## Phase 13b: ResponsibilityView

### U13b.1 — ResponsibilityView 容器 + 字号 [前置: U0.final]

文件：`client/src/pages/ResponsibilityView.tsx`

1. 加 `.page-shell` 容器
2. `text-[26px]` → `text-2xl`；`text-[11px]` → `text-xs`

### U13b.2 — 指标区统一

4 MetricCards → 统一复合组件 `xl:grid-cols-4 gap-4`。

### U13b.3 — 维度切换优化

当前维度 `bg-blue-600 text-white`，非当前 `bg-slate-100 text-slate-600`。
每个维度按钮旁 tooltip："按个人查看" / "按参建单位查看"。

### U13b.4 — 术语人性化

- 「活跃延期」→「当前延期中」
- 「风险压力」→「风险关联度」+ tooltip
- 「待确认恢复」→「待确认恢复正常」

### U13b.5 — 监控区/分析区标题 + 详情卡片

监控区→"责任主体监控"，分析区→"趋势分析"。Tab 加数字角标。
异常主体卡片 `border-l-4 border-red-500`，正常 `border border-slate-200`。
关联任务表格应用表格规范。

### U13b.r — Phase 13b 编译验证 [前置: U13b.5]

---

## Phase 10: CompanyCockpit

### U10.1 — CompanyCockpit 容器 [前置: U0.final]

文件：`client/src/pages/CompanyCockpit.tsx`

行512：`max-w-[1680px]` → `.page-shell`。

### U10.2 — Hero 区（视觉焦点）

```tsx
<div className="rounded-xl bg-gradient-to-br from-blue-50 to-slate-50 p-6">
  <div className="grid gap-6 xl:grid-cols-3">
    {[
      { label: '项目总数', value: totalProjects },
      { label: '活跃项目', value: activeProjects },
      { label: '整体健康', value: avgHealth, pill: true },
    ].map(m => (
      <div key={m.label} className="card-unified">
        <div className="text-xs uppercase tracking-wider text-slate-400">{m.label}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums text-slate-900">{m.value}</span>
          {m.pill && <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium',
            m.value >= 80 ? 'bg-green-50 text-green-700' :
            m.value >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
          )}>{m.value >= 80 ? '良好' : m.value >= 60 ? '一般' : '预警'}</span>}
        </div>
        {/* sparkline */}
      </div>
    ))}
  </div>
</div>
```

### U10.3 — 项目概览卡片网格

`xl:grid-cols-3 gap-6`。每卡：项目名 + 进度条 + 健康色点 + 2 关键指标。
异常项目 `border-l-4 border-orange-500` 置顶，正常 `border border-slate-200`。
卡片 `card-hover`。

### U10.4 — Insight 异常摘要

```tsx
{anomalyCount > 0 ? (
  <div className="rounded-xl border border-orange-200 bg-orange-50 p-5">
    <div className="text-lg font-semibold text-orange-800">{anomalyCount} 个项目异常</div>
    <ul className="mt-2 space-y-1 text-sm text-orange-700">
      {topReasons.map(r => <li key={r}>· {r}</li>)}
    </ul>
  </div>
) : (
  <EmptyState icon={CheckCircle} title="所有项目运行正常" />
)}
```

### U10.r — Phase 10 编译验证 [前置: U10.4]

---

## Terminology: 术语人性化

### U.terms.dashboard — Dashboard 文案术语替换 [覆盖: R284, R285]

文件：`client/src/pages/Dashboard.tsx`，以及 Dashboard/TodayLive 相关子组件。

1. 将「以计划完成日期为准」替换为「今天需要完成的」。
2. 将「今天触发且尚未确认的系统预警」替换为「需要你关注的预警」。
3. 保持原有排序、筛选、空状态逻辑不变，只替换面向用户的展示文案。

### U.terms.risk — RiskManagement 文案术语替换 [覆盖: R286]

文件：`client/src/pages/RiskManagement.tsx`，以及 RiskManagement 数据质量/置信度相关子组件。

1. 将「数据置信度」替换为「数据可靠性」。
2. 若 tooltip 或说明文中解释置信度含义，同步改为「数据可靠性」口径，避免同屏出现两个术语。

### U.terms.planning — Planning 文案术语替换 [覆盖: R287-R293, R295]

文件：`client/src/pages/planning/**`，以及 Planning 相关子组件。

1. 「骨架差异」→「计划变更对比」。
2. 「修订池」→「待处理的变更」。
3. 「映射状态」→「关联状态」。
4. 「重排」→「编辑模式」。
5. 「草稿锁」→「编辑锁定」。
6. 「提升为上级」→「升级」。
7. 「降为子级」→「降级」。
8. 「批量移入」→「纳入本月计划」；「批量移出」→「移出本月计划」；合并文案「批量移入/移出」→「纳入/移出本月计划」。
9. 只替换 UI 展示文案，不修改变量名、接口字段、数据库枚举和测试 fixture 中的技术标识。

### U.terms.gantt — GanttView 文案术语替换 [覆盖: R294]

文件：`client/src/pages/GanttView.tsx`，以及 GanttView 相关子组件。

1. 将面向用户展示的「滞后」替换为「异常（进度落后）」。
2. 指标合并到「异常」时保留 tooltip 解释：「进度落后但未超期的任务」。
3. 不改动内部状态名、接口字段或依赖计算逻辑。

### U.terms.r — 术语替换验证 [前置: U.terms.dashboard, U.terms.risk, U.terms.planning, U.terms.gantt]

1. 残留检查：
```bash
rg "以计划完成日期为准|今天触发且尚未确认的系统预警|数据置信度|骨架差异|修订池|映射状态|草稿锁|提升为上级|降为子级|批量移入|批量移出" client/src/
rg "滞后" client/src/pages/GanttView.tsx client/src/pages/gantt/ client/src/components/gantt/
```
2. 新术语检查：
```bash
rg "今天需要完成的|需要你关注的预警|数据可靠性|计划变更对比|待处理的变更|关联状态|编辑锁定|纳入本月计划|移出本月计划|异常（进度落后）" client/src/
```
3. 编译验证：`npx tsc -p client/tsconfig.json --noEmit`。

---

## Onboarding: 新用户引导

### U.onboard — OnboardingGuide 组件

文件：新建 `client/src/components/OnboardingGuide.tsx`，在 `App.tsx` 根级挂载。

```tsx
// 检测 localStorage 'onboarding_completed'
// 5 步 tooltip 引导：侧边栏 → Dashboard 指标 → 计划编制入口 → 甘特图 → 报表
// 底部圆点进度 ● ● ○ ○ ○
// "跳过引导" 按钮 text-sm text-slate-400 hover:text-slate-600
// 完成后 toast "欢迎使用 WorkBuddy！"
// 引导完成后显示「每日工作流」卡片（可关闭）：
//   Dashboard → TodayLive → 甘特图 → 报表，流程箭头串联
//   bg-blue-50 border border-blue-200 rounded-xl p-4
```

### U.onboard.r — Onboarding 编译验证

---

## Release QA: 295 条上线测试门禁

> 以下为上线验收步骤，不新增需求编号；用于证明 R001-R295 已实现、未回归、可发布。每个步骤必须产出命令日志或截图证据，汇总到 `docs/reports/uiux-295-release-evidence.md`。

### U.qa.trace — 295 条需求追踪矩阵 [前置: U.onboard.r]

1. 生成/更新 `docs/reports/uiux-295-release-evidence.md`，字段至少包含：`需求ID | 执行步骤 | 验证方式 | 证据 | 结果 | 备注`。
2. 确认 `R001-R295` 连续、无重复、无缺失；确认每条需求都有对应叶子步骤和至少 1 条验证证据。
3. 文档一致性检查：
```bash
node -e "const fs=require('fs');const req=fs.readFileSync('docs/plans/UI_UX需求清单.md','utf8');const exec=fs.readFileSync('docs/plans/UI_UX优化执行方案.md','utf8');const ids=[...req.matchAll(/\|\s*(R\d{3})\s*\|/g)].map(m=>m[1]);const headings=new Set([...exec.matchAll(/^#{2,4}\s+(U[^\s—]+)\s*[—-]/gm)].map(m=>m[1]));const refs=[...req.matchAll(/\|[^\n]*\|\s*(U[^\s|]+)\s*\|/g)].map(m=>m[1]);const missing=[];for(let i=1;i<=295;i++){const id='R'+String(i).padStart(3,'0');if(!ids.includes(id)) missing.push(id)};const bad=[...new Set(refs.filter(r=>!headings.has(r)))];if(ids.length!==295||new Set(ids).size!==295||missing.length||bad.length){console.error({count:ids.length,unique:new Set(ids).size,missing,bad});process.exit(1)};console.log('UIUX requirements trace OK: 295/295')"
```

### U.qa.static — 静态质量门禁 [前置: U.qa.trace]

必须全部通过：
```bash
npm run lint --workspace=client
npm run typecheck --workspace=client
npm run typecheck --workspace=server
npm run test:run --workspace=client
npm run test --workspace=server
npm run build
```

覆盖重点：基础组件、Tooltip/Select/Button/Card/Separator 替换、Dialog 表单校验、Planning/Gantt 关键交互、4 个后端新增/修改接口。

### U.qa.contract — 后端接口与数据契约门禁 [前置: U.qa.static]

1. 为 U1.0/U2.0/U3.0/U4.0 涉及接口补齐或更新 server 侧测试：Dashboard TodayLive、Reports 四模块 key、Risk 管道阶段计数、Materials 分类饼图。
2. 路由与核心链路检查：
```bash
npm run guard:route-aggregation --workspace=server
npm run verify:workflow-contract
npm run diag:health
npm run diag:summary
npm run diag:warning
```
3. 验收标准：接口字段名、枚举值、空数据返回、错误返回、权限失败返回均与前端消费逻辑一致。

### U.qa.browser — 端到端浏览器回归门禁 [前置: U.qa.contract]

先准备完整应用测试环境，再运行三组浏览器套件：
```bash
npm run prepare:test-env:full-app
npm run verify:browser-suite:shell-and-collab
npm run verify:browser-suite:project-chains
npm run verify:browser-suite:planning-and-tooling
```

覆盖页面：Dashboard、Reports、RiskManagement、GanttView、PlanningWorkspace/Baseline/Monthly/Closeout、Materials、Milestones、AcceptanceTimeline、PreMilestones、Drawings、Notifications、TaskSummary、ResponsibilityView、CompanyCockpit、Onboarding。

验收标准：无 JS runtime error、无接口 4xx/5xx 异常、关键按钮可点击、Dialog/Popover/Dropdown/Tooltip 可打开关闭、空状态/加载/错误态都可见。

### U.qa.visual — 视觉回归与响应式门禁 [前置: U.qa.browser]

新增或更新 Playwright 视觉验证脚本，至少覆盖以下视口：

| 视口 | 用途 |
|------|------|
| 1440×900 | 标准桌面，上线主验收 |
| 1366×768 | 低高度桌面，检查首屏密度 |
| 768×1024 | 平板，检查布局换行 |
| 390×844 | 手机，检查文本溢出与抽屉/弹层 |

必须截图覆盖 16 个主页面和 Planning/Gantt 高风险弹层。验收标准：
1. 无水平滚动、无文字重叠、无按钮文字溢出。
2. 卡片不套卡片，页面 section 不漂浮成大卡片。
3. 弹层 z-index 正确，Popover/Tooltip/Dialog 不互相遮挡。
4. 关键视觉改造项能在截图中看到：4 卡指标、Tab 角标、左色条、进度条、底部栏、EmptyState。
5. 初次商业化优化允许建立新基线；后续回归截图 diff 超过 0.2% 必须人工确认。

### U.qa.a11y — 可访问性与键盘门禁 [前置: U.qa.visual]

1. 键盘路径：Tab 顺序与视觉顺序一致；Shift+Tab 可回退；Enter/Space 可触发按钮；Esc 可关闭 Dialog/Popover/Dropdown。
2. 焦点样式：所有可交互元素必须有 `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2` 或等价样式。
3. 语义与读屏：Dialog 有标题，表单 input 有 label，错误提示用 `role="alert"` 或 `aria-live="polite"`，Tooltip 不替代必需 label。
4. 颜色对比：正文/按钮/Badge/状态色满足 WCAG AA；重点复核 `text-white` on `bg-red-500`、amber/orange 状态色。
5. 动效偏好：`prefers-reduced-motion: reduce` 下动画关闭或降级。

### U.qa.performance — 性能与包体门禁 [前置: U.qa.a11y]

必须全部通过：
```bash
npm run build
npm run verify:client-bundle-budget
npm run verify:performance-evidence
```

浏览器侧复核：
1. 首屏页面在预发环境无明显白屏；Skeleton/Loading 不超过 10s，超时需 toast。
2. Dashboard、Reports、GanttView、Planning、CompanyCockpit 五个重页面滚动不卡顿。
3. GanttView 大数据场景（50+ 任务）横道图缩放/拖拽可用。
4. 控制台无 React key warning、layout thrashing 相关高频警告。

### U.qa.release — 上线前冒烟与回滚门禁 [前置: U.qa.performance]

1. 在预发环境跑完整冒烟：登录/切项目/进入 16 个主页面/打开关键弹层/执行一次非破坏性操作/登出。
2. 检查生产环境配置：`npm run env:status`，确认 API base URL、Sentry、Supabase、权限配置正确。
3. 迁移检查：如本次包含后端或数据库改动，执行 `npm run migrate:plan --workspace=server` 并记录结果；无迁移也需注明。
4. 回滚预案：记录当前可回滚版本、数据库迁移是否可逆、前端静态资源回滚方式、负责人。
5. 上线后 30 分钟观察：错误率、接口 5xx、前端控制台/Sentry、核心页面可用性。

### U.qa.r295 — 295 条需求逐条自动化断言 [前置: U.qa.release]

文件：`client/tests/e2e/uiux-r295-assertions.spec.ts`（新建）

用 Playwright 对 R001-R295 中可自动验证的需求逐条写断言，按 5 类组织：

**类型 A — CSS/Token 静态检查（~30 条：R001-R030）**：grep 脚本批量验证残留（gray-*/shadow-blue/rounded-3xl/tracking-[/text-[Npx]），与 U.final grep 互为双保险。

**类型 B — 组件存在性断言（~25 条：R037-R051, R073-R074, R279-R283）**：
- 16 页面 Breadcrumb 存在 + document.title 匹配
- Tooltip hover 后 `[role="tooltip"]` 可见
- 404 路由显示 NotFoundPage
- Onboarding 首次登录触发 + 跳过按钮 + localStorage 标记

**类型 C — 布局/容器断言（~14 条：R076/R092/R114/R205/R215/R221/R233/R240/R246/R257/R262/R272 等）**：
- 14 个 `.page-shell` 页面宽度 ≤ 1440+padding
- Metric Cards `xl:grid-cols-4` 在 1440px 下为 4 列

**类型 D — 交互/行为断言（~170 条：R079-R090, R127-R157, R162-R196 等）**：
- Compact Header 折叠/展开
- TodayLive 最多 5 条 + "查看全部(N)"
- Tab 切换 + 内容区可见
- 右键菜单弹出 + 破坏性操作弹 ConfirmDialog
- 筛选栏无"应用"按钮（实时生效）
- 树表默认 8 列 + "更多列" Popover
- BottomBar 居中 + 按钮分组
- RevisionPoolDialog 3 步进度指示器
- 双数据源选择器当前源高亮
- 级联选择器面包屑路径
- Loading 按钮 disabled + 10s 超时恢复 + toast
- 空状态 3 变体（default/filter/error）

**类型 E — 术语替换断言（12 条：R284-R295）**：
- 旧术语不可见 + 新术语可见

**不可自动验证（~45 条，标记 MANUAL_REVIEW）**：
- 动画时序（stagger 60ms、duration-700）
- 视觉感受（热力图色阶、流程图箭头、进度条动画平滑度）
- 信息密度/留白比例（设计原则）

预计：~250 条自动断言 + ~45 条 MANUAL_REVIEW。

### U.qa.component — 组件级视觉快照 [前置: U.qa.r295]

文件：`client/tests/e2e/uiux-component-snapshots.spec.ts`（新建）

Playwright 截图建立组件各状态视觉基线，首次运行建立基线，后续回归 diff 阈值 0.2%。

**基础组件（~20 张）**：
- Button：primary/secondary/outline × default/hover/disabled/loading
- Card：default/hover/selected
- Input：default/focus/error
- Badge：default/secondary/destructive/outline
- EmptyState：default/filter/error
- Separator/Skeleton/Avatar

**复合组件（~15 张）**：
- Tooltip 显示态、SectionHeader 有/无操作、CollapsibleSection 展开/折叠
- Sparkline 有数据/无数据、AnimatedNumber 静态、MetricCard 正常/趋势上升/下降
- Breadcrumb 2/3/4 级、NotFoundPage、OnboardingGuide 步骤 1/3/5

**弹层/抽屉（~20 张）**：
- ConfirmActionDialog 默认/破坏性
- LoginDialog 默认/错误态/密码可见
- EditProfileDialog/ChangePasswordDialog 默认/错误态
- SkeletonDiffDialog 差异对比、RevisionPoolDialog 步骤 1/2/3
- BaselineConfirmDialog 摘要/展开、TypeManagerDialog Tab1/Tab2
- CriticalPathDialog 图谱+图例
- AcceptanceDetailDrawer/CloseoutDetailDrawer 展开
- Notifications Settings Popover 展开

预计总截图 ~55 张。

### U.qa.interaction — 交互行为 E2E 测试 [前置: U.qa.component]

文件：`client/tests/e2e/uiux-interaction.spec.ts`（新建）

验证商业方案交互规范的运行时行为：

**1. Loading 按钮（2 case）**：点击后 disabled + "提交中..." + 10s 超时恢复 + toast
**2. Hover 效果（2 case）**：card-hover shadow 变化 + translateY
**3. Tab 切换（2 case）**：Dashboard/Reports Tab 激活态 + 内容区切换
**4. 折叠/展开（2 case）**：Compact Header + CollapsibleSection
**5. ConfirmDialog 流程（2 case）**：取消关闭 + 确认执行（破坏性按钮为红色）
**6. 空状态变体（3 case）**：default/filter("清除筛选"按钮)/error("重试"按钮)
**7. 键盘导航（3 case）**：Skip Link 可聚焦 + Dialog 焦点陷阱 + Esc 关闭 + focus-visible ring
**8. Onboarding 流程（2 case）**：新用户触发 + 跳过设 localStorage
**9. prefers-reduced-motion（1 case）**：reduce 模式下动画关闭
**10. 右键菜单视口边界（1 case）**：菜单不溢出屏幕
**11. 双击编辑提示（1 case）**：hover 显示铅笔图标
**12. 筛选实时生效（1 case）**：GanttView 无"应用"按钮

预计 ~22 个 test case。

### U.qa.token-audit — Token 一致性浏览器审计 [前置: U.qa.interaction]

文件：`client/tests/e2e/uiux-token-audit.spec.ts`（新建）

在浏览器 DOM 中审计 Token 落地（与 U.final grep 源码检查互补——grep 查源码，此步查运行时 DOM）：

对 16 个主页面逐一验证：
1. DOM 中无 `gray-*` class
2. DOM 中无 `text-[Npx]` 任意字号
3. DOM 中无 `rounded-3xl`
4. `font-family` 包含 `Plus Jakarta Sans`
5. 无 `window.confirm` 调用（监听 dialog 事件）
6. `--el-1` ~ `--el-4` CSS 变量已定义
7. `.page-shell` 容器 `max-width` ≤ 1440px

预计 16 × 7 = 112 个断言。

### U.qa.contrast — 颜色对比度自动化验证 [前置: U.qa.token-audit]

文件：`client/tests/e2e/uiux-contrast.spec.ts`（新建）

依赖：`npm install -D @axe-core/playwright`

1. 对 8 个核心页面运行 axe-core `color-contrast` 规则，violations 必须为 0
2. 手动验证高风险组合：
   - `text-white` on `bg-red-500`（4.0:1，AA 边界）
   - `text-white` on `bg-orange-500`（3.1:1，小文字需加深为 orange-600）
   - `text-white` on `bg-blue-600`（4.6:1，AA 通过）
   - `text-slate-400` on `bg-white`（3.5:1，仅大文字 AA）

预计 8 + 4 = 12 个 test case。

---

## U.final — 全量终审验证

前置：`U.qa.contrast`。只有 Release QA + 5 个补充测试门禁全部通过，才能标记 U.final completed。

1. 编译：`npx tsc -p client/tsconfig.json --noEmit` + `npx tsc -p server/tsconfig.json --noEmit`
2. 测试：`npx vitest run --config client/vitest.config.ts` + `npx vitest run --config server/vitest.config.ts`
3. 残留检查：
```bash
rg "gray-[0-9]" client/src/ -c
rg "text-\[[0-9]+px\]" client/src/ -c
rg "rounded-3xl|rounded-\[" client/src/ -c
rg "shadow-blue" client/src/ -c
rg "tracking-\[0\." client/src/ -c
rg "window\.confirm" client/src/ -c
rg 'title="' client/src/ -c
```
4. 补充验证（缺口覆盖）：
```bash
# B1: Popover 必须指定 align/side
rg '<PopoverContent' client/src/ --glob '*.tsx' -B1 -A2 | grep -v 'align\|side' && echo "WARN: PopoverContent missing align/side"

# B5: 有 fixed 底部栏的页面必须有 pb-20 补偿
for f in GanttView BaselinePage MonthlyPlanPage CloseoutPage; do rg "pb-20|pb-\[80px\]" client/src/pages/ --glob "*${f}*" -c || echo "WARN: ${f} missing pb-20"; done

# B7: 表格行选中状态
rg "ring-2.*ring-blue-500" client/src/pages/ --glob '*.tsx' -c || echo "INFO: check table row selected state manually"

# B8: 排序列 header 样式
rg "font-semibold.*text-slate-900" client/src/ --glob '*.tsx' -c

# B9: 图标按钮 aria-label 审计
rg '<(Button|button)' client/src/ --glob '*.tsx' -A3 | grep -c 'aria-label' || echo "INFO: audit icon-only buttons for aria-label"

# B10: 列表行高 py-3
rg "py-3" client/src/pages/ --glob '*.tsx' -c

# C3: 禁用多余色调
rg "violet-|sky-|cyan-|teal-" client/src/ --glob '*.tsx' -c && echo "WARN: unexpected color palette usage"

# C4: 禁止 linear ��画曲线
rg "linear" client/src/ --glob '*.css' --glob '*.tsx' | grep -v "node_modules\|linearGradient\|linear-gradient" && echo "WARN: linear timing found"

# A10: --brand-primary CSS 变量
rg "brand-primary" client/src/index.css -c || echo "WARN: --brand-primary not defined"
```
4. 浏览器验证清单（见方案文件末尾完整清单）
5. 确认 `docs/reports/uiux-295-release-evidence.md` 中 R001-R295 全部为 `PASS`，无 P0/P1/P2 未关闭缺陷。

---

## 执行顺序总表

| 序号 | 步骤 ID | Phase | 描述 |
|------|---------|-------|------|
| 1 | U0.1 | 0A | index.css elevation + 动画 |
| 2 | U0.2 | 0A | tailwind.config.js |
| 3 | U0.3 | 0A | 全局 utility classes |
| 4 | U0.4 | 0A | index.html 字体引入 |
| 5 | U0.4r | 0A | 0A 编译验证 |
| 6 | U0.5 | 0B | gray→slate 361处 |
| 7 | U0.6 | 0B | 字号任意值修复 |
| 8 | U0.7 | 0B | 圆角任意值修复 |
| 9 | U0.8 | 0B | blue-500→blue-600 |
| 10 | U0.9 | 0B | tracking 任意值修复 |
| 11 | U0.10 | 0B | shadow-blue 修复 |
| 12 | U0.11 | 0B | tabular-nums |
| 12b | U0.11b | 0B | 数字格式化工具函数 |
| 12c | U0.11c | 0B | Sparkline 复合组件 |
| 12d | U0.11d | 0B | AnimatedNumber 数字滚动 |
| 12e | U0.11e | 0B | useLoadingButton hook |
| 12f | U0.11f | 0B | 图表数据表格替代 |
| 13 | U0.12 | 0B | 图标尺寸标准化 |
| 14 | U0.12r | 0B | 0B 编译验证 |
| 15 | U0.13 | 0C | shadcn rounded-md→lg |
| 15b | U0.13b | 0C | 表格规范统一 |
| 16 | U0.14 | 0C | Tooltip 组件 |
| 17 | U0.15 | 0C | Separator 组件 + 239处替换 |
| 17b | U0.15b | 0C | Checkbox 组件（备用） |
| 18 | U0.16 | 0C | ConfirmDialog 统一 |
| 18b | U0.16b | 0C | Dialog 尺寸分级/blur/ease-bounce |
| 19 | U0.16r | 0C | 0C 编译验证 |
| 20 | U0.17 | 0D | PageErrorBoundary |
| 20b | U0.17b | 0D | Skip Link |
| 21 | U0.18 | 0D | useScrollRestoration |
| 22 | U0.19 | 0D | PageSkeleton |
| 22b | U0.19b | 0D | PageSkeleton 挂载到路由 |
| 22c | U0.19c | 0D | EmptyState 分级变体 |
| 23 | U0.20 | 0D | NotFoundPage + 路由 |
| 24 | U0.21 | 0D | SectionHeader |
| 25 | U0.22 | 0D | CollapsibleSection |
| 26 | U0.22r | 0D | 0D 编译验证 |
| 27 | U0.23 | 0E | title→Tooltip 125处/37文件 |
| 28 | U0.24 | 0E | native select→Select |
| 29 | U0.25 | 0E | native button→Button 120+处/25文件 |
| 29b | U0.25b | 0E | Button active 状态 |
| 30 | U0.26 | 0E | PageHeader badge |
| 31 | U0.27 | 0E | Avatar 替换 |
| 32 | U0.28 | 0E | LoginDialog 表单体验 |
| 32b | U0.28b | 0E | ApplyModal/CreateModal 表单校验 |
| 33 | U0.28r | 0E | 0E 编译验证 |
| 34 | U0.29 | 0F | Card div 收口 105处/40文件 |
| 35 | U0.30 | 0F | Sidebar 精细化 |
| 36 | U0.31 | 0F | MASTER.md 同步 |
| 37 | U0.31r | 0F | 0F 编译验证 |
| 38 | U0.final | 0 | Phase 0 全量验证 |
| 39 | U14.1 | 14 | 面包屑 + title |
| 40 | U14.r | 14 | Phase 14 验证 |
| 41 | U1.0 | 1 | Dashboard 后端接口 |
| 42 | U1.1 | 1 | Dashboard 容器+字号 |
| 43 | U1.2 | 1 | Compact Header |
| 44 | U1.3 | 1 | 核心指标区 |
| 45 | U1.4 | 1 | TodayLive 紧凑列表 |
| 46 | U1.5 | 1 | 分析区 Tab 化 |
| 47 | U1.r | 1 | Phase 1 验证 |
| 48 | U2.0 | 2 | Reports S-Curve 接口 |
| 49 | U2.1 | 2 | Reports 容器+chip |
| 50 | U2.2 | 2 | 模块A 进度总览 |
| 51 | U2.3 | 2 | 模块B 进度偏差 |
| 52 | U2.4 | 2 | 模块C 风险与问题 |
| 53 | U2.5 | 2 | 模块D 变更记录 |
| 54 | U2.r | 2 | Phase 2 验证 |
| 55 | U3.0 | 3 | RiskMgmt 管道接口 |
| 56 | U3.1 | 3 | RiskMgmt 容器+指标 |
| 57 | U3.2 | 3 | 链路流程图 |
| 58 | U3.3 | 3 | OverviewCard 色条 |
| 59 | U3.4 | 3 | TrendSummary 合并 |
| 60 | U3.5 | 3 | 列表区统一 |
| 61 | U3.6 | 3 | 三流关系提示 |
| 62 | U3.r | 3 | Phase 3 验证 |
| 63 | U8.1 | 8 | GanttView toast |
| 64 | U8.2 | 8 | Dialog 色调统一 |
| 65 | U8.3 | 8 | TypeManager 分步 |
| 66 | U8.4 | 8 | 右键菜单优化 |
| 67 | U8.5 | 8 | 底部操作栏 |
| 68 | U8.6 | 8 | 关键路径图谱 |
| 69 | U8.7 | 8 | 横道图视图 |
| 70 | U8.8 | 8 | 统计卡片精简 |
| 71 | U8.9 | 8 | 筛选栏实时生效 |
| 72 | U8.10 | 8 | hover 按钮精简 |
| 73 | U8.11 | 8 | 双击编辑提示 |
| 74 | U8.12 | 8 | 数据质量提示 |
| 75 | U8.r | 8 | Phase 8 验证 |
| 76 | U9a.1 | 9a | PlanningWorkspace 容器 |
| 77 | U9a.2 | 9a | 治理仪表盘折叠 |
| 78 | U9a.3 | 9a | 无基线引导横幅 |
| 79 | U9a.r | 9a | 9a 验证 |
| 80 | U9b.1 | 9b | BaselinePage 列控制 |
| 81 | U9b.2 | 9b | BottomBar 居中 |
| 82 | U9b.3 | 9b | ConfirmDialog 分层 |
| 83 | U9b.4 | 9b | RevisionPool 分步 |
| 84 | U9b.5 | 9b | 详情抽屉统一 |
| 85 | U9b.6 | 9b | 创建入口引导 |
| 86 | U9b.7 | 9b | 双击编辑+快捷键 |
| 87 | U9b.8 | 9b | 层级操作术语 |
| 88 | U9b.9 | 9b | 版本切换+草稿锁 |
| 89 | U9b.r | 9b | 9b 验证 |
| 90 | U9c.1 | 9c | MonthlyPlan 列+底部栏 |
| 91 | U9c.2 | 9c | Dialog 统一 |
| 92 | U9c.3 | 9c | 双数据源选择器 |
| 93 | U9c.4 | 9c | 快速/标准确认 |
| 94 | U9c.5 | 9c | 月滑块+批量术语 |
| 95 | U9c.6 | 9c | 重新生成+草稿恢复 |
| 96 | U9c.7 | 9c | 撤销/重做快捷键 |
| 97 | U9c.r | 9c | 9c 验证 |
| 98 | U9d.1 | 9d | CloseoutPage 级联 |
| 99 | U9d.2 | 9d | BatchBar+Drawer |
| 100 | U9d.3 | 9d | 升级阶梯说明 |
| 101 | U9d.r | 9d | 9d 验证 |
| 102 | U4.0 | 4 | Materials 后端接口 |
| 103 | U4.1 | 4 | Materials 容器+指标 |
| 104 | U4.2 | 4 | 主体 7:3 分栏 |
| 105 | U4.3 | 4 | 删除 ConfirmDialog |
| 106 | U4.4 | 4 | 表格规范 |
| 107 | U4.r | 4 | Phase 4 验证 |
| 108 | U5.1 | 5 | Milestones 容器+指标 |
| 109 | U5.2 | 5 | HealthSummary 精简 |
| 110 | U5.3 | 5 | 里程碑列表色条 |
| 111 | U5.r | 5 | Phase 5 验证 |
| 112 | U7.1 | 7 | AcceptanceTimeline 容器 |
| 113 | U7.2 | 7 | 进度概览条 |
| 114 | U7.3 | 7 | 圆角+z-index |
| 115 | U7.4 | 7 | 详情抽屉统一 |
| 116 | U7.5 | 7 | 流程图节点 |
| 117 | U7.6 | 7 | 视图切换 Tab |
| 118 | U7.r | 7 | Phase 7 验证 |
| 119 | U12.1 | 12 | PreMilestones 容器 |
| 120 | U12.2 | 12 | 视图切换 Tab |
| 121 | U12.3 | 12 | Board 视图卡片 |
| 122 | U12.4 | 12 | Ledger 视图表格 |
| 123 | U12.5 | 12 | 详情抽屉统一 |
| 124 | U12.6 | 12 | 维度对齐 |
| 125 | U12.r | 12 | Phase 12 验证 |
| 126 | U11.1 | 11 | Drawings 容器+指标 |
| 127 | U11.2 | 11 | 表格优化 |
| 128 | U11.3 | 11 | 工具栏+Focus View |
| 129 | U11.4 | 11 | 就绪度可视化 |
| 130 | U11.5 | 11 | window.confirm 替换 |
| 131 | U11.r | 11 | Phase 11 验证 |
| 132 | U6.1 | 6 | Notifications 容器 |
| 133 | U6.2 | 6 | Header 精简 |
| 134 | U6.3 | 6 | Tab 精简 |
| 135 | U6.4 | 6 | Settings z-index |
| 136 | U6.5 | 6 | 通知条目精简 |
| 137 | U6.6 | 6 | 空状态 |
| 138 | U6.r | 6 | Phase 6 验证 |
| 139 | U13.1 | 13 | TaskSummary 容器 |
| 140 | U13.2 | 13 | 汇总指标 |
| 141 | U13.3 | 13 | 分组 Section |
| 142 | U13.4 | 13 | 任务列表规范 |
| 143 | U13.r | 13 | Phase 13 验证 |
| 144 | U13b.1 | 13b | ResponsibilityView 容器 |
| 145 | U13b.2 | 13b | 指标区统一 |
| 146 | U13b.3 | 13b | 维度切换 |
| 147 | U13b.4 | 13b | 术语人性化 |
| 148 | U13b.5 | 13b | 监控区/分析区 |
| 149 | U13b.r | 13b | Phase 13b 验证 |
| 150 | U10.1 | 10 | CompanyCockpit 容器 |
| 151 | U10.2 | 10 | Hero 区 |
| 152 | U10.3 | 10 | 项目概览卡片 |
| 153 | U10.4 | 10 | Insight 异常摘要 |
| 154 | U10.r | 10 | Phase 10 验证 |
| 155 | U.terms.dashboard | terms | Dashboard 术语替换 |
| 156 | U.terms.risk | terms | RiskManagement 术语替换 |
| 157 | U.terms.planning | terms | Planning 术语替换 |
| 158 | U.terms.gantt | terms | GanttView 术语替换 |
| 159 | U.terms.r | terms | 术语替换验证 |
| 160 | U.onboard | — | OnboardingGuide |
| 161 | U.onboard.r | — | Onboarding 验证 |
| 162 | U.qa.trace | QA | 295条需求追踪矩阵 |
| 163 | U.qa.static | QA | 静态质量门禁 |
| 164 | U.qa.contract | QA | 后端接口与数据契约 |
| 165 | U.qa.browser | QA | 端到端浏览器回归 |
| 166 | U.qa.visual | QA | 视觉回归与响应式 |
| 167 | U.qa.a11y | QA | 可访问性与键盘 |
| 168 | U.qa.performance | QA | 性能与包体 |
| 169 | U.qa.release | QA | 冒烟与回滚 |
| 170 | U.qa.r295 | QA | 295 条需求逐条自动化断言 |
| 171 | U.qa.component | QA | 组件级视觉快照 (~55 张) |
| 172 | U.qa.interaction | QA | 交互行为 E2E (~22 case) |
| 173 | U.qa.token-audit | QA | Token 一致性浏览器审计 (16×7) |
| 174 | U.qa.contrast | QA | 颜色对比度 axe-core (8+4) |
| 175 | U.final | — | 全量终审验证 |

共 170 + 13 补充步骤 + 5 测试门禁 = 188 个叶子步骤。

编译+测试+浏览器验证+grep残留检查。
