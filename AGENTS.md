# Codex 项目指引

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
- **16.x / v1.2 BI化两步走实施步骤**：`v1.2BI化两步走实施方案_20260427.md` + `v1.2BI化需求验证矩阵_20260427.md`
- **v1.3 UI/UX 商业级优化长期规范**：`UI_UX商业级全面优化方案_v1.3.md` + `UI_UX需求清单.md` + `design-system/workbuddy/MASTER.md`
- **v1.3.1 UI/UX 精细化修复计划**：`UI_UX精细化修复方案_v1.3.1.md`（仅在执行该专项时作为步骤来源）
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
   - `16.x`：`v1.2BI化两步走实施方案_20260427.md` + `v1.2BI化需求验证矩阵_20260427.md`
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

## 数据聚合规范

- 对外输出的汇总、统计、分数类指标，优先从 `projectExecutionSummaryService` 或 `project_daily_snapshot` 取值
- 路由层不要自行用 `.reduce()`、`.filter().length` 或临时循环拼出新的业务指标
- 如果确需新增聚合指标，先在后端统一出口补齐，再同步到前端消费方
- 新指标上线前，先注册到 `metricRegistry`，避免分析页和路由各自维护一份口径
- 任何历史趋势或公司级汇总都要以摘要服务和快照表作为单一真值来源

## 项目搜索与外部资料治理

- 本项目所有搜索、联网采集、公开项目数据、工程经验资料、工期定额、企业手册、下载文件、爬取页面、搜索日志和搜索治理产物统一放在 `project-search/`；不要再新增到 `artifacts/external-duration-research` 或 `scripts/research`。
- 处理搜索任务前，先读取 `project-search/skills/workbuddy-project-search/SKILL.md`；该 project skill 是本项目搜索规则入口。
- 搜索组合方式固定为：Skill 管规则；Tavily / Exa / Firecrawl 等 MCP 或插件管采集；`project-search/tools/` 本地脚本管 source/document/candidate/extraction/calibration 治理产物；外部资料不得直接自动入库生产。
- 缺少采集 MCP/插件时，先下载或安装到 `project-search/plugins/`，并在 `project-search/plugins/mcp-config/` 留配置模板；不得把 API key 写进仓库文件。
- 实际公开项目数据放入 `project-search/public-project-data/`，只允许形成 shadow / candidate 证据和报告，不能直接写真实项目任务、计划、快照、风险、问题、提醒、警告或 published runtime overlay。
- 工程经验和工期知识放入 `project-search/external-duration-research/`，必须走“来源发现 -> 来源核验/下载/哈希 -> 抽取复核 -> candidate-only -> 校准/冲突复核 -> publication-readiness -> 受控 writer”的链路；在受控 writer 前不得写 `tasks`、`task_baselines`、`monthly_plans`、`monthly_plan_items`、`task_dependencies`、`duration_experience_samples`、`actual_duration_outcomes`、`critical_path` 或生产 seed。
- 搜索产物必须记录查询、来源 URL、访问日期、本地路径、哈希（如有下载）、可信等级、抽取状态、下一步治理动作和 mutation boundary。

## 项目 UI 实施与设计资料治理

- 本项目所有 UI 实施调度、Figma/设计采集产物、UI/UX 验证证据、视觉截图、组件/页面实施索引、UI 工具库存和 UI 治理报告统一放在 `project-ui/`；不要再新增到散落的 `artifacts/uiux-*`、`artifacts/figma-design-data` 或 `client/visual-check`。
- 处理 UI 实施、页面打磨、设计系统、Figma、视觉走查、组件库、前端商业化、UI/UX 证据任务前，先读取 `project-ui/skills/workbuddy-ui-implementation/SKILL.md`；该 project skill 是本项目 UI 实施规则入口。
- UI 调度方式固定为：Skill 管规则；Figma MCP/插件与浏览器采集脚本管设计上下文和素材采集；`project-ui/tools/` 本地脚本管矩阵、source map、报告和迁移台账；`project-testing/` 负责上线级 UI 浏览器验证，不在 `project-ui/` 重建第二套测试驾驶舱。
- 组件级视觉基线使用 Storybook + Chromatic：Storybook 管隔离组件状态，Chromatic 管托管视觉 diff 与基线评审，MSW 管确定性 UI mock 数据；页面级真实流程、权限、路由、a11y、性能和上线判断仍走 `project-testing/`。
- 新增共享组件状态前，读取 `project-ui/skills/workbuddy-component-state-catalog/SKILL.md`。
- Chromatic token 只能从 `CHROMATIC_PROJECT_TOKEN` 环境变量或 CI secret 获取，不得写入仓库文件、矩阵、Skill、脚本或报告。
- `project-ui/index/source-map.json` 是 UI 相关源文件集中索引；`project-ui/index/moved-files.json` 是 UI 产物迁移台账。已被规则、脚本、测试或文档引用的权威源文件（如 `docs/plans/UI_UX*.md`、`design-system/workbuddy/**`、`scripts/verify-uiux-*.mjs`、`client/src/**`）默认先索引不物理搬迁，除非同步更新引用并留下兼容指针。
- 新增 Figma 抽取、视觉截图、a11y、overlap、performance、predeploy、release-smoke 等 UI 产物默认写入 `project-ui/artifacts/`；新 UI 调度报告写入 `project-ui/reports/`。
- UI 研究、Figma 抽取、截图、视觉审计和设计对齐产物只允许形成 candidate / report / evidence，不得直接写真实项目任务、计划、快照、风险、问题、提醒、警告、生产 seed 或 published runtime overlay。

