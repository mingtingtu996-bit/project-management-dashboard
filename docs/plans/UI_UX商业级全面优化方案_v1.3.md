# WorkBuddy UI/UX 商业级全面优化方案

## Context

> 母文件需求总数：**295 条**（R001-R295）。上线测试门禁用于证明 295 条可发布，不计入需求数量。

WorkBuddy 是建筑工程项目管理 SaaS。目标：从"功能堆砌型"提升为"商业级精致产品"，大幅降低新手认知负担。
- **约束**：仅改前端为主；纯网页端，不考虑移动端。为新手易理解可适当调整少量后端接口（标注在文末）。
- **设计风格**：Swiss Modernism 2.0，Plus Jakarta Sans 字体。已 persist 到 `design-system/workbuddy/MASTER.md`。
- **颜色约束**：primary 保持蓝色系（4 个专项方案要求"延续蓝色强调色"）；新增 accent(orange-500) 用于 CTA；关键路径三色系统（红/橙/琥珀）不可改动。
- **两类页面**：操作区（GanttView、Planning、Materials）→ 易理解好操作；报表展示区（Dashboard、Reports、RiskManagement、Milestones、TaskSummary）→ 逻辑清晰、轻重缓急一目了然。

---

## 全局设计原则

以下原则适用于所有 Phase 的所有改动，不再在各 Phase 中重复。

### ① 设计原则层（品牌调性 & 风格基底）
- **风格**：Swiss Modernism 2.0 — 几何网格、无衬线字体、高对比、功能优先
- **品牌调性**：专业严谨但不冰冷 — 建筑工程行业的可靠感 + SaaS 产品的现代感
- **留白策略**：内容区占页面宽度 ≤ 75%，两侧留白 ≥ 12.5%；卡片内容不贴边（`p-5` 最小内边距）
- **对比度策略**：正文 ≥ 4.5:1（`text-slate-600` on `bg-white` = 5.7:1 ✓）；辅助文字 ≥ 3:1（`text-slate-400` on `bg-white` = 3.5:1 ✓）
- **信息密度原则**：操作区允许中等密度（工具栏+表格）；报表区低密度（大数字+图表+留白）
- **反模式清单**：
  - ❌ 不用 emoji 做图标（用 Lucide SVG）
  - ❌ 不用渐变背景（除 CompanyCockpit Hero 的 `from-blue-50 to-slate-50` 微渐变）
  - ❌ 不用 AI 紫/粉色系
  - ❌ 不用 2D 纯平面布局（需 elevation 层次感）
  - ❌ 不用 `scale` 变换做 hover（会导致布局抖动），用 `translateY` + `shadow` 替代

### 审美标准
- 每个页面最多 3 层视觉层级（标题→内容→辅助），通过字号/字重/颜色深浅区分
- 每个页面有且仅有 1 个视觉焦点区域
- 同一屏幕内最多 3 种色调（主色+1 语义色+灰色）

### 统一 Token
| Token | 统一值 |
|-------|--------|
| 页宽 | `.page-shell`: `max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8 py-6 lg:py-8 space-y-8` |
| 圆角 | 3 级：`rounded-lg`(8px 按钮/Badge) / `rounded-xl`(12px 卡片) / `rounded-2xl`(16px Dialog) |
| 阴影 | 4 级 elevation：`--el-1: 0 1px 3px rgba(0,0,0,0.04)` / `--el-2: 0 4px 12px rgba(0,0,0,0.06)` / `--el-3: 0 8px 24px rgba(0,0,0,0.08)` / `--el-4: 0 20px 40px rgba(0,0,0,0.12)` |
| 间距 | section `space-y-8`, 卡片间 `gap-6`, 卡片内 `gap-4` |
| 字体 | Plus Jakarta Sans + Inter fallback |
| 图标尺寸 | 4 级：`h-3.5 w-3.5`(紧凑/表格内) / `h-4 w-4`(行内) / `h-5 w-5`(卡片标题) / `h-8 w-8`(空状态) |
| 卡片内边距 | 统一 `p-5`(20px)，标题与内容间距 `mb-3` |

### 字号规范（消除所有 text-[Npx] 任意值）
| 用途 | 统一值 |
|------|--------|
| 页面标题 | `text-2xl font-semibold tracking-tight text-slate-900` |
| Section 标题 | `text-lg font-semibold text-slate-900` |
| 卡片标题 | `text-base font-medium text-slate-900` |
| 正文 | `text-sm leading-relaxed text-slate-600` |
| 辅助/最小 | `text-xs text-slate-400` |
| Metric label | `text-xs uppercase tracking-wider text-slate-400` |
| 大数字 | `text-3xl font-bold tabular-nums text-slate-900` |
| 小数字 | `text-xl font-semibold tabular-nums text-slate-900` |

### 数字美化
- 数据表格数字列：`tabular-nums`（等宽对齐）
- 百分比：数字正常 + `%` 用 `text-slate-400 text-sm`
- 趋势：`↑ +3` 绿色 / `↓ -2` 红色 / `→ 0` 灰色
- 千位分隔：>999 加逗号
- 日期：统一 `YYYY-MM-DD`，`tabular-nums text-slate-500`

### ② 视觉系统层补充（统一性 & 高级感）

**Focus 状态规范**：
- 所有可交互元素：`focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none`
- Tab 键导航顺序必须与视觉顺序一致
- 选中状态（如表格行选中）：`ring-2 ring-blue-500`（需求文档要求）

**字体加载策略**：
- `font-display: swap` 防止 FOIT（不可见文字闪烁）
- Plus Jakarta Sans 加载前用 Inter 作为 fallback（字形相近，减少布局偏移）
- `index.html` 中 preconnect Google Fonts：`<link rel="preconnect" href="https://fonts.googleapis.com">`

**色彩对比度验证**：
| 组合 | 对比度 | 标准 |
|------|--------|------|
| `text-slate-900` on `bg-white` | 15.4:1 | ✓ AAA |
| `text-slate-600` on `bg-white` | 5.7:1 | ✓ AA |
| `text-slate-400` on `bg-white` | 3.5:1 | ✓ AA (大文字) |
| `text-white` on `bg-blue-600` | 4.6:1 | ✓ AA |
| `text-white` on `bg-red-500` | 4.0:1 | ⚠ 需验证 |
| `text-white` on `bg-orange-500` | 3.1:1 | ⚠ 大文字可用，小文字需加深为 orange-600 |

**阴影系统对齐**（方案 elevation vs MASTER.md shadow）：
- 方案 `--el-1` ~ `--el-4` 为实施标准，覆盖 MASTER.md 中的 `--shadow-sm` ~ `--shadow-xl`
- Phase 0 实施时同步更新 MASTER.md 的 Shadow Depths 表

### 颜色规则
- 灰色系统一用 `slate-*`，禁止 `gray-*` / `neutral-*` / `zinc-*`
- 蓝色统一：primary 按钮 `bg-blue-600`，hover `hover:bg-blue-500`
- 多余色调：violet/sky/cyan/teal 仅在关键路径三色系统中保留语义用途
- ⚠ 具体替换执行见 Phase 0 第 5/7 项

### 交互标准
| 交互 | 规范 |
|------|------|
| Hover | 所有可点击元素：`hover:bg-slate-50 transition-colors duration-150` + `cursor-pointer` |
| Active | 按钮：`active:scale-[0.98] transition-transform duration-75`（注：仅 active/pressed 允许微缩，hover 禁用 scale） |
| 过渡 | 统一 `duration-200 ease-out`；hover `duration-150`；展开折叠 `duration-300` |
| 加载/空状态 | 详见 ⑤ 微观细节层的 Skeleton 加载规范 和 空状态分级 |
| 错误 | 所有用户可感知失败必须 toast |
| 破坏性操作 | 必须 ConfirmDialog |
| 面包屑 | 所有项目级子页面必须有 |
| 筛选 | 报表区内嵌 chips；操作区工具栏 Select |
| 截断列表 | 必须显示"共 N 条"或"查看全部(N)" |
| "查看全部" | 统一 `text-sm text-blue-600 hover:underline`，放 section 标题右侧 |
| 同级卡片区分 | 左边框色条区分类型 |
| 双击编辑 | hover 显示铅笔图标 `opacity-0 group-hover:opacity-60 h-3.5 w-3.5`，提示可双击编辑 |
| 键盘快捷键 | 编辑态显示快捷键提示 `text-xs text-slate-400`；工具栏按钮加快捷键 tooltip |

### ③ 组件层补充（精致 & 专业）

**组件状态矩阵**（所有交互组件必须覆盖）：
| 状态 | 视觉表现 | 适用组件 |
|------|---------|---------|
| Default | 基础样式 | 全部 |
| Hover | `hover:bg-slate-50` / `hover:shadow-[var(--el-2)]` + `cursor-pointer` | Button/Card/ListItem/Tab |
| Active/Pressed | `active:scale-[0.98]` + 颜色加深 | Button |
| Focus | `focus-visible:ring-2 ring-blue-500 ring-offset-2` | Button/Input/Select/Tab |
| Disabled | `opacity-50 cursor-not-allowed pointer-events-none` | Button/Input/Select |
| Loading | `disabled` + spinner 图标 + 文字变"...中" | Button（异步操作） |
| Selected | `bg-blue-50 border-blue-500 ring-2 ring-blue-500` | 表格行/卡片/Tab |
| Error | `border-red-500 text-red-600` + `role="alert"` | Input/Form |

**Popover/Dropdown 定位规范**：
- 必须指定 `align` 和 `side`：`<PopoverContent align="start" side="bottom">`
- 不使用默认定位（避免遮挡触发元素）
- 超出视口时自动翻转（Radix UI 内置）

**表格组件规范**：
- 数据表格使用 shadcn `<Table>` 组件（`TableHeader/TableBody/TableRow/TableCell`）
- 禁止用 `div + grid` 模拟表格布局（可访问性差）
- 表头 sticky：`sticky top-0 z-10 bg-white`

**Modal/Dialog 规范**：
- 背景遮罩：`bg-black/50 backdrop-filter: blur(4px)`
- 尺寸分级：简单确认 `max-w-[440px]`、标准表单 `max-w-[560px]`、复杂内容(多步骤/对比) `max-w-[720px]`，均 `w-[90%]`
- 样式：`rounded-2xl p-6 shadow-[var(--el-4)]`
- 入场动画：`cubic-bezier(0.34, 1.56, 0.64, 1) duration-200`（在 tailwind.config.js 注册为 `ease-bounce`）
- 关闭方式：右上角 X 按钮 + ESC 键 + 遮罩点击（破坏性操作除外）
- 焦点陷阱：Dialog 打开时焦点锁定在内部

