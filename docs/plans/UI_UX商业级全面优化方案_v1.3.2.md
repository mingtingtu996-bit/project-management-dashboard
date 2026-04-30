# WorkBuddy UI/UX 商业级全面优化方案 v1.3.2

## 修订说明

本文件承接 `UI_UX商业级全面优化方案_v1.3.md` 与 `UI_UX精细化修复方案_v1.3.1.md`，记录 2026-04-30 基于本地真实浏览器复核发现的 **9 处“方案要求 vs 当前实现”出入**，以及第三轮“页面真实质量问题”复核后确认的跨页面问题。

所有后续解决方案必须遵守 v1.3 原则：`.page-shell` 标准容器、`YYYY-MM-DD` 日期、Plus Jakarta Sans + slate 色系、统一 Select/Popover/Menu、真实 Table、标准 Dialog、统一底部操作栏、每页一个视觉焦点、同屏最多 3 色调。

## 复核环境

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3001`
- 视口：`1440 x 900`
- 主要测试项目：`FULLAPP-STANDARD-20260419`
- 证据目录：`artifacts/v13-audit/`
- 第三轮质量证据：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`
- 第四轮质量证据：`artifacts/v13-audit/v132-fourth-round/fourth-round-aggregate.json`
- 第五轮质量证据：`artifacts/v13-audit/v132-fifth-round/fifth-round-aggregate.json`
- 第六轮质量证据：`artifacts/v13-audit/v132-sixth-round/sixth-round-aggregate.json`
- 第七轮质量证据：`artifacts/v13-audit/v132-seventh-round/seventh-round-aggregate.json`
- 第八轮质量证据：`artifacts/v13-audit/v132-eighth-round/eighth-round-aggregate.json`
- 第九轮收口证据：`artifacts/v13-audit/v132-ninth-round/ninth-round-closeout-summary.json`

## 9 处出入清单

### 1. RiskManagement 未稳定进入最终页面

- **方案要求**：Phase 3 要展示 `.page-shell`、4 个 Metric Cards、风险处置链路流程图、OverviewCard 三卡、趋势合并图、列表区筛选与分页、三流关系提示。
- **当前观察**：在复核项目中页面只呈现侧边栏/顶部信息，未稳定渲染 `.page-shell` 主体；`识别 / 评估 / 应对 / 监控 / 数据可靠性` 等关键内容未出现。
- **影响**：Phase 3 无法按浏览器证据验收，需先排查加载态/数据依赖/权限条件。
- **证据**：`artifacts/v13-audit/browser-evidence-risk-mile.json`

### 2. Materials 卡在加载态

- **方案要求**：Phase 4 要展示 4 个指标、7:3 主体分栏、材料列表工具栏、右侧快速统计、分类饼图、近期到场列表。
- **当前观察**：页面停留在“材料清单加载中”，未出现 `.page-shell`、指标区、材料列表或右侧栏。
- **影响**：Phase 4 无法按方案验收；真实接口虽然返回部分 200，但页面仍未完成渲染。
- **证据**：`artifacts/v13-audit/browser-evidence-ops.json`

### 3. CompanyCockpit 指标口径与文案不一致

- **方案要求**：Hero 指标为“项目总数 / 活跃项目 / 整体健康分”，项目概览应按真实项目数量与健康分展示。
- **当前观察**：页面显示“项目总数 0 / 活跃项目 0 / 整体健康 0”，同时下方又列出 5 个项目，并出现“当前筛出 5 / 0 个项目”的口径矛盾；未命中“整体健康分”文案。
- **影响**：公司驾驶舱视觉焦点存在数据可信度问题。
- **附带问题**：控制台出现 `RiskBubbleMatrix` 子项缺少唯一 `key` 的 React warning。
- **证据**：`artifacts/v13-audit/browser-evidence-core.json`

### 4. Dashboard Header 未完全符合 Compact Header 方案

- **方案要求**：项目名 Compact Header：项目名 + 阶段 Badge + 健康分语义 pill + 展开按钮；展开后显示完整项目信息。
- **当前观察**：页面 H1 为“项目”，而非明确项目名；虽然存在 4 KPI、TodayLive 和分析 Tab，但 Compact Header 的项目名/阶段/健康分表达不完整。
- **影响**：首屏识别度弱，仍不符合 v1.3 对 Dashboard 第一印象的要求。
- **证据**：`artifacts/v13-audit/browser-evidence-core.json`

### 5. Dashboard 首屏焦点仍偏散

- **方案要求**：首屏视觉焦点应是 4 个核心 Metric Cards + TodayLive 紧凑列表，分析区后置 Tab。
- **当前观察**：首屏除 4 KPI 与 TodayLive 外，还出现“本月主要降分维度”等数据质量内容，焦点不够收束。
- **影响**：新手首屏认知负担仍高，未完全达成“降低认知负担”的目标。
- **证据**：`artifacts/v13-audit/browser-evidence-core.json`

### 6. Reports 进度总览指标区未按 3 张 Metric Card 呈现

- **方案要求**：Reports 模块 A 顶部为 3 个 Metric Card：总任务数 / 完成率 / 本月新增，`xl:grid-cols-3 gap-4`。
- **当前观察**：浏览器中三项指标被合并在一个卡片文本块里，检测到的 metric 节点数量为 1。
- **影响**：Metric 视觉层级和扫描效率不符合方案。
- **证据**：`artifacts/v13-audit/browser-evidence-core.json`

### 7. Reports 日期格式未统一

