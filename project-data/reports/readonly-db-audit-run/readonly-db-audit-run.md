# WorkBuddy Read-Only DB Audit Run

- Schema: `workbuddy-readonly-db-audit-run/v1`
- Execution mode: `read-only-db`
- Mutation boundary: `readonly_db_audit_execution_only_no_db_mutation`
- Planned queries: 35
- Executed queries: 35
- Failed queries: 0
- Missing tables: 0
- Missing contract columns: 0
- Failed quality checks: 0

## Schema Drift

### Missing Tables

- None

### Missing Contract Columns

- None

### Failed Queries

- None

## Quality Results

- tasks.project_id_required: pass (missing_project_id=0)
- tasks.progress_range_0_100: pass (invalid_progress=0)
- task_baselines.project_id_required: pass (missing_project_id=0)
- task_baselines.baseline_version_required: pass (missing_baseline_version=0)
- task_baseline_items.project_id_required: pass (missing_project_id=0)
- task_baseline_items.baseline_version_required: pass (missing_baseline_version_id=0)
- task_baseline_items.baseline_dates_required_for_published_baseline: pass (published_items_missing_dates=0)
- monthly_plans.project_id_required: pass (missing_project_id=0)
- monthly_plans.monthly_plan_month_required: pass (missing_month=0)
- monthly_plans.monthly_plan_status_required: pass (missing_status=0)
- monthly_plan_items.project_id_required: pass (missing_project_id=0)
- monthly_plan_items.monthly_plan_item_plan_ref_required: pass (missing_monthly_plan_version_id=0)
- monthly_plan_items.monthly_plan_item_task_or_title_required: pass (missing_task_or_title=0)
- task_dependencies.project_id_required: pass (missing_project_id=0)
- task_dependencies.dependency_endpoints_required: pass (missing_dependency_endpoint=0)
- task_dependencies.dependency_no_self_loop: pass (self_loop_count=0)
- project_daily_snapshot.project_id_required: pass (missing_project_id=0)
- project_daily_snapshot.progress_range_0_100: pass (invalid_progress=0)
- project_daily_snapshot.snapshot_date_required: pass (missing_snapshot_date=0)
- project_daily_snapshot.one_snapshot_per_project_per_day: pass
- duration_experience_samples.project_id_required: pass (missing_project_id=0)
- duration_experience_samples.duration_sample_source_required: pass (missing_source_type=0)
- duration_experience_samples.duration_days_non_negative: pass (negative_duration_count=0)
- duration_experience_samples.duration_sample_status_required: pass (missing_sample_status=0)
- progress_knowledge_sources.source_key_required: pass (missing_source_key=0)
- progress_knowledge_sources.source_url_or_locator_required: pass (missing_source_locator=0)
- progress_knowledge_sources.trust_level_required: pass (missing_trust_level=0)
- progress_knowledge_sources.source_governance_status_required: pass (missing_governance_status=0)
- progress_knowledge_documents.document_key_required: pass (missing_document_key=0)
- progress_knowledge_documents.document_type_required: pass (missing_document_type=0)
- progress_knowledge_documents.extraction_status_required: pass (missing_extraction_status=0)
- progress_knowledge_documents.hash_required_when_downloaded: pass (downloaded_without_hash=0)

No SQL in this run mutates database state. Connection details are redacted from the report.
