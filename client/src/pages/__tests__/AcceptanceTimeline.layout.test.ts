import { describe, expect, it } from 'vitest'

import type { AcceptancePlan } from '@/types/acceptance'

import {
  buildAcceptanceFlowLayout,
  buildAcceptanceFlowRelations,
  getAcceptanceRelationFocus,
  getAcceptanceRelationState,
} from '../AcceptanceTimeline/utils/layout'

const plans = [
  {
    id: 'plan-early',
    project_id: 'project-1',
    milestone_id: 'milestone-1',
    type_id: 'pre_acceptance',
    type_name: 'Pre Acceptance',
    type_color: 'bg-purple-500',
    name: 'Early',
    description: 'Early month item',
    planned_date: '2026-04-03',
    actual_date: null,
    status: 'pending',
    predecessor_plan_ids: [],
    successor_plan_ids: [],
    phase_code: 'phase1',
    phase_order: 1,
    display_badges: [],
    documents: [],
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
  },
  {
    id: 'plan-late-a',
    project_id: 'project-1',
    milestone_id: 'milestone-2',
    type_id: 'fire',
    type_name: 'Fire',
    type_color: 'bg-rose-500',
    name: 'Late A',
    description: 'Late bucket A',
    planned_date: '2026-04-17',
    actual_date: null,
    status: 'pending',
    predecessor_plan_ids: [],
    successor_plan_ids: [],
    phase_code: 'phase1',
    phase_order: 2,
    display_badges: [],
    documents: [],
    created_at: '2026-04-02T00:00:00.000Z',
    updated_at: '2026-04-02T00:00:00.000Z',
  },
  {
    id: 'plan-late-b',
    project_id: 'project-1',
    milestone_id: 'milestone-3',
    type_id: 'planning',
    type_name: 'Planning',
    type_color: 'bg-emerald-500',
    name: 'Late B',
    description: 'Late bucket B',
    planned_date: '2026-04-17',
    actual_date: null,
    status: 'pending',
    predecessor_plan_ids: [],
    successor_plan_ids: [],
    phase_code: 'phase1',
    phase_order: 3,
    display_badges: [],
    documents: [],
    created_at: '2026-04-03T00:00:00.000Z',
    updated_at: '2026-04-03T00:00:00.000Z',
  },
  {
    id: 'plan-elsewhere',
    project_id: 'project-1',
    milestone_id: 'milestone-4',
    type_id: 'four_party',
    type_name: 'Four Party',
    type_color: 'bg-blue-500',
    name: 'Elsewhere',
    description: 'Different phase',
    planned_date: '2026-05-05',
    actual_date: null,
    status: 'pending',
    predecessor_plan_ids: [],
    successor_plan_ids: [],
    phase_code: 'phase2',
    phase_order: 1,
    display_badges: [],
    documents: [],
    created_at: '2026-04-04T00:00:00.000Z',
    updated_at: '2026-04-04T00:00:00.000Z',
  },
  {
    id: 'plan-mid-week',
    project_id: 'project-1',
    milestone_id: 'milestone-6',
    type_id: 'planning',
    type_name: 'Planning',
    type_color: 'bg-emerald-500',
    name: 'Mid Week',
    description: 'Mid week item',
    planned_date: '2026-04-25',
    actual_date: null,
    status: 'pending',
    predecessor_plan_ids: [],
    successor_plan_ids: [],
    phase_code: 'phase2',
    phase_order: 2,
    display_badges: [],
    documents: [],
    created_at: '2026-04-06T00:00:00.000Z',
    updated_at: '2026-04-06T00:00:00.000Z',
  },
  {
    id: 'plan-unscheduled',
    project_id: 'project-1',
    milestone_id: 'milestone-5',
    type_id: 'completion_record',
    type_name: 'Completion Record',
    type_color: 'bg-slate-500',
    name: 'Unscheduled',
    description: 'No planned date',
    planned_date: null as never,
    actual_date: null,
    status: 'pending',
    predecessor_plan_ids: [],
    successor_plan_ids: [],
    phase_code: 'phase1',
    phase_order: 4,
    display_badges: [],
    documents: [],
    created_at: '2026-04-05T00:00:00.000Z',
    updated_at: '2026-04-05T00:00:00.000Z',
  },
] as unknown as AcceptancePlan[]