- **方案要求**：日期统一为 `YYYY-MM-DD`，并使用 `tabular-nums text-slate-500`。
- **当前观察**：关键节点列表显示 `Mon Jun 15 2026 00:00:00 GMT+0800 (中国标准时间)` 这类原生 Date 字符串。
- **影响**：占用空间、可读性差，并破坏报表专业感。
- **证据**：`artifacts/v13-audit/browser-evidence-core.json`

### 8. GanttView 细节仍有未对齐项

- **方案要求**：筛选栏实时生效，仅保留“重置”按钮；页面 title 按 Phase 14 统一为“页面名 | WorkBuddy”；4 指标合并为总任务/进行中/已完成/异常。
- **当前观察**：4 指标与视图切换已出现，但浏览器关键词未命中“重置”；document title 为一串业务路径式文本，而不是统一格式。
- **影响**：Phase 8 与 Phase 14 部分未完全收口。
- **证据**：`artifacts/v13-audit/browser-evidence-ops.json`

### 9. Planning Baseline 仍残留原生 Select

- **方案要求**：操作区筛选、列控制和选项集合应使用统一 Select/Popover/Menu 组件，保持交互和视觉一致。
- **当前观察**：项目基线页面仍检测到原生 `<select>`，文本为“不指定对比版本”。
- **影响**：基础组件收口不完整；同时会影响键盘/focus/弹层样式一致性。
- **证据**：`artifacts/v13-audit/browser-evidence-ops.json`

## 第三轮追加：页面真实质量问题

以下问题来自第三轮真实浏览器复核，覆盖 `1440 x 900` 与 `1366 x 768` 两档桌面视口，并按顶部、中部、底部、关键按钮点击后状态采样。

### 10. 固定操作栏 / 浮层超出视口

- **当前观察**：`Gantt-list`、`Gantt-critical-path`、`Gantt-scope-dimensions`、`Large-Gantt`、`PlanningCloseout`、`PreMilestones` 均出现固定底栏或浮层跑出视口的问题。
- **影响**：核心操作不可见或被截断，用户无法稳定完成批量处理、确认、保存等关键动作。
- **v1.3 合规解决方案**：底部操作栏统一使用 `fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-[1440px]`；左侧放辅助操作，右侧放主操作；页面内容区统一补 `pb-20`，避免末尾内容被遮挡。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 11. 页面元素重叠与遮挡

- **当前观察**：`Dashboard`、`Gantt-*`、`Materials`、`PlanningBaseline`、`Large-Gantt` 存在按钮、表格列、导航项、图表说明或任务文本互相覆盖。
- **影响**：信息不可读，操作目标不清晰，破坏 v1.3 “每页最多 3 层视觉层级”和“操作区易理解好操作”的要求。
- **v1.3 合规解决方案**：树表和数据表统一改为 shadcn `<Table>` 或稳定 grid tracks；表头 sticky；数字列 `text-right tabular-nums`；长文本 `truncate` + Tooltip；操作列按 `group-hover:opacity-100` 收起；禁止让内容挤压同层按钮。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 12. Dialog / 抽屉高度失控

- **当前观察**：`Gantt-scope-dimensions` 的范围维度 Dialog 高度达到约 2176px，顶部跑出视口；`PreMilestones` 的证照详情抽屉也被检测为视口外。
- **影响**：弹窗内容不可完整访问，关闭与确认区域可能不可见。
- **v1.3 合规解决方案**：统一 Radix Dialog 结构；复杂内容使用 `max-w-[720px] w-[90%] max-h-[calc(100vh-64px)] overflow-y-auto rounded-2xl p-6 shadow-[var(--el-4)]`；保留右上角关闭、ESC、遮罩点击和焦点陷阱。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 13. Dashboard 进度趋势点击无响应

- **当前观察**：`Dashboard` 中“进度趋势”入口在两档桌面视口下均能找到，但点击后 `url` 与页面文本都没有变化。
- **影响**：用户会误以为图表或 Tab 损坏，降低核心仪表盘可信度。
- **v1.3 合规解决方案**：该入口必须改成真实 Tab/按钮状态切换；点击后至少满足三者之一：active 状态变化、对应内容变化、明确路由跳转；异步失败必须 toast。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 14. 接口失败导致页面质量失真

- **当前观察**：`PlanningBaseline` 出现 `403 revision-pool / queue-realignment`；`PlanningCloseout` 出现 `500 closeout-summary / closeout-confirm-summary`。
- **影响**：页面可能进入半渲染、缺数据或异常布局状态，不能按视觉问题单独处理。
- **v1.3 合规解决方案**：先修接口权限与服务端错误；前端按 v1.3 增加错误态、重试按钮、toast 与 PageErrorBoundary；禁止静默失败。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 15. 长日期 / 原生时间格式扩散

- **当前观察**：`Dashboard`、`Drawings`、`Gantt-timeline`、`PlanningBaseline`、`PreMilestones`、`Reports-progress`、`Reports-risk`、`Reports-change` 出现 ISO、GMT、英文 Date 或带毫秒的时间字符串。
- **影响**：占用空间，破坏表格和卡片布局，也不符合 v1.3 数字美化规范。
- **v1.3 合规解决方案**：统一共享日期格式器，所有页面输出 `YYYY-MM-DD`；时间戳仅在必要详情中展示，并使用 `tabular-nums text-slate-500`；禁止直接渲染 `Date.toString()`、ISO 原串或后端原始时间。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 16. 嵌套滚动与横向滚动模型混乱

