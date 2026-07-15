# v1.4.23.1 工期统一架构消费收口与学习自治设计

**状态：** 已批准，进入实施  
**目标：** 让向导、执行计划及后续工期链路实际消费系统已有工期资产，并让低风险学习成果经过受控发布后自动进入后续计算，而不是只生成证据或候选报告。

## 1. 问题定义

v1.4.23.1 已经统一了工期架构边界，包括统一工期口径、L0-L5、T1-T3、E1-E5、输入装配、输出治理和五层依赖体系。当前缺口不是再设计一套总架构，而是既有资产、规则和学习成果没有在所有运行消费者中形成可证明的结果影响。

本专项只解决四类问题：

1. 明确每项资产是否是冷启动运行资产、稳定运行资产、候选资产、证据资产或治理资产。
2. 在统一优先级下解析实际生效版本，禁止消费者直接导入 seed 常量绕过解析。
3. 只有资产真正改变任务、工期、日期、依赖、搭接、缓冲或置信度时，才记为有效消费。
4. 把学习结果从 candidate/canary 推进到受控发布和运行消费；已确认基线受影响时自动生成修订草稿，但仍由项目经理确认生效。

## 2. 非目标与硬边界

- 不新增第二套工期架构，不新增拥有独立业务真值的“超级编排器”。
- 不引入大模型作为计划生成依赖。
- 不要求向导新增图纸、分包界面、塔吊、电梯、劳动力、报批或采购周期等必填项。
- 不把真实项目样本作为首版计划生成的前置条件；真实样本只用于后续校准和学习。
- 不自动修改 TypeScript seed 历史版本；发布新版本、切换 active、保留 superseded 和 rollback。
- 不静默替换已确认基线，不自动确认修订版。
- 本地验证不连接 production/live，不执行 guarded write，不修复或伪造凭据。
- candidate、read-only evidence、staging 和 production/live 结果必须分别表述。

## 3. 现有统一边界保持不变

运行链路继续复用：

- `inclusiveDurationDays` / `constructionCalendar` 作为日期与工期统一口径。
- L0-L4 事实与规则层，L5 横切治理层。
- T1 标准工期、T2 节奏模板、T3 项目/企业经验。
- E1 向导初始总控计划、E2 执行计划、E3 关键路径、E4 赶工方案、E5 剩余工期预测等消费者。
- `durationInputAssemblerService` 作为输入事实和候选资产装配边界。
- `durationOutputGovernanceService` 作为输出写入权限边界。
- 五层依赖体系作为关系、约束、交接、节奏和条件时滞的统一来源。
- 既有 candidate、replay、canary、publish、monitor、rollback 服务作为学习治理基础设施。

编排层只负责调用、传递解析结果和汇总回执，不拥有独立工期计算规则或业务状态。

## 4. P0：资产角色和状态

### 4.1 角色枚举

每个可解析资产必须声明一个角色：

| 角色 | 含义 | 可否直接影响运行结果 |
| --- | --- | --- |
| `system_bootstrap` | 无用户数据时维持系统可用的内置基础资产 | 可以 |
| `stable_runtime` | 已发布且处于稳定状态的系统、行业、企业或项目资产 | 可以 |
| `canary_runtime` | 仅在明确 canary 边界内生效的发布资产 | 有条件可以 |
| `candidate_advisory` | 未达到发布门槛的候选或建议 | 不可自动改变正式结果 |
| `evidence_reference` | 样本、回放、报告或外部研究 | 不可 |
| `governance_only` | 冲突、字典、审批、下线和审计记录 | 不可 |
| `retired` | 已停用历史资产 | 不可 |

### 4.2 冷启动原则

系统内置且明确声明为 `system_bootstrap` 的标准工期、T2 节奏、施工日历、工序/依赖规则和可见性策略，无需真实用户样本即可被首版计划消费。外部原始资料、冲突记录、candidate、shadow/replay 结果和 retired 版本不得因为“系统里已有”而自动进入运行。

### 4.3 历史不可变、活动版本可升级

- 历史版本内容不可原位重写。
- 学习或人工修正产生新版本。
- 新版本通过门禁后成为 active/stable，旧版本进入 superseded。
- rollback 恢复上一个稳定版本，不重写 seed 文件。

## 5. P1：有效版本解析

### 5.1 统一优先级

同一稳定键的运行值按以下顺序选择：

1. 项目明确事实或用户显式输入。
2. 项目级 stable publication / override。
3. 企业级 stable publication / override。
4. 行业或分群级 stable publication。
5. 系统级 stable publication / active seed。
6. `system_bootstrap` TypeScript seed fallback。
7. candidate/advisory 只参与建议或置信度，不覆盖前述结果。

canary 版本只有在请求携带明确 company/project/surface/traffic 边界时才可进入解析；缺少边界时继续使用 stable 版本。

