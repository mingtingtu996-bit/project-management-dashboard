import { describe, expect, it } from 'vitest'
import {
  getPlanningFieldRegistry,
  normalizePlanningSurface,
  PLANNING_FIELD_GROUPS,
  PLANNING_FIELD_REGISTRY,
  PLANNING_FIELD_REGISTRY_VERSION,
} from '../services/planningFieldRegistryService.js'

describe('planning field registry service', () => {
  it('returns a stable v1.4.7.3 registry for all shared planning surfaces', () => {
    const timestamp = '2026-05-13T00:00:00.000Z'
    const publicRegistryFields = PLANNING_FIELD_REGISTRY.filter((field) => field.key !== 'template_node_id')

    for (const surface of ['baseline', 'monthly_plan', 'task_list'] as const) {
      const registry = getPlanningFieldRegistry(surface, timestamp)

      expect(registry.registryVersion).toBe(PLANNING_FIELD_REGISTRY_VERSION)
      expect(registry.surface).toBe(surface)
      expect(registry.updatedAt).toBe(timestamp)
      expect(registry.generatedAt).toBe(timestamp)
      // v1.4.7.3 §12.2: baseline excludes progress_fact/acceptance_impact/quality_hint/dependency
      if (surface === 'baseline') {
        const keys = registry.fields.map(f => f.key)
        expect(keys).not.toContain('progress')
        expect(keys).not.toContain('actual_start_date')
        expect(keys).not.toContain('predecessor_task_ids')
      }
      if (surface === 'monthly_plan') {
        const keys = registry.fields.map(f => f.key)
        expect(keys).not.toContain('predecessor_task_ids')
      }
      if (surface === 'task_list') {
        expect(registry.fields).toEqual(publicRegistryFields)
      }
      expect(registry.fields.map((field) => field.key)).not.toContain('template_node_id')
    }
  })

  it('keeps field keys unique and backed by declared display groups', () => {
    const keys = PLANNING_FIELD_REGISTRY.map((field) => field.key)
    const groupKeys = new Set(PLANNING_FIELD_GROUPS.map((group) => group.key))

    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(expect.arrayContaining([
      'title',
      'planned_start_date',
      'planned_end_date',
      'progress',
      'target_progress',
      'engineering_object_id',
      'section_object_id',
      'participant_unit_id',
      'predecessor_task_ids',
      'wbs_node_type',
      'sort_order',
      'notes',
    ]))
    expect(PLANNING_FIELD_REGISTRY.every((field) => groupKeys.has(field.displayGroup))).toBe(true)
    expect(PLANNING_FIELD_REGISTRY.some((field) => field.mergeGroup === 'readonly_derived')).toBe(true)
  })

  it('keeps editable merge groups aligned to a single display group', () => {
    const displayGroupsByMergeGroup = new Map<string, Set<string>>()

    for (const field of PLANNING_FIELD_REGISTRY) {
      expect(field.group).toBe(field.displayGroup)
      if (field.mergeGroup === 'readonly_derived') continue

      const groups = displayGroupsByMergeGroup.get(field.mergeGroup) ?? new Set<string>()
      groups.add(field.displayGroup)
      displayGroupsByMergeGroup.set(field.mergeGroup, groups)
    }

    for (const [mergeGroup, displayGroups] of displayGroupsByMergeGroup) {
      expect(Array.from(displayGroups), `${mergeGroup} should map to one display group`).toHaveLength(1)
    }
  })

  it('normalizes unknown surfaces to the task-list registry surface', () => {
    expect(normalizePlanningSurface('baseline')).toBe('baseline')
    expect(normalizePlanningSurface('not-real')).toBe('task_list')
    expect(normalizePlanningSurface(undefined)).toBe('task_list')
  })

  it('encodes the cross-system boundaries required by the shared planning tree', () => {
    const fieldsByKey = new Map(PLANNING_FIELD_REGISTRY.map((field) => [field.key, field]))

    expect(fieldsByKey.get('participant_unit_id')).toMatchObject({
      dataType: 'lookup',
      lookupSource: 'participant_units',
      editableIn: ['task_list'],
      mergeGroup: 'participant_unit',
    })
    expect(fieldsByKey.get('assignee_name')).toMatchObject({
      dataType: 'text',
      editableIn: ['task_list'],
      mergeGroup: 'assignee',
    })
    expect(fieldsByKey.get('engineering_object_id')).toMatchObject({
      dataType: 'lookup',
      lookupSource: 'engineering_objects',
      editableIn: ['task_list'],
      mergeGroup: 'engineering_object',
    })
    expect(fieldsByKey.get('predecessor_task_ids')).toMatchObject({
      dataType: 'lookup',
      lookupSource: 'tasks',
      editableIn: ['task_list'],
      mergeGroup: 'dependency',
    })

    for (const key of ['actual_start_date', 'actual_end_date', 'is_critical', 'acceptance_impact_summary', 'validation_hint', 'template_node_id']) {
      expect(fieldsByKey.get(key), `${key} must stay system-owned`).toMatchObject({
        editableIn: [],
        readonlyReasonCode: 'system_derived',
      })
    }
    expect(fieldsByKey.get('acceptance_impact_summary')).toMatchObject({
      displayGroup: 'acceptance_impact',
      mergeGroup: 'readonly_derived',
    })
  })

  it('exposes task-list schedule evidence fields for generated WBS review', () => {
    const registry = getPlanningFieldRegistry('task_list', '2026-07-07T00:00:00.000Z')
    const fieldsByKey = new Map(registry.fields.map((field) => [field.key, field]))

    expect(fieldsByKey.get('duration_risk_range')).toMatchObject({
      label: '工期风险',
      displayGroup: 'dependency',
      mergeGroup: 'readonly_derived',
      editableIn: [],
      defaultVisibleIn: ['task_list'],
      readonlyReasonCode: 'system_derived',
    })
    expect(fieldsByKey.get('total_float_days')).toMatchObject({
      label: '关键路径浮时',
      displayGroup: 'dependency',
      mergeGroup: 'readonly_derived',
      editableIn: [],
      defaultVisibleIn: ['task_list'],
      readonlyReasonCode: 'system_derived',
    })
    expect(fieldsByKey.get('duration_asset_evidence')).toMatchObject({
      label: '工期资产依据',
      displayGroup: 'template_source',
      mergeGroup: 'readonly_derived',
      editableIn: [],
      defaultVisibleIn: ['task_list'],
      readonlyReasonCode: 'system_derived',
    })
  })
})