**表单校验规范**：
- 所有 input 必须有关联 `<label>`（`htmlFor` 绑定），禁止 placeholder-only
- 校验时机：onBlur 实时校验（非仅 submit 时），错误信息显示在字段下方
- 错误样式：`border-red-500` + 下方 `text-sm text-red-600` 错误文字 + `role="alert"`
- 提交反馈：Loading → Success toast / Error toast，禁止无反馈
- 涉及 Dialog：ChangePasswordDialog / EditProfileDialog / MilestoneDialog / LoginDialog / ApplyModal / CreateModal

### 现代视觉效果
- 卡片 hover 浮起：`hover:shadow-[var(--el-2)] hover:-translate-y-0.5 transition-all duration-200`
- 进度条动画：`transition-[width] duration-700 ease-out`
- 数字滚动（Metric Card 大数字切换时）：用 `framer-motion` 的 `useSpring` + `useTransform`，300ms ease-out
- Sparkline 微图：用 recharts `<ResponsiveContainer><LineChart>` 无轴无网格模式，高 32px 宽 80px
- 卡片入场：Phase 0 在 `index.css` 注册 `@keyframes fade-in { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`，Tailwind 配置 `animate-fade-in`，stagger 用 `animation-delay: calc(var(--index) * 60ms)`
- 折叠展开：Phase 0 在 `index.css` 注册 `@keyframes expand-down { from { height:0; opacity:0; overflow:hidden } to { height:var(--radix-collapsible-content-height); opacity:1 } }`，Tailwind 配置 `animate-expand-down duration-300`
- 饼图/柱状图/折线图：统一用 recharts（已有依赖），`<PieChart>`/`<BarChart>`/`<LineChart>`
- 所有动画加 `motion-safe:` 前缀

### 复合组件统一规范
| 组件类型 | 统一方案 |
|---------|---------|
| Stat/Metric 行 | 统一 `grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4`；超过 4 个指标合并或分行 |
| 列表区 | 统一模式：内嵌搜索+chips 筛选+列表+分页 |
| 详情抽屉 | 统一结构：Header(标题+关闭) → 信息分组(Separator 分隔) → Footer(操作按钮) |
| 底部操作栏 | 统一 `fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-[1440px]`；左=辅助，右=主操作 |

