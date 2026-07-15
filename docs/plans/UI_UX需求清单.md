# UI/UX 商业级优化 — 完整需求清单
> **2026-07-13 现行覆盖**：本清单保留历史需求编号，但 PlanningWorkspace、CompanyProjectTemplateLibrary 和独立 WBSTemplates 页面相关条目不得进入当前路由、页面清单、原型或派工；WBS 能力只在 Gantt 新建/导入计划流程中消费。

> 从 `UI_UX商业级全面优化方案_v1.3.md` 逐条提取，共 **295 条**需求。
> 每条标注：需求ID | Phase | 描述 | 目标文件/范围 | 对应执行步骤

---

## Phase 0: Token 基础设施（72 条）

### 0A: 配置文件 & CSS 变量
| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R001 | --background 改为 #F8FAFC (slate-50) | index.css | U0.1 |
| R002 | 新增 --accent: #F97316 | index.css | U0.1 |
| R003 | 新增 --el-1 ~ --el-4 elevation 变量 | index.css | U0.1 |
| R004 | 新增 @keyframes fade-in | index.css | U0.1 |
| R005 | 新增 @keyframes expand-down | index.css | U0.1 |
| R006 | Tailwind colors.accent 配置 | tailwind.config.js | U0.2 |
| R007 | Tailwind fontFamily Plus Jakarta Sans + Inter | tailwind.config.js | U0.2 |
| R008 | Tailwind borderRadius lg/xl/2xl 标准化 | tailwind.config.js | U0.2 |
| R009 | Tailwind boxShadow el-1~el-4 | tailwind.config.js | U0.2 |
| R010 | Tailwind animation fade-in/expand-down | tailwind.config.js | U0.2 |
| R011 | Tailwind ease-bounce 曲线 | tailwind.config.js | U0.2 |
| R012 | .page-shell 全局类（motion-safe 动画） | index.css | U0.3 |
| R013 | .card-unified 全局类 | index.css | U0.3 |
| R014 | .card-hover 全局类（motion-safe 过渡） | index.css | U0.3 |
| R015 | prefers-reduced-motion 覆盖 | index.css | U0.3 |
| R016 | .card-l1/l2/l3 shadow 更新为 elevation | index.css | U0.3 |
| R017 | index.html preconnect Google Fonts | index.html | U0.4 |
| R018 | index.html Plus Jakarta Sans 引入 | index.html | U0.4 |
| R019 | index.css @import Inter → Plus Jakarta Sans | index.css | U0.4 |

### 0B: 全局批量替换
| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R020 | gray-* → slate-* (361处/28文件) | 全局 | U0.5 |
| R021 | text-[10px]/[11px] → text-xs | 全局 | U0.6 |
| R022 | text-[22px] → text-lg | 全局 | U0.6 |
| R023 | text-[26px] → text-2xl | 全局 | U0.6 |
| R024 | rounded-3xl/[24px]/[28px] → rounded-2xl | 全局 | U0.7 |
| R025 | bg-blue-500 → bg-blue-600 (75处) | 全局 | U0.8 |
| R026 | tracking-[0.16em]/[0.18em]/[0.22em] → tracking-wider | 全局 | U0.9 |
| R027 | shadow-blue → 正确值 (7处/4文件) | 全局 | U0.10 |
| R028 | 数据表格数字列加 tabular-nums | 全局 | U0.11 |
| R029 | h-3 w-3 → h-3.5 w-3.5 (70处) | 全局 | U0.12 |
| R030 | h-10 纯图标 → h-8 w-8 | 全局 | U0.12 |

