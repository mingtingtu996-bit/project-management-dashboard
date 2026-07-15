# 工期算法全量根治 Phase -1 核查清单

日期：2026-06-12

来源方案：`C:\Users\jjj64\.claude\plans\joyful-weaving-phoenix.md`

阶段边界：本清单最初只做 Phase -1 代码事实核查与后续门禁，不修改生产代码；Phase 6 收口后已按当前代码事实补充校准口径。

口径说明：本清单中的旧行号只作为 Phase -1 历史核查证据，不作为新的实现锚点。当前收口事实以 `joyful-weaving-phoenix.md` 的执行记录、当前源码和契约测试为准。

## 1. 语义核对

| 语义 | 当前事实 | 后续门禁 |
|---|---|---|
| 计划日期跨度 | 已统一到 `server/src/utils/durationDays.ts` 与 `client/src/lib/durationDays.ts` 的 inclusive helper。 | 甘特、基线、导出、CPM、摘要等同一“计划跨度”入口只消费共享 helper 或后端真值。 |
| 施工生产日工期 | 已抽出 `server/src/services/constructionCalendar.ts`；预测、计划生成、WBS rollup、参考工期按有无日历上下文使用同一 stepper。 | 只扣显式施工停工窗口；周末、普通节假日和气候效率窗口不直接扣生产日。 |
| 新建/新增任务参考工期 | `durationSuggestionService` 继续作为主服务；`recommended_duration_days` 限定为新建/新增任务参考或显式再生成结果。 | 执行中预测不得覆盖 `recommended_duration_days`；父级包/汇总节点不得用它与子任务 rollup 竞争真值。 |
| 执行中剩余工期预测 | `server/migrations/190_add_execution_reference_days.sql` 已落地，forecast 写 `execution_reference_days`、`remaining_duration_days`、`forecast_finish_date`。 | 历史 current forecast 可读 `recommended_duration_days` fallback；新写入只走 `execution_reference_days`。 |
| 延期/偏差天数 | `delay_days` 与 `schedule_deviation_days` 已拆分；Reports 延期排行和 S 曲线计划线改读后端摘要/快照。 | 前端不得再用浏览器当前时间或当前任务日期重算业务指标。 |

### 施工生产日 seed 事实

- `server/src/seeds/v1474WorkCalendarSeed.ts:19-27` 定义了 `statutory_holiday`、`compensatory_workday`、`forecast_calendar_window`、`spring_festival_remobilization`、`winter_shutdown`、`plum_rain_window`、`hot_summer_window`、`dust_storm_window`。
- `server/src/seeds/v1474WorkCalendarSeed.ts:72-92` 证明 2026 法定假期和春节都在同一 `statutory_holiday` 类型里，不能只靠 `calendarKind` 粗暴判断。
- `server/src/seeds/v1474WorkCalendarSeed.ts:452-552` 证明梅雨/高温/沙尘为气候窗口，只能进入效率/上下文，不扣生产日。
- `server/src/seeds/v1474WorkCalendarSeed.ts:576` 的 usagePolicy 明确：周末默认生产日；调休补班保留元数据；春节视作停工窗口；气候窗口是低强度上下文。

后续实现建议：`countsAsConstructionShutdown(record)` 优先读取显式 shutdown 标记；没有标记时，至少保留当前春节停工行为，并可识别明确的 `winter_shutdown` 等施工停工窗口。若要把非春节法定假期也扣生产日，需要先补 seed 标记或明确派生规则；不能仅凭 `calendarKind='statutory_holiday'` 或 productivity 低于 1 就把窗口当作停工。

## 2. 文件锚点复验