> 以下组件的具体新建/替换执行见 Phase 0：SectionHeader(#13)、CollapsibleSection(#13)、Card div 收口(#16)、原生 select/button 替换(#15)、PageHeader badge(#15)、Avatar(#15)

### 列表/表格规范
- 行高 `py-3`，斑马纹 `even:bg-slate-50/50`，hover `hover:bg-slate-100/60`
- 状态列：语义色 dot(8px) + 文字（关键路径三色系统除外）
- 操作列：默认隐藏 `group-hover:opacity-100`
- 桌面端最多 8 列可见，其余折叠
- 排序列 header `text-slate-900 font-semibold` + 箭头

### 基础组件补全规范

> 具体新建/替换执行见 Phase 0 第 11 项

| 组件 | 规则 |
|------|------|
| Tooltip | 所有 `title=` 属性改用 Radix UI Tooltip 组件 |
| Separator | 所有内联 `border-b`/`border-t` 改用 Separator 组件，颜色 `border-slate-200` |
| Avatar | 所有自建 `rounded-full` 头像改用 Avatar 组件 |
| Checkbox | 如需表单勾选，用 Radix UI Checkbox |

### 原子元素规范

> 具体替换执行见 Phase 0 第 5/7/14 项

| 原子 | 规则 |
|------|------|
| 灰色系 | 统一 `slate-*`，禁止 `gray-*`/`neutral-*`/`zinc-*` |
| 蓝色系 | primary 按钮 `bg-blue-600`，hover `hover:bg-blue-500`；CSS 变量 `--brand-primary` = blue-600 |
| 图标尺寸 | 4 级：`h-3.5`(紧凑) / `h-4`(行内) / `h-5`(卡片标题) / `h-8`(空状态)；`h-3` → `h-3.5`；`h-10` 容器级图标保留，纯图标缩为 `h-8` |
| 分隔线 | 统一 Separator 组件，颜色 `border-slate-200` |

### ④ 页面布局层补充（看得懂 & 信息层级）

**栅格系统**：
- 基于 Tailwind grid，不使用自定义栅格
- 页面主体：`max-w-[1440px]`（`.page-shell`）
- 内容区标准分栏：`xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]`（主内容 2/3 + 侧边 1/3）
- 指标行：`xl:grid-cols-4 gap-4`（最多 4 列）
- 卡片网格：`xl:grid-cols-3 gap-6`（3 列等宽）

**固定元素防遮挡**：
- 顶部 sticky header：内容区加 `pt-[header高度]` 补偿，防止首屏内容被遮挡
- 底部 fixed 操作栏：内容区加 `pb-20` 补偿，防止末尾内容被遮挡
- 锚点跳转：`scroll-margin-top: [header高度]` 防止跳转后标题被 header 遮挡

**信息层级权重**（从高到低）：
| 层级 | 视觉表现 | 用途 |
|------|---------|------|
| L1 焦点 | 大数字(`text-3xl`) + 趋势色 + sparkline | 核心 KPI（每页仅 1 个焦点区） |
| L2 主要 | 卡片标题(`text-base font-medium`) + 内容 | 功能区块标题、数据卡片 |
| L3 辅助 | 小字(`text-xs text-slate-400`) + 低对比 | 时间戳、标签、辅助说明 |

**对齐规则**：
- 文字：统一左对齐（中文阅读习惯）
- 数字：统一右对齐 `text-right tabular-nums`（方便纵向比较）
- 按钮组：右对齐（主操作在最右）
- 页面标题：左对齐，与内容区左边缘对齐
- 居中仅用于：EmptyState、Dialog 内容、全页 loading

**页面标准结构**（报表展示区）：
```
Breadcrumb
PageHeader（标题 + 操作按钮）
Metric Cards（xl:grid-cols-4）
主内容区（Tab 或 Section 列表）
```

**页面标准结构**（操作区）：
```
Breadcrumb
PageHeader（标题 + 操作按钮）
工具栏（筛选 Select + 搜索 + 操作按钮组）
主内容区（表格/树表/看板）
底部操作栏（fixed，选中时显示）
```

### 页面级基础设施
| 设施 | 当前状态 | 改动 |
|------|---------|------|
| ErrorBoundary | 无 | 新建 `PageErrorBoundary` 组件，包裹所有页面路由 |
| 页面 title | 无 `document.title` 管理 | 每页设置 `document.title = "页面名 \| WorkBuddy"` |
| 滚动恢复 | 仅 GanttView 实现 | 路由切换时自动 `scrollTo(0,0)`，新建 `useScrollRestoration` hook |
| 全页 Skeleton | 仅 GanttView 有 `GanttViewSkeleton` | 每页首次加载显示 `PageSkeleton` 组件 |

### ⑤ 微观细节层补充（高级感 & 灵魂）

**动画曲线规范**：
| 场景 | 曲线 | 原因 |
|------|------|------|
| 元素进入 | `ease-out` | 快速出现，缓慢到位 |
| 元素退出 | `ease-in` | 缓慢启动，快速消失 |
| 状态切换（hover/color） | `ease` | 平滑过渡 |
| 弹性效果（Dialog） | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 仅 Dialog enter 动画，注册为 `ease-bounce` |
| ❌ 禁止 | `linear` | 机械感，不自然 |

**Loading 按钮防重复提交**：
- 点击后立即 `disabled={loading}` + spinner + 文字变"提交中..."
- loading 超过 10s 自动恢复 + toast 提示超时

**可访问性（Accessibility）规范**：
- 图标按钮必须有 `aria-label`
- 错误提示用 `role="alert"` 或 `aria-live="polite"`
- 颜色不能是唯一信息载体 — 状态列用色点 + 文字双重表达
- 图表提供数据表格替代（`<details><summary>查看数据表</summary>...`）
- Tab 键导航顺序 = 视觉阅读顺序
- Skip Link：页面顶部提供"跳转到主内容"隐藏链接（`sr-only focus:not-sr-only`），键盘用户可跳过侧边栏/导航直达内容区
- 表单 label：所有 input 必须有关联 `<label>`，禁止 placeholder-only（详见 ③ 表单校验规范）

**空状态分级**：
| 场景 | 表现 |
|------|------|
| 首次无数据 | EmptyState：图标(`h-12`) + 标题 + 引导 CTA |
| 筛选无结果 | 轻量提示：图标(`h-8`) + "未找到匹配项" + "清除筛选" |
| 加载失败 | 错误状态：图标 + "加载失败" + "重试"按钮 |

**Skeleton 加载规范**：
- 首次加载 → 全页 Skeleton（匹配真实布局形状）
- 刷新/切换 Tab → 内容区 Skeleton（保留 Header/导航）
- 操作中 → 按钮 spinner + disabled
- 使用 shadcn `<Skeleton>` 而非自定义 spinner

**认知引导原则**：
用设计本身引导用户，不用说明文字。通过：颜色高亮、流程图箭头、进度条、大数字+趋势箭头、Tab 数字角标、左边框色条等视觉手段引导。仅专业术语保留 tooltip。

**术语人性化**（全局适用）：
| 原术语 | 替换为 | 涉及页面 |
|--------|--------|---------|
| 以计划完成日期为准 | 今天需要完成的 | Dashboard TodayLive |
| 今天触发且尚未确认的系统预警 | 需要你关注的预警 | Dashboard TodayLive |
| 数据置信度 | 数据可靠性 | RiskManagement DataQualityBanner |
| 骨架差异 | 计划变更对比 | Planning SkeletonDiffDialog |
| 修订池 | 待处理的变更 | Planning RevisionPoolDialog |
| 映射状态 | 关联状态 | Planning BaselinePage |
| 重排 | 编辑模式 | Planning BaselinePage |
| 草稿锁 | 编辑锁定 | Planning BaselinePage |
| 批量移入 | 纳入本月计划 | Planning MonthlyPlanPage |
| 批量移出 | 移出本月计划 | Planning MonthlyPlanPage |
| 提升为上级 | 升级 | Planning BaselinePage |
| 降为子级 | 降级 | Planning BaselinePage |
| 滞后 | 异常（进度落后） | GanttView 统计卡片 |

**新用户引导（Onboarding）**：
- 首次登录检测：`localStorage` 标记 `onboarding_completed`，未完成时触发引导
- 引导形式：轻量 tooltip 引导（Radix UI Tooltip 定位到关键 UI 元素），非全屏遮罩
- 引导步骤（5 步）：① 侧边栏导航结构 → ② Dashboard 核心指标区 → ③ 计划编制入口（"这是使用系统的第一步"） → ④ 甘特图入口 → ⑤ 报表分析入口
- 典型工作流引导：引导完成后显示「每日工作流」卡片（可关闭），内容：`每天 → Dashboard 查看概况 → 处理 TodayLive 待办 → 进甘特图调整任务 → 查看报表`，用流程箭头串联，`bg-blue-50 border border-blue-200 rounded-xl p-4`
- 必须提供"跳过引导"按钮（`text-sm text-slate-400 hover:text-slate-600`），不强制线性完成
- 进度指示：底部小圆点 `● ● ○ ○ ○`，当前步高亮
- 完成后 toast："欢迎使用 WorkBuddy！"
- 实现：新建 `components/OnboardingGuide.tsx`，在 `App.tsx` 根级挂载

---

## Phase 0: Token 基础设施

**修改文件**：`client/tailwind.config.js`, `client/src/index.css`, `client/index.html`, `client/src/components/ui/` 新增组件

**改动**：
1. `index.css`: 新增 `--accent`(orange-500)；`--background` 改为 slate-50；新增 elevation 变量：
   ```css
   --el-1: 0 1px 3px rgba(0,0,0,0.04);
   --el-2: 0 4px 12px rgba(0,0,0,0.06);
   --el-3: 0 8px 24px rgba(0,0,0,0.08);
   --el-4: 0 20px 40px rgba(0,0,0,0.12);
   ```
2. `tailwind.config.js`: 新增 accent 色、统一 borderRadius(lg/xl/2xl)、新增 elevation shadow utilities
3. 新增全局 class：
   ```css
   .page-shell { @apply max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8 py-6 lg:py-8 space-y-8; }
   .card-unified { @apply rounded-xl bg-white p-5 shadow-[var(--el-1)] border border-slate-200/60; }
   .card-hover { @apply hover:shadow-[var(--el-2)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer; }
   ```
4. `index.html`: 引入 Plus Jakarta Sans
5. 全局 grep 替换：`gray-*`→`slate-*`（**361 处**，重点文件：AssigneeProgressCard/BatchActionBar/ChangePasswordDialog/ConflictResolutionModal/CriticalPathGraph）
6. 全局 grep 替换：`text-[10px]`/`[11px]`→`text-xs`；`text-[22px]`→`text-lg`；`text-[26px]`→`text-2xl`；`rounded-3xl`/`[24px]`/`[28px]`→`rounded-2xl`
7. 蓝色统一：`bg-blue-500`（75 处）→ `bg-blue-600`（用于 primary 按钮/链接）；CSS 变量 `--brand-primary` 对齐为 blue-600
8. 所有数据表格数字列加 `tabular-nums`
9. 消除 `tracking-[0.16em]`/`[0.18em]`/`[0.22em]` → 统一 `tracking-wider`
10. 修复 `shadow-blue`（无效 class）→ `shadow-sm` in GanttViewTaskContextMenu
11. **同步更新 `design-system/workbuddy/MASTER.md`**：
    - Primary Button `background` 从 `#F97316`(orange) 改为 `#2563EB`(blue-600)，与方案 primary 按钮一致
    - Shadow Depths 表替换为 elevation 系统：`--shadow-sm`→`--el-1`、`--shadow-md`→`--el-2`、`--shadow-lg`→`--el-3`、`--shadow-xl`→`--el-4`，值同步
12. **新建基础组件**：
    - `ui/tooltip.tsx`：基于 Radix UI Tooltip，替换 125 处 `title=` 属性（37 文件）
    - `ui/separator.tsx`：`<hr className="border-slate-200">`，替换 239 处内联 border 分隔线
    - `ui/checkbox.tsx`：基于 Radix UI Checkbox（备用，按需启用）
13. **新建页面基础设施**：
    - `components/PageErrorBoundary.tsx`：错误边界，包裹所有页面路由
    - `hooks/useScrollRestoration.ts`：路由切换自动 `scrollTo(0,0)`
    - `components/PageSkeleton.tsx`：全页加载骨架屏
    - 每页 `useEffect` 设置 `document.title = "页面名 | WorkBuddy"`
14. **新建复合组件**：
    - `components/SectionHeader.tsx`：标题(`text-lg font-semibold`) + 右侧操作区（按钮/"查看全部(N)"链接）
    - `components/CollapsibleSection.tsx`：标题 + 展开/折叠按钮 + `expand-down duration-300` 动画
15. **图标尺寸标准化**：`h-3 w-3`(70 处) → `h-3.5 w-3.5`；`h-10 w-10` 容器级图标保留，纯图标场景缩为 `h-8 w-8`
16. **原生元素替换**：
    - GanttViewFilters 4 处 `<select>` → `Select` 组件
    - 120+ 处 `<button>` → `Button` 组件（25 文件，覆盖 ChangePasswordDialog/EditProfileDialog/LoginDialog/AcceptanceLedger/MilestoneDialog/ApplyModal/CreateModal/RiskManagement 等）
    - PageHeader 内联 badge → `Badge variant="secondary"`
    - Avatar 低采用率（仅 1 处）→ 替换 AssigneeProgressCard/CompanyCockpit 自建头像
17. **105 处自定义 Card div 收口**（40 文件，原 Phase 15 合并至此）：
    - 全局搜索 `rounded-xl.*bg-white` / `rounded-lg.*border.*bg-white` 等模式
    - 逐一替换为 `<Card variant="...">` 对应 variant
    - 重点文件：CriticalPathGraph/ProjectInfoCard/RecentTasksCard/AcceptanceDetailDrawer/DashboardCompareCard

---

## Phase 1: Dashboard（报表展示区）

**文件**：`client/src/pages/Dashboard.tsx`（1663 行）

**当前问题**：
- `max-w-[1680px]` 不符合 `.page-shell` 1440px 标准
- ProjectInfoCard 占据首屏黄金位置，信息密度低（项目基本信息不需要每次看）
- TodayLiveCard 4 张子卡片平铺，无优先级区分
- `text-[26px]` 任意字号（行 1543/1586）、`text-[11px]`（行 387）
- 10+ sections 线性堆叠，无信息层级
- 7+ 种 Metric 卡片实现（与全局复合组件问题一致）

**改动方案**：

**目标布局**：
```
┌─────────────────────────────────────────────────┐
│ Compact Header: 项目名 · 阶段Badge · 健康分pill [展开▾]│
├───────────┬───────────┬───────────┬─────────────┤
│ 整体进度   │ 本月偏差   │ 活跃风险   │ 今日待办     │
│ 78%  ↑+3  │ -2.1天 ↓  │ 5 ↑+1    │ 12 →        │
├───────────┴───────────┴───────────┴─────────────┤
│ TodayLive 紧凑列表（按优先级：预警>到期>变更>新增）   │
│ ▎🔴 XX预警需确认  ▎🟡 XX任务今日到期  ... 查看全部(N) │
├─────────────────────────────────────────────────┤
│ [进度趋势] [里程碑] [单位工程] [近期任务]  ← Tab 切换 │
│ ┌─────────────────────────────────────────────┐ │
│ │ DashboardMonthlyTrend / MilestoneCard /     │ │
│ │ UnitProgressCard / RecentTasksCard          │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

1. **容器**：替换 `max-w-[1680px]`（行 1466）→ `.page-shell`
2. **首屏重构**：
   - 移除 ProjectInfoCard 首屏占位（当前渲染 20+ 字段：projectName/Description/Location/Type 等）→ 折叠到 Compact Header
   - Compact Header：项目名(`text-lg font-semibold`) + 阶段 Badge + 健康分(语义 pill：`≥80 bg-green-50 text-green-700 "良好"` / `60-79 bg-amber-50 text-amber-700 "一般"` / `<60 bg-red-50 text-red-700 "预警"`) + 展开按钮
   - 展开后显示完整 ProjectInfoCard 内容，`expand-down duration-300` 动画
3. **核心指标区**（视觉焦点）：
   - 4 个 Metric Card（统一复合组件）：整体进度、本月偏差、活跃风险数、今日待办
   - `grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4`
   - 每卡：大数字(`text-3xl tabular-nums`) + 趋势箭头(绿↑/红↓/灰→) + sparkline 微图
   - 卡片入场动画：`animate-fade-in` + stagger 60ms
4. **TodayLive 重构**：
   - 4 张独立卡片(TodayLiveCard) → 1 个紧凑列表卡片，按优先级排序
   - 每项：左色条(预警=red、到期=amber、变更=blue、新增=slate) + 标题 + 时间
   - 最多显示 5 条 + "查看全部(N)" 链接
   - 空状态：EmptyState 组件 "今日暂无待处理事项"
5. **分析区 Tab 化**：
   - Tab：进度趋势 | 里程碑 | 单位工程 | 近期任务
   - 每 Tab 加语义角标（如"里程碑(3 逾期)"红色角标 / "近期任务(8)"蓝色角标），角标颜色反映紧急程度
   - 消除 DashboardMonthlyTrend/WeeklyDigestPanel/MilestoneCard/UnitProgressCard/RecentTasksCard/CompareCard 6 个 section 线性堆叠
   - Tab 内容区统一高度 `min-h-[400px]`
6. **字号修复**：`text-[26px]`（行 1543/1586）→`text-2xl`；`text-[11px]`（行 387）→`text-xs`

---

## Phase 2: Reports（报表展示区）

**文件**：`client/src/pages/Reports.tsx`（2929 行）+ `client/src/pages/Reports/components/`

**当前问题**：
- 4 个分析模块（进度总览/进度偏差/风险与问题/变更记录）布局不统一
- grid 比例不一致：`1.1fr:0.9fr` vs `1fr:0.9fr`（行 1964/1972/2274/2869）
- 模块间无视觉区分，切换靠顶部 chip 但无数字角标提示数据量
- 图表区与数据表区比例随意

**改动方案**：

### 模块 A：进度总览（progress）
- 顶部：3 个 Metric Card（总任务数/完成率/本月新增）统一复合组件 `xl:grid-cols-3 gap-4`（仅 3 个指标，不超过 4 列上限）
- 主体：`xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]`
  - 左：SCurveChart 卡片包裹，`p-5 rounded-xl`
  - 右：关键节点列表，每项：日期 + 节点名 + 状态色点，应用列表规范

### 模块 B：进度偏差（progress_deviation）
- 统一 grid 比例为 `xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]`（消除行 1964/1972/2274/2869 四处不一致）
- DeviationTabs 内 4 个 sub-chip（deviationChips 行 1448）加数字角标
- 图表统一卡片包裹：
  - BaselineDumbbellChart：`p-5 rounded-xl`，偏差值加 inline bar 微图（纯 CSS `<div>` 宽度按偏差比例，正偏差=`bg-red-500`，负=`bg-green-500`，高 4px `rounded-full`）
  - MonthlyStackedBarChart：`p-5 rounded-xl`
  - ExecutionScatterChart：`p-5 rounded-xl`
- DeviationDetailTable（`Reports/components/DeviationDetailTable`）应用列表/表格规范：
  - 斑马纹 `even:bg-slate-50/50`，hover `hover:bg-slate-100/60`
  - 数字列 `tabular-nums text-right`
  - 操作列 `group-hover:opacity-100`

### 模块 C：风险与问题（risk）
- 顶部：2 Metric Card（活跃风险数 + 未关闭问题数）+ 7 日趋势 sparkline
- 主体：`xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]`
  - 左：风险矩阵热力图（影响×概率 5×5 grid，色阶 green→yellow→red）
  - 右：最新风险列表，chips 筛选(等级/状态) + 列表 + "查看全部(N)"
- 列表每项：左色条(高=red/中=amber/低=green) + 风险名 + 责任人 + 日期

### 模块 D：变更记录（change_log）
- 顶部：2 Metric Card（本月变更数 + 审批中数量）
- 主体：时间线列表
  - 每条：日期(`tabular-nums text-slate-500`) + 变更类型左色条(范围=blue/进度=amber/成本=red) + 标题 + 状态 Badge
  - 应用列表/表格规范（斑马纹、hover）
  - 底部分页

### 全局改动
- 顶部模块切换 chip 加语义角标（如"风险(3 活跃)"红色、"变更(7 本月)"蓝色），默认选中「进度总览」并视觉加重（`bg-blue-600 text-white`），其余 chip `bg-slate-100 text-slate-600`
- 所有模块统一 `.page-shell` 容器
- 4 个模块切换时加 `fade-in duration-200` 过渡

---

## Phase 3: RiskManagement（报表展示区）

**文件**：`client/src/pages/RiskManagement.tsx`（2242 行）

**当前问题**：
- 无 max-width（全宽）
- 3 个 OverviewCard 样式相同，无法视觉区分预警/风险/问题
- SummaryBand 4 MetricCards + DataQualityBanner + OverviewCard×3 + TrendSummary×4 信息过载
- Metric 卡片为自定义实现，未用统一复合组件

**改动方案**：

1. **容器**：加 `.page-shell`
2. **指标区重构**：
   - 4 MetricCards → 统一复合组件 `xl:grid-cols-4 gap-4`
   - 每卡：label(`text-xs uppercase tracking-wider`) + 大数字 + 7 日趋势 sparkline
   - DataQualityBanner 移到页面底部折叠区（非核心信息，默认收起）
3. **链路流程图**（新增视觉焦点）：
   ```
   [识别] ──→ [评估] ──→ [应对] ──→ [监控]
    ↓ 12项     ↓ 8项     ↓ 5项     ↓ 3项
   ```
   - 实现方式：纯 CSS flex 布局 + 伪元素箭头（`::after` 三角形），不引入额外库
   - 4 个节点 + 箭头，每节点下方显示当前阶段数量
   - 节点颜色：有待处理=orange-500 填充，已清空=green-500 填充，未开始=slate-200
   - 箭头 `transition-all duration-300`
4. **OverviewCard 区分**：
   - 3 卡片加左边框色条区分：预警=`border-l-4 border-amber-500`、风险=`border-l-4 border-red-500`、问题=`border-l-4 border-blue-500`
   - 每卡内部结构：数字+趋势(↑↓) → 最近 3 条列表(标题+时间+责任人) → "查看全部(N)"
   - 卡片 hover 浮起效果
5. **TrendSummary 精简**：
   - 4 个独立趋势卡片 → 合并为 1 个多折线图卡片
   - 4 条线(预警/风险/问题/已关闭) + 图例 + 时间轴
   - 图例可点击切换显示/隐藏
6. **列表区**：应用统一列表模式（内嵌搜索+chips 筛选[等级/状态/责任人]+列表+分页）
7. **三流关系提示**：在预警/风险/问题 Tab 切换区域上方加一行微型流程提示：`预警 → 风险 → 问题`，用箭头连接，当前 Tab 对应节点高亮（`bg-blue-600 text-white rounded-full px-2`），其余节点 `text-slate-400`

---

## Phase 4: Materials（操作区）

**文件**：`client/src/pages/Materials.tsx`（1809 行）

**当前问题**：
- 无 max-width（全宽）
- 6 StatCards `xl:grid-cols-6` 密度过高，单卡宽度不足
- 删除操作无 ConfirmDialog（违反交互标准）
- Metric 卡片为自定义实现

**改动方案**：

1. **容器**：加 `.page-shell`
2. **指标区**：
   - 6 卡片(`xl:grid-cols-6`) → 4 卡片（合并相关指标）`xl:grid-cols-4 gap-4`
   - 合并策略：总数+已到场→"到场率"、已验收+不合格→"验收情况"
   - 使用统一 Metric 复合组件，每卡：label + 大数字 + 趋势
3. **主体布局 7:3 分栏**：
   ```
   ┌──────────────────────┬────────────┐
   │ 材料列表（7/10）       │ 侧边栏（3/10）│
   │ 工具栏: Select筛选     │ 快速统计     │
   │ + 搜索 + 批量操作      │ 分类饼图     │
   │ ─────────────────── │ 近期到场     │
   │ 表格(斑马纹/hover)    │            │
   │ 分页                  │            │
   └──────────────────────┴────────────┘
   ```
   - 左侧 `xl:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]`
   - 右侧边栏：快速统计(3 个 mini metric) + 分类饼图 + 近期到场列表
4. **操作安全**：所有删除操作加 ConfirmDialog（当前缺失，违反交互标准）
5. **工具栏**：操作区标准 — Select 筛选器(类型/状态) + 搜索框 + 操作按钮组(新增/批量导入/导出)
6. **表格**：应用列表/表格规范
   - 斑马纹 `even:bg-slate-50/50`，hover `hover:bg-slate-100/60`
   - 数字列 `tabular-nums text-right`
   - 操作列 `group-hover:opacity-100`（编辑/删除）
   - 状态列：语义色 dot(8px) + 文字

---

## Phase 5: Milestones（报表展示区）

**文件**：`client/src/pages/Milestones.tsx`（936 行）

**当前问题**：
- `max-w-[1600px]` 不符合 1440px 标准
- 5 StatCards `xl:grid-cols-5` 不符合最多 4 列规范
- HealthSummary 卡片 pill badges 过多

**改动方案**：

1. **容器**：`max-w-[1600px]`（行 705）→ `.page-shell`
2. **指标区**：
   - 5 卡片(`xl:grid-cols-5` 行 743) → 4 卡片（合并 2 个相关指标）`xl:grid-cols-4 gap-4`
   - 使用统一 Metric 复合组件
3. **HealthSummary 精简**：
   - pill badges 过多 → 精简为 top-3 关键项 + "更多(N)" 展开
   - 每个 pill：语义色背景 + 文字，`rounded-lg px-2 py-0.5 text-xs`
4. **里程碑列表**：
   - 应用列表规范 + 左色条区分状态：完成=`border-l-4 border-green-500`、进行中=`border-l-4 border-blue-500`、延期=`border-l-4 border-red-500`
   - 每项：里程碑名 + 计划日期(`tabular-nums`) + 实际日期 + 偏差天数(趋势色)
   - 进度条：`transition-[width] duration-700 ease-out`
5. **2 行摘要条**：
   - 第 1 行：4 Metric Cards
   - 第 2 行：HealthSummary 横向展开，`xl:grid-cols-[1fr_auto]`（摘要文字 + 展开按钮）

---

## Phase 6: Notifications

**文件**：`client/src/pages/Notifications.tsx`（1513 行）

**当前问题**：
- 无 max-width（全宽）
- PageHeader 7+ 按钮，操作过载
- Settings 面板 `absolute right-0 top-full z-20` 与其他浮层 z-index 冲突
- 每条通知 6 个 Badge（类型/目标/状态/级别/静音/指派人）认知过载
- 分组级和条目级信息重复显示

**改动方案**：

1. **容器**：加 `.page-shell`
2. **Header 精简**：
   - 当前 7+ 按钮：全部已读/批量操作/刷新/设置/筛选/搜索/排序
   - 精简为：搜索框 + 筛选 Select(类型/状态) + 设置齿轮图标
   - 其余按钮收入"更多操作" DropdownMenu（全部已读/批量删除/导出）
   - Tab 精简为 3 个（全部 / 未读 / 已处理），原 5 Tab（全部/未读/业务预警/系统异常/流程提醒）分类重叠；类型筛选（业务预警/系统异常/流程提醒）改为 chips 筛选器放在 Tab 下方
3. **Settings 面板 z-index 修复**：
   - 当前：`absolute right-0 top-full z-20` → 与其他浮层冲突
   - 修复：改为 Popover 组件，`z-50` + backdrop 点击关闭 + `rounded-xl shadow-[var(--el-3)]`
4. **通知条目精简**：
   - 当前每条 6 Badge（类型/目标/状态/级别/静音/指派人）→ 认知过载
   - 精简为 2 Badge（类型 + 状态），其余信息移入展开详情行
   - 展开详情：点击条目展开下方区域，显示完整信息 + 操作按钮
   - 分组标题显示汇总计数，条目不重复分组信息
5. **列表优化**：
   - 应用统一列表模式 + 分组折叠（`expand-down duration-300`）
   - 未读条目：`bg-blue-50/50 border-l-4 border-blue-500`
   - 已读条目：`bg-white`
   - 每组标题：日期 + 未读数 Badge
6. **空状态**：无通知时显示 EmptyState "暂无新通知"

---

## Phase 7: AcceptanceTimeline（验收流程轴）

**文件**：`client/src/pages/AcceptanceTimeline.tsx`（1058 行）

**当前问题**：
- 无 max-width（全宽）
- 7 StatCards 用 7 种 tone 色，视觉混乱
- `rounded-3xl` 不符合全局圆角规范
- StatCard 组件（行 691）tone-based 着色与全局 3 色调原则冲突
- FlowNode z-20/z-30 与 FlowBoard header z-20 冲突
- 详情抽屉为自定义实现，未用统一模板

**改动方案**：

1. **容器**：加 `.page-shell`
2. **指标区重构**：
   - 7 StatCards(7 色 tone) → 4 卡片 `xl:grid-cols-4 gap-4`
   - 合并策略：按验收大阶段合并（基础验收/主体验收/竣工验收/专项验收）
   - 去除 7 色 tone（StatCard 行 691 的 tone-based 着色）→ 统一 slate 底 + 左色条区分（最多 3 语义色）
   - 每卡：阶段名 + 通过率大数字 + 进度条
3. **进度概览条**（新增视觉焦点）：
   ```
   ┌─────────────────────────────────────────────┐
   │ 验收总进度  ████████████░░░░░  72%  12/17项  │
   │ 基础██████ 100%  主体████░░ 67%  竣工░░░ 0% │
   └─────────────────────────────────────────────┘
   ```
   - 多段进度条，每段对应一个验收阶段，颜色区分
   - 进度条动画 `transition-[width] duration-700 ease-out`
4. **圆角修复**：`rounded-3xl` → `rounded-xl`（全局 Phase 0 覆盖）
5. **z-index 修复**：
   - FlowNode：z-10（基础层）
   - FlowBoard header：z-20（固定层）
   - 浮层/tooltip：z-30+
   - 当前冲突：FlowNode z-20/z-30 与 FlowBoard header z-20 重叠
6. **详情抽屉**：改用统一抽屉模板（Header→信息分组→Footer）
   - 当前 AcceptanceDetailDrawer 为自定义实现，30+ 处内联卡片样式 → 改用 Card 组件
7. **流程图节点**：
   - 节点间箭头加 `transition-all duration-300` 动画
   - 已完成节点=green-500 填充，进行中=blue-500，未开始=slate-200
   - 节点 hover：`hover:shadow-[var(--el-2)] cursor-pointer`
8. **视图切换优化**：FlowBoard vs Ledger 切换从 header 内按钮改为 Tab 组件（`"流程图(N)" | "台账(N)"`），与其他页面 Tab 风格统一

---

## Phase 8: GanttView（操作区）

**文件**：`client/src/pages/GanttView.tsx`（4151 行）+ 6+ 子文件

**当前问题**：
- 6+ 文件使用 `gray-*` 而非 `slate-*`（Phase 0 全局替换覆盖）
- 9+ 色调在 dialog 中混用
- 13 处 `console.error` 静默吞错，无 toast 反馈
- `shadow-blue` 无效 class（GanttViewTaskContextMenu）
- `max-w-[1440px]` 已正确

**改动方案**：

1. **颜色**：`gray-*` → `slate-*`（Phase 0 全局覆盖，影响 6+ 子文件）；dialog 色调精简到 3 种（primary blue + 1 语义色 + slate）
2. **错误处理**：13 处 `console.error` 静默吞错 → 每处加 toast 通知用户
   - 搜索模式：`catch.*console\.error` 逐一替换为 `toast.error("操作失败: ...")`
3. **shadow 修复**：`shadow-blue`（GanttViewTaskContextMenu，无效 class）→ `shadow-sm`（Phase 0 覆盖）
4. **Dialog 统一**（9+ 色调混用）：
   - 所有 dialog 使用 `rounded-2xl` + `shadow-[var(--el-4)]`
   - 色调限制：primary(blue-600) + 1 语义色 + slate
   - TypeManagerDialog（9 个 state 变量管理表单）：拆分为 Tab 式分步表单，降低认知负担
5. **右键菜单**：
   - 应用 hover/transition 交互标准：`hover:bg-slate-50 transition-colors duration-150`
   - 菜单项间距 `py-2 px-3`，分组用 Separator
   - 破坏性操作（删除）用 `text-red-600` 高亮 + ConfirmDialog
6. **底部操作栏**：应用统一底部栏规范 `fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-[1440px]`
7. **视口边界**：右键菜单/tooltip 检测视口边界，防止溢出屏幕
8. **关键路径图谱优化**（CriticalPathDialog + CriticalPathGraph）：
   - 当前：点击"查看关键路径"按钮打开 draggable modal，SVG DAG 图谱，节点按状态着色（红=自动关键/琥珀=手动关注/橙=手动插入/白=非关键）
   - 优化：
     - 图谱 modal 标题旁加简短说明 `text-xs text-slate-400 "红色链路为影响工期的关键路径"`
     - 节点 hover 显示 Tooltip（任务名+工期+浮动时间），替代当前仅点击才能看详情
     - 图例区域从隐含改为显式：在图谱下方加色块图例（红=关键/琥珀=关注/橙=手动/灰=非关键），`flex gap-4 text-xs`
     - 循环依赖警告（amber alert）加 tooltip 解释"存在循环依赖会导致关键路径计算不准确"
     - 缩放控件加 `text-xs` 标签（"放大"/"缩小"/"适应屏幕"）
9. **横道图视图优化**（TaskTimelineView）：
   - 当前：列表视图 vs 横道图视图通过 header 按钮切换
   - 优化：
     - 视图切换按钮改为 Tab 风格（`"列表视图" | "横道图视图"`），当前视图加重（`bg-blue-600 text-white`）
     - 横道图首次打开时，如果任务数 >50，显示提示 `text-xs text-slate-400 "提示：可用鼠标滚轮缩放时间轴，拖拽平移"`
     - 筛选栏默认隐藏——加 `text-xs text-slate-400 "点击展开筛选"` 提示，避免新用户不知道筛选功能存在
     - 治理横幅（GovernanceBanner）的阶段 Badge（月计划待确认/基线待重定/执行重排/月末关账）加 tooltip 解释每个阶段含义
10. **统计卡片精简**（G3）：6 个指标卡片合并为 4 个（总任务/进行中/已完成/异常），"滞后"合并入"异常"并加 tooltip "进度落后但未超期的任务"，"逾期"加 tooltip "已超过计划完成日期"
11. **筛选栏实时生效**（G6）：去掉"应用"按钮，所有筛选条件变更后实时过滤（`onChange` 即触发），仅保留"重置"按钮清空所有筛选
12. **任务行 hover 按钮精简**（G5）：保留 2 个常用按钮（编辑/展开详情），其余（添加子任务/移动/复制/删除）收入 `···` DropdownMenu
13. **右键菜单分组优化**（G6-menu）：13 项按功能分组（编辑操作 / 层级操作 / 关键路径操作 / 危险操作），组间用 Separator 分隔；关键路径 6 项各加 `text-xs text-slate-400` 描述行
14. **双击编辑视觉提示**（G7）：任务标题 hover 时显示铅笔图标 `opacity-0 group-hover:opacity-60 h-3.5 w-3.5`，与 BaselinePage 统一
15. **批量操作栏精简**（G8）：左=选中计数(`"已选 N 项"`) + 清除按钮，右=常用操作（状态变更/删除），其余（指派/单位/日期偏移）收入"更多操作" DropdownMenu
16. **数据质量提示优化**（G12）：严重度 Badge（高/中/低）各加 tooltip 解释（高="影响关键路径计算准确性"、中="可能导致进度统计偏差"、低="建议修正但不影响核心功能"），整体加一行说明 `text-xs text-slate-400 "以下数据问题可能影响分析准确性，建议尽快处理"`

---

## Phase 9: Planning 模块（操作区）

### 9a: PlanningWorkspace
**文件**：`client/src/pages/planning/PlanningWorkspace.tsx`（1442 行）

**当前问题**：
- `PlanningPageShell` 自定义容器，与 `.page-shell` 不一致
- 治理仪表盘 health/integrity/anomaly 3 面板纵向堆叠，信息分散

**改动方案**：
1. `PlanningPageShell` 内部对齐 `.page-shell` 的 max-width 和 padding
2. 治理仪表盘：3 面板 → 横向 `xl:grid-cols-3`，每面板：大数字+状态色+趋势
3. **治理仪表盘默认折叠**：仅显示一行摘要（如"治理健康度 82 分 · 良好"），点击展开详情（`expand-down duration-300`）。新用户不需要首次就理解治理体系
4. **无基线引导横幅**：如果当前项目没有已确认的基线版本，在页面顶部显示引导横幅：`bg-blue-50 border border-blue-200 rounded-xl p-4`，内容："当前项目尚未建立基线，请先在「项目基线」页面创建并确认基线。" + CTA 按钮跳转

### 9b: BaselinePage
**文件**：`client/src/pages/planning/BaselinePage.tsx`（2384 行）

**当前问题**：
- 树表 18 列默认全部展开，水平滚动严重
- BaselineBottomBar 10+ 按钮，`fixed bottom-4 left-0 right-0 z-40 max-w-[1440px]` 超宽屏不居中
- BaselineConfirmDialog 一次性展示所有确认信息，认知过载
- BaselineRevisionPoolDialog 候选列表+篮子+延期原因三区域同屏，认知负担高
- 详情抽屉为自定义实现

**改动方案**：
1. **树表列控制**：
   - 默认显示 8 列（序号/WBS/任务名/开始/结束/工期/状态/责任人）
   - 其余 10 列折叠到"更多列" Popover 勾选显示
   - 列宽：任务名 `min-w-[200px]`，日期列 `w-[110px] tabular-nums`，数字列 `w-[80px] text-right tabular-nums`
2. **BottomBar 重构**：
   - 应用统一底部栏规范：`fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-[1440px]`（居中修复）
   - 按钮分组：左=辅助操作（导出/撤销/历史），右=主操作（保存草稿/提交审批）
   - 超过 4 个辅助按钮收入 DropdownMenu "更多操作"
   - 选中计数显示：`"已选 N 项"` 居中
3. **ConfirmDialog 分层**：
   - 默认：摘要视图（影响范围数字 + 关键变更 top-3）+ 影响范围语义 pill（变更 <5% → `bg-green-50 text-green-700 "影响较小，可安全确认"`；>20% → `bg-orange-50 text-orange-700 "影响范围较大，建议仔细检查"`）
   - 展开：完整变更列表（点击"查看详情"展开，`expand-down duration-300`）
   - 底部：取消 + 确认按钮
4. **RevisionPoolDialog 分步引导**：
   - Step 1："选择要处理的变更"（搜索+筛选+勾选）→ "下一步"
   - Step 2："确认已选变更"（已选项列表，可移除）→ "下一步"
   - Step 3："标注暂缓原因"（仅对需要暂缓的项显示原因输入）→ "提交"
   - 顶部进度条：3 步骤指示器
5. **详情抽屉**：改用统一模板（Header→信息分组→Footer）
6. **创建入口视觉引导**（B1）：3 个创建入口（空白/导入/日程）中，"空白创建"为推荐入口，视觉加重（`bg-blue-600 text-white`）；其余两个加 `text-xs text-slate-400` 描述行（导入="从 Excel/Project 文件导入"、日程="从已有日程表生成"）
7. **双击编辑视觉提示**（B4）：树表单元格 hover 时显示铅笔图标 `opacity-0 group-hover:opacity-60 h-3.5 w-3.5`，提示可双击编辑
8. **键盘快捷键提示**（B5）：进入编辑态时，单元格下方显示 `text-xs text-slate-400 "Tab 下一格 · Enter 确认 · Esc 取消"`
9. **树表层级操作术语**（B7）：「提升为上级」→「升级」、「降为子级」→「降级」，操作按钮加 tooltip 说明（升级="将此任务提升一个层级"、降级="将此任务变为上方任务的子任务"）
10. **版本切换高亮**（B9）：当前版本 Tab `bg-blue-600 text-white rounded-lg`，历史版本 `bg-slate-100 text-slate-600`，切换时 `transition-colors duration-200`
11. **草稿锁 tooltip**（B11）：编辑锁定状态下显示 tooltip "其他用户正在编辑，暂时无法修改"，锁定图标 `text-amber-500 h-4 w-4`

### 9c: MonthlyPlanPage
**文件**：`client/src/pages/planning/MonthlyPlanPage.tsx`（2497 行）

**当前问题**：
- 树表列数同 BaselinePage 问题
- 底部栏实现不统一
- SkeletonDiffDialog / RegenerationDialog 样式不统一
- 双数据源选择器无视觉区分

**改动方案**：
1. **树表**：列数控制同 BaselinePage（默认 8 列，其余折叠）
2. **底部栏**：应用统一底部栏规范（居中修复 + 按钮分组）
3. **Dialog 统一**：
   - SkeletonDiffDialog：`rounded-2xl shadow-[var(--el-4)]`，差异对比用红/绿高亮（删除=red-100/新增=green-100）
   - RegenerationDialog：分步确认（Step1 选择范围 → Step2 确认影响 → Step3 执行）
4. **双数据源选择器**：
   - 当前源：`bg-blue-50 border-blue-500 font-semibold` 高亮
   - 备选源：`bg-slate-50 border-slate-200 text-slate-500` 低调
   - 切换时 `transition-colors duration-200`
5. **快速确认 vs 标准确认区分**：快速确认按钮旁加 tooltip "所有条件已满足时可用"；条件不满足时自动 `disabled` + tooltip "存在 N 个待处理问题，请使用标准确认"
6. **「计划变更对比」按钮**：从 header 区域移到工具栏显眼位置，或加 `bg-amber-50 border border-amber-200 rounded-lg` 视觉提示
7. **月滑块当前月高亮**（M1）：当前月 `ring-2 ring-blue-500 bg-blue-50`，其余月 `bg-slate-50`；每月状态 Badge 加 tooltip 解释（如"已确认"="本月计划已锁定"、"草稿"="本月计划尚未提交"、"待确认"="已提交，等待审批"）
8. **批量操作术语优化**（M3）：「批量移入」→「纳入本月计划」tooltip "将选中任务添加到当前月度计划"；「批量移出」→「移出本月计划」
9. **批量移出确认**（M4）：移出操作加 ConfirmDialog "确定将 N 项任务移出本月计划？移出后任务将回到基线待分配状态。"
10. **重新生成来源描述**（M7）：3 个来源选项各加 `text-xs text-slate-400` 描述行（基线="以最新确认基线为基础重新生成"、上月="以上月已确认计划为基础延续"、当前="在当前草稿基础上刷新数据"）
11. **草稿恢复时间戳**（M8）：草稿恢复对话框显示草稿保存时间 `tabular-nums text-slate-500 "保存于 2026-04-28 14:30"`
12. **撤销/重做快捷键提示**（M9）：底部栏撤销按钮加 tooltip `"Ctrl+Z"`，重做按钮加 tooltip `"Ctrl+Y"`

### 9d: CloseoutPage
**文件**：`client/src/pages/planning/CloseoutPage.tsx`（929 行）

**当前问题**：
- 5 分支原因级联选择器层级深，用户易迷失
- CloseoutBatchBar 实现不统一
- CloseoutDetailDrawer 为自定义实现

**改动方案**：
1. **级联选择器优化**：
   - 加面包屑路径提示当前层级：`根 > 分类A > 子分类B`
   - 每级显示子项数量角标
   - 已选路径高亮 `bg-blue-50`
   - 每个顶级分支加描述文字（`text-xs text-slate-400`）：系统建议="系统根据数据自动推荐的处理方式"、手动判断="需要你根据实际情况决定"、其他="以上都不适用时选择"
2. **CloseoutBatchBar**：应用统一底部栏规范
3. **CloseoutDetailDrawer**：应用统一抽屉模板
   - Header：任务名 + 状态 Badge + 关闭按钮
   - Body：信息分组（基本信息 / 关闭原因 / 关联任务），Separator 分隔
   - Footer：取消 + 确认关闭按钮
4. **升级阶梯说明**：在升级阶梯区域加一行说明：`text-xs text-slate-400 "逾期 3 天系统提醒 → 5 天通知上级 → 7 天自动关闭"`，用流程箭头串联，帮助新用户理解机制

---

## Phase 10: CompanyCockpit（报表展示区）

**文件**：`client/src/pages/CompanyCockpit.tsx`（590 行）

**当前问题**：
- `max-w-[1680px]` 不符合 1440px 标准
- 公司级汇总页，需要最强的视觉焦点引导

**改动方案**：

1. **容器**：`max-w-[1680px]`（行 512）→ `.page-shell`
2. **Hero 区**（视觉焦点）：
   - 公司级核心指标 `xl:grid-cols-3 gap-6`：项目总数 / 活跃项目 / 整体健康分(语义 pill：`≥80 "良好"` / `60-79 "一般"` / `<60 "预警"`)
   - 每卡：大数字(`text-3xl tabular-nums`) + 趋势箭头 + 7 日 sparkline
   - 背景：`bg-gradient-to-br from-blue-50 to-slate-50 rounded-xl p-6`
3. **项目概览**：
   - 卡片网格 `xl:grid-cols-3 gap-6`
   - 每卡结构：项目名(`text-base font-medium`) + 进度条 + 健康色点(green/amber/red) + 2 个关键指标(完成率/风险数)
   - 异常项目：`border-l-4 border-orange-500` 高亮 + 排序置顶
   - 正常项目：`border border-slate-200` 低调
   - 卡片 hover 浮起效果
4. **Insight 区**：
   - 异常摘要卡片：`bg-orange-50 border border-orange-200 rounded-xl p-5`
   - 内容：异常项目数 + top-3 异常原因列表
   - 无异常时：EmptyState "所有项目运行正常"

---

## Phase 11: Drawings（施工图纸）

**文件**：`client/src/pages/Drawings/DrawingsPage.tsx`（1670 行）

**当前问题**：
- 无 max-width（全宽）
- 7 个就绪度统计指标密度高
- 18+ 列表格，水平滚动严重

**改动方案**：

1. **容器**：加 `.page-shell`
2. **指标区**：
   - 7 就绪度指标 → 4 核心指标 `xl:grid-cols-4 gap-4`（总图纸数/已审批/待审批/逾期）
   - 其余 3 个指标折叠到"详细统计"展开区（`expand-down duration-300`）
   - 使用统一 Metric 复合组件
3. **表格优化**：
   - 18+ 列 → 默认 8 列可见（序号/图纸名/专业/版本/状态/审批人/日期/操作）
   - 其余列折叠到"更多列" Popover
   - 应用表格规范：斑马纹、hover、操作列 `group-hover:opacity-100`
   - 日期列 `tabular-nums`，状态列语义色 dot + 文字
4. **操作区工具栏**：Select 筛选(专业/状态/版本) + 搜索框 + 批量操作按钮(上传/导出)
   - Focus View 下拉选项（概览/缺失/审查/变更/任务影响/验收影响）每项加 `text-xs text-slate-400` 描述行，帮助新用户理解各模式用途
5. **就绪度可视化**：
   - 顶部加总进度条：`████████░░░ 75% 就绪`
   - 按专业分组的 mini 进度条（结构/建筑/机电/...）

---

## Phase 12: PreMilestones（前期证照）

**文件**：`client/src/pages/PreMilestones.tsx`（953 行）+ 13 子组件

**当前问题**：
- 无 max-width
- `gray-*` 使用（ConditionsDialog 等）→ Phase 0 覆盖
- Board + Ledger + Detail drawer 三视图切换无明确引导
- 详情抽屉为自定义实现

**改动方案**：

1. **容器**：加 `.page-shell`
2. **视图切换**：
   - Tab 组件明确标注当前视图 + 数字角标（如"看板(12)" / "台账(12)"）
   - Tab 切换加 `fade-in duration-200` 过渡
3. **Board 视图**：
   - 卡片应用 `.card-unified` + `.card-hover` 浮起效果
   - 每卡结构：证照名(`text-base font-medium`) + 状态 Badge + 到期日(`tabular-nums`) + 责任人
   - 按状态分列：待办 / 进行中 / 已完成，列标题加计数
4. **Ledger 视图**：
   - 应用表格规范（斑马纹、hover、操作列 `group-hover:opacity-100`）
   - 状态列：语义色 dot(8px) + 文字
   - 日期列 `tabular-nums`
5. **详情抽屉**：改用统一模板
   - Header：证照名 + 状态 Badge + 关闭
   - Body：基本信息 / 条件清单(ConditionsDialog) / 关联文件，Separator 分隔
   - Footer：编辑 + 状态变更按钮
6. **颜色**：Phase 0 全局替换覆盖 `gray-*` → `slate-*`（ConditionsDialog 等 13 子组件）
7. **看板与台账维度对齐**：看板列（准备/审批/发放/完成）和台账 quick filter（全部/阻塞/逾期/补充）是两套分类维度，容易混淆。统一为：看板按阶段分列，台账也默认按阶段分组显示，quick filter 作为二级筛选叠加在阶段分组之上

---

## Phase 13: TaskSummary（报表展示区）

**文件**：`client/src/pages/TaskSummary.tsx`

**当前问题**：
- `container mx-auto` 宽度不受控
- `text-[22px]`（行 84）任意字号

**改动方案**：

1. **容器**：`container mx-auto`（行 332）→ `.page-shell`
2. **字号**：`text-[22px]`（TaskSummaryGroupsSection 行 84）→ `text-lg`（Phase 0 全局替换覆盖）
3. **分组 Section 优化**：
   - 每组加 Section 标题规范：`text-lg font-semibold text-slate-900`
   - 折叠展开：默认展开前 3 组，其余折叠 + "展开更多(N)" 按钮
   - 折叠动画 `expand-down duration-300`
   - 每组标题右侧显示任务计数 Badge
4. **任务列表**：
   - 应用列表/表格规范（斑马纹、hover、操作列）
   - 每项：任务名 + 状态色点 + 责任人 + 截止日期(`tabular-nums`)
   - 逾期任务：`text-red-600` + 逾期天数
5. **汇总指标**：顶部加 2 个 Metric Card（总任务数 / 完成率）`xl:grid-cols-2 gap-4`

---

## Phase 13b: ResponsibilityView（责任主体，报表展示区）

**文件**：`client/src/pages/ResponsibilityView.tsx`（1087 行）

**当前问题**：
- 无 max-width（全宽）
- 4 个 Metric Card 为自定义实现
- `text-[26px]`（分析区标题，行 1033）、`text-[11px]`（sparkline 标签，行 327）任意字号
- 「责任主体」「活跃延期」「风险压力」「待确认恢复」术语不明
- 监控区和分析区通过 sticky Tab 切换，但两区内容关系不明确
- 责任人维度 vs 责任单位维度切换无视觉引导

**改动方案**：

1. **容器**：加 `.page-shell`
2. **字号修复**：`text-[26px]`→`text-2xl`；`text-[11px]`→`text-xs`（Phase 0 全局替换覆盖）
3. **指标区**：4 MetricCards → 统一复合组件 `xl:grid-cols-4 gap-4`，每卡：label + 大数字 + sparkline
4. **维度切换优化**：
   - 当前维度按钮加视觉加重（`bg-blue-600 text-white`），非当前维度 `bg-slate-100 text-slate-600`
   - 切换时 `transition-colors duration-200`
   - 每个维度按钮旁加 tooltip 解释："按个人查看" / "按参建单位查看"
5. **监控区/分析区关系**：
   - 监控区标题改为"责任主体监控"，分析区标题改为"趋势分析"
   - 两区 Tab 加数字角标（如"监控(12 个主体)" / "趋势"）
6. **术语人性化**：
   - 「活跃延期」→「当前延期中」
   - 「风险压力」→「风险关联度」+ tooltip "该主体关联的活跃风险数量"
   - 「待确认恢复」→「待确认恢复正常」
7. **详情卡片优化**：
   - 每个责任主体卡片的 6 指标网格应用统一间距 `gap-4`
   - 关联任务表格应用表格规范（斑马纹、hover、`tabular-nums`）
   - 异常主体卡片加左色条 `border-l-4 border-red-500`，正常主体 `border border-slate-200`

---

## Phase 14: 面包屑补全 + 页面 title

**改动**：
1. 以下页面顶部加 `<Breadcrumb>` 组件（已有统一组件 `client/src/components/Breadcrumb.tsx`）：
   - Dashboard、Reports、RiskManagement、Materials、Milestones
   - Notifications、AcceptanceTimeline、GanttView、Drawings
   - PreMilestones、TaskSummary、CompanyCockpit、ResponsibilityView
   - Planning（Baseline/Monthly/Closeout）
2. 每页 `useEffect` 设置 `document.title`：
   - Dashboard → "项目概览 | WorkBuddy"
   - Reports → "分析报表 | WorkBuddy"
   - 以此类推

---

## 页面宽度统一对照表

| 页面 | 当前 | 目标 |
|------|------|------|
| Dashboard | `max-w-[1680px]` | `.page-shell` (1440px) |
| Reports | 无 | `.page-shell` |
| RiskManagement | 无 | `.page-shell` |
| Materials | 无 | `.page-shell` |
| Milestones | `max-w-[1600px]` | `.page-shell` |
| Notifications | 无 | `.page-shell` |
| AcceptanceTimeline | 无 | `.page-shell` |
| GanttView | `max-w-[1440px]` | 已正确 |
| Drawings | 无 | `.page-shell` |
| PreMilestones | 无 | `.page-shell` |
| TaskSummary | `container mx-auto` | `.page-shell` |
| CompanyCockpit | `max-w-[1680px]` | `.page-shell` |
| PlanningWorkspace | `PlanningPageShell` | 内部对齐 1440px |
| ResponsibilityView | 无 | `.page-shell` |

---

## 实施顺序

1. **Phase 0** — Token 基础设施 + 基础组件补全 + 全局替换 + Card div 收口（全局影响，必须先行）
2. **Phase 14** — 面包屑补全 + 页面 title（独立，可与 Phase 1 并行）
3. **Phase 1** — Dashboard（首页，用户第一印象）
4. **Phase 2** — Reports（最复杂报表页）
5. **Phase 3** — RiskManagement
6. **Phase 8** — GanttView（核心操作页）
7. **Phase 9** — Planning 模块（4 子页面）
8. **Phase 4** — Materials
9. **Phase 5** — Milestones
10. **Phase 7** — AcceptanceTimeline
11. **Phase 12** — PreMilestones
12. **Phase 11** — Drawings
13. **Phase 6** — Notifications
14. **Phase 13** — TaskSummary
15. **Phase 13b** — ResponsibilityView
16. **Phase 10** — CompanyCockpit

---

## 验证方案

每个 Phase 完成后先做基础验证，全部 Phase 完成后再执行上线测试门禁。测试门禁不新增 295 条需求编号，但必须证明 295 条均已通过。

**自动化检查**：
1. `npx tsc -p client/tsconfig.json --noEmit` — 类型检查
2. `npx vitest run --config client/vitest.config.ts` — 单元测试

**浏览器手动验证清单**：
- [ ] 1440px 宽度下页面不溢出，无水平滚动条
- [ ] 所有可点击元素有 `cursor-pointer` + hover 反馈（颜色/阴影变化）
- [ ] 破坏性操作（删除/重置）弹出 ConfirmDialog
- [ ] 空状态显示 EmptyState 组件（图标+标题+CTA）
- [ ] 数字列 `tabular-nums` 等宽对齐（检查表格数字列是否对齐）
- [ ] 卡片 hover 浮起效果（阴影加深 + 微上移）
- [ ] `motion-safe:` 动画正常（检查 prefers-reduced-motion 下动画关闭）
- [ ] 面包屑导航存在且路径正确
- [ ] 所有 toast 错误提示正常弹出（模拟网络错误）
- [ ] z-index 层级正确：卡片(auto) < 固定栏(z-40) < Popover(z-50) < Dialog(z-50+backdrop)
- [ ] 截断列表显示"共 N 条"或"查看全部(N)"
- [ ] 进度条动画平滑（`duration-700 ease-out`）
- [ ] Tab 切换有过渡动画
- [ ] 字号无 `text-[Npx]` 任意值残留（DevTools 检查）
- [ ] 颜色无 `gray-*` / `neutral-*` 残留（DevTools 检查）

**上线测试门禁（对应执行方案 Release QA 叶子步骤）**：
- [ ] 需求追踪：R001-R295 全部有执行步骤、验证方式、证据、PASS 结果。
- [ ] 静态质量：client/server typecheck、client lint、client/server vitest、production build 全通过。
- [ ] 接口契约：Dashboard TodayLive、Reports 四模块、Risk 管道阶段计数、Materials 分类饼图接口字段/空态/错误态一致。
- [ ] E2E 浏览器回归：三组 browser-suite 全通过，覆盖 16 个主页面、Planning/Gantt 高风险交互和 Onboarding。
- [ ] 视觉回归：1440×900、1366×768、768×1024、390×844 四档视口截图通过，无溢出、重叠、错层、弹层遮挡。
- [ ] 无障碍：键盘可达、focus-visible、Dialog/表单语义、aria-live/role=alert、颜色对比、reduced-motion 均通过。
- [ ] 性能与包体：production build、bundle budget、performance evidence 通过；重页面无明显卡顿。
- [ ] 上线冒烟与回滚：预发冒烟、env/status、迁移 plan、回滚预案、上线后 30 分钟观察完成。

---

## 终审补充：商业级精致度查漏

> 以下为 ui-ux-pro-max 终审发现的遗漏项，按优先级分类。已在方案中覆盖的项不重复列出。

### S1: 侧边栏（Sidebar.tsx）精细化

当前侧边栏整体质量较高（Lucide 图标统一、slate 色系、collapse/expand 动画），但存在以下细节问题：

1. **圆角不统一**：移动端菜单按钮 `rounded-2xl`（行 140）、当前项目区块 `rounded-2xl`（行 206）、新建项目按钮 `rounded-2xl`（行 226）→ 统一为 `rounded-xl`（与导航项一致）
2. **hover:scale-105 布局抖动**：移动端菜单按钮（行 140）→ 去掉 `hover:scale-105`，改为 `hover:bg-slate-100 hover:shadow-sm`
3. **shadow-blue 无效 class**：侧边栏 4 处 `shadow-blue`（行 84 等）→ `shadow-lg shadow-blue-950/20`（仅 active 态保留）
4. **任意字号**：`text-[11px]`（行 207）→ `text-xs`；`text-[10px]`（行 93 badge）→ `text-[10px]` 保留（badge 特殊场景）
5. **任意 tracking**：`tracking-[0.18em]`（行 207）→ `tracking-wider`
6. **缺少 cursor-pointer**：导航链接（行 79-98）无显式 `cursor-pointer`（`<Link>` 默认有，但子项 `<Link>` 应显式加上以确保一致性）
7. **缺少 focus-visible 状态**：导航项无 `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`，键盘导航时无视觉反馈
8. **折叠态 tooltip**：折叠态下导航项用 `title=` 属性（行 87/118）→ 改用 Radix Tooltip 组件（与全局 title→Tooltip 替换一致）

### S2: 小组件 Token 对齐

Phase 0 定义了统一 Token，但以下 shadcn/ui 基础组件的默认样式未对齐：

| 组件 | 当前 | 应改为 | 文件 |
|------|------|--------|------|
| Input | `rounded-md` | `rounded-lg` | `ui/input.tsx` |
| Select trigger | `rounded-md` | `rounded-lg` | `ui/select.tsx` |
| Tabs trigger | `rounded-md` | `rounded-lg` | `ui/tabs.tsx` |
| Toast | `rounded-md` | `rounded-lg` | `ui/toast.tsx` |
| Skeleton | `rounded-md` | `rounded-lg` | `ui/skeleton.tsx` |
| PageSkeleton | `rounded-[28px]`/`rounded-[24px]` | `rounded-2xl` | `ui/page-skeleton.tsx` |

> 这些组件是所有页面的基础，不对齐会导致全局圆角不一致。应在 Phase 0 统一处理。

### S3: 字体落地验证

**现状**：`index.css` 仅导入 Inter（行 1），`index.html` 无 preconnect，`tailwind.config.js` 无 fontFamily 配置。

Phase 0 第 4 项已规划"引入 Plus Jakarta Sans"，但需明确完整落地步骤：
1. `index.html`：加 `<link rel="preconnect" href="https://fonts.googleapis.com">` + `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
2. `index.css`：`@import` 从 Inter 改为 `Plus+Jakarta+Sans:wght@300;400;500;600;700`，保留 Inter 作为 fallback
3. `tailwind.config.js`：`fontFamily: { sans: ['"Plus Jakarta Sans"', 'Inter', ...defaultTheme.fontFamily.sans] }`
4. `font-display: swap` 已在 Google Fonts URL 中（`&display=swap`）

