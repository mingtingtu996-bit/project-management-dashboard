#!/usr/bin/env node

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const defaultReleaseDir = join(repoRoot, 'project-testing', 'reports', 'release-v1.4.24-20260702-125254')
const defaultMatrixFile = join(defaultReleaseDir, 'v14241-real-env-uat-staging-live-matrix.json')
const defaultOutputJson = join(defaultReleaseDir, 'v14241-real-env-matrix-execution-report.json')
const defaultOutputMd = join(defaultReleaseDir, 'v14241-real-env-matrix-execution-report.md')

const ATTEMPT_SUMMARY_FILES = {
  UAT: 'v14241-real-env-scenario-attempts-summary.uat.json',
  staging: 'v14241-real-env-scenario-attempts-summary.staging.full.json',
  'solo-live': 'v14241-real-env-scenario-attempts-summary.solo-live.json',
  live: 'v14241-real-env-scenario-attempts-summary.live.json',
}

const TIER_ENVIRONMENT_MARKERS = {
  UAT: ['uat'],
  staging: ['staging', 'stage'],
  'solo-live': ['solo-live', 'personal-live'],
  live: ['live', 'production', 'prod', 'current-live'],
}

const COMMON_MISSING_INPUTS = {
  UAT: [
    'UAT URL and deployed version',
    'named UAT tester accounts for required roles',
    'seed company/project ids',
    'recording/screenshot owner',
    'UAT artifact root and retention owner',
  ],
  staging: [
    'staging target approval ref for any write',
    'role-matrix auth token refs',
    'target company/project/baseline/publication ids',
    'cleanup owner and cleanup/readback plan',
    'scenario-specific evidence artifact root',
  ],
  'solo-live': [
    'non-local personal base URL',
    'deployment ref',
    'self-approval ref',
    'rollback owner and rollback plan',
    'monitoring owner and monitoring plan',
    'API/UI smoke evidence refs',
    'scenario-specific evidence artifact root',
  ],
  live: [
    'live handoff declaration for this 16-scenario matrix',
    'approval ref for any disposable live write or negative test',
    'rollback owner',
    'monitoring owner',
    'retention path',
    'production mutation boundary and cleanup/readback plan',
  ],
}

const ENV_FILE_REQUIREMENTS = {
  staging: [
    'API_BASE_URL',
    'CLIENT_BASE_URL',
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DATABASE_URL',
    'DIRECT_DATABASE_URL',
    'TEST_USER_EMAIL',
    'TEST_USER_PASSWORD',
    'TEST_COMPANY_NAME',
    'TEST_PROJECT_NAME',
  ],
  live: [
    'LIVE_BASE_URL',
    'PRODUCTION_BASE_URL',
    'LIVE_HANDOFF_REF',
    'LIVE_APPROVAL_REF',
    'LIVE_ROLLBACK_OWNER',
    'LIVE_MONITORING_OWNER',
  ],
}

