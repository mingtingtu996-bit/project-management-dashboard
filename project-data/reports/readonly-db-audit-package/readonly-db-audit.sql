-- WorkBuddy read-only DB audit package
-- Mutation boundary: readonly_db_audit_package_only_no_db_connection_no_db_mutation
-- Execute only against explicitly approved read-only/staging review targets.

-- Schema inventory
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_schema, table_name, ordinal_position;

-- Catalog table presence
SELECT expected.table_id, expected.table_schema, expected.table_name, to_regclass(expected.table_schema || '.' || expected.table_name) IS NOT NULL AS table_exists
FROM (VALUES
    ('public', 'tasks', 'tasks'),
    ('public', 'task_baselines', 'task_baselines'),
    ('public', 'task_baseline_items', 'task_baseline_items'),
    ('public', 'monthly_plans', 'monthly_plans'),
    ('public', 'monthly_plan_items', 'monthly_plan_items'),
    ('public', 'task_dependencies', 'task_dependencies'),
    ('public', 'project_daily_snapshot', 'project_daily_snapshot'),
    ('public', 'duration_experience_samples', 'duration_experience_samples'),
    ('public', 'progress_knowledge_sources', 'progress_knowledge_sources'),
    ('public', 'progress_knowledge_documents', 'progress_knowledge_documents'),
    ('public', 'progress_asset_candidates', 'progress_asset_candidates'),
    ('public', 'progress_asset_calibration_runs', 'progress_asset_calibration_runs'),
    ('public', 'progress_asset_calibration_results', 'progress_asset_calibration_results'),
    ('public', 'progress_asset_publication_readiness', 'progress_asset_publication_readiness')
) AS expected(table_schema, table_name, table_id)
ORDER BY expected.table_id;;

-- Contract column presence
SELECT expected.table_name, expected.column_name, columns.column_name IS NOT NULL AS column_exists
FROM (VALUES
    ('tasks', 'id'),
    ('tasks', 'project_id'),
    ('tasks', 'title'),
    ('tasks', 'status'),
    ('tasks', 'planned_start_date'),
    ('tasks', 'planned_end_date'),
    ('tasks', 'actual_start_date'),
    ('tasks', 'actual_end_date'),
    ('tasks', 'progress'),
    ('task_baselines', 'id'),
    ('task_baselines', 'project_id'),
    ('task_baselines', 'version'),
    ('task_baselines', 'status'),
    ('task_baselines', 'title'),
    ('task_baselines', 'created_at'),
    ('task_baselines', 'updated_at'),
    ('task_baseline_items', 'id'),
    ('task_baseline_items', 'project_id'),
    ('task_baseline_items', 'baseline_version_id'),
    ('task_baseline_items', 'source_task_id'),
    ('task_baseline_items', 'title'),
    ('task_baseline_items', 'planned_start_date'),
    ('task_baseline_items', 'planned_end_date'),
    ('monthly_plans', 'id'),
    ('monthly_plans', 'project_id'),
    ('monthly_plans', 'month'),
    ('monthly_plans', 'status'),
    ('monthly_plans', 'created_at'),
    ('monthly_plans', 'updated_at'),
    ('monthly_plan_items', 'id'),
    ('monthly_plan_items', 'project_id'),
    ('monthly_plan_items', 'monthly_plan_version_id'),
    ('monthly_plan_items', 'source_task_id'),
    ('monthly_plan_items', 'title'),
    ('monthly_plan_items', 'planned_start_date'),
    ('monthly_plan_items', 'planned_end_date'),
    ('task_dependencies', 'id'),
    ('task_dependencies', 'project_id'),
    ('task_dependencies', 'task_id'),
    ('task_dependencies', 'dependency_task_id'),
    ('task_dependencies', 'dependency_type'),
    ('project_daily_snapshot', 'project_id'),
    ('project_daily_snapshot', 'snapshot_date'),
    ('project_daily_snapshot', 'overall_progress'),
    ('project_daily_snapshot', 'task_progress'),
    ('project_daily_snapshot', 'planned_cumulative'),
    ('project_daily_snapshot', 'health_score'),
    ('duration_experience_samples', 'id'),
    ('duration_experience_samples', 'project_id'),
    ('duration_experience_samples', 'source_type'),
    ('duration_experience_samples', 'planned_duration'),
    ('duration_experience_samples', 'actual_duration'),
    ('duration_experience_samples', 'sample_status'),
    ('duration_experience_samples', 'created_at'),
    ('progress_knowledge_sources', 'source_key'),
    ('progress_knowledge_sources', 'source_name'),
    ('progress_knowledge_sources', 'source_url'),
    ('progress_knowledge_sources', 'connector_type'),
    ('progress_knowledge_sources', 'access_level'),
    ('progress_knowledge_sources', 'source_trust_level'),
    ('progress_knowledge_sources', 'governance_status'),
    ('progress_knowledge_sources', 'source_metadata'),
    ('progress_knowledge_documents', 'id'),
    ('progress_knowledge_documents', 'source_id'),
    ('progress_knowledge_documents', 'document_key'),
    ('progress_knowledge_documents', 'title'),
    ('progress_knowledge_documents', 'document_type'),
    ('progress_knowledge_documents', 'document_url'),
    ('progress_knowledge_documents', 'storage_path'),
    ('progress_knowledge_documents', 'content_hash'),
    ('progress_knowledge_documents', 'extraction_status'),
    ('progress_knowledge_documents', 'extraction_quality')
) AS expected(table_name, column_name)
LEFT JOIN information_schema.columns columns
  ON columns.table_schema = 'public'
 AND columns.table_name = expected.table_name
 AND columns.column_name = expected.column_name