| 文件 | 当前锚点 | 结论 |
|---|---|---|
| `server/src/services/taskDurationForecastService.ts` | Phase -1 的本地 stepper 行号已失效。 | 当前消费 `constructionCalendar.ts`，执行预测参考写入 `execution_reference_days`。 |
| `server/src/services/durationSuggestionService.ts` | Phase -1 的裸日历 helper 行号已失效。 | 当前接入共享施工日历 stepper，并在 `calculationContext.duration_calendar` 说明日历来源或无停工上下文。 |
| `server/src/services/durationSuggestionService.ts` | `resolveScaleFixedDays:1709`、`combineScopeScaleSignals:1716`、`quantityScaleExponent:1779`、环境推荐调整 `2735-2743` | 前序 scale/velocity/environment 优化已存在，后续不要回滚。 |
| `server/src/services/algorithmSeedResolver.ts` | `isDateInHolidayWindow:306`、`isCompensatoryWorkdayRecord:322`、`readCalendarProductivity:328`、`resolveV1474HolidayWindow:2729` | 当前 holiday 判断可作为参考，但 helper 仍是私有；未发现方案旧锚点 `inclusivePlanDuration:151`。 |
| `server/src/services/wbsPlanRollupService.ts` | Phase -1 旧诊断已翻转。 | 传入日历时输出 `durationBasis:'production_day'`、`calendarApplied:true`；无日历时显式保留 `calendar_day`。 |
| `server/src/services/planningBootstrap.ts` | Phase -1 裸 UTC 加天口径已接入日历上下文。 | 计划生成入口预取施工日历上下文后传入排布/rollup。 |
| `server/src/services/projectCriticalPathService.ts` | Phase -1 的 `+1` 与 no-`+1` 混用已收口。 | 任务 duration、auto chain elapsed、project duration 均走共享 inclusive 口径。 |
| `client/src/components/ProjectInfoCard.tsx` | Phase -1 确认零活跃引用。 | 已按 Phase 5 M 删除，不复活它承接工期口径。 |

## 3. 迁移库存

- 当前当时最大数字迁移号记录为 `191_add_planned_cumulative_to_snapshot.sql`；后续为消除 canonical migration 版本冲突，该文件改名为 `189_add_planned_cumulative_to_snapshot.sql`。本轮新增 `188`、`190`、`189`；原 `189` 空号已用于 planned S-curve 字段，`target_progress` 本轮只做统一入口和预留替换点，不做字段 rename。
- `server/migrations/178_drop_legacy_task_duration_fields.sql` 已删除 `tasks.reference_duration`、`tasks.ai_duration`、`tasks.ai_adjusted_duration`。
- `reference_duration` / `ai_duration` / `ai_adjusted_duration` 后续只允许在历史迁移、历史文档或禁止契约中出现；不得作为接口字段、兼容 fallback、算法 fallback 或新文档口径。
- `planned_duration` / `standard_duration` 已从普通任务写入合同移除：`dbService.createTask` 与 `server/src/middleware/validation.ts` 不再接收这两个 dormant 任务工期字段。
- `planned_duration` 仍作为经验样本、生产率学习、校准/补偿、完成总结等表的历史/统计语义存在；`standard_duration` 仍可在模板/标准工期治理链路中作为种子或模板字段存在。本轮不做破坏性 DDL 删除。

## 4. 旧字段和目标进度消费入口

| 字段 | 当前状态 | 门禁 |
|---|---|---|
| `reference_duration` / `ai_duration` / `ai_adjusted_duration` | 当前契约 `durationLegacyTaskDurationCleanup` 禁止它们出现在现行后端任务合同和算法中。 | 不复活、不 fallback、不新增兼容字段。 |
| `planned_duration` / `standard_duration` | 已从普通任务创建/校验写入口移除；仍允许作为经验样本、统计汇总、模板/标准工期治理字段存在。 | 不得回到任务写入 payload；若未来删列，需先迁完样本/治理/类型/接口四处消费。 |
| `target_progress` | 月计划、基线、计划表编辑、前后端类型、导入导出、测试中广泛使用。 | 禁止直接全库 rename；如要拆冻结目标，新增/映射 `committed_target_progress`。 |
| `recommended_duration_days` | 只作为新建/新增任务参考和显式再生成参考；执行预测不再新写该字段。 | 缓存读取中的 fallback 仅服务历史 current forecast。 |
| `execution_reference_days` | 已由迁移 `190` 落库，执行预测写入并优先读取。 | 与 `remaining_duration_days` / `forecast_finish_date` 一起表达执行中预测，不污染新建任务参考。 |

## 5. 展示入口清单