- **当前观察**：`Gantt-*`、`Materials`、`PlanningBaseline`、`PreMilestones`、`Large-Gantt` 等页面存在主滚动叠加内部滚动，部分表格/时间轴横向溢出明显。
- **影响**：用户不知道应该滚动页面、表格还是弹层，尤其影响树表、横道图和材料台账。
- **v1.3 合规解决方案**：页面仅保留主滚动；表格横向滚动只允许存在于唯一表格容器内；时间轴/横道图应明确左侧固定列 + 右侧时间轴滚动边界；滚动区域需有稳定高度与 sticky 表头。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 17. 原生 Select 未收口

- **当前观察**：`AcceptanceTimeline`、`Gantt-critical-path`、`Gantt-timeline`、`Materials`、`PlanningBaseline`、`PreMilestones`、`Standard-Materials` 检测到原生 `<select>`。
- **影响**：样式、focus、键盘体验和弹层定位不统一。
- **v1.3 合规解决方案**：全部替换为统一 Select/Popover/Menu 组件；PopoverContent 必须指定 `align` 与 `side`；筛选场景遵循“报表区 chips，操作区工具栏 Select”。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 18. 英文状态 / 技术枚举外露

- **当前观察**：`Reports-change`、`Reports-risk`、`Responsibility`、`TaskSummary` 出现 `manual_adjusted`、`in_progress`、`pending`、`mapped` 等技术枚举或英文状态。
- **影响**：不符合 v1.3 “术语人性化”要求，增加新手理解成本。
- **v1.3 合规解决方案**：建立状态映射层，将后端枚举转为中文业务状态，例如 `in_progress` -> `进行中`、`pending` -> `待处理`、`manual_adjusted` -> `人工调整`、`mapped` -> `已关联`；状态列使用色点 + 文字，颜色不能是唯一信息载体。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 19. 部分页面未接入标准 page-shell

- **当前观察**：`RiskManagement`、`Standard-Materials`、`WBSTemplates` 未稳定检测到 `.page-shell`。
- **影响**：页宽、留白、区块间距和页面标准结构无法统一。
- **v1.3 合规解决方案**：按页面类型重包标准结构：Breadcrumb -> PageHeader -> Metric Cards -> 主内容区；容器统一 `.page-shell max-w-[1440px] mx-auto px-4 md:px-6 lg:px-8 py-6 lg:py-8 space-y-8`。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 20. 卡片颜色 / 边框体系噪声偏多

- **当前观察**：`AcceptanceTimeline`、`Dashboard`、`RiskManagement` 的卡片背景和左边框组合偏多。
- **影响**：同屏视觉焦点分散，不符合 v1.3 “每页有且仅有 1 个视觉焦点区域、同屏最多 3 种色调”。
- **v1.3 合规解决方案**：统一 `card-unified` 与 elevation；语义色仅保留主色 + 1 个语义色 + slate；左边框只用于同级卡片类型区分，避免任意彩色卡片混用。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

### 21. 内容裁切 / 跑出视口覆盖面广

- **当前观察**：第三轮 26 个路由均检测到不同程度的内容裁切或跑出视口，其中表格、筛选区、长列表、详情面板最明显。
- **影响**：属于全局页面质量门禁问题，不能只按单页修补。
- **v1.3 合规解决方案**：新增真实浏览器门禁：每页至少检测顶部、中部、底部三段；任何可交互元素不得跑出视口；文本必须可读或有 Tooltip；修复后用同一巡检脚本复测。
- **证据**：`artifacts/v13-audit/v132-third-round/third-round-aggregate.json`

## 第四轮追加：语义、交互与可访问性质量问题

以下问题来自第四轮真实浏览器复核，覆盖 `1440 x 900`、`1366 x 768` 与 `1280 x 720` 三档桌面视口，并重点核查页面识别、标题规范、语义面包屑、加载态、关键入口、图表替代数据、表单 label 与确认弹窗。

### 22. 页面 H1 业务识别度不足

- **当前观察**：`Dashboard`、`Gantt-timeline`、`Materials`、`RiskManagement`、`Standard-Materials`、`TaskSummary` 出现 H1 过泛或不稳定，例如仅显示“项目”。
- **影响**：用户进入页面后无法第一眼确认当前业务上下文，也不符合 v1.3 “页面标题左对齐，与内容区左边缘对齐”的标准结构。
- **v1.3 合规解决方案**：所有项目级页面 H1 必须使用明确业务名，如“项目仪表盘 / 风险与问题 / 材料管控 / 任务总结”；项目名、阶段、权限与健康状态放入 PageHeader Badge/Pill，不再把 H1 简化为泛词。
- **证据**：`artifacts/v13-audit/v132-fourth-round/fourth-round-aggregate.json`

### 23. document.title 未统一

- **当前观察**：`Gantt-critical-path`、`Gantt-list`、`Gantt-scope-dimensions`、`Gantt-timeline`、`Large-Gantt`、`WBSTemplates` 的 document title 仍出现业务路径串，而非 `页面名 | WorkBuddy`。
- **影响**：浏览器标签页、收藏、历史记录和辅助技术读屏都无法获得一致页面名称。
- **v1.3 合规解决方案**：所有路由统一通过页面级 hook 设置 `document.title = "页面名 | WorkBuddy"`；复杂工作台内部 Tab 不改变 title 为长路径，只更新页面内 active 状态。
- **证据**：`artifacts/v13-audit/v132-fourth-round/fourth-round-aggregate.json`

### 24. 项目级页面缺少语义化 Breadcrumb

