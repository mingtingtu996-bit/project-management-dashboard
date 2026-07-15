import {
  buildAndPersistAlgorithmAssetSampleHealthReport,
  type AlgorithmAssetSampleQualitySignal,
  type BuildAndPersistAlgorithmAssetSampleHealthReportResult,
} from './algorithmAssetSampleHealthService.js'
import type { AlgorithmAssetGovernanceQueryExec } from './algorithmAssetGovernancePersistenceService.js'

export type BusinessCompletionSampleDomain =
  | 'acceptance_plan'
  | 'drawing_version'
  | 'certificate_milestone'
  | 'material_handover'
  | 'quality_rectification'
  | 'risk_issue_closeout'
  | string

export type BusinessCompletionSampleInput = {
  sampleId: string
  domain: BusinessCompletionSampleDomain
  businessCode: string
  companyId?: string | null
  projectId?: string | null
  completedAt?: string | null
  startedAt?: string | null
  updatedAt?: string | null
  qualitySignal?: AlgorithmAssetSampleQualitySignal
  metadata?: Record<string, unknown>
}

export type BuildAndPersistBusinessCompletionSampleHealthReportInput = {
  companyId?: string | null
  projectId?: string | null
  samples: BusinessCompletionSampleInput[]
  queryExec?: AlgorithmAssetGovernanceQueryExec
}

type DomainCompletionBaseInput = {
  companyId?: string | null
  projectId?: string | null
  startedAt?: string | null
  updatedAt?: string | null
  qualitySignal?: AlgorithmAssetSampleQualitySignal
  metadata?: Record<string, unknown>
}

export type DrawingVersionCompletionSampleInput = DomainCompletionBaseInput & {
  drawingId?: string | null
  versionId: string
  drawingCode?: string | null
  versionNo?: string | null
  confirmedAt?: string | null
}

export type CertificateMilestoneCompletionSampleInput = DomainCompletionBaseInput & {
  certificateId: string
  milestoneCode?: string | null
  completedAt?: string | null
}

export type MaterialHandoverCompletionSampleInput = DomainCompletionBaseInput & {
  handoverId: string
  handoverCode?: string | null
  acceptedAt?: string | null
  completedAt?: string | null
}

export type QualityRectificationCompletionSampleInput = DomainCompletionBaseInput & {
  rectificationId: string
  rectificationCode?: string | null
  closedAt?: string | null
  completedAt?: string | null
}

