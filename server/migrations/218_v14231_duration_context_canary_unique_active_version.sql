-- v1.4.23.1 canary approval single-active guard.
--
-- A canary candidate may retain historical rolled_back / expired versions, but
-- must not have two active canary/published versions at the same time.

CREATE UNIQUE INDEX IF NOT EXISTS uq_duration_context_policy_versions_active_candidate
  ON public.duration_context_policy_versions (source_candidate_id)
  WHERE version_status IN ('canary', 'published');
