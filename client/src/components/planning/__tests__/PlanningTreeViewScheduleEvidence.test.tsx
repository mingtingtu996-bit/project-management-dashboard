import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { PlanningTreeView, type PlanningTreeRow } from '../PlanningTreeView'

describe('PlanningTreeView schedule evidence columns', () => {
  it('shows task schedule evidence extra columns from the task field registry', async () => {
    render(
      <PlanningTreeView
        title="执行任务表"
        rows={[{
          id: 'row-risk',
          title: '雨季基坑施工',
          depth: 1,
          sequenceLabel: '1',
          startDateLabel: '2026-07-01',
          endDateLabel: '2026-12-23',
          durationLabel: '176天',
          durationRiskRangeLabel: '建议预留 34 天',
          criticalFloatLabel: '总浮时 0 天 / 自由浮时 3 天',
          durationAssetEvidenceLabel: '施工日历 2 个窗口；运行样本 160 天；季节修正 雨季',
        } as PlanningTreeRow]}
        variant="task"
        rowMode="read"
        viewMode="list"
        fieldRegistryFields={[
          { key: 'duration_risk_range', label: '工期风险', displayGroup: 'dependency', defaultVisibleIn: ['task_list'] },
          { key: 'total_float_days', label: '关键路径浮时', displayGroup: 'dependency', defaultVisibleIn: ['task_list'] },
          { key: 'duration_asset_evidence', label: '工期资产依据', displayGroup: 'template_source', defaultVisibleIn: ['task_list'] },
        ]}
        fieldRegistryVersion="test-registry"
      />,
    )

    expect(await screen.findByText('工期风险')).toBeVisible()
    expect(screen.getByText('建议预留 34 天')).toBeVisible()
    expect(screen.getByText('总浮时 0 天 / 自由浮时 3 天')).toBeVisible()
    expect(screen.getByText('施工日历 2 个窗口；运行样本 160 天；季节修正 雨季')).toBeVisible()
    expect(screen.queryByText(/P20|P50|P80/)).not.toBeInTheDocument()
  })
})
