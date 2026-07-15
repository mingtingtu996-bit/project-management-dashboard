import { describe, expect, it } from 'vitest'

import {
  buildProjectTaskAttributionProjection,
  type ProjectTaskAttributionInput,
} from '../services/taskAttributionProjectionService.js'

function task(
  id: string,
  overrides: Partial<ProjectTaskAttributionInput> = {},
): ProjectTaskAttributionInput {
  return {
    id,
    title: id,
    parent_id: null,
    wbs_level: null,
    sort_order: 0,
    engineering_category_id: null,
    engineering_category_name: null,
    specialty_type: null,
    ...overrides,
  }
}

describe('taskAttributionProjectionService', () => {
  it('resolves division, subdivision, and governed engineering category attribution', () => {
    const projection = buildProjectTaskAttributionProjection([
      task('division-1', { title: 'Structure', wbs_level: 1, sort_order: 10 }),
      task('subdivision-1', {
        title: 'Concrete',
        parent_id: 'division-1',
        wbs_level: 2,
        sort_order: 20,
      }),
      task('task-1', {
        title: 'Pour slab',
        parent_id: 'subdivision-1',
        wbs_level: 3,
        engineering_category_id: 'category-1',
        engineering_category_name: 'Civil',
        specialty_type: 'legacy-civil-label',
      }),
    ])

    expect(projection.get('task-1')).toEqual({
      divisionId: 'division-1',
      divisionName: 'Structure',
      divisionSortOrder: 10,
      subdivisionId: 'subdivision-1',
      subdivisionName: 'Concrete',
      subdivisionSortOrder: 20,
      specialtyId: 'category-1',
      specialtyName: 'Civil',
      specialtySortOrder: 0,
      specialtySource: 'engineering_category',
      degradationReasons: [],
    })
  })

  it('uses an explicit specialty business label as a stable degraded fallback', () => {
    const projection = buildProjectTaskAttributionProjection([
      task('task-facade', { specialty_type: ' Facade Works ' }),
    ])

    expect(projection.get('task-facade')).toEqual(expect.objectContaining({
      specialtyId: 'specialty-label:facade-works',
      specialtyName: 'Facade Works',
      specialtySource: 'business_label',
      degradationReasons: expect.arrayContaining([
        'missing_division_attribution',
        'missing_subdivision_attribution',
        'specialty_business_label_fallback',
      ]),
    }))
  })

  it('uses the product specialty taxonomy to merge only true code and label aliases', () => {
    const projection = buildProjectTaskAttributionProjection([
      task('task-mep-category', {
        engineering_category_id: 'category-mep',
        engineering_category_name: '机电安装',
      }),
      task('task-mep-label', { specialty_type: '机电' }),
      task('task-curtain-category', {
        engineering_category_id: 'category-curtain',
        engineering_category_name: '幕墙工程',
      }),
      task('task-curtain-code', { specialty_type: 'curtain_wall' }),
      task('task-waterproof', { specialty_type: 'waterproof' }),
      task('task-doors', { specialty_type: '门窗工程' }),
      task('task-envelope-energy', { specialty_type: '围护节能' }),
    ])

    expect(projection.get('task-mep-category')).toEqual(expect.objectContaining({
      specialtyId: 'mep',
      specialtyName: '机电安装',
      specialtySource: 'engineering_category',
    }))
    expect(projection.get('task-mep-label')).toEqual(expect.objectContaining({
      specialtyId: 'mep',
      specialtyName: '机电安装',
      specialtySource: 'business_label',
    }))
    expect(projection.get('task-curtain-category')).toEqual(expect.objectContaining({
      specialtyId: 'curtain_wall',
      specialtyName: '幕墙工程',
    }))
    expect(projection.get('task-curtain-code')).toEqual(expect.objectContaining({
      specialtyId: 'curtain_wall',
      specialtyName: '幕墙工程',
    }))
    expect(projection.get('task-waterproof')).toEqual(expect.objectContaining({
      specialtyId: 'waterproof',
      specialtyName: '防水工程',
    }))
    expect(projection.get('task-doors')).toEqual(expect.objectContaining({
      specialtyId: 'specialty-label:门窗工程',
      specialtyName: '门窗工程',
      specialtySource: 'business_label',
    }))
    expect(projection.get('task-envelope-energy')).toEqual(expect.objectContaining({
      specialtyId: 'specialty-label:围护节能',
      specialtyName: '围护节能',
      specialtySource: 'business_label',
    }))
    expect(projection.get('task-doors')?.specialtyId).not.toBe('curtain_wall')
    expect(projection.get('task-envelope-energy')?.specialtyId).not.toBe('curtain_wall')
  })

  it('keeps missing attribution explicit instead of inferring from task titles', () => {
    const projection = buildProjectTaskAttributionProjection([
      task('task-unassigned', { title: 'Concrete-looking title' }),
    ])

    expect(projection.get('task-unassigned')).toEqual(expect.objectContaining({
      divisionId: null,
      subdivisionId: null,
      specialtyId: null,
      specialtySource: 'unassigned',
      degradationReasons: [
        'missing_division_attribution',
        'missing_subdivision_attribution',
        'missing_specialty_attribution',
      ],
    }))
  })

  it('stops cyclic parent traversal and reports degraded WBS attribution', () => {
    const projection = buildProjectTaskAttributionProjection([
      task('task-a', { parent_id: 'task-b', wbs_level: 3 }),
      task('task-b', { parent_id: 'task-a', wbs_level: 3 }),
    ])

    expect(projection.get('task-a')).toEqual(expect.objectContaining({
      divisionId: null,
      subdivisionId: null,
      degradationReasons: expect.arrayContaining(['wbs_parent_cycle']),
    }))
    expect(projection.get('task-b')).toEqual(expect.objectContaining({
      degradationReasons: expect.arrayContaining(['wbs_parent_cycle']),
    }))
  })
})
