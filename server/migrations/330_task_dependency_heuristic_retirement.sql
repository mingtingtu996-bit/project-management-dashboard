-- Unpublished heuristic edges are preview candidates, not executable task dependencies.
UPDATE public.task_dependencies
SET status = 'inactive',
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'formalDependencyRetirement',
      jsonb_build_object(
        'migration', '330_task_dependency_heuristic_retirement',
        'previousStatus', 'active',
        'reason', 'unpublished_heuristic_dependency_candidate_only'
      )
    ),
    updated_at = NOW()
WHERE status = 'active'
  AND (
    LOWER(BTRIM(COALESCE(metadata ->> 'source', ''))) = 'heuristic_stagger'
    OR LOWER(BTRIM(COALESCE(metadata ->> 'sequencingBasis', metadata ->> 'sequencing_basis', ''))) = 'heuristic_stagger'
    OR LOWER(BTRIM(COALESCE(
      metadata -> 'dependencyRuleEvidence' ->> 'evidenceLevel',
      metadata -> 'dependency_rule_evidence' ->> 'evidence_level',
      ''
    ))) = 'heuristic_fallback_l0'
    OR LOWER(BTRIM(COALESCE(
      metadata -> 'dependencyRuleEvidence' ->> 'publicationStatus',
      metadata -> 'dependency_rule_evidence' ->> 'publication_status',
      ''
    ))) = 'fallback_not_published_dependency_rule'
    OR LOWER(BTRIM(COALESCE(metadata ->> 'learningPolicy', metadata ->> 'learning_policy', '')))
      = 'candidate_only_until_dependency_rule_replay_publication'
  );
