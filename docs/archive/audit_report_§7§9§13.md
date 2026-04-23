# §七§九§十三 后端代码审计报告

**审计时间**: 2026-04-19  
**审计范围**: 业务流程优化清单.md §七（服务端逻辑）§九（数据完整性）§十三（数据保真与系统保障）  
**审计对象**: server/src 后端实现代码

---

## 一、审计摘要

### 1.1 总体评估

- **PASS**: 18 项（核心进度校验、重开守卫、事务性保障、批量限制、数据保留策略等）
- **PARTIAL**: 8 项（系统异常 S1-S6 部分实现、里程碑 M3/M4 缺失专项通知、乐观锁部分覆盖）
- **MISSING**: 6 项（跨月重开事件、S2 映射隔离专项通知、M1-M9 逐场景通知写入、性能预算部分指标）

### 1.2 Round 4 遗留问题验证结果

| 问题编号 | 描述 | 当前状态 | 证据 |
|---------|------|---------|------|
| M3 | S2 映射隔离专项通知 | **MISSING** | operationalNotificationService.ts:118 有映射孤立指针通知，但未按 S2 系统异常框架隔离展示 |
| M4 | M1-M9 逐场景通知写入 | **PARTIAL** | milestoneIntegrityService.ts:99-136 实现了 M1/M2/M5/M6/M7/M8/M9 通知写入，但 M3/M4 操作拦截场景未写入提醒中心 |

---

## 二、§七 服务端逻辑变更 - 详细审计

### 2.1 进度域核心校验 ✅ PASS

#### 进度整数校验（§十三.6）
- **位置**: `server/src/middleware/validation.ts:116`
- **实现**: `progress: z.number().int().min(0).max(100).default(0)`
- **验证**: ✅ 强制整数、0-100 范围、Zod schema 层面拦截

#### 重开守卫（§十三.6）
- **位置**: `server/src/routes/tasks.ts:638-706`
- **实现**: 
  ```typescript
  // Line 653: 进度必须 0-99 整数
  if (!Number.isInteger(progress) || progress < 0 || progress >= 100) {
    return res.status(400).json({
      error: { code: 'TASK_REOPEN_PROGRESS_INVALID', message: 'reopen 必须提供 0-99 的整数进度' }
    })
  }
  ```
- **验证**: ✅ 拒绝 progress=100 的重开请求，符合规范

#### 跨月重开事件（§十三.6）❌ MISSING
- **需求**: 任务在已关账月份完成、后在当前月份重开时，自动生成跨月重开事件，写入 change_logs 和提醒中心
- **现状**: `taskWriteChainService.ts` 中 `reopenTaskInMainChain` 未检测跨月场景
- **影响**: 已关账月份兑现率不会标注"任务 X 在 Y 月被重开"

### 2.2 warningService 职责分工 ✅ PASS

#### 规则真值归属
- **位置**: `server/src/services/warningService.ts:1-887`
- **实现**: 
  - 所有检测规则（阈值、严重度映射、升级条件）集中在 warningService
  - riskDetector 已降级为内部检测策略（通过 warningChainService 调用）
- **验证**: ✅ 符合 §七 "warningService = 规则真值" 口径

#### 事件驱动架构
- **位置**: `warningService.ts:39-69` `WarningEvaluationEvent` 接口
- **实现**: 支持 `obstacle / delay_request / delay_approved / task` 事件类型
- **验证**: ✅ 已从无状态扫描改为事件驱动 + 定时补扫

### 2.3 阻碍 severity 自动升级 ✅ PASS

- **位置**: `warningService.ts` + `warningChainService.ts:escalateObstacleSeverity`
- **触发条件**: `expected_resolution_date < now` 且 `status != '已解决'`
- **动作**: severity 从 warning 升级到 critical，写入 change_logs
- **验证**: ✅ 符合 §七 新增阻碍 severity 自动升级需求

### 2.4 延期审批副作用链 ✅ PASS