### 5.2 解析结果契约

统一解析结果至少包含：

```ts
type EffectiveDurationAssetResolution<T> = {
  stableCode: string
  assetType: string
  role: 'system_bootstrap' | 'stable_runtime' | 'canary_runtime' | 'candidate_advisory' | 'evidence_reference' | 'governance_only' | 'retired'
  value: T | null
  effectiveSource: 'explicit_project_fact' | 'project_stable' | 'company_stable' | 'industry_stable' | 'system_stable' | 'system_bootstrap' | 'candidate_advisory' | 'none'
  versionId: string | null
  publicationKey: string | null
  suppressedSources: string[]
  conflictCodes: string[]
  runtimeConsumable: boolean
  rollbackTarget: string | null
}
```

现有 `algorithmSeedResolver`、runtime publication consumer 和各专项 publication service 继续负责各自数据读取；新增代码只统一结果语义和优先级，不复制其 SQL 或发布逻辑。

## 6. P2：真实消费回执

### 6.1 状态

每个消费者对每项解析资产生成以下状态之一：

- `effective_applied`：资产实际改变了可执行结果。
- `advisory_used`：资产只影响建议、排序、风险或置信度，未改变正式计划。
- `evidence_only`：只用于解释、报告、回放或审计。
- `not_applicable`：对当前业务类型、阶段或任务不适用。
- `blocked_by_conflict`：存在冲突或门禁失败，未应用。

### 6.2 有效应用判定

只有以下至少一项发生可归因变化，才允许记为 `effective_applied`：

- 任务是否生成、是否进入正式计划表或任务层级发生变化。
- P20/P50/P80、参考工期或生产率发生变化。
- 计划开始/完成日期发生变化。
- 依赖类型、前后置关系、lag、搭接比例或条件时滞发生变化。
- 缓冲、关键性或可执行置信度发生变化。

仅记录资产 ID、source、version、lineage 或把内容读入内存，不算有效消费。

### 6.3 回执结构

```ts
type DurationAssetConsumptionReceipt = {
  consumer: 'wizard_master_plan' | 'execution_plan_drilldown' | 'critical_path' | 'acceleration' | 'remaining_duration_forecast' | string
  assetType: string
  stableCode: string
  role: string
  effectiveSource: string
  versionId: string | null
  publicationKey: string | null
  status: 'effective_applied' | 'advisory_used' | 'evidence_only' | 'not_applicable' | 'blocked_by_conflict'
  changedFields: Array<'task_selection' | 'duration' | 'dates' | 'dependency' | 'overlap' | 'buffer' | 'confidence'>
  targetRowIds: string[]
  reasonCodes: string[]
  rollbackTarget: string | null
}
```

回执首先作为本次计算结果的一部分返回，并写入现有计划 metadata/审计边界；不得为了“有证据”新增生产业务事实或绕过输出治理。汇总数字必须由回执计算，不能由“尝试读取次数”计算。

## 7. P3：向导总控计划

向导总控计划是面向项目经理的粗颗粒度控制计划，目标通常为 80-200 行，允许的治理范围为 60-300 行。它应包含合同/开工/竣工里程碑、主要施工阶段、楼栋或工作面控制段、关键专业穿插、验收移交和外部接口控制项。

塔吊、施工电梯、临设、资料准备和质量控制等内容：

- 只有构成合同节点、关键界面、硬约束或关键路径控制点时进入总控计划。
- 其他内容保留为执行计划、约束、检查点、工序 metadata 或 evidence row，不为凑行数提升到总控计划。

生成顺序：项目事实和业务类型 -> 施工组织情景 -> WBS/工序选择 -> T1/T2 工期 -> 五层依赖 -> 日历排程 -> 可见性策略 -> 总控计划质量门禁 -> 消费回执。

向导预览 no-write；用户确认后沿现有事务写入 tasks 和 task_dependencies。

## 8. P4：完整执行计划

执行计划通过用户在计划管理页面对选定总控任务下钻生成，不在向导一次性展开几千行。

- 第一次下钻：`master_control -> process_detail`，通常 5-40 行，单次硬上限 80 行。
- 第二次下钻：`process_detail -> activity_step`，按明确选择展开。
- 项目累计 300-800 行是正常范围；500 行只作为单次生成/渲染批次保护，不作为项目总量熔断。
- 下钻必须复用 P1 解析、`durationInputAssemblerService`、五层依赖、日历排程和 P2 回执，不得直接导入 T2 seed 常量并均分父窗口作为正式算法。
- 父任务日期是边界约束，不是简单平均分配依据。若模板节奏与父窗口不一致，输出冲突/压缩/缓冲结果和回执，不伪装为标准节奏已应用。

工序模板承载详细作业、质量检查、资料准备、工序交接和验收条件；只有可排程实体成为 task row，其他内容进入 checklist/constraint/metadata，避免撑爆计划表。