### S4: ConfirmDialog 统一收口

**现状**：3 套确认弹窗实现 + 1 处 `window.confirm()`：
- `components/planning/ConfirmDialog.tsx`（shadcn Dialog）
- `components/ConfirmActionDialog.tsx`（AlertDialog）
- `hooks/useConfirmDialog.ts`（自定义 hook）
- `DrawingsPage.tsx:498` 直接用 `window.confirm()`

**补充到 Phase 0**：
1. 统一为 `ConfirmActionDialog`（基于 AlertDialog，语义更正确）作为唯一确认弹窗
2. `window.confirm()` → `ConfirmActionDialog`（DrawingsPage 1 处）
3. `planning/ConfirmDialog.tsx` 内部改为调用 `ConfirmActionDialog`，保持 API 兼容
4. 统一样式：`rounded-2xl shadow-[var(--el-4)]`，破坏性操作按钮 `bg-red-600`

### S5: 404 页面缺失

**现状**：App.tsx 路由无 catch-all `<Route path="*" />`，访问不存在的路径会白屏。

**补充到 Phase 0 第 13 项（页面基础设施）**：
- 新建 `components/NotFoundPage.tsx`：EmptyState 风格（Lucide `FileQuestion` 图标 h-12 + "页面不存在" + "返回首页" CTA）
- App.tsx 路由末尾加 `<Route path="*" element={<NotFoundPage />} />`

