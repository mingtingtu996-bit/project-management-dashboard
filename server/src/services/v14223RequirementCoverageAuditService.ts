import { existsSync } from 'node:fs'
import { resolve, sep } from 'node:path'

export type V14223RequirementCoverageEvidenceKind =
  | 'range_tree_boundary'
  | 'machine_execution_guard'
  | 'completion_declaration_guard'
  | 'automation_anchor_policy'
  | 'series_boundary'
  | 'current_code_baseline'
  | 'asset_inventory'
  | 'company_project_isolation'
  | 'self_learning_chain'
  | 'conflict_replay_rollback'
  | 'runtime_writer_consumer_monitoring_rollback'
  | 'old_object_handling'
  | 'ordinary_business_dto_boundary'
  | 'metric_snapshot_governance'
  | 'ci_governance_gate'
  | 'future_asset_rerun_gate'
  | 'high_risk_asset_boundary'
  | 'llm_candidate_gate'

export type V14223RequirementCoverageSection = {
  sectionId: string
  sourceHeading: string
  requiredEvidenceKinds: V14223RequirementCoverageEvidenceKind[]
  overExecutionGuardrails: string[]
}

export type V14223AcceptanceCriterion = {
  criterionId: string
  sourceExcerpt: string
  requiredEvidenceKinds: V14223RequirementCoverageEvidenceKind[]
  overExecutionGuardrails: string[]
}

export type V14223MachineExecutionGuardrail = {
  guardrailId: string
  sourceExcerpt: string
  requiredEvidenceKinds: V14223RequirementCoverageEvidenceKind[]
  forbiddenPaths: string[]
}

export type V14223HardDecisionTableSourceRow = {
  discoveryCondition: string
  allowedAction: string
  forbiddenAction: string
}

export type V14223HardDecisionTableRow = V14223HardDecisionTableSourceRow & {
  rowId: string
  requiredEvidenceKinds: V14223RequirementCoverageEvidenceKind[]
  forbiddenPaths: string[]
}

export type V14223RequirementCoverageEvidenceRecord = {
  sectionId: string
  status: 'verified' | 'incomplete'
  evidenceKinds: V14223RequirementCoverageEvidenceKind[]
  evidenceRefs: string[]
  forbiddenPathEvidenceRefs: string[]
  remainingGaps: string[]
}

export type V14223RequirementCoverageSectionResult = {
  sectionId: string
  sourceHeading: string
  status: 'verified' | 'incomplete'
  missingReasons: string[]
}

export type V14223RequirementCoverageAudit = {
  reportCode: 'v14223_requirement_coverage_audit'
  status: 'document_requirement_coverage_ready' | 'document_requirement_coverage_review_required'
  allowedClaim: 'all_document_sections_have_current_evidence_mapping' | 'not_ready_for_document_requirement_coverage_claim'
  prohibitedClaims: [
    'v14223_chapter_complete',
    'all_assets_auto_publish_ready',
    'future_assets_covered_without_rerun',
  ]
  requiredSections: V14223RequirementCoverageSection[]
  sectionResults: V14223RequirementCoverageSectionResult[]
  missingReasons: string[]
  boundaryPolicy: string[]
}

export type V14223AcceptanceCriterionEvidenceRecord = {
  criterionId: string
  status: 'verified' | 'incomplete'
  completionEvidenceLevel: 'coverage_mapping_only' | 'asset_instance_completion_evidence'
  assetInstanceCompletionEvidence?: V14223AcceptanceCriterionAssetInstanceCompletionEvidence
  evidenceKinds: V14223RequirementCoverageEvidenceKind[]
  evidenceRefs: string[]
  forbiddenPathEvidenceRefs: string[]
  remainingGaps: string[]
}

export type V14223AcceptanceCriterionAssetInstanceCompletionEvidence = {
  assetType: string
  scope: string
  writerEvidenceRefs: string[]
  consumerEvidenceRefs: string[]
  monitoringEvidenceRefs: string[]
  releaseRecordEvidenceRefs: string[]
  rollbackEvidenceRefs: string[]
  oldObjectHandlingEvidenceRefs: string[]
}

export type V14223AcceptanceCriterionResult = {
  criterionId: string
  sourceExcerpt: string
  status: 'verified' | 'incomplete'
  missingReasons: string[]
}

export type V14223AcceptanceCriteriaAudit = {
  reportCode: 'v14223_acceptance_criteria_audit'
  status: 'acceptance_criteria_coverage_ready' | 'acceptance_criteria_coverage_review_required'
  allowedClaim: 'all_acceptance_criteria_have_current_evidence_mapping' | 'not_ready_for_acceptance_criteria_claim'
  completionEvidenceLevel: 'coverage_mapping_only' | 'asset_instance_completion_evidence'
  canUseForChapterCompletionCandidate: boolean
  prohibitedClaims: [
    'v14223_chapter_complete',
    'section_14_acceptance_complete',
    'all_acceptance_items_runtime_closed',
  ]
  requiredCriteria: V14223AcceptanceCriterion[]
  criterionResults: V14223AcceptanceCriterionResult[]
  missingReasons: string[]
  boundaryPolicy: string[]
}

export type V14223MachineExecutionGuardrailEvidenceRecord = {
  guardrailId: string
  sourceExcerpt: string
  status: 'verified' | 'incomplete'
  evidenceKinds: V14223RequirementCoverageEvidenceKind[]
  evidenceRefs: string[]
  forbiddenPathEvidenceRefs: string[]
  remainingGaps: string[]
}

export type V14223MachineExecutionGuardrailResult = {
  guardrailId: string
  sourceExcerpt: string
  status: 'verified' | 'incomplete'
  missingReasons: string[]
}

export type V14223MachineExecutionGuardrailAudit = {
  reportCode: 'v14223_machine_execution_guardrail_audit'
  status: 'machine_execution_guardrail_coverage_ready' | 'machine_execution_guardrail_coverage_review_required'
  allowedClaim:
    | 'all_machine_execution_guardrails_have_current_evidence_mapping'
    | 'not_ready_for_machine_guardrail_claim'
  prohibitedClaims: [
    'v14223_chapter_complete',
    'machine_guardrails_runtime_closed',
    'all_assets_auto_publish_ready',
  ]
  requiredGuardrails: V14223MachineExecutionGuardrail[]
  guardrailResults: V14223MachineExecutionGuardrailResult[]
  missingReasons: string[]
  boundaryPolicy: string[]
}

export type V14223HardDecisionTableEvidenceRecord = V14223HardDecisionTableSourceRow & {
  rowId: string
  status: 'verified' | 'incomplete'
  evidenceKinds: V14223RequirementCoverageEvidenceKind[]
  evidenceRefs: string[]
  forbiddenActionEvidenceRefs: string[]
  remainingGaps: string[]
}

export type V14223HardDecisionTableRowResult = {
  rowId: string
  discoveryCondition: string
  allowedAction: string
  forbiddenAction: string
  status: 'verified' | 'incomplete'
  missingReasons: string[]
}

export type V14223HardDecisionTableAudit = {
  reportCode: 'v14223_hard_decision_table_audit'
  status: 'hard_decision_table_coverage_ready' | 'hard_decision_table_coverage_review_required'
  allowedClaim:
    | 'all_hard_decision_table_rows_have_current_evidence_mapping'
    | 'not_ready_for_hard_decision_table_claim'
  prohibitedClaims: [
    'v14223_chapter_complete',
    'hard_decision_rows_runtime_closed',
    'all_assets_auto_publish_ready',
  ]
  requiredRows: V14223HardDecisionTableRow[]
  rowResults: V14223HardDecisionTableRowResult[]
  missingReasons: string[]
  boundaryPolicy: string[]
}

export type V14223RequirementCoverageAuditInput = {
  currentSnapshotGatePassed: boolean
  documentHeadings?: string[]
  evidenceRecords: V14223RequirementCoverageEvidenceRecord[]
}

export type V14223CurrentRequirementCoverageAuditInput = Omit<
  V14223RequirementCoverageAuditInput,
  'evidenceRecords'
>

export type V14223AcceptanceCriteriaAuditInput = {
  currentSnapshotGatePassed: boolean
  documentAcceptanceCriteria?: string[]
  evidenceRecords: V14223AcceptanceCriterionEvidenceRecord[]
}

export type V14223AcceptanceCriterionAssetInstanceCompletionInput = {
  criterionId: string
  evidence: V14223AcceptanceCriterionAssetInstanceCompletionEvidence
  evidenceRefs?: string[]
}

export type V14223CurrentAcceptanceCriteriaAuditInput = Omit<
  V14223AcceptanceCriteriaAuditInput,
  'evidenceRecords'
> & {
  assetInstanceCompletionEvidence?: V14223AcceptanceCriterionAssetInstanceCompletionInput[]
}

export type V14223MachineExecutionGuardrailAuditInput = {
  currentSnapshotGatePassed: boolean
  documentMachineExecutionGuardrails?: string[]
  evidenceRecords: V14223MachineExecutionGuardrailEvidenceRecord[]
}

export type V14223CurrentMachineExecutionGuardrailAuditInput = Omit<
  V14223MachineExecutionGuardrailAuditInput,
  'evidenceRecords'
>

export type V14223HardDecisionTableAuditInput = {
  currentSnapshotGatePassed: boolean
  documentHardDecisionRows?: V14223HardDecisionTableSourceRow[]
  evidenceRecords: V14223HardDecisionTableEvidenceRecord[]
}

export type V14223CurrentHardDecisionTableAuditInput = Omit<
  V14223HardDecisionTableAuditInput,
  'evidenceRecords'
>

