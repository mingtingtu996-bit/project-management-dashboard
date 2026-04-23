-- 104: Disable the obsolete task_delay_history trigger after delay_requests rename
-- 10.2d 之后，任务 end_date / planned_end_date 的变更必须经显式延期审批链落账，
-- 旧 trigger_record_task_delay 自动补写历史表的机制已废弃；保留它会在真实库中
-- 继续访问已重命名/已删除的 task_delay_history，导致延期审批半提交。

BEGIN;

CREATE OR REPLACE FUNCTION public.record_task_delay_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_record_task_delay ON public.tasks;

COMMIT;
