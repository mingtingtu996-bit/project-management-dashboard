-- v1.4.23.1 C-18.L09 follow-up: physical cleanup may delete task rows before
-- legacy condition rows in a partially compensated draft. In that case the
-- condition DELETE trigger must not try to append a timeline event that points
-- at a task that no longer exists.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_task_timeline_for_condition()
RETURNS TRIGGER AS $$
DECLARE
  v_status_label TEXT;
  v_description TEXT;
  v_occurred_at TIMESTAMPTZ;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.task_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
          FROM public.tasks t
         WHERE t.id = OLD.task_id
      ) THEN
      RETURN OLD;
    END IF;

    PERFORM public.record_task_timeline_event(
      OLD.project_id,
      OLD.task_id,
      'condition',
      COALESCE(OLD.name, '开工条件'),
      '开工条件记录已删除',
      CASE WHEN COALESCE(OLD.is_satisfied, FALSE) THEN '已满足' ELSE '待满足' END,
      jsonb_build_object(
        'source', 'task_conditions',
        'event', 'deleted',
        'is_satisfied', COALESCE(OLD.is_satisfied, FALSE),
        'condition_type', COALESCE(OLD.condition_type, '其他')
      ),
      OLD.created_by,
      COALESCE(OLD.updated_at, OLD.created_at, NOW())
    );
    RETURN OLD;
  END IF;

  v_status_label := CASE WHEN COALESCE(NEW.is_satisfied, FALSE) THEN '已满足' ELSE '待满足' END;
  v_occurred_at := COALESCE(NEW.confirmed_at, NEW.updated_at, NEW.created_at, NOW());

  IF TG_OP = 'INSERT' THEN
    v_description := CASE WHEN COALESCE(NEW.is_satisfied, FALSE)
      THEN '开工条件已满足'
      ELSE '开工条件待满足'
    END;

    PERFORM public.record_task_timeline_event(
      NEW.project_id,
      NEW.task_id,
      'condition',
      COALESCE(NEW.name, '开工条件'),
      v_description,
      v_status_label,
      jsonb_build_object(
        'source', 'task_conditions',
        'event', 'created',
        'is_satisfied', COALESCE(NEW.is_satisfied, FALSE),
        'condition_type', COALESCE(NEW.condition_type, '其他')
      ),
      NEW.created_by,
      v_occurred_at
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_satisfied IS DISTINCT FROM OLD.is_satisfied
      OR NEW.name IS DISTINCT FROM OLD.name
      OR NEW.description IS DISTINCT FROM OLD.description
      OR NEW.condition_type IS DISTINCT FROM OLD.condition_type THEN
      v_description := CASE WHEN COALESCE(NEW.is_satisfied, FALSE)
        THEN '开工条件已满足'
        ELSE '开工条件待满足'
      END;

      PERFORM public.record_task_timeline_event(
        NEW.project_id,
        NEW.task_id,
        'condition',
        COALESCE(NEW.name, '开工条件'),
        v_description,
        v_status_label,
        jsonb_build_object(
          'source', 'task_conditions',
          'event', 'updated',
          'old_is_satisfied', COALESCE(OLD.is_satisfied, FALSE),
          'new_is_satisfied', COALESCE(NEW.is_satisfied, FALSE),
          'condition_type', COALESCE(NEW.condition_type, '其他')
        ),
        NEW.confirmed_by,
        v_occurred_at
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_task_timeline_conditions ON public.task_conditions;
CREATE TRIGGER trigger_task_timeline_conditions
  AFTER INSERT OR UPDATE OR DELETE ON public.task_conditions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_timeline_for_condition();

COMMIT;