### S6: 页面路由过渡动画

**现状**：`index.css` 定义了 `.page-enter { animate-fade-in }` 但未在任何页面组件上使用。路由切换无过渡，体感生硬。

**补充到 Phase 0**：
- 在 `.page-shell` class 中追加 `motion-safe:animate-fade-in`
- 所有使用 `.page-shell` 的页面自动获得入场动画，无需逐页修改

### S7: motion-safe 前缀缺失

**现状**：方案 ⑤ 微观细节层要求"所有动画加 `motion-safe:` 前缀"，但当前代码 0 处使用 `motion-safe:`。

**补充到 Phase 0**：在全局 class 定义中统一加前缀：
- `.card-hover`：`motion-safe:hover:-translate-y-0.5 motion-safe:transition-all`
- `.page-shell`：`motion-safe:animate-fade-in`
- 进度条：`motion-safe:transition-[width]`
- 各页面的 stagger 动画：`motion-safe:animate-fade-in`

### S8: title 属性数量更新

**现状**：Phase 0 第 12 项早期口径不一致；当前执行方案复核后锁定为 **125 处** `title=`，分布在 **37 个文件**。

**修正**：Phase 0 第 12 项数量统一为"125 处 `title=` 属性（37 个文件）"，以 `UI_UX优化执行方案.md` 的 U0.23 文件清单和验证命令为最终执行依据。

