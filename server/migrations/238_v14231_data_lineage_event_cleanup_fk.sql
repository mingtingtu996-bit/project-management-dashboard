-- v1.4.23.1 C-18.L09 follow-up: data_lineage_events is append-only, so
-- deleting a lineage link must not update event.link_id through ON DELETE SET
-- NULL. Use CASCADE so disposable wizard cleanup can physically delete lineage
-- artifacts without violating the append-only trigger.

BEGIN;

ALTER TABLE public.data_lineage_events
  DROP CONSTRAINT IF EXISTS data_lineage_events_link_id_fkey;

ALTER TABLE public.data_lineage_events
  ADD CONSTRAINT data_lineage_events_link_id_fkey
  FOREIGN KEY (link_id)
  REFERENCES public.data_lineage_links(id)
  ON DELETE CASCADE;

COMMIT;
