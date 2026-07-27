import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_EXTENSIONS = new Set(['.ts'])
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git', 'tmp'])

export const DELETE_MUTATION_CLASSIFICATIONS = [
  {
    file: 'server/src/routes/acceptance-plans.ts',
    line: 1364,
    table: 'acceptance_plans',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'DELETE /api/acceptance-plans/:id is guarded by enforceRetentionOrBlock before the physical delete.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/certificate-dependencies.ts',
    line: 272,
    table: 'certificate_dependencies',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Certificate dependency route checks deletion retention before removing dependency rows.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/certificate-work-items.ts',
    line: 262,
    table: 'certificate_dependencies',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Certificate dependency replacement cleans stale dependency edges before writing the current work-item link set.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/certificate-work-items.ts',
    line: 861,
    table: 'certificate_dependencies',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Certificate work item delete removes successor dependency edges after route-level retention allows the delete.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/certificate-work-items.ts',
    line: 864,
    table: 'certificate_work_items',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Certificate work item entity delete is protected by the certificate_work_item retention route contract.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/certificate-work-items.ts',
    line: 917,
    table: 'certificate_dependencies',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Alternate certificate work item delete path removes dependencies after shared retention gating.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/certificate-work-items.ts',
    line: 920,
    table: 'certificate_work_items',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Alternate certificate work item entity delete is protected by shared retention gating.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/construction-drawings.ts',
    line: 1274,
    table: 'construction_drawings',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Construction drawing delete runs after route-level retention governance allows physical deletion.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/drawing-review-rules.ts',
    line: 377,
    table: 'drawing_review_rules',
    kind: 'sql_delete',
    bucket: 'config_soft_delete',
    reason: 'Drawing review rules are project-local configuration rows with editor authorization; no retired runtime object is restored.',
    liveVerification: false,
  },
  {
    file: 'server/src/routes/issues.ts',
    line: 644,
    table: 'deleteIssueInMainChain',
    kind: 'delete_helper_call',
    bucket: 'guarded_route',
    reason: 'Issue route calls enforceRetentionOrBlock before delegating to the main-chain delete helper.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/monthly-plans.ts',
    line: 886,
    table: 'monthly_plan_items',
    kind: 'supabase_delete',
    bucket: 'dynamic_delete_requires_callsite_allowlist',
    reason: 'Monthly plan replacement physically deletes draft/version rows and must stay explicitly classified until live rollback/audit evidence is closed.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/monthly-plans.ts',
    line: 887,
    table: 'monthly_plans',
    kind: 'supabase_delete',
    bucket: 'dynamic_delete_requires_callsite_allowlist',
    reason: 'Monthly plan version delete is a high-impact planning chain mutation that needs call-site allowlist and live evidence.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/monthly-plans.ts',
    line: 914,
    table: 'monthly_plan_items',
    kind: 'supabase_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Monthly plan draft item replacement deletes existing draft items before persisting the current item snapshot.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/participant-units.ts',
    line: 417,
    table: '<helper>',
    kind: 'legacy_supabase_helper_delete',
    bucket: 'guarded_route',
    reason: 'Participant unit route now calls executeRetention first; physical delete is only allowed for unreferenced units.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/pre-milestone-conditions.ts',
    line: 394,
    table: 'pre_milestone_conditions',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Pre-milestone condition route is covered by retention anti-bypass contracts.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/pre-milestone-dependencies.ts',
    line: 237,
    table: 'pre_milestone_dependencies',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Pre-milestone dependency route is covered by retention anti-bypass contracts.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/pre-milestones.ts',
    line: 1503,
    table: 'pre_milestones',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Pre-milestone delete checks retention before the physical delete mutation.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projects.ts',
    line: 993,
    table: 'deleteProject',
    kind: 'delete_helper_call',
    bucket: 'guarded_route',
    reason: 'Project delete is owner-only and is wrapped by enforceRetentionOrBlock before delegating to dbService.deleteProject.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 6733,
    table: 'task_baselines',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes generated draft baselines by recorded ids within the current project.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 6742,
    table: 'task_baselines',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes generated draft baselines by project-scoped generation batch metadata.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 6799,
    table: 'project_entity_links',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes only project-scoped acceptance-plan task links owned by the generation batch before deleting their parent rows.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 6830,
    table: 'project_entity_links',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes only project-scoped covers-task links for recorded generated acceptance plan ids.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 6842,
    table: 'project_entity_links',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes only project-scoped covers-task links for recorded generated task ids.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3619,
    table: 'acceptance_plans',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery deletes generated acceptance plans by recorded ids with same-batch notes fallback.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3629,
    table: 'acceptance_plans',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback deletes generated acceptance plans by recorded ids when no stale batch fallback is needed.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3638,
    table: 'acceptance_plans',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback deletes generated acceptance plans by generation-batch note marker when ids are unavailable.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3650,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes dependency edges by generated task id while carrying the recovery batch id.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3657,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes dependency edges by generated predecessor id while carrying the recovery batch id.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3664,
    table: 'tasks',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes generated task rows by recorded ids while carrying the recovery batch id.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3672,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes generated dependency edges by generated task id.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3678,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes dependency edges from generated predecessor tasks.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3684,
    table: 'tasks',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes generated tasks by recorded ids for the failed generation batch.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3693,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes dependency edges through camelCase batch metadata after id cleanup.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3705,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes predecessor edges through camelCase batch metadata after id cleanup.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3717,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes dependency edges through snake_case batch metadata after id cleanup.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3729,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes predecessor edges through snake_case batch metadata after id cleanup.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3741,
    table: 'tasks',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes generated tasks through camelCase batch metadata after id cleanup.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3747,
    table: 'tasks',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes generated tasks through snake_case batch metadata after id cleanup.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3755,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes generated dependency edges through camelCase batch metadata.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3767,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes generated predecessor edges through camelCase batch metadata.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3779,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes generated dependency edges through snake_case batch metadata.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3791,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes generated predecessor edges through snake_case batch metadata.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3803,
    table: 'tasks',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes generated tasks for the failed generation batch when recorded ids are unavailable.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3818,
    table: 'engineering_objects',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes generated engineering objects by recorded ids while carrying the recovery batch id.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3826,
    table: 'engineering_objects',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes generated engineering objects by recorded ids.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3835,
    table: 'engineering_objects',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes generated engineering objects through camelCase batch metadata after id cleanup.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3841,
    table: 'engineering_objects',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard stale recovery removes generated engineering objects through snake_case batch metadata after id cleanup.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 3849,
    table: 'engineering_objects',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard rollback removes generated engineering objects for the failed generation batch when recorded ids are unavailable.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/projectWizard.ts',
    line: 4612,
    table: 'projects',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Disposable wizard draft cleanup deletes only draft projects guarded by draft status and project permission checks.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/risks.ts',
    line: 356,
    table: 'deleteRisk',
    kind: 'delete_helper_call',
    bucket: 'guarded_route',
    reason: 'Risk route calls enforceRetentionOrBlock before delegating to dbService.deleteRisk.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/task-baselines.ts',
    line: 1784,
    table: 'task_baseline_items',
    kind: 'supabase_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Baseline draft item replacement deletes existing project-scoped items before persisting the current snapshot.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/task-baselines.ts',
    line: 1772,
    table: 'task_baseline_items',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Transactional baseline draft replacement deletes project-scoped items before persisting the current snapshot.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/task-baselines.ts',
    line: 1802,
    table: 'task_baseline_items',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Baseline draft rollback removes project-scoped items under the baseline advisory transaction lock.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/task-baselines.ts',
    line: 1808,
    table: 'task_baselines',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Baseline draft rollback removes only the project-scoped version while it remains in a draft status.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/task-conditions.ts',
    line: 436,
    table: 'task_preceding_relations',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Condition update removes stale preceding-task edges before rebuilding current dependency relations.',
    liveVerification: false,
  },
  {
    file: 'server/src/routes/task-conditions.ts',
    line: 444,
    table: 'task_preceding_relations',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Condition edge cleanup rawQuery fallback mirrors the fixed executeSQL cleanup.',
    liveVerification: false,
  },
  {
    file: 'server/src/routes/task-obstacles.ts',
    line: 719,
    table: 'delete_task_obstacle_with_source_backfill_atomic',
    kind: 'rpc_delete',
    bucket: 'guarded_route',
    reason: 'Task obstacle delete route runs retention governance before invoking the atomic delete/backfill RPC.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/tasks.ts',
    line: 2342,
    table: 'deleteTaskInMainChain',
    kind: 'delete_helper_call',
    bucket: 'guarded_route',
    reason: 'Bulk task delete path uses executeTaskDeleteRetention before invoking deleteTaskInMainChain.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/tasks.ts',
    line: 2896,
    table: 'deleteTaskInMainChain',
    kind: 'delete_helper_call',
    bucket: 'guarded_route',
    reason: 'Single task delete path uses executeTaskDeleteRetention before invoking deleteTaskInMainChain.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/wbs-templates.ts',
    line: 1860,
    table: 'wbs_template_nodes',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'China GB55032 seed re-import replaces the existing template node set before inserting the current governed seed structure.',
    liveVerification: false,
  },
  {
    file: 'server/src/routes/wbs-templates.ts',
    line: 2094,
    table: 'wbs_templates',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'WBS template delete runs ensureWbsTemplateEditable and enforceRetentionOrBlock before the project-scoped physical delete.',
    liveVerification: true,
  },
  {
    file: 'server/src/routes/wbs.ts',
    line: 449,
    table: 'deleteTaskInMainChain',
    kind: 'delete_helper_call',
    bucket: 'guarded_route',
    reason: 'WBS node delete calls executeRetention before invoking the task main-chain delete helper.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/acceptanceFlowService.ts',
    line: 813,
    table: 'acceptance_catalog',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Acceptance catalog service delete is only called by the guarded route package.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/acceptanceFlowService.ts',
    line: 895,
    table: 'acceptance_dependencies',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Acceptance dependency service delete is only called by the guarded route package.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/acceptanceFlowService.ts',
    line: 1017,
    table: 'acceptance_requirements',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Acceptance requirement service delete is only called by the guarded route package.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/acceptanceFlowService.ts',
    line: 1116,
    table: 'acceptance_records',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Acceptance record service delete is only called by the guarded route package.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/dataRetentionService.ts',
    line: 49,
    table: 'operation_logs',
    kind: 'sql_delete',
    bucket: 'retention_governance_executor',
    reason: 'Data retention service purges operation logs by retention window as its explicit executor responsibility.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/dataRetentionService.ts',
    line: 55,
    table: 'operation_logs',
    kind: 'sql_delete',
    bucket: 'retention_governance_executor',
    reason: 'Data retention service purges operation logs backup partitions by retention window.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/dbService.ts',
    line: 1833,
    table: '${step.table}',
    kind: 'sql_delete',
    bucket: 'dynamic_delete_requires_callsite_allowlist',
    reason: 'Transactional project cleanup deletes tables from a static cleanup step list; that table allowlist must stay reviewed.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/dbService.ts',
    line: 996,
    table: 'table',
    kind: 'dynamic_supabase_delete',
    bucket: 'dynamic_delete_requires_callsite_allowlist',
    reason: 'executeSQL DELETE parses table names from SQL and must remain covered by executeSQL guard plus delete classification guard.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/dbService.ts',
    line: 1760,
    table: 'projects',
    kind: 'supabase_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Project create rollback deletes the just-created project when owner membership insertion fails.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/dbService.ts',
    line: 1838,
    table: 'projects',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Transactional deleteProject removes the project after owner-only route authorization, retention governance, and scoped cleanup steps.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/dbService.ts',
    line: 2887,
    table: 'project_members',
    kind: 'supabase_delete',
    bucket: 'guarded_route',
    reason: 'Project member delete is a membership lifecycle route mutation with project scoping and authorization.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/dbService.ts',
    line: 3051,
    table: 'table',
    kind: 'dynamic_supabase_delete',
    bucket: 'dynamic_delete_requires_callsite_allowlist',
    reason: 'Generic SupabaseService.delete accepts a table name and must remain explicitly classified until all callers are narrowed.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/dbService.ts',
    line: 3285,
    table: 'issues',
    kind: 'supabase_delete',
    bucket: 'guarded_route',
    reason: 'Issue entity delete is reached from the route-level issue retention guard and still checks protected upgrade-chain records.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/dbService.ts',
    line: 3518,
    table: 'issues',
    kind: 'sql_delete',
    bucket: 'guarded_route',
    reason: 'Direct-runtime issue delete preserves the same route retention and protected upgrade-chain checks before the project-scoped physical delete.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/drawingCertificateLinkService.ts',
    line: 144,
    table: 'certificate_dependencies',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Drawing/certificate link sync removes stale predecessor dependency edges before rebuilding the current link set.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/drawingCertificateLinkService.ts',
    line: 171,
    table: 'certificate_dependencies',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Drawing/certificate unlink removes stale successor dependency edges for the current certificate work item.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/drawingCertificateLinkService.ts',
    line: 175,
    table: 'certificate_work_items',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Drawing/certificate unlink removes generated certificate work items owned by the drawing link surface.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/jobRuntime.ts',
    line: 148,
    table: 'job_failures',
    kind: 'sql_delete',
    bucket: 'retention_governance_executor',
    reason: 'Job runtime prunes failure history by retention horizon as an operational retention executor.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/projectCriticalPathService.ts',
    line: 2878,
    table: 'task_critical_overrides',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Critical path override delete removes a user override before recalculating the path projection.',
    liveVerification: false,
  },
  {
    file: 'server/src/services/projectCriticalPathService.ts',
    line: 2975,
    table: 'task_critical_overrides',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Critical path override reset removes a stale override and then refreshes projection state.',
    liveVerification: false,
  },
  {
    file: 'server/src/services/projectDailySnapshotService.ts',
    line: 642,
    table: 'metric_value_snapshots',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Transactional snapshot writer replaces the same project, date, caliber, and grouping metric rows before insertion.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/projectDailySnapshotService.ts',
    line: 428,
    table: 'metric_value_snapshots',
    kind: 'supabase_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Snapshot writer replaces the same project/date/caliber metric rows before inserting current snapshot values.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/algorithmSeedImportService.ts',
    line: 118,
    table: 'algorithm_seed_records',
    kind: 'supabase_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Algorithm seed batch import removes partially inserted records before surfacing a failed multi-batch write.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/algorithmSeedImportService.ts',
    line: 244,
    table: 'algorithm_seed_records',
    kind: 'supabase_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Algorithm seed import replaces draft seed records for an existing seed version before inserting current records.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/standardWorkDurationSeedPublicationService.ts',
    line: 283,
    table: 'algorithm_seed_records',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Standard work duration seed publication replaces records for the governed seed version and seed type.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/taskWriteChainService.ts',
    line: 1545,
    table: 'task_preceding_relations',
    kind: 'sql_delete',
    bucket: 'main_chain_integrity_cleanup',
    reason: 'Task main-chain delete removes predecessor relation edges for the task being deleted.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/wizardGenerationRecoveryService.ts',
    line: 101,
    table: 'task_baselines',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Transactional wizard recovery removes only project-scoped draft baselines owned by the failed generation batch.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/wizardGenerationRecoveryService.ts',
    line: 117,
    table: 'project_entity_links',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Transactional wizard recovery removes only project-scoped covers-task links by generated plan or task ids and failed-batch lineage before parent rows.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/wizardGenerationRecoveryService.ts',
    line: 70,
    table: 'acceptance_plans',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard generation recovery removes generated acceptance plans by failed batch.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/wizardGenerationRecoveryService.ts',
    line: 82,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard generation recovery removes generated dependency edges by batch.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/wizardGenerationRecoveryService.ts',
    line: 88,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard generation recovery removes generated dependency edges by generated task id.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/wizardGenerationRecoveryService.ts',
    line: 97,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard generation recovery removes generated dependency edges through task joins.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/wizardGenerationRecoveryService.ts',
    line: 112,
    table: 'task_dependencies',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard generation recovery removes generated dependency edges scoped to generated tasks.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/wizardGenerationRecoveryService.ts',
    line: 130,
    table: 'tasks',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard generation recovery removes tasks created by the failed generation batch.',
    liveVerification: true,
  },
  {
    file: 'server/src/services/wizardGenerationRecoveryService.ts',
    line: 148,
    table: 'engineering_objects',
    kind: 'sql_delete',
    bucket: 'internal_recovery_cleanup',
    reason: 'Wizard generation recovery removes engineering objects created by the failed generation batch.',
    liveVerification: true,
  },
  {
    file: 'server/src/scripts/diagnose-company-health-trend-live.ts',
    line: 338,
    table: 'project_daily_snapshot',
    kind: 'supabase_delete',
    bucket: 'diagnostic_live_cleanup',
    reason: 'C-18.L13 live diagnostic deletes disposable project_daily_snapshot rows created only for the max-rows trend probe.',
    liveVerification: true,
  },
  {
    file: 'server/src/scripts/diagnose-company-health-trend-live.ts',
    line: 349,
    table: 'projects',
    kind: 'supabase_delete',
    bucket: 'diagnostic_live_cleanup',
    reason: 'C-18.L13 live diagnostic deletes disposable projects created only for the synthetic trend probe cleanup.',
    liveVerification: true,
  },
  {
    file: 'server/src/scripts/diagnose-company-health-trend-live.ts',
    line: 359,
    table: 'companies',
    kind: 'supabase_delete',
    bucket: 'diagnostic_live_cleanup',
    reason: 'C-18.L13 live diagnostic deletes the disposable company created as the cleanup token for the trend probe.',
    liveVerification: true,
  },
  {
    file: 'server/src/scripts/diagnose-acceptance-status-concurrency-live.ts',
    line: 548,
    table: 'acceptance_plans',
    kind: 'sql_delete',
    bucket: 'diagnostic_live_cleanup',
    reason: 'C-18.L08 live diagnostic deletes only the disposable acceptance plan created with diagnostic markers.',
    liveVerification: true,
  },
  {
    file: 'server/src/scripts/diagnose-acceptance-status-concurrency-live.ts',
    line: 562,
    table: 'acceptance_plans',
    kind: 'sql_delete',
    bucket: 'diagnostic_live_cleanup',
    reason: 'C-18.L08 live diagnostic rawQuery fallback deletes only the same disposable acceptance plan scope.',
    liveVerification: true,
  },
  {
    file: 'server/src/scripts/diagnose-duration-canary-approval-live.ts',
    line: 162,
    table: 'duration_context_policy_canary_candidates',
    kind: 'supabase_delete',
    bucket: 'diagnostic_live_cleanup',
    reason: 'C-18.L06 live diagnostic removes the disposable duration canary candidate after the approval concurrency probe.',
    liveVerification: true,
  },
  {
    file: 'server/src/scripts/diagnose-spreadsheet-migration-live.ts',
    line: 509,
    table: 'wbs_template_nodes',
    kind: 'sql_delete',
    bucket: 'diagnostic_live_cleanup',
    reason: 'C-18.L15 live diagnostic deletes disposable imported WBS template nodes scoped by guarded template metadata.',
    liveVerification: true,
  },
  {
    file: 'server/src/scripts/diagnose-spreadsheet-migration-live.ts',
    line: 513,
    table: 'wbs_templates',
    kind: 'sql_delete',
    bucket: 'diagnostic_live_cleanup',
    reason: 'C-18.L15 live diagnostic deletes only the disposable imported WBS template after guarded node cleanup.',
    liveVerification: true,
  },
]