### S9: LoginDialog 表单体验

**现状**：LoginDialog 整体质量较好（ARIA 属性、Tab 陷阱、ESC 关闭），但缺少：
1. 密码可见性切换（Eye/EyeOff 图标）— ChangePasswordDialog 已有，LoginDialog 缺失
2. 实时字段校验（当前仅 submit 时校验）— 应 onBlur 校验（与 ③ 表单校验规范一致）

**补充到 Phase 0 第 16 项（原生元素替换，已包含 LoginDialog）**：
- LoginDialog 密码输入框加 Eye/EyeOff toggle
- 所有 Dialog 表单统一 onBlur 校验（LoginDialog/EditProfileDialog/ChangePasswordDialog/MilestoneDialog）

### S10: EditProfileDialog / ChangePasswordDialog 色系

**已覆盖**：Phase 0 第 5 项全局 `gray-*`→`slate-*` 替换已包含这两个文件。

### S11: shadow-blue 范围扩大

**现状**：Phase 0 第 10 项仅提到"GanttViewTaskContextMenu"1 处 `shadow-blue`，但实际审计发现 **7 处**分布在 4 个文件：EmptyState.tsx(1)/Sidebar.tsx(4)/ApplyModal.tsx(1)/PreviewModal.tsx(1)。

**修正**：Phase 0 第 10 项范围扩大为 4 个文件 7 处。

