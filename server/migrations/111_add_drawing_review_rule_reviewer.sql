ALTER TABLE public.drawing_review_rules
  ADD COLUMN IF NOT EXISTS reviewer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_drawing_review_rules_reviewer
  ON public.drawing_review_rules(reviewer_id);