### 0C: 基础组件
| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R031 | Input rounded-md → rounded-lg | ui/input.tsx | U0.13 |
| R032 | Select trigger rounded-md → rounded-lg | ui/select.tsx | U0.13 |
| R033 | Tabs trigger rounded-md → rounded-lg | ui/tabs.tsx | U0.13 |
| R034 | Toast rounded-md → rounded-lg | ui/toast.tsx | U0.13 |
| R035 | Skeleton rounded-md → rounded-lg | ui/skeleton.tsx | U0.13 |
| R036 | PageSkeleton rounded-[28px] → rounded-2xl | ui/page-skeleton.tsx | U0.13 |
| R037 | 新建 Tooltip 组件 (Radix UI) | ui/tooltip.tsx | U0.14 |
| R038 | 新建 Separator 组件 | ui/separator.tsx | U0.15 |
| R039 | Separator 替换 239处内联 border 分隔线 | 全局 | U0.15 |
| R040 | 新建 Checkbox 组件 (Radix UI) | ui/checkbox.tsx | U0.15b |
| R041 | ConfirmDialog 统一为 ConfirmActionDialog | 3文件 | U0.16 |
| R042 | window.confirm → ConfirmActionDialog | DrawingsPage.tsx | U0.16 |

### 0D: 页面基础设施
| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R043 | 新建 PageErrorBoundary 组件 | PageErrorBoundary.tsx | U0.17 |
| R044 | App.tsx 包裹 Routes 用 ErrorBoundary | App.tsx | U0.17 |
| R045 | 新建 useScrollRestoration hook | useScrollRestoration.ts | U0.18 |
| R046 | App.tsx 调用 useScrollRestoration | App.tsx | U0.18 |
| R047 | 新建 PageSkeleton 组件 | PageSkeleton.tsx | U0.19 |
| R048 | 新建 NotFoundPage 组件 | NotFoundPage.tsx | U0.20 |
| R049 | App.tsx 加 catch-all 404 路由 | App.tsx | U0.20 |
| R050 | 新建 SectionHeader 组件 | SectionHeader.tsx | U0.21 |
| R051 | 新建 CollapsibleSection 组件 | CollapsibleSection.tsx | U0.22 |

### 0E: 全局替换（组件级）
| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R052 | title= → Radix Tooltip (125处/37文件) | 全局 | U0.23 |
| R053 | 原生 select → Select (4处 GanttViewFilters) | GanttViewFilters | U0.24 |
| R054 | 原生 button → Button (120+处/25文件) | 全局 | U0.25 |
| R055 | PageHeader 内联 badge → Badge 组件 | 多文件 | U0.26 |
| R056 | 自建头像 → Avatar 组件 | 2文件 | U0.27 |
| R057 | LoginDialog 密码可见性 Eye/EyeOff | LoginDialog.tsx | U0.28 |
| R058 | LoginDialog onBlur 校验 | LoginDialog.tsx | U0.28 |
| R059 | EditProfileDialog onBlur 校验 | EditProfileDialog.tsx | U0.28 |
| R060 | ChangePasswordDialog onBlur 校验 | ChangePasswordDialog.tsx | U0.28 |
| R061 | MilestoneDialog onBlur 校验 | MilestoneDialog.tsx | U0.28 |

### 0F: Card 收口 + Sidebar
| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R062 | Card div → Card 组件 (105处/40文件) | 全局 | U0.29 |
| R063 | Sidebar rounded-2xl → rounded-xl (3处) | Sidebar.tsx | U0.30 |
| R064 | Sidebar 删除 hover:scale-105 | Sidebar.tsx | U0.30 |
| R065 | Sidebar shadow-blue 修复 (4处) | Sidebar.tsx | U0.30 |
| R066 | Sidebar text-[11px] → text-xs | Sidebar.tsx | U0.30 |
| R067 | Sidebar tracking-[0.18em] → tracking-wider | Sidebar.tsx | U0.30 |
| R068 | Sidebar 导航链接加 cursor-pointer | Sidebar.tsx | U0.30 |
| R069 | Sidebar 导航项加 focus-visible ring | Sidebar.tsx | U0.30 |
| R070 | Sidebar 折叠态 title= → Tooltip | Sidebar.tsx | U0.30 |
| R071 | MASTER.md Primary Button 改 blue-600 | MASTER.md | U0.31 |
| R072 | MASTER.md Shadow Depths → elevation | MASTER.md | U0.31 |

---

## Phase 14: 面包屑 + 页面 title（2 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R073 | 16 个页面加 Breadcrumb 组件 | 所有页面 | U14.1 |
| R074 | 16 个页面设置 document.title | 所有页面 | U14.1 |

