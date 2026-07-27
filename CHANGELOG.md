# Changelog

## v1.4.22.1 — 项目快速建模与起跑线接入 (2026-05-23)

### 新功能
- **10 分钟建项目向导**：全屏 6 步向导 (#/projects/new)，覆盖基本信息→范围维度→业态工法→工程特征→起跑线→一键生成
- **12 张业态卡片**：民用建筑/酒店/医院/学校/工业建筑/数据中心/交通枢纽/体育文化建筑/TOD上盖/改造修缮/模块化建筑 + 自定义业态
- **业态子项**：民用建筑(住宅/商办/综合体)、工业建筑(一般厂房/物流仓储/工艺洁净)、改造修缮(加固抗震/节能改造/文保修缮)
- **4 种工法**：现浇钢筋混凝土/钢框架/装配式PC/模块化MiC，按业态自动过滤
- **32 项工程特征**：3 档分组(必备/推荐/可选) + 搜索，影响模板推荐
- **起跑线接入**：9 个施工子阶段，已开工项目自动分 history/in_progress/future 三色
- **三档任务详细度**：概览级(~120行)/标准级(~400行)/精细级(~1500行)
- **公司项目模板库**：向导内/任务列表工具栏沉淀，下次新建可复用
- **自动保存**：步骤间服务端草稿持久化，公司驾驶舱"草稿(N)"角标可恢复

### 后端变更
- **对象类型收口**：从 EngineeringObjectType 移除 professional/custom/subproject，统一为 phase/section/building/floor/zone 5 类
- **推荐引擎**：projectTypeRecommendations → projectFeatureToItemPackMap → scopeAssignmentRules → projectFactsToTemplateService
- **治理算法**：wbsReconciliationService (match/add/rename_suggest/orphan 四阶段)，保留用户手工调整
- **新 API**：POST /api/projects/wizard, GET /api/milestone-presets, POST reconcile/*, CRUD /api/companies/:cid/project-templates, admin endpoints
- **Seed 扩展**：v1474SiteCapacityPressure (verticalTransportLimited/seasonWindowEmphasis/complexityLevel), v1474RegionalClimateRule (softSoilLevel/mountainTerrain/seismicIntensity)
- **状态字典**：新增 wizard_drafting 项目状态

### 前端变更
- **ProjectInfoModule**：全屏页面 (.page-shell)，Header+StepIndicator+Body+StickyFooter 四段布局
- **组件**：BusinessTypeCard, ConstructionMethodCard, FeaturePanel+FeatureChip, ScopeTreeEditor, BuildingNodeEditor, StartingLineForm, GeneratedWbsBanner, ReconcileBanner
- **入口**：CompanyCockpit "新建项目" → #/projects/new，Dashboard 接入后/全周期 toggle
- **设计系统**：0 gray-*, 0 text-[Npx], 0 rounded-3xl, 0 emoji, 全部 Lucide 图标

### 已知限制
- ScopeTreeEditor 不含 dnd-kit 拖拽 (行内操作已完成)
- 模板/Admin 管理页面 (前端) 待建 (API 已就位)
- E2E 测试待跑 (契约测试已写)