ORDER BY expected.table_name, expected.column_name;;

-- Quality check: tasks.project_id_required
SELECT count(*)::int AS missing_project_id FROM public.tasks WHERE project_id IS NULL;;

-- Quality check: tasks.progress_range_0_100
SELECT count(*)::int AS invalid_progress FROM public.tasks WHERE progress IS NOT NULL AND (progress < 0 OR progress > 100);;

-- Quality check: task_baselines.project_id_required
SELECT count(*)::int AS missing_project_id FROM public.task_baselines WHERE project_id IS NULL;;

-- Quality check: task_baselines.baseline_version_required
SELECT count(*)::int AS missing_baseline_version
FROM public.task_baselines
WHERE status IN ('confirmed', 'pending_realign', 'archived', 'closed')
  AND version IS NULL;;

-- Quality check: task_baseline_items.project_id_required
SELECT count(*)::int AS missing_project_id FROM public.task_baseline_items WHERE project_id IS NULL;;

-- Quality check: task_baseline_items.baseline_version_required
SELECT count(*)::int AS missing_baseline_version_id FROM public.task_baseline_items WHERE baseline_version_id IS NULL;;

-- Quality check: task_baseline_items.baseline_dates_required_for_published_baseline
SELECT count(*)::int AS published_items_missing_dates
FROM public.task_baseline_items item
JOIN public.task_baselines baseline
  ON baseline.id = item.baseline_version_id
WHERE baseline.status IN ('confirmed', 'closed')
  AND (item.planned_start_date IS NULL OR item.planned_end_date IS NULL);;

-- Quality check: monthly_plans.project_id_required
SELECT count(*)::int AS missing_project_id FROM public.monthly_plans WHERE project_id IS NULL;;

-- Quality check: monthly_plans.monthly_plan_month_required
SELECT count(*)::int AS missing_month FROM public.monthly_plans WHERE month IS NULL OR trim(month) = '';;

-- Quality check: monthly_plans.monthly_plan_status_required
SELECT count(*)::int AS missing_status FROM public.monthly_plans WHERE status IS NULL OR trim(status) = '';;

-- Quality check: monthly_plan_items.project_id_required
SELECT count(*)::int AS missing_project_id FROM public.monthly_plan_items WHERE project_id IS NULL;;

-- Quality check: monthly_plan_items.monthly_plan_item_plan_ref_required
SELECT count(*)::int AS missing_monthly_plan_version_id FROM public.monthly_plan_items WHERE monthly_plan_version_id IS NULL;;

-- Quality check: monthly_plan_items.monthly_plan_item_task_or_title_required
SELECT count(*)::int AS missing_task_or_title FROM public.monthly_plan_items WHERE source_task_id IS NULL AND (title IS NULL OR trim(title) = '');;

-- Quality check: task_dependencies.project_id_required
SELECT count(*)::int AS missing_project_id FROM public.task_dependencies WHERE project_id IS NULL;;