---

## Phase 1: Dashboard（16 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R075 | [后端] 新增 today-live 聚合接口 | dashboard.ts | U1.0 |
| R076 | max-w-[1680px] → .page-shell | Dashboard.tsx | U1.1 |
| R077 | text-[26px] → text-2xl (2处) | Dashboard.tsx | U1.1 |
| R078 | text-[11px] → text-xs | Dashboard.tsx | U1.1 |
| R079 | ProjectInfoCard → Compact Header 折叠 | Dashboard.tsx | U1.2 |
| R080 | 健康分语义 pill (良好/一般/预警) | Dashboard.tsx | U1.2 |
| R081 | 4 Metric Cards (进度/偏差/风险/待办) | Dashboard.tsx | U1.3 |
| R082 | Metric Cards stagger 入场动画 60ms | Dashboard.tsx | U1.3 |
| R083 | sparkline 微图 (recharts 无轴) | Dashboard.tsx | U1.3 |
| R084 | TodayLive 4卡片 → 1紧凑列表 | Dashboard.tsx | U1.4 |
| R085 | TodayLive 按优先级排序+左色条 | Dashboard.tsx | U1.4 |
| R086 | TodayLive 最多5条+"查看全部(N)" | Dashboard.tsx | U1.4 |
| R087 | TodayLive 空状态 EmptyState | Dashboard.tsx | U1.4 |
| R088 | 6 section → 4 Tab (趋势/里程碑/单位/任务) | Dashboard.tsx | U1.5 |
| R089 | Tab 语义角标 (逾期数/任务数) | Dashboard.tsx | U1.5 |
| R090 | Tab 内容区 min-h-[400px] | Dashboard.tsx | U1.5 |

---

## Phase 2: Reports（22 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R091 | [后端] S-Curve 数据接口 | metricRegistry.ts | U2.0 |
| R092 | 加 .page-shell 容器 | Reports.tsx | U2.1 |
| R093 | 模块 chip 加语义角标 | Reports.tsx | U2.1 |
| R094 | chip key 对齐 progress/progress_deviation/risk/change_log | Reports.tsx | U2.1 |
| R095 | 默认选中进度总览 bg-blue-600 | Reports.tsx | U2.1 |
| R096 | 模块切换 fade-in 过渡 | Reports.tsx | U2.1 |
| R097 | 模块A: 3 Metric Cards xl:grid-cols-3 | Reports.tsx | U2.2 |
| R098 | 模块A: SCurveChart 卡片包裹 | Reports.tsx | U2.2 |
| R099 | 模块A: 关键节点列表 | Reports.tsx | U2.2 |
| R100 | 模块B: 统一 grid 比例 (4处) | Reports.tsx | U2.3 |
| R101 | 模块B: DeviationTabs sub-chip 角标 | Reports.tsx | U2.3 |
| R102 | 模块B: 图表统一卡片包裹 | Reports.tsx | U2.3 |
| R103 | 模块B: DeviationDetailTable 表格规范 | Reports.tsx | U2.3 |
| R104 | 模块C: 2 Metric Cards + sparkline | Reports.tsx | U2.4 |
| R105 | 模块C: 风险矩阵热力图 5×5 | Reports.tsx | U2.4 |
| R106 | 模块C: 风险列表+chips筛选+"查看全部" | Reports.tsx | U2.4 |
| R107 | 模块C: 列表左色条 (red/amber/green) | Reports.tsx | U2.4 |
| R108 | 模块D: 2 Metric Cards | Reports.tsx | U2.5 |
| R109 | 模块D: 时间线列表 | Reports.tsx | U2.5 |
| R110 | 模块D: 变更类型左色条 | Reports.tsx | U2.5 |
| R111 | 模块D: 状态 Badge | Reports.tsx | U2.5 |
| R112 | 模块D: 底部分页 | Reports.tsx | U2.5 |

---

