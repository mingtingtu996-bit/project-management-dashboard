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
    status: 'draft',
    phase_code: 'phase1',
    phase_order: 1,
    predecessor_plan_ids: [],
    successor_plan_ids: [],
    display_badges: [],
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
      makePlan({ id: 'a', phase_code: 'phase1', phase_order: 1 }),
      makePlan({ id: 'b', phase_code: 'phase2', phase_order: 1 }),
      makePlan({ id: 'c', phase_code: 'phase1', phase_order: 2 }),
    ]);

    expect(groups.map(group => group.id)).toEqual(['phase1', 'phase2']);
    expect(groups[0].plans).toHaveLength(2);
    expect(groups[1].plans).toHaveLength(1);
  });

  it('derives dependencies from plan status', () => {
    const plans = [
      makePlan({ id: 'passed', status: 'passed' }),
      makePlan({ id: 'pending', status: 'draft', predecessor_plan_ids: ['passed'] }),
    ];

    const deps = calculateDependencies(plans);

    expect(deps).toEqual([
      { from: 'passed', to: 'pending', status: 'completed' },
    ]);
  });

  it('counts shared acceptance statuses consistently', () => {
    const stats = summarizeAcceptancePlans([
      makePlan({ id: 'pending', status: 'draft' }),
      makePlan({ id: 'in-progress', status: 'inspecting' }),
      makePlan({ id: 'passed', status: 'passed' }),
      makePlan({ id: 'failed', status: 'rectifying' }),
      makePlan({ id: 'needs-revision', status: 'rectifying' }),
      makePlan({ id: 'zh-needs-revision', status: '整改中' as AcceptancePlan['status'] }),
    ]);

    expect(stats).toEqual({
      total: 6,
      passed: 1,
      inProgress: 1,
      pending: 1,
      failed: 3,
      blockedCount: 0,
      dueSoon30dCount: 0,
      keyMilestoneCount: 0,
      completionRate: 17,
    });
  });
});
