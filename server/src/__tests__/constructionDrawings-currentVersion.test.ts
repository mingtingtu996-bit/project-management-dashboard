import { readFile } from 'node:fs/promises'
import express from 'express'
import supertest from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'

type PackageRow = {
  id: string
  project_id: string
  package_code: string
  current_version_drawing_id: string | null
  updated_at?: string
}

type DrawingRow = {
  id: string
  project_id: string
  package_id: string
  package_code: string
  package_name?: string | null
  drawing_name: string
  version_no: string
  version?: string
  lock_version?: number
  is_current_version: boolean | number | string
  created_at: string
  sort_order?: number
  drawing_type?: string
  status?: string
  review_status?: string
  review_mode?: string | null
  discipline_type?: string | null
  document_purpose?: string | null
  related_license_id?: string | null
  planned_submit_date?: string | null
  actual_submit_date?: string | null
  planned_pass_date?: string | null
  actual_pass_date?: string | null
  has_change?: boolean | number | string | null
  schedule_impact_flag?: boolean | number | string | null
  change_reason?: string | null
  updated_at?: string
}

type VersionRow = {
  id: string
  project_id: string
  package_id: string
  drawing_id: string
  parent_drawing_id?: string | null
  version_no: string
  revision_no?: string | null
  issued_for?: string | null
  effective_date?: string | null
  is_current_version: boolean | number | string
  superseded_at?: string | null
  created_at: string
  updated_at?: string
  created_by?: string | null
  change_reason?: string | null
}

type CertificateWorkItemRow = {
  id: string
  project_id: string
  item_code?: string | null
  item_name: string
  item_stage: string
  status: string
  planned_finish_date?: string | null
  actual_finish_date?: string | null
  approving_authority?: string | null
  is_shared?: boolean | number | string | null
  next_action?: string | null
  next_action_due_date?: string | null
  is_blocked?: boolean | number | string | null
  block_reason?: string | null
  sort_order?: number
  notes?: string | null
  latest_record_at?: string | null
  created_at: string
  updated_at: string
}

type CertificateDependencyRow = {
  id: string
  project_id: string
  predecessor_type: string
  predecessor_id: string
  successor_type: string
  successor_id: string
  dependency_kind: string
  notes?: string | null
  created_at: string
}

