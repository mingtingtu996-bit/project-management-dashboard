BEGIN;

DROP POLICY IF EXISTS duration_asset_review_items_member_read ON public.duration_asset_review_items;
DROP POLICY IF EXISTS duration_asset_review_items_backend_runtime ON public.duration_asset_review_items;
DROP TRIGGER IF EXISTS set_duration_asset_review_items_updated_at ON public.duration_asset_review_items;
DROP TABLE IF EXISTS public.duration_asset_review_items;

NOTIFY pgrst, 'reload schema';

COMMIT;
