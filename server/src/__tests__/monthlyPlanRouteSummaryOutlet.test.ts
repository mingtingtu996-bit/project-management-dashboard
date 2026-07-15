import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const serverRoot = process.cwd().replace(/\\/g, '/').endsWith('/server')
  ? process.cwd()
  : resolve(process.cwd(), 'server')

describe('monthly plan routes summary outlet', () => {
  it('delegates fulfillment KPI production to monthlyPlanSummaryService instead of local route aggregation', () => {
    const routeSource = readFileSync(resolve(serverRoot, 'src/routes/monthly-plans.ts'), 'utf8')

    expect(routeSource).toContain("from '../services/monthlyPlanSummaryService.js'")
    expect(routeSource).not.toContain('function loadMonthlyPlanFulfillmentTrendFresh')
    expect(routeSource).not.toContain('function loadMonthlyPlanFulfillmentTrendViaRest')
    expect(routeSource).not.toContain('normalizeMonthlyPlanFulfillmentTrendRow')
    expect(routeSource).not.toContain('COUNT(eligible_items.monthly_plan_version_id)')
  })

  it('does not select the removed tasks.name column for monthly closeout summary read models', () => {
    const routeSource = readFileSync(resolve(serverRoot, 'src/routes/monthly-plans.ts'), 'utf8')

    expect(routeSource).not.toContain(".select('id,title,name,planned_start_date")
    expect(routeSource).toContain(".select('id,title,planned_start_date,planned_end_date,start_date,end_date,actual_end_date,progress,status")
  })
})