-- Quality check: task_dependencies.dependency_endpoints_required
SELECT count(*)::int AS missing_dependency_endpoint FROM public.task_dependencies WHERE task_id IS NULL OR dependency_task_id IS NULL;;

-- Quality check: task_dependencies.dependency_no_self_loop
SELECT count(*)::int AS self_loop_count FROM public.task_dependencies WHERE task_id = dependency_task_id;;

-- Quality check: project_daily_snapshot.project_id_required
SELECT count(*)::int AS missing_project_id FROM public.project_daily_snapshot WHERE project_id IS NULL;;

-- Quality check: project_daily_snapshot.progress_range_0_100
SELECT count(*)::int AS invalid_progress
FROM public.project_daily_snapshot
WHERE (overall_progress IS NOT NULL AND (overall_progress < 0 OR overall_progress > 100))
   OR (task_progress IS NOT NULL AND (task_progress < 0 OR task_progress > 100))
   OR (planned_cumulative IS NOT NULL AND (planned_cumulative < 0 OR planned_cumulative > 100));;

-- Quality check: project_daily_snapshot.snapshot_date_required
SELECT count(*)::int AS missing_snapshot_date FROM public.project_daily_snapshot WHERE snapshot_date IS NULL;;

-- Quality check: project_daily_snapshot.one_snapshot_per_project_per_day
SELECT project_id, snapshot_date, count(*)::int AS row_count
FROM public.project_daily_snapshot
GROUP BY project_id, snapshot_date
HAVING count(*) > 1
ORDER BY row_count DESC, project_id, snapshot_date;;

-- Quality check: duration_experience_samples.project_id_required
SELECT count(*)::int AS missing_project_id FROM public.duration_experience_samples WHERE project_id IS NULL;;

-- Quality check: duration_experience_samples.duration_sample_source_required
SELECT count(*)::int AS missing_source_type FROM public.duration_experience_samples WHERE source_type IS NULL OR trim(source_type) = '';;

-- Quality check: duration_experience_samples.duration_days_non_negative
SELECT count(*)::int AS negative_duration_count
FROM public.duration_experience_samples
WHERE planned_duration < 0
   OR actual_duration < 0;;

-- Quality check: duration_experience_samples.duration_sample_status_required
SELECT count(*)::int AS missing_sample_status FROM public.duration_experience_samples WHERE sample_status IS NULL OR trim(sample_status) = '';;

-- Quality check: progress_knowledge_sources.source_key_required
SELECT count(*)::int AS missing_source_key FROM public.progress_knowledge_sources WHERE source_key IS NULL OR trim(source_key) = '';;

-- Quality check: progress_knowledge_sources.source_url_or_locator_required
SELECT count(*)::int AS missing_source_locator
FROM public.progress_knowledge_sources
WHERE coalesce(source_url, '') = ''
  AND (source_metadata IS NULL OR source_metadata = '{}'::jsonb);;

-- Quality check: progress_knowledge_sources.trust_level_required
SELECT count(*)::int AS missing_trust_level FROM public.progress_knowledge_sources WHERE source_trust_level IS NULL OR trim(source_trust_level) = '';;

-- Quality check: progress_knowledge_sources.source_governance_status_required
SELECT count(*)::int AS missing_governance_status FROM public.progress_knowledge_sources WHERE governance_status IS NULL OR trim(governance_status) = '';;

-- Quality check: progress_knowledge_documents.document_key_required
SELECT count(*)::int AS missing_document_key FROM public.progress_knowledge_documents WHERE document_key IS NULL OR trim(document_key) = '';;

-- Quality check: progress_knowledge_documents.document_type_required
SELECT count(*)::int AS missing_document_type FROM public.progress_knowledge_documents WHERE document_type IS NULL OR trim(document_type) = '';;

-- Quality check: progress_knowledge_documents.extraction_status_required
SELECT count(*)::int AS missing_extraction_status FROM public.progress_knowledge_documents WHERE extraction_status IS NULL OR trim(extraction_status) = '';;

-- Quality check: progress_knowledge_documents.hash_required_when_downloaded
SELECT count(*)::int AS downloaded_without_hash FROM public.progress_knowledge_documents WHERE coalesce(storage_path, '') <> '' AND coalesce(content_hash, '') = '';;