- **当前观察**：`Gantt-timeline`、`Materials`、`RiskManagement`、`Standard-Materials`、`TaskSummary` 未稳定检测到语义化 Breadcrumb 容器。
- **影响**：虽然页面文本里有路径信息，但缺少 `nav` / `aria-label` / 标准 Breadcrumb 结构，键盘和读屏用户难以理解层级。
- **v1.3 合规解决方案**：所有项目级子页面必须使用统一 Breadcrumb 组件，结构为 `nav aria-label="breadcrumb"`，视觉顺序与 Tab 顺序一致；不要只用普通文本模拟面包屑。
- **证据**：`artifacts/v13-audit/v132-fourth-round/fourth-round-aggregate.json`

### 25. 部分页面稳定出现加载态 / 主体不足

- **当前观察**：`Materials`、`Large-Reports-progress`、`Standard-Materials`、`Responsibility`、`TaskSummary`、`Reports-change`、`Reports-deviation`、`Reports-risk` 出现加载态或主体内容不足信号；用户已确认该类问题存在。
- **影响**：页面可能进入无结果、半加载或数据依赖未完成状态，用户无法判断是没有数据、加载失败还是系统异常。
- **v1.3 合规解决方案**：首次加载必须使用匹配真实布局的 `PageSkeleton`；加载失败显示错误态 + “重试”按钮；空数据使用 EmptyState；接口失败必须 toast；禁止只停留在“加载中”文本。
- **证据**：`artifacts/v13-audit/v132-fourth-round/fourth-round-aggregate.json`

### 26. 关键入口点击缺少可见反馈

- **当前观察**：`Dashboard` 的“进度趋势”、`AcceptanceTimeline` 的“流程图 / 台账”、`PlanningBaseline` 的“月度计划”点击后没有 URL、文本或明显 active 状态变化。
- **影响**：用户无法确认点击是否生效，容易重复点击或误判功能不可用。
- **v1.3 合规解决方案**：Tab/分段控件必须有 `aria-selected`、active 样式与内容切换；如果点击当前已选项，应保持明显 selected 状态；异步入口必须显示 loading/disabled/toast；无跳转入口不得伪装成导航按钮。
- **证据**：`artifacts/v13-audit/v132-fourth-round/fourth-round-aggregate.json`

### 27. 材料页关键录入入口缺失

- **当前观察**：DEMO 材料页未找到 `单条新增 / 模板预填 / 批量录入` 三个关键入口；用户已确认该问题存在。
- **影响**：材料管控作为操作区无法完成基础录入流程，与 v1.3 Phase 4 的材料列表工具栏要求不一致。
- **v1.3 合规解决方案**：材料页工具栏按操作区标准恢复：搜索 + Select 筛选 + 主操作按钮组；主 CTA 使用 `bg-blue-600` 或按 v1.3 accent 规则；入口必须可见、可聚焦、可点击，并在无权限时显示 disabled 原因。
- **证据**：`artifacts/v13-audit/v132-fourth-round/fourth-round-aggregate.json`

### 28. 图表缺少数据表替代

- **当前观察**：`CompanyCockpit`、`Reports-risk`、`Responsibility` 检测到图表/图形区域，但未检测到 `<details><summary>查看数据表</summary>...` 数据表替代。
- **影响**：不符合 v1.3 可访问性规范，用户无法在图表不可读、导出或读屏场景下获取原始数据。
- **v1.3 合规解决方案**：所有 Pie/Line/Bar/Sparkline 图表都必须提供折叠数据表；表格使用真实 `<table>`，数字列 `tabular-nums`，并与图表数据源保持一致。
- **证据**：`artifacts/v13-audit/v132-fourth-round/fourth-round-aggregate.json`

### 29. 表单字段 label / aria-label 不完整

- **当前观察**：`Gantt-timeline` 的基线选择、`PreMilestones` 的证件类型筛选等 select 缺少 label 或 aria-label。
- **影响**：不符合 v1.3 “所有 input 必须有关联 label，禁止 placeholder-only”的表单规范，也影响键盘与读屏体验。
- **v1.3 合规解决方案**：所有 input/select/textarea 必须绑定 `<label htmlFor>` 或 `aria-label/aria-labelledby`；工具栏紧凑筛选可使用 visually hidden label，但不能省略语义名称。
- **证据**：`artifacts/v13-audit/v132-fourth-round/fourth-round-aggregate.json`

### 30. 破坏性操作确认链路不完整

- **当前观察**：`Gantt-list`、`Gantt-critical-path`、`Gantt-scope-dimensions`、`Large-Gantt` 页面存在“删除”等破坏性入口，但当前 DOM 未稳定检测到 ConfirmDialog 结构；用户已确认该类问题存在。
- **影响**：误删风险高，且不符合 v1.3 “破坏性操作必须 ConfirmDialog”的交互标准。
- **v1.3 合规解决方案**：所有删除、移除、作废、清空、重置类动作必须走统一 `ConfirmDialog`；确认按钮使用破坏性语义色，取消按钮为次要按钮；Dialog 支持 ESC/遮罩关闭，真正提交时进入 loading disabled 状态。
- **证据**：`artifacts/v13-audit/v132-fourth-round/fourth-round-aggregate.json`

## 第五轮追加：关键流程交互后状态问题

以下问题来自第五轮真实浏览器复核，重点检查关键入口点击后是否有 active 状态、文本变化、URL 变化、弹层定位、焦点进入弹层、表单可访问名称和破坏性操作确认链路。已过滤“当前已选项点击不变化”这类可能误报。

