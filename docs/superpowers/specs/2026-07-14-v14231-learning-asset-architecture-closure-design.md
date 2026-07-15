# v1.4.23.1 学习与校准资产架构闭合设计

**状态：** 本地代码与契约已完成；待 migration 305 定向应用、deployed staging 验收和 production/live 验收
**日期：** 2026-07-14
**适用范围：** 工期学习/校准资产、统一自动发布、原始样本消费边界、租户归属、C-19.01 登记、原子发布与回滚、漏样本补偿。

## 1. 决策

学习资产默认走自动治理链，而不是默认进入人工队列：

`样本/行为事实 -> 候选 -> 回放 -> canary -> 观察 -> stable -> 持续监控/自动回滚`

人工只处理异常：结构性变更、租户归属不明、证据冲突、异常大幅变更、近期回滚或硬门禁失败。证据数量尚未达到门槛时继续处于 `collecting/candidate`，不制造人工审核任务。

系统无真实用户数据时，内置冷启动资产继续受控消费。缺少真实业务循环只影响学习资产能否升级为更大复用范围或 stable，不阻断代码、冷启动基线和候选结果的本地验收。

## 2. 统一经验资产身份

每项学习资产必须同时声明：

- `experienceTier`: `T1 | T2 | T3`。
- `experienceAssetType`: 由 `experienceTierRegistry` 登记的稳定类型。
- `reuseScope`: `project | company | industry | global`。
- `factSource`: `actual_outcome | behavioral_change | replay | hybrid`。
- `companyId/projectId`: 与复用范围一致的租户归属。
- `sourceCandidateId/versionId/rollbackTarget`: 发布 lineage。

注册表是资产类型、允许层级、允许复用范围和允许事实来源的唯一声明出口。旧生产者可以由注册表补默认值以兼容读取，但新候选和新版本不得缺少显式身份。

## 3. 严格分层自动发布门槛

门槛集中在一个纯策略服务中。环境配置只允许提高门槛，不允许低于代码硬下限。批量修改按去重后的项目、任务和公司计数；同一批操作、同一任务重复保存、同一项目大量复制不能伪造成跨项目共识。

| 范围与阶段 | 有效独立改动 | 项目 | 公司 | 真实结果 | 回放 | 最短观察窗 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| project canary | 20 | 1 | 1 | 10 | 20 | 14 天 |
| project stable | 50 | 1 | 1 | 25 | 50 | 30 天 |
| company canary | 100 | 20 | 1 | 50 | 100 | 30 天 |
| company stable | 200 | 40 | 1 | 100 | 200 | 60 天 |
| industry canary | 300 | 75 | 5 | 150 | 300 | 60 天 |
| industry stable | 600 | 150 | 10 | 300 | 600 | 90 天 |
| global canary | 500 | 100 | 10 | 250 | 500 | 90 天 |
| global stable | 1000 | 250 | 20 | 500 | 1000 | 120 天 |

共同硬条件：

- stable 必须有 `actual_outcome` 或 `hybrid` 事实；纯行为修改只能到 candidate/canary。
- stable 必须满足 `maeAfter < maeBefore`，相等不算改善。
- 冲突率不超过 5%，过补偿率不超过 8%。
- 租户边界有效、rollback target 可用、无结构性变更、无近期回滚。
- project/company/industry/global 只能逐级扩大复用范围，不能用单项目数据直接升级全局。

## 4. 原始样本边界

原始 `duration_experience_samples` 只能通过统一 read-model 读取：

- project 范围允许读取本项目已验证、可追溯的原始样本，用于快速反馈和候选校准。
- company 范围允许读取本公司样本，但必须带公司归属、项目归属和 lineage。
- industry/global 运行消费者不得直接读取原始样本，只能消费已治理聚合资产或 runtime publication。
- L2-L4 计算引擎不直接查询样本表；它们消费版本化 runtime publication。学习治理服务可以在上述边界内读取样本并产出候选。

这取代“任何代码都不得读原始样本”的过宽旧规则，同时保留运行时计算层与样本事实层隔离。

## 5. 租户、审批与发布原子性

- 候选、版本、样本、参数和回滚操作都带 `company_id`，项目级记录还必须带 `project_id`。
- 审批/回滚服务不能只凭记录 ID 操作，必须同时匹配请求公司的租户边界。
- 前端隐藏按钮不构成权限控制；后端必须校验公司成员关系和项目归属。
- “旧 stable 失效 + 新版本激活 + lineage/事件写入”使用同一数据库事务。
- 发布失败保持旧 stable 有效；回滚真实恢复前一个 stable，而不是只把当前行标成 `rolled_back`。

## 6. 漏样本补偿

任务完成链的样本采集失败不能只写日志。失败写入可重试队列，学习 job 周期性执行：

1. 重试队列中失败项；
2. 扫描已完成但没有有效样本的任务；
3. 幂等补采，成功后关闭队列项；
4. 超过重试预算时进入可观测 dead-letter 状态，不阻塞任务完成。

该补偿属于学习治理 job，不修改通用 scheduler 的所有权；优先挂入现有 `durationContextPolicyLearningJob`。

## 7. 状态语义

- `collecting`: 数据继续积累，不要求人工。
- `candidate`: 已形成候选但未达到 canary 门槛。
- `auto_canary`: 自动进入受限流量/范围观察。
- `auto_stable`: 自动通过严格结果与观察门槛。
- `exception_review`: 只有异常条件触发人工处理。
- `blocked_retain_previous`: 硬门禁失败或回滚，旧 stable 继续有效。

本地通过只证明 `local-current-code`。staging 必须使用部署后的相同代码和迁移验证；production/live 还需要真实发布、消费、监控和回滚结果。没有用户数据时可以判定代码准备完成，但不能宣称长期准确率或生产业务收益已经闭合。

## 8. 2026-07-14 实施状态

- `local-current-code`：统一自动发布策略、四元资产身份、原始样本 read-model 边界、发布资产运行消费、租户约束、原子发布/回滚、漏样本重试与补采均已实现并有聚焦测试。
- 运行消费者：项目基线校准、PM recovery、工期建议和任务工期预测不再直接消费原始样本，只消费稳定优先、受限 canary 回退的 runtime publication；学习治理服务保留受租户约束的原始样本读取权。
- 后台补偿：复用现有 `durationContextPolicyLearningJob`，不新增通用 scheduler 所有权；队列领取使用事务锁与 lease，避免并行 worker 重复补采。
- 数据库：migration 305 已形成并进入迁移契约，但尚未在 staging 或 production 应用；migration 306 属于独立 worker 专项，不属于本闭合项。
- 环境判定：当前不得写成 deployed staging 或 production/live 已闭合；完成 305 定向应用、同 SHA 部署、真实 runtime publication 消费、监控和 rollback smoke 后，才能分别升级环境状态。