## Phase 3: RiskManagement（14 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R113 | [后端] 管道阶段计数接口 | riskStatisticsService.ts | U3.0 |
| R114 | 加 .page-shell 容器 | RiskManagement.tsx | U3.1 |
| R115 | 4 MetricCards → 统一复合组件 | RiskManagement.tsx | U3.1 |
| R116 | DataQualityBanner 移到底部折叠 | RiskManagement.tsx | U3.1 |
| R117 | 链路流程图 (识别→评估→应对→监控) | RiskManagement.tsx | U3.2 |
| R118 | 流程图节点颜色 (orange/green/slate) | RiskManagement.tsx | U3.2 |
| R119 | OverviewCard 左色条 (amber/red/blue) | RiskManagement.tsx | U3.3 |
| R120 | OverviewCard hover 浮起 | RiskManagement.tsx | U3.3 |
| R121 | OverviewCard 内部: 数字+列表+"查看全部" | RiskManagement.tsx | U3.3 |
| R122 | 4 TrendSummary → 1 多折线图 | RiskManagement.tsx | U3.4 |
| R123 | 图例可点击切换 | RiskManagement.tsx | U3.4 |
| R124 | 列表区统一模式 (搜索+chips+列表+分页) | RiskManagement.tsx | U3.5 |
| R125 | 三流关系提示 (预警→风险→问题) | RiskManagement.tsx | U3.6 |
| R126 | 当前 Tab 节点高亮 | RiskManagement.tsx | U3.6 |

---

## Phase 8: GanttView（31 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R127 | console.error → toast.error (13处) | GanttView.tsx | U8.1 |
| R128 | Dialog 统一 rounded-2xl shadow-[var(--el-4)] | GanttView dialogs | U8.2 |
| R129 | Dialog 色调限制 3 种 | GanttView dialogs | U8.2 |
| R130 | TypeManagerDialog → Tab 分步表单 | GanttViewDialogs.tsx | U8.3 |
| R131 | 右键菜单 hover/transition 标准 | GanttViewTaskContextMenu | U8.4 |
| R132 | 右键菜单 Separator 分组 | GanttViewTaskContextMenu | U8.4 |
| R133 | 右键菜单破坏性操作 red + ConfirmDialog | GanttViewTaskContextMenu | U8.4 |
| R134 | 右键菜单 13项按功能分组 | GanttViewTaskContextMenu | U8.4 |
| R135 | 关键路径 6 项加描述行 | GanttViewTaskContextMenu | U8.4 |
| R136 | 右键菜单视口边界检测 | GanttViewTaskContextMenu | U8.4 |
| R137 | 统一底部操作栏 | GanttView.tsx | U8.5 |
| R138 | 关键路径图谱标题说明 | CriticalPathDialog | U8.6 |
| R139 | 关键路径节点 hover Tooltip | CriticalPathGraph | U8.6 |
| R140 | 关键路径显式图例 | CriticalPathGraph | U8.6 |
| R141 | 循环依赖警告 tooltip | CriticalPathGraph | U8.6 |
| R142 | 缩放控件加标签 | CriticalPathGraph | U8.6 |
| R143 | 视图切换 → Tab 风格 | GanttView.tsx | U8.7 |
| R144 | 任务数>50 操作提示 | GanttView.tsx | U8.7 |
| R145 | 筛选栏默认隐藏+"点击展开" | GanttViewFilters | U8.7 |
| R146 | GovernanceBanner 阶段 Badge tooltip | GovernanceBanner | U8.7 |
| R147 | 6 统计卡片 → 4 (合并滞后→异常) | GanttView.tsx | U8.8 |
| R148 | "异常" tooltip 解释 | GanttView.tsx | U8.8 |
| R149 | 筛选栏去掉"应用"按钮，实时生效 | GanttViewFilters | U8.9 |
| R150 | 任务行 hover 保留 2 按钮，其余收入 DropdownMenu | GanttViewRowSections | U8.10 |
| R151 | 双击编辑铅笔图标提示 | GanttViewRowSections | U8.11 |
| R152 | 数据质量 Badge tooltip (高/中/低) | DataQualityBanner | U8.12 |
| R153 | 数据质量整体说明文字 | DataQualityBanner | U8.12 |
| R154 | 批量操作栏精简 (左=计数，右=常用) | BatchActionBar | U8.5 |
| R155 | 批量操作多余项收入 DropdownMenu | BatchActionBar | U8.5 |
| R156 | "滞后" 术语 → "异常（进度落后）" | GanttView.tsx | U8.8 |
| R157 | "逾期" 加 tooltip | GanttView.tsx | U8.8 |