### 31. Inactive Tab / 视图切换点击无反馈

- **当前观察**：`Dashboard` 的“近期任务”处于 inactive tab 状态，但点击后页面 URL 与文本均未变化；`AcceptanceTimeline` 的“台账”同样处于 inactive tab 状态，点击后无可见反馈。
- **影响**：用户无法判断是当前视图、切换失败还是按钮不可用，直接影响仪表盘和验收流程的核心浏览路径。
- **v1.3 合规解决方案**：所有 Tab/分段控件必须使用标准 Tabs 语义，提供 `role="tab"`、`aria-selected`、`data-state=active/inactive`、明确 active 样式和内容区域切换；点击 inactive 项必须产生内容变化或 active 状态变化。
- **证据**：`artifacts/v13-audit/v132-fifth-round/fifth-round-aggregate.json`

### 32. 弹层 / 抽屉打开后焦点未进入

- **当前观察**：`Gantt` 关键路径窗口打开后焦点未明显进入 Dialog；`PreMilestones` 点击“新增办理事项”后焦点仍停留在 `body`，没有进入证照详情抽屉。
- **影响**：键盘用户无法继续操作弹层，读屏用户也难以感知上下文切换。
- **v1.3 合规解决方案**：所有 Dialog/Drawer 打开后必须将焦点移动到标题、关闭按钮或第一个可操作控件；使用 Radix Dialog 焦点陷阱；关闭后焦点回到触发按钮。
- **证据**：`artifacts/v13-audit/v132-fifth-round/fifth-round-aggregate.json`

### 33. 前期证照新增入口触发错误抽屉 / 抽屉越界

- **当前观察**：`PreMilestones` 点击“新增办理事项”后出现 `certificate-detail-drawer`，其位置为 `x=1440, w=720`，整体位于视口右侧之外，并且内容像“土地证详情”而不是新增办理表单。
- **影响**：新增流程不可用或入口语义错误，用户无法完成前期证照新增办理动作。
- **v1.3 合规解决方案**：新增入口必须打开对应 Create/Edit Dialog，而不是详情抽屉；抽屉应使用标准 Dialog/Drawer 尺寸与 `max-h`，确保在 `1440 x 900` 内完整可见；入口、标题、表单字段和提交按钮语义一致。
- **证据**：`artifacts/v13-audit/v132-fifth-round/fifth-round-aggregate.json`

### 34. 材料录入入口跨项目缺失

- **当前观察**：`Materials-demo-actions` 与 `Materials-standard-actions` 均未找到 `单条新增 / 模板预填 / 批量录入` 三个关键入口。
- **影响**：材料管控无法完成基础录入，不只是 DEMO 数据状态问题，而是跨项目工具栏能力缺失。
- **v1.3 合规解决方案**：材料页工具栏必须稳定展示三类录入入口；无权限时显示 disabled + Tooltip 原因；有权限时点击进入标准表单 Dialog，提交过程使用 loading disabled + toast。
- **证据**：`artifacts/v13-audit/v132-fifth-round/fifth-round-aggregate.json`

### 35. 报表视图切换入口不完整

- **当前观察**：`Reports-view-switch` 中“进度偏差”“风险”可以找到并切换，但“变更”入口未稳定找到。
- **影响**：报表分析四类视图入口不完整，用户无法从统一分析入口稳定进入变更记录分析。
- **v1.3 合规解决方案**：报表顶部视图切换必须覆盖 `进度总览 / 进度偏差 / 风险 / 变更`，使用统一 Tabs 或 chips；每个入口都有数量角标、active 状态和可访问名称。
- **证据**：`artifacts/v13-audit/v132-fifth-round/fifth-round-aggregate.json`

## 第六轮追加：Token 与组件基础设施一致性问题

以下问题来自第六轮真实页面 token/组件巡检。圆角检测中的头像、状态点、Badge/Pill 属于 v1.3 合理例外，不作为独立缺陷；本轮只收录会影响组件一致性、可用性和页面专业感的真实问题。

### 36. 非推荐紫色系仍有残留

- **当前观察**：`WBSTemplates` 仍检测到 `bg-purple-100`、`bg-purple-50 text-purple-600` 等紫色系 class。
- **影响**：违反 v1.3 “不用 AI 紫/粉色系”和“灰色系统一 slate”的色彩约束，也会让模板资产页与其他业务页色调割裂。
- **v1.3 合规解决方案**：将模板页紫色语义改为 slate/blue/orange 体系；模板类型 Badge 使用 `Badge variant` 或统一语义色映射；非关键路径场景不得新增 violet/purple/pink 色系。
- **证据**：`artifacts/v13-audit/v132-sixth-round/sixth-round-aggregate.json`

### 37. 多页面存在卡片嵌套卡片

- **当前观察**：`CompanyCockpit`、`Dashboard`、`Reports-*`、`PlanningBaseline`、`PlanningMonthly`、`PlanningCloseout`、`PreMilestones`、`AcceptanceTimeline`、`WBSTemplates` 等页面存在疑似卡片内再放卡片的结构。
- **影响**：违反 v1.3 “不要把 UI cards 放进其他 cards”的布局规则，容易造成阴影、边框、留白层级混乱。
- **v1.3 合规解决方案**：页面 Section 使用无框布局或 full-width band；只有重复列表项、弹窗和真实工具面板使用 Card；嵌套内容改为 `Separator`、列表行、轻量 `div` 或表格行，不再叠加 Card。
- **证据**：`artifacts/v13-audit/v132-sixth-round/sixth-round-aggregate.json`