## 9. P5：后续工期消费者

以下链路必须消费同一解析结果并输出回执：

- 关键路径和关键性判断。
- 赶工/压缩方案。
- 剩余工期预测。
- 月度计划和基线差异分析。
- 计划变更影响分析。

消费者不得各自维护另一套 seed 优先级。S 曲线或计划趋势 fallback 必须标记来源，不能把线性插值伪装成真实计划曲线。

## 10. P6：学习自治

### 10.1 风险分级

| 风险级别 | 典型学习结果 | 发布策略 |
| --- | --- | --- |
| 低 | 展示阈值、置信度、非结构性排序 | 自动 replay -> canary -> monitor -> stable；失败自动 rollback |
| 中 | 既有任务的工期、lag、搭接和生产率参数 | 自动 replay 和有边界 canary；达到样本、误差、漂移和回滚门禁后自动 stable |
| 高 | 新增/删除任务、硬依赖、合同里程碑、基线替换 | 必须一次专业审批后发布 |

### 10.2 自动闭环

学习 job 的完整顺序为：事实/结果读取 -> reward -> offline replay -> candidate -> 风险分级 -> canary publication -> shadow/limited runtime consumption -> impact monitoring -> stable publication 或 rollback -> resolver cache invalidation -> 后续消费者自动读取新版本。

机器自动生成样本量、误差、漂移、适用范围、冲突、影响面和 rollback 证据。人工只处理高风险结构变化、门禁冲突或异常，不要求逐条审核低风险学习结果。

现有学习 job 当前只到 canary registry 的部分，不得把该状态表述为“学习已自动影响运行”。实施必须桥接既有 release execution 和 runtime consumption service。

## 11. P7：已确认计划的变化承接

稳定资产发布后，对受影响项目执行自动影响扫描：

1. 找到使用旧版本的确认基线/计划。
2. 用新版本在 no-write 模式重新计算受影响范围。
3. 生成任务、工期、日期、依赖和关键路径 diff。
4. 若无实质变化，记录 `no_revision_required`。
5. 若有变化，自动将基线标记为 `pending_realign`，写入 revision pool，并创建修订草稿。
6. 自动运行完整性和可执行性校验。
7. 项目经理审阅并确认后，新修订版才成为执行基线。

系统可以自动检测、建草稿、算差异和校验；不能自动确认或静默替换已确认基线。

## 12. P8：验证和发布判定

### 12.1 本地代码门禁

- 资产角色和优先级单元测试。
- stable/canary/fallback/冲突解析测试。
- 回执必须证明输出字段实际变化；metadata-only 必须被判为 `evidence_only`。
- 11 类正式业态向导总控计划结构、行数、阶段覆盖、里程碑和依赖闭合测试。
- 住宅标准层两级下钻测试，验证 T2、五层依赖和父窗口冲突处理。
- 关键路径、赶工和剩余工期使用同一有效版本的契约测试。
- 学习 candidate -> canary -> stable/rollback -> runtime consumption 测试。
- 确认基线只生成修订草稿、不自动确认的测试。
- 前后端 TypeScript、focused Vitest 和既有回归测试。

### 12.2 运行级别必须分开

| 级别 | 可证明内容 | 不可声称内容 |
| --- | --- | --- |
| candidate/read-only | 算法、解析、回执、模拟计划和 no-write diff 可运行 | 真实 DB 已发布、真实项目已采用 |
| staging | 迁移、scheduler、事务、权限、租户隔离和回滚可运行 | production/live 结果 |
| production/live | 真实发布、真实消费、监控、回滚和项目采用结果 | 无真实凭据/环境时不得替代 |

真实 DB/凭据只用于 staging/production 的迁移、发布、scheduler、租户隔离、监控和回滚验证。真实项目样本只用于校准准确度和学习效果，不是冷启动运行资产的启用条件。

## 13. 实施顺序和验收出口

1. **P0**：资产角色、冷启动边界和版本不可变规则成为代码契约。
2. **P1**：统一有效版本解析覆盖 system/project/company/industry/canary/fallback。
3. **P2**：消费回执成为各消费者共同输出，利用率按实际变化计算。
4. **P3**：向导总控计划消费收口，去除不重要行的默认可见性。
5. **P4**：完整执行计划下钻接入统一解析、装配、依赖和日历。
6. **P5**：关键路径、赶工、预测、月度/基线等后续链路统一消费。
7. **P6**：学习 job 接通 release、runtime consumption、monitor 和 rollback。
8. **P7**：发布影响自动进入 revision draft，保留 PM 确认权。
9. **P8**：本地、staging、production/live 分级验收。

每个阶段必须有可运行代码、失败后转绿的测试和可解释回执；报告只作为这些运行结果的汇总，不作为完成替代品。