---

## Phase 9a: PlanningWorkspace（4 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R158 | PlanningPageShell 对齐 .page-shell | PlanningWorkspace.tsx | U9a.1 |
| R159 | 治理仪表盘 3面板 → 横向 xl:grid-cols-3 | PlanningWorkspace.tsx | U9a.2 |
| R160 | 治理仪表盘默认折叠 | PlanningWorkspace.tsx | U9a.2 |
| R161 | 无基线引导横幅 | PlanningWorkspace.tsx | U9a.3 |

## Phase 9b: BaselinePage（19 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R162 | 树表默认 8 列 | BaselinePage.tsx | U9b.1 |
| R163 | "更多列" Popover | BaselinePage.tsx | U9b.1 |
| R164 | 列宽标准化 | BaselinePage.tsx | U9b.1 |
| R165 | BottomBar 居中修复 | BaselinePage.tsx | U9b.2 |
| R166 | BottomBar 按钮分组 (左辅助/右主操作) | BaselinePage.tsx | U9b.2 |
| R167 | 超过 4 辅助按钮收入 DropdownMenu | BaselinePage.tsx | U9b.2 |
| R168 | ConfirmDialog 摘要视图 | BaselinePage.tsx | U9b.3 |
| R169 | ConfirmDialog 影响范围语义 pill | BaselinePage.tsx | U9b.3 |
| R170 | ConfirmDialog 展开详情 | BaselinePage.tsx | U9b.3 |
| R171 | RevisionPoolDialog 3步引导 | BaselinePage.tsx | U9b.4 |
| R172 | RevisionPoolDialog 进度指示器 | BaselinePage.tsx | U9b.4 |
| R173 | 详情抽屉统一模板 | BaselinePage.tsx | U9b.5 |
| R174 | 创建入口"空白"推荐高亮 | BaselinePage.tsx | U9b.6 |
| R175 | 导入/日程加描述行 | BaselinePage.tsx | U9b.6 |
| R176 | 双击编辑铅笔图标 | BaselinePage.tsx | U9b.7 |
| R177 | 键盘快捷键提示 Tab/Enter/Esc | BaselinePage.tsx | U9b.7 |
| R178 | "提升为上级"→"升级" + tooltip | BaselinePage.tsx | U9b.8 |
| R179 | "降为子级"→"降级" + tooltip | BaselinePage.tsx | U9b.8 |
| R180 | 版本切换高亮 + 草稿锁 tooltip | BaselinePage.tsx | U9b.9 |

## Phase 9c: MonthlyPlanPage（16 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R181 | 树表列控制 + 底部栏 | MonthlyPlanPage.tsx | U9c.1 |
| R182 | SkeletonDiffDialog 统一样式 | MonthlyPlanPage.tsx | U9c.2 |
| R183 | SkeletonDiffDialog 红/绿差异高亮 | MonthlyPlanPage.tsx | U9c.2 |
| R184 | RegenerationDialog 分步确认 | MonthlyPlanPage.tsx | U9c.2 |
| R185 | 双数据源选择器视觉区分 | MonthlyPlanPage.tsx | U9c.3 |
| R186 | 快速确认 tooltip | MonthlyPlanPage.tsx | U9c.4 |
| R187 | 不满足时 disabled + tooltip | MonthlyPlanPage.tsx | U9c.4 |
| R188 | 月滑块当前月高亮 ring-2 | MonthlyPlanPage.tsx | U9c.5 |
| R189 | 月状态 Badge tooltip | MonthlyPlanPage.tsx | U9c.5 |
| R190 | "批量移入"→"纳入本月计划" | MonthlyPlanPage.tsx | U9c.5 |
| R191 | "批量移出"→"移出本月计划" + ConfirmDialog | MonthlyPlanPage.tsx | U9c.5 |
| R192 | 3 来源选项加描述行 | MonthlyPlanPage.tsx | U9c.6 |
| R193 | 草稿恢复时间戳 | MonthlyPlanPage.tsx | U9c.6 |
| R194 | 撤销 tooltip Ctrl+Z | MonthlyPlanPage.tsx | U9c.7 |
| R195 | 重做 tooltip Ctrl+Y | MonthlyPlanPage.tsx | U9c.7 |
| R196 | "计划变更对比"按钮移到工具栏 | MonthlyPlanPage.tsx | U9c.5 |