const db = vi.hoisted(() => {
  const packages: PackageRow[] = []
  const drawings: DrawingRow[] = []
  const versions: VersionRow[] = []
  const certificateWorkItems: CertificateWorkItemRow[] = []
  const certificateDependencies: CertificateDependencyRow[] = []
  const persistNotification = vi.fn(async (payload: Record<string, unknown>) => payload)
  const getMembers = vi.fn(async () => ([
    { id: 'member-1', project_id: 'project-1', user_id: 'owner-1', role: 'owner', joined_at: '2026-04-15T00:00:00.000Z' },
  ]))

  const normalizeSql = (sql: string) => sql.replace(/\s+/g, ' ').trim().toLowerCase()
  const isCurrent = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true'

  const clonePackage = (row: PackageRow | undefined) => (row ? { ...row } : null)
  const cloneDrawing = (row: DrawingRow | undefined) => (row ? { ...row } : null)
  const cloneVersion = (row: VersionRow | undefined) => (row ? { ...row } : null)
  const cloneWorkItem = (row: CertificateWorkItemRow | undefined) => (row ? { ...row } : null)
  const groupCount = <T extends string>(values: T[]) =>
    Array.from(values.reduce((bucket, value) => {
      bucket.set(value, (bucket.get(value) ?? 0) + 1)
      return bucket
    }, new Map<T, number>()).entries()).map(([value, count]) => ({ value, count }))

  const normalizeDiscipline = (row: DrawingRow) => row.discipline_type || row.drawing_type || '未分类'
  const normalizePurpose = (row: DrawingRow) => row.document_purpose || '未分类'

  const sortByRecency = <T extends { created_at: string; sort_order?: number }>(rows: T[]) =>
    rows
      .slice()
      .sort((left, right) => {
        const createdOrder = right.created_at.localeCompare(left.created_at, 'zh-Hans-CN')
        if (createdOrder !== 0) return createdOrder
        return (right.sort_order ?? 0) - (left.sort_order ?? 0)
      })

  function currentDrawingsForPackage(packageId: string) {
    return sortByRecency(
      drawings.filter((row) => row.package_id === packageId && isCurrent(row.is_current_version)),
    )
  }

  function currentVersionsForPackage(packageId: string) {
    return versions
      .filter((row) => row.package_id === packageId)
      .slice()
      .sort((left, right) => {
        const leftCurrent = isCurrent(left.is_current_version) ? 1 : 0
        const rightCurrent = isCurrent(right.is_current_version) ? 1 : 0
        if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent
        return right.created_at.localeCompare(left.created_at, 'zh-Hans-CN')
      })
  }

  function setDrawingCurrent(drawingId: string, current: boolean) {
    const target = drawings.find((row) => row.id === drawingId)
    if (target) {
      target.is_current_version = current
    }
  }

  function setDrawingsCurrentByPackage(packageId: string, current: boolean, exceptId?: string) {
    for (const row of drawings) {
      if (row.package_id !== packageId) continue
      if (exceptId && row.id === exceptId) continue
      row.is_current_version = current
    }
  }

  function assignDrawingField(row: DrawingRow, field: string, value: unknown) {
    switch (field) {
      case 'is_current_version':
        row.is_current_version = isCurrent(value)
        break
      case 'has_change':
      case 'schedule_impact_flag':
      case 'requires_review':
      case 'is_ready_for_construction':
      case 'is_ready_for_acceptance':
        ;(row as Record<string, unknown>)[field] = value == null ? null : isCurrent(value)
        break
      case 'sort_order':
        row.sort_order = typeof value === 'number' ? value : Number(value ?? 0) || 0
        break
      case 'updated_at':
        row.updated_at = String(value ?? row.created_at)
        break
      case 'version':
        row.version = value == null ? undefined : String(value)
        break
      case 'lock_version':
        row.lock_version = typeof value === 'number' ? value : Number(value ?? row.lock_version ?? 1) || 1
        break
      default:
        if (value == null) {
          ;(row as Record<string, unknown>)[field] = null
        } else {
          ;(row as Record<string, unknown>)[field] = typeof value === 'string' ? value : String(value)
        }
    }
  }

  function setVersionsCurrentByPackage(packageId: string, current: boolean, exceptId?: string) {
    for (const row of versions) {
      if (row.package_id !== packageId) continue
      if (exceptId && row.id === exceptId) continue
      row.is_current_version = current
      row.superseded_at = current ? null : row.superseded_at ?? '2026-04-16 00:00:00'
    }
  }

  function assignVersionField(row: VersionRow, field: string, value: unknown) {
    switch (field) {
      case 'is_current_version':
        row.is_current_version = isCurrent(value)
        break
      case 'superseded_at':
        row.superseded_at = value == null ? null : String(value)
        break
      case 'updated_at':
        row.updated_at = value == null ? row.updated_at : String(value)
        break
      default:
        ;(row as Record<string, unknown>)[field] = value == null ? null : value
    }
  }

  function refreshPackagePointer(packageId: string) {
    const currentDrawing = currentDrawingsForPackage(packageId)[0] ?? null
    const pkg = packages.find((row) => row.id === packageId)
    if (pkg) {
      pkg.current_version_drawing_id = currentDrawing?.id ?? null
    }
  }

  function findDrawingById(id: unknown) {
    return drawings.find((row) => row.id === String(id ?? ''))
  }

  function findVersionById(id: unknown) {
    return versions.find((row) => row.id === String(id ?? ''))
  }

  function findVersionByDrawingAndNo(drawingId: unknown, versionNo: unknown) {
    return versions.find(
      (row) => row.drawing_id === String(drawingId ?? '') && row.version_no === String(versionNo ?? ''),
    )
  }

  function findLatestVersionByDrawingAndPackage(drawingId: unknown, packageId: unknown) {
    return versions
      .filter((row) => row.drawing_id === String(drawingId ?? '') && row.package_id === String(packageId ?? ''))
      .slice()
      .sort((left, right) => right.created_at.localeCompare(left.created_at, 'zh-Hans-CN'))[0] ?? null
  }

  function drawingsForPackage(packageId: unknown, packageCode: unknown) {
    const normalizedPackageId = String(packageId ?? '')
    const normalizedPackageCode = String(packageCode ?? '')
    return sortByRecency(
      drawings.filter(
        (row) => row.package_id === normalizedPackageId || row.package_code === normalizedPackageCode,
      ),
    )
  }

  function versionsForPackage(packageId: unknown) {
    const normalizedPackageId = String(packageId ?? '')
    return versions
      .filter((row) => row.package_id === normalizedPackageId)
      .slice()
      .sort((left, right) => {
        const leftCurrent = isCurrent(left.is_current_version) ? 1 : 0
        const rightCurrent = isCurrent(right.is_current_version) ? 1 : 0
        if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent
        return right.created_at.localeCompare(left.created_at, 'zh-Hans-CN')
      })
  }

  function countCurrentDrawings(packageId: unknown) {
    return drawings.filter((row) => row.package_id === String(packageId ?? '') && isCurrent(row.is_current_version)).length
  }

  const executeSQLOne = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized.includes('from construction_drawings where id = ? limit 1')) {
      return cloneDrawing(findDrawingById(params[0]))
    }

    if (normalized === 'select count(*) as count from construction_drawings where package_id = ? and is_current_version = ?') {
      return { count: countCurrentDrawings(params[0]) }
    }

    if (normalized === 'select count(*) as count from construction_drawings where project_id = ?') {
      const projectId = String(params[0] ?? '')
      return { count: drawings.filter((row) => row.project_id === projectId).length }
    }

    if (normalized === 'select count(*) as count from construction_drawings where project_id = ? and planned_submit_date >= ? and planned_submit_date < ?') {
      const projectId = String(params[0] ?? '')
      const start = String(params[1] ?? '')
      const end = String(params[2] ?? '')
      return {
        count: drawings.filter((row) => {
          const plannedSubmitDate = row.planned_submit_date ? String(row.planned_submit_date).slice(0, 10) : ''
          return row.project_id === projectId && plannedSubmitDate >= start && plannedSubmitDate < end
        }).length,
      }
    }

    if (normalized === 'select id from construction_drawings where package_id = ? and is_current_version = ? order by created_at desc, sort_order desc limit 1') {
      const current = currentDrawingsForPackage(String(params[0] ?? ''))[0] ?? null
      return current ? { id: current.id } : null
    }

    if (normalized.includes('from drawing_packages where id = ? limit 1')) {
      return clonePackage(packages.find((row) => row.id === String(params[0] ?? '')))
    }

    if (normalized.includes('from drawing_packages where package_code = ? limit 1')) {
      return clonePackage(packages.find((row) => row.package_code === String(params[0] ?? '')))
    }

    if (normalized.includes('from drawing_versions where drawing_id = ? and version_no = ? limit 1')) {
      return cloneVersion(findVersionByDrawingAndNo(params[0], params[1]))
    }

    if (normalized.includes('from drawing_versions where drawing_id = ? and package_id = ? order by created_at desc limit 1')) {
      return cloneVersion(findLatestVersionByDrawingAndPackage(params[0], params[1]))
    }

    if (normalized.includes('from drawing_versions where id = ? limit 1')) {
      return cloneVersion(findVersionById(params[0]))
    }

    if (normalized === 'select * from certificate_work_items where project_id = ? and item_code = ? limit 1') {
      return cloneWorkItem(
        certificateWorkItems.find(
          (row) => row.project_id === String(params[0] ?? '') && row.item_code === String(params[1] ?? ''),
        ),
      )
    }

    if (
      normalized.includes('from construction_drawings where project_id = ? and package_id = ? and is_current_version = ? order by created_at desc, sort_order desc limit 1')
    ) {
      const projectId = String(params[0] ?? '')
      const packageId = String(params[1] ?? '')
      return sortByRecency(
        drawings.filter((row) => row.project_id === projectId && row.package_id === packageId && isCurrent(row.is_current_version)),
      )[0] ?? null
    }

    if (
      normalized.includes('from construction_drawings where package_id = ? or package_code = ? or id = ? order by is_current_version desc, created_at desc')
    ) {
      const packageId = String(params[0] ?? '')
      const packageCode = String(params[1] ?? '')
      const id = String(params[2] ?? '')
      return sortByRecency(
        drawings.filter(
          (row) => row.package_id === packageId || row.package_code === packageCode || row.id === id,
        ),
      )
    }

    if (normalized.includes('from construction_drawings where project_id = ? order by sort_order asc, created_at asc')) {
      const projectId = String(params[0] ?? '')
      return drawings.filter((row) => row.project_id === projectId)
    }

    if (normalized.includes('from construction_drawings where package_id = ? order by created_at asc')) {
      return drawingsForPackage(params[0], params[0])
    }

    if (normalized.includes('from construction_drawings where package_code = ? order by created_at asc')) {
      return drawingsForPackage(params[0], params[0])
    }

    if (normalized.includes('from drawing_versions where project_id = ? order by created_at desc')) {
      const projectId = String(params[0] ?? '')
      return versions.filter((row) => row.project_id === projectId)
    }

    if (
      normalized.includes('from construction_drawings') &&
      normalized.includes('package_id = ? or package_code = ?') &&
      normalized.includes('order by created_at asc')
    ) {
      return drawingsForPackage(params[0], params[1])
    }

    if (normalized.includes('from drawing_packages where id = ? limit 1')) {
      return clonePackage(packages.find((row) => row.id === String(params[0] ?? '')))
    }

    if (
      normalized.includes('from drawing_versions') &&
      normalized.includes('package_id = ?') &&
      normalized.includes('order by is_current_version desc, created_at desc')
    ) {
      return versionsForPackage(params[0])
    }

    return null
  })

  const executeSQL = vi.fn(async (sql: string, params: unknown[] = []) => {
    const normalized = normalizeSql(sql)

    if (normalized.includes('from construction_drawings where package_id = ? order by created_at asc')) {
      return drawingsForPackage(params[0], params[0])
    }

    if (normalized.includes('from construction_drawings where package_code = ? order by created_at asc')) {
      return drawingsForPackage(params[0], params[0])
    }

    if (normalized.includes('from construction_drawings where project_id = ? order by sort_order asc, created_at asc')) {
      const projectId = String(params[0] ?? '')
      return drawings.filter((row) => row.project_id === projectId)
    }

    if (normalized === "select drawing_type, count(*) as count from construction_drawings where project_id = ? group by drawing_type") {
      const projectId = String(params[0] ?? '')
      return groupCount(
        drawings
          .filter((row) => row.project_id === projectId)
          .map((row) => row.drawing_type || '未分类'),
      ).map(({ value, count }) => ({ drawing_type: value, count }))
    }

    if (normalized === "select status, count(*) as count from construction_drawings where project_id = ? group by status") {
      const projectId = String(params[0] ?? '')
      return groupCount(
        drawings
          .filter((row) => row.project_id === projectId)
          .map((row) => row.status || '未分类'),
      ).map(({ value, count }) => ({ status: value, count }))
    }

    if (normalized === "select review_status, count(*) as count from construction_drawings where project_id = ? group by review_status") {
      const projectId = String(params[0] ?? '')
      return groupCount(
        drawings
          .filter((row) => row.project_id === projectId)
          .map((row) => row.review_status || '未分类'),
      ).map(({ value, count }) => ({ review_status: value, count }))
    }

    if (
      normalized
      === "select coalesce(nullif(discipline_type, ''), drawing_type, '未分类') as discipline_type, count(*) as count from construction_drawings where project_id = ? group by coalesce(nullif(discipline_type, ''), drawing_type, '未分类')"
    ) {
      const projectId = String(params[0] ?? '')
      return groupCount(
        drawings
          .filter((row) => row.project_id === projectId)
          .map(normalizeDiscipline),
      ).map(({ value, count }) => ({ discipline_type: value, count }))
    }

    if (
      normalized
      === "select coalesce(nullif(document_purpose, ''), '未分类') as document_purpose, count(*) as count from construction_drawings where project_id = ? group by coalesce(nullif(document_purpose, ''), '未分类')"
    ) {
      const projectId = String(params[0] ?? '')
      return groupCount(
        drawings
          .filter((row) => row.project_id === projectId)
          .map(normalizePurpose),
      ).map(({ value, count }) => ({ document_purpose: value, count }))
    }

    if (normalized.includes('from drawing_versions where project_id = ? order by created_at desc')) {
      const projectId = String(params[0] ?? '')
      return versions.filter((row) => row.project_id === projectId)
    }

    if (
      normalized.includes('from construction_drawings') &&
      normalized.includes('package_id = ? or package_code = ?') &&
      normalized.includes('order by created_at asc')
    ) {
      return drawingsForPackage(params[0], params[1])
    }

    if (
      normalized.includes('from drawing_versions') &&
      normalized.includes('package_id = ?') &&
      normalized.includes('order by is_current_version desc, created_at desc')
    ) {
      return versionsForPackage(params[0])
    }

    if (normalized === 'update construction_drawings set is_current_version = ? where package_id = ? and id <> ?') {
      const nextCurrent = isCurrent(params[0])
      const packageId = String(params[1] ?? '')
      const excludedId = String(params[2] ?? '')
      setDrawingsCurrentByPackage(packageId, nextCurrent, excludedId)
      return []
    }

    if (normalized === 'update construction_drawings set is_current_version = ? where id = ?') {
      setDrawingCurrent(String(params[1] ?? ''), isCurrent(params[0]))
      return []
    }

    if (normalized.startsWith('update construction_drawings set ') && normalized.includes(' where id = ? and lock_version = ?')) {
      const targetId = String(params[params.length - 2] ?? '')
      const expectedLockVersion = Number(params[params.length - 1] ?? 1)
      const target = drawings.find((row) => row.id === targetId)
      if (target && (target.lock_version ?? 1) === expectedLockVersion) {
        const clauseList = normalized
          .slice('update construction_drawings set '.length, normalized.lastIndexOf(' where id = ? and lock_version = ?'))
          .split(',')
          .map((clause) => clause.trim())

        clauseList.forEach((clause, index) => {
          const [field] = clause.split('=').map((part) => part.trim())
          assignDrawingField(target, field, params[index])
        })
      }
      return []
    }

    if (normalized === 'update drawing_versions set is_current_version = ? where drawing_id = ? and package_id = ? and id <> ?') {
      const nextCurrent = isCurrent(params[0])
      const drawingId = String(params[1] ?? '')
      const packageId = String(params[2] ?? '')
      const excludedId = String(params[3] ?? '')
      for (const row of versions) {
        if (row.drawing_id === drawingId && row.package_id === packageId && row.id !== excludedId) {
          row.is_current_version = nextCurrent
        }
      }
      return []
    }

    if (normalized === 'update drawing_versions set is_current_version = ?, superseded_at = current_timestamp where drawing_id = ? and package_id = ? and id <> ?') {
      const nextCurrent = isCurrent(params[0])
      const drawingId = String(params[1] ?? '')
      const packageId = String(params[2] ?? '')
      const excludedId = String(params[3] ?? '')
      for (const row of versions) {
        if (row.drawing_id === drawingId && row.package_id === packageId && row.id !== excludedId) {
          row.is_current_version = nextCurrent
          row.superseded_at = nextCurrent ? null : '2026-04-16 00:00:00'
        }
      }
      return []
    }

    if (normalized === 'update drawing_versions set project_id = ?, package_id = ?, change_reason = ?, created_by = ?, is_current_version = ?, updated_at = ? where id = ?') {
      const [projectId, packageId, changeReason, createdBy, currentVersion, _updatedAt, id] = params
      const target = versions.find((row) => row.id === String(id ?? ''))
      if (target) {
        target.project_id = String(projectId ?? target.project_id)
        target.package_id = String(packageId ?? target.package_id)
        target.change_reason = changeReason == null ? null : String(changeReason)
        target.created_by = createdBy == null ? target.created_by ?? null : String(createdBy)
        target.is_current_version = isCurrent(currentVersion)
      }
      return []
    }

    if (normalized === 'update drawing_versions set project_id = ?, package_id = ?, parent_drawing_id = ?, revision_no = ?, issued_for = ?, effective_date = ?, change_reason = ?, created_by = ?, is_current_version = ?, superseded_at = ?, updated_at = ? where id = ?') {
      const target = versions.find((row) => row.id === String(params[11] ?? ''))
      if (target) {
        const fields = [
          'project_id',
          'package_id',
          'parent_drawing_id',
          'revision_no',
          'issued_for',
          'effective_date',
          'change_reason',
          'created_by',
          'is_current_version',
          'superseded_at',
          'updated_at',
        ]
        fields.forEach((field, index) => {
          assignVersionField(target, field, params[index])
        })
      }
      return []
    }

    if (normalized === 'update drawing_versions set is_current_version = ? where drawing_id = ? and package_id = ?') {
      const nextCurrent = isCurrent(params[0])
      const drawingId = String(params[1] ?? '')
      const packageId = String(params[2] ?? '')
      for (const row of versions) {
        if (row.drawing_id === drawingId && row.package_id === packageId) {
          row.is_current_version = nextCurrent
        }
      }
      return []
    }

    if (normalized === 'update drawing_versions set is_current_version = ?, superseded_at = current_timestamp where drawing_id = ? and package_id = ?') {
      const nextCurrent = isCurrent(params[0])
      const drawingId = String(params[1] ?? '')
      const packageId = String(params[2] ?? '')
      for (const row of versions) {
        if (row.drawing_id === drawingId && row.package_id === packageId) {
          row.is_current_version = nextCurrent
          row.superseded_at = nextCurrent ? null : '2026-04-16 00:00:00'
        }
      }
      return []
    }

    if (normalized === 'update drawing_versions set is_current_version = ? where package_id = ? and id <> ?') {
      const nextCurrent = isCurrent(params[0])
      const packageId = String(params[1] ?? '')
      const excludedId = String(params[2] ?? '')
      setVersionsCurrentByPackage(packageId, nextCurrent, excludedId)
      return []
    }

    if (normalized === 'update drawing_versions set is_current_version = ?, superseded_at = current_timestamp where package_id = ?') {
      const nextCurrent = isCurrent(params[0])
      const packageId = String(params[1] ?? '')
      setVersionsCurrentByPackage(packageId, nextCurrent)
      return []
    }

    if (normalized === 'update drawing_versions set is_current_version = ?, superseded_at = current_timestamp where package_id = ? and id <> ?') {
      const nextCurrent = isCurrent(params[0])
      const packageId = String(params[1] ?? '')
      const excludedId = String(params[2] ?? '')
      setVersionsCurrentByPackage(packageId, nextCurrent, excludedId)
      return []
    }

    if (normalized === 'update drawing_versions set is_current_version = ?, superseded_at = ? where id = ?') {
      const version = versions.find((row) => row.id === String(params[2] ?? ''))
      if (version) {
        version.is_current_version = isCurrent(params[0])
        version.superseded_at = params[1] == null ? null : String(params[1])
      }
      return []
    }

    if (normalized === 'update drawing_versions set package_id = ?, updated_at = current_timestamp where drawing_id = ?') {
      const packageId = String(params[0] ?? '')
      const drawingId = String(params[1] ?? '')
      for (const row of versions) {
        if (row.drawing_id === drawingId) {
          row.package_id = packageId
        }
      }
      return []
    }

    if (normalized === 'update drawing_packages set current_version_drawing_id = ?, updated_at = current_timestamp where id = ?') {
      const currentVersionDrawingId = params[0] == null ? null : String(params[0])
      const packageId = String(params[1] ?? '')
      const pkg = packages.find((row) => row.id === packageId)
      if (pkg) {
        pkg.current_version_drawing_id = currentVersionDrawingId
      }
      return []
    }

    if (normalized.startsWith('insert into construction_drawings')) {
      const [
        id,
        projectId,
        drawingType,
        drawingName,
        version,
        _description,
        status,
        _designUnit,
        _designPerson,
        drawingDate,
        _reviewUnit,
        reviewStatus,
        _reviewDate,
        _reviewOpinion,
        _reviewReportNo,
        relatedLicenseId,
        plannedSubmitDate,
        plannedPassDate,
        actualSubmitDate,
        actualPassDate,
        _leadUnit,
        responsibleUserId,
        sortOrder,
        _notes,
        createdBy,
        createdAt,
        updatedAt,
        packageId,
        packageCode,
        packageName,
        disciplineType,
        documentPurpose,
        _drawingCode,
        _parentDrawingId,
        versionNo,
        _revisionNo,
        _issuedFor,
        _effectiveDate,
        isCurrentVersion,
        _requiresReview,
        reviewMode,
      ] = params

      drawings.push({
        id: String(id),
        project_id: String(projectId),
        package_id: String(packageId ?? ''),
        package_code: String(packageCode ?? ''),
        package_name: packageName == null ? null : String(packageName),
        drawing_name: String(drawingName),
        version_no: String(versionNo ?? version),
        version: String(version),
        is_current_version: isCurrent(isCurrentVersion),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
        drawing_type: String(drawingType ?? '建筑'),
        status: String(status ?? '编制中'),
        review_status: String(reviewStatus ?? '未提交'),
        review_mode: reviewMode == null ? null : String(reviewMode),
        discipline_type: disciplineType == null ? null : String(disciplineType),
        document_purpose: documentPurpose == null ? null : String(documentPurpose),
        related_license_id: relatedLicenseId == null ? null : String(relatedLicenseId),
        planned_submit_date: plannedSubmitDate == null ? null : String(plannedSubmitDate),
        actual_submit_date: actualSubmitDate == null ? null : String(actualSubmitDate),
        planned_pass_date: plannedPassDate == null ? null : String(plannedPassDate),
        actual_pass_date: actualPassDate == null ? null : String(actualPassDate),
        responsible_user_id: responsibleUserId == null ? null : String(responsibleUserId),
        sort_order: Number(sortOrder ?? 0),
        lock_version: 1,
        created_by: createdBy == null ? null : String(createdBy),
        drawing_date: drawingDate == null ? null : String(drawingDate),
      } as DrawingRow)
      return []
    }

    if (normalized.startsWith('insert into drawing_versions')) {
      const [
        id,
        projectId,
        packageId,
        drawingId,
        parentDrawingId,
        versionNo,
        revisionNo,
        issuedFor,
        effectiveDate,
        _previousVersionId,
        isCurrentVersion,
        supersededAt,
        changeReason,
        createdBy,
        createdAt,
        updatedAt,
      ] = params

      versions.push({
        id: String(id),
        project_id: String(projectId),
        package_id: String(packageId),
        drawing_id: String(drawingId),
        parent_drawing_id: parentDrawingId == null ? null : String(parentDrawingId),
        version_no: String(versionNo),
        revision_no: revisionNo == null ? null : String(revisionNo),
        issued_for: issuedFor == null ? null : String(issuedFor),
        effective_date: effectiveDate == null ? null : String(effectiveDate),
        is_current_version: isCurrent(isCurrentVersion),
        superseded_at: supersededAt == null ? null : String(supersededAt),
        change_reason: changeReason == null ? null : String(changeReason),
        created_by: createdBy == null ? null : String(createdBy),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return []
    }

    if (normalized.startsWith('insert into certificate_work_items')) {
      const [
        id,
        projectId,
        itemCode,
        itemName,
        itemStage,
        status,
        plannedFinishDate,
        actualFinishDate,
        approvingAuthority,
        isShared,
        nextAction,
        nextActionDueDate,
        isBlocked,
        blockReason,
        sortOrder,
        notes,
        latestRecordAt,
        createdAt,
        updatedAt,
      ] = params

      certificateWorkItems.push({
        id: String(id),
        project_id: String(projectId),
        item_code: itemCode == null ? null : String(itemCode),
        item_name: String(itemName),
        item_stage: String(itemStage),
        status: String(status),
        planned_finish_date: plannedFinishDate == null ? null : String(plannedFinishDate),
        actual_finish_date: actualFinishDate == null ? null : String(actualFinishDate),
        approving_authority: approvingAuthority == null ? null : String(approvingAuthority),
        is_shared: isCurrent(isShared),
        next_action: nextAction == null ? null : String(nextAction),
        next_action_due_date: nextActionDueDate == null ? null : String(nextActionDueDate),
        is_blocked: isCurrent(isBlocked),
        block_reason: blockReason == null ? null : String(blockReason),
        sort_order: Number(sortOrder ?? 0),
        notes: notes == null ? null : String(notes),
        latest_record_at: latestRecordAt == null ? null : String(latestRecordAt),
        created_at: String(createdAt),
        updated_at: String(updatedAt),
      })
      return []
    }

    if (normalized.startsWith('update certificate_work_items set ') && normalized.endsWith(' where id = ? and project_id = ?')) {
      const targetId = String(params[params.length - 2] ?? '')
      const targetProjectId = String(params[params.length - 1] ?? '')
      const target = certificateWorkItems.find((row) => row.id === targetId && row.project_id === targetProjectId)
      if (target) {
        const clauseList = normalized
          .slice('update certificate_work_items set '.length, normalized.lastIndexOf(' where id = ? and project_id = ?'))
          .split(',')
          .map((clause) => clause.trim())
        clauseList.forEach((clause, index) => {
          const [field] = clause.split('=').map((part) => part.trim())
          ;(target as Record<string, unknown>)[field] = params[index]
        })
      }
      return []
    }

    if (normalized === 'delete from certificate_dependencies where project_id = ? and predecessor_type = ? and successor_type = ? and successor_id = ?') {
      for (let index = certificateDependencies.length - 1; index >= 0; index -= 1) {
        const dependency = certificateDependencies[index]
        if (
          dependency.project_id === String(params[0] ?? '') &&
          dependency.predecessor_type === String(params[1] ?? '') &&
          dependency.successor_type === String(params[2] ?? '') &&
          dependency.successor_id === String(params[3] ?? '')
        ) {
          certificateDependencies.splice(index, 1)
        }
      }
      return []
    }

    if (normalized === 'delete from certificate_dependencies where project_id = ? and successor_type = ? and successor_id = ?') {
      for (let index = certificateDependencies.length - 1; index >= 0; index -= 1) {
        const dependency = certificateDependencies[index]
        if (
          dependency.project_id === String(params[0] ?? '') &&
          dependency.successor_type === String(params[1] ?? '') &&
          dependency.successor_id === String(params[2] ?? '')
        ) {
          certificateDependencies.splice(index, 1)
        }
      }
      return []
    }

    if (normalized.startsWith('insert into certificate_dependencies')) {
      certificateDependencies.push({
        id: String(params[0] ?? ''),
        project_id: String(params[1] ?? ''),
        predecessor_type: String(params[2] ?? ''),
        predecessor_id: String(params[3] ?? ''),
        successor_type: String(params[4] ?? ''),
        successor_id: String(params[5] ?? ''),
        dependency_kind: String(params[6] ?? ''),
        notes: params[7] == null ? null : String(params[7]),
        created_at: String(params[8] ?? ''),
      })
      return []
    }

    if (normalized === 'delete from certificate_work_items where id = ? and project_id = ?') {
      const index = certificateWorkItems.findIndex(
        (row) => row.id === String(params[0] ?? '') && row.project_id === String(params[1] ?? ''),
      )
      if (index >= 0) certificateWorkItems.splice(index, 1)
      return []
    }

    return []
  })

  function reset(seed: {
    packages: PackageRow[]
    drawings: DrawingRow[]
    versions: VersionRow[]
    certificateWorkItems?: CertificateWorkItemRow[]
    certificateDependencies?: CertificateDependencyRow[]
  }) {
    packages.splice(0, packages.length, ...seed.packages.map((row) => ({ ...row })))
    drawings.splice(0, drawings.length, ...seed.drawings.map((row) => ({ ...row })))
    versions.splice(0, versions.length, ...seed.versions.map((row) => ({ ...row })))
    certificateWorkItems.splice(0, certificateWorkItems.length, ...(seed.certificateWorkItems ?? []).map((row) => ({ ...row })))
    certificateDependencies.splice(0, certificateDependencies.length, ...(seed.certificateDependencies ?? []).map((row) => ({ ...row })))
  }

  return {
    packages,
    drawings,
    versions,
    certificateWorkItems,
    certificateDependencies,
    persistNotification,
    getMembers,
    executeSQL,
    executeSQLOne,
    reset,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: unknown, next: () => void) => {
    req.user = { id: 'test-user-id', role: 'owner', globalRole: 'company_admin' }
    next()
  }),
  optionalAuthenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectMember: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectEditor: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  requireProjectOwner: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
  checkResourceAccess: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}))