export const DELETE_MUTATION_BUCKETS = [
  'retention_governance_executor',
  'guarded_route',
  'lifecycle_deactivate',
  'config_soft_delete',
  'internal_recovery_cleanup',
  'main_chain_integrity_cleanup',
  'diagnostic_live_cleanup',
  'dynamic_delete_requires_callsite_allowlist',
]

function workspaceRoot() {
  const cwd = process.cwd()
  if (fs.existsSync(path.join(cwd, 'server', 'src'))) return cwd
  if (path.basename(cwd) === 'server' && fs.existsSync(path.join(cwd, 'src'))) return path.resolve(cwd, '..')
  return path.resolve(fileURLToPath(new URL('..', import.meta.url)), '..')
}

function toPosix(value) {
  return value.replace(/\\/g, '/')
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return []
  const files = []
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRS.has(entry.name)) continue
    const fullPath = path.join(rootDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (!entry.isFile()) continue
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue
    files.push(fullPath)
  }
  return files.sort()
}

function lineNumberForIndex(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length
}

function lineText(source, line) {
  return source.split(/\r?\n/)[line - 1]?.trim() ?? ''
}

function pushCandidate(candidates, candidate) {
  candidates.push({
    ...candidate,
    text: candidate.text.trim(),
  })
}

function collectSqlDeleteCandidates(source, file) {
  const candidates = []
  const pattern = /\bdelete\s+from\s+(?:public\.)?([A-Za-z_][A-Za-z0-9_]*|\$\{[^}]+\})/gi
  let match
  while ((match = pattern.exec(source)) !== null) {
    const line = lineNumberForIndex(source, match.index)
    pushCandidate(candidates, {
      file,
      line,
      kind: 'sql_delete',
      table: match[1],
      text: lineText(source, line),
    })
  }
  return candidates
}