## Phase 9d: CloseoutPage（7 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R197 | 级联选择器面包屑路径 | CloseoutPage.tsx | U9d.1 |
| R198 | 每级子项数量角标 | CloseoutPage.tsx | U9d.1 |
| R199 | 已选路径 bg-blue-50 高亮 | CloseoutPage.tsx | U9d.1 |
| R200 | 顶级分支加描述文字 | CloseoutPage.tsx | U9d.1 |
| R201 | CloseoutBatchBar 统一底部栏 | CloseoutPage.tsx | U9d.2 |
| R202 | CloseoutDetailDrawer 统一模板 | CloseoutPage.tsx | U9d.2 |
| R203 | 升级阶梯说明 (3天→5天→7天) | CloseoutPage.tsx | U9d.3 |

---

## Phase 4: Materials（11 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R204 | [后端] 材料分类饼图接口 | materialReportsService.ts | U4.0 |
| R205 | 加 .page-shell 容器 | Materials.tsx | U4.1 |
| R206 | 6 卡片 → 4 卡片 (合并相关指标) | Materials.tsx | U4.1 |
| R207 | 7:3 分栏布局 | Materials.tsx | U4.2 |
| R208 | 侧边栏: 快速统计+饼图+近期到场 | Materials.tsx | U4.2 |
| R209 | 删除操作加 ConfirmDialog | Materials.tsx | U4.3 |
| R210 | 工具栏 Select筛选+搜索+操作按钮 | Materials.tsx | U4.4 |
| R211 | 表格斑马纹 even:bg-slate-50/50 | Materials.tsx | U4.4 |
| R212 | 表格 hover bg-slate-100/60 | Materials.tsx | U4.4 |
| R213 | 操作列 group-hover:opacity-100 | Materials.tsx | U4.4 |
| R214 | 状态列语义色 dot + 文字 | Materials.tsx | U4.4 |

---

## Phase 5: Milestones（6 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R215 | max-w-[1600px] → .page-shell | Milestones.tsx | U5.1 |
| R216 | 5 卡片 → 4 卡片 | Milestones.tsx | U5.1 |
| R217 | HealthSummary top-3 + "更多(N)" | Milestones.tsx | U5.2 |
| R218 | 里程碑列表左色条 (green/blue/red) | Milestones.tsx | U5.3 |
| R219 | 进度条动画 duration-700 ease-out | Milestones.tsx | U5.3 |
| R220 | 2行摘要条布局 | Milestones.tsx | U5.3 |

---

## Phase 7: AcceptanceTimeline（12 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R221 | 加 .page-shell 容器 | AcceptanceTimeline.tsx | U7.1 |
| R222 | 7 StatCards → 4 (按验收阶段合并) | AcceptanceTimeline.tsx | U7.1 |
| R223 | 去除 tone-based 着色 | AcceptanceTimeline.tsx | U7.1 |
| R224 | 多段进度概览条 | AcceptanceTimeline.tsx | U7.2 |
| R225 | 进度条动画 duration-700 | AcceptanceTimeline.tsx | U7.2 |
| R226 | rounded-3xl → rounded-xl | AcceptanceTimeline.tsx | U7.3 |
| R227 | z-index 修复 (FlowNode/header/浮层) | AcceptanceTimeline.tsx | U7.3 |
| R228 | AcceptanceDetailDrawer 统一模板 | AcceptanceTimeline.tsx | U7.4 |
| R229 | 流程图节点颜色 (green/blue/slate) | AcceptanceTimeline.tsx | U7.5 |
| R230 | 节点 hover shadow + cursor-pointer | AcceptanceTimeline.tsx | U7.5 |
| R231 | 箭头 transition 动画 | AcceptanceTimeline.tsx | U7.5 |
| R232 | FlowBoard/Ledger → Tab 组件 | AcceptanceTimeline.tsx | U7.6 |