| 入口 | 当前展示/计算 | 应收口语义 |
|---|---|---|
| 向导生成计划 | 计划生成已传入 construction calendar context；有上下文时只扣明确停工窗口。 | 父级由子级排布/rollup，包级 seed 只参与布局和节奏解释。 |
| 手动新建/新增任务参考 | `durationSuggestionService` 提供叶子工序“参考工期 X 天”。 | 父级包节点只给布局参考或 rollup 解释，不把参考工期当父级计划真值。 |
| 计划表/基线导出 | 已切共享 inclusive helper。 | 父级/子级不能在同一列混不同语义。 |
| 月计划导出 | 已切共享 inclusive helper；月计划目标归“本月目标需 X 天”。 | 不与执行中剩余工期预测混用。 |
| WBS rollup | 普通汇总父级以 child plan window 为真值；传入日历时诊断为 `production_day`。 | 系统包/专项包/节拍包受边界策略保护，子任务网络 rollup 仅作诊断。 |
| CPM | 已统一 inclusive helper；失败缓存新增 staleness 状态。 | 项目总工期由后端摘要/CPM 真值输出，前端只读。 |
| 执行预测 | forecast 写 `execution_reference_days`、`remaining_duration_days`、`forecast_finish_date`。 | 不覆盖 `recommended_duration_days`。 |
| ProjectInfoCard | 已删除。 | 不复活它来承接工期口径。 |
| Dashboard | 当前不应作为项目总工期定义方。 | 消费 `projectExecutionSummaryService`。 |
| Reports | `Reports.tsx:572-576`、`:1371-1377`、`:1912-1914` 使用 `Date.now()` 本地判断延误；`reports.ts:233-236` 实时回算 planned line。 | 延误/偏差读后端指标，S 曲线 planned line 读快照。 |

## 6. 父子任务 / 包节点清单

当前代码已经出现包内窗口相关能力：

- `durationSuggestionService.ts:68-75` 定义 `aggregate_parent_duration`、`package_child_window`、`rhythm_package_window`、`system_package_window`、`specialty_package_window`、`parent_package_window` 等边界角色。
- `durationSuggestionService.ts:1040-1088` 读取父级参考工期和包内节拍窗口字段。
- `durationSuggestionService.ts:2428-2447` 使用 `resolvePackageChildRhythmWindow` 得到包内窗口。
- `wbsTemplateGenerationService.ts:5623-5632` 在排布子节点时使用 `packageChildRhythmWindow` 的 start/end day。
- `wbsTemplateGenerationService.ts:5725-5728` 将有包内窗口的任务标记 `scheduleAuthorityPolicy = 'package_child_rhythm_window'`。
- `wbsTemplateGenerationService.ts:7687-7719` 生成后已有 WBS rollup 相关出口。

收口后门禁状态：

1. 普通汇总父级：已按子任务 rollup 作为父级工期真值。
2. 系统包/专项包/节拍包：包级 seed 只作为生成布局/节奏参考；父级展示受 `durationBoundaryPolicy` 和计划窗口约束。
3. 子工序：保留“参考工期 X 天”，并与父级“计划窗口/包窗口”语义分离。
4. 标准层节拍包、专项包、普通汇总父级均已补 fixture 和契约测试，防止同一语义下输出两套值。

## 7. 项目信息输入完整性

当前输入层已经存在，但仍需在 Phase 0/1 前做更细映射：

- `projectGenerationFactsSnapshotService.ts` 可提取 building count、building pattern、floor usage 等项目生成事实。
- `durationAlgorithmInputHydrationService.ts` 会从项目 metadata 或输入读取 `projectGenerationFacts` 并合并到算法输入。
- `algorithmFactContextService.ts` 会把 project generation facts 与 runtime execution facts 按阶段加权；其中 `duration_context` 已定义权重。
- `durationSuggestionService` 已读取楼栋/楼层/区域/工程量/childTaskCount 等字段，但需要确认每个前端入口是否都把事实带齐。

后续门禁：不得在 `durationSuggestionService` 里临时猜测项目事实。缺输入时先补 hydration/DTO/接口 payload，再进入计算。

## 8. Phase -1 结论

Phase -1 的硬门禁已按方案推进并转化为长期契约：

1. inclusive helper 已建成并被服务端/客户端计划跨度入口消费。
2. 契约 fixture 已覆盖显式 shutdown、普通周末、调休补班日、标准层节拍包、专项包、普通汇总父级。
3. 施工生产日只扣显式 shutdown 谓词，不按全部 `calendarKind` 或 productivity 低于 1 直接扣天。
4. `target_progress` 未直接 rename；execution/live 与 baseline/monthly 冻结目标已通过单一解析入口分离。
5. 父子任务/包节点真值先收口，再调整前端展示文案。
6. `ProjectInfoCard` 经 import 图复核后删除。
7. 旧 AI 工期字段只保留禁止复活契约；`planned_duration` / `standard_duration` 已退出任务写入口，但仍可作为样本/治理字段继续存在。