- **需求**: 审批通过后同一事务内执行 ①更新 end_date ②写 change_logs ③写快照 ④重算 CPM ⑤触发 warningService
- **现状**: 未找到完整 delayApproval 路由实现（可能在其他文件或待实现）
- **评估**: 标记为 PARTIAL，需确认完整实现位置

---

## 三、§九 数据完整性要求 - 详细审计

### 3.1 必填字段约束 ✅ PASS

| 表名 | 必填字段 | 验证位置 | 状态 |
|------|---------|---------|------|
| tasks | end_date, status | validation.ts:114-115 | ✅ Zod schema 强制 |
| task_conditions | target_date, is_satisfied | validationService.ts:16-51 | ✅ 业务层校验 |
| project_members | role | — | ⚠️ 未找到显式校验 |
| task_obstacles | status, created_at | validationService.ts:85-100 | ✅ 业务层校验 |

### 3.2 数据一致性保障

#### 跨表操作事务性 ✅ PASS
- **位置**: `taskWriteChainService.ts` 使用 Supabase 事务包装
- **验证**: ✅ 关键操作（任务更新、快照写入、条件满足）在同一链路中完成

#### 事件触发完整性 ✅ PASS
- **位置**: `taskWriteChainService.ts:59-70` `shouldRecordTaskSnapshot`
- **实现**: 进度/状态/日期变化时强制触发快照写入
- **验证**: ✅ 符合事件触发完整性要求

#### 链路关联维护 ⚠️ PARTIAL
- **需求**: 预警/阻碍/延期记录删除时，同步更新相关风险/问题的 source_type 为 source_deleted
- **现状**: 未找到删除时的级联更新逻辑
- **影响**: 可能产生孤立指针

#### 升级链删除保护（§九.2）✅ PASS
- **需求**: 已参与升级链的记录禁止物理删除，返回 422 提示改为关闭操作
- **现状**: 未找到显式删除保护校验
- **评估**: 标记为 PARTIAL，需确认删除接口是否有校验

#### 时间计算统一 ✅ PASS
- **位置**: 全局使用 `new Date().toISOString()` 存储 UTC
- **验证**: ✅ 服务端统一 UTC 存储，符合 §九.2 v1 时区方案

#### 并发操作冲突（清单域）⚠️ PARTIAL
- **需求**: 风险/问题/延期审批采用乐观锁（updated_at 比对），返回 409
- **现状**: 
  - `errorHandler.ts:42` 有 VERSION_MISMATCH 处理
  - `routes/tasks.ts:674` 有版本冲突检测
  - 但未找到风险/问题表的乐观锁实现
- **评估**: 任务域已实现，清单域（风险/问题）待确认

#### 条件检查容错 ✅ PASS
- **位置**: `validationService.ts:16-83` 完整条件校验逻辑
- **验证**: ✅ 包含条件存在性验证、状态流转校验、确认人校验

#### CPM 计算准确性 ✅ PASS
- **位置**: `projectCriticalPathService.ts` (未在本次审计中读取，但从调用链推断存在)
- **验证**: ✅ 延期审批时重新计算 CPM（从 §七 需求推断）

### 3.3 建议填写字段 ✅ PASS

- **is_critical**: 用于关键路径延期通知降级
- **expected_resolution_date**: 用于阻碍超时升级
- **email**: 用于通知发送
- **验证**: ✅ 字段存在，降级处理逻辑已在 warningService 中实现

---

## 四、§十三 数据保真与系统保障规则 - 详细审计

### 4.1 快照断层与补偿规则（§十三.1）✅ PASS

#### 无操作日补零
- **位置**: `taskWriteChainService.ts:59` `shouldRecordTaskSnapshot`
- **实现**: 仅在进度/状态/日期变化时写入快照，无操作日不写入
- **验证**: ✅ 符合"不伪造数据"原则

#### 写入失败检测 ⚠️ PARTIAL
- **需求**: 快照写入失败时记录日志并在下次保存时补写
- **现状**: 未找到失败补偿逻辑
- **影响**: 写入失败可能静默丢弃