### S12: gray-* 重点文件补充

Phase 0 第 5 项标注"361 处"，审计确认准确。重点文件补充：ConditionsDialog(27)/PreviewModal(37)/GanttViewRowSections(22)/GanttViewDialogs(20)/CreateModal(21)。

---

### 终审补充对照表

| 编号 | 补充项 | 归入 Phase | 类型 |
|------|--------|-----------|------|
| S1 | 侧边栏精细化（8 项） | Phase 0 新增 | 新增 |
| S2 | 小组件 rounded-md→rounded-lg（6 组件） | Phase 0 扩充 | 扩充 |
| S3 | 字体落地完整步骤 | Phase 0 #4 细化 | 细化 |
| S4 | ConfirmDialog 统一收口 | Phase 0 新增 | 新增 |
| S5 | 404 页面 | Phase 0 #13 扩充 | 新增 |
| S6 | 页面路由过渡动画 | Phase 0 扩充 | 新增 |
| S7 | motion-safe 前缀 | Phase 0 扩充 | 新增 |
| S8 | title 属性数量修正 125 处/37 文件 | Phase 0 #12 修正 | 修正 |
| S9 | LoginDialog 表单体验 | Phase 0 #16 扩充 | 扩充 |
| S10 | EditProfile/ChangePassword 色系 | Phase 0 #5 已覆盖 | 确认 |
| S11 | shadow-blue 范围 7 处/4 文件 | Phase 0 #10 修正 | 修正 |
| S12 | gray-* 重点文件补充 | Phase 0 #5 补充 | 补充 |