describe('Acceptance flow layout', () => {
  it('lets month, biweek, and week buckets reshape the board deterministically', () => {
    const month = buildAcceptanceFlowLayout(plans, 'month')
    const biweek = buildAcceptanceFlowLayout(plans, 'biweek')
    const week = buildAcceptanceFlowLayout(plans, 'week')

    expect(month.buckets.map((bucket) => bucket.key)).toEqual(['month:2026-04', 'month:2026-05', 'unscheduled'])
    expect(biweek.buckets.map((bucket) => bucket.key)).toEqual([
      'biweek:2026-04:a',
      'biweek:2026-04:b',
      'biweek:2026-05:a',
      'unscheduled',
    ])
    expect(week.buckets.map((bucket) => bucket.key)).toEqual([
      'week:2026-03-30',
      'week:2026-04-13',
      'week:2026-04-20',
      'week:2026-05-04',
      'unscheduled',
    ])

    expect(month.placements['plan-elsewhere'].bucketIndex).toBe(1)
    expect(biweek.placements['plan-elsewhere'].bucketIndex).toBe(2)
    expect(week.placements['plan-elsewhere'].bucketIndex).toBe(3)
    expect(month.nodes.find((item) => item.id === 'plan-unscheduled')?.x).toBe(
      buildAcceptanceFlowLayout(plans, 'month').nodes.find((item) => item.id === 'plan-unscheduled')?.x,
    )
    expect(month.nodes.find((item) => item.id === 'plan-unscheduled')?.y).toBe(
      buildAcceptanceFlowLayout(plans, 'month').nodes.find((item) => item.id === 'plan-unscheduled')?.y,
    )
    expect(biweek.placements['plan-late-a'].stackIndex).toBe(0)
    expect(biweek.placements['plan-late-b'].stackIndex).toBe(1)
  })

  it('builds a stable relation graph for fan-out and merge structures', () => {
    const relationPlans = [
      {
        id: 'plan-a',
        project_id: 'project-1',
        milestone_id: 'milestone-a',
        type_id: 'pre_acceptance',
        type_name: 'Pre Acceptance',
        type_color: 'bg-purple-500',
        name: 'Plan A',
        description: 'Root item',
        planned_date: '2026-04-01',
        actual_date: null,
        status: 'pending',
        predecessor_plan_ids: [],
        successor_plan_ids: [],
        phase_code: 'phase1',
        phase_order: 1,
        display_badges: [],
        documents: [],
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
      {
        id: 'plan-b',
        project_id: 'project-1',
        milestone_id: 'milestone-b',
        type_id: 'four_party',
        type_name: 'Four Party',
        type_color: 'bg-blue-500',
        name: 'Plan B',
        description: 'Dependent item',
        planned_date: '2026-04-08',
        actual_date: null,
        status: 'pending',
        predecessor_plan_ids: ['plan-a'],
        successor_plan_ids: [],
        phase_code: 'phase1',
        phase_order: 2,
        display_badges: [],
        documents: [],
        created_at: '2026-04-02T00:00:00.000Z',
        updated_at: '2026-04-02T00:00:00.000Z',
      },
      {
        id: 'plan-c',
        project_id: 'project-1',
        milestone_id: 'milestone-c',
        type_id: 'planning',
        type_name: 'Planning',
        type_color: 'bg-emerald-500',
        name: 'Plan C',
        description: 'Merge item',
        planned_date: '2026-04-15',
        actual_date: null,
        status: 'pending',
        predecessor_plan_ids: ['plan-a', 'plan-b'],
        successor_plan_ids: [],
        phase_code: 'phase2',
        phase_order: 1,
        display_badges: [],
        documents: [],
        created_at: '2026-04-03T00:00:00.000Z',
        updated_at: '2026-04-03T00:00:00.000Z',
      },
    ] as unknown as AcceptancePlan[]

    const layout = buildAcceptanceFlowLayout(relationPlans, 'month')
    const graph = buildAcceptanceFlowRelations(relationPlans, layout)

    expect(graph.edges.map((edge) => edge.id)).toEqual(['plan-a->plan-b', 'plan-a->plan-c', 'plan-b->plan-c'])
    expect(graph.downstreamBySource['plan-a']).toEqual(['plan-b', 'plan-c'])
    expect(graph.upstreamByTarget['plan-c']).toEqual(['plan-a', 'plan-b'])

    const focus = getAcceptanceRelationFocus(graph, 'plan-c')
    expect(focus.upstream.has('plan-a')).toBe(true)
    expect(focus.upstream.has('plan-b')).toBe(true)
    expect(focus.downstream.size).toBe(0)

    const sourceState = getAcceptanceRelationState(graph, 'plan-a', 'plan-c')
    expect(sourceState.isDownstream).toBe(true)
    expect(sourceState.hasFanIn).toBe(true)

    const mergeState = getAcceptanceRelationState(graph, 'plan-c', 'plan-a')
    expect(mergeState.isUpstream).toBe(true)
    expect(mergeState.hasFanOut).toBe(true)

    const fanOutEdge = graph.edges.find((edge) => edge.id === 'plan-a->plan-c')
    expect(fanOutEdge?.parallelCount).toBe(2)
  })
})