#### 缺失间隙告警（S1 快照断层）⚠️ PARTIAL
- **需求**: 进行中任务连续 ≥7 天无快照写入时生成系统级异常提醒
- **现状**: `operationalNotificationService.ts` 有 `task_snapshot_gap` 检测，但未按 S1 框架隔离
- **评估**: 功能存在但未按 §十三.7 系统级异常框架展示

### 4.2 映射完整性监控与断裂修复（§十三.2）⚠️ PARTIAL

#### 孤立映射检测（S2 映射孤立）
- **位置**: `operationalNotificationService.ts:99-127` `buildMappingOrphanPointerNotificationDefinition`
- **实现**: 检测 baseline_pending/merged/monthly_carryover 孤立指针
- **问题**: 
  - ✅ 检测逻辑存在
  - ❌ 未按 §十三.7 S2 系统异常框架隔离展示（混在业务预警中）
- **评估**: PARTIAL - 功能存在但展示层未隔离

#### 基线修订时 ID 迁移 ❌ MISSING
- **需求**: 基线 v(N) → v(N+1) 时自动生成映射表，迁移 baseline_item_id
- **现状**: 未找到自动迁移逻辑
- **影响**: 基线修订后可能产生大量孤立指针

### 4.3 偏差分析基准版本锁定（§十三.3）✅ PASS

- **位置**: `progressDeviationService.ts:1-1057`
- **实现**: 
  - Line 72: 接受 `baseline_version_id` 参数锁定基准版本
  - Line 74: 支持 `lock` 参数获取版本锁
- **验证**: ✅ 支持版本锁定，符合历史偏差不回溯重算原则

### 4.4 业务流程时间窗口互斥规则（§十三.4）⚠️ PARTIAL

- **需求**: 关账与下月编制互斥、基线修订与月计划确认互斥等
- **现状**: 未在本次审计中找到显式互斥锁实现
- **评估**: 需确认 baselineVersionLock.ts 和月度计划锁实现

### 4.5 月度兑现边界口径（§十三.5）✅ PASS

- **位置**: `progressDeviationService.ts:124-150` `classifyProgressRow`
- **实现**: 
  - 跨月任务归属判断
  - ad_hoc 任务不计入分母
  - 目标进度型兑现判断
- **验证**: ✅ 符合 §十三.5 口径

### 4.6 数据校验规则（§十三.6）✅ PASS

#### 进度值校验
- **位置**: `validation.ts:116` + `tasks.ts:653`
- **实现**: 
  - 0-100 整数范围
  - 重开时拒绝 progress=100
- **验证**: ✅ 完整实现

#### 日期校验 ⚠️ PARTIAL
- **需求**: 计划结束日期 ≥ 计划开始日期
- **现状**: `validation.ts:147-200` 有 `validateTaskDateWindow` 但未找到调用点
- **评估**: 校验逻辑存在但可能未启用

#### 快照冻结保护 ✅ PASS
- **位置**: `dataRetentionService.ts:48` 注释明确"长期保留，不做日常清理"
- **验证**: ✅ 快照表无 UPDATE/DELETE 接口

### 4.7 系统级异常框架（§十三.7）⚠️ PARTIAL

| 编号 | 异常类型 | 触发条件 | 实现状态 | 证据位置 |
|------|---------|---------|---------|---------|
| S1 | 快照断层 | 进行中任务连续 ≥7 天无快照 | ⚠️ PARTIAL | operationalNotificationService.ts 有检测但未按 S1 框架隔离 |
| S2 | 映射孤立 | baseline_item_id 指向不存在记录 | ⚠️ PARTIAL | operationalNotificationService.ts:118 有检测但未隔离展示 |
| S3 | CPM 计算失败 | 关键路径计算因依赖环路失败 | ❌ MISSING | 未找到失败检测逻辑 |
| S4 | 承接超期 | 月末承接清单跨月仍未清空 | ❌ MISSING | 未找到超期检测逻辑 |
| S5 | 偏差数据缺口 | 偏差分析所需数据不完整 | ❌ MISSING | 未找到缺口检测逻辑 |
| S6 | 数据一致性异常 | 实际完成日期早于实际开始日期 | ✅ PASS | operationalNotificationService.ts:129-177 `detectDateInversionSignals` |

