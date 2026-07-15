import { createHash } from 'node:crypto'

import {
  CERTIFICATE_TEMPLATE_SEED_VERSION,
  GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE,
  type CertificateTemplateCityOverride,
  type CertificateTemplateProvinceMaterialPackageOverride,
  type CertificateTemplateProvincePolicySource,
  type CertificateTemplateProvinceProfile,
  type CertificateTemplateSeed,
} from '../seeds/certificateTemplateSeed.js'
import { supabase } from './dbService.js'
import {
  buildPolicyOpsAutoPublishDecision,
  isPolicyOpsStableAutoPublishRun,
  type PolicyOpsAutoPublishDecision,
} from './policyOpsAutoPublishGateService.js'
import { createAndPersistAlgorithmAssetCandidateEvent } from './algorithmAssetCandidateEventAdapterService.js'
import {
  loadLatestStablePolicyTemplateEntityRuntimeRecord,
} from './policyTemplateEntityRuntimeProjectionService.js'

export type CertificatePolicyUpdateAssetType = 'province_profile' | 'city_override'
export type CertificatePolicyUpdateReasonCode = 'review_due' | 'weak_source'
export type CertificatePolicySourceHealth = 'healthy' | 'missing_url' | 'untrusted_url'
export type CertificatePolicyContentChangeSignal = 'material' | 'authority' | 'procedure' | 'deadline' | 'fee' | 'document'

export interface CertificatePolicyStructuredMaterialPackageFacts {
  materialPackageCode: string
  materialNames: string[]
}

export interface CertificatePolicyStructuredMaterialItemFact {
  materialName: string
  materialPackageCode: string
  requirementRole: 'required' | 'tolerance' | 'electronic_license' | 'prerequisite_output'
}

export interface CertificatePolicyStructuredMaterialAliasFact {
  aliasName: string
  canonicalName: string
  materialPackageCode: string
}

export interface CertificatePolicyStructuredMaterialReplacementFact {
  materialPackageCode: string
  removedMaterialName: string
  addedMaterialName: string
}

export interface CertificatePolicyStructuredMaterialRemovalFact {
  materialPackageCode: string
  removedMaterialName: string
}

export interface CertificatePolicyStructuredFacts {
  materialPackages: CertificatePolicyStructuredMaterialPackageFacts[]
  materialItems: CertificatePolicyStructuredMaterialItemFact[]
  materialAliases: CertificatePolicyStructuredMaterialAliasFact[]
  materialReplacements: CertificatePolicyStructuredMaterialReplacementFact[]
  materialRemovals: CertificatePolicyStructuredMaterialRemovalFact[]
  authorityNames: string[]
  procedureSteps: string[]
  deadlineTexts: string[]
  certificateOutputs: string[]
  riskHints: {
    procedureChanged: boolean
    deadlineChanged: boolean
    certificateOutputChanged: boolean
  }
}

export type CertificatePolicyRuleDiffType =
  | 'material_package_addition'
  | 'material_alias_addition'
  | 'material_replacement'
  | 'material_removal'
  | 'authority_alias_addition'
  | 'procedure_change'
  | 'deadline_change'
  | 'certificate_output_change'

export interface CertificatePolicyRuleDiff {
  diffType: CertificatePolicyRuleDiffType
  risk: 'low' | 'high'
  assetCode: string
  targetCode: string
  addedValues: string[]
  removedValues?: string[]
}

export interface CertificatePolicyPublishedRuleOverlay {
  materialPackageOverrides?: CertificateTemplateProvinceMaterialPackageOverride[]
  authorityAliases?: Record<string, string>
}

export interface CertificatePolicySourceIssue {
  issueCode: 'missing_source_url' | 'untrusted_source_url'
  sourceName: string
  sourceUrl?: string
  checkedAt: string
  policyLevel: CertificateTemplateProvincePolicySource['policyLevel']
}

export interface CertificatePolicySourceSnapshot {
  sourceName: string
  sourceUrl: string
  policyLevel: CertificateTemplateProvincePolicySource['policyLevel']
  checkedAt: string
  sourceHealth: CertificatePolicySourceHealth
  fetchStatus: 'fetched' | 'blocked'
  contentHash: string | null
  previousContentHash: string | null
  diffStatus: 'unchanged' | 'changed' | 'unknown'
  changeSignals: CertificatePolicyContentChangeSignal[]
  changeRisk: 'low' | 'material_affecting' | 'source_unavailable'
  autoPublishDecision: 'auto_publish_allowed' | 'block_auto_publish_and_retain_previous_seed'
  extractionStatus?: 'accepted' | 'blocked'
  extractionFormat?: 'html' | 'text'
  extractionConfidence?: 'high' | 'medium' | 'low'
  extractionBlockReason?: 'empty_source_text' | 'policy_body_too_short' | 'policy_semantics_missing'
  structuredPolicyFacts?: CertificatePolicyStructuredFacts
}

export interface CertificatePolicySourceTextExtractionResult {
  accepted: boolean
  text: string
  format: 'html' | 'text'
  confidence: 'high' | 'medium' | 'low'
  blockReason?: 'empty_source_text' | 'policy_body_too_short' | 'policy_semantics_missing'
}

export interface BuildCertificatePolicySourceSnapshotOptions {
  source: CertificateTemplateProvincePolicySource
  previousContentHash?: string | null
  fetchText: (sourceUrl: string) => Promise<string>
}

export interface PublishCertificatePolicyAutoPublishOptions extends BuildCertificatePolicyUpdateOptions {
  useLiveSourceSnapshots?: boolean
  previousAutoPublishRun?: CertificatePolicyAutoPublishRun | null
  fetchText?: (sourceUrl: string) => Promise<string>
  sourceFetchTimeoutMs?: number
}

export interface CertificatePolicyUpdateCandidate {
  candidateCode: string
  assetCode: string
  assetType: CertificatePolicyUpdateAssetType
  assetName: string
  provinceCode: string
  cityCode?: string
  currentProfileVersion: string
  currentReviewStatus: CertificateTemplateProvinceProfile['reviewStatus'] | CertificateTemplateCityOverride['reviewStatus']
  effectiveFrom: string
  lastReviewedAt: string
  nextReviewDueAt: string
  reasonCode: CertificatePolicyUpdateReasonCode
  updateStatus: 'auto_publish_candidate' | 'auto_publish_blocked'
  proposedAction: 'auto_publish_when_trusted_sources_pass' | 'block_auto_publish_and_retain_previous_seed'
  runtimeConsumptionPolicy: 'auto_published_seed_after_job' | 'previous_published_seed_retained'
  sourceHealth: CertificatePolicySourceHealth
  sourceIssues: CertificatePolicySourceIssue[]
  policySources: CertificateTemplateProvincePolicySource[]
}

export interface CertificatePolicyAutoPublishedUpdate {
  candidateCode: string
  assetCode: string
  assetType: CertificatePolicyUpdateAssetType
  assetName: string
  provinceCode: string
  cityCode?: string
  sourceProfileVersion: string
  publishedProfileVersion: string
  publishStatus: 'auto_published'
  reasonCode: CertificatePolicyUpdateReasonCode
  publicationGate: 'trusted_official_sources_only'
  runtimeConsumptionPolicy: 'auto_published_seed'
  sourceHealth: 'healthy'
  policySources: CertificateTemplateProvincePolicySource[]
  sourceSnapshots?: CertificatePolicySourceSnapshot[]
  policyRuleDiffs?: CertificatePolicyRuleDiff[]
  publishedRuleOverlay?: CertificatePolicyPublishedRuleOverlay
}

export interface CertificatePolicyBlockedAutoPublishUpdate {
  candidateCode: string
  assetCode: string
  assetType: CertificatePolicyUpdateAssetType
  assetName: string
  provinceCode: string
  cityCode?: string
  publishStatus: 'blocked'
  blockReason:
    | 'missing_or_weak_policy_source'
    | 'policy_source_unavailable'
    | 'policy_content_material_affecting_change'
  reasonCode: CertificatePolicyUpdateReasonCode
  runtimeConsumptionPolicy: 'previous_published_seed_retained'
  sourceHealth: CertificatePolicySourceHealth
  sourceIssues: CertificatePolicySourceIssue[]
  sourceSnapshots?: CertificatePolicySourceSnapshot[]
  policyRuleDiffs?: CertificatePolicyRuleDiff[]
}

export interface CertificatePolicyAutoPublishPlan {
  planCode: 'certificate_template_policy_auto_publish_plan'
  seedVersion: string
  asOfDate: string
  updateMode: 'trusted_source_auto_publish'
  runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only'
  publicationGate: 'trusted_official_sources_only'
  rollbackPolicy: 'previous_seed_version_retained_for_rollback'
  summary: {
    candidateUpdateCount: number
    autoPublishedUpdateCount: number
    blockedUpdateCount: number
  }
  autoPublishedUpdates: CertificatePolicyAutoPublishedUpdate[]
  blockedUpdates: CertificatePolicyBlockedAutoPublishUpdate[]
  automationQuality: CertificatePolicyAutomationQuality
}

export interface CertificatePolicyAutoPublishRun extends CertificatePolicyAutoPublishPlan {
  runCode: 'certificate_template_policy_auto_publish_run'
  runId: string
  publicationStatus: 'published'
  policyOpsDecision: PolicyOpsAutoPublishDecision
  publishedAt: string
  appliedAutoPublishedSeedCount: number
  retainedPreviousPublishedSeedCount: number
}