vi.mock('../middleware/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('../services/dbService.js', () => ({
  executeSQL: db.executeSQL,
  executeSQLOne: db.executeSQLOne,
  getMembers: db.getMembers,
}))

vi.mock('../services/warningChainService.js', () => ({
  persistNotification: db.persistNotification,
}))

const { default: constructionDrawingsRouter } = await import('../routes/construction-drawings.js')
const { registerDrawingPackageRoutes } = await import('../routes/drawing-packages.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/construction-drawings', constructionDrawingsRouter)

  const drawingPackagesRouter = express.Router()
  registerDrawingPackageRoutes(drawingPackagesRouter)
  app.use('/api/drawing-packages', drawingPackagesRouter)

  return app
}

function seedBaseState() {
  return {
    packages: [
      {
        id: 'pkg-1',
        project_id: 'project-1',
        package_code: 'pkg-1',
        current_version_drawing_id: 'draw-1',
        updated_at: '2026-04-15T00:00:00.000Z',
      },
    ],
    drawings: [
      {
        id: 'draw-1',
        project_id: 'project-1',
        package_id: 'pkg-1',
        package_code: 'pkg-1',
        drawing_name: '基础图',
        drawing_type: '建筑',
        version_no: '1.0',
        version: '1.0',
        status: '编制中',
        review_status: '未提交',
        discipline_type: '建筑',
        document_purpose: '施工执行',
        lock_version: 1,
        is_current_version: true,
        created_at: '2026-04-15T00:00:00.000Z',
        sort_order: 1,
      },
      {
        id: 'draw-2',
        project_id: 'project-1',
        package_id: 'pkg-1',
        package_code: 'pkg-1',
        drawing_name: '梁板配筋图',
        drawing_type: '结构',
        version_no: '1.1',
        version: '1.1',
        status: '审图中',
        review_status: '审查中',
        discipline_type: '结构',
        document_purpose: '送审报批',
        lock_version: 1,
        is_current_version: false,
        created_at: '2026-04-15T01:00:00.000Z',
        sort_order: 2,
      },
    ],
    versions: [
      {
        id: 'ver-1',
        project_id: 'project-1',
        package_id: 'pkg-1',
        drawing_id: 'draw-1',
        version_no: '1.0',
        is_current_version: true,
        created_at: '2026-04-15T00:00:00.000Z',
        created_by: 'system',
      },
      {
        id: 'ver-2',
        project_id: 'project-1',
        package_id: 'pkg-1',
        drawing_id: 'draw-2',
        version_no: '1.1',
        is_current_version: false,
        created_at: '2026-04-15T01:00:00.000Z',
        created_by: 'system',
      },
    ],
  }
}