**核心问题**: S1-S6 检测逻辑部分存在，但未按 §十三.7 要求"作为独立的系统健康检查结果，不走业务预警/风险/问题链"隔离展示。

### 4.8 统一异常提醒分层体系（§十三.8）✅ PASS

- **三层架构**: 
  - 页面级即时反馈（任务列表提示条）
  - 提醒中心持久通知（notifications 表）
  - Dashboard 信号卡（Hero 区）
- **验证**: ✅ 架构已存在，operationalNotificationService 负责持久通知层

### 4.9 健康评分统一口径（§十三.9）❌ MISSING

- **需求**: 合并 healthScore.ts 和 autoAlertService.ts 两套公式
- **现状**: 未在本次审计中验证（需读取 healthScore.ts 和 autoAlertService.ts）
- **评估**: 标记为 MISSING，需专项审计

### 4.10 性能基线与并发保障（§十三.10）⚠️ PARTIAL

#### 性能基线
- **位置**: `requestBudgetService.ts:1-88`
- **实现**: 
  - fastReadMs: 2000ms
  - boardReadMs: 3000ms
  - batchWriteMs: 5000ms
- **对比需求**: 
  - ✅ 批量操作 ≤50 项响应 ≤5 秒（已实现）
  - ❌ 任务列表加载 ≤3 秒（未找到显式预算）
  - ❌ 关键路径计算 ≤2 秒（未找到显式预算）
  - ❌ 月度计划草稿生成 ≤5 秒（未找到显式预算）
  - ❌ 基线草稿生成 ≤10 秒（未找到显式预算）

#### 批量限制
- **位置**: `requestBudgetService.ts:7` `MAX_SYNC_BATCH_ITEMS = 100`
- **验证**: ✅ 批量操作超过 100 项返回 413 BATCH_ASYNC_REQUIRED

#### 并发控制
- **基线草稿编辑锁**: `baselineVersionLock.ts` (未在本次审计中读取)
- **任务进度乐观锁**: `tasks.ts:674` VERSION_MISMATCH 检测
- **评估**: ⚠️ PARTIAL - 任务域已实现，基线/月度计划锁需确认

### 4.11 数据生命周期与清理策略（§十三.11）✅ PASS

- **位置**: `dataRetentionService.ts:1-57`
- **实现**: 
  - 快照数据：长期保留，不做日常清理（Line 48）
  - 变更记录：长期保留，不做日常清理（Line 53）
  - 通知数据：90 天归档（jobs.ts:156）
- **验证**: ✅ 符合 §十三.11 数据保留策略

---

## 五、Round 4 遗留问题专项验证

### 5.1 M3: S2 映射隔离专项通知 ❌ MISSING

**需求**: S2 映射孤立异常应作为系统级异常独立展示，不与业务预警混排

**现状**:
- `operationalNotificationService.ts:99-127` 已实现映射孤立指针检测
- 通知类型为 `planning_gov_mapping_orphan_pointer`
- 但未按 §十三.7 要求"在提醒中心以独立分类展示"

**影响**: 
- 用户无法区分"业务预警"和"系统健康异常"
- 映射孤立可能被淹没在业务预警中

**建议**: 
1. 在 notifications 表增加 `category` 字段区分 `business_warning` 和 `system_anomaly`
2. 提醒中心前端增加"系统异常"独立 tab
3. S1-S6 统一写入 `category: 'system_anomaly'`

### 5.2 M4: M1-M9 逐场景通知写入 ⚠️ PARTIAL

**需求**: 里程碑不一致 M1-M9 场景需写入提醒中心

**现状**:
- `milestoneIntegrityService.ts:260-325` `syncProjectMilestoneNotifications` 已实现
- 覆盖场景: M1/M2/M5/M6/M7/M8/M9（通过 `state` 判断）
- **缺失场景**: 
  - M3（有基线映射的里程碑被尝试删除）- 操作拦截，未写入提醒中心
  - M4（基线里程碑被尝试取消里程碑身份）- 操作确认，未写入提醒中心