### 38. 卡片内边距低于 p-5 标准

- **当前观察**：`Dashboard`、`Reports-*`、`PlanningMonthly`、`PlanningCloseout`、`Milestones`、`Notifications`、`AcceptanceTimeline`、`WBSTemplates` 等页面检测到卡片内容区 padding 低于 v1.3 `p-5` 标准。
- **影响**：卡片内容贴边，视觉呼吸感不足，和 Swiss Modernism 2.0 的留白策略不一致。
- **v1.3 合规解决方案**：统一使用 `card-unified` 或 Card 组件 variant；普通卡片 `p-5`，紧凑表格行不伪装为卡片；Metric 卡片内数字、标签、sparkline 保持 `gap-4`。
- **证据**：`artifacts/v13-audit/v132-sixth-round/sixth-round-aggregate.json`

### 39. 真实可点击目标偏小

- **当前观察**：多页面检测到低于 32px 的可点击目标，其中 skip link、状态点等不计入问题；真实风险集中在面包屑小链接、返回入口、图表内链接、部分窄按钮和行内操作。
- **影响**：鼠标与键盘用户都更容易误点或漏点，操作区可用性下降。
- **v1.3 合规解决方案**：真实交互目标最小命中区不低于 32px；行内小图标使用 `h-3.5 w-3.5` 但外层 button 仍应提供足够 padding；面包屑和返回入口保持可聚焦、可点击区域稳定。
- **证据**：`artifacts/v13-audit/v132-sixth-round/sixth-round-aggregate.json`

## 第七轮追加：数据口径与页面状态一致性问题

以下问题来自第七轮真实页面一致性巡检，重点检查空态、加载态、指标卡、列表数量、项目上下文和主要操作入口是否互相冲突。本轮问题会直接影响页面可信度，修复时必须先统一数据状态机，再做视觉和组件层优化。

### 40. 空状态与正数数据共存

- **当前观察**：`CompanyCockpit`、`Dashboard`、`Gantt-list`、`PlanningBaseline`、`PreMilestones`、`Reports-deviation`、`Reports-progress`、`Reports-risk` 均检测到“暂无 / 无数据 / 当前没有”等空态文案，同时页面又展示正数列表、正数角标或可查看的业务数据。
- **影响**：用户无法判断当前到底是没有数据、筛选无结果、接口未加载完，还是页面展示逻辑错误。
- **v1.3 合规解决方案**：每个数据区统一为 `loading -> error -> empty -> content` 互斥状态；EmptyState 只允许在 `total === 0 && rows.length === 0` 时渲染；列表、图表、Metric Card 和 EmptyState 必须从同一份派生数据读取数量；禁止在同一 Section 内同时显示空态和业务内容。
- **证据**：`artifacts/v13-audit/v132-seventh-round/seventh-round-aggregate.json`

### 41. 数量口径出现当前数大于总数

- **当前观察**：`CompanyCockpit` 明确出现 `当前筛出 5 / 0 个项目`，同时顶部指标又显示 `项目总数 0 / 活跃项目 0`，但下方项目卡片与预警分布仍展示 5 个项目。
- **影响**：公司驾驶舱作为公司级总览入口，数量口径失真会让项目健康、预警和筛选结果全部失去可信度。
- **v1.3 合规解决方案**：建立统一 `totalCount / filteredCount / activeCount / warningCount` 派生层，禁止各组件自行计算；`filteredCount` 不得大于 `totalCount`；当后端总数缺失时显示错误态或 `--`，不得用 `0` 兜底；数量型 UI 使用 `tabular-nums` 并接入浏览器门禁校验。
- **证据**：`artifacts/v13-audit/v132-seventh-round/seventh-round-aggregate.json`

### 42. 零指标与正数上下文冲突

- **当前观察**：`CompanyCockpit` 中 `项目总数 0`、`活跃项目 0` 与项目列表、`5 项预警`、健康热力分布等正数上下文同时出现。
- **影响**：用户会误判公司无项目或无活跃项目，但下方又能继续浏览项目，造成强烈认知冲突。
- **v1.3 合规解决方案**：指标卡只展示同一数据源计算出的最终值；缺数据时使用 Skeleton / ErrorState / `--`，不把未知值渲染为 `0`；所有 `0` 指标旁若存在正数明细，必须触发状态一致性测试失败。
- **证据**：`artifacts/v13-audit/v132-seventh-round/seventh-round-aggregate.json`

### 43. 加载态与已加载内容共存

- **当前观察**：`Dashboard`、`Reports-deviation` 同时出现加载态信号和已加载业务内容，例如进度图表、维度得分、风险/变更数量已经渲染，但页面仍保留加载中或未完成状态文案。
- **影响**：页面完成状态不清晰，用户不知道是否能信任当前数据，也容易把半加载内容误认为最终结果。
- **v1.3 合规解决方案**：页面级 `PageSkeleton` 与内容区互斥；局部异步区域使用局部 Skeleton，不影响其他已完成模块；所有接口完成后清理 loading 文案；失败时显示错误态 + 重试按钮 + toast，而不是保留加载文案。
- **证据**：`artifacts/v13-audit/v132-seventh-round/seventh-round-aggregate.json`

### 44. 卡片指标与列表明细局部冲突

