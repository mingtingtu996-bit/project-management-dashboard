import {
  type DurationContributionMode,
  normalizeDurationContributionMode,
} from '../seeds/durationContributionMode.js'
import { inclusiveDurationDays } from '../utils/durationDays.js'
import {
  addConstructionProductionDays,
  parseConstructionCalendarDate,
  productionDaysBetweenInclusive,
  type ConstructionCalendarContext,
} from './constructionCalendar.js'

export type WbsPlanRollupNodeType =
  | 'division'
  | 'sub_division'
  | 'item_work'
  | 'process'
  | 'activity_step'
  | 'custom'
  | string

export type WbsPlanRollupChild = {
  plannedStartDate?: unknown
  plannedEndDate?: unknown
  referenceDuration?: unknown
  durationContributionMode?: unknown
  wbsNodeType?: WbsPlanRollupNodeType | null
}

export type WbsPlanRollupDiagnostics = {
  durationBasis: 'calendar_day' | 'production_day'
  calendarApplied: boolean
  inputChildCount: number
  datedChildCount: number
  ignoredNoDateChildCount: number
  invalidDateChildCount: number
  nonDurationBearingChildCount: number
  missingDurationContributionModeCount: number
  invalidDurationContributionModeCount: number
  excludedReferenceDurationChildCount: number
  excludedWindowChildCount: number
  windowContributorCount: number
  referenceDurationContributorCount: number
  warnings: string[]
}

export type WbsPlanRollupResult = {
  plannedStartDate: string
  plannedEndDate: string
  plannedDurationDays: number
  referenceDurationDays: number
  childReferenceDurationTotal: number
  childCount: number
  rollupSource: 'child_plan_window'
  referenceDurationPolicy: 'date_window' | 'activity_step_sum'
  diagnostics: WbsPlanRollupDiagnostics
}

export type WbsPlanRollupValidationIssueLevel = 'error' | 'warning' | 'info'

export type WbsPlanRollupValidationIssue = {
  code:
    | 'MISSING_ROW_ID'
    | 'DUPLICATE_ROW_ID'
    | 'MISSING_PARENT_ROW'
    | 'SELF_PARENT'
    | 'CYCLE_PARENT_CHAIN'
    | 'INVALID_WBS_HIERARCHY'
    | 'MISSING_PLANNED_DATE'
    | 'INVALID_PLANNED_DATE'
    | 'INVALID_REFERENCE_DURATION'
    | 'MISSING_DURATION_CONTRIBUTION_MODE'
    | 'INVALID_DURATION_CONTRIBUTION_MODE'
  level: WbsPlanRollupValidationIssueLevel
  message: string
  rowId?: string
  parentId?: string
  field?: string
  details?: Record<string, unknown>
}

export type WbsPlanRollupOptions = {
  workCalendar?: ConstructionCalendarContext | null
}

export type WbsPlanRollupRowAccessors<T> = {
  getId: (row: T) => string
  getParentId: (row: T) => string | null | undefined
  getNodeType: (row: T) => WbsPlanRollupNodeType | null | undefined
  getPlannedStartDate: (row: T) => unknown
  getPlannedEndDate: (row: T) => unknown
  getReferenceDuration: (row: T) => unknown
  getDurationContributionMode?: (row: T) => unknown
}

type DateOnlyRead = {
  date: string | null
  invalid: boolean
}

type DurationModeRead = {
  mode: DurationContributionMode
  missing: boolean
  invalid: boolean
}

type EvaluatedRollupChild = WbsPlanRollupChild & {
  plannedStartDate: string
  plannedEndDate: string
  plannedDuration: number
  referenceDuration: number
  durationContributionMode: DurationContributionMode
  contributesReferenceDuration: boolean
  contributesPlannedWindow: boolean
}

const CANONICAL_WBS_NODE_ORDER: Record<string, number> = {
  division: 0,
  sub_division: 1,
  item_work: 2,
  process: 3,
  activity_step: 4,
}

function normalizeId(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

function readDateOnly(value: unknown): DateOnlyRead {
  if (value === null || value === undefined) return { date: null, invalid: false }
  const text = String(value).trim()
  if (!text) return { date: null, invalid: false }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : text.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { date, invalid: true }
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return { date, invalid: true }
  }
  return { date, invalid: false }
}