---

## Phase 12: PreMilestones（7 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R233 | 加 .page-shell 容器 | PreMilestones.tsx | U12.1 |
| R234 | 视图切换 Tab + 数字角标 | PreMilestones.tsx | U12.2 |
| R235 | Board 视图 card-unified + card-hover | PreMilestones.tsx | U12.3 |
| R236 | Ledger 视图表格规范 | PreMilestones.tsx | U12.4 |
| R237 | 详情抽屉统一模板 | PreMilestones.tsx | U12.5 |
| R238 | 看板与台账维度对齐 | PreMilestones.tsx | U12.6 |
| R239 | gray-* → slate-* (13子组件) | PreMilestones 子组件 | U0.5 |

---

## Phase 11: Drawings（6 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R240 | 加 .page-shell 容器 | DrawingsPage.tsx | U11.1 |
| R241 | 7 指标 → 4 核心 + 3 折叠 | DrawingsPage.tsx | U11.1 |
| R242 | 18列 → 默认8列 + "更多列" Popover | DrawingsPage.tsx | U11.2 |
| R243 | 工具栏 + Focus View 描述行 | DrawingsPage.tsx | U11.3 |
| R244 | 就绪度总进度条 + 按专业 mini 进度条 | DrawingsPage.tsx | U11.4 |
| R245 | window.confirm → ConfirmActionDialog | DrawingsPage.tsx | U11.5 |

---

## Phase 6: Notifications（11 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R246 | 加 .page-shell 容器 | Notifications.tsx | U6.1 |
| R247 | Header 7+按钮 → 搜索+筛选+设置 | Notifications.tsx | U6.2 |
| R248 | 多余按钮收入"更多操作" DropdownMenu | Notifications.tsx | U6.2 |
| R249 | 5 Tab → 3 Tab (全部/未读/已处理) | Notifications.tsx | U6.3 |
| R250 | 类型筛选改为 chips 放 Tab 下方 | Notifications.tsx | U6.3 |
| R251 | Settings 面板 z-20 → Popover z-50 | Notifications.tsx | U6.4 |
| R252 | 6 Badge → 2 Badge (类型+状态) | Notifications.tsx | U6.5 |
| R253 | 展开详情行 | Notifications.tsx | U6.5 |
| R254 | 未读样式 bg-blue-50 border-l-4 | Notifications.tsx | U6.5 |
| R255 | 分组标题: 日期+未读数 Badge | Notifications.tsx | U6.5 |
| R256 | 空状态 EmptyState | Notifications.tsx | U6.6 |

---

## Phase 13: TaskSummary（5 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R257 | container mx-auto → .page-shell | TaskSummary.tsx | U13.1 |
| R258 | 2 Metric Cards (总任务数/完成率) | TaskSummary.tsx | U13.2 |
| R259 | 分组 Section 标题规范 + 计数 Badge | TaskSummary.tsx | U13.3 |
| R260 | 默认展开前3组，其余折叠 | TaskSummary.tsx | U13.3 |
| R261 | 任务列表规范 (斑马纹/逾期红色) | TaskSummary.tsx | U13.4 |

---

## Phase 13b: ResponsibilityView（10 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R262 | 加 .page-shell 容器 | ResponsibilityView.tsx | U13b.1 |
| R263 | text-[26px] → text-2xl | ResponsibilityView.tsx | U13b.1 |
| R264 | text-[11px] → text-xs | ResponsibilityView.tsx | U13b.1 |
| R265 | 4 MetricCards → 统一复合组件 | ResponsibilityView.tsx | U13b.2 |
| R266 | 维度切换视觉加重 | ResponsibilityView.tsx | U13b.3 |
| R267 | 维度按钮 tooltip | ResponsibilityView.tsx | U13b.3 |
| R268 | "活跃延期"→"当前延期中" | ResponsibilityView.tsx | U13b.4 |
| R269 | "风险压力"→"风险关联度" + tooltip | ResponsibilityView.tsx | U13b.4 |
| R270 | "待确认恢复"→"待确认恢复正常" | ResponsibilityView.tsx | U13b.4 |
| R271 | 异常主体卡片 border-l-4 border-red-500 | ResponsibilityView.tsx | U13b.5 |