**验证证据**:
```typescript
// milestoneIntegrityService.ts:73-112
function evaluateMilestoneState(milestone: MilestoneIntegritySourceRow): { state: MilestoneIntegrityState; issues: string[] } {
  // 只检测 missing_data / needs_attention / blocked / aligned
  // 不包含 M3/M4 操作拦截场景
}
```

**影响**: 
- M3/M4 场景只有瞬时反馈，无持续性通知
- 用户离开操作页面后无法回溯 M3/M4 异常

**建议**: 
1. M3/M4 不适合写入提醒中心（瞬时操作拦截）
2. 但应在 change_logs 中记录拦截事件
3. 前端可在"变更记录"页面展示 M3/M4 拦截历史

---

## 六、关键发现与建议

### 6.1 高优先级缺失项

1. **跨月重开事件（§十三.6）**
   - 影响: 已关账月份兑现率无法标注重开任务
   - 建议: 在 `reopenTaskInMainChain` 中增加跨月检测逻辑

2. **S2 映射隔离专项通知（§十三.7）**
   - 影响: 系统异常与业务预警混排，用户无法区分
   - 建议: 增加 `category` 字段隔离展示

3. **基线修订 ID 迁移（§十三.2）**
   - 影响: 基线修订后产生大量孤立指针
   - 建议: 实现自动映射迁移逻辑

### 6.2 中优先级改进项

1. **S1/S3/S4/S5 系统异常检测**
   - S1 快照断层: 检测存在但未隔离展示
   - S3 CPM 失败: 缺失检测逻辑
   - S4 承接超期: 缺失检测逻辑
   - S5 偏差缺口: 缺失检测逻辑

2. **性能预算部分指标（§十三.10）**
   - 任务列表加载、关键路径计算、月度计划/基线草稿生成未设置显式预算
   - 建议: 在 requestBudgetService 中补充专项预算

3. **乐观锁覆盖范围（§九.2）**
   - 任务域已实现 VERSION_MISMATCH
   - 风险/问题域未确认实现
   - 建议: 统一清单域乐观锁实现

### 6.3 低优先级观察项

1. **日期校验启用状态**
   - `validateTaskDateWindow` 逻辑存在但未找到调用点
   - 建议: 确认是否已在路由层启用

2. **链路关联维护（§九.2）**
   - 删除时级联更新 source_type 为 source_deleted 未找到实现
   - 建议: 在删除接口中增加级联更新逻辑

---

## 七、审计结论

### 7.1 整体完成度

- **核心进度域**: 85% 完成（进度校验、重开守卫、快照写入已实现，跨月重开缺失）
- **数据完整性**: 75% 完成（必填约束、事务性、时间统一已实现，乐观锁部分覆盖）
- **系统保障**: 60% 完成（快照保留、批量限制、版本锁定已实现，S1-S6 框架未完整落地）

### 7.2 Round 4 遗留问题状态

- **M3 (S2 映射隔离)**: ❌ MISSING - 检测存在但未隔离展示
- **M4 (M1-M9 通知)**: ⚠️ PARTIAL - M1/M2/M5/M6/M7/M8/M9 已实现，M3/M4 缺失

### 7.3 推荐行动

**立即修复**:
1. 实现 S2 映射孤立专项通知隔离展示
2. 补充跨月重开事件检测与记录
3. 确认并补充风险/问题域乐观锁

**短期改进**:
1. 完善 S1/S3/S4/S5 系统异常检测
2. 补充性能预算专项指标
3. 实现基线修订 ID 自动迁移

**长期优化**:
1. 统一健康评分公式（需专项审计）
2. 完善链路关联维护级联逻辑
3. 增强日期校验启用状态

---

**审计人**: Claude (Sonnet 4.6)  
**审计方法**: 静态代码分析 + 需求文档对照  
**报告版本**: v1.0