function normalizeDateOnly(value: unknown): string | null {
  const result = readDateOnly(value)
  return result?.invalid ? null : result?.date ?? null
}

function readPositiveInteger(value: unknown): number | null {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.max(1, Math.round(numeric))
}

function hasConstructionCalendar(calendar?: ConstructionCalendarContext | null) {
  return calendar?.basis === 'official_construction_calendar_seed'
}

export function addPlanDays(date: string, days: number, calendar?: ConstructionCalendarContext | null) {
  if (hasConstructionCalendar(calendar)) {
    const parsed = parseConstructionCalendarDate(date)
    if (parsed) return addConstructionProductionDays(parsed, Math.max(1, Math.ceil(days) + 1), calendar)
  }
  const parsed = new Date(`${date}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

export function inclusivePlanDuration(start: unknown, end: unknown, calendar?: ConstructionCalendarContext | null) {
  const startDate = normalizeDateOnly(start)
  const endDate = normalizeDateOnly(end)
  if (!startDate || !endDate) return 1
  if (hasConstructionCalendar(calendar)) {
    const parsedStart = parseConstructionCalendarDate(startDate)
    const parsedEnd = parseConstructionCalendarDate(endDate)
    if (parsedStart && parsedEnd) return Math.max(1, productionDaysBetweenInclusive(parsedStart, parsedEnd, calendar))
  }
  return inclusiveDurationDays(startDate, endDate) ?? 1
}

export function distributePlanDurationAcrossActivitySteps(totalDays: number, stepCount: number) {
  if (stepCount <= 0) return []
  const normalizedTotal = Math.max(stepCount, Math.ceil(totalDays || stepCount))
  const base = Math.floor(normalizedTotal / stepCount)
  const remainder = normalizedTotal % stepCount
  return Array.from({ length: stepCount }, (_item, index) => base + (index < remainder ? 1 : 0))
}

function readDurationContributionMode(value: unknown): DurationModeRead {
  const raw = String(value ?? '').trim()
  const normalized = normalizeDurationContributionMode(value)
  if (normalized) return { mode: normalized, missing: false, invalid: false }
  return {
    mode: 'duration_bearing',
    missing: raw.length === 0,
    invalid: raw.length > 0,
  }
}

function contributesReferenceDuration(mode: DurationContributionMode) {
  return mode === 'duration_bearing'
}

export function contributesToWbsPlannedWindow(value: unknown) {
  const mode = readDurationContributionMode(value).mode
  return mode === 'duration_bearing'
    || mode === 'quality_gate'
    || mode === 'external_wait'
    || mode === 'handover_marker'
}

function buildDiagnostics(inputChildCount: number, calendar?: ConstructionCalendarContext | null): WbsPlanRollupDiagnostics {
  const calendarApplied = hasConstructionCalendar(calendar)
  return {
    durationBasis: calendarApplied ? 'production_day' : 'calendar_day',
    calendarApplied,
    inputChildCount,
    datedChildCount: 0,
    ignoredNoDateChildCount: 0,
    invalidDateChildCount: 0,
    nonDurationBearingChildCount: 0,
    missingDurationContributionModeCount: 0,
    invalidDurationContributionModeCount: 0,
    excludedReferenceDurationChildCount: 0,
    excludedWindowChildCount: 0,
    windowContributorCount: 0,
    referenceDurationContributorCount: 0,
    warnings: [],
  }
}

function finalizeDiagnostics(diagnostics: WbsPlanRollupDiagnostics) {
  const warnings: string[] = []
  if (diagnostics.ignoredNoDateChildCount > 0) {
    warnings.push(`${diagnostics.ignoredNoDateChildCount} child row(s) are missing planned dates and were ignored by rollup.`)
  }
  if (diagnostics.invalidDateChildCount > 0) {
    warnings.push(`${diagnostics.invalidDateChildCount} child row(s) have invalid planned date windows and were ignored by rollup.`)
  }
  if (diagnostics.missingDurationContributionModeCount > 0) {
    warnings.push(`${diagnostics.missingDurationContributionModeCount} child row(s) are missing durationContributionMode and were treated as duration_bearing for compatibility.`)
  }
  if (diagnostics.invalidDurationContributionModeCount > 0) {
    warnings.push(`${diagnostics.invalidDurationContributionModeCount} child row(s) have invalid durationContributionMode and were treated as duration_bearing for compatibility.`)
  }
  if (diagnostics.excludedReferenceDurationChildCount > 0) {
    warnings.push(`${diagnostics.excludedReferenceDurationChildCount} non-duration-bearing child row(s) were excluded from reference duration rollup.`)
  }
  if (diagnostics.excludedWindowChildCount > 0) {
    warnings.push(`${diagnostics.excludedWindowChildCount} child row(s) do not contribute to the parent planned window.`)
  }
  diagnostics.warnings = warnings
  return diagnostics
}

function earliestDate(children: EvaluatedRollupChild[]) {
  return children.reduce((earliest, child) => (
    child.plannedStartDate < earliest ? child.plannedStartDate : earliest
  ), children[0]!.plannedStartDate)
}

function latestDate(children: EvaluatedRollupChild[]) {
  return children.reduce((latest, child) => (
    child.plannedEndDate > latest ? child.plannedEndDate : latest
  ), children[0]!.plannedEndDate)
}

export function calculateWbsParentPlanRollup(
  parentNodeType: WbsPlanRollupNodeType | null | undefined,
  children: WbsPlanRollupChild[],
  options: WbsPlanRollupOptions = {},
): WbsPlanRollupResult | null {
  const diagnostics = buildDiagnostics(children.length, options.workCalendar)
  const evaluatedChildren = children
    .map((child) => {
      const mode = readDurationContributionMode(child.durationContributionMode)
      const start = readDateOnly(child.plannedStartDate)
      const end = readDateOnly(child.plannedEndDate)
      const missingDate = !start?.date || !end?.date
      const invalidDate = Boolean(start?.invalid || end?.invalid || (
        start?.date && end?.date && end.date < start.date
      ))

      if (mode.missing) diagnostics.missingDurationContributionModeCount += 1
      if (mode.invalid) diagnostics.invalidDurationContributionModeCount += 1
      if (!contributesReferenceDuration(mode.mode)) diagnostics.nonDurationBearingChildCount += 1
      if (invalidDate) {
        diagnostics.invalidDateChildCount += 1
        return null
      }
      if (missingDate) {
        diagnostics.ignoredNoDateChildCount += 1
        return null
      }

      diagnostics.datedChildCount += 1
      const plannedDuration = inclusivePlanDuration(start.date, end.date, options.workCalendar)
      const contributesToReference = contributesReferenceDuration(mode.mode)
      const contributesToWindow = contributesToWbsPlannedWindow(mode.mode)
      if (contributesToReference) {
        diagnostics.referenceDurationContributorCount += 1
      } else {
        diagnostics.excludedReferenceDurationChildCount += 1
      }
      if (contributesToWindow) {
        diagnostics.windowContributorCount += 1
      } else {
        diagnostics.excludedWindowChildCount += 1
      }
      return {
        ...child,
        plannedStartDate: start.date!,
        plannedEndDate: end.date!,
        plannedDuration,
        durationContributionMode: mode.mode,
        referenceDuration: contributesToReference
          ? readPositiveInteger(child.referenceDuration) ?? plannedDuration
          : 0,
        contributesReferenceDuration: contributesToReference,
        contributesPlannedWindow: contributesToWindow,
      }
    })
    .filter((child): child is EvaluatedRollupChild => Boolean(child))

  const windowChildren = evaluatedChildren.filter((child) => child.contributesPlannedWindow)
  if (windowChildren.length === 0) return null

  const plannedStartDate = earliestDate(windowChildren)
  const plannedEndDate = latestDate(windowChildren)
  const plannedDurationDays = inclusivePlanDuration(plannedStartDate, plannedEndDate, options.workCalendar)
  const referenceChildren = evaluatedChildren.filter((child) => child.contributesReferenceDuration)
  const childReferenceDurationTotal = referenceChildren.reduce((sum, child) => sum + child.referenceDuration, 0)
  const referenceWindowDurationDays = referenceChildren.length > 0
    ? inclusivePlanDuration(earliestDate(referenceChildren), latestDate(referenceChildren), options.workCalendar)
    : 0
  const allChildrenAreActivitySteps = evaluatedChildren.every((child) => child.wbsNodeType === 'activity_step')
  const parentIsProcess = parentNodeType === 'process'
  const referenceDurationPolicy = parentIsProcess && allChildrenAreActivitySteps
    ? 'activity_step_sum'
    : 'date_window'
  const finalDiagnostics = finalizeDiagnostics(diagnostics)

  return {
    plannedStartDate,
    plannedEndDate,
    plannedDurationDays,
    referenceDurationDays: referenceDurationPolicy === 'activity_step_sum'
      ? childReferenceDurationTotal
      : referenceWindowDurationDays,
    childReferenceDurationTotal,
    childCount: evaluatedChildren.length,
    rollupSource: 'child_plan_window',
    referenceDurationPolicy,
    diagnostics: finalDiagnostics,
  }
}

export function validateWbsPlanRollupRows<T>(rows: T[], options: WbsPlanRollupRowAccessors<T>) {
  const issues: WbsPlanRollupValidationIssue[] = []
  const rowsById = new Map<string, T>()
  const idCounts = new Map<string, number>()

  for (const row of rows) {
    const id = normalizeId(options.getId(row))
    if (!id) {
      issues.push({
        code: 'MISSING_ROW_ID',
        level: 'error',
        message: 'WBS row id is required for parent-child rollup validation.',
        field: 'id',
      })
      continue
    }
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1)
    if (!rowsById.has(id)) rowsById.set(id, row)
  }

  for (const [id, count] of idCounts) {
    if (count > 1) {
      issues.push({
        code: 'DUPLICATE_ROW_ID',
        level: 'error',
        message: 'WBS row id must be unique before rollup.',
        rowId: id,
        field: 'id',
        details: { count },
      })
    }
  }

  for (const row of rows) {
    const id = normalizeId(options.getId(row))
    if (!id) continue

    const parentId = normalizeId(options.getParentId(row))
    if (parentId === id) {
      issues.push({
        code: 'SELF_PARENT',
        level: 'error',
        message: 'WBS row cannot use itself as parent.',
        rowId: id,
        parentId,
        field: 'parentId',
      })
    } else if (parentId && !rowsById.has(parentId)) {
      issues.push({
        code: 'MISSING_PARENT_ROW',
        level: 'warning',
        message: 'WBS parent row is missing from the editable tree.',
        rowId: id,
        parentId,
        field: 'parentId',
      })
    }

    const modeValue = options.getDurationContributionMode?.(row)
    const rawMode = String(modeValue ?? '').trim()
    if (!rawMode) {
      issues.push({
        code: 'MISSING_DURATION_CONTRIBUTION_MODE',
        level: 'error',
        message: 'durationContributionMode is required for new WBS rollup writes.',
        rowId: id,
        field: 'durationContributionMode',
      })
    } else if (!normalizeDurationContributionMode(modeValue)) {
      issues.push({
        code: 'INVALID_DURATION_CONTRIBUTION_MODE',
        level: 'error',
        message: 'durationContributionMode is not recognized.',
        rowId: id,
        field: 'durationContributionMode',
        details: { value: rawMode },
      })
    }

    const start = readDateOnly(options.getPlannedStartDate(row))
    const end = readDateOnly(options.getPlannedEndDate(row))
    if (start.invalid || end.invalid || (start.date && end.date && end.date < start.date)) {
      issues.push({
        code: 'INVALID_PLANNED_DATE',
        level: 'error',
        message: 'Planned date window is invalid.',
        rowId: id,
        field: 'plannedDateWindow',
        details: { plannedStartDate: start.date, plannedEndDate: end.date },
      })
    } else if (!start.date || !end.date) {
      issues.push({
        code: 'MISSING_PLANNED_DATE',
        level: 'warning',
        message: 'Planned start and end dates are required for parent rollup.',
        rowId: id,
        field: !start.date ? 'plannedStartDate' : 'plannedEndDate',
      })
    }

    const mode = readDurationContributionMode(modeValue)
    if (contributesReferenceDuration(mode.mode)) {
      const referenceDuration = options.getReferenceDuration(row)
      const hasExplicitReferenceDuration = String(referenceDuration ?? '').trim().length > 0
      if (hasExplicitReferenceDuration && readPositiveInteger(referenceDuration) == null) {
        issues.push({
          code: 'INVALID_REFERENCE_DURATION',
          level: 'warning',
          message: 'Duration-bearing WBS row has invalid reference duration days; rollup will fall back to planned duration.',
          rowId: id,
          field: 'referenceDuration',
          details: { value: referenceDuration },
        })
      }
    }

    const parent = parentId ? rowsById.get(parentId) : null
    if (parent) {
      const parentType = String(options.getNodeType(parent) ?? '').trim()
      const childType = String(options.getNodeType(row) ?? '').trim()
      const parentOrder = CANONICAL_WBS_NODE_ORDER[parentType]
      const childOrder = CANONICAL_WBS_NODE_ORDER[childType]
      if (parentType === 'activity_step' || (
        parentOrder !== undefined
        && childOrder !== undefined
        && childOrder <= parentOrder
      )) {
        issues.push({
          code: 'INVALID_WBS_HIERARCHY',
          level: 'error',
          message: 'WBS parent-child node types are not in a valid downward hierarchy.',
          rowId: id,
          parentId,
          field: 'wbsNodeType',
          details: { parentType, childType },
        })
      }
    }
  }

  const visitState = new Map<string, 'visiting' | 'visited'>()
  const reportedCycles = new Set<string>()
  const visit = (id: string, path: string[]) => {
    const state = visitState.get(id)
    if (state === 'visited') return
    if (state === 'visiting') {
      const cycleStart = path.indexOf(id)
      const cycle = cycleStart >= 0 ? path.slice(cycleStart).concat(id) : path.concat(id)
      const cycleKey = [...new Set(cycle)].sort().join('>')
      if (!reportedCycles.has(cycleKey)) {
        reportedCycles.add(cycleKey)
        issues.push({
          code: 'CYCLE_PARENT_CHAIN',
          level: 'error',
          message: 'WBS parent chain contains a cycle.',
          rowId: id,
          field: 'parentId',
          details: { cycle },
        })
      }
      return
    }

    visitState.set(id, 'visiting')
    const row = rowsById.get(id)
    const parentId = row ? normalizeId(options.getParentId(row)) : null
    if (parentId && rowsById.has(parentId)) visit(parentId, path.concat(id))
    visitState.set(id, 'visited')
  }

  for (const id of rowsById.keys()) visit(id, [])

  return issues
}

export function applyWbsPlanRollupToRows<T>(rows: T[], options: WbsPlanRollupRowAccessors<T> & {
  applyRollup: (row: T, rollup: WbsPlanRollupResult) => void
  workCalendar?: ConstructionCalendarContext | null
}) {
  const rowsById = new Map(rows.map((row) => [options.getId(row), row]))
  const childrenByParent = new Map<string, T[]>()

  for (const row of rows) {
    const parentId = options.getParentId(row)
    if (!parentId || !rowsById.has(parentId)) continue
    const siblings = childrenByParent.get(parentId) ?? []
    siblings.push(row)
    childrenByParent.set(parentId, siblings)
  }

  const visited = new Set<string>()
  const rollups = new Map<string, WbsPlanRollupResult>()

  const visit = (row: T) => {
    const id = options.getId(row)
    if (visited.has(id)) return
    visited.add(id)

    const children = childrenByParent.get(id) ?? []
    children.forEach(visit)
    if (children.length === 0) return

    const rollup = calculateWbsParentPlanRollup(
      options.getNodeType(row),
      children.map((child) => ({
        plannedStartDate: options.getPlannedStartDate(child),
        plannedEndDate: options.getPlannedEndDate(child),
        referenceDuration: options.getReferenceDuration(child),
        durationContributionMode: options.getDurationContributionMode?.(child),
        wbsNodeType: options.getNodeType(child),
      })),
      { workCalendar: options.workCalendar },
    )
    if (!rollup) return
    options.applyRollup(row, rollup)
    rollups.set(id, rollup)
  }

  rows.forEach(visit)
  return rollups
}