export interface CertificatePolicyAutoPublishRunRecord {
  run_id: string
  run_code: CertificatePolicyAutoPublishRun['runCode']
  seed_version: string
  as_of_date: string
  publication_status: CertificatePolicyAutoPublishRun['publicationStatus']
  published_at: string
  update_mode: CertificatePolicyAutoPublishRun['updateMode']
  runtime_preview_policy: CertificatePolicyAutoPublishRun['runtimePreviewPolicy']
  publication_gate: CertificatePolicyAutoPublishRun['publicationGate']
  rollback_policy: CertificatePolicyAutoPublishRun['rollbackPolicy']
  applied_auto_published_seed_count: number
  retained_previous_published_seed_count: number
  summary: CertificatePolicyAutoPublishRun['summary']
  automation_quality: CertificatePolicyAutoPublishRun['automationQuality']
  auto_published_updates: CertificatePolicyAutoPublishRun['autoPublishedUpdates']
  blocked_updates: CertificatePolicyAutoPublishRun['blockedUpdates']
  record_visibility_policy: 'backend_admin_audit_only'
}

export interface CertificatePolicyReplayCalibrationSample {
  projectId: string
  provinceCode?: string | null
  cityCode?: string | null
  certificateType?: string | null
  sampleSource?: 'system_project_certificate' | 'official_public_certificate_record' | string | null
  sampleGranularity?: 'named_public_certificate_record' | 'official_city_entry' | string | null
  evidenceScope?: string | null
  sourceUrl?: string | null
  evidenceDocumentNumber?: string | null
  evidenceIssuedAt?: string | null
  expectedMaterialNames?: string[] | null
  actualMaterialNames?: string[] | null
  expectedAuthority?: string | null
  actualAuthority?: string | null
  expectedReusableOutputNames?: string[] | null
  actualReusableOutputNames?: string[] | null
}

export interface CertificatePolicySourceCoverageQuality {
  totalPublishedAssetCount: number
  trustedOfficialSourceAssetCount: number
  missingOrWeakSourceAssetCount: number
  coverageRate: number
  coverageStatus: 'ready' | 'needs_source_expansion'
}

export interface CertificatePolicyParseHitRateQuality {
  evaluatedSnapshotCount: number
  materialHitCount: number
  authorityHitCount: number
  procedureHitCount: number
  deadlineHitCount: number
  certificateOutputHitCount: number
  averageHitRate: number
  status: 'not_evaluated' | 'ready_for_rule_diff' | 'needs_parser_training'
}

export interface CertificatePolicyProjectReplayCalibrationQuality {
  sampleCount: number
  calibratedSampleCount: number
  materialMatchRate: number
  authorityMatchRate: number
  predecessorReuseMatchRate: number
  status: 'needs_more_samples' | 'candidate_overlay_ready' | 'needs_human_review'
  calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation'
}

export interface CertificatePolicyAutomationQuality {
  sourceCoverage: CertificatePolicySourceCoverageQuality
  policyParseHitRate: CertificatePolicyParseHitRateQuality
  projectReplayCalibration: CertificatePolicyProjectReplayCalibrationQuality
  policyOpsDecision?: PolicyOpsAutoPublishDecision
}

export interface CertificatePolicyUpdateAssetDigest {
  assetCode: string
  assetType: CertificatePolicyUpdateAssetType
  assetName: string
  provinceCode: string
  cityCode?: string
  reviewStatus: CertificateTemplateProvinceProfile['reviewStatus'] | CertificateTemplateCityOverride['reviewStatus']
  nextReviewDueAt: string
  sourceHealth: CertificatePolicySourceHealth
  sourceIssueCount: number
  overdue: boolean
}

export interface CertificatePolicyUpdateGovernanceReport {
  reportCode: 'certificate_template_policy_update_governance'
  seedVersion: string
  asOfDate: string
  frontendExposurePolicy: 'backend_admin_api_only'
  runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only'
  summary: {
    totalProvinceProfiles: number
    totalPublishedProvinceProfiles: number
    totalPublishedCityOverrides: number
    overdueAssetCount: number
    weakSourceAssetCount: number
    autoPublishCandidateCount: number
    autoPublishedUpdateCount: number
    blockedAutoPublishUpdateCount: number
  }
  sourceHealthCounts: Record<CertificatePolicySourceHealth, number>
  reviewStatusCounts: Record<'published' | 'candidate' | 'deprecated', number>
  automationQuality: CertificatePolicyAutomationQuality
  assets: CertificatePolicyUpdateAssetDigest[]
  candidates: CertificatePolicyUpdateCandidate[]
  autoPublishPlan: CertificatePolicyAutoPublishPlan
}

export interface BuildCertificatePolicyUpdateOptions {
  template?: CertificateTemplateSeed
  asOfDate?: string | Date
  sourceSnapshotProvider?: (source: CertificateTemplateProvincePolicySource) => CertificatePolicySourceSnapshot | Promise<CertificatePolicySourceSnapshot>
  replaySamples?: CertificatePolicyReplayCalibrationSample[]
}

interface PolicyAsset {
  assetCode: string
  assetType: CertificatePolicyUpdateAssetType
  assetName: string
  provinceCode: string
  cityCode?: string
  profileVersion: string
  reviewStatus: CertificatePolicyUpdateCandidate['currentReviewStatus']
  effectiveFrom: string
  lastReviewedAt: string
  nextReviewDueAt: string
  policySources: CertificateTemplateProvincePolicySource[]
}

const REVIEW_STATUSES = ['published', 'candidate', 'deprecated'] as const

let latestAutoPublishRun: CertificatePolicyAutoPublishRun | null = null
let latestStableAutoPublishRun: CertificatePolicyAutoPublishRun | null = null
const CERTIFICATE_POLICY_TEMPLATE_RELEASE_TARGET_TABLE = 'certificate_template_policy_auto_publish_runs' as const

const DEFAULT_CERTIFICATE_POLICY_SOURCE_FETCH_TIMEOUT_MS = readPositiveIntEnv(
  'CERTIFICATE_POLICY_SOURCE_FETCH_TIMEOUT_MS',
  15_000,
)

function readPositiveIntEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeDateInput(value: string | Date | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function isDateOnOrBefore(dateValue: string, asOfDate: string) {
  return Boolean(dateValue) && dateValue.slice(0, 10) <= asOfDate
}

function buildPolicyAssets(template: CertificateTemplateSeed): PolicyAsset[] {
  const provinceProfileAssets = template.provinceProfiles.map((profile) => ({
    assetCode: `province_profile:${profile.provinceCode}`,
    assetType: 'province_profile' as const,
    assetName: profile.provinceName,
    provinceCode: profile.provinceCode,
    profileVersion: profile.profileVersion,
    reviewStatus: profile.reviewStatus,
    effectiveFrom: profile.effectiveFrom,
    lastReviewedAt: profile.lastReviewedAt,
    nextReviewDueAt: profile.nextReviewDueAt,
    policySources: profile.policySources,
  }))

  const cityOverrideAssets = template.cityOverrides.map((override) => ({
    assetCode: `city_override:${override.overrideCode}`,
    assetType: 'city_override' as const,
    assetName: override.cityName,
    provinceCode: override.provinceCode,
    cityCode: override.cityCode,
    profileVersion: override.profileVersion,
    reviewStatus: override.reviewStatus,
    effectiveFrom: override.effectiveFrom,
    lastReviewedAt: override.lastReviewedAt,
    nextReviewDueAt: override.nextReviewDueAt,
    policySources: override.policySources,
  }))

  return [...provinceProfileAssets, ...cityOverrideAssets]
}

function isTrustedOfficialPolicySourceUrl(sourceUrl: string) {
  let hostname = ''
  try {
    hostname = new URL(sourceUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  return hostname === 'gov.cn' || hostname.endsWith('.gov.cn')
}

function normalizeSnapshotText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
}

function stripHtmlToPolicyText(value: string) {
  const withoutScripts = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
  const bodyMatch =
    withoutScripts.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i)
    ?? withoutScripts.match(/<div\b[^>]*(?:class|id)=["'][^"']*(?:article|content|detail|TRS_Editor|zoom)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
  const body = bodyMatch?.[1] ?? withoutScripts
  return normalizeSnapshotText(
    decodeHtmlEntities(
      body
        .replace(/<(?:br|\/p|\/div|\/h\d|\/li|\/tr)\b[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]*\n[ \t]*/g, '\n'),
    ),
  )
}

function inferPolicySourceTextFormat(value: string): 'html' | 'text' {
  return /<\/?[a-z][\s\S]*>/i.test(value) ? 'html' : 'text'
}

function hasCertificatePolicySemantics(text: string) {
  return /工程建设|审批|施工许可|规划许可|建设用地|建设工程|申请材料|办理部门|办理流程|承诺时限|证照|许可证/.test(text)
}

export function extractCertificatePolicySourceText(rawText: string): CertificatePolicySourceTextExtractionResult {
  const format = inferPolicySourceTextFormat(rawText)
  const text = format === 'html' ? stripHtmlToPolicyText(rawText) : normalizeSnapshotText(rawText)
  if (!text) {
    return { accepted: false, text, format, confidence: 'low', blockReason: 'empty_source_text' }
  }
  const minimumPolicyBodyLength = format === 'html' ? 80 : 30
  if (text.length < minimumPolicyBodyLength) {
    return { accepted: false, text, format, confidence: 'low', blockReason: 'policy_body_too_short' }
  }
  if (!hasCertificatePolicySemantics(text)) {
    return { accepted: false, text, format, confidence: 'low', blockReason: 'policy_semantics_missing' }
  }
  const hasPolicyBodySignals = /申请材料|办理部门|办理流程|承诺时限|附件/.test(text)
  const confidence = ((text.length >= 120 || hasPolicyBodySignals) && /工程建设/.test(text) && /施工许可|规划许可|建设用地|建设工程/.test(text))
    ? 'high'
    : 'medium'
  return { accepted: true, text, format, confidence }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function splitPolicyList(value: string) {
  return uniqueStrings(
    value
      .split(/[、，,；;。\n]/)
      .map((item) => item.replace(/^(及|和|与|或|等)/, '').replace(/等$/, '').trim()),
  )
}

function extractPolicySections(text: string, labels: string[]) {
  const sections: string[] = []
  for (const label of labels) {
    const pattern = new RegExp(`${label}[：:](.*?)(?:。|\\n|$)`, 'g')
    for (const match of text.matchAll(pattern)) {
      if (match?.[1]) sections.push(match[1].trim())
    }
  }
  return sections
}

function extractPolicySection(text: string, labels: string[]) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[：:](.*?)(?:。|\\n|$)`)
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function inferMaterialPackageCode(materialName: string) {
  if (/施工许可|质量安全|农民工|实名制|扬尘|施工合同|监理|审图|施工图/.test(materialName)) {
    return 'PKG-CERT-CP-COMMON'
  }
  if (/工程规划|建设工程|设计方案|总平面|蓝图|定位/.test(materialName)) {
    return 'PKG-CERT-EPP-COMMON'
  }
  if (/用地规划|规划条件|用地红线|选址|预审/.test(materialName)) {
    return 'PKG-CERT-LUP-COMMON'
  }
  if (/土地|不动产|出让|划拨|权属|宗地|完税|契税/.test(materialName)) {
    return 'PKG-CERT-LAND-COMMON'
  }
  return 'PKG-CERT-CP-COMMON'
}

function materialNamesToPackageFacts(materialNames: string[]) {
  const grouped = new Map<string, string[]>()
  for (const materialName of materialNames) {
    const packageCode = inferMaterialPackageCode(materialName)
    grouped.set(packageCode, uniqueStrings([...(grouped.get(packageCode) ?? []), materialName]))
  }
  return [...grouped.entries()].map(([materialPackageCode, names]) => ({
    materialPackageCode,
    materialNames: names,
  }))
}

function buildMaterialItemFacts(
  materialNames: string[],
  requirementRole: CertificatePolicyStructuredMaterialItemFact['requirementRole'],
  inferPackageCode: (materialName: string) => string = inferMaterialPackageCode,
) {
  return materialNames.map((materialName) => ({
    materialName,
    materialPackageCode: inferPackageCode(materialName),
    requirementRole,
  }))
}

function inferPrerequisiteOutputPackageCode(materialName: string) {
  if (/建设工程规划许可证|工程规划许可证/.test(materialName)) return 'PKG-CERT-CP-COMMON'
  if (/建设用地规划许可证|用地规划许可证/.test(materialName)) return 'PKG-CERT-EPP-COMMON'
  if (/土地|不动产|权属/.test(materialName)) return 'PKG-CERT-LUP-COMMON'
  return inferMaterialPackageCode(materialName)
}

function mergeMaterialPackageFacts(
  packageFacts: CertificatePolicyStructuredMaterialPackageFacts[],
  itemFacts: CertificatePolicyStructuredMaterialItemFact[],
) {
  const grouped = new Map<string, string[]>()
  for (const packageFact of packageFacts) {
    grouped.set(packageFact.materialPackageCode, [
      ...(grouped.get(packageFact.materialPackageCode) ?? []),
      ...packageFact.materialNames,
    ])
  }
  for (const itemFact of itemFacts) {
    grouped.set(itemFact.materialPackageCode, [
      ...(grouped.get(itemFact.materialPackageCode) ?? []),
      itemFact.materialName,
    ])
  }
  return [...grouped.entries()].map(([materialPackageCode, materialNames]) => ({
    materialPackageCode,
    materialNames: uniqueStrings(materialNames),
  }))
}

function parseMaterialAliases(text: string): CertificatePolicyStructuredMaterialAliasFact[] {
  return extractPolicySections(text, ['材料别名', '资料别名']).flatMap((section) =>
    splitPolicyList(section)
      .map((item) => {
        const [aliasName, canonicalName] = item.split(/[=＝]/).map((part) => part?.trim())
        if (!aliasName || !canonicalName) return null
        return {
          aliasName,
          canonicalName,
          materialPackageCode: inferMaterialPackageCode(`${aliasName}${canonicalName}`),
        }
      })
      .filter((item): item is CertificatePolicyStructuredMaterialAliasFact => Boolean(item)),
  )
}

function parseMaterialReplacements(text: string): CertificatePolicyStructuredMaterialReplacementFact[] {
  const replacements: CertificatePolicyStructuredMaterialReplacementFact[] = []
  for (const match of text.matchAll(/(?:不再提交|取消提交|删除|移除)([^。，；;]+?)(?:，|,)?改为([^。，；;]+)/g)) {
    const removedMaterialName = match[1]?.trim()
    const addedMaterialName = match[2]?.trim()
    if (!removedMaterialName || !addedMaterialName) continue
    replacements.push({
      materialPackageCode: inferMaterialPackageCode(`${removedMaterialName}${addedMaterialName}`),
      removedMaterialName,
      addedMaterialName,
    })
  }
  return replacements
}

function parseMaterialRemovals(text: string, replacements: CertificatePolicyStructuredMaterialReplacementFact[]) {
  const replacedNames = new Set(replacements.map((replacement) => replacement.removedMaterialName))
  const removals: CertificatePolicyStructuredMaterialRemovalFact[] = []
  for (const match of text.matchAll(/(?:不再提交|取消提交|删除|移除)([^。，；;]+)/g)) {
    const removedMaterialName = match[1]?.replace(/，?改为.*/, '').trim()
    if (!removedMaterialName || replacedNames.has(removedMaterialName)) continue
    removals.push({
      materialPackageCode: inferMaterialPackageCode(removedMaterialName),
      removedMaterialName,
    })
  }
  return removals
}

function parseCertificateOutputs(text: string) {
  return uniqueStrings([
    ...extractPolicySections(text, [
      '\u529e\u7406\u7ed3\u679c',
      '\u529e\u7ed3\u7ed3\u679c',
      '\u6838\u53d1\u8bc1\u7167',
    ]).flatMap(splitPolicyList),
    ...Array.from(
      text.matchAll(
        /(?:\u529e\u7406\u7ed3\u679c|\u529e\u7ed3\u7ed3\u679c|\u6838\u53d1\u8bc1\u7167)(?:\u8c03\u6574)?(?:\u4e3a)([^。，；]+?\u8bc1\u7167)/g,
      ),
    ).map((match) => match[1]?.trim() ?? ''),
  ])
}

export function parseCertificatePolicyStructuredFacts(content: string): CertificatePolicyStructuredFacts {
  const text = normalizeSnapshotText(content)
  const materialSections = extractPolicySections(text, [
    '土地权属办理申请材料',
    '土地证申请材料',
    '建设用地规划许可证申请材料',
    '用地规划许可证申请材料',
    '建设工程规划许可证申请材料',
    '工程规划许可证申请材料',
    '施工许可证申请材料',
    '施工许可申请材料',
    '施工许可申请材料',
    '申请材料',
    '资料清单',
    '申报材料',
    '提交材料',
  ])
  const materialNames = uniqueStrings(materialSections.flatMap(splitPolicyList))
  const toleranceMaterials = uniqueStrings(extractPolicySections(text, ['可容缺材料', '容缺材料']).flatMap(splitPolicyList))
  const electronicLicenseMaterials = uniqueStrings(extractPolicySections(text, ['可调用电子证照', '电子证照']).flatMap(splitPolicyList))
  const prerequisiteOutputMaterials = uniqueStrings(extractPolicySections(text, ['前置成果', '前置结果', '前置证照']).flatMap(splitPolicyList))
  const materialItems = [
    ...buildMaterialItemFacts(materialNames, 'required'),
    ...buildMaterialItemFacts(toleranceMaterials, 'tolerance'),
    ...buildMaterialItemFacts(electronicLicenseMaterials, 'electronic_license'),
    ...buildMaterialItemFacts(prerequisiteOutputMaterials, 'prerequisite_output', inferPrerequisiteOutputPackageCode),
  ]
  const authoritySection = extractPolicySection(text, [
    '办理部门',
    '主管部门',
    '审批部门',
    '受理部门',
    '办理窗口',
  ])
  const procedureSection = extractPolicySection(text, [
    '办理流程',
    '审批流程',
    '办理环节',
    '流程',
  ])
  const deadlineSection = extractPolicySection(text, [
    '承诺时限',
    '办理时限',
    '法定时限',
    '时限',
  ])
  const deadlineTexts = uniqueStrings(
    [
      ...splitPolicyList(deadlineSection),
      ...Array.from(text.matchAll(/\d+\s*个?工作日/g)).map((match) => match[0].replace(/\s+/g, '')),
    ],
  )
  const materialAliases = parseMaterialAliases(text)
  const materialReplacements = parseMaterialReplacements(text)
  const materialRemovals = parseMaterialRemovals(text, materialReplacements)
  const certificateOutputs = parseCertificateOutputs(text)

  return {
    materialPackages: mergeMaterialPackageFacts(materialNamesToPackageFacts(materialNames), materialItems),
    materialItems,
    materialAliases,
    materialReplacements,
    materialRemovals,
    authorityNames: splitPolicyList(authoritySection),
    procedureSteps: splitPolicyList(procedureSection),
    deadlineTexts,
    certificateOutputs,
    riskHints: {
      procedureChanged: /调整.*流程|流程调整|变更.*流程|改为|调整为/.test(text) && /流程|受理|审查|核发/.test(text),
      deadlineChanged: /调整.*时限|时限.*调整|由\d+\s*个?工作日调整为\d+\s*个?工作日/.test(text),
      certificateOutputChanged: /办理结果调整|办结结果调整|核发证照调整|调整为.*证照/.test(text),
    },
  }
}

export function buildCertificatePolicySourceSnapshotHash(content: string) {
  return createHash('sha256').update(normalizeSnapshotText(content)).digest('hex')
}

function buildUnavailableCertificatePolicySourceSnapshot(
  source: CertificateTemplateProvincePolicySource,
  previousContentHash?: string | null,
): CertificatePolicySourceSnapshot {
  const sourceUrl = source.sourceUrl?.trim() ?? ''
  const sourceIssues = buildCertificatePolicySourceIssues([source])
  return {
    sourceName: source.sourceName,
    sourceUrl,
    policyLevel: source.policyLevel,
    checkedAt: source.checkedAt,
    sourceHealth: getSourceHealth(sourceIssues),
    fetchStatus: 'blocked',
    contentHash: null,
    previousContentHash: previousContentHash ?? null,
    diffStatus: 'unknown',
    changeSignals: [],
    changeRisk: 'source_unavailable',
    autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
  }
}

export async function fetchCertificatePolicySourceText(
  sourceUrl: string,
  timeoutMs = DEFAULT_CERTIFICATE_POLICY_SOURCE_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error(`Certificate policy source fetch timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
    const response = await Promise.race([
      fetch(sourceUrl, {
        signal: controller.signal,
        headers: {
          'user-agent': 'WorkBuddy-CertificatePolicyBot/1.0',
          accept: 'text/html,application/xhtml+xml,application/pdf,text/plain,*/*',
        },
      }),
      timeout,
    ])
    if (!response.ok) {
      throw new Error(`Certificate policy source fetch failed: HTTP ${response.status}`)
    }
    return response.text()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function detectCertificatePolicyChangeSignals(content: string): CertificatePolicyContentChangeSignal[] {
  const signals: CertificatePolicyContentChangeSignal[] = []
  const text = normalizeSnapshotText(content)
  const signalPatterns: Array<[CertificatePolicyContentChangeSignal, RegExp]> = [
    ['material', /材料|资料|清单|申请表|证明/],
    ['authority', /部门|窗口|主管|审批|受理/],
    ['procedure', /流程|环节|办理|审查|审批改革/],
    ['deadline', /时限|期限|工作日|承诺办结/],
    ['fee', /费用|收费|缴费|税费/],
    ['document', /许可证|证书|批复|合同|图纸/],
  ]
  for (const [signal, pattern] of signalPatterns) {
    if (pattern.test(text)) signals.push(signal)
  }
  return signals
}

export async function buildCertificatePolicySourceSnapshot(
  options: BuildCertificatePolicySourceSnapshotOptions,
): Promise<CertificatePolicySourceSnapshot> {
  const sourceUrl = options.source.sourceUrl?.trim() ?? ''
  const sourceIssues = buildCertificatePolicySourceIssues([options.source])
  const sourceHealth = getSourceHealth(sourceIssues)
  if (!sourceUrl || sourceHealth !== 'healthy') {
    return {
      sourceName: options.source.sourceName,
      sourceUrl,
      policyLevel: options.source.policyLevel,
      checkedAt: options.source.checkedAt,
      sourceHealth,
      fetchStatus: 'blocked',
      contentHash: null,
      previousContentHash: options.previousContentHash ?? null,
      diffStatus: 'unknown',
      changeSignals: [],
      changeRisk: 'source_unavailable',
      autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
    }
  }

  let content = ''
  try {
    content = await options.fetchText(sourceUrl)
  } catch {
    return buildUnavailableCertificatePolicySourceSnapshot(options.source, options.previousContentHash)
  }
  const extraction = extractCertificatePolicySourceText(content)
  if (!extraction.accepted) {
    return {
      sourceName: options.source.sourceName,
      sourceUrl,
      policyLevel: options.source.policyLevel,
      checkedAt: options.source.checkedAt,
      sourceHealth,
      fetchStatus: 'blocked',
      contentHash: null,
      previousContentHash: options.previousContentHash ?? null,
      diffStatus: 'unknown',
      changeSignals: [],
      changeRisk: 'source_unavailable',
      autoPublishDecision: 'block_auto_publish_and_retain_previous_seed',
      extractionStatus: 'blocked',
      extractionFormat: extraction.format,
      extractionConfidence: extraction.confidence,
      extractionBlockReason: extraction.blockReason,
    }
  }
  const contentHash = buildCertificatePolicySourceSnapshotHash(extraction.text)
  const previousContentHash = options.previousContentHash ?? null
  const diffStatus = previousContentHash && previousContentHash !== contentHash ? 'changed' : 'unchanged'
  const changeSignals = diffStatus === 'changed' ? detectCertificatePolicyChangeSignals(extraction.text) : []
  const hasMaterialAffectingChange = changeSignals.some((signal) =>
    ['material', 'authority', 'procedure', 'deadline', 'fee', 'document'].includes(signal),
  )
  return {
    sourceName: options.source.sourceName,
    sourceUrl,
    policyLevel: options.source.policyLevel,
    checkedAt: options.source.checkedAt,
    sourceHealth,
    fetchStatus: 'fetched',
    contentHash,
    previousContentHash,
    diffStatus,
    changeSignals,
    changeRisk: hasMaterialAffectingChange ? 'material_affecting' : 'low',
    autoPublishDecision: hasMaterialAffectingChange
      ? 'block_auto_publish_and_retain_previous_seed'
      : 'auto_publish_allowed',
    extractionStatus: 'accepted',
    extractionFormat: extraction.format,
    extractionConfidence: extraction.confidence,
    structuredPolicyFacts: parseCertificatePolicyStructuredFacts(extraction.text),
  }
}

export function buildCertificatePolicySourceIssues(
  policySources: CertificateTemplateProvincePolicySource[],
): CertificatePolicySourceIssue[] {
  const issues: CertificatePolicySourceIssue[] = []
  for (const source of policySources) {
    const sourceUrl = source.sourceUrl?.trim()
    if (!sourceUrl) {
      issues.push({
        issueCode: 'missing_source_url',
        sourceName: source.sourceName,
        checkedAt: source.checkedAt,
        policyLevel: source.policyLevel,
      })
    } else if (!isTrustedOfficialPolicySourceUrl(sourceUrl)) {
      issues.push({
        issueCode: 'untrusted_source_url',
        sourceName: source.sourceName,
        sourceUrl,
        checkedAt: source.checkedAt,
        policyLevel: source.policyLevel,
      })
    }
  }
  return issues
}

function getSourceHealth(sourceIssues: CertificatePolicySourceIssue[]): CertificatePolicySourceHealth {
  if (sourceIssues.some((issue) => issue.issueCode === 'missing_source_url')) return 'missing_url'
  if (sourceIssues.some((issue) => issue.issueCode === 'untrusted_source_url')) return 'untrusted_url'
  return 'healthy'
}

function buildCandidate(
  asset: PolicyAsset,
  reasonCode: CertificatePolicyUpdateReasonCode,
  sourceIssues: CertificatePolicySourceIssue[],
): CertificatePolicyUpdateCandidate {
  const sourceHealth = getSourceHealth(sourceIssues)
  const autoPublishReady = sourceHealth === 'healthy'
  return {
    candidateCode: `${asset.assetCode}:${reasonCode}:${asset.nextReviewDueAt}`,
    assetCode: asset.assetCode,
    assetType: asset.assetType,
    assetName: asset.assetName,
    provinceCode: asset.provinceCode,
    cityCode: asset.cityCode,
    currentProfileVersion: asset.profileVersion,
    currentReviewStatus: asset.reviewStatus,
    effectiveFrom: asset.effectiveFrom,
    lastReviewedAt: asset.lastReviewedAt,
    nextReviewDueAt: asset.nextReviewDueAt,
    reasonCode,
    updateStatus: autoPublishReady ? 'auto_publish_candidate' : 'auto_publish_blocked',
    proposedAction: autoPublishReady
      ? 'auto_publish_when_trusted_sources_pass'
      : 'block_auto_publish_and_retain_previous_seed',
    runtimeConsumptionPolicy: autoPublishReady
      ? 'auto_published_seed_after_job'
      : 'previous_published_seed_retained',
    sourceHealth,
    sourceIssues,
    policySources: asset.policySources,
  }
}

function buildPublishedProfileVersion(currentVersion: string, asOfDate: string) {
  return `${currentVersion}-policy-auto-${asOfDate.replace(/-/g, '')}`
}

function createAutoPublishRunId(asOfDate: string) {
  return `certificate-policy-auto-publish:${asOfDate}:${Date.now()}`
}

function findPolicyAssetByAssetCode(template: CertificateTemplateSeed, assetCode: string) {
  if (assetCode.startsWith('province_profile:')) {
    const provinceCode = assetCode.replace('province_profile:', '')
    return template.provinceProfiles.find((profile) => profile.provinceCode === provinceCode) ?? null
  }
  if (assetCode.startsWith('city_override:')) {
    const overrideCode = assetCode.replace('city_override:', '')
    return template.cityOverrides.find((override) => override.overrideCode === overrideCode) ?? null
  }
  return null
}

function getExistingMaterialNames(template: CertificateTemplateSeed, assetCode: string, packageCode: string) {
  const basePackage = template.materialPackages.find((materialPackage) => materialPackage.packageCode === packageCode)
  const asset = findPolicyAssetByAssetCode(template, assetCode)
  const packageOverrides = asset?.materialPackageOverrides ?? []
  return new Set([
    ...(basePackage?.materialNames ?? []),
    ...packageOverrides
      .filter((override) => override.materialPackageCode === packageCode)
      .flatMap((override) => [
        ...(override.replaceMaterialNames ?? []),
        ...(override.addMaterialNames ?? []),
      ]),
  ])
}

function getStructuredMaterialChangeNames(facts: CertificatePolicyStructuredFacts) {
  return new Set([
    ...facts.materialAliases.map((alias) => alias.aliasName),
    ...facts.materialReplacements.flatMap((replacement) => [
      replacement.removedMaterialName,
      replacement.addedMaterialName,
    ]),
    ...facts.materialRemovals.map((removal) => removal.removedMaterialName),
  ])
}

function findAuthorityAliasKey(authorityName: string) {
  if (/自然资源|规划/.test(authorityName)) return 'naturalResources'
  if (/住建|住房|城乡建设|建设主管/.test(authorityName)) return 'housingConstruction'
  if (/窗口|审批/.test(authorityName)) return 'approvalWindow'
  if (/政务/.test(authorityName)) return 'governmentService'
  return null
}

export function buildCertificatePolicyRuleDiffs(options: {
  template?: CertificateTemplateSeed
  assetCode: string
  facts: CertificatePolicyStructuredFacts
}): CertificatePolicyRuleDiff[] {
  const template = options.template ?? GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE
  const asset = findPolicyAssetByAssetCode(template, options.assetCode)
  const diffs: CertificatePolicyRuleDiff[] = []
  const structuredMaterialChangeNames = getStructuredMaterialChangeNames(options.facts)

  for (const materialPackage of options.facts.materialPackages) {
    const existingMaterialNames = getExistingMaterialNames(template, options.assetCode, materialPackage.materialPackageCode)
    const addedValues = materialPackage.materialNames.filter((materialName) =>
      !existingMaterialNames.has(materialName) && !structuredMaterialChangeNames.has(materialName),
    )
    if (addedValues.length > 0) {
      diffs.push({
        diffType: 'material_package_addition',
        risk: 'low',
        assetCode: options.assetCode,
        targetCode: materialPackage.materialPackageCode,
        addedValues,
      })
    }
  }

  for (const alias of options.facts.materialAliases) {
    const existingMaterialNames = getExistingMaterialNames(template, options.assetCode, alias.materialPackageCode)
    if (existingMaterialNames.has(alias.aliasName)) continue
    diffs.push({
      diffType: 'material_alias_addition',
      risk: 'low',
      assetCode: options.assetCode,
      targetCode: alias.materialPackageCode,
      addedValues: [alias.aliasName],
    })
  }

  for (const replacement of options.facts.materialReplacements) {
    diffs.push({
      diffType: 'material_replacement',
      risk: 'high',
      assetCode: options.assetCode,
      targetCode: replacement.materialPackageCode,
      addedValues: [replacement.addedMaterialName],
      removedValues: [replacement.removedMaterialName],
    })
  }

  for (const removal of options.facts.materialRemovals) {
    diffs.push({
      diffType: 'material_removal',
      risk: 'high',
      assetCode: options.assetCode,
      targetCode: removal.materialPackageCode,
      addedValues: [],
      removedValues: [removal.removedMaterialName],
    })
  }

  if (options.assetCode.startsWith('province_profile:')) {
    const existingAuthorityAliases =
      asset && 'authorityAliases' in asset ? asset.authorityAliases : {}
    for (const authorityName of options.facts.authorityNames) {
      const aliasKey = findAuthorityAliasKey(authorityName)
      if (!aliasKey || existingAuthorityAliases[aliasKey] === authorityName) continue
      diffs.push({
        diffType: 'authority_alias_addition',
        risk: 'low',
        assetCode: options.assetCode,
        targetCode: aliasKey,
        addedValues: [authorityName],
      })
    }
  }

  if (options.facts.riskHints.procedureChanged) {
    diffs.push({
      diffType: 'procedure_change',
      risk: 'high',
      assetCode: options.assetCode,
      targetCode: 'certificate_handling_steps',
      addedValues: options.facts.procedureSteps,
    })
  }
  if (options.facts.riskHints.deadlineChanged) {
    diffs.push({
      diffType: 'deadline_change',
      risk: 'high',
      assetCode: options.assetCode,
      targetCode: 'certificate_service_deadline',
      addedValues: options.facts.deadlineTexts,
    })
  }
  if (options.facts.riskHints.certificateOutputChanged || options.facts.certificateOutputs.length > 0) {
    diffs.push({
      diffType: 'certificate_output_change',
      risk: 'high',
      assetCode: options.assetCode,
      targetCode: 'certificate_outputs',
      addedValues: options.facts.certificateOutputs,
    })
  }

  return diffs
}

function buildPublishedRuleOverlayFromDiffs(diffs: CertificatePolicyRuleDiff[]): CertificatePolicyPublishedRuleOverlay | null {
  const lowRiskDiffs = diffs.filter((diff) => diff.risk === 'low')
  if (lowRiskDiffs.length === 0) return null

  const materialPackageOverrides = lowRiskDiffs
    .filter((diff) => diff.diffType === 'material_package_addition' || diff.diffType === 'material_alias_addition')
    .map((diff) => ({
      materialPackageCode: diff.targetCode,
      addMaterialNames: diff.addedValues,
      addPolicyBasis: ['trusted official source structured update'],
    }))
  const authorityAliases = lowRiskDiffs
    .filter((diff) => diff.diffType === 'authority_alias_addition')
    .reduce<Record<string, string>>((aliases, diff) => {
      aliases[diff.targetCode] = diff.addedValues[0]
      return aliases
    }, {})

  return {
    ...(materialPackageOverrides.length > 0 ? { materialPackageOverrides } : {}),
    ...(Object.keys(authorityAliases).length > 0 ? { authorityAliases } : {}),
  }
}

function buildRuleDiffsFromSourceSnapshots(
  template: CertificateTemplateSeed,
  candidate: CertificatePolicyUpdateCandidate,
  sourceSnapshots: CertificatePolicySourceSnapshot[],
) {
  const structuredFacts = sourceSnapshots
    .map((snapshot) => snapshot.structuredPolicyFacts)
    .filter((facts): facts is CertificatePolicyStructuredFacts => Boolean(facts))
  return structuredFacts.flatMap((facts) =>
    buildCertificatePolicyRuleDiffs({
      template,
      assetCode: candidate.assetCode,
      facts,
    }),
  )
}

function hasHighRiskPolicyRuleDiff(diffs: CertificatePolicyRuleDiff[]) {
  return diffs.some((diff) => diff.risk === 'high')
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 1000) / 1000
}

function normalizeComparableText(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

function countMatchedValues(expected: string[] | null | undefined, actual: string[] | null | undefined) {
  const expectedValues = uniqueStrings((expected ?? []).map(normalizeComparableText).filter(Boolean))
  const actualValues = new Set((actual ?? []).map(normalizeComparableText).filter(Boolean))
  if (expectedValues.length === 0) return { matched: 0, total: 0 }
  return {
    matched: expectedValues.filter((value) => actualValues.has(value)).length,
    total: expectedValues.length,
  }
}

function buildSourceCoverageQuality(assets: PolicyAsset[]): CertificatePolicySourceCoverageQuality {
  const publishedAssets = assets.filter((asset) => asset.reviewStatus === 'published')
  const trustedOfficialSourceAssetCount = publishedAssets.filter(
    (asset) => buildCertificatePolicySourceIssues(asset.policySources).length === 0,
  ).length
  const totalPublishedAssetCount = publishedAssets.length
  const coverageRate = totalPublishedAssetCount > 0
    ? roundMetric(trustedOfficialSourceAssetCount / totalPublishedAssetCount)
    : 0
  return {
    totalPublishedAssetCount,
    trustedOfficialSourceAssetCount,
    missingOrWeakSourceAssetCount: totalPublishedAssetCount - trustedOfficialSourceAssetCount,
    coverageRate,
    coverageStatus: coverageRate >= 0.95 ? 'ready' : 'needs_source_expansion',
  }
}

function buildPolicyParseHitRateQuality(
  sourceSnapshots: CertificatePolicySourceSnapshot[],
): CertificatePolicyParseHitRateQuality {
  const evaluatedSnapshots = sourceSnapshots.filter((snapshot) => Boolean(snapshot.structuredPolicyFacts))
  const evaluatedSnapshotCount = evaluatedSnapshots.length
  const materialHitCount = evaluatedSnapshots.filter((snapshot) =>
    (snapshot.structuredPolicyFacts?.materialItems.length ?? 0) > 0 ||
    (snapshot.structuredPolicyFacts?.materialPackages.length ?? 0) > 0,
  ).length
  const authorityHitCount = evaluatedSnapshots.filter((snapshot) =>
    (snapshot.structuredPolicyFacts?.authorityNames.length ?? 0) > 0,
  ).length
  const procedureHitCount = evaluatedSnapshots.filter((snapshot) =>
    (snapshot.structuredPolicyFacts?.procedureSteps.length ?? 0) > 0,
  ).length
  const deadlineHitCount = evaluatedSnapshots.filter((snapshot) =>
    (snapshot.structuredPolicyFacts?.deadlineTexts.length ?? 0) > 0,
  ).length
  const certificateOutputHitCount = evaluatedSnapshots.filter((snapshot) =>
    (snapshot.structuredPolicyFacts?.certificateOutputs.length ?? 0) > 0,
  ).length
  const possibleHits = evaluatedSnapshotCount * 5
  const actualHits =
    materialHitCount +
    authorityHitCount +
    procedureHitCount +
    deadlineHitCount +
    certificateOutputHitCount
  const averageHitRate = possibleHits > 0 ? roundMetric(actualHits / possibleHits) : 0
  return {
    evaluatedSnapshotCount,
    materialHitCount,
    authorityHitCount,
    procedureHitCount,
    deadlineHitCount,
    certificateOutputHitCount,
    averageHitRate,
    status: evaluatedSnapshotCount === 0
      ? 'not_evaluated'
      : averageHitRate >= 0.8
      ? 'ready_for_rule_diff'
      : 'needs_parser_training',
  }
}

function buildProjectReplayCalibrationQuality(
  replaySamples: CertificatePolicyReplayCalibrationSample[] = [],
): CertificatePolicyProjectReplayCalibrationQuality {
  let materialMatched = 0
  let materialTotal = 0
  let authorityMatched = 0
  let authorityTotal = 0
  let reuseMatched = 0
  let reuseTotal = 0

  for (const sample of replaySamples) {
    const material = countMatchedValues(sample.expectedMaterialNames, sample.actualMaterialNames)
    materialMatched += material.matched
    materialTotal += material.total

    const expectedAuthority = normalizeComparableText(sample.expectedAuthority)
    if (expectedAuthority) {
      authorityTotal += 1
      if (expectedAuthority === normalizeComparableText(sample.actualAuthority)) authorityMatched += 1
    }

    const reuse = countMatchedValues(sample.expectedReusableOutputNames, sample.actualReusableOutputNames)
    reuseMatched += reuse.matched
    reuseTotal += reuse.total
  }

  const materialMatchRate = materialTotal > 0 ? roundMetric(materialMatched / materialTotal) : 0
  const authorityMatchRate = authorityTotal > 0 ? roundMetric(authorityMatched / authorityTotal) : 0
  const predecessorReuseMatchRate = reuseTotal > 0 ? roundMetric(reuseMatched / reuseTotal) : 0
  const populatedDimensionRates = [
    materialTotal > 0 ? materialMatchRate : null,
    authorityTotal > 0 ? authorityMatchRate : null,
    reuseTotal > 0 ? predecessorReuseMatchRate : null,
  ].filter((rate): rate is number => rate !== null)
  const combinedRate = populatedDimensionRates.length > 0
    ? roundMetric(populatedDimensionRates.reduce((sum, rate) => sum + rate, 0) / populatedDimensionRates.length)
    : 0
  return {
    sampleCount: replaySamples.length,
    calibratedSampleCount: replaySamples.filter((sample) =>
      (sample.expectedMaterialNames?.length ?? 0) > 0 ||
      Boolean(sample.expectedAuthority) ||
      (sample.expectedReusableOutputNames?.length ?? 0) > 0,
    ).length,
    materialMatchRate,
    authorityMatchRate,
    predecessorReuseMatchRate,
    status: replaySamples.length < 3
      ? 'needs_more_samples'
      : combinedRate >= 0.85
      ? 'candidate_overlay_ready'
      : 'needs_human_review',
    calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation',
  }
}

function buildCertificatePolicyAutomationQuality(
  input: {
    assets: PolicyAsset[]
    sourceSnapshots?: CertificatePolicySourceSnapshot[]
    replaySamples?: CertificatePolicyReplayCalibrationSample[]
  },
): CertificatePolicyAutomationQuality {
  return {
    sourceCoverage: buildSourceCoverageQuality(input.assets),
    policyParseHitRate: buildPolicyParseHitRateQuality(input.sourceSnapshots ?? []),
    projectReplayCalibration: buildProjectReplayCalibrationQuality(input.replaySamples ?? []),
  }
}

export function buildCertificatePolicyAutoPublishPlan(
  options: BuildCertificatePolicyUpdateOptions = {},
): CertificatePolicyAutoPublishPlan {
  const template = options.template ?? GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE
  const asOfDate = normalizeDateInput(options.asOfDate)
  const assets = buildPolicyAssets(template)
  const candidates = buildCertificatePolicyUpdateCandidates({ template, asOfDate })
  const autoPublishedUpdates: CertificatePolicyAutoPublishedUpdate[] = []
  const blockedUpdates: CertificatePolicyBlockedAutoPublishUpdate[] = []

  for (const candidate of candidates) {
    if (candidate.sourceHealth === 'healthy') {
      autoPublishedUpdates.push({
        candidateCode: candidate.candidateCode,
        assetCode: candidate.assetCode,
        assetType: candidate.assetType,
        assetName: candidate.assetName,
        provinceCode: candidate.provinceCode,
        cityCode: candidate.cityCode,
        sourceProfileVersion: candidate.currentProfileVersion,
        publishedProfileVersion: buildPublishedProfileVersion(candidate.currentProfileVersion, asOfDate),
        publishStatus: 'auto_published',
        reasonCode: candidate.reasonCode,
        publicationGate: 'trusted_official_sources_only',
        runtimeConsumptionPolicy: 'auto_published_seed',
        sourceHealth: 'healthy',
        policySources: candidate.policySources,
      })
    } else {
      blockedUpdates.push({
        candidateCode: candidate.candidateCode,
        assetCode: candidate.assetCode,
        assetType: candidate.assetType,
        assetName: candidate.assetName,
        provinceCode: candidate.provinceCode,
        cityCode: candidate.cityCode,
        publishStatus: 'blocked',
        blockReason: 'missing_or_weak_policy_source',
        reasonCode: candidate.reasonCode,
        runtimeConsumptionPolicy: 'previous_published_seed_retained',
        sourceHealth: candidate.sourceHealth,
        sourceIssues: candidate.sourceIssues,
      })
    }
  }

  return {
    planCode: 'certificate_template_policy_auto_publish_plan',
    seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
    asOfDate,
    updateMode: 'trusted_source_auto_publish',
    runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    publicationGate: 'trusted_official_sources_only',
    rollbackPolicy: 'previous_seed_version_retained_for_rollback',
    summary: {
      candidateUpdateCount: candidates.length,
      autoPublishedUpdateCount: autoPublishedUpdates.length,
      blockedUpdateCount: blockedUpdates.length,
    },
    automationQuality: buildCertificatePolicyAutomationQuality({
      assets,
      replaySamples: options.replaySamples,
    }),
    autoPublishedUpdates,
    blockedUpdates,
  }
}

async function resolvePolicySourceSnapshots(
  candidate: CertificatePolicyUpdateCandidate,
  sourceSnapshotProvider?: BuildCertificatePolicyUpdateOptions['sourceSnapshotProvider'],
) {
  if (!sourceSnapshotProvider || candidate.sourceHealth !== 'healthy') return []
  return Promise.all(
    candidate.policySources.map(async (source) => {
      try {
        return await sourceSnapshotProvider(source)
      } catch {
        return buildUnavailableCertificatePolicySourceSnapshot(source)
      }
    }),
  )
}

function collectPreviousPolicySourceContentHashes(previousRun?: CertificatePolicyAutoPublishRun | null) {
  const contentHashes = new Map<string, string>()
  const updates = [
    ...(previousRun?.autoPublishedUpdates ?? []),
    ...(previousRun?.blockedUpdates ?? []),
  ]
  for (const update of updates) {
    for (const snapshot of update.sourceSnapshots ?? []) {
      const sourceUrl = snapshot.sourceUrl.trim()
      if (sourceUrl && snapshot.contentHash) contentHashes.set(sourceUrl, snapshot.contentHash)
    }
  }
  return contentHashes
}

export function buildCertificatePolicySourceSnapshotProvider(
  options: {
    previousRun?: CertificatePolicyAutoPublishRun | null
    fetchText?: (sourceUrl: string) => Promise<string>
    timeoutMs?: number
  } = {},
): NonNullable<BuildCertificatePolicyUpdateOptions['sourceSnapshotProvider']> {
  const previousHashes = collectPreviousPolicySourceContentHashes(options.previousRun)
  const fetchText =
    options.fetchText ??
    ((sourceUrl: string) => fetchCertificatePolicySourceText(sourceUrl, options.timeoutMs))
  const snapshotCache = new Map<string, Promise<CertificatePolicySourceSnapshot>>()
  return (source) => {
    const sourceUrl = source.sourceUrl?.trim() ?? ''
    const cacheKey = sourceUrl || `${source.sourceName}:${source.checkedAt}:${source.policyLevel}`
    const cached = snapshotCache.get(cacheKey)
    if (cached) return cached
    const snapshotPromise = buildCertificatePolicySourceSnapshot({
      source,
      previousContentHash: previousHashes.get(sourceUrl) ?? null,
      fetchText,
    })
    snapshotCache.set(cacheKey, snapshotPromise)
    return snapshotPromise
  }
}

export async function buildCertificatePolicyAutoPublishPlanWithSourceSnapshots(
  options: BuildCertificatePolicyUpdateOptions = {},
): Promise<CertificatePolicyAutoPublishPlan> {
  const template = options.template ?? GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE
  const asOfDate = normalizeDateInput(options.asOfDate)
  const assets = buildPolicyAssets(template)
  const candidates = buildCertificatePolicyUpdateCandidates({ template, asOfDate })
  const autoPublishedUpdates: CertificatePolicyAutoPublishedUpdate[] = []
  const blockedUpdates: CertificatePolicyBlockedAutoPublishUpdate[] = []
  const allSourceSnapshots: CertificatePolicySourceSnapshot[] = []

  for (const candidate of candidates) {
    const sourceSnapshots = await resolvePolicySourceSnapshots(candidate, options.sourceSnapshotProvider)
    allSourceSnapshots.push(...sourceSnapshots)
    const policyRuleDiffs = buildRuleDiffsFromSourceSnapshots(template, candidate, sourceSnapshots)
    const hasStructuredPolicyFacts = sourceSnapshots.some((snapshot) => Boolean(snapshot.structuredPolicyFacts))
    const hasBlockedSourceSnapshot = sourceSnapshots.some((snapshot) => {
      if (snapshot.autoPublishDecision !== 'block_auto_publish_and_retain_previous_seed') return false
      if (snapshot.changeRisk === 'material_affecting' && hasStructuredPolicyFacts && !hasHighRiskPolicyRuleDiff(policyRuleDiffs)) {
        return false
      }
      return true
    })
    const hasSourceUnavailableSnapshot = sourceSnapshots.some((snapshot) => snapshot.changeRisk === 'source_unavailable')
    const hasMaterialAffectingChange = sourceSnapshots.some((snapshot) => snapshot.changeRisk === 'material_affecting') &&
      (!hasStructuredPolicyFacts || hasHighRiskPolicyRuleDiff(policyRuleDiffs))
    const publishedRuleOverlay = buildPublishedRuleOverlayFromDiffs(policyRuleDiffs)
    if (candidate.sourceHealth === 'healthy' && !hasBlockedSourceSnapshot) {
      autoPublishedUpdates.push({
        candidateCode: candidate.candidateCode,
        assetCode: candidate.assetCode,
        assetType: candidate.assetType,
        assetName: candidate.assetName,
        provinceCode: candidate.provinceCode,
        cityCode: candidate.cityCode,
        sourceProfileVersion: candidate.currentProfileVersion,
        publishedProfileVersion: buildPublishedProfileVersion(candidate.currentProfileVersion, asOfDate),
        publishStatus: 'auto_published',
        reasonCode: candidate.reasonCode,
        publicationGate: 'trusted_official_sources_only',
        runtimeConsumptionPolicy: 'auto_published_seed',
        sourceHealth: 'healthy',
        policySources: candidate.policySources,
        ...(sourceSnapshots.length > 0 ? { sourceSnapshots } : {}),
        ...(policyRuleDiffs.length > 0 ? { policyRuleDiffs } : {}),
        ...(publishedRuleOverlay ? { publishedRuleOverlay } : {}),
      })
    } else {
      blockedUpdates.push({
        candidateCode: candidate.candidateCode,
        assetCode: candidate.assetCode,
        assetType: candidate.assetType,
        assetName: candidate.assetName,
        provinceCode: candidate.provinceCode,
        cityCode: candidate.cityCode,
        publishStatus: 'blocked',
        blockReason: hasSourceUnavailableSnapshot
          ? 'policy_source_unavailable'
          : hasMaterialAffectingChange || hasBlockedSourceSnapshot
          ? 'policy_content_material_affecting_change'
          : 'missing_or_weak_policy_source',
        reasonCode: candidate.reasonCode,
        runtimeConsumptionPolicy: 'previous_published_seed_retained',
        sourceHealth: candidate.sourceHealth,
        sourceIssues: candidate.sourceIssues,
        ...(sourceSnapshots.length > 0 ? { sourceSnapshots } : {}),
        ...(policyRuleDiffs.length > 0 ? { policyRuleDiffs } : {}),
      })
    }
  }

  return {
    planCode: 'certificate_template_policy_auto_publish_plan',
    seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
    asOfDate,
    updateMode: 'trusted_source_auto_publish',
    runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    publicationGate: 'trusted_official_sources_only',
    rollbackPolicy: 'previous_seed_version_retained_for_rollback',
    summary: {
      candidateUpdateCount: candidates.length,
      autoPublishedUpdateCount: autoPublishedUpdates.length,
      blockedUpdateCount: blockedUpdates.length,
    },
    automationQuality: buildCertificatePolicyAutomationQuality({
      assets,
      sourceSnapshots: allSourceSnapshots,
      replaySamples: options.replaySamples,
    }),
    autoPublishedUpdates,
    blockedUpdates,
  }
}

export function publishCertificatePolicyAutoPublishPlan(
  options: BuildCertificatePolicyUpdateOptions = {},
): CertificatePolicyAutoPublishRun {
  const plan = buildCertificatePolicyAutoPublishPlan(options)
  const policyOpsDecision = buildPolicyOpsAutoPublishDecision({
    domain: 'pre_certificate',
    asOfDate: plan.asOfDate,
    summary: plan.summary,
    sourceCoverage: plan.automationQuality.sourceCoverage,
    policyParseHitRate: plan.automationQuality.policyParseHitRate,
    projectReplayCalibration: plan.automationQuality.projectReplayCalibration,
    previousStableRunAvailable: Boolean(latestStableAutoPublishRun),
  })
  const run: CertificatePolicyAutoPublishRun = {
    ...plan,
    automationQuality: {
      ...plan.automationQuality,
      policyOpsDecision,
    },
    runCode: 'certificate_template_policy_auto_publish_run',
    runId: createAutoPublishRunId(plan.asOfDate),
    publicationStatus: 'published',
    policyOpsDecision,
    publishedAt: new Date().toISOString(),
    appliedAutoPublishedSeedCount: plan.summary.autoPublishedUpdateCount,
    retainedPreviousPublishedSeedCount: plan.summary.blockedUpdateCount,
  }
  latestAutoPublishRun = run
  return run
}

export async function publishCertificatePolicyAutoPublishPlanWithSourceSnapshots(
  options: PublishCertificatePolicyAutoPublishOptions = {},
): Promise<CertificatePolicyAutoPublishRun> {
  const previousRun = options.previousAutoPublishRun ?? latestAutoPublishRun
  const sourceSnapshotProvider = options.sourceSnapshotProvider ??
    (options.useLiveSourceSnapshots
      ? buildCertificatePolicySourceSnapshotProvider({
          previousRun,
          fetchText: options.fetchText,
          timeoutMs: options.sourceFetchTimeoutMs,
        })
      : undefined)
  const plan = await buildCertificatePolicyAutoPublishPlanWithSourceSnapshots({
    template: options.template,
    asOfDate: options.asOfDate,
    sourceSnapshotProvider,
    replaySamples: options.replaySamples,
  })
  const policyOpsDecision = buildPolicyOpsAutoPublishDecision({
    domain: 'pre_certificate',
    asOfDate: plan.asOfDate,
    summary: plan.summary,
    sourceCoverage: plan.automationQuality.sourceCoverage,
    policyParseHitRate: plan.automationQuality.policyParseHitRate,
    projectReplayCalibration: plan.automationQuality.projectReplayCalibration,
    previousStableRunAvailable: Boolean(latestStableAutoPublishRun),
  })
  const run: CertificatePolicyAutoPublishRun = {
    ...plan,
    automationQuality: {
      ...plan.automationQuality,
      policyOpsDecision,
    },
    runCode: 'certificate_template_policy_auto_publish_run',
    runId: createAutoPublishRunId(plan.asOfDate),
    publicationStatus: 'published',
    policyOpsDecision,
    publishedAt: new Date().toISOString(),
    appliedAutoPublishedSeedCount: plan.summary.autoPublishedUpdateCount,
    retainedPreviousPublishedSeedCount: plan.summary.blockedUpdateCount,
  }
  latestAutoPublishRun = run
  return run
}

export function mapCertificatePolicyAutoPublishRunToRecord(
  run: CertificatePolicyAutoPublishRun,
): CertificatePolicyAutoPublishRunRecord {
  return {
    run_id: run.runId,
    run_code: run.runCode,
    seed_version: run.seedVersion,
    as_of_date: run.asOfDate,
    publication_status: run.publicationStatus,
    published_at: run.publishedAt,
    update_mode: run.updateMode,
    runtime_preview_policy: run.runtimePreviewPolicy,
    publication_gate: run.publicationGate,
    rollback_policy: run.rollbackPolicy,
    applied_auto_published_seed_count: run.appliedAutoPublishedSeedCount,
    retained_previous_published_seed_count: run.retainedPreviousPublishedSeedCount,
    summary: run.summary,
    automation_quality: run.automationQuality,
    auto_published_updates: run.autoPublishedUpdates,
    blocked_updates: run.blockedUpdates,
    record_visibility_policy: 'backend_admin_audit_only',
  }
}

export function mapCertificatePolicyAutoPublishRunRecordToRun(
  record: CertificatePolicyAutoPublishRunRecord,
): CertificatePolicyAutoPublishRun {
  const automationQuality = record.automation_quality
  const policyOpsDecision = automationQuality.policyOpsDecision ?? buildPolicyOpsAutoPublishDecision({
    domain: 'pre_certificate',
    asOfDate: record.as_of_date,
    summary: record.summary,
    sourceCoverage: automationQuality.sourceCoverage,
    policyParseHitRate: automationQuality.policyParseHitRate,
    projectReplayCalibration: automationQuality.projectReplayCalibration,
  })
  return {
    planCode: 'certificate_template_policy_auto_publish_plan',
    seedVersion: record.seed_version,
    asOfDate: record.as_of_date,
    updateMode: record.update_mode,
    runtimePreviewPolicy: record.runtime_preview_policy,
    publicationGate: record.publication_gate,
    rollbackPolicy: record.rollback_policy,
    summary: record.summary,
    autoPublishedUpdates: record.auto_published_updates,
    blockedUpdates: record.blocked_updates,
    runCode: record.run_code,
    runId: record.run_id,
    publicationStatus: record.publication_status,
    policyOpsDecision,
    publishedAt: record.published_at,
    appliedAutoPublishedSeedCount: record.applied_auto_published_seed_count,
    retainedPreviousPublishedSeedCount: record.retained_previous_published_seed_count,
    automationQuality: {
      ...automationQuality,
      policyOpsDecision,
    },
  }
}

export async function persistCertificatePolicyAutoPublishRun(
  run: CertificatePolicyAutoPublishRun,
): Promise<CertificatePolicyAutoPublishRunRecord | null> {
  const record = mapCertificatePolicyAutoPublishRunToRecord(run)
  const { error } = await (supabase as any)
    .from('certificate_template_policy_auto_publish_runs')
    .insert(record)
  if (error) throw new Error(`Failed to persist certificate policy auto-publish run: ${error.message}`)
  await persistCertificatePolicyGovernanceCandidateEvents(run)
  return record
}

function certificatePolicyUpdateCandidateAssetKey(update: Pick<CertificatePolicyAutoPublishedUpdate | CertificatePolicyBlockedAutoPublishUpdate, 'assetCode'>) {
  return `certificate.policy_update.${update.assetCode}`
}

function certificatePolicyUpdateCandidatePayload(
  run: CertificatePolicyAutoPublishRun,
  update: CertificatePolicyAutoPublishedUpdate | CertificatePolicyBlockedAutoPublishUpdate,
) {
  return {
    ...update,
    planCode: run.planCode,
    runCode: run.runCode,
    runId: run.runId,
    asOfDate: run.asOfDate,
    seedVersion: run.seedVersion,
    updateMode: run.updateMode,
    publicationStatus: run.publicationStatus,
    policyOpsDecision: run.policyOpsDecision,
    localPublishStatus: update.publishStatus,
    localRuntimeConsumptionPolicy: update.runtimeConsumptionPolicy,
  }
}

async function persistCertificatePolicyGovernanceCandidateEvents(run: CertificatePolicyAutoPublishRun) {
  const updates = [
    ...run.autoPublishedUpdates,
    ...run.blockedUpdates,
  ]

  for (const update of updates) {
    await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey: certificatePolicyUpdateCandidateAssetKey(update),
      sourceSystem: 'certificateTemplatePolicyUpdateService',
      assetType: 'template',
      candidatePayload: certificatePolicyUpdateCandidatePayload(run, update),
      learningTarget: 'template_structure',
      learningMaturity: 'governed_candidate',
      publishAnchor: update.publishStatus === 'auto_published'
        ? 'trusted_source_auto_publish'
        : 'manual_governance_required',
      automationMaturity: update.publishStatus === 'auto_published'
        ? 'auto_publish'
        : 'auto_review_package',
      requestedRuntimeEffect: 'candidate_only',
      generatedBy: 'service',
      evidence: {
        sourceHealthPassed: update.sourceHealth === 'healthy',
        conflictFree: false,
        rollbackTarget: null,
      },
    })
  }
}

export async function loadLatestCertificatePolicyAutoPublishRun() {
  const { data, error } = await (supabase as any)
    .from('certificate_template_policy_auto_publish_runs')
    .select('*')
    .eq('publication_status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return mapCertificatePolicyAutoPublishRunRecordToRun(data as CertificatePolicyAutoPublishRunRecord)
}

export function getLatestCertificatePolicyAutoPublishRun() {
  return latestAutoPublishRun
}

export async function loadLatestStableCertificatePolicyAutoPublishRun() {
  const projectedRecord = await loadLatestStablePolicyTemplateEntityRuntimeRecord(CERTIFICATE_POLICY_TEMPLATE_RELEASE_TARGET_TABLE)
  if (projectedRecord) {
    const projectedRun = mapCertificatePolicyAutoPublishRunRecordToRun(projectedRecord as unknown as CertificatePolicyAutoPublishRunRecord)
    if (isPolicyOpsStableAutoPublishRun(projectedRun)) {
      latestStableAutoPublishRun = projectedRun
      return projectedRun
    }
  }

  latestStableAutoPublishRun = null
  return null
}

export function getLatestStableCertificatePolicyAutoPublishRun() {
  return isPolicyOpsStableAutoPublishRun(latestStableAutoPublishRun)
    ? latestStableAutoPublishRun
    : null
}

export function buildCertificatePolicyUpdateCandidates(
  options: BuildCertificatePolicyUpdateOptions = {},
): CertificatePolicyUpdateCandidate[] {
  const template = options.template ?? GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE
  const asOfDate = normalizeDateInput(options.asOfDate)

  return buildPolicyAssets(template)
    .filter((asset) => asset.reviewStatus === 'published')
    .flatMap((asset) => {
      const sourceIssues = buildCertificatePolicySourceIssues(asset.policySources)
      const candidates: CertificatePolicyUpdateCandidate[] = []
      if (isDateOnOrBefore(asset.nextReviewDueAt, asOfDate)) {
        candidates.push(buildCandidate(asset, 'review_due', sourceIssues))
      }
      if (sourceIssues.length > 0) {
        candidates.push(buildCandidate(asset, 'weak_source', sourceIssues))
      }
      return candidates
    })
}

export function buildCertificatePolicyUpdateGovernanceReport(
  options: BuildCertificatePolicyUpdateOptions = {},
): CertificatePolicyUpdateGovernanceReport {
  const template = options.template ?? GENERAL_CONSTRUCTION_CERTIFICATE_TEMPLATE
  const asOfDate = normalizeDateInput(options.asOfDate)
  const assets = buildPolicyAssets(template)
  const candidates = buildCertificatePolicyUpdateCandidates({ template, asOfDate })
  const autoPublishPlan = buildCertificatePolicyAutoPublishPlan({ template, asOfDate })

  const assetDigests = assets.map((asset) => {
    const sourceIssues = buildCertificatePolicySourceIssues(asset.policySources)
    return {
      assetCode: asset.assetCode,
      assetType: asset.assetType,
      assetName: asset.assetName,
      provinceCode: asset.provinceCode,
      cityCode: asset.cityCode,
      reviewStatus: asset.reviewStatus,
      nextReviewDueAt: asset.nextReviewDueAt,
      sourceHealth: getSourceHealth(sourceIssues),
      sourceIssueCount: sourceIssues.length,
      overdue: asset.reviewStatus === 'published' && isDateOnOrBefore(asset.nextReviewDueAt, asOfDate),
    }
  })

  const sourceHealthCounts = {
    healthy: assetDigests.filter((asset) => asset.sourceHealth === 'healthy').length,
    missing_url: assetDigests.filter((asset) => asset.sourceHealth === 'missing_url').length,
    untrusted_url: assetDigests.filter((asset) => asset.sourceHealth === 'untrusted_url').length,
  }
  const reviewStatusCounts = REVIEW_STATUSES.reduce<Record<'published' | 'candidate' | 'deprecated', number>>(
    (counts, status) => {
      counts[status] = assets.filter((asset) => asset.reviewStatus === status).length
      return counts
    },
    { published: 0, candidate: 0, deprecated: 0 },
  )

  return {
    reportCode: 'certificate_template_policy_update_governance',
    seedVersion: CERTIFICATE_TEMPLATE_SEED_VERSION,
    asOfDate,
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    summary: {
      totalProvinceProfiles: template.provinceProfiles.length,
      totalPublishedProvinceProfiles: template.provinceProfiles.filter((profile) => profile.reviewStatus === 'published').length,
      totalPublishedCityOverrides: template.cityOverrides.filter((override) => override.reviewStatus === 'published').length,
      overdueAssetCount: assetDigests.filter((asset) => asset.overdue).length,
      weakSourceAssetCount: assetDigests.filter((asset) => asset.sourceIssueCount > 0).length,
      autoPublishCandidateCount: candidates.length,
      autoPublishedUpdateCount: autoPublishPlan.summary.autoPublishedUpdateCount,
      blockedAutoPublishUpdateCount: autoPublishPlan.summary.blockedUpdateCount,
    },
    sourceHealthCounts,
    reviewStatusCounts,
    automationQuality: buildCertificatePolicyAutomationQuality({
      assets,
      replaySamples: options.replaySamples,
    }),
    assets: assetDigests,
    candidates,
    autoPublishPlan,
  }
}
