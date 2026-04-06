import { describe, expect, it } from 'vitest';
import { calculateDependencies, groupAcceptanceByPhase, summarizeAcceptancePlans, type AcceptancePlan } from '@/types/acceptance';

function makePlan(overrides: Partial<AcceptancePlan>): AcceptancePlan {
  return {
    id: 'plan-1',
    project_id: 'project-1',
    milestone_id: 'milestone-1',
    type_id: 'pre_acceptance',
    type_name: '预验收',
    type_color: 'bg-purple-500',
    name: '预验收事项',
    description: '',
    planned_date: '2026-04-01',
    actual_date: undefined,
    status: 'pending',
    depends_on: [],
    depended_by: [],
    phase: 'phase1',
    phase_order: 1,
    position: { x: 0, y: 0 },
    responsible_user_id: undefined,
    documents: [],
    nodes: [],
    is_system: false,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    created_by: undefined,
    ...overrides,
  };
}

describe('acceptance timeline contract', () => {
  it('groups acceptance items by phase', () => {
    const groups = groupAcceptanceByPhase([
      makePlan({ id: 'a', phase: 'phase1', phase_order: 1 }),
      makePlan({ id: 'b', phase: 'phase2', phase_order: 1 }),
      makePlan({ id: 'c', phase: 'phase1', phase_order: 2 }),
    ]);

    expect(groups.map(group => group.id)).toEqual(['phase1', 'phase2']);
    expect(groups[0].plans).toHaveLength(2);
    expect(groups[1].plans).toHaveLength(1);
  });

  it('derives dependencies from plan status', () => {
    const plans = [
      makePlan({ id: 'passed', status: 'passed' }),
      makePlan({ id: 'pending', status: 'pending', depends_on: ['passed'] }),
    ];

    const deps = calculateDependencies(plans);

    expect(deps).toEqual([
      { from: 'passed', to: 'pending', status: 'completed' },
    ]);
  });

  it('counts shared acceptance statuses consistently', () => {
    const stats = summarizeAcceptancePlans([
      makePlan({ id: 'pending', status: 'pending' }),
      makePlan({ id: 'in-progress', status: 'in_progress' }),
      makePlan({ id: 'passed', status: 'passed' }),
      makePlan({ id: 'failed', status: 'failed' }),
      makePlan({ id: 'needs-revision', status: 'needs_revision' }),
      makePlan({ id: 'zh-needs-revision', status: '\u9700\u8865\u5145' as AcceptancePlan['status'] }),
    ]);

    expect(stats).toEqual({
      total: 6,
      passed: 1,
      inProgress: 2,
      pending: 1,
      failed: 3,
      completionRate: 17,
    });
  });
});