---

## Phase 10: CompanyCockpit（7 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R272 | max-w-[1680px] → .page-shell | CompanyCockpit.tsx | U10.1 |
| R273 | Hero 区 3 Metric Cards + gradient bg | CompanyCockpit.tsx | U10.2 |
| R274 | 健康分语义 pill | CompanyCockpit.tsx | U10.2 |
| R275 | 项目概览卡片网格 xl:grid-cols-3 | CompanyCockpit.tsx | U10.3 |
| R276 | 异常项目 border-l-4 border-orange-500 置顶 | CompanyCockpit.tsx | U10.3 |
| R277 | Insight 异常摘要卡片 | CompanyCockpit.tsx | U10.4 |
| R278 | 无异常 EmptyState | CompanyCockpit.tsx | U10.4 |

---

## Onboarding（5 条）

| ID | 描述 | 目标 | 步骤 |
|----|------|------|------|
| R279 | 新建 OnboardingGuide 组件 | OnboardingGuide.tsx | U.onboard |
| R280 | 5步 tooltip 引导 | OnboardingGuide.tsx | U.onboard |
| R281 | 进度圆点 ● ● ○ ○ ○ | OnboardingGuide.tsx | U.onboard |
| R282 | "跳过引导" 按钮 | OnboardingGuide.tsx | U.onboard |
| R283 | 完成后"每日工作流"卡片 | OnboardingGuide.tsx | U.onboard |

---

## 术语人性化（全局，12 条）

| ID | 原术语 | 替换为 | 涉及页面 | 步骤 |
|----|--------|--------|---------|------|
| R284 | 以计划完成日期为准 | 今天需要完成的 | Dashboard | U.terms.dashboard |
| R285 | 今天触发且尚未确认的系统预警 | 需要你关注的预警 | Dashboard | U.terms.dashboard |
| R286 | 数据置信度 | 数据可靠性 | RiskManagement | U.terms.risk |
| R287 | 骨架差异 | 计划变更对比 | Planning | U.terms.planning |
| R288 | 修订池 | 待处理的变更 | Planning | U.terms.planning |
| R289 | 映射状态 | 关联状态 | Planning | U.terms.planning |
| R290 | 重排 | 编辑模式 | Planning | U.terms.planning |
| R291 | 草稿锁 | 编辑锁定 | Planning | U.terms.planning |
| R292 | 提升为上级 | 升级 | Planning | U.terms.planning |
| R293 | 降为子级 | 降级 | Planning | U.terms.planning |
| R294 | 滞后 | 异常（进度落后） | GanttView | U.terms.gantt |
| R295 | 批量移入/移出 | 纳入/移出本月计划 | Planning | U.terms.planning |

---

## 统计

> 说明：295 条 = 283 条功能/视觉/交互需求 + 12 条术语人性化需求；所有条目均映射到执行方案叶子步骤。

| 分类 | 数量 |
|------|------|
| Phase 0 (Token基础) | 72 |
| Phase 14 (面包屑) | 2 |
| Phase 1 (Dashboard) | 16 |
| Phase 2 (Reports) | 22 |
| Phase 3 (RiskManagement) | 14 |
| Phase 8 (GanttView) | 31 |
| Phase 9 (Planning) | 46 |
| Phase 4 (Materials) | 11 |
| Phase 5 (Milestones) | 6 |
| Phase 7 (AcceptanceTimeline) | 12 |
| Phase 12 (PreMilestones) | 7 |
| Phase 11 (Drawings) | 6 |
| Phase 6 (Notifications) | 11 |
| Phase 13 (TaskSummary) | 5 |
| Phase 13b (ResponsibilityView) | 10 |
| Phase 10 (CompanyCockpit) | 7 |
| Onboarding | 5 |
| 术语人性化 | 12 |
| **总计** | **295** |