- **当前观察**：`CompanyCockpit` 与 `PlanningBaseline` 存在卡片指标为 `0 / 暂无 / 当前没有`，但同一卡片或同一区块内又出现正数列表入口、`6 / 6` 映射、`6 项候选`、`当前视图 6 项` 等明细。
- **影响**：Metric Card、说明文案和明细列表互相否定，削弱 v1.3 对 Metric Cards “一眼可信”的要求。
- **v1.3 合规解决方案**：Metric Card、说明文案、列表表头和角标统一使用同一 selector 或 view model；Section 内数量统一从最终过滤后的 rows 派生；空态文案必须跟随当前筛选条件重新计算，不能使用页面初始化时的旧值。
- **证据**：`artifacts/v13-audit/v132-seventh-round/seventh-round-aggregate.json`

### 45. 项目上下文出现“未命名项目”

- **当前观察**：`PlanningMonthly`、`PlanningCloseout` 出现“未命名项目”，但页面又处于真实项目的计划编制/月末关账流程中。
- **影响**：项目上下文不明确，用户难以确认当前操作是否作用在正确项目上，尤其会影响基线、月计划和关账这类高风险流程。
- **v1.3 合规解决方案**：PageHeader 必须把项目名作为必填上下文；项目名未加载完成时显示 Header Skeleton；接口失败时显示“项目加载失败”错误态和重试按钮；禁止用“未命名项目”作为用户可见兜底文案。
- **证据**：`artifacts/v13-audit/v132-seventh-round/seventh-round-aggregate.json`

### 46. 主要操作入口重复过多

- **当前观察**：`CompanyCockpit` 与 `Notifications` 出现主要操作重复噪声，尤其通知页多条“删除提醒 xxx”重复按钮在同页大量出现。
- **影响**：操作区层级不清，用户难以区分主操作、行内操作和批量操作；删除类入口重复暴露也增加误操作风险。
- **v1.3 合规解决方案**：每页只保留一个清晰主 CTA；重复行内操作收敛到行尾 icon button 或 `MoreMenu`，并提供 Tooltip/aria-label；删除、移除、清空类操作必须进入统一 `ConfirmDialog`；批量删除应放入选中后出现的标准底部操作栏。
- **证据**：`artifacts/v13-audit/v132-seventh-round/seventh-round-aggregate.json`

## 第八轮追加：跨角色权限态一致性问题

以下问题来自第八轮真实页面权限态巡检，覆盖 `companyAdmin / owner / editor / viewer` 四类账号与 13 个关键路由，共 52 个页面状态。本轮重点检查只读、查看、编辑、公司级管理权限与可见按钮、禁用状态、接口响应是否一致。

### 47. 只读成员仍可见或可点击写入操作

- **当前观察**：`viewer/Gantt-list` 仍出现可点击的编辑任务、设为里程碑等操作；`viewer/PlanningBaseline` 仍出现映射待确认、强制解锁入口、版本确认类入口；`viewer/PlanningCloseout` 仍出现“重新生成清单”。
- **影响**：只读成员可能误触发写入流程，或看到自己无权完成的操作，破坏权限边界和用户预期。
- **v1.3 合规解决方案**：只读成员项目页必须统一走 `canEdit=false` 的 view model；写入类入口默认隐藏，确需展示时必须 disabled + Tooltip/aria-describedby 说明原因；所有写入 API 仍保留服务端权限校验，前端不可只依赖按钮状态；权限态纳入真实浏览器门禁。
- **证据**：`artifacts/v13-audit/v132-eighth-round/eighth-round-aggregate.json`

### 48. 查看态 / 只读态仍存在可点击破坏性入口

- **当前观察**：`PlanningBaseline` 在 `companyAdmin / owner / editor / viewer` 四类账号下都检测到页面写着只读、查看态或未持有编辑锁，但“强制解锁入口”仍可点击。
- **影响**：基线页面属于高风险流程，查看态下保留强制解锁会让用户误以为可以越过锁状态直接修改，也可能导致误操作。
- **v1.3 合规解决方案**：基线锁状态、编辑模式和破坏性操作必须由同一个权限/锁状态机控制；未持有编辑锁时隐藏强制解锁，或仅对具备管理员权限的用户展示并进入 `ConfirmDialog`；破坏性操作按钮必须有明确危险语义、二次确认、loading disabled 和失败 toast。
- **证据**：`artifacts/v13-audit/v132-eighth-round/eighth-round-aggregate.json`

### 49. 权限相关接口失败未被页面正确吸收

- **当前观察**：`PlanningBaseline` 的 `revision-pool` 在 `companyAdmin` 与 `viewer` 下返回 `403`；`viewer/PlanningMonthly` 的 `monthly-plans/.../lock` 返回 `403`。
- **影响**：页面会进入半权限、半加载或局部异常状态，用户无法区分是无权限、锁不可用、接口失败还是数据缺失。
- **v1.3 合规解决方案**：权限接口失败必须转为页面内可理解状态：无权限显示只读说明，锁不可用显示锁状态说明，服务端异常显示 ErrorState + 重试；禁止静默失败；前端统一封装 `403 -> permission denied state`，并避免继续渲染依赖该权限结果的写入按钮。
- **证据**：`artifacts/v13-audit/v132-eighth-round/eighth-round-aggregate.json`

### 50. 禁用写入按钮缺少原因说明