---

## 涉及后端变化（标注）

### 需要新增/修改的接口（4 项）

1. **Dashboard TodayLive 聚合接口**（Phase 1）
   - 当前：无统一的"今日待处理"接口，到期任务/预警/变更/新增风险分散在不同端点
   - 需要：新增 `/api/dashboard/today-live` 聚合接口，返回按优先级排序的今日事项列表
   - 字段：`type`(due_task/warning/change/new_risk) + `priority`(1-4) + `title` + `detail` + `created_at`
   - 涉及文件：`server/src/routes/dashboard.ts`

2. **Reports S-Curve 数据接口**（Phase 2 模块 A）
   - 当前：`metricRegistry` 有 `overall_progress` 但无累计计划 vs 实际进度时间序列
   - 需要：在 `projectExecutionSummaryService` 或 analytics 补充 S-curve 数据
   - 字段：`date` + `planned_cumulative` + `actual_cumulative`（按天/周粒度）
   - 涉及文件：`server/src/analytics/metricRegistry.ts`

3. **RiskManagement 管道阶段计数**（Phase 3）
   - 当前：`riskStatisticsService` 按等级(critical/high/medium/low)和状态统计，无管道阶段
   - 需要：在风险统计接口补充按处置阶段(identified/assessed/responded/monitored)的计数
   - 涉及文件：`server/src/services/riskStatisticsService.ts`（行 17-75）

4. **Materials 分类饼图数据**（Phase 4）
   - 当前：`materialReportsService` 返回 `byUnit` 按单位统计，无按材料类别分组
   - 需要：在材料汇总接口补充 `byCategory` 分组（如：钢材/混凝土/管材/...）
   - 涉及文件：`server/src/services/materialReportsService.ts`（行 91-99）

### 已有接口可直接使用（4 项，无需后端改动）

5. **Reports 变更记录时间线**（Phase 2 模块 D）— ✅ 已有
   - `change-logs` 接口已返回 `changed_at` + `entity_type`，支持时间线展示
   - 文件：`server/src/routes/change-logs.ts`（行 13-61）

6. **RiskManagement 趋势多折线图**（Phase 3）— ✅ 已有
   - `risk-statistics/trend` 接口已返回 `RiskTrendData`（日期/新增/已解决/总数/按等级）
   - 文件：`server/src/routes/risk-statistics.ts`（行 46-55）

7. **AcceptanceTimeline 通过率**（Phase 7）— ✅ 已有
   - `acceptanceFlowService` 已返回 `passedCount` + `completionRate`
   - 注意：仅有整体通过率，无按阶段分组；前端可用现有数据计算分阶段通过率
   - 文件：`server/src/services/acceptanceFlowService.ts`（行 521-556）

8. **Notifications 分组计数**（Phase 6）— ✅ 已有
   - `notifications/summary` 接口已返回 `pendingCount`/`processedCount`/`businessWarningCount` 等分组计数
   - 文件：`server/src/routes/notifications.ts`（行 506-526）

### 可选增强（原有 1 项保留）

9. **CompanyCockpit 异常项目标记**（Phase 10）— 可选
    - 后端在项目列表接口增加 `isAnomalous` 字段
    - 前端可先用健康分阈值判断（healthScore < 60 = 异常）

> 标注为"需要"的 4 项接口改动是实现完整方案的前提；标注为"可选"的 2 项前端可先用替代方案。