function currentDrawingIds() {
  return db.drawings.filter((row) => row.is_current_version === true || row.is_current_version === 1 || row.is_current_version === '1' || row.is_current_version === 'true').map((row) => row.id)
}

describe('construction drawing current-version write path', () => {
  beforeEach(() => {
    db.reset(seedBaseState())
    vi.clearAllMocks()
    db.getMembers.mockResolvedValue([
      { id: 'member-1', project_id: 'project-1', user_id: 'owner-1', role: 'owner', joined_at: '2026-04-15T00:00:00.000Z' },
    ])
  })

  it('rejects the legacy write path when it would remove the package last current drawing', async () => {
    const request = supertest(buildApp())

    const response = await request
      .put('/api/construction-drawings/draw-1')
      .send({
        is_current_version: false,
        version_no: '1.0',
        lock_version: 1,
      })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'MISSING_TARGET_DRAWING',
        message: '当前有效版不能为空',
      },
    })
    expect(currentDrawingIds()).toEqual(['draw-1'])
    expect(db.packages[0]?.current_version_drawing_id).toBe('draw-1')
    expect(db.executeSQL.mock.calls.filter(([sql]) => String(sql).toLowerCase().includes('update '))).toHaveLength(0)
  })

  it('switches the legacy write path to another drawing and keeps exactly one current version', async () => {
    const request = supertest(buildApp())

    const response = await request
      .put('/api/construction-drawings/draw-2')
      .send({
        is_current_version: true,
        version_no: '1.1',
        lock_version: 1,
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: 'draw-2',
      is_current_version: true,
    })
    expect(currentDrawingIds()).toEqual(['draw-2'])
    expect(db.drawings.find((row) => row.id === 'draw-1')?.is_current_version).toBe(false)
    expect(db.drawings.find((row) => row.id === 'draw-2')?.is_current_version).toBe(true)
    expect(db.drawings.find((row) => row.id === 'draw-2')?.lock_version).toBe(2)
  })

  it('rejects stale drawing updates when lock_version is outdated', async () => {
    const request = supertest(buildApp())
    const target = db.drawings.find((row) => row.id === 'draw-2')
    if (target) {
      target.lock_version = 3
    }

    const response = await request
      .put('/api/construction-drawings/draw-2')
      .send({
        drawing_name: '姊佹澘閰嶇瓔鍥?-stale',
        version_no: '1.1',
        lock_version: 1,
      })

    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'VERSION_MISMATCH',
      },
    })
  })

  it('auto-computes schedule_impact_flag from overdue review states on update', async () => {
    const request = supertest(buildApp())

    const response = await request
      .put('/api/construction-drawings/draw-2')
      .send({
        review_status: '需修改',
        planned_pass_date: '2026-04-01T00:00:00.000Z',
        actual_pass_date: null,
        has_change: true,
        schedule_impact_flag: false,
        lock_version: 1,
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: 'draw-2',
      schedule_impact_flag: true,
    })
    expect(db.drawings.find((row) => row.id === 'draw-2')?.schedule_impact_flag).toBe(true)
  })

  it('returns discipline and document purpose groupings in drawing stats', async () => {
    const now = new Date()
    const currentMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 8)).toISOString()
    const nextMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 8)).toISOString()
    const draw1 = db.drawings.find((row) => row.id === 'draw-1')
    const draw2 = db.drawings.find((row) => row.id === 'draw-2')
    if (draw1) draw1.planned_submit_date = currentMonthDate
    if (draw2) draw2.planned_submit_date = nextMonthDate

    const request = supertest(buildApp())
    const response = await request.get('/api/construction-drawings/project/project-1/stats')

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.total).toBe(2)
    expect(response.body.data.by_discipline_type).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ discipline_type: '建筑', count: 1 }),
        expect.objectContaining({ discipline_type: '结构', count: 1 }),
      ]),
    )
    expect(response.body.data.by_document_purpose).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ document_purpose: '施工执行', count: 1 }),
        expect.objectContaining({ document_purpose: '送审报批', count: 1 }),
      ]),
    )
    expect(response.body.data.planned_submit_this_month_count).toBe(1)
  })

  it('synchronizes drawing_packages.current_version_drawing_id on the new main path', async () => {
    const request = supertest(buildApp())

    const response = await request
      .post('/api/drawing-packages/packages/pkg-1/set-current-version')
      .send({
        drawingId: 'draw-2',
      })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toMatchObject({
      id: 'pkg-1',
      current_version_drawing_id: 'draw-2',
    })
    expect(currentDrawingIds()).toEqual(['draw-2'])
    expect(db.packages[0]?.current_version_drawing_id).toBe('draw-2')
    expect(db.versions.find((row) => row.id === 'ver-2')?.is_current_version).toBe(true)
    expect(db.versions.find((row) => row.id === 'ver-1')?.is_current_version).toBe(false)
  })

  it('rejects invalid review modes when creating a drawing package', async () => {
    const request = supertest(buildApp())

    const response = await request
      .post('/api/drawing-packages/packages')
      .send({
        projectId: 'project-1',
        packageName: '新图纸包',
        reviewMode: 'invalid-mode',
      })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: 'INVALID_REVIEW_MODE',
      },
    })
  })

  it('creates a version snapshot and notifies on drawing creation when a package version is formed', async () => {
    const projectId = '11111111-1111-4111-8111-111111111111'
    const packageId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    db.packages.push({
      id: packageId,
      project_id: projectId,
      package_code: 'pkg-create',
      current_version_drawing_id: null,
      updated_at: '2026-04-15T00:00:00.000Z',
    })

    const request = supertest(buildApp())

    const response = await request
      .post('/api/construction-drawings')
      .send({
        project_id: projectId,
        package_id: packageId,
        package_code: 'pkg-create',
        package_name: '结构施工图包',
        related_license_id: 'cert-construction',
        drawing_type: '结构',
        discipline_type: '结构',
        document_purpose: '施工执行',
        drawing_name: '新增基础图',
        version: '2.0',
        version_no: '2.0',
        revision_no: 'R2',
        issued_for: '施工执行',
        effective_date: '2026-04-18',
        responsible_user_id: 'designer-1',
        review_mode: 'none',
        is_current_version: true,
      })

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(db.versions.find((row) => row.version_no === '2.0')).toMatchObject({
      project_id: projectId,
      package_id: packageId,
      revision_no: 'R2',
      issued_for: '施工执行',
      effective_date: '2026-04-18',
      is_current_version: true,
    })
    expect(db.packages.find((row) => row.id === packageId)?.current_version_drawing_id).toBe(response.body.data.id)
    expect(db.persistNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'drawing_version_updated',
        source_entity_type: 'drawing_version',
        title: '图纸版本已更新',
      }),
    )
    expect(db.certificateWorkItems.find((row) => row.item_code === `drawing-package:${packageId}`)).toMatchObject({
      project_id: projectId,
      item_name: '图纸资料联动 · 结构施工图包',
      status: 'preparing_documents',
    })
    expect(db.certificateDependencies.find((row) => row.successor_id === db.certificateWorkItems[0]?.id)).toMatchObject({
      predecessor_id: 'cert-construction',
      successor_type: 'work_item',
    })
  })

  it('normalizes display review statuses into storage-safe values on drawing creation', async () => {
    const projectId = '22222222-2222-4222-8222-222222222222'
    const packageId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    db.packages.push({
      id: packageId,
      project_id: projectId,
      package_code: 'pkg-normalize',
      current_version_drawing_id: null,
      updated_at: '2026-04-15T00:00:00.000Z',
    })

    const request = supertest(buildApp())

    const noneResponse = await request
      .post('/api/construction-drawings')
      .send({
        project_id: projectId,
        package_id: packageId,
        package_code: 'pkg-normalize',
        package_name: '结构施工图包',
        drawing_type: '结构',
        discipline_type: '结构',
        document_purpose: '施工执行',
        drawing_name: '结构施工图-新增',
        version: '3.0',
        version_no: '3.0',
        review_mode: 'none',
        review_status: '不适用',
        is_current_version: true,
      })

    expect(noneResponse.status).toBe(201)
    expect(noneResponse.body.data.review_status).toBe('未提交')

    const mandatoryResponse = await request
      .post('/api/construction-drawings')
      .send({
        project_id: projectId,
        package_id: packageId,
        package_code: 'pkg-normalize',
        package_name: '结构施工图包',
        drawing_type: '结构',
        discipline_type: '结构',
        document_purpose: '送审报批',
        drawing_name: '结构施工图-送审',
        version: '3.1',
        version_no: '3.1',
        review_mode: 'mandatory',
        review_status: '待送审',
        is_current_version: false,
      })

    expect(mandatoryResponse.status).toBe(201)
    expect(mandatoryResponse.body.data.review_status).toBe('未提交')
  })

  it('keeps drawing creation placeholders generated from insertValues length', async () => {
    const source = await readFile(new URL('../routes/construction-drawings.ts', import.meta.url), 'utf8')
    expect(source).toContain("VALUES (${insertValues.map(() => '?').join(', ')})")
  })

  it('re-anchors the package certificate linkage when current version switches', async () => {
    db.drawings[0] = {
      ...db.drawings[0],
      related_license_id: 'cert-a',
      package_name: '基础图纸包',
      document_purpose: '送审报批',
      planned_submit_date: '2026-04-18T00:00:00.000Z',
      is_current_version: true,
    }
    db.drawings[1] = {
      ...db.drawings[1],
      related_license_id: 'cert-b',
      package_name: '基础图纸包',
      document_purpose: '送审报批',
      planned_submit_date: '2026-04-20T00:00:00.000Z',
      is_current_version: false,
    }

    await supertest(buildApp())
      .put('/api/construction-drawings/draw-1')
      .send({
        related_license_id: 'cert-a',
        lock_version: 1,
      })

    expect(db.certificateDependencies[0]?.predecessor_id).toBe('cert-a')

    const request = supertest(buildApp())
    const response = await request
      .post('/api/drawing-packages/packages/pkg-1/set-current-version')
      .send({
        drawingId: 'draw-2',
      })

    expect(response.status).toBe(200)
    expect(db.certificateWorkItems).toHaveLength(1)
    expect(db.certificateWorkItems[0]).toMatchObject({
      item_code: 'drawing-package:pkg-1',
      item_name: '图纸资料联动 · 基础图纸包',
    })
    expect(db.certificateDependencies).toHaveLength(1)
    expect(db.certificateDependencies[0]?.predecessor_id).toBe('cert-b')
  })
})