export type RiskIssueCloseoutCompletionSampleInput = DomainCompletionBaseInput & {
  issueId: string
  issueCode?: string | null
  resolvedAt?: string | null
  closedAt?: string | null
  completedAt?: string | null
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function sampleBase(
  sample: DomainCompletionBaseInput,
  metadata: Record<string, unknown>,
): Pick<BusinessCompletionSampleInput, 'companyId' | 'projectId' | 'startedAt' | 'updatedAt' | 'qualitySignal' | 'metadata'> {
  return {
    companyId: sample.companyId,
    projectId: sample.projectId,
    startedAt: sample.startedAt,
    updatedAt: sample.updatedAt,
    qualitySignal: sample.qualitySignal,
    metadata: {
      ...(sample.metadata ?? {}),
      ...metadata,
    },
  }
}

function joinBusinessCode(...values: unknown[]) {
  return values.map(normalizeText).filter(Boolean).join(':') || 'unknown_business_code'
}

function fallbackBusinessCode(...values: unknown[]) {
  return values.map(normalizeText).find(Boolean) ?? 'unknown_business_code'
}

function workCodeFor(sample: BusinessCompletionSampleInput) {
  const domain = normalizeText(sample.domain) ?? 'unknown_domain'
  const businessCode = normalizeText(sample.businessCode) ?? 'unknown_business_code'
  return `${domain}:${businessCode}`
}

function completionDateFor(sample: BusinessCompletionSampleInput) {
  return normalizeText(sample.completedAt) ?? normalizeText(sample.updatedAt)
}

export function buildDrawingVersionCompletionSamples(
  samples: DrawingVersionCompletionSampleInput[],
): BusinessCompletionSampleInput[] {
  return samples.map((sample) => ({
    sampleId: `drawing_version:${normalizeText(sample.versionId) ?? 'unknown_version'}`,
    domain: 'drawing_version',
    businessCode: joinBusinessCode(sample.drawingCode, sample.versionNo),
    completedAt: sample.confirmedAt ?? sample.updatedAt,
    ...sampleBase(sample, {
      drawingId: sample.drawingId,
      versionId: sample.versionId,
      drawingCode: sample.drawingCode,
      versionNo: sample.versionNo,
    }),
  }))
}

export function buildCertificateMilestoneCompletionSamples(
  samples: CertificateMilestoneCompletionSampleInput[],
): BusinessCompletionSampleInput[] {
  return samples.map((sample) => ({
    sampleId: `certificate_milestone:${normalizeText(sample.certificateId) ?? 'unknown_certificate'}`,
    domain: 'certificate_milestone',
    businessCode: fallbackBusinessCode(sample.milestoneCode, sample.certificateId),
    completedAt: sample.completedAt ?? sample.updatedAt,
    ...sampleBase(sample, {
      certificateId: sample.certificateId,
      milestoneCode: sample.milestoneCode,
    }),
  }))
}

export function buildMaterialHandoverCompletionSamples(
  samples: MaterialHandoverCompletionSampleInput[],
): BusinessCompletionSampleInput[] {
  return samples.map((sample) => ({
    sampleId: `material_handover:${normalizeText(sample.handoverId) ?? 'unknown_handover'}`,
    domain: 'material_handover',
    businessCode: fallbackBusinessCode(sample.handoverCode, sample.handoverId),
    completedAt: sample.acceptedAt ?? sample.completedAt ?? sample.updatedAt,
    ...sampleBase(sample, {
      handoverId: sample.handoverId,
      handoverCode: sample.handoverCode,
    }),
  }))
}

export function buildQualityRectificationCompletionSamples(
  samples: QualityRectificationCompletionSampleInput[],
): BusinessCompletionSampleInput[] {
  return samples.map((sample) => ({
    sampleId: `quality_rectification:${normalizeText(sample.rectificationId) ?? 'unknown_rectification'}`,
    domain: 'quality_rectification',
    businessCode: fallbackBusinessCode(sample.rectificationCode, sample.rectificationId),
    completedAt: sample.closedAt ?? sample.completedAt ?? sample.updatedAt,
    ...sampleBase(sample, {
      rectificationId: sample.rectificationId,
      rectificationCode: sample.rectificationCode,
    }),
  }))
}

export function buildRiskIssueCloseoutCompletionSamples(
  samples: RiskIssueCloseoutCompletionSampleInput[],
): BusinessCompletionSampleInput[] {
  return samples.map((sample) => ({
    sampleId: `risk_issue_closeout:${normalizeText(sample.issueId) ?? 'unknown_issue'}`,
    domain: 'risk_issue_closeout',
    businessCode: fallbackBusinessCode(sample.issueCode, sample.issueId),
    completedAt: sample.resolvedAt ?? sample.closedAt ?? sample.completedAt ?? sample.updatedAt,
    ...sampleBase(sample, {
      issueId: sample.issueId,
      issueCode: sample.issueCode,
    }),
  }))
}

export async function buildAndPersistBusinessCompletionSampleHealthReport(
  input: BuildAndPersistBusinessCompletionSampleHealthReportInput,
): Promise<BuildAndPersistAlgorithmAssetSampleHealthReportResult> {
  return buildAndPersistAlgorithmAssetSampleHealthReport({
    assetKey: 'business_completion.sample_health',
    sourceModule: 'businessCompletionSampleHealthAdapterService',
    learningTarget: 'governance_report',
    queryExec: input.queryExec,
    samples: input.samples.map((sample) => {
      const completedAt = completionDateFor(sample)
      const domain = normalizeText(sample.domain) ?? 'unknown_domain'
      const businessCode = normalizeText(sample.businessCode) ?? 'unknown_business_code'
      return {
        sampleId: sample.sampleId,
        companyId: sample.companyId ?? input.companyId,
        projectId: sample.projectId ?? input.projectId,
        workCode: workCodeFor(sample),
        status: 'completed',
        actualStartDate: normalizeText(sample.startedAt) ?? completedAt,
        actualEndDate: completedAt,
        completionEventAt: completedAt,
        updatedAt: normalizeText(sample.updatedAt),
        qualitySignal: sample.qualitySignal,
        benchmarkEligible: false,
        metadata: {
          ...(sample.metadata ?? {}),
          domain,
          businessCode,
          nonDurationBusinessCompletionSample: true,
        },
      }
    }),
  })
}