## 长期产品与架构护栏

以下规则来自 `UI_UX商业级全面优化方案_v1.3.md` 与 `v1.2BI化两步走实施方案_20260427.md`，不是一次性执行记录。后续新增页面、组件、接口、统计卡片、报表图表、列表表格都必须默认遵守；只有用户明确指定偏离时才可例外，并在变更说明中记录原因。

### UI/UX 商业级规范

- WorkBuddy 是建筑工程项目管理 SaaS，默认视觉方向为 Swiss Modernism 2.0：专业、清晰、功能优先，避免营销页式大 hero、装饰性堆叠和炫技动画。
- 页面分两类处理：操作区（GanttView、Planning、Materials 等）优先可扫读、可操作、工具栏清晰；报表展示区（Dashboard、Reports、RiskManagement、Milestones、TaskSummary、CompanyCockpit 等）优先逻辑层级、指标轻重缓急和钻取路径。
- 新页面外层使用 `.page-shell`；页面标题、Section 标题、卡片标题、正文、辅助文字遵守 v1.3 字号层级，禁止新增 `text-[Npx]` 任意字号。
- 字体使用 Plus Jakarta Sans + Inter fallback；数字、日期、百分比使用 `tabular-nums` 和统一格式化工具，避免每个页面自写格式化。
- 色彩使用 `slate-*` 灰阶、`blue-*` 主色、`orange-*` CTA、语义红/琥珀/绿；禁止新增 `gray-*`、`neutral-*`、`zinc-*`、AI 紫/粉色系和无语义渐变。
- 圆角、阴影、间距使用设计 token：按钮/Badge `rounded-lg`，卡片 `rounded-xl`，Dialog `rounded-2xl`，阴影使用 `--el-1` 到 `--el-4`。
- 交互元素必须有 hover/focus/disabled/loading/error 状态；focus 使用 `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none`。
- Hover 禁止用 `scale` 制造布局抖动；卡片可使用 `hover:-translate-y-0.5` + elevation，按钮只允许 active/pressed 的微缩反馈。
- 图标使用 Lucide 或既有图标库，禁止用 emoji 作为 UI 图标；不新增手写 SVG，除非没有合适图标且确有必要。
- 破坏性操作必须使用统一 ConfirmDialog；用户可感知失败必须 toast；异步按钮必须有 loading/disabled 反馈。
- 表单字段必须有可访问 label，禁止 placeholder-only；错误使用 `border-red-500`、错误文本和 `role="alert"`。
- 数据表格使用共享 Table 组件，表头 sticky、斑马纹、hover、状态 dot + 文本、操作列 hover 显示；不要用原生 `<table>` 或 `div + grid` 临时模拟新表格。
- 弹窗/抽屉使用统一 Dialog/Sheet 尺寸与结构：Header -> Body -> Footer；Popover/Dropdown 必须显式设置 `align` 和 `side`。
- 新增页面必须考虑 loading、empty、error、not-found、权限/只读、移动宽度下不溢出；有项目级上下文的页面必须有 breadcrumb 和 `document.title`。

### BI 与前后端统一规范

- Dashboard、CompanyCockpit、Reports、RiskManagement 等页面的主指标、分数、汇总、趋势不能在前端重新定义口径；前端只做展示映射、筛选状态、跳转和轻量格式化。
- `projectExecutionSummaryService` 是项目级摘要唯一真值出口；`project_daily_snapshot` 是趋势和历史分析的默认事实层。
- CompanyCockpit 的公司级健康、进度、关注项目、低健康项目、逾期里程碑、排名、健康趋势应由后端聚合端点返回；不要新增前端二次聚合或独立 `/api/health-score/avg-history` 消费链。
- Reports 的趋势、维度切片、时间窗口和钻取应优先基于 `project_daily_snapshot` 与既有 `scope-dimensions`，不新造平行维度体系。
- 新增指标前先回答：业务定义是什么、粒度是什么、来源是摘要服务还是快照、是否需要注册到 `metricRegistry`、是否会影响 Dashboard/CompanyCockpit/Reports 的一致性。
- 后端路由层只编排请求和调用服务，不在 route handler 中直接 `.reduce()`、`.filter().length` 或循环拼业务口径；如确需聚合，先落到服务层统一出口。
- 前后端若都需要状态判定（完成任务、活跃风险、待满足条件、阻碍、问题、预警），优先抽公共后端工具或单一前端展示映射，避免复制多份枚举。
- 新增 BI/报表能力必须补契约测试或端到端验证：摘要来源、趋势来源、钻取链接、空数据、权限失败、快照无数据 fallback。

### 新增功能检查清单

- 是否新增了页面/卡片/表格/弹窗？先套用 v1.3 token、共享组件、loading/empty/error/focus/contrast 规则。
- 是否新增了统计数字、分数、排名、趋势或图表？先接后端摘要/快照/metricRegistry，不在前端或路由层临时计算。
- 是否新增了用户操作？失败 toast、破坏性 ConfirmDialog、loading disabled、键盘可达和可访问名称必须同步完成。
- 是否新增了报表或钻取？必须能从 Dashboard/Reports/业务页之间形成可解释路径，不停留在孤立图表。
- 是否新增了颜色、字号、阴影、圆角或自定义组件？先检查 `design-system/workbuddy/MASTER.md`，能复用 token 和现有组件就不要自造。

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