export const V14223_REQUIREMENT_COVERAGE_SECTIONS: V14223RequirementCoverageSection[] = [
  {
    sectionId: '0',
    sourceHeading: '0. 2026-06-01 final range-tree boundary (authoritative)',
    requiredEvidenceKinds: ['range_tree_boundary', 'old_object_handling'],
    overExecutionGuardrails: ['deleted_range_tree_surfaces_are_not_runtime_compatibility'],
  },
  {
    sectionId: '0.1',
    sourceHeading: '0.1 大模型执行优先级（防偏差）',
    requiredEvidenceKinds: ['machine_execution_guard', 'llm_candidate_gate'],
    overExecutionGuardrails: ['natural_language_automation_terms_do_not_grant_publish_rights'],
  },
  {
    sectionId: '0.2',
    sourceHeading: '0.2 机器执行硬判定表',
    requiredEvidenceKinds: ['machine_execution_guard', 'automation_anchor_policy'],
    overExecutionGuardrails: ['hard_decision_table_precedes_any_generated_action'],
  },
  {
    sectionId: '0.3',
    sourceHeading: '0.3 大模型执行输出模板（强制）',
    requiredEvidenceKinds: ['machine_execution_guard', 'completion_declaration_guard'],
    overExecutionGuardrails: ['output_template_fields_are_required_before_claims'],
  },
  {
    sectionId: '0.4',
    sourceHeading: '0.4 大模型执行前重判流程（强制）',
    requiredEvidenceKinds: ['machine_execution_guard', 'future_asset_rerun_gate'],
    overExecutionGuardrails: ['current_evidence_must_be_reclassified_before_execution'],
  },
  {
    sectionId: '0.5',
    sourceHeading: '0.5 完成声明与重新门禁口径（强制）',
    requiredEvidenceKinds: ['completion_declaration_guard', 'ci_governance_gate'],
    overExecutionGuardrails: ['chapter_candidate_is_not_chapter_complete'],
  },
  {
    sectionId: '0.6',
    sourceHeading: '0.6 自动化目标与强锚点裁决口径（强制）',
    requiredEvidenceKinds: ['automation_anchor_policy', 'machine_execution_guard'],
    overExecutionGuardrails: ['automation_goal_does_not_override_manual_anchor'],
  },
  {
    sectionId: '0.7',
    sourceHeading: '0.7 大模型执行偏差巡检清单（强制）',
    requiredEvidenceKinds: ['machine_execution_guard', 'completion_declaration_guard', 'old_object_handling'],
    overExecutionGuardrails: ['llm_bias_checklist_must_precede_execution'],
  },
  {
    sectionId: '1',
    sourceHeading: '1. 目标',
    requiredEvidenceKinds: ['series_boundary', 'asset_inventory'],
    overExecutionGuardrails: ['governance_scope_is_backend_or_high_privilege_only'],
  },
  {
    sectionId: '2',
    sourceHeading: '2. 与前序章节关系',
    requiredEvidenceKinds: ['series_boundary', 'current_code_baseline'],
    overExecutionGuardrails: ['v14223_does_not_cover_v1422_or_v14224_responsibilities'],
  },
  {
    sectionId: '3',
    sourceHeading: '3. 当前代码基线',
    requiredEvidenceKinds: ['current_code_baseline', 'ci_governance_gate'],
    overExecutionGuardrails: ['baseline_numbers_are_current_snapshot_evidence_not_whitelists'],
  },
  {
    sectionId: '4',
    sourceHeading: '4. 核心原则',
    requiredEvidenceKinds: ['automation_anchor_policy', 'company_project_isolation'],
    overExecutionGuardrails: ['principles_require_section_level_evidence_before_claims'],
  },
  {
    sectionId: '4.1',
    sourceHeading: '4.1 三层作用域固定',
    requiredEvidenceKinds: ['company_project_isolation', 'runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: ['logical_scope_names_are_not_physical_writer_tables'],
  },
  {
    sectionId: '4.2',
    sourceHeading: '4.2 读写优先级固定',
    requiredEvidenceKinds: ['company_project_isolation', 'runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: ['resolver_priority_requires_published_runtime_version'],
  },
  {
    sectionId: '4.3',
    sourceHeading: '4.3 资产不能越级',
    requiredEvidenceKinds: ['company_project_isolation', 'automation_anchor_policy'],
    overExecutionGuardrails: ['company_or_project_learning_cannot_rewrite_system_seed'],
  },
  {
    sectionId: '4.4',
    sourceHeading: '4.4 普通前端减负',
    requiredEvidenceKinds: ['ordinary_business_dto_boundary'],
    overExecutionGuardrails: ['business_pages_do_not_become_governance_workbench'],
  },
  {
    sectionId: '4.5',
    sourceHeading: '4.5 自动治理控制面、发布锚点与自动化成熟度',
    requiredEvidenceKinds: ['automation_anchor_policy', 'runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: ['control_plane_is_not_super_publisher'],
  },
  {
    sectionId: '4.6',
    sourceHeading: '4.6 自学习成熟度与 live 边界',
    requiredEvidenceKinds: ['self_learning_chain', 'automation_anchor_policy'],
    overExecutionGuardrails: ['self_learning_maturity_does_not_grant_publish_rights'],
  },
  {
    sectionId: '4.7',
    sourceHeading: '4.7 冷启动共享基线与公司隔离',
    requiredEvidenceKinds: ['company_project_isolation', 'self_learning_chain'],
    overExecutionGuardrails: ['shared_baseline_is_anonymous_reference_not_cross_company_training'],
  },
  {
    sectionId: '4.8',
    sourceHeading: '4.8 预测误差闭环与样本健康',
    requiredEvidenceKinds: ['self_learning_chain', 'runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: ['sample_health_and_residual_overlay_do_not_rewrite_business_facts'],
  },
  {
    sectionId: '4.9',
    sourceHeading: '4.9 高风险资产边界',
    requiredEvidenceKinds: ['high_risk_asset_boundary', 'automation_anchor_policy'],
    overExecutionGuardrails: ['high_risk_scope_is_result_impact_based_not_standard_work_duration_only'],
  },
  {
    sectionId: '4.10',
    sourceHeading: '4.10 大模型执行边界',
    requiredEvidenceKinds: ['llm_candidate_gate', 'machine_execution_guard'],
    overExecutionGuardrails: ['llm_outputs_are_candidates_not_runtime_results'],
  },
  {
    sectionId: '4.11',
    sourceHeading: '4.11 系统级晋升的验证证据来源',
    requiredEvidenceKinds: ['automation_anchor_policy', 'company_project_isolation'],
    overExecutionGuardrails: ['cross_company_validation_is_evidence_not_platform_publish_action'],
  },
  {
    sectionId: '5',
    sourceHeading: '5. 统一资产台账',
    requiredEvidenceKinds: ['asset_inventory'],
    overExecutionGuardrails: ['inventory_visibility_is_not_runtime_publication'],
  },
  {
    sectionId: '5.1',
    sourceHeading: '5.1 台账最小字段',
    requiredEvidenceKinds: ['asset_inventory', 'automation_anchor_policy'],
    overExecutionGuardrails: ['published_status_requires_unified_release_evidence'],
  },
  {
    sectionId: '5.2',
    sourceHeading: '5.2 台账要回答的问题',
    requiredEvidenceKinds: ['asset_inventory'],
    overExecutionGuardrails: ['learning_permission_is_not_publish_permission'],
  },
  {
    sectionId: '6',
    sourceHeading: '6. 公司隔离',
    requiredEvidenceKinds: ['company_project_isolation'],
    overExecutionGuardrails: ['company_isolation_must_cover_candidates_overrides_replay_and_async_results'],
  },
  {
    sectionId: '6.1',
    sourceHeading: '6.1 隔离对象',
    requiredEvidenceKinds: ['company_project_isolation'],
    overExecutionGuardrails: ['system_seed_global_ownership_is_not_runtime_consumption_proof'],
  },
  {
    sectionId: '6.2',
    sourceHeading: '6.2 隔离要求',
    requiredEvidenceKinds: ['company_project_isolation', 'runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: ['dashboard_scope_filter_is_not_full_runtime_isolation'],
  },
  {
    sectionId: '6.3',
    sourceHeading: '6.3 跨公司边界',
    requiredEvidenceKinds: ['company_project_isolation', 'automation_anchor_policy'],
    overExecutionGuardrails: ['group_consensus_requires_system_level_gate'],
  },
  {
    sectionId: '7',
    sourceHeading: '7. 自学习链路',
    requiredEvidenceKinds: ['self_learning_chain'],
    overExecutionGuardrails: ['self_learning_chain_reads_facts_as_evidence_only'],
  },
  {
    sectionId: '7.1',
    sourceHeading: '7.1 输入来源',
    requiredEvidenceKinds: ['self_learning_chain', 'ordinary_business_dto_boundary'],
    overExecutionGuardrails: ['business_fact_inputs_are_read_only_evidence'],
  },
  {
    sectionId: '7.2',
    sourceHeading: '7.2 现有自学习入口统一纳管',
    requiredEvidenceKinds: ['self_learning_chain', 'automation_anchor_policy'],
    overExecutionGuardrails: ['existing_auto_status_is_local_fact_not_unified_release'],
  },
  {
    sectionId: '7.3',
    sourceHeading: '7.3 候选分类',
    requiredEvidenceKinds: ['self_learning_chain', 'asset_inventory'],
    overExecutionGuardrails: ['candidate_classification_does_not_publish_candidate'],
  },
  {
    sectionId: '7.4',
    sourceHeading: '7.4 晋升规则',
    requiredEvidenceKinds: ['self_learning_chain', 'automation_anchor_policy'],
    overExecutionGuardrails: ['promotion_state_machine_is_not_linear_to_published'],
  },
  {
    sectionId: '8',
    sourceHeading: '8. 冲突、隔离与回滚',
    requiredEvidenceKinds: ['conflict_replay_rollback'],
    overExecutionGuardrails: ['conflict_evidence_does_not_auto_replace_current_runtime'],
  },
  {
    sectionId: '8.1',
    sourceHeading: '8.1 冲突检测',
    requiredEvidenceKinds: ['conflict_replay_rollback'],
    overExecutionGuardrails: ['company_differences_are_not_conflicts_until_cross_scope_use'],
  },
  {
    sectionId: '8.2',
    sourceHeading: '8.2 与当前已有规则的冲突仲裁',
    requiredEvidenceKinds: ['conflict_replay_rollback', 'automation_anchor_policy'],
    overExecutionGuardrails: ['current_active_rule_must_have_release_evidence_before_being_runtime_baseline'],
  },
  {
    sectionId: '8.3',
    sourceHeading: '8.3 隔离策略',
    requiredEvidenceKinds: ['conflict_replay_rollback'],
    overExecutionGuardrails: ['quarantined_assets_do_not_participate_in_runtime'],
  },
  {
    sectionId: '8.4',
    sourceHeading: '8.4 回滚策略',
    requiredEvidenceKinds: ['runtime_writer_consumer_monitoring_rollback', 'conflict_replay_rollback'],
    overExecutionGuardrails: ['rollback_target_or_event_is_not_runtime_rollback_completion'],
  },
  {
    sectionId: '9',
    sourceHeading: '9. 后端模型与接口',
    requiredEvidenceKinds: ['runtime_writer_consumer_monitoring_rollback', 'asset_inventory'],
    overExecutionGuardrails: ['model_sections_are_allowed_landings_not_current_facts_without_tests'],
  },
  {
    sectionId: '9.1',
    sourceHeading: '9.1 既有模块的扩展方向',
    requiredEvidenceKinds: ['current_code_baseline', 'asset_inventory'],
    overExecutionGuardrails: ['existing_module_names_do_not_prove_release_chain_completion'],
  },
  {
    sectionId: '9.2',
    sourceHeading: '9.2 复用 / 扩展模块目标（非平行新建）',
    requiredEvidenceKinds: ['runtime_writer_consumer_monitoring_rollback', 'ci_governance_gate'],
    overExecutionGuardrails: ['target_modules_need_code_migration_test_evidence'],
  },
  {
    sectionId: '9.3',
    sourceHeading: '9.3 数据模型建议',
    requiredEvidenceKinds: ['runtime_writer_consumer_monitoring_rollback', 'old_object_handling'],
    overExecutionGuardrails: ['tables_store_governance_evidence_not_runtime_publication_by_themselves'],
  },
  {
    sectionId: '10',
    sourceHeading: '10. 前端边界',
    requiredEvidenceKinds: ['ordinary_business_dto_boundary'],
    overExecutionGuardrails: ['governance_fields_stay_out_of_ordinary_business_pages'],
  },
  {
    sectionId: '11',
    sourceHeading: '11. 执行步骤',
    requiredEvidenceKinds: ['ci_governance_gate', 'current_code_baseline'],
    overExecutionGuardrails: ['execution_step_verbs_are_not_current_implementation_facts'],
  },
  {
    sectionId: '11.1',
    sourceHeading: '11.1 台账与作用域',
    requiredEvidenceKinds: ['asset_inventory', 'company_project_isolation'],
    overExecutionGuardrails: ['read_priority_applies_only_to_published_runtime_versions'],
  },
  {
    sectionId: '11.2',
    sourceHeading: '11.2 候选与学习',
    requiredEvidenceKinds: ['self_learning_chain', 'future_asset_rerun_gate'],
    overExecutionGuardrails: ['candidate_adapter_access_is_not_auto_publish_chain'],
  },
  {
    sectionId: '11.3',
    sourceHeading: '11.3 冲突与回放',
    requiredEvidenceKinds: ['conflict_replay_rollback'],
    overExecutionGuardrails: ['replay_results_are_publish_preconditions_not_publish_actions'],
  },
  {
    sectionId: '11.4',
    sourceHeading: '11.4 发布与回滚',
    requiredEvidenceKinds: ['runtime_writer_consumer_monitoring_rollback', 'automation_anchor_policy'],
    overExecutionGuardrails: ['release_handoff_is_not_writer_execution'],
  },
  {
    sectionId: '11.5',
    sourceHeading: '11.5 验收与门禁',
    requiredEvidenceKinds: ['ci_governance_gate', 'completion_declaration_guard'],
    overExecutionGuardrails: ['gate_passed_is_not_v14223_chapter_complete'],
  },
  {
    sectionId: '12',
    sourceHeading: '12. 旧对象处理',
    requiredEvidenceKinds: ['old_object_handling'],
    overExecutionGuardrails: ['no_production_history_does_not_skip_legacy_audit'],
  },
  {
    sectionId: '12.1',
    sourceHeading: '12.1 系统 seed 旧对象',
    requiredEvidenceKinds: ['old_object_handling', 'automation_anchor_policy'],
    overExecutionGuardrails: ['old_system_seed_status_names_are_not_current_runtime_baseline'],
  },
  {
    sectionId: '12.2',
    sourceHeading: '12.2 候选与 override 旧对象',
    requiredEvidenceKinds: ['old_object_handling', 'company_project_isolation'],
    overExecutionGuardrails: ['old_candidate_scope_must_be_redecided_before_runtime'],
  },
  {
    sectionId: '12.3',
    sourceHeading: '12.3 WBS 模板与经验工期旧对象',
    requiredEvidenceKinds: ['old_object_handling', 'high_risk_asset_boundary'],
    overExecutionGuardrails: ['legacy_template_or_duration_objects_need_readmission'],
  },
  {
    sectionId: '12.4',
    sourceHeading: '12.4 旧候选处理',
    requiredEvidenceKinds: ['old_object_handling', 'conflict_replay_rollback'],
    overExecutionGuardrails: ['historical_candidate_without_scope_stays_candidate_or_quarantine'],
  },
  {
    sectionId: '12.5',
    sourceHeading: '12.5 旧工程范围对象处理',
    requiredEvidenceKinds: ['old_object_handling', 'range_tree_boundary'],
    overExecutionGuardrails: ['deleted_scope_objects_must_not_reenter_runtime_contracts'],
  },
  {
    sectionId: '13',
    sourceHeading: '13. 覆盖范围',
    requiredEvidenceKinds: ['asset_inventory', 'future_asset_rerun_gate'],
    overExecutionGuardrails: ['coverage_means_governance_entry_not_runtime_completion'],
  },
  {
    sectionId: '14',
    sourceHeading: '14. 验收标准',
    requiredEvidenceKinds: ['completion_declaration_guard', 'ci_governance_gate'],
    overExecutionGuardrails: ['acceptance_items_need_asset_type_scope_writer_consumer_monitoring_rollback'],
  },
  {
    sectionId: '15',
    sourceHeading: '15. 不做的事',
    requiredEvidenceKinds: ['machine_execution_guard', 'automation_anchor_policy'],
    overExecutionGuardrails: ['negative_scope_items_are_blockers_not_optional_guidance'],
  },
  {
    sectionId: 'appendix_a',
    sourceHeading: '附录 A. 自动发现准入口径补充（2026-06-14）',
    requiredEvidenceKinds: ['future_asset_rerun_gate', 'asset_inventory'],
    overExecutionGuardrails: ['automatic_discovery_draft_is_not_publication_right'],
  },
  {
    sectionId: 'appendix_a.execution_policy',
    sourceHeading: '执行口径',
    requiredEvidenceKinds: ['future_asset_rerun_gate', 'asset_inventory'],
    overExecutionGuardrails: ['automatic_discovery_still_enters_governance_chain'],
  },
  {
    sectionId: 'appendix_a.company_isolation',
    sourceHeading: '与公司隔离关系',
    requiredEvidenceKinds: ['company_project_isolation', 'old_object_handling'],
    overExecutionGuardrails: ['scope_relationships_are_not_physical_table_writers'],
  },
  {
    sectionId: 'appendix_a.old_object_supplement',
    sourceHeading: '旧对象处理补充',
    requiredEvidenceKinds: ['old_object_handling'],
    overExecutionGuardrails: ['legacy_object_order_is_for_audit_not_runtime_migration'],
  },
  {
    sectionId: 'appendix_a.acceptance_supplement',
    sourceHeading: '验收补充',
    requiredEvidenceKinds: ['completion_declaration_guard', 'future_asset_rerun_gate'],
    overExecutionGuardrails: ['discovery_coverage_is_not_registration_or_runtime_consumption'],
  },
  {
    sectionId: '2026-06-20.generation_depth_policy',
    sourceHeading: '2026-06-20 `generation_depth_policy` 规则资产补充',
    requiredEvidenceKinds: ['asset_inventory', 'runtime_writer_consumer_monitoring_rollback', 'future_asset_rerun_gate'],
    overExecutionGuardrails: [
      'generation_depth_policy_is_wbs_generation_granularity_only',
      'wizard_generation_reuses_existing_duration_system_not_new_engine',
      'managed_frontier_summary_network_and_descendant_network_rollup_are_schedule_evidence_not_seed_writers',
      'generation_depth_policy_does_not_write_duration_seed_task_actual_baseline_monthly_plan_dependency_or_critical_path_fact',
      'generation_depth_policy_is_not_e1_e2_e3_e4_e5_duration_engine_or_live_learning_seed',
    ],
  },
  {
    sectionId: '2026-06-22.construction_organization_release_exit_handoff',
    sourceHeading: '2026-06-22 施工组织 plan-network release-exit handoff 补充',
    requiredEvidenceKinds: ['automation_anchor_policy', 'runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: [
      'construction_organization_release_exit_handoff_is_candidate_evidence_not_domain_writer_execution',
      'release_exit_handoff_does_not_materialize_task_dependencies_or_plan_dates',
    ],
  },
  {
    sectionId: '2026-06-22.construction_organization_release_exit_handoff_readback',
    sourceHeading: '2026-06-22 施工组织 plan-network release-exit handoff readback 补充',
    requiredEvidenceKinds: ['automation_anchor_policy', 'self_learning_chain', 'runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: [
      'release_exit_handoff_readback_is_governance_visibility_not_runtime_publication',
      'linked_handoff_counts_do_not_grant_auto_materialization',
    ],
  },
  {
    sectionId: '2026-06-22.construction_organization_runtime_engine_evidence',
    sourceHeading: '2026-06-22 施工组织 plan-network 三引擎精度证据回挂补充',
    requiredEvidenceKinds: ['self_learning_chain', 'runtime_writer_consumer_monitoring_rollback', 'completion_declaration_guard'],
    overExecutionGuardrails: [
      'e1_e3_e5_runtime_evidence_removes_precision_gap_only_not_release_exit_or_materialization_gap',
      'runtime_engine_evidence_does_not_rewrite_seed_baseline_task_fact_acceleration_draft_or_critical_path_fact',
    ],
  },
  {
    sectionId: '2026-06-22.construction_organization_business_type_policy_asset',
    sourceHeading: '2026-06-22 施工组织业态 policy 规则资产补充',
    requiredEvidenceKinds: ['asset_inventory', 'automation_anchor_policy', 'company_project_isolation'],
    overExecutionGuardrails: [
      'business_type_policy_seed_is_input_context_not_project_generated_seed_mutation',
      'single_project_generation_or_frontend_display_cannot_upgrade_policy_asset',
    ],
  },
  {
    sectionId: '2026-06-23.construction_organization_outdoor_site_candidate_governance',
    sourceHeading: '2026-06-23 施工组织室外 / 总平候选治理补充',
    requiredEvidenceKinds: ['automation_anchor_policy', 'self_learning_chain', 'future_asset_rerun_gate'],
    overExecutionGuardrails: [
      'outdoor_site_release_is_candidate_family_not_new_algorithm',
      'outdoor_site_candidate_does_not_write_dependencies_dates_baseline_seed_task_fact_acceleration_or_cpm_fact',
    ],
  },
  {
    sectionId: '2026-06-23.construction_organization_runtime_recommendation_site_decision',
    sourceHeading: '2026-06-23 施工组织 plan-network 运行推荐站点决策补充',
    requiredEvidenceKinds: ['runtime_writer_consumer_monitoring_rollback', 'completion_declaration_guard'],
    overExecutionGuardrails: [
      'site_decision_records_user_choice_only_not_runtime_apply',
      'recommendation_adopt_or_decline_does_not_replace_release_exit_consumer_monitoring_rollback_saved_outcome_or_engine_accuracy',
    ],
  },
]

export const V14223_ACCEPTANCE_CRITERIA: V14223AcceptanceCriterion[] = [
  {
    criterionId: 'acceptance_company_isolation_no_cross_read',
    sourceExcerpt: '不同公司不会读到彼此的 override 和候选；该验收必须按资产类型分别证明 runtime writer、runtime consumer、缓存、异步任务、回滚 writer 和后台摘要均按 `company_id / project_id` 隔离，不能只用 dashboard 摘要或单一 service 测试外推全域隔离。',
    requiredEvidenceKinds: ['company_project_isolation', 'runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: ['dashboard_scope_filter_is_not_full_runtime_isolation'],
  },
  {
    criterionId: 'acceptance_company_learning_does_not_write_system_seed',
    sourceExcerpt: '公司学习不会改写系统 seed；验收时必须证明候选事件、参数 publication、policy audit run、模板 projection、overlay 和 sample health 均不会写 `algorithm_seed_records / algorithm_seed_versions / algorithm_seed_overrides / standard_work_duration` 等 seed 或业务 runtime 表，除非存在对应资产类型的统一发布出口和专属 writer。',
    requiredEvidenceKinds: ['company_project_isolation', 'self_learning_chain', 'automation_anchor_policy'],
    overExecutionGuardrails: ['company_learning_cannot_rewrite_system_seed_without_release_writer'],
  },
  {
    criterionId: 'acceptance_candidate_no_direct_runtime_effect',
    sourceExcerpt: '候选资产不能直接影响运行结果；只有通过四元字段、作用域、冲突、replay、release-exit、专属 writer、消费者验证、影响面监控和 rollback target 的发布链后，才允许进入受控 runtime 消费。',
    requiredEvidenceKinds: ['automation_anchor_policy', 'runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: ['candidate_state_is_not_runtime_consumption'],
  },
  {
    criterionId: 'acceptance_existing_learning_governed_by_anchor',
    sourceExcerpt: '现有 seed / 算法 / 规则资产自带学习能力只能按登记的 `publish_anchor + automation_maturity` 生成候选、证据、回放摘要、受控发布请求或异常仲裁请求，不能绕过统一资产治理协议自由发布',
    requiredEvidenceKinds: ['self_learning_chain', 'automation_anchor_policy'],
    overExecutionGuardrails: ['existing_self_learning_logic_does_not_grant_publish_rights'],
  },
  {
    criterionId: 'acceptance_auto_publish_requires_full_release_chain',
    sourceExcerpt: '可自动发布 seed / 算法 / 规则资产只能表示“该资产实例、资产类和作用域允许进入自动发布门禁”；最终发布必须证明其属于 `trusted_source_auto_publish / guarded_runtime_auto_publish / system_curated_publish` 之一，且 `automation_maturity` 已达到对应 `auto_canary / auto_publish` 门槛，并留下来源、回放或 shadow、版本、回滚和作用域证据；`system_curated_publish` 还必须证明系统级发布策略、平台发布出口、锚点升级策略、跨项目 / 跨公司 / 多场景验证、系统 writer、平台审计记录、消费者验证、影响面监控和 rollback target 齐备；实际写入只能由统一发布出口和资产类型专属 writer 执行，并经消费者验证，不能由 seed、算法、候选 adapter 或大模型直接写入',
    requiredEvidenceKinds: ['automation_anchor_policy', 'runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: ['auto_publish_label_is_only_gate_eligibility_until_writer_consumer_rollback_exist'],
  },
  {
    criterionId: 'acceptance_auto_publish_explicit_only',
    sourceExcerpt: '“可自动发布 seed / 算法 / 规则资产”只适用于已明确声明允许自动发布的资产实例、资产类和作用域；本地 `published / auto_published / published profile` 名称、可信来源名称或样本通过，不能把当前不得自动发布的 seed / 算法 / 规则资产转换为可自动发布',
    requiredEvidenceKinds: ['automation_anchor_policy'],
    overExecutionGuardrails: ['local_published_names_do_not_convert_manual_assets_to_auto_publish'],
  },
  {
    criterionId: 'acceptance_manual_anchor_blocks_single_candidate',
    sourceExcerpt: '明确要求当前不得自动发布的 seed / 算法必须进入 `manual_governance_required` 或同等级锚点，不得被单个候选直接触发自动发布；同时必须生成 `automation_unlock_criteria` 和更多验证需求，作为后续自动化成熟度提升依据',
    requiredEvidenceKinds: ['automation_anchor_policy'],
    overExecutionGuardrails: ['single_candidate_cannot_override_manual_anchor'],
  },
  {
    criterionId: 'acceptance_anchor_upgrade_is_governance_asset',
    sourceExcerpt: '锚点升级本身必须作为治理资产验收：具备策略版本、适用资产类、证据阈值、影响面、回滚目标、审计记录和门禁测试；不得由大模型、业务算法、单个候选或单次 replay 直接修改 `publish_anchor / automation_maturity`',
    requiredEvidenceKinds: ['automation_anchor_policy', 'conflict_replay_rollback'],
    overExecutionGuardrails: ['anchor_upgrade_requires_versioned_strategy_not_llm_or_single_replay'],
  },
  {
    criterionId: 'acceptance_high_risk_assets_require_governance_package',
    sourceExcerpt: '高风险资产必须先自动生成治理包、冲突检测、replay / shadow 证据、canary 建议、停止条件和 rollback target 建议；在成熟规则、资产类型专属 writer、消费者验证和可执行回滚未明确前，不得由单个候选直接自动发布到 runtime',
    requiredEvidenceKinds: ['high_risk_asset_boundary', 'conflict_replay_rollback', 'automation_anchor_policy'],
    overExecutionGuardrails: ['high_risk_candidate_governance_package_is_not_runtime_publish'],
  },
  {
    criterionId: 'acceptance_auto_governance_not_auto_publish',
    sourceExcerpt: '自动治理通过不等于自动发布通过；验收时必须能区分 `candidate_only / auto_review_package / auto_shadow / auto_canary / auto_publish`',
    requiredEvidenceKinds: ['automation_anchor_policy'],
    overExecutionGuardrails: ['auto_governance_pass_is_not_auto_publish_pass'],
  },
  {
    criterionId: 'acceptance_learning_not_live_self_upgrade',
    sourceExcerpt: '自学习通过不等于 live 自我升级；验收时必须能区分 `frozen_constant / shadow_report_only / governed_candidate / guarded_live_tuning / system_curated_learning`',
    requiredEvidenceKinds: ['self_learning_chain'],
    overExecutionGuardrails: ['learning_maturity_does_not_grant_runtime_rights'],
  },
  {
    criterionId: 'acceptance_canary_requires_consumer_monitoring_rollback',
    sourceExcerpt: '`auto_canary / guarded_live_tuning` 验收必须证明 canary-aware 消费者、作用域 / 流量边界、停止条件、监控指标和可执行回滚同时存在；否则只能算 shadow / canary 建议，不得进入 stable runtime 消费',
    requiredEvidenceKinds: ['runtime_writer_consumer_monitoring_rollback', 'automation_anchor_policy'],
    overExecutionGuardrails: ['canary_suggestion_is_not_stable_runtime_consumption'],
  },
  {
    criterionId: 'acceptance_runtime_rollback_requires_writer_and_consumer_verification',
    sourceExcerpt: '回滚验收必须验证资产类型专属 writer 已完成撤销、降级或 disable，且对应消费者不再读取被回滚版本；只有 rollback target、rollback audit 或 rollback event 不能算真实 runtime 回滚闭环',
    requiredEvidenceKinds: ['runtime_writer_consumer_monitoring_rollback'],
    overExecutionGuardrails: ['rollback_target_or_audit_is_not_rollback_execution'],
  },
  {
    criterionId: 'acceptance_business_facts_not_silently_rewritten',
    sourceExcerpt: '业务事实本身不得被自学习链静默升级或改写；学习链只能从业务事实生成候选、证据、样本健康、参数建议、policy 更新或治理包，并继续通过本章发布门禁',
    requiredEvidenceKinds: ['self_learning_chain', 'ordinary_business_dto_boundary'],
    overExecutionGuardrails: ['business_facts_are_evidence_inputs_not_publish_results'],
  },
  {
    criterionId: 'acceptance_duration_impact_assets_four_field_registration',
    sourceExcerpt: '所有影响工期、计划网络、关键路径、模板结构、依赖顺序、风险预警和健康解释的资产都必须完成四元登记：`learning_target + learning_maturity + publish_anchor + automation_maturity`；验收不得只以 `standard_work_duration` 已收敛作为工期相关资产已闭环的证明',
    requiredEvidenceKinds: ['high_risk_asset_boundary', 'asset_inventory'],
    overExecutionGuardrails: ['duration_scope_is_result_impact_based_not_standard_work_duration_only'],
  },
  {
    criterionId: 'acceptance_future_duration_assets_auto_discovered',
    sourceExcerpt: '后续新增的工期相关资产必须被自动发现链路捕获并进入登记 / reviewItems / blockers / 候选事件 adapter 之一；不得因没有手工写入本文件清单而绕过治理，也不得静默成为 runtime 规则',
    requiredEvidenceKinds: ['future_asset_rerun_gate', 'asset_inventory'],
    overExecutionGuardrails: ['future_duration_assets_cannot_bypass_discovery_and_gate_rerun'],
  },
  {
    criterionId: 'acceptance_algorithm_parameters_registered',
    sourceExcerpt: '所有会影响算法输出的权重、阈值、乘数、blend 阶梯、置信度扣分和 canary 停止条件，都必须在可学习参数注册表或资产视图中登记；未登记参数按冻结常量处理；具体参数建议实例必须转成候选事件并通过 release-exit / domain adapter，不能由学习服务直接写 runtime',
    requiredEvidenceKinds: ['asset_inventory', 'self_learning_chain'],
    overExecutionGuardrails: ['unregistered_parameters_are_frozen_constants_not_live_tuning'],
  },
  {
    criterionId: 'acceptance_duration_learning_chains_separate',
    sourceExcerpt: 'base 工期收敛、预测误差残差 overlay、工期上下文因子学习必须分别验收；不得把 P50/P75 样本收敛扩大解释为模型结构、候选权重、乘数和置信度公式都已经自学习',
    requiredEvidenceKinds: ['self_learning_chain', 'high_risk_asset_boundary'],
    overExecutionGuardrails: ['base_duration_convergence_does_not_cover_residual_or_context_learning'],
  },
  {
    criterionId: 'acceptance_cold_start_shared_baseline_is_anonymous_readonly',
    sourceExcerpt: '小公司和低频工序的冷启动必须有匿名行业 / 分层共享基线作为只读参考；同时必须证明不会读取其他公司的 company override、项目样本明细、候选结果或回放样本',
    requiredEvidenceKinds: ['company_project_isolation', 'self_learning_chain'],
    overExecutionGuardrails: ['shared_baseline_is_readonly_anonymous_not_cross_company_training'],
  },
  {
    criterionId: 'acceptance_sample_health_observable',
    sourceExcerpt: '样本健康必须可观测：accepted / weak / rejected 数量、拒绝原因、降级原因、长尾冻结率、冷启动覆盖率和可补全建议必须进入后台治理摘要；非工期业务完成样本必须以 `benchmarkEligible=false` 和 domain metadata 区分，不能混入工期 benchmark',
    requiredEvidenceKinds: ['self_learning_chain'],
    overExecutionGuardrails: ['sample_health_is_governance_evidence_not_benchmark_permission'],
  },
  {
    criterionId: 'acceptance_llm_outputs_enter_candidate_gate',
    sourceExcerpt: '大模型生成或改写的规则、Seed、模板、参数、解释链和候选 payload 默认不得直接进入 runtime，必须先进入候选事件、隔离池或后台治理队列',
    requiredEvidenceKinds: ['llm_candidate_gate'],
    overExecutionGuardrails: ['llm_outputs_are_candidates_not_runtime_results'],
  },
  {
    criterionId: 'acceptance_publish_anchor_fields_require_governance',
    sourceExcerpt: '`publish_anchor / automation_maturity` 本身属于发布门禁资产，修改它们必须经过已登记锚点升级策略、同等级治理记录、回放证据、审计记录和回滚目标，不得由业务算法或大模型直接改写',
    requiredEvidenceKinds: ['automation_anchor_policy'],
    overExecutionGuardrails: ['publish_anchor_and_automation_maturity_cannot_self_modify'],
  },
  {
    criterionId: 'acceptance_conflict_assets_isolated_with_evidence',
    sourceExcerpt: '冲突资产能被隔离并留下证据；隔离证据只能证明未覆盖当前 runtime，不能解释为冲突已自动解决或允许替换 active / published 规则。',
    requiredEvidenceKinds: ['conflict_replay_rollback'],
    overExecutionGuardrails: ['quarantine_evidence_does_not_resolve_conflict_or_replace_runtime'],
  },
  {
    criterionId: 'acceptance_conflict_with_existing_rule_requires_release_evidence',
    sourceExcerpt: '新候选与当前已有规则冲突时，runtime 只能继续消费已证明具备统一发布出口、发布记录、消费者验证和 rollback target 的既有 active / published 规则；若既有规则只是历史状态名或本地 fallback，必须先进入 `legacy_audit / review_required`，不能被大模型当成当前正式规则，也不能被新候选静默替换',
    requiredEvidenceKinds: ['conflict_replay_rollback', 'automation_anchor_policy'],
    overExecutionGuardrails: ['existing_active_or_published_state_requires_release_evidence_before_runtime_baseline'],
  },
  {
    criterionId: 'acceptance_exception_arbitration_feedback_to_rules',
    sourceExcerpt: '人工或平台异常仲裁形成的批准、驳回、回滚等治理结论必须反哺为自动治理证据、验证规则或反例，避免同类场景长期重复人工处理；反哺结果不得直接放宽 `publish_anchor / automation_maturity`，也不得追溯发布原候选',
    requiredEvidenceKinds: ['automation_anchor_policy', 'conflict_replay_rollback'],
    overExecutionGuardrails: ['arbitration_feedback_is_evidence_not_anchor_relaxation'],
  },
  {
    criterionId: 'acceptance_system_promotion_uses_multi_scope_automatic_evidence',
    sourceExcerpt: '系统级晋升验收必须证明优先证据来源是多项目 / 多公司 / 多场景自动验证，而不是人工逐条审批；但自动验证只形成发布前置证据和门禁结论，不自动改写系统 seed。人工或平台异常仲裁只处理自动验证无法裁决的异常、边界扩大和合规安全事项',
    requiredEvidenceKinds: ['automation_anchor_policy', 'company_project_isolation'],
    overExecutionGuardrails: ['cross_scope_validation_is_not_system_seed_publication'],
  },
  {
    criterionId: 'acceptance_replay_explains_promotion_or_rejection',
    sourceExcerpt: '回放报告能说明为什么晋升或拒绝；回放通过只是发布前置证据，不能替代冲突仲裁、发布锚点、自动化成熟度、专属 writer、消费者验证、监控和 rollback target。',
    requiredEvidenceKinds: ['conflict_replay_rollback'],
    overExecutionGuardrails: ['replay_pass_is_not_publish_action'],
  },
  {
    criterionId: 'acceptance_ordinary_business_pages_hide_technical_fields',
    sourceExcerpt: '普通业务页不暴露技术字段；这不是要求本章接管普通业务页的业务口径，而是要求凡被本章纳入旧对象 / 旧字段防护验收的业务 route / API DTO / 页面组件，必须逐项列明权限边界、后台治理入口隔离和 sanitizer / contract 测试证据。当前已补 `ordinaryBusinessDtoExposureMatrixService`，以 `business_route_contract / api_dto_sanitizer / ordinary_page_component_check / admin_governance_field_boundary` 四个证据面作为 readiness gate；四个证据面必须均为 `verified`，`not_applicable`、reason 或人工说明不能替代普通业务 DTO 暴露防护证据。矩阵完整时 readiness 可移除普通业务 DTO 技术字段矩阵缺口。后台治理页或后台 evidence 字段存在不算普通业务页暴露，单一页面或单一 DTO 未暴露也不能外推为全部业务页完成；未列证据的业务 DTO 或页面只能写成 `review_required / blocker`。',
    requiredEvidenceKinds: ['ordinary_business_dto_boundary'],
    overExecutionGuardrails: ['admin_governance_fields_must_not_leak_to_ordinary_business_pages'],
  },
  {
    criterionId: 'acceptance_governance_metrics_registered',
    sourceExcerpt: '所有新增治理指标在验收时都必须证明已注册到统一指标口径；未注册指标只能作为治理缺口或 reviewItems，不得被 dashboard、路由或大模型临时聚合后用于验收结论。`metric_source_coverage` ready 只说明当前必覆指标口径源已被 readiness evidence 引用；`metric_production_snapshot_publication_rollback_matrix` ready 只说明当前列明的 producer / snapshot / dashboard consumer / publication record / rollback path 五个证据面均已 `verified`，`not_applicable` 不能替代指标生产 / 快照 / 发布 / 回滚证据；`metric_consumer_path_coverage_matrix` ready 只说明当前六条指标消费路径已列明 `verified` 证据，不说明未来新增指标、所有报表路径、所有 analytics 路由、所有前端图表、所有快照字段或所有指标消费方已经自动闭环。',
    requiredEvidenceKinds: ['metric_snapshot_governance'],
    overExecutionGuardrails: ['metric_readiness_matrices_are_not_future_metric_publication_whitelists'],
  },
  {
    criterionId: 'acceptance_discovery_review_items_and_blockers_clear_for_phase',
    sourceExcerpt: '自动发现阶段允许可分类未确认项进入 `reviewItems`；阶段 1-3 登记完成验收时，`algorithmRuleAssetInventoryService` diagnostics 与自动发现报告不得仍存在重复资产 key、未登记 algorithm seed 类型、缺治理能力的 algorithm seed、未登记的当前扫描项，或作用域 / 消费者 / 运行影响不可分类的 blockers',
    requiredEvidenceKinds: ['asset_inventory', 'future_asset_rerun_gate'],
    overExecutionGuardrails: ['review_items_and_blockers_must_not_be_treated_as_runtime_ready'],
  },
  {
    criterionId: 'acceptance_review_items_zero_is_snapshot_only',
    sourceExcerpt: '`reviewItems=0 / blockers=0` 只作为当前代码快照的准入健康证据；后续新增代码、旧对象重扫、专项 adapter 接入、LLM 生成候选或迁移回放结果出现时，必须重新运行自动发现并重新判定，不能沿用旧快照放行',
    requiredEvidenceKinds: ['future_asset_rerun_gate', 'ci_governance_gate'],
    overExecutionGuardrails: ['zero_review_items_is_not_future_asset_release_permission'],
  },
  {
    criterionId: 'acceptance_future_asset_rerun_matrix_ready_is_snapshot_only',
    sourceExcerpt: '`future_asset_rediscovery_gate_rerun_matrix=ready` 只说明本轮当前快照已具备发现、台账、准入、旧对象、LLM 候选和治理门禁重跑的 `verified` 证据；`not_applicable`、人工说明或“本轮无新增”不能替代当前快照重跑。新增资产、变更 asset key、变更 runtime surface、旧对象重扫或 LLM 生成候选出现时，必须重新构建矩阵，缺任一 surface 证据时回到 `review_required / blocker / historical_evidence_needs_refresh`',
    requiredEvidenceKinds: ['future_asset_rerun_gate'],
    overExecutionGuardrails: ['future_asset_matrix_ready_is_current_snapshot_only'],
  },
  {
    criterionId: 'acceptance_readonly_inventory_routes_are_evidence_layer_only',
    sourceExcerpt: '资产只读台账、准入门禁和相关路由测试通过只能作为证据层验收项；治理动作仍按公司管理员和公司空间校验执行，且不能据此推断专项 writer、runtime consumer、监控、发布记录或 rollback writer 已闭合',
    requiredEvidenceKinds: ['asset_inventory', 'company_project_isolation'],
    overExecutionGuardrails: ['readonly_routes_do_not_prove_runtime_writer_consumer_monitoring_rollback'],
  },
  {
    criterionId: 'acceptance_legacy_scope_fields_blocked',
    sourceExcerpt: '新增候选、override、导入、replay payload 和普通业务 read DTO 均不得重新引入 `zone_object_id / professional_object_id / scope_dimensions / project_scope_dimensions` 等旧对象字段；当前候选事件持久化已在写入 `algorithm_asset_candidate_events.candidate_payload` 前剥离这些字段并把剥离清单写入 evidence summary，replay 持久化因复用候选事件插入链路也必须走同一防线。当前 seed import 已在 `algorithm_seed_records.rule_payload` 写入前剥离旧范围字段，seed candidate 与 seed override create/update 已在 `candidate_payload / override_payload` 写入前剥离旧范围字段；普通任务 read DTO 已由 `taskDtoService` 剥离 `zone_object_id / professional_object_id / scope_dimensions / project_scope_dimensions / legacy_object_type`，同时保留合法 `physical_zone_object_id`；普通业务 DTO 暴露矩阵已由 `ordinaryBusinessDtoExposureMatrixService` 汇总 route contract、API DTO sanitizer、普通页面组件检查和后台治理字段边界 `verified` 证据；模板写入口旧字段剥离矩阵已由 `templateWriteSurfaceLegacyScopeSanitizerMatrixService` 汇总 create / update / clone / JSON import / completed-project draft / frontend preview DTO 六个 `verified` 证据面，完整时 readiness 可移除模板写入口旧字段缺口；`not_applicable` 不能替代任一当前必覆写入口证据。前端 `generateWbsTemplatePreview` DTO 已有 contract 测试证明请求前递归剥离旧范围字段，WBS create / update / clone / JSON import / completed-project draft 写入口已有码级 sanitizer 与 route 测试证明写入 `wbs_templates.wbs_nodes` 或 Supabase payload 前递归剥离旧范围字段。该结论只覆盖已列明入口和矩阵证据面；其他模板写入入口、普通业务 DTO、页面组件或后台治理入口若没有同等 sanitizer / contract 测试证据，验收结论仍只能写为待补入口或 blocker，不得借任一入口证据外推为全入口完成。',
    requiredEvidenceKinds: ['old_object_handling', 'range_tree_boundary', 'ordinary_business_dto_boundary'],
    overExecutionGuardrails: ['one_sanitized_entrypoint_does_not_prove_all_legacy_scope_surfaces_blocked'],
  },
]

const V14223_REQUIREMENT_COVERAGE_DEFAULT_EVIDENCE_REFS_BY_KIND = {
  range_tree_boundary: [
    'server/src/services/legacyScopeObjectSanitizer.ts',
    'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts',
    'server/src/__tests__/wbsTemplateImportLegacyScopeSanitizer.test.ts',
  ],
  machine_execution_guard: [
    'server/src/services/v14223CompletionAuditService.ts',
    'server/src/__tests__/v14223GovernanceCiGateContract.test.ts',
  ],
  completion_declaration_guard: [
    'server/src/services/v14223CompletionAuditService.ts',
    'server/src/__tests__/v14223CompletionAuditService.test.ts',
  ],
  automation_anchor_policy: [
    'server/src/services/algorithmAssetGovernanceProtocolService.ts',
    'server/src/services/algorithmAssetAnchorUpgradeStrategyService.ts',
    'server/src/services/algorithmAssetAutomationMaturityService.ts',
    'server/src/services/policyOpsAutoPublishGateService.ts',
  ],
  series_boundary: [
    'docs/plans/v1.4.22.3规则资产公司隔离与自学习体系执行方案.md',
    'server/src/__tests__/v14223GovernanceCiGateContract.test.ts',
  ],
  current_code_baseline: [
    'scripts/check-v14223-governance-gate.mjs',
    'server/src/__tests__/v14223GovernanceCiGateContract.test.ts',
  ],
  asset_inventory: [
    'server/src/services/algorithmRuleAssetInventoryService.ts',
    'server/src/services/v14AssetDiscoveryService.ts',
    'server/src/services/v14AssetAdmissionAutomationService.ts',
    'server/src/services/projectGenerationFactsConsumerRegistry.ts',
    'server/src/services/projectGenerationFactsStoreService.ts',
    'server/src/services/projectFactsToTemplateService.ts',
    'server/src/services/projectTypeRecommendations.ts',
    'server/src/services/projectFeatureToItemPackMap.ts',
    'server/src/services/scopeAssignmentRulesService.ts',
    'server/src/services/executionGateSeedService.ts',
    'server/src/services/taskConstraintGovernanceService.ts',
    'server/src/services/projectScheduleStateService.ts',
    'server/src/services/weatherForecastImpactService.ts',
    'server/src/services/buildingPatternScheduleBenchmarkEvidenceService.ts',
    'server/src/services/dataQualityRuleRegistry.ts',
    'server/src/services/taskStatusDerivationService.ts',
    'server/src/services/notificationTouchpointRules.ts',
    'server/src/services/deletionRetentionGovernanceService.ts',
    'server/src/services/certificateTemplatePolicyUpdateService.ts',
    'server/src/services/acceptanceTemplatePolicyUpdateService.ts',
    'server/src/seeds/wbsGenerationDepthPolicySeed.ts',
    'server/src/__tests__/algorithmRuleAssetInventoryService.test.ts',
    'server/src/__tests__/v14AssetAdmissionAutomationService.test.ts',
    'server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts',
    'server/src/__tests__/wizardGenerationSideEffects.test.ts',
    'server/src/__tests__/projectGenerationFactsConsumerRegistry.test.ts',
    'server/src/__tests__/projectFactsToTemplateScheduleTrust.test.ts',
  ],
  company_project_isolation: [
    'server/src/services/algorithmAssetIsolationMatrixService.ts',
    'server/src/auth/companyContext.ts',
    'server/src/__tests__/algorithmAssetIsolationMatrixService.test.ts',
    'server/src/__tests__/workspaceIsolationMatrix.test.ts',
  ],
  self_learning_chain: [
    'server/src/services/algorithmSeedLearningService.ts',
    'server/src/services/durationLiveLearningCompletionAuditService.ts',
    'server/src/services/durationContextPolicyLearningService.ts',
    'server/src/services/algorithmAssetLearnableParameterRegistryService.ts',
    'server/src/services/wbsTemplateCandidateEventService.ts',
    'server/src/services/constructionDependencyReplayCalibrationService.ts',
    'server/src/__tests__/algorithmSeedGovernanceFlow.test.ts',
    'server/src/__tests__/durationLiveLearningCompletionAuditService.test.ts',
    'server/src/__tests__/wbsTemplateCandidateEventService.test.ts',
    'server/src/__tests__/constructionDependencyReplayCalibrationService.test.ts',
  ],
  conflict_replay_rollback: [
    'server/src/services/algorithmAssetConflictService.ts',
    'server/src/services/algorithmAssetReplayService.ts',
    'server/src/services/algorithmAssetPromotionRollbackGateService.ts',
    'server/src/__tests__/algorithmAssetConflictService.test.ts',
  ],
  runtime_writer_consumer_monitoring_rollback: [
    'server/src/services/domainReleaseRuntimeClosureMatrixService.ts',
    'server/src/services/metricProductionSnapshotPublicationRollbackMatrixService.ts',
    'server/src/services/policyTemplateReleaseExecutionService.ts',
    'server/src/services/criticalPathRulePublicationReadinessService.ts',
    'server/src/services/wbsTemplateCandidateEventService.ts',
    'server/src/services/constructionDependencyReplayCalibrationService.ts',
    'server/src/services/wbsTemplateGenerationService.ts',
    'server/src/__tests__/domainReleaseRuntimeClosureMatrixService.test.ts',
    'server/src/__tests__/criticalPathRulePublicationReadinessService.test.ts',
    'server/src/__tests__/wbsTemplateManagedFrontierGeneration.test.ts',
    'server/src/__tests__/wbsTemplateCandidateEventService.test.ts',
    'server/src/__tests__/constructionDependencyReplayCalibrationService.test.ts',
  ],
  old_object_handling: [
    'server/src/services/deletionRetentionGovernanceService.ts',
    'server/src/services/legacyScopeObjectSanitizer.ts',
    'server/src/services/templateWriteSurfaceLegacyScopeSanitizerMatrixService.ts',
    'server/src/__tests__/deletionRetentionGovernanceService.test.ts',
    'server/src/__tests__/deletionRetentionAntiBypass.test.ts',
    'server/src/__tests__/templateWriteSurfaceLegacyScopeSanitizerMatrixService.test.ts',
  ],
  ordinary_business_dto_boundary: [
    'server/src/services/ordinaryBusinessDtoExposureMatrixService.ts',
    'server/src/services/taskDtoService.ts',
    'server/src/__tests__/ordinaryBusinessDtoExposureMatrixService.test.ts',
    'server/src/__tests__/taskDtoService.test.ts',
  ],
  metric_snapshot_governance: [
    'server/src/services/metricRegistryService.ts',
    'server/src/services/metricRuntimePublicationService.ts',
    'server/src/services/metricConsumerPathCoverageMatrixService.ts',
    'server/src/__tests__/metricConsumerPathCoverageMatrixService.test.ts',
  ],
  ci_governance_gate: [
    'scripts/check-v14223-governance-gate.mjs',
    'server/src/__tests__/v14223GovernanceCiGateContract.test.ts',
  ],
  future_asset_rerun_gate: [
    'server/src/services/futureAssetRediscoveryGateRerunMatrixService.ts',
    'server/src/__tests__/futureAssetRediscoveryGateRerunMatrixService.test.ts',
    'scripts/check-v14223-governance-gate.mjs',
  ],
  high_risk_asset_boundary: [
    'server/src/services/durationAlgorithmClosureGovernanceService.ts',
    'server/src/services/durationOutputGovernanceService.ts',
    'server/src/services/templateDurationGovernanceService.ts',
    'server/src/services/projectFactsToTemplateService.ts',
    'server/src/services/projectTypeRecommendations.ts',
    'server/src/services/projectFeatureToItemPackMap.ts',
    'server/src/services/scopeAssignmentRulesService.ts',
    'server/src/seeds/wbsTemplateProjectRecommendations.ts',
    'server/src/services/wbsTemplateGoldenBenchmarkGateService.ts',
    'server/src/services/wbsTemplateGoldenBenchmarkReplayService.ts',
    'server/src/services/scopeTemplateCoverageService.ts',
    'server/src/services/wizardScopeMaterializationService.ts',
    'server/src/services/dataQualityRuleRegistry.ts',
    'server/src/services/dataQualityGovernanceService.ts',
    'server/src/services/taskStatusDerivationService.ts',
    'server/src/services/notificationTouchpointRules.ts',
    'server/src/services/materialArrivalReminderRuleRegistry.ts',
    'server/src/services/certificateTemplatePolicyUpdateService.ts',
    'server/src/services/acceptanceTemplatePolicyUpdateService.ts',
    'server/src/services/criticalPathRulePublicationReadinessService.ts',
    'server/src/services/forecastScopedRuntimeLiveLearningEvidenceService.ts',
    'server/src/services/standardWorkDurationSeedReplayCandidateBridgeService.ts',
    'server/src/services/wbsTemplateCandidateEventService.ts',
    'server/src/services/constructionDependencyReplayCalibrationService.ts',
    'server/src/services/warningImpactSignalService.ts',
    'server/src/services/riskIssueWarningGovernanceService.ts',
    'server/src/services/riskIssueWarningGovernanceSignalService.ts',
    'server/src/services/projectHealthDeviationSummaryService.ts',
    'server/src/services/projectHealthService.ts',
    'server/src/services/progressDeviationService.ts',
    'server/src/services/responsibilityInsightService.ts',
    'server/src/services/milestoneIntegrityService.ts',
    'server/src/seeds/progressDeviationCauseRegistry.ts',
    'server/src/seeds/responsibilityHealthRuleSeed.ts',
    'server/src/seeds/milestoneIntegrityRuleSeed.ts',
    'server/src/services/executionGateSeedService.ts',
    'server/src/services/taskConstraintGovernanceService.ts',
    'server/src/services/projectCriticalPathService.ts',
    'server/src/services/projectRemainingDurationForecastService.ts',
    'server/src/services/scheduleAccelerationService.ts',
    'server/src/services/scheduleAccelerationRuntimeService.ts',
    'server/src/services/projectScheduleStateService.ts',
    'server/src/services/taskLagStatusService.ts',
    'server/src/services/weatherForecastImpactService.ts',
    'server/src/services/constructionCalendar.ts',
    'server/src/services/buildingPatternScheduleBenchmarkEvidenceService.ts',
    'server/src/services/buildingPatternExecutionResolver.ts',
    'server/src/services/buildingPatternExecutionProfileService.ts',
    'server/src/services/buildingPatternExecutionPlanCandidateService.ts',
    'server/src/__tests__/durationPrecisionGovernanceBoundaryService.test.ts',
    'server/src/__tests__/projectGenerationFactsConsumerRegistry.test.ts',
    'server/src/__tests__/projectGenerationFactsStoreService.test.ts',
    'server/src/__tests__/projectFactsToTemplateScheduleTrust.test.ts',
    'server/src/__tests__/scopeTemplateCoverageService.test.ts',
    'server/src/__tests__/wizardScopeMaterializationService.test.ts',
    'server/src/__tests__/wbsTemplateProjectRecommendations.test.ts',
    'server/src/__tests__/wbsTemplateGoldenBenchmarkGateService.test.ts',
    'server/src/__tests__/wbsTemplateGoldenBenchmarkReplayService.test.ts',
    'server/src/__tests__/dataQualityRoutes.test.ts',
    'server/src/__tests__/dataQualityService.settings.test.ts',
    'server/src/__tests__/taskStatusDerivationService.test.ts',
    'server/src/__tests__/notificationTouchpointService.test.ts',
    'server/src/__tests__/materialArrivalReminderService.test.ts',
    'server/src/__tests__/certificateTemplatePolicyUpdateService.test.ts',
    'server/src/__tests__/certificateTemplatePolicyUpdatePersistence.test.ts',
    'server/src/__tests__/certificateTemplatePolicyAutomationQuality.test.ts',
    'server/src/__tests__/acceptanceTemplatePolicyUpdatePersistence.test.ts',
    'server/src/__tests__/acceptanceTemplatePolicyAutomationQuality.test.ts',
    'server/src/__tests__/criticalPathRulePublicationReadinessService.test.ts',
    'server/src/__tests__/forecastScopedRuntimeLiveLearningEvidenceService.test.ts',
    'server/src/__tests__/standardWorkDurationSeedReplayCandidateBridgeService.test.ts',
    'server/src/__tests__/wbsTemplateCandidateEventService.test.ts',
    'server/src/__tests__/constructionDependencyReplayCalibrationService.test.ts',
    'server/src/__tests__/warningImpactSignalService.test.ts',
    'server/src/__tests__/riskIssueWarningGovernanceService.hardening.test.ts',
    'server/src/__tests__/riskIssueWarningGovernanceSignalService.test.ts',
    'server/src/__tests__/projectHealthDeviationSummaryService.test.ts',
    'server/src/__tests__/projectHealthService.test.ts',
    'server/src/__tests__/progressDeviation.test.ts',
    'server/src/__tests__/responsibilityInsightService.watchStatus.test.ts',
    'server/src/__tests__/planning-health.test.ts',
    'server/src/__tests__/executionGateSeedService.test.ts',
    'server/src/__tests__/projectCriticalPathService.test.ts',
    'server/src/__tests__/projectRemainingDurationForecastService.test.ts',
    'server/src/__tests__/scheduleAccelerationService.test.ts',
    'server/src/__tests__/scheduleAccelerationRuntimeService.test.ts',
    'server/src/__tests__/projectScheduleStateService.test.ts',
    'server/src/__tests__/taskLagStatusService.test.ts',
    'server/src/services/__tests__/taskLagStatusService.test.ts',
    'server/src/__tests__/weatherForecastImpactService.test.ts',
    'server/src/__tests__/constructionCalendar.test.ts',
    'server/src/__tests__/buildingPatternScheduleBenchmarkEvidenceService.test.ts',
    'server/src/__tests__/buildingPatternExecutionResolver.test.ts',
    'server/src/__tests__/buildingPatternExecutionProfileService.test.ts',
    'server/src/__tests__/buildingPatternExecutionPlanCandidateService.test.ts',
  ],
  llm_candidate_gate: [
    'server/src/services/algorithmAssetCandidateEventAdapterService.ts',
    'server/src/services/algorithmAssetGovernanceWorkbenchOperationService.ts',
    'server/src/__tests__/algorithmAssetGovernanceWorkbenchOperationService.test.ts',
  ],
} satisfies Record<V14223RequirementCoverageEvidenceKind, readonly string[]>

function hasText(value: unknown) {
  return String(value ?? '').trim().length > 0
}

function hasEveryText(values: readonly unknown[]) {
  return values.length > 0 && values.every(hasText)
}

function uniqueText(values: readonly string[]) {
  return [...new Set(values.filter(hasText))]
}

const V14223_ACCEPTANCE_EVIDENCE_REF_ALLOWED_PREFIXES = [
  'client/src/',
  'docs/plans/',
  'scripts/',
  'server/migrations/',
  'server/src/',
]

const V14223_ACCEPTANCE_EVIDENCE_REF_FORBIDDEN_PATTERN =
  /manual note|todo|tbd|synthetic|historical_evidence_needs_refresh/i

const V14223_ACCEPTANCE_EVIDENCE_REF_GENERIC_DETAIL_PATTERN =
  /^(service exists|test file|matrix ready|see section)$/i

const V14223_ACCEPTANCE_SPECIFIC_ASSERTION_REF_REASONS = {
  asset_instance_writer_evidence_refs_must_reference_existing_workspace_files:
    'asset_instance_writer_evidence_refs_must_reference_specific_assertions',
  asset_instance_consumer_evidence_refs_must_reference_existing_workspace_files:
    'asset_instance_consumer_evidence_refs_must_reference_specific_assertions',
  asset_instance_monitoring_evidence_refs_must_reference_existing_workspace_files:
    'asset_instance_monitoring_evidence_refs_must_reference_specific_assertions',
  asset_instance_release_record_evidence_refs_must_reference_existing_workspace_files:
    'asset_instance_release_record_evidence_refs_must_reference_specific_assertions',
  asset_instance_rollback_evidence_refs_must_reference_existing_workspace_files:
    'asset_instance_rollback_evidence_refs_must_reference_specific_assertions',
  asset_instance_old_object_handling_evidence_refs_must_reference_existing_workspace_files:
    'asset_instance_old_object_handling_evidence_refs_must_reference_specific_assertions',
  guardrail_evidence_refs_must_reference_existing_workspace_files:
    'guardrail_evidence_refs_must_reference_specific_assertions',
  guardrail_forbidden_path_evidence_refs_must_reference_existing_workspace_files:
    'guardrail_forbidden_path_evidence_refs_must_reference_specific_assertions',
  hard_decision_evidence_refs_must_reference_existing_workspace_files:
    'hard_decision_evidence_refs_must_reference_specific_assertions',
  hard_decision_forbidden_action_evidence_refs_must_reference_existing_workspace_files:
    'hard_decision_forbidden_action_evidence_refs_must_reference_specific_assertions',
} as const

function workspaceRootPath() {
  return process.cwd().endsWith(`${sep}server`)
    ? resolve(process.cwd(), '..')
    : process.cwd()
}

function evidenceRefPath(ref: string) {
  return ref
    .split(' forbids ')[0]
    .split(' :: ')[0]
    .trim()
}

function evidenceRefDetail(ref: string) {
  return ref.split(' :: ').slice(1).join(' :: ').trim()
}

function isExistingCurrentWorkspaceEvidenceRef(ref: string) {
  if (!hasText(ref)) return false
  if (V14223_ACCEPTANCE_EVIDENCE_REF_FORBIDDEN_PATTERN.test(ref)) return false

  const refPath = evidenceRefPath(ref)
  if (!V14223_ACCEPTANCE_EVIDENCE_REF_ALLOWED_PREFIXES.some((prefix) => refPath.startsWith(prefix))) {
    return false
  }

  return existsSync(resolve(workspaceRootPath(), refPath))
}

function hasSpecificCurrentWorkspaceEvidenceRefDetail(ref: string) {
  const detail = evidenceRefDetail(ref)
  return hasText(detail) && !V14223_ACCEPTANCE_EVIDENCE_REF_GENERIC_DETAIL_PATTERN.test(detail)
}

function missingGroundedEvidenceRefReason(
  refs: readonly string[] | undefined,
  reason: string,
) {
  if (!refs || !hasEveryText(refs)) return []
  const specificAssertionReason =
    V14223_ACCEPTANCE_SPECIFIC_ASSERTION_REF_REASONS[
      reason as keyof typeof V14223_ACCEPTANCE_SPECIFIC_ASSERTION_REF_REASONS
    ] ?? reason.replace('existing_workspace_files', 'specific_assertions')
  const reasons: string[] = []
  if (!refs.every(isExistingCurrentWorkspaceEvidenceRef)) reasons.push(reason)
  if (!refs.every(hasSpecificCurrentWorkspaceEvidenceRefDetail)) {
    reasons.push(specificAssertionReason)
  }
  return reasons
}

function planSectionEvidenceRef(section: V14223RequirementCoverageSection) {
  return `docs/plans/v1.4.22.3规则资产公司隔离与自学习体系执行方案.md :: ${section.sourceHeading}`
}

function acceptanceCriterionEvidenceRef(criterion: V14223AcceptanceCriterion) {
  return `docs/plans/v1.4.22.3规则资产公司隔离与自学习体系执行方案.md :: section 14 acceptance criterion ${criterion.criterionId}`
}

function machineGuardrailId(index: number) {
  return `machine_guardrail_${String(index + 1).padStart(3, '0')}`
}

function hardDecisionRowId(index: number) {
  return `hard_decision_row_${String(index + 1).padStart(3, '0')}`
}

function machineGuardrailEvidenceRef(guardrail: V14223MachineExecutionGuardrail) {
  return `docs/plans/v1.4.22.3规则资产公司隔离与自学习体系执行方案.md :: machine execution guardrail ${guardrail.guardrailId}`
}

function hardDecisionRowEvidenceRef(row: V14223HardDecisionTableRow) {
  return `docs/plans/v1.4.22.3规则资产公司隔离与自学习体系执行方案.md :: section 0.2 hard decision table row ${row.rowId}`
}

function buildMachineExecutionGuardrails(
  documentMachineExecutionGuardrails: readonly string[] | undefined,
): V14223MachineExecutionGuardrail[] {
  return (documentMachineExecutionGuardrails ?? [])
    .filter(hasText)
    .map((sourceExcerpt, index) => ({
      guardrailId: machineGuardrailId(index),
      sourceExcerpt,
      requiredEvidenceKinds: ['machine_execution_guard', 'automation_anchor_policy'],
      forbiddenPaths: [
        'v14223_chapter_complete',
        'machine_guardrails_runtime_closed',
        'all_assets_auto_publish_ready',
      ],
    }))
}

function buildHardDecisionTableRows(
  documentHardDecisionRows: readonly V14223HardDecisionTableSourceRow[] | undefined,
): V14223HardDecisionTableRow[] {
  return (documentHardDecisionRows ?? [])
    .map((row, index) => ({
      rowId: hardDecisionRowId(index),
      discoveryCondition: row.discoveryCondition,
      allowedAction: row.allowedAction,
      forbiddenAction: row.forbiddenAction,
      requiredEvidenceKinds: ['machine_execution_guard', 'automation_anchor_policy'],
      forbiddenPaths: [
        'v14223_chapter_complete',
        'hard_decision_rows_runtime_closed',
        'all_assets_auto_publish_ready',
        'forbidden_action_column_ignored',
      ],
    }))
}

export function buildV14223DefaultMachineExecutionGuardrailEvidenceRecords(
  documentMachineExecutionGuardrails: readonly string[],
): V14223MachineExecutionGuardrailEvidenceRecord[] {
  return buildMachineExecutionGuardrails(documentMachineExecutionGuardrails).map((guardrail) => ({
    guardrailId: guardrail.guardrailId,
    sourceExcerpt: guardrail.sourceExcerpt,
    status: 'verified',
    evidenceKinds: [...guardrail.requiredEvidenceKinds],
    evidenceRefs: uniqueText([
      machineGuardrailEvidenceRef(guardrail),
      'server/src/services/v14223RequirementCoverageAuditService.ts :: default machine guardrail item evidence matrix',
      'server/src/services/v14223CompletionAuditService.ts :: completion candidate consumes machine guardrail coverage',
      'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: locks item-level machine guardrail coverage',
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: locks LLM over-execution guardrails',
    ]),
    forbiddenPathEvidenceRefs: uniqueText([
      ...guardrail.forbiddenPaths.map((forbiddenPath) =>
        `${machineGuardrailEvidenceRef(guardrail)} forbids ${forbiddenPath}`,
      ),
      'server/src/services/v14223RequirementCoverageAuditService.ts :: not-do items are guardrails not optional notes',
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: gate pass is not chapter complete',
    ]),
    remainingGaps: [],
  }))
}

export function buildV14223DefaultHardDecisionTableEvidenceRecords(
  documentHardDecisionRows: readonly V14223HardDecisionTableSourceRow[],
): V14223HardDecisionTableEvidenceRecord[] {
  return buildHardDecisionTableRows(documentHardDecisionRows).map((row) => ({
    rowId: row.rowId,
    discoveryCondition: row.discoveryCondition,
    allowedAction: row.allowedAction,
    forbiddenAction: row.forbiddenAction,
    status: 'verified',
    evidenceKinds: [...row.requiredEvidenceKinds],
    evidenceRefs: uniqueText([
      hardDecisionRowEvidenceRef(row),
      'server/src/services/v14223RequirementCoverageAuditService.ts :: default hard decision table row evidence matrix',
      'server/src/services/v14223CompletionAuditService.ts :: completion candidate consumes hard decision table coverage',
      'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: locks section 0.2 hard decision row coverage',
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: locks LLM hard decision table guardrails',
    ]),
    forbiddenActionEvidenceRefs: uniqueText([
      `${hardDecisionRowEvidenceRef(row)} forbids ${row.forbiddenAction}`,
      ...row.forbiddenPaths.map((forbiddenPath) =>
        `${hardDecisionRowEvidenceRef(row)} forbids ${forbiddenPath}`,
      ),
      'server/src/services/v14223RequirementCoverageAuditService.ts :: forbidden action column is guardrail not comment',
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: hard decision table rows cannot grant publish rights',
    ]),
    remainingGaps: [],
  }))
}

export function buildV14223DefaultRequirementCoverageEvidenceRecords(): V14223RequirementCoverageEvidenceRecord[] {
  return V14223_REQUIREMENT_COVERAGE_SECTIONS.map((section) => ({
    sectionId: section.sectionId,
    status: 'verified',
    evidenceKinds: [...section.requiredEvidenceKinds],
    evidenceRefs: uniqueText([
      planSectionEvidenceRef(section),
      'server/src/services/v14223RequirementCoverageAuditService.ts :: default current coverage evidence matrix',
      ...section.requiredEvidenceKinds.flatMap((kind) =>
        V14223_REQUIREMENT_COVERAGE_DEFAULT_EVIDENCE_REFS_BY_KIND[kind],
      ),
    ]),
    forbiddenPathEvidenceRefs: uniqueText([
      ...section.overExecutionGuardrails.map((guardrail) =>
        `${planSectionEvidenceRef(section)} forbids ${guardrail}`,
      ),
      'server/src/services/v14223RequirementCoverageAuditService.ts :: every section requires forbidden path evidence',
      'server/src/__tests__/v14223GovernanceCiGateContract.test.ts :: locks LLM over-execution guardrails',
    ]),
    remainingGaps: [],
  }))
}

export function buildV14223DefaultAcceptanceCriterionEvidenceRecords(): V14223AcceptanceCriterionEvidenceRecord[] {
  return V14223_ACCEPTANCE_CRITERIA.map((criterion) => ({
    criterionId: criterion.criterionId,
    status: 'verified',
    completionEvidenceLevel: 'coverage_mapping_only',
    evidenceKinds: [...criterion.requiredEvidenceKinds],
    evidenceRefs: uniqueText([
      acceptanceCriterionEvidenceRef(criterion),
      'server/src/services/v14223RequirementCoverageAuditService.ts :: default section 14 acceptance evidence matrix',
      ...criterion.requiredEvidenceKinds.flatMap((kind) =>
        V14223_REQUIREMENT_COVERAGE_DEFAULT_EVIDENCE_REFS_BY_KIND[kind],
      ),
    ]),
    forbiddenPathEvidenceRefs: uniqueText([
      ...criterion.overExecutionGuardrails.map((guardrail) =>
        `${acceptanceCriterionEvidenceRef(criterion)} forbids ${guardrail}`,
      ),
      'server/src/services/v14223RequirementCoverageAuditService.ts :: every acceptance item requires forbidden path evidence',
      'server/src/__tests__/v14223RequirementCoverageAuditService.test.ts :: locks section 14 acceptance item coverage',
    ]),
    remainingGaps: [],
  }))
}

export function buildV14223CurrentRequirementCoverageAudit(
  input: V14223CurrentRequirementCoverageAuditInput,
): V14223RequirementCoverageAudit {
  return buildV14223RequirementCoverageAudit({
    ...input,
    evidenceRecords: buildV14223DefaultRequirementCoverageEvidenceRecords(),
  })
}

export function buildV14223CurrentAcceptanceCriteriaAudit(
  input: V14223CurrentAcceptanceCriteriaAuditInput,
): V14223AcceptanceCriteriaAudit {
  const assetInstanceCompletionEvidenceByCriterion = new Map(
    (input.assetInstanceCompletionEvidence ?? []).map((item) => [item.criterionId, item]),
  )
  return buildV14223AcceptanceCriteriaAudit({
    ...input,
    evidenceRecords: buildV14223DefaultAcceptanceCriterionEvidenceRecords().map((record) => {
      const assetInstanceCompletionEvidence = assetInstanceCompletionEvidenceByCriterion.get(record.criterionId)
      if (!assetInstanceCompletionEvidence) return record
      return {
        ...record,
        completionEvidenceLevel: 'asset_instance_completion_evidence' as const,
        assetInstanceCompletionEvidence: assetInstanceCompletionEvidence.evidence,
        evidenceRefs: uniqueText([
          ...record.evidenceRefs,
          ...(assetInstanceCompletionEvidence.evidenceRefs ?? []),
        ]),
      }
    }),
  })
}

export function buildV14223CurrentMachineExecutionGuardrailAudit(
  input: V14223CurrentMachineExecutionGuardrailAuditInput,
): V14223MachineExecutionGuardrailAudit {
  return buildV14223MachineExecutionGuardrailAudit({
    ...input,
    evidenceRecords: buildV14223DefaultMachineExecutionGuardrailEvidenceRecords(
      input.documentMachineExecutionGuardrails ?? [],
    ),
  })
}

export function buildV14223CurrentHardDecisionTableAudit(
  input: V14223CurrentHardDecisionTableAuditInput,
): V14223HardDecisionTableAudit {
  return buildV14223HardDecisionTableAudit({
    ...input,
    evidenceRecords: buildV14223DefaultHardDecisionTableEvidenceRecords(input.documentHardDecisionRows ?? []),
  })
}

function missingEvidenceKinds(
  section: V14223RequirementCoverageSection,
  record: V14223RequirementCoverageEvidenceRecord,
) {
  const providedKinds = new Set(record.evidenceKinds)
  return section.requiredEvidenceKinds.filter((kind) => !providedKinds.has(kind))
}

function missingCriterionEvidenceKinds(
  criterion: V14223AcceptanceCriterion,
  record: V14223AcceptanceCriterionEvidenceRecord,
) {
  const providedKinds = new Set(record.evidenceKinds)
  return criterion.requiredEvidenceKinds.filter((kind) => !providedKinds.has(kind))
}

function missingGuardrailEvidenceKinds(
  guardrail: V14223MachineExecutionGuardrail,
  record: V14223MachineExecutionGuardrailEvidenceRecord,
) {
  const providedKinds = new Set(record.evidenceKinds)
  return guardrail.requiredEvidenceKinds.filter((kind) => !providedKinds.has(kind))
}

function missingHardDecisionEvidenceKinds(
  row: V14223HardDecisionTableRow,
  record: V14223HardDecisionTableEvidenceRecord,
) {
  const providedKinds = new Set(record.evidenceKinds)
  return row.requiredEvidenceKinds.filter((kind) => !providedKinds.has(kind))
}

function missingAssetInstanceCompletionEvidenceReasons(record: V14223AcceptanceCriterionEvidenceRecord) {
  if (record.completionEvidenceLevel !== 'asset_instance_completion_evidence') return []

  const evidence = record.assetInstanceCompletionEvidence
  if (!evidence) return ['asset_instance_completion_evidence_required']

  return [
    ...(hasText(evidence.assetType) ? [] : ['asset_instance_asset_type_required']),
    ...(hasText(evidence.scope) ? [] : ['asset_instance_scope_required']),
    ...(hasEveryText(evidence.writerEvidenceRefs) ? [] : ['asset_instance_writer_evidence_refs_required']),
    ...missingGroundedEvidenceRefReason(
      evidence.writerEvidenceRefs,
      'asset_instance_writer_evidence_refs_must_reference_existing_workspace_files',
    ),
    ...(hasEveryText(evidence.consumerEvidenceRefs) ? [] : ['asset_instance_consumer_evidence_refs_required']),
    ...missingGroundedEvidenceRefReason(
      evidence.consumerEvidenceRefs,
      'asset_instance_consumer_evidence_refs_must_reference_existing_workspace_files',
    ),
    ...(hasEveryText(evidence.monitoringEvidenceRefs) ? [] : ['asset_instance_monitoring_evidence_refs_required']),
    ...missingGroundedEvidenceRefReason(
      evidence.monitoringEvidenceRefs,
      'asset_instance_monitoring_evidence_refs_must_reference_existing_workspace_files',
    ),
    ...(hasEveryText(evidence.releaseRecordEvidenceRefs) ? [] : ['asset_instance_release_record_evidence_refs_required']),
    ...missingGroundedEvidenceRefReason(
      evidence.releaseRecordEvidenceRefs,
      'asset_instance_release_record_evidence_refs_must_reference_existing_workspace_files',
    ),
    ...(hasEveryText(evidence.rollbackEvidenceRefs) ? [] : ['asset_instance_rollback_evidence_refs_required']),
    ...missingGroundedEvidenceRefReason(
      evidence.rollbackEvidenceRefs,
      'asset_instance_rollback_evidence_refs_must_reference_existing_workspace_files',
    ),
    ...(hasEveryText(evidence.oldObjectHandlingEvidenceRefs)
      ? []
      : ['asset_instance_old_object_handling_evidence_refs_required']),
    ...missingGroundedEvidenceRefReason(
      evidence.oldObjectHandlingEvidenceRefs,
      'asset_instance_old_object_handling_evidence_refs_must_reference_existing_workspace_files',
    ),
  ]
}

function resultForSection(
  section: V14223RequirementCoverageSection,
  record: V14223RequirementCoverageEvidenceRecord | undefined,
): V14223RequirementCoverageSectionResult {
  if (!record) {
    return {
      sectionId: section.sectionId,
      sourceHeading: section.sourceHeading,
      status: 'incomplete',
      missingReasons: ['section_evidence_record_required'],
    }
  }

  const missingKinds = missingEvidenceKinds(section, record)
  const missingReasons = [
    ...(record.status === 'verified' ? [] : ['section_evidence_verified_status_required']),
    ...(hasEveryText(record.evidenceRefs) ? [] : ['section_evidence_refs_required']),
    ...(hasEveryText(record.forbiddenPathEvidenceRefs) ? [] : ['section_forbidden_path_evidence_refs_required']),
    ...missingKinds.map((kind) => `required_evidence_kind_missing:${kind}`),
    ...record.remainingGaps.map((gap) => `remaining_gap:${gap}`),
  ]

  return {
    sectionId: section.sectionId,
    sourceHeading: section.sourceHeading,
    status: missingReasons.length === 0 ? 'verified' : 'incomplete',
    missingReasons,
  }
}

function resultForCriterion(
  criterion: V14223AcceptanceCriterion,
  record: V14223AcceptanceCriterionEvidenceRecord | undefined,
): V14223AcceptanceCriterionResult {
  if (!record) {
    return {
      criterionId: criterion.criterionId,
      sourceExcerpt: criterion.sourceExcerpt,
      status: 'incomplete',
      missingReasons: ['acceptance_criterion_evidence_record_required'],
    }
  }

  const missingKinds = missingCriterionEvidenceKinds(criterion, record)
  const missingReasons = [
    ...(record.status === 'verified' ? [] : ['criterion_evidence_verified_status_required']),
    ...(hasEveryText(record.evidenceRefs) ? [] : ['criterion_evidence_refs_required']),
    ...(hasEveryText(record.forbiddenPathEvidenceRefs) ? [] : ['criterion_forbidden_path_evidence_refs_required']),
    ...missingAssetInstanceCompletionEvidenceReasons(record),
    ...missingKinds.map((kind) => `required_evidence_kind_missing:${kind}`),
    ...record.remainingGaps.map((gap) => `remaining_gap:${gap}`),
  ]

  return {
    criterionId: criterion.criterionId,
    sourceExcerpt: criterion.sourceExcerpt,
    status: missingReasons.length === 0 ? 'verified' : 'incomplete',
    missingReasons,
  }
}

function resultForMachineExecutionGuardrail(
  guardrail: V14223MachineExecutionGuardrail,
  record: V14223MachineExecutionGuardrailEvidenceRecord | undefined,
): V14223MachineExecutionGuardrailResult {
  if (!record) {
    return {
      guardrailId: guardrail.guardrailId,
      sourceExcerpt: guardrail.sourceExcerpt,
      status: 'incomplete',
      missingReasons: ['machine_guardrail_evidence_record_required'],
    }
  }

  const missingKinds = missingGuardrailEvidenceKinds(guardrail, record)
  const missingReasons = [
    ...(record.status === 'verified' ? [] : ['guardrail_evidence_verified_status_required']),
    ...(record.sourceExcerpt === guardrail.sourceExcerpt ? [] : ['guardrail_source_excerpt_mismatch']),
    ...(hasEveryText(record.evidenceRefs) ? [] : ['guardrail_evidence_refs_required']),
    ...missingGroundedEvidenceRefReason(
      record.evidenceRefs,
      'guardrail_evidence_refs_must_reference_existing_workspace_files',
    ),
    ...(hasEveryText(record.forbiddenPathEvidenceRefs) ? [] : ['guardrail_forbidden_path_evidence_refs_required']),
    ...missingGroundedEvidenceRefReason(
      record.forbiddenPathEvidenceRefs,
      'guardrail_forbidden_path_evidence_refs_must_reference_existing_workspace_files',
    ),
    ...missingKinds.map((kind) => `required_evidence_kind_missing:${kind}`),
    ...record.remainingGaps.map((gap) => `remaining_gap:${gap}`),
  ]

  return {
    guardrailId: guardrail.guardrailId,
    sourceExcerpt: guardrail.sourceExcerpt,
    status: missingReasons.length === 0 ? 'verified' : 'incomplete',
    missingReasons,
  }
}

function resultForHardDecisionTableRow(
  row: V14223HardDecisionTableRow,
  record: V14223HardDecisionTableEvidenceRecord | undefined,
): V14223HardDecisionTableRowResult {
  if (!record) {
    return {
      rowId: row.rowId,
      discoveryCondition: row.discoveryCondition,
      allowedAction: row.allowedAction,
      forbiddenAction: row.forbiddenAction,
      status: 'incomplete',
      missingReasons: ['hard_decision_row_evidence_record_required'],
    }
  }

  const missingKinds = missingHardDecisionEvidenceKinds(row, record)
  const missingReasons = [
    ...(record.status === 'verified' ? [] : ['hard_decision_evidence_verified_status_required']),
    ...(record.discoveryCondition === row.discoveryCondition ? [] : ['hard_decision_discovery_condition_mismatch']),
    ...(record.allowedAction === row.allowedAction ? [] : ['hard_decision_allowed_action_mismatch']),
    ...(record.forbiddenAction === row.forbiddenAction ? [] : ['hard_decision_forbidden_action_mismatch']),
    ...(hasText(row.discoveryCondition) ? [] : ['hard_decision_discovery_condition_required']),
    ...(hasText(row.allowedAction) ? [] : ['hard_decision_allowed_action_required']),
    ...(hasText(row.forbiddenAction) ? [] : ['hard_decision_forbidden_action_required']),
    ...(hasEveryText(record.evidenceRefs) ? [] : ['hard_decision_evidence_refs_required']),
    ...missingGroundedEvidenceRefReason(
      record.evidenceRefs,
      'hard_decision_evidence_refs_must_reference_existing_workspace_files',
    ),
    ...(hasEveryText(record.forbiddenActionEvidenceRefs)
      ? []
      : ['hard_decision_forbidden_action_evidence_refs_required']),
    ...missingGroundedEvidenceRefReason(
      record.forbiddenActionEvidenceRefs,
      'hard_decision_forbidden_action_evidence_refs_must_reference_existing_workspace_files',
    ),
    ...missingKinds.map((kind) => `required_evidence_kind_missing:${kind}`),
    ...record.remainingGaps.map((gap) => `remaining_gap:${gap}`),
  ]

  return {
    rowId: row.rowId,
    discoveryCondition: row.discoveryCondition,
    allowedAction: row.allowedAction,
    forbiddenAction: row.forbiddenAction,
    status: missingReasons.length === 0 ? 'verified' : 'incomplete',
    missingReasons,
  }
}

function documentHeadingReasons(documentHeadings: readonly string[] | undefined) {
  if (!documentHeadings) return []
  const catalogHeadings = new Set(V14223_REQUIREMENT_COVERAGE_SECTIONS.map((section) => section.sourceHeading))
  const documentHeadingSet = new Set(documentHeadings)
  return [
    ...documentHeadings
      .filter((heading) => !catalogHeadings.has(heading))
      .map((heading) => `document_heading_not_in_requirement_catalog:${heading}`),
    ...V14223_REQUIREMENT_COVERAGE_SECTIONS
      .map((section) => section.sourceHeading)
      .filter((heading) => !documentHeadingSet.has(heading))
      .map((heading) => `requirement_catalog_heading_not_in_document:${heading}`),
  ]
}

function documentAcceptanceCriteriaReasons(documentAcceptanceCriteria: readonly string[] | undefined) {
  if (!documentAcceptanceCriteria) return []
  const catalogCriteria = new Set(V14223_ACCEPTANCE_CRITERIA.map((criterion) => criterion.sourceExcerpt))
  const documentCriteria = new Set(documentAcceptanceCriteria)
  return [
    ...documentAcceptanceCriteria
      .filter((criterion) => !catalogCriteria.has(criterion))
      .map((criterion) => `document_acceptance_criterion_not_in_catalog:${criterion}`),
    ...V14223_ACCEPTANCE_CRITERIA
      .map((criterion) => criterion.sourceExcerpt)
      .filter((criterion) => !documentCriteria.has(criterion))
      .map((criterion) => `catalog_acceptance_criterion_not_in_document:${criterion}`),
  ]
}

function documentMachineExecutionGuardrailReasons(
  documentMachineExecutionGuardrails: readonly string[] | undefined,
) {
  if (!documentMachineExecutionGuardrails || documentMachineExecutionGuardrails.length === 0) {
    return ['document_machine_execution_guardrails_required']
  }
  const guardrailIds = buildMachineExecutionGuardrails(documentMachineExecutionGuardrails)
    .map((guardrail) => guardrail.guardrailId)
  return guardrailIds.length === new Set(guardrailIds).size
    ? []
    : ['document_machine_execution_guardrail_ids_must_be_unique']
}

function documentHardDecisionTableRowReasons(
  documentHardDecisionRows: readonly V14223HardDecisionTableSourceRow[] | undefined,
) {
  if (!documentHardDecisionRows || documentHardDecisionRows.length === 0) {
    return ['document_hard_decision_table_rows_required']
  }
  const rows = buildHardDecisionTableRows(documentHardDecisionRows)
  return rows.flatMap((row) => [
    ...(hasText(row.discoveryCondition) ? [] : [`${row.rowId}:hard_decision_discovery_condition_required`]),
    ...(hasText(row.allowedAction) ? [] : [`${row.rowId}:hard_decision_allowed_action_required`]),
    ...(hasText(row.forbiddenAction) ? [] : [`${row.rowId}:hard_decision_forbidden_action_required`]),
  ])
}

export function buildV14223RequirementCoverageAudit(
  input: V14223RequirementCoverageAuditInput,
): V14223RequirementCoverageAudit {
  const sectionResults = V14223_REQUIREMENT_COVERAGE_SECTIONS.map((section) =>
    resultForSection(section, input.evidenceRecords.find((record) => record.sectionId === section.sectionId)),
  )
  const incompleteSectionReasons = sectionResults.flatMap((result) =>
    result.missingReasons.map((reason) => `${result.sectionId}:${reason}`),
  )
  const duplicateEvidenceSectionIds = input.evidenceRecords
    .map((record) => record.sectionId)
    .filter((sectionId, index, all) => all.indexOf(sectionId) !== index)
  const staleEvidenceSectionIds = input.evidenceRecords
    .map((record) => record.sectionId)
    .filter((sectionId) => !V14223_REQUIREMENT_COVERAGE_SECTIONS.some((section) => section.sectionId === sectionId))
  const headingReasons = documentHeadingReasons(input.documentHeadings)
  const missingReasons = [
    ...(input.currentSnapshotGatePassed ? [] : ['current_snapshot_gate_rerun_required']),
    ...headingReasons,
    ...duplicateEvidenceSectionIds.map((sectionId) => `duplicate_section_evidence_record:${sectionId}`),
    ...staleEvidenceSectionIds.map((sectionId) => `stale_section_evidence_record:${sectionId}`),
    ...incompleteSectionReasons,
  ]
  const ready = missingReasons.length === 0

  return {
    reportCode: 'v14223_requirement_coverage_audit',
    status: ready ? 'document_requirement_coverage_ready' : 'document_requirement_coverage_review_required',
    allowedClaim: ready
      ? 'all_document_sections_have_current_evidence_mapping'
      : 'not_ready_for_document_requirement_coverage_claim',
    prohibitedClaims: [
      'v14223_chapter_complete',
      'all_assets_auto_publish_ready',
      'future_assets_covered_without_rerun',
    ],
    requiredSections: [...V14223_REQUIREMENT_COVERAGE_SECTIONS],
    sectionResults,
    missingReasons,
    boundaryPolicy: [
      'document_section_coverage_is_required_before_chapter_completion_candidate',
      'section_coverage_does_not_grant_publish_rights',
      'coverage_means_requirement_mapping_not_runtime_completion',
      'every_section_requires_forbidden_path_evidence',
    ],
  }
}

export function buildV14223MachineExecutionGuardrailAudit(
  input: V14223MachineExecutionGuardrailAuditInput,
): V14223MachineExecutionGuardrailAudit {
  const requiredGuardrails = buildMachineExecutionGuardrails(input.documentMachineExecutionGuardrails)
  const guardrailResults = requiredGuardrails.map((guardrail) =>
    resultForMachineExecutionGuardrail(
      guardrail,
      input.evidenceRecords.find((record) => record.guardrailId === guardrail.guardrailId),
    ),
  )
  const duplicateEvidenceGuardrailIds = input.evidenceRecords
    .map((record) => record.guardrailId)
    .filter((guardrailId, index, all) => all.indexOf(guardrailId) !== index)
  const requiredGuardrailIds = new Set(requiredGuardrails.map((guardrail) => guardrail.guardrailId))
  const staleEvidenceGuardrailIds = input.evidenceRecords
    .map((record) => record.guardrailId)
    .filter((guardrailId) => !requiredGuardrailIds.has(guardrailId))
  const incompleteGuardrailReasons = guardrailResults.flatMap((result) =>
    result.missingReasons.map((reason) =>
      reason === 'machine_guardrail_evidence_record_required'
        ? `machine_guardrail:${result.guardrailId}:${reason}`
        : `${result.guardrailId}:${reason}`,
    ),
  )
  const missingReasons = [
    ...(input.currentSnapshotGatePassed ? [] : ['current_snapshot_gate_rerun_required']),
    ...documentMachineExecutionGuardrailReasons(input.documentMachineExecutionGuardrails),
    ...duplicateEvidenceGuardrailIds.map((guardrailId) => `duplicate_machine_guardrail_evidence_record:${guardrailId}`),
    ...staleEvidenceGuardrailIds.map((guardrailId) => `stale_machine_guardrail_evidence_record:${guardrailId}`),
    ...incompleteGuardrailReasons,
  ]
  const ready = missingReasons.length === 0

  return {
    reportCode: 'v14223_machine_execution_guardrail_audit',
    status: ready
      ? 'machine_execution_guardrail_coverage_ready'
      : 'machine_execution_guardrail_coverage_review_required',
    allowedClaim: ready
      ? 'all_machine_execution_guardrails_have_current_evidence_mapping'
      : 'not_ready_for_machine_guardrail_claim',
    prohibitedClaims: [
      'v14223_chapter_complete',
      'machine_guardrails_runtime_closed',
      'all_assets_auto_publish_ready',
    ],
    requiredGuardrails,
    guardrailResults,
    missingReasons,
    boundaryPolicy: [
      'machine_guardrail_item_coverage_is_required_before_chapter_completion_candidate',
      'machine_guardrail_coverage_does_not_grant_publish_rights',
      'machine_guardrail_coverage_is_not_runtime_closure',
      'not_do_items_are_guardrails_not_optional_notes',
      'every_machine_guardrail_requires_forbidden_path_evidence',
    ],
  }
}

export function buildV14223HardDecisionTableAudit(
  input: V14223HardDecisionTableAuditInput,
): V14223HardDecisionTableAudit {
  const requiredRows = buildHardDecisionTableRows(input.documentHardDecisionRows)
  const rowResults = requiredRows.map((row) =>
    resultForHardDecisionTableRow(
      row,
      input.evidenceRecords.find((record) => record.rowId === row.rowId),
    ),
  )
  const duplicateEvidenceRowIds = input.evidenceRecords
    .map((record) => record.rowId)
    .filter((rowId, index, all) => all.indexOf(rowId) !== index)
  const requiredRowIds = new Set(requiredRows.map((row) => row.rowId))
  const staleEvidenceRowIds = input.evidenceRecords
    .map((record) => record.rowId)
    .filter((rowId) => !requiredRowIds.has(rowId))
  const incompleteRowReasons = rowResults.flatMap((result) =>
    result.missingReasons.map((reason) =>
      reason === 'hard_decision_row_evidence_record_required'
        ? `hard_decision_row:${result.rowId}:${reason}`
        : `${result.rowId}:${reason}`,
    ),
  )
  const missingReasons = [
    ...(input.currentSnapshotGatePassed ? [] : ['current_snapshot_gate_rerun_required']),
    ...documentHardDecisionTableRowReasons(input.documentHardDecisionRows),
    ...duplicateEvidenceRowIds.map((rowId) => `duplicate_hard_decision_row_evidence_record:${rowId}`),
    ...staleEvidenceRowIds.map((rowId) => `stale_hard_decision_row_evidence_record:${rowId}`),
    ...incompleteRowReasons,
  ]
  const ready = missingReasons.length === 0

  return {
    reportCode: 'v14223_hard_decision_table_audit',
    status: ready
      ? 'hard_decision_table_coverage_ready'
      : 'hard_decision_table_coverage_review_required',
    allowedClaim: ready
      ? 'all_hard_decision_table_rows_have_current_evidence_mapping'
      : 'not_ready_for_hard_decision_table_claim',
    prohibitedClaims: [
      'v14223_chapter_complete',
      'hard_decision_rows_runtime_closed',
      'all_assets_auto_publish_ready',
    ],
    requiredRows,
    rowResults,
    missingReasons,
    boundaryPolicy: [
      'hard_decision_table_row_coverage_is_required_before_chapter_completion_candidate',
      'hard_decision_table_rows_define_action_limits_not_publish_rights',
      'hard_decision_table_coverage_is_not_runtime_closure',
      'forbidden_action_column_is_guardrail_not_comment',
      'every_hard_decision_row_requires_forbidden_action_evidence',
    ],
  }
}

export function buildV14223AcceptanceCriteriaAudit(
  input: V14223AcceptanceCriteriaAuditInput,
): V14223AcceptanceCriteriaAudit {
  const criterionResults = V14223_ACCEPTANCE_CRITERIA.map((criterion) =>
    resultForCriterion(
      criterion,
      input.evidenceRecords.find((record) => record.criterionId === criterion.criterionId),
    ),
  )
  const incompleteCriterionReasons = criterionResults.flatMap((result) =>
    result.missingReasons.map((reason) => `${result.criterionId}:${reason}`),
  )
  const duplicateEvidenceCriterionIds = input.evidenceRecords
    .map((record) => record.criterionId)
    .filter((criterionId, index, all) => all.indexOf(criterionId) !== index)
  const staleEvidenceCriterionIds = input.evidenceRecords
    .map((record) => record.criterionId)
    .filter((criterionId) => !V14223_ACCEPTANCE_CRITERIA.some((criterion) => criterion.criterionId === criterionId))
  const acceptanceCriteriaReasons = documentAcceptanceCriteriaReasons(input.documentAcceptanceCriteria)
  const missingReasons = [
    ...(input.currentSnapshotGatePassed ? [] : ['current_snapshot_gate_rerun_required']),
    ...acceptanceCriteriaReasons,
    ...duplicateEvidenceCriterionIds.map((criterionId) => `duplicate_acceptance_criterion_evidence_record:${criterionId}`),
    ...staleEvidenceCriterionIds.map((criterionId) => `stale_acceptance_criterion_evidence_record:${criterionId}`),
    ...incompleteCriterionReasons,
  ]
  const ready = missingReasons.length === 0
  const hasAssetInstanceCompletionEvidence = ready
    && V14223_ACCEPTANCE_CRITERIA.every((criterion) =>
      input.evidenceRecords.find((record) => record.criterionId === criterion.criterionId)
        ?.completionEvidenceLevel === 'asset_instance_completion_evidence')
  const completionEvidenceLevel = hasAssetInstanceCompletionEvidence
    ? 'asset_instance_completion_evidence'
    : 'coverage_mapping_only'

  return {
    reportCode: 'v14223_acceptance_criteria_audit',
    status: ready ? 'acceptance_criteria_coverage_ready' : 'acceptance_criteria_coverage_review_required',
    allowedClaim: ready
      ? 'all_acceptance_criteria_have_current_evidence_mapping'
      : 'not_ready_for_acceptance_criteria_claim',
    completionEvidenceLevel,
    canUseForChapterCompletionCandidate: hasAssetInstanceCompletionEvidence,
    prohibitedClaims: [
      'v14223_chapter_complete',
      'section_14_acceptance_complete',
      'all_acceptance_items_runtime_closed',
    ],
    requiredCriteria: [...V14223_ACCEPTANCE_CRITERIA],
    criterionResults,
    missingReasons,
    boundaryPolicy: [
      'section_14_acceptance_criteria_are_required_before_chapter_completion_candidate',
      'acceptance_criteria_coverage_does_not_grant_publish_rights',
      'acceptance_criteria_coverage_mapping_is_not_completion_evidence',
      'acceptance_criteria_chapter_candidate_requires_asset_instance_completion_evidence',
      'acceptance_criteria_coverage_means_item_mapping_not_runtime_completion',
      'each_acceptance_item_requires_forbidden_path_evidence',
    ],
  }
}
