-- Migration 053: Fix task completion report duration calculation for DATE columns
-- Goal: avoid EXTRACT(DAY FROM date - date) on PostgreSQL integer result

DROP TRIGGER IF EXISTS trigger_auto_generate_report ON tasks;
DROP FUNCTION IF EXISTS auto_generate_completion_report();

CREATE OR REPLACE FUNCTION auto_generate_completion_report()
RETURNS TRIGGER AS $$
DECLARE
  v_planned_duration INTEGER;
  v_actual_duration INTEGER;
BEGIN
  IF NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100) THEN
    v_planned_duration := CASE
      WHEN NEW.start_date IS NOT NULL AND NEW.end_date IS NOT NULL
        THEN GREATEST(NEW.end_date - NEW.start_date, 0)
      ELSE 0
    END;

    v_actual_duration := CASE
      WHEN NEW.start_date IS NOT NULL
        THEN GREATEST(CURRENT_DATE - NEW.start_date, 0)
      ELSE 0
    END;

    INSERT INTO task_completion_reports (
      task_id,
      project_id,
      report_type,
      title,
      summary,
      planned_duration,
      actual_duration,
      efficiency_ratio,
      efficiency_status,
      generated_by,
      generated_at
    ) VALUES (
      NEW.id,
      NEW.project_id,
      'task',
      COALESCE(NEW.title, '任务') || ' 完成总结',
      '任务已完成，自动生成总结报告',
      v_planned_duration,
      v_actual_duration,
      NULL,
      'normal',
      NEW.updated_by,
      NOW()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_report
  AFTER UPDATE OF progress ON tasks
  FOR EACH ROW
  WHEN (NEW.progress = 100 AND (OLD.progress IS NULL OR OLD.progress < 100))
  EXECUTE FUNCTION auto_generate_completion_report();

COMMENT ON FUNCTION auto_generate_completion_report() IS
'修复 DATE 字段工期差值计算，避免 EXTRACT(DAY FROM date-date) 在 PostgreSQL 中报错';
