import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildLicenseBoardReadModel,
  buildLicenseDetailReadModel,
  buildLicenseLedgerReadModel,
  certificateBoardContracts,
} from '../services/preMilestoneBoardService.js'
import { certificateDependencyContracts } from '../routes/certificate-dependencies.js'
import { certificateWorkItemContracts } from '../routes/certificate-work-items.js'

const serverRoot = process.cwd().endsWith(`${sep}server`)
  ? process.cwd()
  : resolve(process.cwd(), 'server')

function readServerFile(...segments: string[]) {
  return readFileSync(resolve(serverRoot, ...segments), 'utf8')
}

describe('pre milestone board service', () => {
  it('adds the new certificate work item and dependency tables in the migration', () => {
    const migration = readServerFile('migrations', '072_create_certificate_work_items_and_dependencies.sql')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS certificate_work_items')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS certificate_dependencies')
    expect(migration).toContain('certificate_approvals')
  })

  it('publishes the certificate board contracts for the new read endpoints', () => {
    expect(certificateBoardContracts.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/api/projects/:projectId/pre-milestones/board' }),
        expect.objectContaining({ path: '/api/projects/:projectId/pre-milestones/ledger' }),
        expect.objectContaining({ path: '/api/projects/:projectId/pre-milestones/:certificateId/detail' }),
      ])
    )
    expect(certificateWorkItemContracts.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/api/projects/:projectId/certificate-work-items' }),
      ])
    )
    expect(certificateDependencyContracts.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: '/api/projects/:projectId/certificate-dependencies' }),
      ])
    )
  })

  it('builds the board, ledger and detail read models from the new truth layer', () => {
    const board = buildLicenseBoardReadModel({
      certificates: [
        {
          id: 'cert-land',
          milestone_type: 'land_certificate',
          milestone_name: 'land_certificate',
          status: 'issued',
          planned_end_date: '2026-05-10',
          issuing_authority: 'land-office',
        },
        {
          id: 'cert-planning',
          milestone_type: 'land_use_planning_permit',
          milestone_name: 'land_use_planning_permit',
          status: 'supplement_required',
          is_blocked: true,
          block_reason: 'materials_missing',
          planned_end_date: '2026-05-18',
        },
      ],
      workItems: [
        {
          id: 'work-1',
          project_id: 'project-1',
          item_name: 'shared-doc-collection',
          item_stage: '资料准备',
          status: 'internal_review',
          planned_finish_date: '2026-05-12',
          actual_finish_date: null,
          approving_authority: 'planning-office',
          is_shared: true,
          next_action: 'scan-docs',
          next_action_due_date: '2026-05-15',
          is_blocked: true,
          block_reason: 'shared-docs-missing',
          sort_order: 1,
          notes: null,
          latest_record_at: '2026-05-08',
          created_at: '2026-05-08T00:00:00.000Z',
          updated_at: '2026-05-09T00:00:00.000Z',
        },
      ],
      dependencies: [
        {
          id: 'dep-1',
          project_id: 'project-1',
          predecessor_type: 'certificate',
          predecessor_id: 'cert-land',
          successor_type: 'work_item',
          successor_id: 'work-1',
          dependency_kind: 'hard',
          notes: null,
          created_at: '2026-05-08T00:00:00.000Z',
        },
        {
          id: 'dep-2',
          project_id: 'project-1',
          predecessor_type: 'certificate',
          predecessor_id: 'cert-planning',
          successor_type: 'work_item',
          successor_id: 'work-1',
          dependency_kind: 'hard',
          notes: null,
          created_at: '2026-05-08T00:00:00.000Z',
        },
      ],
      now: new Date('2026-05-10T00:00:00.000Z'),
    })

    expect(board.summary).toMatchObject({
      totalCount: 4,
      completedCount: 1,
      blockingCertificateType: 'land_use_planning_permit',
      overdueCount: 0,
      supplementCount: 1,
      weeklyActionCount: 1,
    })
    expect(board.certificates).toHaveLength(4)
    expect(board.sharedItems).toHaveLength(1)
    expect(board.sharedItems[0]).toMatchObject({
      work_item_id: 'work-1',
      is_shared: true,
      dependency_count: 2,
    })

    const ledger = buildLicenseLedgerReadModel({
      certificateId: 'cert-planning',
      workItems: board.sharedItems.map((item) => ({
        id: item.work_item_id,
        project_id: 'project-1',
        item_name: item.item_name,
        item_stage: item.item_stage,
        status: item.status,
        planned_finish_date: item.planned_finish_date,
        actual_finish_date: null,
        approving_authority: 'planning-office',
        is_shared: item.is_shared,
        next_action: item.next_action,
        next_action_due_date: item.next_action_due_date,
        is_blocked: true,
        block_reason: item.block_reason,
        sort_order: 1,
        notes: null,
        latest_record_at: '2026-05-08',
        created_at: '2026-05-08T00:00:00.000Z',
        updated_at: '2026-05-09T00:00:00.000Z',
      })),
      dependencies: [
        {
          id: 'dep-2',
          project_id: 'project-1',
          predecessor_type: 'certificate',
          predecessor_id: 'cert-planning',
          successor_type: 'work_item',
          successor_id: 'work-1',
          dependency_kind: 'hard',
          notes: null,
          created_at: '2026-05-08T00:00:00.000Z',
        },
      ],
    })

    expect(ledger.items).toHaveLength(1)
    expect(ledger.totals).toMatchObject({
      blockedCount: 1,
      supplementCount: 0,
    })

    const detail = buildLicenseDetailReadModel({
      certificate: {
        id: 'cert-planning',
        milestone_type: 'land_use_planning_permit',
        milestone_name: 'land_use_planning_permit',
        status: 'supplement_required',
        block_reason: 'materials_missing',
      },
      workItems: ledger.items,
      dependencies: [
        {
          id: 'dep-2',
          project_id: 'project-1',
          predecessor_type: 'certificate',
          predecessor_id: 'cert-planning',
          successor_type: 'work_item',
          successor_id: 'work-1',
          dependency_kind: 'hard',
          notes: null,
          created_at: '2026-05-08T00:00:00.000Z',
        },
      ],
      records: [
        {
          id: 'record-1',
          project_id: 'project-1',
          target_type: 'certificate',
          target_id: 'cert-planning',
          record_type: 'supplement_required',
          from_status: 'internal_review',
          to_status: 'supplement_required',
          content: 'returned-for-supplement',
          recorded_at: '2026-05-09T00:00:00.000Z',
          recorded_by: 'system',
        },
      ],
    })

    expect(detail.certificate).toMatchObject({
      id: 'cert-planning',
      certificate_type: 'land_use_planning_permit',
    })
    expect(detail.workItems).toHaveLength(1)
    expect(detail.dependencies).toHaveLength(1)
    expect(detail.records).toHaveLength(1)
    expect(detail.linkedWarnings).toEqual([])
    expect(detail.linkedIssues).toEqual([])
    expect(detail.linkedRisks).toEqual([])
  })

  it('keeps the default four certificate types stable and appends unknown types to the tail', () => {
    const board = buildLicenseBoardReadModel({
      certificates: [
        {
          id: 'cert-land',
          milestone_type: 'land_certificate',
          milestone_name: 'land_certificate',
          status: 'issued',
        },
        {
          id: 'cert-unknown',
          milestone_type: 'public_safety_permit',
          milestone_name: '公共安全许可证',
          status: 'pending',
        },
      ],
    })

    expect(board.certificates.map((item) => item.certificate_type)).toEqual([
      'land_certificate',
      'land_use_planning_permit',
      'engineering_planning_permit',
      'construction_permit',
      'public_safety_permit',
    ])
    expect(board.certificates[4]).toMatchObject({
      id: 'cert-unknown',
      certificate_name: '公共安全许可证',
      certificate_type: 'public_safety_permit',
    })
  })

  it('normalizes legacy 土地证 rows into the canonical land_certificate slot', () => {
    const board = buildLicenseBoardReadModel({
      certificates: [
        {
          id: 'cert-land-legacy',
          milestone_type: '土地证',
          milestone_name: '土地证',
          status: 'issued',
        },
      ],
    })

    expect(board.certificates).toHaveLength(4)
    expect(board.certificates.filter((item) => item.certificate_type === 'land_certificate')).toHaveLength(1)
    expect(board.certificates.find((item) => item.certificate_type === 'land_certificate')).toMatchObject({
      id: 'cert-land-legacy',
      certificate_name: '土地证',
      certificate_type: 'land_certificate',
    })
    expect(board.certificates.some((item) => item.certificate_type === '土地证')).toBe(false)
  })

  it('collects linked warnings, issues and risks for the certificate detail bundle', () => {
    const detail = buildLicenseDetailReadModel({
      certificate: {
        id: 'cert-planning',
        milestone_type: 'land_use_planning_permit',
        milestone_name: 'land_use_planning_permit',
        status: 'supplement_required',
        block_reason: 'materials_missing',
      },
      workItems: [
        {
          id: 'work-1',
          project_id: 'project-1',
          item_name: 'shared-doc-collection',
          item_stage: '资料准备',
          status: 'internal_review',
          planned_finish_date: '2026-05-12',
          actual_finish_date: null,
          approving_authority: 'planning-office',
          is_shared: true,
          next_action: 'scan-docs',
          next_action_due_date: '2026-05-15',
          is_blocked: true,
          block_reason: 'shared-docs-missing',
          sort_order: 1,
          notes: null,
          latest_record_at: '2026-05-08',
          created_at: '2026-05-08T00:00:00.000Z',
          updated_at: '2026-05-09T00:00:00.000Z',
          certificate_ids: ['cert-planning'],
        },
      ],
      dependencies: [
        {
          id: 'dep-1',
          project_id: 'project-1',
          predecessor_type: 'certificate',
          predecessor_id: 'cert-planning',
          successor_type: 'work_item',
          successor_id: 'work-1',
          dependency_kind: 'hard',
          notes: null,
          created_at: '2026-05-08T00:00:00.000Z',
        },
      ],
      warnings: [
        {
          id: 'warning-1',
          project_id: 'project-1',
          task_id: 'cert-planning',
          warning_type: 'permit_expiry',
          warning_level: 'critical',
          title: 'linked-warning',
          description: 'certificate-expiry',
          is_acknowledged: false,
          created_at: '2026-05-09T00:00:00.000Z',
        },
      ],
      issues: [
        {
          id: 'issue-1',
          project_id: 'project-1',
          task_id: null,
          title: 'linked-issue',
          description: 'from-warning',
          source_type: 'manual',
          source_id: 'warning-1',
          source_entity_type: 'certificate_work_item',
          source_entity_id: 'work-1',
          chain_id: 'warning-1',
          severity: 'high',
          priority: 3,
          pending_manual_close: false,
          status: 'open',
          created_at: '2026-05-09T00:00:00.000Z',
          updated_at: '2026-05-09T00:00:00.000Z',
          version: 1,
        },
      ],
      risks: [
        {
          id: 'risk-1',
          project_id: 'project-1',
          task_id: null,
          title: 'linked-risk',
          description: 'from-issue',
          category: 'technical',
          level: 'high',
          probability: 3,
          impact: 4,
          status: 'identified',
          source_type: 'manual',
          source_id: 'issue-1',
          source_entity_type: 'pre_milestone',
          source_entity_id: 'land_use_planning_permit',
          chain_id: 'issue-1',
          pending_manual_close: false,
          linked_issue_id: 'issue-1',
          closed_reason: null,
          closed_at: null,
          created_at: '2026-05-09T00:00:00.000Z',
          updated_at: '2026-05-09T00:00:00.000Z',
          version: 1,
        },
      ],
    })

    expect(detail.linkedWarnings.map((item) => item.id)).toEqual(['warning-1'])
    expect(detail.linkedIssues.map((item) => item.id)).toEqual(['issue-1'])
    expect(detail.linkedRisks.map((item) => item.id)).toEqual(['risk-1'])
  })
})
