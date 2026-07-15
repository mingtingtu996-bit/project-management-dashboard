# Public Project Shadow Calibration Design

## 背景
现有 `projectProductivityCalibrationService`、`projectProductivityCompensationService`、`projectScheduleStateService` 已经可以做高保真回放与校准，但当前没有可直接接入的真实在建项目数据源。为验证最终校准能力，需要引入 1 个房建项目和 1 个公建项目的公开影子样本，并把影子结果写入既有校准表，形成可复用的最终校准闭环。

本方案只处理公开项目影子运行，不接入真实项目现场，不回写业务事实表，不生成 published runtime overlay。

## 目标
1. 将公开公告页整理成稳定的影子项目 manifest。
2. 为每个 manifest 创建可复用的 shadow project shell。
3. 基于公开项目画像生成最小影子数据投影，驱动现有校准/补偿/状态服务。
4. 将 `shadow` / `candidate` 结果写入 `project_productivity_compensation_calibrations`。
5. 同步输出校准报告，记录覆盖度、偏差、补偿幅度和状态分布。

## 非目标
1. 不创建面向用户的公开项目管理界面。
2. 不接入真实项目库或内部项目事实表。
3. 不把公开项目结果写成 `published` runtime overlay。
4. 不做通用爬虫平台，不扩展成泛化公开项目市场库。

## 初始样本
公开源先固定为两条：
1. 房建：`锦洋花园`，来源为全国公共资源交易平台公开公告页。
2. 公建：`唐山凤栖中学项目施工总承包`，来源为全国公共资源交易平台公开公告页。

后续若增加样本，只需追加 manifest，不改核心链路。

## 方案概览
### 1. 公布项目 manifest 层
把公开公告信息整理成结构化 manifest，字段至少包括：
- `shadowKey`
- `sourceUrl`
- `projectName`
- `projectType`
- `city`
- `buildingCount`
- `floors`
- `totalArea`
- `scheduleWindow`
- `sourceCoverage`
- `assumptions`

manifest 是影子跑的唯一输入，不直接写业务事实。

### 2. Shadow project shell 层
为每个 manifest 创建或复用一个 `projects` 记录，作为 calibration 外键承载体。

建议约定：
- `project_type = 'public_shadow'`
- `project_visibility = 'private'`
- `status = 'wizard_drafting'`
- `name` 使用稳定命名，例如 `"[shadow] 锦洋花园"`
- `description` 简要记录公开来源与影子用途

这样既能满足校准表外键，也不会进入正常活跃项目路径。

### 3. 影子数据投影层
公开公告通常没有任务级日快照，因此只生成最小投影，驱动现有服务链：
- `duration_experience_samples`
- `project_daily_snapshot`
- `project_schedule_states`

投影数据只存在于 runner 的影子执行上下文中，用来计算校准结果；不写回真实项目事实表。

### 4. 复用现有服务层
影子 runner 直接复用现有逻辑：
- `buildProjectProductivityCalibration`
- `persistProjectProductivityCalibration`
- `buildProjectProductivityCompensation`
- `buildProjectScheduleState`

30 天游离窗口走 `shadow_run`，90 天游离窗口走 `candidate_only`。
公开影子通道严格禁止 `published`。

### 5. 结果与报告层
每次影子运行都输出：
- 校准表记录
- markdown 报告
- JSON 报告

报告重点看：
- `observedProductivity`
- `adjustedProductivity`
- `biasBefore / biasAfter`
- `maeBefore / maeAfter`
- `recommendedCap`
- `sourceBreakdown`
- `scheduleState` 分布
- `compensation` 是否稳定

## 数据流
1. 读取公开项目 manifest。
2. 解析或补齐公开项目画像。
3. 创建或复用 shadow project shell。
4. 生成影子投影数据。
5. 用影子投影驱动现有校准/补偿/状态计算。
6. 将结果写入 `project_productivity_compensation_calibrations`。
7. 输出影子校准报告。

## 写入规则
1. 允许写入：`projects` shadow shell、`project_productivity_compensation_calibrations`。
2. 不允许写入：真实项目的任务、计划、快照、风险、问题、提醒、警告。
3. `project_productivity_compensation_calibrations.status` 只允许 `shadow` 或 `candidate`。
4. 如果 runner 检测到已有 `published` 记录，必须中止并标记为 blocked。

## 失败与降级
1. 公开源抓取失败：保留 manifest 错误信息，降级为 `shadow`，不升 `candidate`。
2. 公开信息不足：只输出 shadow evidence，`evidence_summary` 记录 coverage gap。
3. 影子投影样本不足：保留 `candidate_only` 结论，但不做 published。
4. 校准表写入失败：中止本次样本，不影响其他项目。

## 测试策略
1. manifest 解析测试：使用固定 HTML/JSON 片段，不依赖实时联网。
2. shadow shell provisioning 测试：验证 `project_type`、`project_visibility`、`status` 和命名规则。
3. runner 测试：验证 shadow / candidate 两次运行都能落校准表，但不会生成 published。
4. 回归测试：验证真实项目路径不受公开影子 runner 影响。
5. 报告测试：验证 markdown / JSON 输出包含 source coverage、bias、cap 和状态摘要。

## 落地顺序
1. 先实现公开项目 manifest 与 shadow shell。
2. 再实现影子投影与 runner。
3. 最后接入校准表落库与报告写出。

## 验收标准
1. 房建与公建各至少完成一次 shadow calibration。
2. 两类项目都能写入校准表的 `shadow` / `candidate` 记录。
3. 没有任何真实项目事实被改写。
4. 校准报告能清晰说明公开源覆盖度与偏差方向。

## 备注
如果后续需要扩大到更多公开项目，可在 manifest 层继续追加样本，不必重构核心 runner。若将来出现大量公开样本，再考虑增加独立 registry 表；当前版本不强制新增。