- **当前观察**：`Gantt-list`、`PlanningBaseline`、`PlanningCloseout`、`Drawings`、`PreMilestones`、`AcceptanceTimeline` 中存在被禁用的写入按钮，但缺少可见原因或可访问说明，例如“新建任务 / 保存草稿 / 确认项目基线 / 新建图纸包 / 新增办理事项 / 新增验收”。
- **影响**：用户无法判断按钮不可用是因为只读、缺少锁、数据未满足、流程已确认还是接口失败；键盘和读屏用户也拿不到禁用原因。
- **v1.3 合规解决方案**：所有 disabled 写入按钮必须绑定原因：视觉上使用短说明、Tooltip 或邻近状态提示；语义上使用 `aria-describedby`；原因文案优先来自统一权限/流程状态机，例如“只读成员无编辑权限”“请先进入编辑模式”“当前版本已确认”“需先选择任务”。
- **证据**：`artifacts/v13-audit/v132-eighth-round/eighth-round-aggregate.json`

## 第九轮收口：覆盖结论、修复包与验收门禁

第九轮不再新增第 51 条问题，而是对前 50 条进行收敛：确认核心页面覆盖、合并修复优先级，并定义后续修复验收门禁。

### 覆盖结论

- **编号完整性**：当前文档共 50 条问题，编号从 1 到 50 连续无缺口。
- **优先级收敛**：P0 必修 31 条，P1 体验与结构收敛 17 条，P2 规范补齐 2 条。
- **页面覆盖**：核心桌面路由已覆盖 `CompanyCockpit`、`Dashboard`、计划编制、甘特、风险、材料、报表、图纸、证照、验收、责任主体、任务总结、通知、WBS 模板与大数据量页面，未发现核心路由遗漏。
- **视口覆盖**：已覆盖 `1440x900`、`1366x768`、`1280x720` 三档桌面视口；移动端/触屏不作为 v1.3.2 本轮主验收面，若要发布移动体验需另开专项。
- **角色覆盖**：第八轮已覆盖 `companyAdmin / owner / editor / viewer` 四类账号的 13 个高风险路由；后续不建议继续泛扫，权限态应作为修复验收门禁复测。

### P0 修复包

- **P0-A 数据与接口状态机**：覆盖 1、2、3、6、7、14、15、25、40、41、42、43、44、45、49。验收要求：`loading / error / empty / content` 互斥；日期统一 `YYYY-MM-DD`；Metric、列表、角标和空态从同一 view model 派生；403/500 转为明确 PermissionState/ErrorState。
- **P0-B 权限、锁与破坏性操作安全**：覆盖 30、47、48、49、50。验收要求：viewer 无可点击写入入口；查看态/未持锁状态无可点击破坏性操作；删除、移除、强制解锁、关账、清空类操作全部进入 ConfirmDialog；disabled 写入按钮有原因说明。
- **P0-C 布局、滚动与弹层可用性**：覆盖 10、11、12、16、21、33。验收要求：固定底栏、Dialog、Drawer 不跑出三档桌面视口；树表/横道图/材料表格只有一个明确横向滚动容器；长文本 truncate + Tooltip；顶部/中部/底部无裁切遮挡。
- **P0-D 关键交互闭环**：覆盖 13、26、31、32、35。验收要求：Tab/分段控件点击 inactive 项有 active 或内容变化；Dialog/Drawer 焦点进入并可返回；报表四类入口完整；异步失败有 loading、disabled 与 toast。

### P1 / P2 收敛包

- **P1-A 页面结构与语义骨架**：覆盖 4、5、8、19、22、23、24。统一 `Breadcrumb -> PageHeader -> Metrics -> Content`，H1 使用明确业务名，`document.title` 统一为 `页面名 | WorkBuddy`，Dashboard 首屏只保留一个主视觉焦点。
- **P1-B 组件规范、可访问性与视觉 token**：覆盖 9、17、18、20、28、29、36、37、39、46。统一 Select/Popover/Menu，图表提供折叠数据表，状态枚举转中文业务文案，点击目标不低于 32px，重复行内操作收敛到 `MoreMenu` 或图标按钮。
- **P2-A 细节一致性补齐**：覆盖 38、50。普通卡片内容区不低于 `p-5`，紧凑行不伪装成卡片，禁用写入按钮在视觉和语义上都有原因说明。

### 修复验收门禁

- **G1 真实浏览器布局门禁**：核心 26 个路由在 `1440x900 / 1366x768 / 1280x720` 下无内容裁切、无 incoherent overlap、无固定栏遮挡、弹层不出视口。
- **G2 数据状态一致性门禁**：公司驾驶舱、Dashboard、基线、报表、材料、证照等页面不得出现空态与正数数据共存、加载态与已加载内容共存、当前数大于总数、0 指标与正数明细冲突。
- **G3 权限态门禁**：`companyAdmin / owner / editor / viewer` 覆盖甘特、基线、月计划、关账、材料、图纸、证照、验收；viewer 无可点击写入入口，查看态无可点击破坏性操作，403 转为权限态，disabled 写入按钮有原因。
- **G4 交互闭环门禁**：Dashboard、验收、基线、甘特、证照、报表的 inactive tab、Dialog/Drawer、破坏性操作、报表入口都必须有明确反馈和可访问状态。
- **G5 组件与 token 门禁**：核心页面无原生 select、无非推荐紫/粉/violet 色、无 card-in-card、表单有 label/aria-label、图表有数据表替代。

### 收口建议

- **停止继续新增问题清单**：当前问题面已经覆盖布局、状态、权限、交互、组件、可访问性和视觉 token；继续开放式巡检收益递减。
- **进入修复实施**：优先按 `P0-A -> P0-B -> P0-C -> P0-D` 推进，每完成一个修复包即运行对应门禁，避免修复后再次回归。
- **保留后续专项空间**：如果后续要发布移动端体验、Figma 全量同步或代码级根因治理，可另开专项，不混入 v1.3.2 问题清单。
