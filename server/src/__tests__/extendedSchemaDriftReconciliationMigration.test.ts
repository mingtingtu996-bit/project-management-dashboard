import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('extended schema drift reconciliation migration', () => {
  it('uses a forward migration to reconcile legacy functions, triggers, views and ACLs', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'migrations/298_extended_schema_drift_reconciliation.sql'),
      'utf8',
    )

    expect(source).toContain('DROP FUNCTION IF EXISTS public.has_project_edit_permission(UUID, UUID)')
    expect(source).toContain('DROP FUNCTION IF EXISTS public.is_project_owner(UUID, UUID)')
    expect(source).toContain('DROP MATERIALIZED VIEW IF EXISTS public.mv_project_dashboard')
    expect(source).toContain('DROP TRIGGER IF EXISTS update_task_conditions_updated_at ON public.task_conditions')
    expect(source).toContain('DROP TRIGGER IF EXISTS update_task_obstacles_updated_at ON public.task_obstacles')
    expect(source).toContain('CREATE OR REPLACE FUNCTION public.auto_complete_conditions()')
    expect(source).toContain('CREATE OR REPLACE FUNCTION public.update_task_progress_on_condition_complete()')
    expect(source).toContain('CREATE OR REPLACE FUNCTION public.auto_resolve_obstacles_on_task_complete()')
    expect(source).toContain('CREATE TRIGGER trigger_update_task_progress_on_condition')
    expect(source).toContain('CREATE TRIGGER trigger_auto_resolve_obstacles')
    expect(source).toContain("NEW.status = '已完成'")
    expect(source).toContain("SET status = '已确认'")
    expect(source).toContain("status = '已满足'")
    expect(source).toContain("resolution = COALESCE(resolution, '任务已完成，系统自动关闭阻碍')")
    expect(source).toContain("'待处理', '处理中'")
    expect(source).not.toMatch(/[宸茬寰澶浠][^\n']*\?/)
    expect(source).toContain('REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM PUBLIC')
    expect(source).toContain('REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM anon')
    expect(source).toContain('REVOKE ALL ON TABLE public.algorithm_asset_registry_view FROM authenticated')
    expect(source).toContain('GRANT SELECT ON TABLE public.algorithm_asset_registry_view TO workbuddy_runtime')
    expect(source).not.toMatch(/\bUPDATE\s+schema_migrations\b/i)
    expect(source).not.toMatch(/\bDELETE\s+FROM\s+schema_migrations\b/i)
  })
})