const SUPPORT_MAP = {
  'REAL-UAT-01': [
    {
      classification: 'real_uat01_company_create_switch_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat01-company-create-switch.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-01 attempt. A blocked/missing-handoff result is recorded as an attempted run, but it does not close UAT, staging, solo-live, or live unless the full company-create/switch evidence contract passes with audit and cleanup/readback evidence.',
    },
    {
      classification: 'local_support_passed',
      artifacts: ['project-testing/artifacts/browser-checks/workspace-company-create-switch/workspace-company-create-switch-browser-check.json'],
      statusPath: ['status'],
      passStatuses: ['passed', 'pass'],
      closesRealEnvironmentTier: false,
      note: 'Local browser regression for company-create switch; it is not UAT/staging/solo-live/live evidence.',
    },
  ],
  'REAL-UAT-02': [
    {
      classification: 'real_uat02_invite_join_role_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat02-invite-join-role.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-02 attempt. A blocked/missing-handoff result is recorded as an attempted invite/join/role run, but it cannot close UAT, staging, solo-live, or live without the main invite/join artifact, member-role readback, audit readback, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'local_browser_invite_join_role_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat02-local-browser-support.json'],
      statusPath: ['status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Local mock-API browser replay supports invite/join/team-role UI health; it does not create a real invitation, accept it with real accounts, read back membership/roles, capture audit, or clean up data in UAT/staging/solo-live/live.',
    },
  ],
  'REAL-UAT-03': [
    {
      classification: 'real_uat03_rls_role_matrix_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat03-rls-role-matrix.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-03 attempt. A blocked/missing-handoff result is recorded as an attempted role/RLS matrix run, but it cannot close UAT, staging, solo-live, or live without role-matrix evidence, cross-tenant negative readback, cleanup readback, and scenario metadata.',
    },
    {
      classification: 'real_env_readonly_isolation_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-readonly-support-probes.json'],
      statusPath: ['scenarioResults', 'REAL-UAT-03', 'status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Read-only auth and random-project negative checks support isolation review; they do not replace full role/RLS matrix evidence with target tenant refs and cleanup/readback.',
    },
    {
      classification: 'strict_local_readonly_isolation_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-readonly-support-probes.strict-auth-local.json'],
      statusPath: ['scenarioResults', 'REAL-UAT-03', 'status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Strict-auth local read-only auth and random-project negative checks support isolation review; still not deployed staging/live or full role/RLS matrix evidence.',
    },
    {
      classification: 'supported_by_closeout_handoff_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/c15-live-learning-closeout-evidence-validation.json'],
      statusPath: ['status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'C15 tenant-isolation readback supports isolation risk, but does not execute the full cross-company/project UAT matrix.',
    },
    {
      classification: 'supporting_release_artifact_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/tenant-access-matrix.json', 'project-testing/reports/release-v1.4.24-20260702-125254/rls-role-matrix.json'],
      closesRealEnvironmentTier: false,
      note: 'Existing tenant/RLS reports can support security review only when present; they do not replace scenario replay.',
    },
  ],
  'REAL-UAT-04': [
    {
      classification: 'real_uat04_wbs_baseline_publication_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat04-wbs-baseline-publication.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-04 attempt. A blocked/missing-handoff result is recorded as an attempted WBS/baseline/publication/rollback run, but it cannot close UAT, staging, solo-live, or live without WBS/baseline publication evidence, runtime publication readback, rollback verification, and scenario metadata.',
    },
    {
      classification: 'supported_by_closeout_handoff_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/c19-runtime-publication-release-rollback-evidence-validation.json'],
      statusPath: ['status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'C19 validates runtime publication/rollback closeout, not the full project creation -> WBS -> baseline customer journey.',
    },
  ],
  'REAL-UAT-05': [
    {
      classification: 'real_uat05_gantt_critical_path_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat05-gantt-critical-path.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-05 attempt. A blocked/missing-handoff result is recorded as an attempted Gantt/critical-path run, but it cannot close UAT, staging, solo-live, or live without Gantt edit/dependency/conflict trace, critical-path readback, performance p95, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'supported_by_closeout_handoff_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/c18-l07-l15-live-diagnostics-evidence-validation.json'],
      statusPath: ['status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'C18 includes critical-path/concurrency/pressure support, but the Gantt edit customer journey still needs scenario replay.',
    },
  ],
  'REAL-UAT-06': [
    {
      classification: 'real_uat06_plan_state_machine_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat06-plan-state-machine.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-06 attempt. A blocked/missing-handoff result is recorded as an attempted monthly-plan state-machine run, but it cannot close UAT, staging, solo-live, or live without state-machine replay, draft-lock readback, approval audit, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'real_uat06_planning_readonly_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat06-planning-readonly.json'],
      statusPath: ['status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Read-only planning surface probe supports month-plan/baseline/closeout triage; it does not execute draft creation, concurrent edit, approval, confirm/publish, revision rollback, closeout readback, or audit evidence.',
    },
  ],
  'REAL-UAT-07': [
    {
      classification: 'real_uat07_document_chain_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat07-document-chain.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-07 attempt. A blocked/missing-handoff result is recorded as an attempted document-chain run, but it cannot close UAT, staging, solo-live, or live without document chain, file-permission, retention/delete, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'supported_by_closeout_handoff_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/c18-l08-acceptance-status-concurrency-live.json'],
      statusPath: ['status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'Acceptance-status concurrency supports one slice; drawings/licenses/document-to-task responsibility chain remains unexecuted.',
    },
  ],
  'REAL-UAT-08': [
    {
      classification: 'real_uat08_business_loop_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat08-business-loop.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-08 attempt. A blocked/missing-handoff result is recorded as an attempted materials/risk/issue/todo/notification run, but it cannot close UAT, staging, solo-live, or live without responsibility-chain, notification, audit, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'supported_by_closeout_handoff_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/c18-l11-warning-sync-query-log.json'],
      statusPath: ['status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'Warning sync supports part of the risk/notification chain, not the full materials/risk/todo/notification loop.',
    },
  ],
  'REAL-UAT-09': [
    {
      classification: 'real_uat09_bi_ssot_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat09-bi-ssot.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-09 attempt. A blocked/missing-handoff result is recorded as an attempted BI SSOT run, but it cannot close UAT, staging, solo-live, or live without Dashboard/CompanyCockpit/Reports evidence, snapshot lineage, metric registry readback, export sample, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'real_uat09_bi_ssot_readonly_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat09-bi-ssot-readonly.json'],
      statusPath: ['status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Read-only API probe for Dashboard/CompanyCockpit/Reports SSOT surfaces; support-only because it has no browser trace, export sample, cleanup/readback, or deployed staging/live handoff.',
    },
    {
      classification: 'supported_by_closeout_handoff_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/c18-l14-company-summary-pressure.json'],
      statusPath: ['routeEvidenceAssessment', 'status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'Company summary pressure supports one BI surface; Dashboard/CompanyCockpit/Reports SSOT still needs cross-page scenario evidence.',
    },
  ],
  'REAL-UAT-10': [
    {
      classification: 'real_uat10_import_export_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat10-import-export.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-10 attempt. A blocked/missing-handoff result is recorded as an attempted import/export run, but it cannot close UAT, staging, solo-live, or live without import file set, PDF/XLSX export validation, permission-negative, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'supported_by_closeout_handoff_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/c18-l15-spreadsheet-migration-replay.json'],
      statusPath: ['status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'Spreadsheet import/migration replay supports import resilience; PDF/XLSX export, reader validation, and permission negatives remain scenario work.',
    },
  ],
  'REAL-UAT-11': [
    {
      classification: 'real_uat11_performance_pressure_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat11-performance-pressure.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-11 attempt. A blocked/missing-handoff result is recorded as an attempted capacity/performance run, but it cannot close UAT, staging, solo-live, or live without load-window, p95/p99, DB query-log, browser trace, hot-spot protection, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'real_env_readonly_performance_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-readonly-support-probes.json'],
      statusPath: ['scenarioResults', 'REAL-UAT-11', 'status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Read-only endpoint latency probes support performance triage; they do not replace DB query logs, browser trace, pressure artifacts, or hot-spot protection evidence.',
    },
    {
      classification: 'strict_local_readonly_performance_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-readonly-support-probes.strict-auth-local.json'],
      statusPath: ['scenarioResults', 'REAL-UAT-11', 'status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Strict-auth local endpoint latency probes support performance triage; still not DB query logs, browser trace, pressure artifacts, or deployed staging/live evidence.',
    },
    {
      classification: 'supported_by_closeout_handoff_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/c18-l07-l15-live-diagnostics-evidence-validation.json'],
      statusPath: ['status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'C18 pressure and query-log evidence supports capacity assessment, not the full customer load matrix.',
    },
    {
      classification: 'supporting_release_artifact_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/performance-pressure-evidence.json'],
      statusPath: ['routeEvidenceAssessment', 'status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'Performance artifact is supporting evidence until mapped to the scenario evidence contract.',
    },
  ],
  'REAL-UAT-12': [
    {
      classification: 'real_uat12_security_negative_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat12-security-negative.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-12 attempt. A blocked/missing-handoff result is recorded as an attempted security-negative run, but it cannot close UAT, staging, solo-live, or live without XSS/CSRF/SSRF/rate-limit/malicious-file/header/advisor evidence, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'real_env_readonly_security_negative_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-readonly-support-probes.json'],
      statusPath: ['scenarioResults', 'REAL-UAT-12', 'status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Read-only auth rejection, header, and invalid metric checks support security review; they do not replace XSS/CSRF/SSRF/rate-limit/malicious-file/Advisor evidence.',
    },
    {
      classification: 'strict_local_readonly_security_negative_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-readonly-support-probes.strict-auth-local.json'],
      statusPath: ['scenarioResults', 'REAL-UAT-12', 'status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Strict-auth local auth rejection, header, and invalid metric checks support security review; still not XSS/CSRF/SSRF/rate-limit/malicious-file/Advisor evidence.',
    },
    {
      classification: 'supporting_release_artifact_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/secret-leak-scan-summary.json', 'project-testing/reports/release-v1.4.24-20260702-125254/supabase-db-advisors-evidence.json'],
      closesRealEnvironmentTier: false,
      note: 'Secret/advisor evidence supports security review, but does not run XSS/CSRF/SSRF/rate-limit/malicious-file negatives.',
    },
  ],
  'REAL-UAT-13': [
    {
      classification: 'real_uat13_release_rollback_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat13-release-rollback.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-13 attempt. A blocked/missing-handoff result is recorded as an attempted release/rollback run, but it cannot close UAT, staging, solo-live, or live without healthcheck, release approval, frontend rollback, DB rollback/no-op, monitoring, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'supported_by_closeout_handoff_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/c19-runtime-publication-release-rollback-evidence-validation.json'],
      statusPath: ['status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'C19 supports runtime publication rollback; frontend deploy rollback and release-window UAT remain unexecuted.',
    },
    {
      classification: 'supporting_release_artifact_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/rollback-readiness.json'],
      closesRealEnvironmentTier: false,
      note: 'Rollback readiness is support evidence, not a release drill pass by itself.',
    },
  ],
  'REAL-UAT-14': [
    {
      classification: 'real_uat14_backup_migration_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat14-backup-migration.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-14 attempt. A blocked/missing-handoff result is recorded as an attempted backup/restore/migration run, but it cannot close UAT, staging, solo-live, or live without restore drill, schema drift, migration governance, old-object disposition, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'supported_by_closeout_handoff_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/old-object-physical-drop-closeout-evidence-validation.json'],
      statusPath: ['status'],
      passStatuses: ['pass'],
      closesRealEnvironmentTier: false,
      note: 'Old-object no-safe-candidate closeout supports old object disposition; backup/restore and schema-drift UAT still need evidence.',
    },
    {
      classification: 'supporting_release_artifact_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/production-migration-governance-report.json'],
      statusPath: ['status'],
      passStatuses: ['closed', 'pass'],
      closesRealEnvironmentTier: false,
      note: 'Migration governance report supports DB readiness only when present and current.',
    },
  ],
  'REAL-UAT-15': [
    {
      classification: 'real_uat15_observability_incident_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat15-observability-incident.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-15 attempt. A blocked/missing-handoff result is recorded as an attempted observability/incident drill, but it cannot close UAT, staging, solo-live, or live without alert delivery proof, on-call response, runbook execution, incident review, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'supporting_release_artifact_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/business-continuity-status.json'],
      closesRealEnvironmentTier: false,
      note: 'Business-continuity status supports planning; alert delivery, on-call response, and incident review still need a drill.',
    },
  ],
  'REAL-UAT-16': [
    {
      classification: 'real_uat16_support_ops_execution_attempt',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-uat16-support-ops.execution.json'],
      statusPath: ['status'],
      passStatuses: ['passed'],
      closesRealEnvironmentTier: false,
      note: 'Executable REAL-UAT-16 attempt. A blocked/missing-handoff result is recorded as an attempted admin/support/audit/data-compensation run, but it cannot close UAT, staging, solo-live, or live without ticket, support audit, before/after compensation proof, cleanup/readback, and scenario metadata.',
    },
    {
      classification: 'real_env_readonly_support_ops_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-readonly-support-probes.json'],
      statusPath: ['scenarioResults', 'REAL-UAT-16', 'status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Read-only health, readiness, notification diagnostics, and retention diagnostics support ops review; they do not execute admin repair, support audit, or data compensation workflows.',
    },
    {
      classification: 'strict_local_readonly_support_ops_support',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/v14241-real-env-readonly-support-probes.strict-auth-local.json'],
      statusPath: ['scenarioResults', 'REAL-UAT-16', 'status'],
      passStatuses: ['support_passed'],
      closesRealEnvironmentTier: false,
      note: 'Strict-auth local health, readiness, notification diagnostics, and retention diagnostics support ops review; it still does not execute admin repair, support audit, or data compensation workflows.',
    },
    {
      classification: 'supporting_release_artifact_only',
      artifacts: ['project-testing/reports/release-v1.4.24-20260702-125254/runtime-login-role-readback.json'],
      closesRealEnvironmentTier: false,
      note: 'Runtime login role readback supports ops diagnosis only; admin/support/audit/data compensation workflow remains unexecuted.',
    },
  ],
}

function argValue(name, fallback) {
  const index = process.argv.indexOf(name)
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}

function rel(path) {
  const relativePath = relative(repoRoot, path)
  return relativePath.startsWith('..') ? path.replace(/\\/g, '/') : relativePath.replace(/\\/g, '/')
}

async function readJsonIfPresent(path, fallback = null) {
  if (!existsSync(path)) return fallback
  return JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''))
}

async function readTextIfPresent(path, fallback = '') {
  if (!existsSync(path)) return fallback
  return (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
}

async function listFiles(root) {
  if (!existsSync(root)) return []
  const rootStat = await stat(root)
  if (!rootStat.isDirectory()) return []
  const entries = []
  async function walk(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const absolute = join(dir, item.name)
      if (item.isDirectory()) {
        await walk(absolute)
      } else if (item.isFile()) {
        entries.push(absolute)
      }
    }
  }
  await walk(root)
  return entries
}

function pathSegments(path) {
  return path.split(/[\\/]+/).filter(Boolean)
}

function wildcardToRegex(pattern) {
  const escaped = pathSegments(pattern)
    .join('/')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
  return new RegExp(`(^|/)${escaped}$`)
}

function getByPath(value, path = []) {
  let current = value
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return undefined
    current = current[key]
  }
  return current
}

function isUsableEnvValue(value) {
  if (!value) return false
  const normalized = value.trim()
  if (!normalized) return false
  if (/^<.*>$/.test(normalized)) return false
  if (/^(placeholder|changeme|todo|tbd)$/i.test(normalized)) return false
  if (/^(example|sample|dummy)$/i.test(normalized)) return false
  return true
}

function containsRejectMarker(text, markers) {
  return markers.filter((marker) => text.includes(marker))
}

function environmentMatchesTier(environment, tierName) {
  if (!environment) return false
  const normalized = String(environment).toLowerCase()
  return (TIER_ENVIRONMENT_MARKERS[tierName] ?? []).some((marker) => normalized.includes(marker))
}

function artifactMatchesRequirement(relativeFiles, requirement) {
  const normalizedRequirement = pathSegments(requirement).join('/')
  if (!normalizedRequirement.includes('*')) {
    return relativeFiles.filter((file) => file === normalizedRequirement || file.endsWith(`/${normalizedRequirement}`))
  }
  const regex = wildcardToRegex(normalizedRequirement)
  return relativeFiles.filter((file) => regex.test(file))
}

async function evaluateScenarioEvidenceForTier({ scenario, tierName, evidenceRoot, allFiles }) {
  const relativeFiles = allFiles.map((file) => relative(evidenceRoot, file).replace(/\\/g, '/'))
  const requiredArtifacts = scenario.evidenceContract?.requiredArtifacts ?? []
  const requiredMetadata = scenario.evidenceContract?.requiredMetadata ?? []
  const rejectIf = scenario.evidenceContract?.rejectIf ?? []
  const artifactMatches = requiredArtifacts.map((artifact) => ({
    artifact,
    matches: artifactMatchesRequirement(relativeFiles, artifact),
  }))
  const missingArtifacts = artifactMatches.filter((item) => item.matches.length === 0).map((item) => item.artifact)

  if (missingArtifacts.length > 0) {
    return {
      contractSatisfied: false,
      status: 'blocked_missing_real_handoff_inputs',
      artifactMatches,
      missingArtifacts,
      missingMetadata: requiredMetadata,
      rejectMarkersMatched: [],
      environmentEvidence: [],
      reason: 'Scenario evidence artifacts are missing for this tier.',
    }
  }

  const jsonMatches = artifactMatches
    .flatMap((item) => item.matches)
    .filter((file) => file.toLowerCase().endsWith('.json'))
  const environmentEvidence = []
  const metadataPresent = new Set()
  const rejectMarkersMatched = new Set()

  for (const match of jsonMatches) {
    const absolute = join(evidenceRoot, ...pathSegments(match))
    const text = await readTextIfPresent(absolute)
    for (const marker of containsRejectMarker(text, rejectIf)) {
      rejectMarkersMatched.add(marker)
    }
    const doc = await readJsonIfPresent(absolute, null)
    if (!doc || typeof doc !== 'object') continue
    const env = doc.environment ?? doc.env ?? doc.targetEnvironment ?? null
    environmentEvidence.push({
      artifact: rel(absolute),
      environment: env,
      tierMatch: environmentMatchesTier(env, tierName),
    })
    for (const key of requiredMetadata) {
      if (getByPath(doc, key.split('.')) !== undefined) {
        metadataPresent.add(key)
      }
    }
  }

  const missingMetadata = requiredMetadata.filter((key) => !metadataPresent.has(key))
  const hasTierEnvironment = environmentEvidence.length === 0
    ? false
    : environmentEvidence.some((item) => item.tierMatch)
  const contractSatisfied = missingMetadata.length === 0 && rejectMarkersMatched.size === 0 && hasTierEnvironment

  return {
    contractSatisfied,
    status: contractSatisfied ? 'passed' : 'blocked_missing_real_handoff_inputs',
    artifactMatches,
    missingArtifacts,
    missingMetadata,
    rejectMarkersMatched: [...rejectMarkersMatched],
    environmentEvidence,
    reason: contractSatisfied
      ? 'Required scenario artifacts, metadata, tier environment marker, and reject-marker checks passed.'
      : 'Artifacts exist but metadata, environment, or reject-marker checks do not satisfy the real scenario contract.',
  }
}

async function parseEnvFile(path) {
  if (!existsSync(path)) return { path: rel(path), exists: false, keys: [], nonEmptyKeys: [] }
  const text = await readTextIfPresent(path)
  const keys = []
  const nonEmptyKeys = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const [key, ...rest] = line.split('=')
    const name = key.trim()
    const value = rest.join('=').trim()
    keys.push(name)
    if (isUsableEnvValue(value)) {
      nonEmptyKeys.push(name)
    }
  }
  return { path: rel(path), exists: true, keys, nonEmptyKeys }
}

function summarizeEnvReadiness(envFiles) {
  const allNonEmpty = new Set(envFiles.flatMap((item) => item.nonEmptyKeys))
  const byTier = {}
  for (const [tier, required] of Object.entries(ENV_FILE_REQUIREMENTS)) {
    byTier[tier] = {
      requiredKeys: required,
      presentNonEmptyKeys: required.filter((key) => allNonEmpty.has(key)),
      missingKeys: required.filter((key) => !allNonEmpty.has(key)),
    }
  }
  return byTier
}

async function evaluateSupportEvidence({ scenarioId, releaseDir }) {
  const supportDefs = SUPPORT_MAP[scenarioId] ?? []
  const items = []
  for (const support of supportDefs) {
    const artifacts = []
    for (const artifact of support.artifacts) {
      const releasePrefix = 'project-testing/reports/release-v1.4.24-20260702-125254/'
      const absolute = artifact.startsWith(releasePrefix)
        ? join(releaseDir, artifact.slice(releasePrefix.length))
        : resolve(repoRoot, artifact)
      const artifactDoc = await readJsonIfPresent(absolute, null)
      const statusValue = support.statusPath ? getByPath(artifactDoc, support.statusPath) : artifactDoc?.status
      artifacts.push({
        path: rel(absolute),
        present: existsSync(absolute),
        status: statusValue ?? null,
      })
    }
    const presentArtifacts = artifacts.filter((artifact) => artifact.present)
    const statusOk = support.passStatuses
      ? artifacts.some((artifact) => support.passStatuses.includes(String(artifact.status)))
      : presentArtifacts.length > 0
    if (presentArtifacts.length === 0) continue
    items.push({
      classification: support.classification,
      status: statusOk ? support.classification : 'support_artifact_present_not_passing',
      closesRealEnvironmentTier: support.closesRealEnvironmentTier,
      artifacts,
      note: support.note,
      releaseDir: rel(releaseDir),
    })
  }
  return items
}

function missingInputsForTier({ tierName, tierRequiredInputs, envReadiness }) {
  const common = COMMON_MISSING_INPUTS[tierName] ?? []
  if (tierName !== 'staging' && tierName !== 'live') {
    return [...new Set([...common, ...(tierRequiredInputs ?? [])])]
  }
  const envMissing = envReadiness[tierName]?.missingKeys?.map((key) => `env key ${key}`) ?? []
  return [...new Set([...common, ...(tierRequiredInputs ?? []), ...envMissing])]
}

function reportStatusFromScenarioResults(results) {
  const passedTierCount = results.flatMap((item) => item.tiers).filter((tier) => tier.status === 'passed').length
  const totalTierCount = results.reduce((count, item) => count + item.tiers.length, 0)
  const supportedScenarioCount = results.filter((item) => item.supportingEvidence.length > 0).length
  if (passedTierCount === totalTierCount && totalTierCount > 0) return 'real_env_matrix_passed'
  if (passedTierCount > 0) return 'real_env_matrix_partially_executed_with_blockers'
  if (supportedScenarioCount > 0) return 'real_env_matrix_not_executed_support_only'
  return 'real_env_matrix_blocked_missing_real_environment_inputs'
}

async function readTierAttemptSummaries(releaseDir) {
  const entries = []
  for (const [tier, fileName] of Object.entries(ATTEMPT_SUMMARY_FILES)) {
    const path = join(releaseDir, fileName)
    const summary = await readJsonIfPresent(path, null)
    if (!summary) continue
    for (const result of summary.results ?? []) {
      entries.push({
        tier,
        scenarioId: result.scenarioId,
        status: result.status,
        commandsExecuted: result.commandsExecuted ?? 0,
        canCloseScenarioTier: result.canCloseScenarioTier === true,
        output: result.output ?? null,
        summaryPath: rel(path),
      })
    }
  }
  return new Map(entries.map((entry) => [`${entry.tier}:${entry.scenarioId}`, entry]))
}

export async function buildExecutionReport({
  matrixFile = defaultMatrixFile,
  releaseDir = defaultReleaseDir,
  evidenceRoot = releaseDir,
  envFilePaths = [join(repoRoot, 'deploy', 'env', 'staging.env'), join(repoRoot, 'deploy', 'env', 'server.production.env')],
  now = new Date(),
} = {}) {
  const absoluteReleaseDir = resolve(releaseDir)
  const absoluteEvidenceRoot = resolve(evidenceRoot)
  const matrix = await readJsonIfPresent(resolve(matrixFile), null)
  if (!matrix) {
    throw new Error(`Matrix file not found or invalid: ${matrixFile}`)
  }

  const allFiles = await listFiles(absoluteEvidenceRoot)
  const envFiles = []
  for (const path of envFilePaths.map((item) => resolve(item))) {
    envFiles.push(await parseEnvFile(path))
  }
  const envReadiness = summarizeEnvReadiness(envFiles)
  const handoffReadiness = await readJsonIfPresent(join(absoluteReleaseDir, 'handoff-readiness.json'), null)
  const realEnvHandoffReadiness = await readJsonIfPresent(join(absoluteReleaseDir, 'v14241-real-env-handoff-readiness.json'), null)
  const stagingPreflight = await readJsonIfPresent(join(absoluteReleaseDir, 'v14241-staging-connectivity-preflight.json'), null)
  const closeoutDecision = await readJsonIfPresent(join(absoluteReleaseDir, 'closeout-decision.json'), null)
  const attemptSummaries = await readTierAttemptSummaries(absoluteReleaseDir)

  const scenarioResults = []
  for (const scenario of matrix.scenarios ?? []) {
    const tierResults = []
    for (const tier of scenario.tiers ?? []) {
      const evidence = await evaluateScenarioEvidenceForTier({
        scenario,
        tierName: tier.name,
          evidenceRoot: absoluteEvidenceRoot,
          allFiles,
        })
      const attempt = attemptSummaries.get(`${tier.name}:${scenario.id}`)
      const attemptPassed = attempt?.status === 'passed' && attempt.canCloseScenarioTier
      const tierPassed = attemptPassed || evidence.contractSatisfied
      tierResults.push({
        name: tier.name,
        status: tierPassed ? 'passed' : evidence.status,
        mayClaimPass: tierPassed,
        missingInputs: tierPassed
          ? []
          : missingInputsForTier({
              tierName: tier.name,
              tierRequiredInputs: tier.requiredInputs,
              envReadiness,
            }),
        missingArtifacts: tierPassed ? [] : evidence.missingArtifacts,
        missingMetadata: tierPassed ? [] : evidence.missingMetadata,
        rejectMarkersMatched: tierPassed ? [] : evidence.rejectMarkersMatched,
        environmentEvidence: evidence.environmentEvidence,
        attemptSummary: attempt ?? null,
        reason: attemptPassed
          ? 'Tier closed by current real-environment scenario attempt summary with canCloseScenarioTier=true.'
          : evidence.reason,
      })
    }
    const supportingEvidence = await evaluateSupportEvidence({ scenarioId: scenario.id, releaseDir: absoluteReleaseDir })
    if (stagingPreflight?.status === 'pass' && (stagingPreflight.canSupportScenarioIds ?? []).includes(scenario.id)) {
      supportingEvidence.push({
        classification: 'staging_connectivity_preflight_passed',
        status: 'staging_connectivity_preflight_passed',
        closesRealEnvironmentTier: false,
        artifacts: [
          {
            path: rel(join(absoluteReleaseDir, 'v14241-staging-connectivity-preflight.json')),
            present: true,
            status: stagingPreflight.status,
          },
        ],
        note: stagingPreflight.targetClass === 'local_runtime_with_staging_env_refs'
          ? 'Client/API/login/workspace preflight passed against local runtime using staging env refs; support-only, not deployed staging or scenario evidence.'
          : 'Client/API/login/workspace preflight passed against configured staging target; support-only, not scenario evidence.',
      })
    }
    const passCount = tierResults.filter((tier) => tier.status === 'passed').length
    scenarioResults.push({
      id: scenario.id,
      title: scenario.title,
      priority: scenario.priority,
      status: passCount === tierResults.length && tierResults.length > 0
        ? 'passed'
        : supportingEvidence.length > 0
          ? 'blocked_missing_real_handoff_inputs_with_supporting_evidence_only'
          : 'blocked_missing_real_handoff_inputs',
      realEnvironmentPass: passCount === tierResults.length && tierResults.length > 0,
      passedTierCount: passCount,
      totalTierCount: tierResults.length,
      tiers: tierResults,
      supportingEvidence,
      conclusion: passCount === tierResults.length && tierResults.length > 0
        ? 'Scenario evidence contract is satisfied for all tiers.'
        : 'Do not claim real-customer coverage for this scenario until UAT/staging/solo-live/live evidence artifacts satisfy the scenario contract.',
    })
  }

  const reportStatus = reportStatusFromScenarioResults(scenarioResults)
  const summary = {
    scenarioCount: scenarioResults.length,
    tierCount: scenarioResults.reduce((count, item) => count + item.totalTierCount, 0),
    passedTierCount: scenarioResults.reduce((count, item) => count + item.passedTierCount, 0),
    fullyPassedScenarioCount: scenarioResults.filter((item) => item.realEnvironmentPass).length,
    blockedScenarioCount: scenarioResults.filter((item) => !item.realEnvironmentPass).length,
    supportOnlyScenarioCount: scenarioResults.filter((item) => item.supportingEvidence.length > 0 && !item.realEnvironmentPass).length,
    byScenarioStatus: scenarioResults.reduce((counts, item) => {
      counts[item.status] = (counts[item.status] ?? 0) + 1
      return counts
    }, {}),
    byTierStatus: scenarioResults.flatMap((item) => item.tiers).reduce((counts, item) => {
      counts[item.status] = (counts[item.status] ?? 0) + 1
      return counts
    }, {}),
  }

  return {
    schemaVersion: 'workbuddy/v14241-real-env-matrix-execution-report/v1',
    generatedAt: now.toISOString(),
    status: reportStatus,
    releaseDir: rel(absoluteReleaseDir),
    matrixFile: rel(resolve(matrixFile)),
    evidenceRoot: rel(absoluteEvidenceRoot),
    boundary: {
      passRequiresScenarioEvidenceContract: true,
      localBrowserEvidenceIsSupportOnly: true,
      soloLiveEvidenceClosesPersonalReadinessOnly: true,
      closeoutHandoffEvidenceIsSupportOnlyForThisMatrix: true,
      dryRunIsPlanningOnly: true,
      liveDbWritesNotExecutedByThisRunner: true,
    },
    sourceMatrixStatus: matrix.status ?? null,
    releaseDecision: matrix.sourceReleaseDecision ?? null,
    handoffReadiness: handoffReadiness
      ? {
          status: handoffReadiness.status,
          readyToRun: handoffReadiness.readyToRun,
          gateCount: handoffReadiness.gateCount,
          readyGateCount: handoffReadiness.readyGateCount,
          scopeBoundary: 'Existing handoff readiness covers the selected closeout/live/db gates only, not the full 16-scenario customer UAT matrix.',
        }
      : null,
    realEnvHandoffReadiness: realEnvHandoffReadiness
      ? {
          status: realEnvHandoffReadiness.status,
          readyToExecuteMatrix: realEnvHandoffReadiness.readyToExecuteMatrix,
          scenarioCount: realEnvHandoffReadiness.scenarioCount,
          readyScenarioCount: realEnvHandoffReadiness.readyScenarioCount,
          tierCount: realEnvHandoffReadiness.tierCount,
          readyTierCount: realEnvHandoffReadiness.readyTierCount,
          blockedTierCount: realEnvHandoffReadiness.blockedTierCount,
          secretLeakCount: realEnvHandoffReadiness.secretLeakCount,
          scopeBoundary: 'This is the required handoff readiness for the full 16-scenario UAT/staging/solo-live/live matrix.',
        }
      : null,
    closeoutDecision: closeoutDecision
      ? {
          status: closeoutDecision.status ?? closeoutDecision.decision ?? null,
          mayClose: closeoutDecision.mayClose ?? null,
          boundary: 'Closeout decision is support evidence for release closeout only; it is not full customer scenario UAT coverage.',
        }
      : null,
    stagingPreflight: stagingPreflight
      ? {
          status: stagingPreflight.status,
          environment: stagingPreflight.environment,
          targetClass: stagingPreflight.targetClass,
          passedCheckCount: stagingPreflight.summary?.passedCheckCount ?? null,
          requiredCheckCount: stagingPreflight.summary?.requiredCheckCount ?? null,
          failedCheckIds: stagingPreflight.summary?.failedCheckIds ?? [],
          missingCheckIds: stagingPreflight.summary?.missingCheckIds ?? [],
          canCloseScenarioTier: stagingPreflight.canCloseScenarioTier === true,
          boundary: stagingPreflight.boundary ?? null,
        }
      : null,
    envFiles: envFiles.map((item) => ({
      path: item.path,
      exists: item.exists,
      keyCount: item.keys.length,
      nonEmptyKeyCount: item.nonEmptyKeys.length,
      keysPresent: item.keys,
    })),
    envReadiness,
    summary,
    scenarios: scenarioResults,
    nextRequiredInputs: [
      'A passing v14241 real-env handoff readiness file covering all 16 scenarios, not only C18/C15/C19/old-object closeout gates.',
      'UAT/staging/solo-live/live URLs and deployed versions.',
      'solo-live URL, deployment ref, self-approval, rollback owner, monitoring owner, API/UI smoke refs, and rollback/monitoring plan refs when using the personal real-environment lane.',
      'Named role accounts or secret refs for owner/company_admin/project_admin/editor/outsider/anon.',
      'Target company/project/baseline/publication ids and disposable data boundaries for each scenario.',
      'Approval, rollback, cleanup, monitoring, and artifact-retention owners for every mutating or negative test.',
      'Scenario evidence artifacts named by each evidenceContract, with environment metadata, screenshots/traces, API/console summaries, and cleanup/readback.',
    ],
  }
}

export function renderMarkdown(report) {
  const lines = [
    '# v1.4.24.1 Real Environment UAT/Staging/Solo-Live/Live Matrix Execution Report',
    '',
    `- Generated at: ${report.generatedAt}`,
    `- Status: ${report.status}`,
    `- Release dir: ${report.releaseDir}`,
    `- Matrix file: ${report.matrixFile}`,
    `- Evidence root: ${report.evidenceRoot}`,
    '',
    '## Verdict',
    '',
    `- Scenarios: ${report.summary.scenarioCount}`,
    `- Fully passed scenarios: ${report.summary.fullyPassedScenarioCount}`,
    `- Support-only scenarios: ${report.summary.supportOnlyScenarioCount}`,
    `- Blocked scenarios: ${report.summary.blockedScenarioCount}`,
    `- Passed tiers: ${report.summary.passedTierCount}/${report.summary.tierCount}`,
    `- Tier statuses: ${JSON.stringify(report.summary.byTierStatus)}`,
    '',
    'This runner did not execute live/DB writes. A tier is marked `passed` only when the scenario evidence contract is satisfied by real-environment artifacts. Local browser checks, handoff readiness, and closeout validations are support evidence only for this 16-scenario matrix. `solo-live` is personal real-environment readiness and does not close company-grade `productionReady`.',
    '',
    '## Environment Inputs',
    '',
  ]

  for (const [tier, readiness] of Object.entries(report.envReadiness)) {
    lines.push(`- ${tier}: present keys ${readiness.presentNonEmptyKeys.length}/${readiness.requiredKeys.length}; missing ${readiness.missingKeys.join(', ') || 'none'}`)
  }

  lines.push('', '## Handoff Boundary', '')
  if (report.handoffReadiness) {
    lines.push(`- Existing handoff readiness: ${report.handoffReadiness.status}; readyToRun=${report.handoffReadiness.readyToRun}; gates=${report.handoffReadiness.readyGateCount}/${report.handoffReadiness.gateCount}`)
    lines.push(`- Boundary: ${report.handoffReadiness.scopeBoundary}`)
  } else {
    lines.push('- Existing handoff readiness: missing')
  }
  if (report.realEnvHandoffReadiness) {
    lines.push(`- 16-scenario handoff readiness: ${report.realEnvHandoffReadiness.status}; readyToExecuteMatrix=${report.realEnvHandoffReadiness.readyToExecuteMatrix}; tiers=${report.realEnvHandoffReadiness.readyTierCount}/${report.realEnvHandoffReadiness.tierCount}`)
    lines.push(`- Boundary: ${report.realEnvHandoffReadiness.scopeBoundary}`)
  } else {
    lines.push('- 16-scenario handoff readiness: missing')
  }

  lines.push('', '## Environment Preflight', '')
  if (report.stagingPreflight) {
    lines.push(`- staging preflight: ${report.stagingPreflight.status}; checks=${report.stagingPreflight.passedCheckCount}/${report.stagingPreflight.requiredCheckCount}; targetClass=${report.stagingPreflight.targetClass}; canCloseScenarioTier=${report.stagingPreflight.canCloseScenarioTier}`)
    if (report.stagingPreflight.failedCheckIds.length > 0) lines.push(`- failed checks: ${report.stagingPreflight.failedCheckIds.join(', ')}`)
    if (report.stagingPreflight.missingCheckIds.length > 0) lines.push(`- missing checks: ${report.stagingPreflight.missingCheckIds.join(', ')}`)
  } else {
    lines.push('- staging preflight: missing')
  }

  lines.push('', '## Scenario Results', '')
  lines.push('| ID | Status | Passed tiers | Support evidence | Conclusion |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const scenario of report.scenarios) {
    const supportTypes = [...new Set(scenario.supportingEvidence.map((item) => item.classification))].join(', ') || 'none'
    lines.push(`| ${scenario.id} | ${scenario.status} | ${scenario.passedTierCount}/${scenario.totalTierCount} | ${supportTypes} | ${scenario.conclusion} |`)
  }

  lines.push('', '## Scenario Detail', '')
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.id} ${scenario.title}`, '')
    for (const tier of scenario.tiers) {
      lines.push(
        `- ${tier.name}: ${tier.status}; mayClaimPass=${tier.mayClaimPass}; missingInputs=${tier.missingInputs.join(' / ') || 'none'}; missingArtifacts=${tier.missingArtifacts.join(' / ') || 'none'}`,
      )
    }
    if (scenario.supportingEvidence.length > 0) {
      lines.push('', 'Supporting evidence:')
      for (const item of scenario.supportingEvidence) {
        const artifacts = item.artifacts.map((artifact) => `${artifact.path}${artifact.present ? '' : ' (missing)'}`).join('; ')
        lines.push(`- ${item.classification}: ${item.note} Artifacts: ${artifacts}`)
      }
    }
    lines.push('')
  }

  lines.push('## Next Required Inputs', '')
  for (const item of report.nextRequiredInputs) {
    lines.push(`- ${item}`)
  }
  return `${lines.join('\n')}\n`
}

async function main() {
  const releaseDir = resolve(argValue('--release-dir', defaultReleaseDir))
  const matrixFile = resolve(argValue('--matrix-file', join(releaseDir, 'v14241-real-env-uat-staging-live-matrix.json')))
  const evidenceRoot = resolve(argValue('--evidence-root', releaseDir))
  const outputJson = resolve(argValue('--output-json', defaultOutputJson))
  const outputMd = resolve(argValue('--output-md', defaultOutputMd))
  const report = await buildExecutionReport({ matrixFile, releaseDir, evidenceRoot })
  await mkdir(dirname(outputJson), { recursive: true })
  await mkdir(dirname(outputMd), { recursive: true })
  await writeFile(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  await writeFile(outputMd, renderMarkdown(report), 'utf8')
  console.log(JSON.stringify({
    status: report.status,
    scenarioCount: report.summary.scenarioCount,
    passedTierCount: report.summary.passedTierCount,
    tierCount: report.summary.tierCount,
    supportOnlyScenarioCount: report.summary.supportOnlyScenarioCount,
    outputs: [rel(outputJson), rel(outputMd)],
  }, null, 2))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