function findFromDeleteCallEnd(source, fromIndex) {
  const deleteIndex = source.indexOf('.delete', fromIndex)
  if (deleteIndex < 0 || deleteIndex - fromIndex > 180) return -1
  const between = source.slice(fromIndex, deleteIndex)
  if (/\.(?:insert|update|upsert|select|rpc)\s*\(/.test(between)) return -1
  return deleteIndex
}

function collectSupabaseDeleteCandidates(source, file) {
  const candidates = []
  const clientExpression = String.raw`(?:(?:\((?:supabase|transactionClient|client)\s+as\s+any\))|\b(?:supabase|transactionClient|client))`
  const literalFromPattern = new RegExp(String.raw`${clientExpression}\s*\.\s*from\(\s*(['"])([^'"]+)\1\s*\)`, 'g')
  let match
  while ((match = literalFromPattern.exec(source)) !== null) {
    const deleteIndex = findFromDeleteCallEnd(source, match.index)
    if (deleteIndex < 0) continue
    const line = lineNumberForIndex(source, deleteIndex)
    pushCandidate(candidates, {
      file,
      line,
      kind: 'supabase_delete',
      table: match[2],
      text: lineText(source, line),
    })
  }

  const dynamicFromPattern = new RegExp(String.raw`${clientExpression}\s*\.\s*from\(\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*\)`, 'g')
  while ((match = dynamicFromPattern.exec(source)) !== null) {
    const deleteIndex = findFromDeleteCallEnd(source, match.index)
    if (deleteIndex < 0) continue
    const line = lineNumberForIndex(source, deleteIndex)
    pushCandidate(candidates, {
      file,
      line,
      kind: 'dynamic_supabase_delete',
      table: match[1],
      text: lineText(source, line),
    })
  }

  const helperPattern = /\bsupabase\.delete\s*\(/g
  while ((match = helperPattern.exec(source)) !== null) {
    const line = lineNumberForIndex(source, match.index)
    pushCandidate(candidates, {
      file,
      line,
      kind: 'legacy_supabase_helper_delete',
      table: '<helper>',
      text: lineText(source, line),
    })
  }

  return candidates
}

function collectDeleteHelperCandidates(source, file) {
  const candidates = []
  for (const name of ['deleteTaskInMainChain', 'deleteIssueInMainChain', 'deleteRisk', 'deleteProject', 'deleteNotification']) {
    const pattern = new RegExp(`\\b${name}\\s*\\(`, 'g')
    let match
    while ((match = pattern.exec(source)) !== null) {
      const prefix = source.slice(Math.max(0, match.index - 120), match.index)
      if (/\b(?:export\s+)?(?:async\s+)?function\s*$/.test(prefix)) continue
      if (/async\s+\w+\([^)]*\)\s*\{\s*return\s*$/.test(prefix)) continue
      const line = lineNumberForIndex(source, match.index)
      const text = lineText(source, line)
      if (new RegExp(`async\\s+${name}\\s*\\([^)]*\\)\\s*\\{\\s*return\\s+${name}\\s*\\(`).test(text)) continue
      pushCandidate(candidates, {
        file,
        line,
        kind: 'delete_helper_call',
        table: name,
        text,
      })
    }
  }
  return candidates
}

function collectRpcDeleteCandidates(source, file) {
  const candidates = []
  const pattern = /\.\s*rpc\s*\(\s*(['"])delete_task_obstacle_with_source_backfill_atomic\1/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    const line = lineNumberForIndex(source, match.index)
    pushCandidate(candidates, {
      file,
      line,
      kind: 'rpc_delete',
      table: 'delete_task_obstacle_with_source_backfill_atomic',
      text: lineText(source, line),
    })
  }
  return candidates
}

function dedupeCandidates(candidates) {
  const map = new Map()
  for (const candidate of candidates) {
    const key = `${candidate.file}:${candidate.line}:${candidate.kind}:${candidate.table}`
    if (!map.has(key)) map.set(key, candidate)
  }
  return [...map.values()].sort((a, b) =>
    a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind) || a.table.localeCompare(b.table),
  )
}

export function collectDeleteMutationCandidates(root = workspaceRoot()) {
  const scanRoots = [
    path.join(root, 'server', 'src', 'routes'),
    path.join(root, 'server', 'src', 'services'),
    path.join(root, 'server', 'src', 'jobs'),
    path.join(root, 'server', 'src', 'scripts'),
  ]

  const candidates = []
  for (const filePath of scanRoots.flatMap(walkFiles)) {
    const source = fs.readFileSync(filePath, 'utf8')
    const file = toPosix(path.relative(root, filePath))
    candidates.push(...collectSqlDeleteCandidates(source, file))
    candidates.push(...collectSupabaseDeleteCandidates(source, file))
    candidates.push(...collectDeleteHelperCandidates(source, file))
    candidates.push(...collectRpcDeleteCandidates(source, file))
  }

  return dedupeCandidates(candidates)
}

function structuralCallsiteKey(item) {
  return `${item.file}:${item.kind}:${item.table}`
}

function attachCallsiteOrdinals(items) {
  const counters = new Map()
  return [...items]
    .sort((a, b) =>
      a.file.localeCompare(b.file)
      || a.line - b.line
      || a.kind.localeCompare(b.kind)
      || a.table.localeCompare(b.table),
    )
    .map((item) => {
      const structuralKey = structuralCallsiteKey(item)
      const callsiteOrdinal = counters.get(structuralKey) ?? 0
      counters.set(structuralKey, callsiteOrdinal + 1)
      return { ...item, callsiteOrdinal }
    })
}

function classificationKey(item) {
  return `${structuralCallsiteKey(item)}:${item.callsiteOrdinal}`
}

export function auditDeleteMutationClassifications(
  root = workspaceRoot(),
  classifications = DELETE_MUTATION_CLASSIFICATIONS,
) {
  const candidates = collectDeleteMutationCandidates(root)
  const candidatesWithOrdinals = attachCallsiteOrdinals(candidates)
  const classificationsWithOrdinals = attachCallsiteOrdinals(classifications)
  const candidateKeys = new Set(candidatesWithOrdinals.map(classificationKey))
  const classificationKeys = new Set(classificationsWithOrdinals.map(classificationKey))

  const unclassifiedCandidates = candidatesWithOrdinals.filter((candidate) => !classificationKeys.has(classificationKey(candidate)))
  const staleClassifications = classificationsWithOrdinals.filter((classification) => !candidateKeys.has(classificationKey(classification)))
  const invalidClassifications = classifications.filter((classification) =>
    !DELETE_MUTATION_BUCKETS.includes(classification.bucket)
    || typeof classification.reason !== 'string'
    || classification.reason.trim().length < 20
    || typeof classification.liveVerification !== 'boolean',
  )

  const bucketCounts = classifications.reduce((acc, classification) => {
    acc[classification.bucket] = (acc[classification.bucket] ?? 0) + 1
    return acc
  }, {})

  return {
    status: unclassifiedCandidates.length === 0 && staleClassifications.length === 0 && invalidClassifications.length === 0 ? 'pass' : 'fail',
    scannedCandidateCount: candidates.length,
    classifiedCandidateCount: classifications.length,
    bucketCounts,
    liveVerificationCount: classifications.filter((classification) => classification.liveVerification).length,
    candidates: candidatesWithOrdinals,
    classifications,
    unclassifiedCandidates,
    staleClassifications,
    invalidClassifications,
  }
}

export function formatDeleteMutationClassificationFailure(result) {
  const lines = ['[delete-mutation-classification] Physical DELETE mutations must be explicitly classified.']
  if (result.unclassifiedCandidates?.length) {
    lines.push('Unclassified candidates:')
    for (const item of result.unclassifiedCandidates) {
      lines.push(`- ${item.file}:${item.line} ${item.kind} ${item.table} :: ${item.text}`)
    }
  }
  if (result.staleClassifications?.length) {
    lines.push('Stale classifications:')
    for (const item of result.staleClassifications) {
      lines.push(`- ${item.file}:${item.line} ${item.kind} ${item.table}`)
    }
  }
  if (result.invalidClassifications?.length) {
    lines.push('Invalid classifications:')
    for (const item of result.invalidClassifications) {
      lines.push(`- ${item.file}:${item.line} ${item.kind} ${item.table} bucket=${item.bucket}`)
    }
  }
  return lines.join('\n')
}

export function formatDeleteMutationClassificationSummary(result) {
  return [
    `[delete-mutation-classification] OK: ${result.classifiedCandidateCount} physical DELETE candidates classified.`,
    `[delete-mutation-classification] Buckets: ${JSON.stringify(result.bucketCounts)}`,
    `[delete-mutation-classification] Live verification retained for ${result.liveVerificationCount} candidates.`,
  ].join('\n')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = auditDeleteMutationClassifications()
  if (result.status !== 'pass') {
    console.error(formatDeleteMutationClassificationFailure(result))
    process.exit(1)
  }
  console.log(formatDeleteMutationClassificationSummary(result))
}
