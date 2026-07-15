# WorkBuddy Read-Only DB Audit Run

- Schema: `workbuddy-readonly-db-audit-run/v1`
- Execution mode: `dry-run`
- Mutation boundary: `readonly_db_audit_execution_only_no_db_mutation`
- Planned queries: 35
- Executed queries: 35
- Failed queries: 0
- Missing tables: null
- Missing contract columns: null
- Failed quality checks: 0

## Schema Drift

### Missing Tables

- None

### Missing Contract Columns

- None

### Failed Queries

- None

## Quality Results

- tasks.project_id_required: pass
- tasks.progress_range_0_100: pass
- task_baselines.project_id_required: pass
- task_baselines.baseline_version_required: pass
- task_baseline_items.project_id_required: pass
- task_baseline_items.baseline_version_required: pass
- task_baseline_items.baseline_dates_required_for_published_baseline: pass
- monthly_plans.project_id_required: pass
- monthly_plans.monthly_plan_month_required: pass
- monthly_plans.monthly_plan_status_required: pass
- monthly_plan_items.project_id_required: pass
- monthly_plan_items.monthly_plan_item_plan_ref_required: pass
- monthly_plan_items.monthly_plan_item_task_or_title_required: pass
- task_dependencies.project_id_required: pass
- task_dependencies.dependency_endpoints_required: pass
- task_dependencies.dependency_no_self_loop: pass
- project_daily_snapshot.project_id_required: pass
- project_daily_snapshot.progress_range_0_100: pass
- project_daily_snapshot.snapshot_date_required: pass
- project_daily_snapshot.one_snapshot_per_project_per_day: pass
- duration_experience_samples.project_id_required: pass
- duration_experience_samples.duration_sample_source_required: pass
- duration_experience_samples.duration_days_non_negative: pass
- duration_experience_samples.duration_sample_status_required: pass
- progress_knowledge_sources.source_key_required: pass
- progress_knowledge_sources.source_url_or_locator_required: pass
- progress_knowledge_sources.trust_level_required: pass
- progress_knowledge_sources.source_governance_status_required: pass
- progress_knowledge_documents.document_key_required: pass
- progress_knowledge_documents.document_type_required: pass
- progress_knowledge_documents.extraction_status_required: pass
- progress_knowledge_documents.hash_required_when_downloaded: pass

No SQL in this run mutates database state. Connection details are redacted from the report.
