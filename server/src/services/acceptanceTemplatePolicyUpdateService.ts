import { createHash } from 'node:crypto'

import {
  ACCEPTANCE_TEMPLATE_SEED_VERSION,
  ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
  type AcceptanceTemplateRegionProfile,
} from '../seeds/acceptanceTimelineTemplateSeed.js'
import { buildOfficialPublicAcceptanceReplayCoverageReport } from './acceptancePolicyReplayCalibrationService.js'
import { createAndPersistAlgorithmAssetCandidateEvent } from './algorithmAssetCandidateEventAdapterService.js'
import { supabase } from './dbService.js'
import {
  buildPolicyOpsAutoPublishDecision,
  isPolicyOpsStableAutoPublishRun,
  type PolicyOpsAutoPublishDecision,
} from './policyOpsAutoPublishGateService.js'
import {
  loadLatestStablePolicyTemplateEntityRuntimeRecord,
} from './policyTemplateEntityRuntimeProjectionService.js'

export type AcceptancePolicySourceHealth = 'healthy' | 'missing_url' | 'untrusted_url'
export type AcceptancePolicyContentChangeSignal = 'item' | 'condition' | 'authority' | 'procedure' | 'document'

export interface AcceptancePolicyStructuredItemFact {
  itemName: string
  itemCode: string
}

export interface AcceptancePolicyStructuredResultDocumentFact {
  itemCode: string
  documentName: string
}

export interface AcceptancePolicyStructuredItemReplacementFact {
  removedItemName: string
  removedItemCode: string
  addedItemName: string
  addedItemCode: string
}

export interface AcceptancePolicyStructuredFacts {
  acceptanceItems: AcceptancePolicyStructuredItemFact[]
  conditionItems: AcceptancePolicyStructuredItemFact[]
  resultDocuments: AcceptancePolicyStructuredResultDocumentFact[]
  authorityNames: string[]
  handlingModes: string[]
  itemReplacements: AcceptancePolicyStructuredItemReplacementFact[]
  riskHints: {
    procedureChanged: boolean
    resultDocumentChanged: boolean
  }
}

export type AcceptancePolicyRuleDiffType =
  | 'additional_item_addition'
  | 'optional_item_addition'
  | 'result_document_addition'
  | 'authority_override_addition'
  | 'handling_mode_addition'
  | 'acceptance_item_replacement'
  | 'procedure_change'
  | 'result_document_change'

export interface AcceptancePolicyRuleDiff {
  diffType: AcceptancePolicyRuleDiffType
  risk: 'low' | 'high'
  assetCode: string
  targetCode: string
  addedValues: string[]
  removedValues?: string[]
}

export interface AcceptancePolicyPublishedRuleOverlay {
  additionalItemCodes?: string[]
  optionalItemCodes?: string[]
  resultDocumentAdditions?: Record<string, string[]>
  authorityOverrides?: Record<string, string>
  handlingModeAdditions?: Record<string, string[]>
}

export interface AcceptancePolicySourceIssue {
  issueCode: 'missing_source_url' | 'untrusted_source_url'
  sourceName: string
  sourceUrl?: string
  checkedAt: string
  sourceLevel: AcceptanceTemplateRegionProfile['policySources'][number]['sourceLevel']
}

export interface AcceptancePolicySourceSnapshot {
  sourceName: string
  sourceUrl: string
  sourceLevel: AcceptanceTemplateRegionProfile['policySources'][number]['sourceLevel']
  checkedAt: string
  sourceHealth: AcceptancePolicySourceHealth
  fetchStatus: 'fetched' | 'blocked'
  contentHash: string | null
  previousContentHash: string | null
  diffStatus: 'unchanged' | 'changed' | 'unknown'
  changeSignals: AcceptancePolicyContentChangeSignal[]
  changeRisk: 'low' | 'material_affecting' | 'source_unavailable'
  autoPublishDecision: 'auto_publish_allowed' | 'block_auto_publish_and_retain_previous_seed'
  extractionStatus?: 'accepted' | 'blocked'
  extractionFormat?: 'html' | 'text'
  extractionConfidence?: 'high' | 'medium' | 'low'
  extractionBlockReason?: 'empty_source_text' | 'policy_body_too_short' | 'policy_semantics_missing'
  structuredPolicyFacts?: AcceptancePolicyStructuredFacts
}

export interface AcceptancePolicySourceTextExtractionResult {
  accepted: boolean
  text: string
  format: 'html' | 'text'
  confidence: 'high' | 'medium' | 'low'
  blockReason?: 'empty_source_text' | 'policy_body_too_short' | 'policy_semantics_missing'
}

export interface BuildAcceptancePolicySourceSnapshotOptions {
  source: AcceptanceTemplateRegionProfile['policySources'][number]
  previousContentHash?: string | null
  fetchText: (sourceUrl: string) => Promise<string>
}

export interface AcceptancePolicyUpdateCandidate {
  candidateCode: string
  assetCode: string
  assetName: string
  provinceCode: string
  cityCode?: string
  currentProfileVersion: string
  reasonCode: 'review_due'
  updateStatus: 'auto_publish_candidate' | 'auto_publish_blocked'
  proposedAction: 'auto_publish_when_trusted_sources_pass' | 'block_auto_publish_and_retain_previous_seed'
  runtimeConsumptionPolicy: 'auto_published_seed_after_job' | 'previous_published_seed_retained'
  sourceHealth: AcceptancePolicySourceHealth
  sourceIssues: AcceptancePolicySourceIssue[]
  policySources: AcceptanceTemplateRegionProfile['policySources']
}

export interface AcceptancePolicyAutoPublishedUpdate {
  candidateCode: string
  assetCode: string
  assetName: string
  provinceCode: string
  cityCode?: string
  sourceProfileVersion: string
  publishedProfileVersion: string
  publishStatus: 'auto_published'
  reasonCode: 'review_due'
  publicationGate: 'trusted_official_sources_only'
  runtimeConsumptionPolicy: 'auto_published_seed'
  sourceHealth: 'healthy'
  policySources: AcceptanceTemplateRegionProfile['policySources']
  sourceSnapshots?: AcceptancePolicySourceSnapshot[]
  policyRuleDiffs?: AcceptancePolicyRuleDiff[]
  publishedRuleOverlay?: AcceptancePolicyPublishedRuleOverlay
}

export interface AcceptancePolicyBlockedAutoPublishUpdate {
  candidateCode: string
  assetCode: string
  assetName: string
  provinceCode: string
  cityCode?: string
  publishStatus: 'blocked'
  blockReason: 'missing_or_weak_policy_source' | 'policy_source_unavailable' | 'policy_content_material_affecting_change'
  reasonCode: 'review_due'
  runtimeConsumptionPolicy: 'previous_published_seed_retained'
  sourceHealth: AcceptancePolicySourceHealth
  sourceIssues: AcceptancePolicySourceIssue[]
  sourceSnapshots?: AcceptancePolicySourceSnapshot[]
  policyRuleDiffs?: AcceptancePolicyRuleDiff[]
}

export interface AcceptancePolicyAutomationQuality {
  sourceCoverage: {
    totalPublishedAssetCount: number
    trustedOfficialSourceAssetCount: number
    missingOrWeakSourceAssetCount: number
    coverageRate: number
    coverageStatus: 'ready' | 'needs_source_expansion'
  }
  policyParseHitRate: {
    evaluatedSnapshotCount: number
    itemHitCount: number
    conditionHitCount: number
    authorityHitCount: number
    handlingModeHitCount: number
    resultDocumentHitCount: number
    averageHitRate: number
    status: 'not_evaluated' | 'ready_for_rule_diff' | 'needs_parser_training'
  }
  projectReplayCalibration: {
    sampleCount: number
    calibratedSampleCount: number
    itemMatchRate: number
    resultDocumentMatchRate: number
    authorityMatchRate: number
    status: 'needs_more_samples' | 'candidate_overlay_ready' | 'needs_human_review'
    calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation'
  }
  officialPublicReplayCoverage: ReturnType<typeof buildOfficialPublicAcceptanceReplayCoverageReport>
  goldenReplayBaseline: {
    sampleCount: number
    calibratedSampleCount: number
    itemMatchRate: number
    resultDocumentMatchRate: number
    authorityMatchRate: number
    status: 'baseline_ready' | 'baseline_needs_review'
    baselinePolicy: 'cold_start_regression_only_not_real_project_calibration'
  }
  policyOpsDecision?: PolicyOpsAutoPublishDecision
}

export interface AcceptancePolicyAutoPublishPlan {
  planCode: 'acceptance_template_policy_auto_publish_plan'
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
  automationQuality: AcceptancePolicyAutomationQuality
  autoPublishedUpdates: AcceptancePolicyAutoPublishedUpdate[]
  blockedUpdates: AcceptancePolicyBlockedAutoPublishUpdate[]
}

export interface AcceptancePolicyUpdateAssetDigest {
  assetCode: string
  assetName: string
  provinceCode: string
  cityCode?: string
  reviewStatus: AcceptanceTemplateRegionProfile['reviewStatus']
  sourceHealth: AcceptancePolicySourceHealth
  sourceIssueCount: number
}

export interface AcceptancePolicyUpdateGovernanceReport {
  reportCode: 'acceptance_template_policy_update_governance'
  seedVersion: string
  asOfDate: string
  frontendExposurePolicy: 'backend_admin_api_only'
  runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only'
  summary: {
    totalPublishedRegionProfiles: number
    totalPublishedProvinceSharedProfiles: number
    totalPublishedCityProfiles: number
    weakSourceAssetCount: number
    autoPublishCandidateCount: number
    autoPublishedUpdateCount: number
    blockedAutoPublishUpdateCount: number
  }
  sourceHealthCounts: Record<AcceptancePolicySourceHealth, number>
  automationQuality: AcceptancePolicyAutomationQuality
  assets: AcceptancePolicyUpdateAssetDigest[]
  candidates: AcceptancePolicyUpdateCandidate[]
  autoPublishPlan: AcceptancePolicyAutoPublishPlan
}

export interface AcceptancePolicyAutoPublishRun extends AcceptancePolicyAutoPublishPlan {
  runCode: 'acceptance_template_policy_auto_publish_run'
  runId: string
  publicationStatus: 'published'
  policyOpsDecision: PolicyOpsAutoPublishDecision
  publishedAt: string
  appliedAutoPublishedSeedCount: number
  retainedPreviousPublishedSeedCount: number
}

export interface AcceptancePolicyAutoPublishRunRecord {
  run_id: string
  run_code: AcceptancePolicyAutoPublishRun['runCode']
  seed_version: string
  as_of_date: string
  publication_status: AcceptancePolicyAutoPublishRun['publicationStatus']
  published_at: string
  update_mode: AcceptancePolicyAutoPublishRun['updateMode']
  runtime_preview_policy: AcceptancePolicyAutoPublishRun['runtimePreviewPolicy']
  publication_gate: AcceptancePolicyAutoPublishRun['publicationGate']
  rollback_policy: AcceptancePolicyAutoPublishRun['rollbackPolicy']
  applied_auto_published_seed_count: number
  retained_previous_published_seed_count: number
  summary: AcceptancePolicyAutoPublishRun['summary']
  automation_quality: AcceptancePolicyAutoPublishRun['automationQuality']
  auto_published_updates: AcceptancePolicyAutoPublishRun['autoPublishedUpdates']
  blocked_updates: AcceptancePolicyAutoPublishRun['blockedUpdates']
  record_visibility_policy: 'backend_admin_audit_only'
}

export interface AcceptancePolicyReplayCalibrationSample {
  projectId: string
  provinceCode?: string | null
  cityCode?: string | null
  businessTypeCode?: string | null
  sampleSource?: 'local_acceptance_plan' | 'official_public_completion_filing' | string | null
  evidenceScope?: string | null
  sourceUrl?: string | null
  actualItemCodes?: string[] | null
  itemCode?: string | null
  expectedItemNames?: string[] | null
  actualItemNames?: string[] | null
  expectedResultDocumentNames?: string[] | null
  actualResultDocumentNames?: string[] | null
  expectedAuthority?: string | null
  actualAuthority?: string | null
}

const ACCEPTANCE_POLICY_GOLDEN_REPLAY_BASELINE: AcceptancePolicyReplayCalibrationSample[] = [
  {
    projectId: 'golden-beijing-commercial-comprehensive',
    provinceCode: 'BJ',
    cityCode: 'BJ',
    itemCode: 'comprehensive_acceptance',
    expectedItemNames: ['综合验收'],
    actualItemNames: ['综合验收'],
    expectedResultDocumentNames: ['联合验收意见书'],
    actualResultDocumentNames: ['联合验收意见书'],
    expectedAuthority: '建设项目联合验收牵头部门',
    actualAuthority: '建设项目联合验收牵头部门',
  },
  {
    projectId: 'golden-shandong-residential-heat',
    provinceCode: 'SD',
    itemCode: 'heat_supply_acceptance',
    expectedItemNames: ['供热验收'],
    actualItemNames: ['供热验收'],
    expectedResultDocumentNames: ['供热接入确认文件'],
    actualResultDocumentNames: ['供热接入确认文件'],
    expectedAuthority: '供热主管部门或供热单位',
    actualAuthority: '供热主管部门或供热单位',
  },
  {
    projectId: 'golden-guangdong-commercial-public-assembly',
    provinceCode: 'GD',
    itemCode: 'public_assembly_fire_safety_check',
    expectedItemNames: ['公众聚集场所消防安全检查'],
    actualItemNames: ['公众聚集场所消防安全检查'],
    expectedResultDocumentNames: ['公众聚集场所投入使用、营业前消防安全检查意见书'],
    actualResultDocumentNames: ['公众聚集场所投入使用、营业前消防安全检查意见书'],
    expectedAuthority: '消防救援机构',
    actualAuthority: '消防救援机构',
  },
]

export interface BuildAcceptancePolicyUpdateOptions {
  template?: typeof ACCEPTANCE_TIMELINE_TEMPLATE_SEED
  asOfDate?: string | Date | null
  sourceSnapshotProvider?: (source: AcceptanceTemplateRegionProfile['policySources'][number]) => Promise<AcceptancePolicySourceSnapshot>
  replaySamples?: AcceptancePolicyReplayCalibrationSample[]
}

export interface PublishAcceptancePolicyAutoPublishOptions extends BuildAcceptancePolicyUpdateOptions {
  useLiveSourceSnapshots?: boolean
  previousAutoPublishRun?: AcceptancePolicyAutoPublishRun | null
  fetchText?: (sourceUrl: string) => Promise<string>
  sourceFetchTimeoutMs?: number
}

const DEFAULT_ACCEPTANCE_POLICY_SOURCE_FETCH_TIMEOUT_MS = 8000
let latestAutoPublishRun: AcceptancePolicyAutoPublishRun | null = null
let latestStableAutoPublishRun: AcceptancePolicyAutoPublishRun | null = null
const ACCEPTANCE_POLICY_TEMPLATE_RELEASE_TARGET_TABLE = 'acceptance_template_policy_auto_publish_runs' as const

function normalizeDateInput(value?: string | Date | null) {
  if (!value) return new Date().toISOString().slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return value.slice(0, 10)
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeSnapshotText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeComparableText(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeSearchText(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[\s_-]+/g, '')
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

function isTrustedOfficialPolicySourceUrl(sourceUrl: string) {
  let hostname = ''
  try {
    hostname = new URL(sourceUrl).hostname.toLowerCase()
  } catch {
    return false
  }
  return hostname === 'gov.cn' || hostname.endsWith('.gov.cn')
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

function hasAcceptancePolicySemantics(text: string) {
  return /联合验收|综合验收|竣工验收|竣工备案|验收事项|条件事项|办理部门|办理流程|办理结果|结果文件/.test(text)
}

export function extractAcceptancePolicySourceText(rawText: string): AcceptancePolicySourceTextExtractionResult {
  const format = inferPolicySourceTextFormat(rawText)
  const text = format === 'html' ? stripHtmlToPolicyText(rawText) : normalizeSnapshotText(rawText)
  if (!text) return { accepted: false, text, format, confidence: 'low', blockReason: 'empty_source_text' }
  const minimumPolicyBodyLength = format === 'html' ? 80 : 25
  if (text.length < minimumPolicyBodyLength) {
    return { accepted: false, text, format, confidence: 'low', blockReason: 'policy_body_too_short' }
  }
  if (!hasAcceptancePolicySemantics(text)) {
    return { accepted: false, text, format, confidence: 'low', blockReason: 'policy_semantics_missing' }
  }
  const hasPolicyBodySignals = /验收事项|条件事项|办理部门|办理流程|办理结果|结果文件/.test(text)
  const confidence = ((text.length >= 120 || hasPolicyBodySignals) && /联合验收|综合验收|竣工验收/.test(text))
    ? 'high'
    : 'medium'
  return { accepted: true, text, format, confidence }
}

const itemCodeByName = new Map(
  ACCEPTANCE_TIMELINE_TEMPLATE_SEED.itemPool.flatMap((item) => [
    [normalizeSearchText(item.itemName), item.itemCode],
    [normalizeSearchText(item.canonicalType), item.itemCode],
    ...item.handlingModes.map((mode) => [normalizeSearchText(mode), item.itemCode] as const),
  ]),
)

function inferAcceptanceItemCode(name: string) {
  const normalized = normalizeSearchText(name)
  const direct = itemCodeByName.get(normalized)
  if (direct) return direct
  for (const [alias, itemCode] of itemCodeByName.entries()) {
    if (normalized.includes(alias) || alias.includes(normalized)) return itemCode
  }
  if (/环卫|垃圾|生活垃圾/.test(name)) return 'sanitation_facility_acceptance'
  if (/交通|停车|道路开口|出入口|交评|交通接驳|交通组织/.test(name)) return 'traffic_access_acceptance'
  if (/卫生|疾控|公共卫生|职业卫生/.test(name)) return 'health_acceptance'
  if (/国家安全|国安|涉密|安全事项/.test(name)) return 'national_security_acceptance'
  if (/公众聚集|营业前消防/.test(name)) return 'public_assembly_fire_safety_check'
  if (/综合|联合/.test(name)) return 'comprehensive_acceptance'
  if (/竣工备案|备案/.test(name)) return 'completion_filing'
  if (/消防/.test(name)) return 'fire_acceptance'
  if (/人防/.test(name)) return 'civil_defense_acceptance'
  if (/档案/.test(name)) return 'archive_acceptance'
  if (/供热|热力/.test(name)) return 'heat_supply_acceptance'
  if (/通信|广电|有线电视/.test(name)) return 'telecom_acceptance'
  if (/水土保持|水保/.test(name)) return 'water_conservation_acceptance'
  if (/节水|中水|再生水/.test(name)) return 'water_saving_acceptance'
  if (/海绵|雨污分流|雨水调蓄/.test(name)) return 'sponge_city_acceptance'
  return normalized
}

function toItemFacts(names: string[]): AcceptancePolicyStructuredItemFact[] {
  return uniqueStrings(names).map((itemName) => ({
    itemName,
    itemCode: inferAcceptanceItemCode(itemName),
  }))
}

function parseResultDocumentFacts(text: string): AcceptancePolicyStructuredResultDocumentFact[] {
  const facts: AcceptancePolicyStructuredResultDocumentFact[] = []
  for (const match of text.matchAll(/([^：:。；;，,]{2,30}?)(?:办理结果|结果文件)[：:]([^。；;\n]+)/g)) {
    const itemName = match[1]?.trim()
    const docs = splitPolicyList(match[2] ?? '')
    const itemCode = inferAcceptanceItemCode(itemName)
    for (const documentName of docs) facts.push({ itemCode, documentName })
  }
  return facts
}

function parseItemReplacements(text: string): AcceptancePolicyStructuredItemReplacementFact[] {
  const replacements: AcceptancePolicyStructuredItemReplacementFact[] = []
  for (const match of text.matchAll(/(?:不再办理|取消办理|删除|移除)([^。，；;]+?)(?:，|,)?改为([^。，；;]+)/g)) {
    const removedItemName = match[1]?.trim()
    const addedItemName = match[2]?.trim()
    if (!removedItemName || !addedItemName) continue
    replacements.push({
      removedItemName,
      removedItemCode: inferAcceptanceItemCode(removedItemName),
      addedItemName,
      addedItemCode: inferAcceptanceItemCode(addedItemName),
    })
  }
  return replacements
}

export function parseAcceptancePolicyStructuredFacts(content: string): AcceptancePolicyStructuredFacts {
  const text = normalizeSnapshotText(content)
  const itemNames = [
    ...extractPolicySections(text, ['建设项目联合验收事项', '联合验收事项', '综合验收事项', '验收事项']).flatMap(splitPolicyList),
  ]
  const conditionNames = [
    ...extractPolicySections(text, ['条件事项', '条件验收事项', '按项目情况办理事项']).flatMap(splitPolicyList),
  ]
  const authoritySection = extractPolicySection(text, ['办理部门', '主管部门', '牵头部门'])
  const handlingSection = extractPolicySection(text, ['办理流程', '办理方式', '办理模式'])
  const resultDocuments = parseResultDocumentFacts(text)
  const replacements = parseItemReplacements(text)

  return {
    acceptanceItems: toItemFacts(itemNames),
    conditionItems: toItemFacts(conditionNames),
    resultDocuments,
    authorityNames: splitPolicyList(authoritySection),
    handlingModes: splitPolicyList(handlingSection),
    itemReplacements: replacements,
    riskHints: {
      procedureChanged: /流程调整|调整.*流程|办理流程调整|改为.*即办|承诺即办/.test(text),
      resultDocumentChanged: /办理结果调整|结果文件调整|调整为.*(?:许可|证照|意见|备案)/.test(text),
    },
  }
}

export function buildAcceptancePolicySourceSnapshotHash(content: string) {
  return createHash('sha256').update(normalizeSnapshotText(content)).digest('hex')
}

export function buildAcceptancePolicySourceIssues(
  policySources: AcceptanceTemplateRegionProfile['policySources'],
): AcceptancePolicySourceIssue[] {
  const issues: AcceptancePolicySourceIssue[] = []
  for (const source of policySources) {
    const sourceUrl = source.sourceUrl?.trim()
    if (!sourceUrl) {
      issues.push({
        issueCode: 'missing_source_url',
        sourceName: source.sourceName,
        checkedAt: source.checkedAt,
        sourceLevel: source.sourceLevel,
      })
    } else if (!isTrustedOfficialPolicySourceUrl(sourceUrl)) {
      issues.push({
        issueCode: 'untrusted_source_url',
        sourceName: source.sourceName,
        sourceUrl,
        checkedAt: source.checkedAt,
        sourceLevel: source.sourceLevel,
      })
    }
  }
  return issues
}

function getSourceHealth(sourceIssues: AcceptancePolicySourceIssue[]): AcceptancePolicySourceHealth {
  if (sourceIssues.some((issue) => issue.issueCode === 'missing_source_url')) return 'missing_url'
  if (sourceIssues.some((issue) => issue.issueCode === 'untrusted_source_url')) return 'untrusted_url'
  return 'healthy'
}

function buildUnavailableAcceptancePolicySourceSnapshot(
  source: AcceptanceTemplateRegionProfile['policySources'][number],
  previousContentHash?: string | null,
): AcceptancePolicySourceSnapshot {
  const sourceUrl = source.sourceUrl?.trim() ?? ''
  const sourceIssues = buildAcceptancePolicySourceIssues([source])
  return {
    sourceName: source.sourceName,
    sourceUrl,
    sourceLevel: source.sourceLevel,
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

export async function fetchAcceptancePolicySourceText(
  sourceUrl: string,
  timeoutMs = DEFAULT_ACCEPTANCE_POLICY_SOURCE_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error(`Acceptance policy source fetch timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    })
    const response = await Promise.race([
      fetch(sourceUrl, {
        signal: controller.signal,
        headers: {
          'user-agent': 'WorkBuddy-AcceptancePolicyBot/1.0',
          accept: 'text/html,application/xhtml+xml,application/pdf,text/plain,*/*',
        },
      }),
      timeout,
    ])
    if (!response.ok) {
      throw new Error(`Acceptance policy source fetch failed: HTTP ${response.status}`)
    }
    return response.text()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function detectAcceptancePolicyChangeSignals(content: string): AcceptancePolicyContentChangeSignal[] {
  const signals: AcceptancePolicyContentChangeSignal[] = []
  const text = normalizeSnapshotText(content)
  const signalPatterns: Array<[AcceptancePolicyContentChangeSignal, RegExp]> = [
    ['item', /验收事项|综合验收|专项验收|备案|环卫|消防|人防/],
    ['condition', /条件事项|按项目情况|触发|配套/],
    ['authority', /部门|窗口|主管|牵头|受理/],
    ['procedure', /流程|办理|审查|联办|并联|承诺/],
    ['document', /结果|意见书|备案表|许可证|确认文件|电子/],
  ]
  for (const [signal, pattern] of signalPatterns) {
    if (pattern.test(text)) signals.push(signal)
  }
  return signals
}

export async function buildAcceptancePolicySourceSnapshot(
  options: BuildAcceptancePolicySourceSnapshotOptions,
): Promise<AcceptancePolicySourceSnapshot> {
  const sourceUrl = options.source.sourceUrl?.trim() ?? ''
  const sourceIssues = buildAcceptancePolicySourceIssues([options.source])
  const sourceHealth = getSourceHealth(sourceIssues)
  if (!sourceUrl || sourceHealth !== 'healthy') {
    return buildUnavailableAcceptancePolicySourceSnapshot(options.source, options.previousContentHash)
  }

  let content = ''
  try {
    content = await options.fetchText(sourceUrl)
  } catch {
    return buildUnavailableAcceptancePolicySourceSnapshot(options.source, options.previousContentHash)
  }
  const extraction = extractAcceptancePolicySourceText(content)
  if (!extraction.accepted) {
    return {
      sourceName: options.source.sourceName,
      sourceUrl,
      sourceLevel: options.source.sourceLevel,
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
  const contentHash = buildAcceptancePolicySourceSnapshotHash(extraction.text)
  const previousContentHash = options.previousContentHash ?? null
  const diffStatus = previousContentHash && previousContentHash !== contentHash ? 'changed' : 'unchanged'
  const changeSignals = diffStatus === 'changed' ? detectAcceptancePolicyChangeSignals(extraction.text) : []
  const hasMaterialAffectingChange = changeSignals.some((signal) =>
    ['item', 'condition', 'authority', 'procedure', 'document'].includes(signal),
  )
  return {
    sourceName: options.source.sourceName,
    sourceUrl,
    sourceLevel: options.source.sourceLevel,
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
    structuredPolicyFacts: parseAcceptancePolicyStructuredFacts(extraction.text),
  }
}

function buildRegionProfileAssets(template = ACCEPTANCE_TIMELINE_TEMPLATE_SEED) {
  return template.regionProfiles
    .filter((profile) => profile.reviewStatus === 'published')
    .map((profile) => ({
      assetCode: `region_profile:${profile.provinceCode}:${profile.cityCode ?? 'province'}`,
      assetName: profile.cityName ?? profile.provinceName,
      provinceCode: profile.provinceCode,
      cityCode: profile.cityCode,
      currentProfileVersion: ACCEPTANCE_TEMPLATE_SEED_VERSION,
      policySources: profile.policySources,
      profile,
    }))
}

function buildCandidate(
  asset: ReturnType<typeof buildRegionProfileAssets>[number],
): AcceptancePolicyUpdateCandidate {
  const sourceIssues = buildAcceptancePolicySourceIssues(asset.policySources)
  const sourceHealth = getSourceHealth(sourceIssues)
  const autoPublishReady = sourceHealth === 'healthy'
  return {
    candidateCode: `${asset.assetCode}:review_due`,
    assetCode: asset.assetCode,
    assetName: asset.assetName,
    provinceCode: asset.provinceCode,
    cityCode: asset.cityCode,
    currentProfileVersion: asset.currentProfileVersion,
    reasonCode: 'review_due',
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

export function buildAcceptancePolicyUpdateCandidates(
  options: BuildAcceptancePolicyUpdateOptions = {},
): AcceptancePolicyUpdateCandidate[] {
  const template = options.template ?? ACCEPTANCE_TIMELINE_TEMPLATE_SEED
  return buildRegionProfileAssets(template).map(buildCandidate)
}

function findRegionProfileByAssetCode(
  template: typeof ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
  assetCode: string,
) {
  const [, provinceCode, cityCode] = assetCode.split(':')
  return template.regionProfiles.find((profile) =>
    profile.provinceCode === provinceCode &&
    (profile.cityCode ?? 'province') === cityCode,
  ) ?? null
}

function getExistingResultDocuments(
  template: typeof ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
  profile: AcceptanceTemplateRegionProfile | null,
  itemCode: string,
) {
  const item = template.itemPool.find((entry) => entry.itemCode === itemCode)
  return new Set([
    ...(item?.resultDocuments ?? []),
    ...(profile?.resultDocumentOverrides?.[itemCode] ?? []),
  ])
}

function getExistingHandlingModes(
  template: typeof ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
  profile: AcceptanceTemplateRegionProfile | null,
  itemCode: string,
) {
  const item = template.itemPool.find((entry) => entry.itemCode === itemCode)
  return new Set([
    ...(item?.handlingModes ?? []),
    ...(profile?.handlingModeOverrides?.[itemCode] ?? []),
  ])
}

function getExistingAuthority(
  template: typeof ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
  profile: AcceptanceTemplateRegionProfile | null,
  itemCode: string,
) {
  const item = template.itemPool.find((entry) => entry.itemCode === itemCode)
  return profile?.authorityOverrides?.[itemCode] ?? item?.authority ?? ''
}

function knownItemCodeSet(template = ACCEPTANCE_TIMELINE_TEMPLATE_SEED) {
  return new Set(template.itemPool.map((item) => item.itemCode))
}

function isDefaultAcceptanceItem(
  template: typeof ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
  itemCode: string,
) {
  return template.itemPool
    .find((item) => item.itemCode === itemCode)
    ?.defaultIndustryCodes.includes('general_building') ?? false
}

export function buildAcceptancePolicyRuleDiffs(options: {
  template?: typeof ACCEPTANCE_TIMELINE_TEMPLATE_SEED
  assetCode: string
  facts: AcceptancePolicyStructuredFacts
}): AcceptancePolicyRuleDiff[] {
  const template = options.template ?? ACCEPTANCE_TIMELINE_TEMPLATE_SEED
  const profile = findRegionProfileByAssetCode(template, options.assetCode)
  const itemCodes = knownItemCodeSet(template)
  const diffs: AcceptancePolicyRuleDiff[] = []

  for (const item of options.facts.acceptanceItems) {
    if (!itemCodes.has(item.itemCode)) continue
    if (isDefaultAcceptanceItem(template, item.itemCode) || profile?.additionalItemCodes.includes(item.itemCode)) continue
    diffs.push({
      diffType: 'additional_item_addition',
      risk: 'low',
      assetCode: options.assetCode,
      targetCode: item.itemCode,
      addedValues: [item.itemCode],
    })
  }

  for (const item of options.facts.conditionItems) {
    if (!itemCodes.has(item.itemCode)) continue
    if (
      isDefaultAcceptanceItem(template, item.itemCode) ||
      profile?.additionalItemCodes.includes(item.itemCode) ||
      profile?.optionalItemCodes.includes(item.itemCode)
    ) continue
    diffs.push({
      diffType: 'optional_item_addition',
      risk: 'low',
      assetCode: options.assetCode,
      targetCode: item.itemCode,
      addedValues: [item.itemCode],
    })
  }

  for (const result of options.facts.resultDocuments) {
    const existingDocuments = getExistingResultDocuments(template, profile, result.itemCode)
    if (existingDocuments.has(result.documentName)) continue
    diffs.push({
      diffType: 'result_document_addition',
      risk: 'low',
      assetCode: options.assetCode,
      targetCode: result.itemCode,
      addedValues: [result.documentName],
    })
  }

  for (const authorityName of options.facts.authorityNames) {
    const targetCode = 'comprehensive_acceptance'
    if (getExistingAuthority(template, profile, targetCode) === authorityName) continue
    diffs.push({
      diffType: 'authority_override_addition',
      risk: 'low',
      assetCode: options.assetCode,
      targetCode,
      addedValues: [authorityName],
    })
  }

  for (const handlingMode of options.facts.handlingModes) {
    const targetCode = 'comprehensive_acceptance'
    if (getExistingHandlingModes(template, profile, targetCode).has(handlingMode)) continue
    diffs.push({
      diffType: 'handling_mode_addition',
      risk: 'low',
      assetCode: options.assetCode,
      targetCode,
      addedValues: [handlingMode],
    })
  }

  for (const replacement of options.facts.itemReplacements) {
    diffs.push({
      diffType: 'acceptance_item_replacement',
      risk: 'high',
      assetCode: options.assetCode,
      targetCode: replacement.removedItemCode,
      addedValues: [replacement.addedItemName],
      removedValues: [replacement.removedItemName],
    })
  }

  if (options.facts.riskHints.procedureChanged) {
    diffs.push({
      diffType: 'procedure_change',
      risk: 'high',
      assetCode: options.assetCode,
      targetCode: 'acceptance_handling_flow',
      addedValues: options.facts.handlingModes,
    })
  }
  if (options.facts.riskHints.resultDocumentChanged) {
    diffs.push({
      diffType: 'result_document_change',
      risk: 'high',
      assetCode: options.assetCode,
      targetCode: 'acceptance_result_documents',
      addedValues: options.facts.resultDocuments.map((result) => result.documentName),
    })
  }

  return diffs
}

function mergeDiffValuesByTarget(diffs: AcceptancePolicyRuleDiff[]) {
  return diffs.reduce<Record<string, string[]>>((result, diff) => {
    result[diff.targetCode] = uniqueStrings([...(result[diff.targetCode] ?? []), ...diff.addedValues])
    return result
  }, {})
}

function buildPublishedRuleOverlayFromDiffs(
  diffs: AcceptancePolicyRuleDiff[],
): AcceptancePolicyPublishedRuleOverlay | null {
  const lowRiskDiffs = diffs.filter((diff) => diff.risk === 'low')
  if (lowRiskDiffs.length === 0) return null

  const additionalItemCodes = uniqueStrings(
    lowRiskDiffs
      .filter((diff) => diff.diffType === 'additional_item_addition')
      .flatMap((diff) => diff.addedValues),
  )
  const optionalItemCodes = uniqueStrings(
    lowRiskDiffs
      .filter((diff) => diff.diffType === 'optional_item_addition')
      .flatMap((diff) => diff.addedValues),
  )
  const resultDocumentAdditions = mergeDiffValuesByTarget(
    lowRiskDiffs.filter((diff) => diff.diffType === 'result_document_addition'),
  )
  const handlingModeAdditions = mergeDiffValuesByTarget(
    lowRiskDiffs.filter((diff) => diff.diffType === 'handling_mode_addition'),
  )
  const authorityOverrides = lowRiskDiffs
    .filter((diff) => diff.diffType === 'authority_override_addition')
    .reduce<Record<string, string>>((result, diff) => {
      result[diff.targetCode] = diff.addedValues[0]
      return result
    }, {})

  return {
    ...(additionalItemCodes.length > 0 ? { additionalItemCodes } : {}),
    ...(optionalItemCodes.length > 0 ? { optionalItemCodes } : {}),
    ...(Object.keys(resultDocumentAdditions).length > 0 ? { resultDocumentAdditions } : {}),
    ...(Object.keys(authorityOverrides).length > 0 ? { authorityOverrides } : {}),
    ...(Object.keys(handlingModeAdditions).length > 0 ? { handlingModeAdditions } : {}),
  }
}

function buildRuleDiffsFromSourceSnapshots(
  template: typeof ACCEPTANCE_TIMELINE_TEMPLATE_SEED,
  candidate: AcceptancePolicyUpdateCandidate,
  sourceSnapshots: AcceptancePolicySourceSnapshot[],
) {
  const structuredFacts = sourceSnapshots
    .map((snapshot) => snapshot.structuredPolicyFacts)
    .filter((facts): facts is AcceptancePolicyStructuredFacts => Boolean(facts))
  return structuredFacts.flatMap((facts) =>
    buildAcceptancePolicyRuleDiffs({
      template,
      assetCode: candidate.assetCode,
      facts,
    }),
  )
}

function hasHighRiskPolicyRuleDiff(diffs: AcceptancePolicyRuleDiff[]) {
  return diffs.some((diff) => diff.risk === 'high')
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 1000) / 1000
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

function buildSourceCoverageQuality(assets: ReturnType<typeof buildRegionProfileAssets>) {
  const trustedOfficialSourceAssetCount = assets.filter(
    (asset) => buildAcceptancePolicySourceIssues(asset.policySources).length === 0,
  ).length
  const totalPublishedAssetCount = assets.length
  const coverageRate = totalPublishedAssetCount > 0 ? roundMetric(trustedOfficialSourceAssetCount / totalPublishedAssetCount) : 0
  return {
    totalPublishedAssetCount,
    trustedOfficialSourceAssetCount,
    missingOrWeakSourceAssetCount: totalPublishedAssetCount - trustedOfficialSourceAssetCount,
    coverageRate,
    coverageStatus: coverageRate >= 0.95 ? 'ready' as const : 'needs_source_expansion' as const,
  }
}

function buildPolicyParseHitRateQuality(sourceSnapshots: AcceptancePolicySourceSnapshot[]) {
  const evaluatedSnapshots = sourceSnapshots.filter((snapshot) => Boolean(snapshot.structuredPolicyFacts))
  const evaluatedSnapshotCount = evaluatedSnapshots.length
  const itemHitCount = evaluatedSnapshots.filter((snapshot) =>
    (snapshot.structuredPolicyFacts?.acceptanceItems.length ?? 0) > 0,
  ).length
  const conditionHitCount = evaluatedSnapshots.filter((snapshot) =>
    (snapshot.structuredPolicyFacts?.conditionItems.length ?? 0) > 0,
  ).length
  const authorityHitCount = evaluatedSnapshots.filter((snapshot) =>
    (snapshot.structuredPolicyFacts?.authorityNames.length ?? 0) > 0,
  ).length
  const handlingModeHitCount = evaluatedSnapshots.filter((snapshot) =>
    (snapshot.structuredPolicyFacts?.handlingModes.length ?? 0) > 0,
  ).length
  const resultDocumentHitCount = evaluatedSnapshots.filter((snapshot) =>
    (snapshot.structuredPolicyFacts?.resultDocuments.length ?? 0) > 0,
  ).length
  const possibleHits = evaluatedSnapshotCount * 5
  const actualHits = itemHitCount + conditionHitCount + authorityHitCount + handlingModeHitCount + resultDocumentHitCount
  const averageHitRate = possibleHits > 0 ? roundMetric(actualHits / possibleHits) : 0
  return {
    evaluatedSnapshotCount,
    itemHitCount,
    conditionHitCount,
    authorityHitCount,
    handlingModeHitCount,
    resultDocumentHitCount,
    averageHitRate,
    status: evaluatedSnapshotCount === 0
      ? 'not_evaluated' as const
      : averageHitRate >= 0.8
      ? 'ready_for_rule_diff' as const
      : 'needs_parser_training' as const,
  }
}

function buildProjectReplayCalibrationQuality(replaySamples: AcceptancePolicyReplayCalibrationSample[] = []) {
  let itemMatched = 0
  let itemTotal = 0
  let resultDocumentMatched = 0
  let resultDocumentTotal = 0
  let authorityMatched = 0
  let authorityTotal = 0

  for (const sample of replaySamples) {
    const item = countMatchedValues(sample.expectedItemNames, sample.actualItemNames)
    itemMatched += item.matched
    itemTotal += item.total

    const resultDocument = countMatchedValues(sample.expectedResultDocumentNames, sample.actualResultDocumentNames)
    resultDocumentMatched += resultDocument.matched
    resultDocumentTotal += resultDocument.total

    const expectedAuthority = normalizeComparableText(sample.expectedAuthority)
    if (expectedAuthority) {
      authorityTotal += 1
      if (expectedAuthority === normalizeComparableText(sample.actualAuthority)) authorityMatched += 1
    }
  }

  const itemMatchRate = itemTotal > 0 ? roundMetric(itemMatched / itemTotal) : 0
  const resultDocumentMatchRate = resultDocumentTotal > 0 ? roundMetric(resultDocumentMatched / resultDocumentTotal) : 0
  const authorityMatchRate = authorityTotal > 0 ? roundMetric(authorityMatched / authorityTotal) : 0
  const combinedRate = roundMetric((itemMatchRate + resultDocumentMatchRate + authorityMatchRate) / 3)
  return {
    sampleCount: replaySamples.length,
    calibratedSampleCount: replaySamples.filter((sample) =>
      (sample.expectedItemNames?.length ?? 0) > 0 ||
      (sample.expectedResultDocumentNames?.length ?? 0) > 0 ||
      Boolean(sample.expectedAuthority),
    ).length,
    itemMatchRate,
    resultDocumentMatchRate,
    authorityMatchRate,
    status: replaySamples.length < 3
      ? 'needs_more_samples' as const
      : combinedRate >= 0.85
      ? 'candidate_overlay_ready' as const
      : 'needs_human_review' as const,
    calibrationPolicy: 'candidate_overlay_only_no_silent_seed_mutation' as const,
  }
}

function buildGoldenReplayBaselineQuality() {
  const quality = buildProjectReplayCalibrationQuality(ACCEPTANCE_POLICY_GOLDEN_REPLAY_BASELINE)
  const baselineReady =
    quality.sampleCount >= 3 &&
    quality.calibratedSampleCount === quality.sampleCount &&
    quality.itemMatchRate === 1 &&
    quality.resultDocumentMatchRate === 1 &&
    quality.authorityMatchRate === 1
  return {
    sampleCount: quality.sampleCount,
    calibratedSampleCount: quality.calibratedSampleCount,
    itemMatchRate: quality.itemMatchRate,
    resultDocumentMatchRate: quality.resultDocumentMatchRate,
    authorityMatchRate: quality.authorityMatchRate,
    status: baselineReady ? 'baseline_ready' as const : 'baseline_needs_review' as const,
    baselinePolicy: 'cold_start_regression_only_not_real_project_calibration' as const,
  }
}

function buildAutomationQuality(input: {
  assets: ReturnType<typeof buildRegionProfileAssets>
  sourceSnapshots?: AcceptancePolicySourceSnapshot[]
  replaySamples?: AcceptancePolicyReplayCalibrationSample[]
}): AcceptancePolicyAutomationQuality {
  return {
    sourceCoverage: buildSourceCoverageQuality(input.assets),
    policyParseHitRate: buildPolicyParseHitRateQuality(input.sourceSnapshots ?? []),
    projectReplayCalibration: buildProjectReplayCalibrationQuality(input.replaySamples ?? []),
    officialPublicReplayCoverage: buildOfficialPublicAcceptanceReplayCoverageReport(),
    goldenReplayBaseline: buildGoldenReplayBaselineQuality(),
  }
}

async function resolvePolicySourceSnapshots(
  candidate: AcceptancePolicyUpdateCandidate,
  sourceSnapshotProvider?: BuildAcceptancePolicyUpdateOptions['sourceSnapshotProvider'],
) {
  if (!sourceSnapshotProvider || candidate.sourceHealth !== 'healthy') return []
  return Promise.all(
    candidate.policySources.map(async (source) => {
      try {
        return await sourceSnapshotProvider(source)
      } catch {
        return buildUnavailableAcceptancePolicySourceSnapshot(source)
      }
    }),
  )
}

function collectPreviousPolicySourceContentHashes(previousRun?: AcceptancePolicyAutoPublishRun | null) {
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

export function buildAcceptancePolicySourceSnapshotProvider(
  options: {
    previousRun?: AcceptancePolicyAutoPublishRun | null
    fetchText?: (sourceUrl: string) => Promise<string>
    timeoutMs?: number
  } = {},
): NonNullable<BuildAcceptancePolicyUpdateOptions['sourceSnapshotProvider']> {
  const previousHashes = collectPreviousPolicySourceContentHashes(options.previousRun)
  const fetchText =
    options.fetchText ??
    ((sourceUrl: string) => fetchAcceptancePolicySourceText(sourceUrl, options.timeoutMs))
  const snapshotCache = new Map<string, Promise<AcceptancePolicySourceSnapshot>>()
  return (source) => {
    const sourceUrl = source.sourceUrl?.trim() ?? ''
    const cacheKey = sourceUrl || `${source.sourceName}:${source.checkedAt}:${source.sourceLevel}`
    const cached = snapshotCache.get(cacheKey)
    if (cached) return cached
    const snapshotPromise = buildAcceptancePolicySourceSnapshot({
      source,
      previousContentHash: previousHashes.get(sourceUrl) ?? null,
      fetchText,
    })
    snapshotCache.set(cacheKey, snapshotPromise)
    return snapshotPromise
  }
}

function buildPublishedProfileVersion(currentVersion: string, asOfDate: string) {
  return `${currentVersion}-policy-auto-${asOfDate.replace(/-/g, '')}`
}

function createAutoPublishRunId(asOfDate: string) {
  return `acceptance-policy-auto-publish:${asOfDate}:${Date.now()}`
}

export function buildAcceptancePolicyAutoPublishPlan(
  options: BuildAcceptancePolicyUpdateOptions = {},
): AcceptancePolicyAutoPublishPlan {
  const template = options.template ?? ACCEPTANCE_TIMELINE_TEMPLATE_SEED
  const asOfDate = normalizeDateInput(options.asOfDate)
  const assets = buildRegionProfileAssets(template)
  const candidates = buildAcceptancePolicyUpdateCandidates({ template, asOfDate })
  const autoPublishedUpdates: AcceptancePolicyAutoPublishedUpdate[] = []
  const blockedUpdates: AcceptancePolicyBlockedAutoPublishUpdate[] = []

  for (const candidate of candidates) {
    if (candidate.sourceHealth === 'healthy') {
      autoPublishedUpdates.push({
        candidateCode: candidate.candidateCode,
        assetCode: candidate.assetCode,
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
    planCode: 'acceptance_template_policy_auto_publish_plan',
    seedVersion: ACCEPTANCE_TEMPLATE_SEED_VERSION,
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
    automationQuality: buildAutomationQuality({
      assets,
      replaySamples: options.replaySamples,
    }),
    autoPublishedUpdates,
    blockedUpdates,
  }
}

export async function buildAcceptancePolicyAutoPublishPlanWithSourceSnapshots(
  options: BuildAcceptancePolicyUpdateOptions = {},
): Promise<AcceptancePolicyAutoPublishPlan> {
  const template = options.template ?? ACCEPTANCE_TIMELINE_TEMPLATE_SEED
  const asOfDate = normalizeDateInput(options.asOfDate)
  const assets = buildRegionProfileAssets(template)
  const candidates = buildAcceptancePolicyUpdateCandidates({ template, asOfDate })
  const autoPublishedUpdates: AcceptancePolicyAutoPublishedUpdate[] = []
  const blockedUpdates: AcceptancePolicyBlockedAutoPublishUpdate[] = []
  const allSourceSnapshots: AcceptancePolicySourceSnapshot[] = []

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
    planCode: 'acceptance_template_policy_auto_publish_plan',
    seedVersion: ACCEPTANCE_TEMPLATE_SEED_VERSION,
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
    automationQuality: buildAutomationQuality({
      assets,
      sourceSnapshots: allSourceSnapshots,
      replaySamples: options.replaySamples,
    }),
    autoPublishedUpdates,
    blockedUpdates,
  }
}

export async function publishAcceptancePolicyAutoPublishPlanWithSourceSnapshots(
  options: PublishAcceptancePolicyAutoPublishOptions = {},
): Promise<AcceptancePolicyAutoPublishRun> {
  const previousRun = options.previousAutoPublishRun ?? latestAutoPublishRun
  const sourceSnapshotProvider = options.sourceSnapshotProvider ??
    (options.useLiveSourceSnapshots
      ? buildAcceptancePolicySourceSnapshotProvider({
          previousRun,
          fetchText: options.fetchText,
          timeoutMs: options.sourceFetchTimeoutMs,
        })
      : undefined)
  const plan = await buildAcceptancePolicyAutoPublishPlanWithSourceSnapshots({
    template: options.template,
    asOfDate: options.asOfDate,
    sourceSnapshotProvider,
    replaySamples: options.replaySamples,
  })
  const policyOpsDecision = buildPolicyOpsAutoPublishDecision({
    domain: 'acceptance_timeline',
    asOfDate: plan.asOfDate,
    summary: plan.summary,
    sourceCoverage: plan.automationQuality.sourceCoverage,
    policyParseHitRate: plan.automationQuality.policyParseHitRate,
    projectReplayCalibration: plan.automationQuality.projectReplayCalibration,
    goldenReplayBaseline: plan.automationQuality.goldenReplayBaseline,
    previousStableRunAvailable: Boolean(latestStableAutoPublishRun),
  })
  const run: AcceptancePolicyAutoPublishRun = {
    ...plan,
    automationQuality: {
      ...plan.automationQuality,
      policyOpsDecision,
    },
    runCode: 'acceptance_template_policy_auto_publish_run',
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

export function mapAcceptancePolicyAutoPublishRunToRecord(
  run: AcceptancePolicyAutoPublishRun,
): AcceptancePolicyAutoPublishRunRecord {
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

export function mapAcceptancePolicyAutoPublishRunRecordToRun(
  record: AcceptancePolicyAutoPublishRunRecord,
): AcceptancePolicyAutoPublishRun {
  const automationQuality = record.automation_quality
  const policyOpsDecision = automationQuality.policyOpsDecision ?? buildPolicyOpsAutoPublishDecision({
    domain: 'acceptance_timeline',
    asOfDate: record.as_of_date,
    summary: record.summary,
    sourceCoverage: automationQuality.sourceCoverage,
    policyParseHitRate: automationQuality.policyParseHitRate,
    projectReplayCalibration: automationQuality.projectReplayCalibration,
    goldenReplayBaseline: automationQuality.goldenReplayBaseline,
  })
  return {
    planCode: 'acceptance_template_policy_auto_publish_plan',
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

// workspace-isolation-system-job-approved: the policy auto-publish scheduler writes the global acceptance policy registry, not tenant project facts.
export async function persistAcceptancePolicyAutoPublishRun(
  run: AcceptancePolicyAutoPublishRun,
): Promise<AcceptancePolicyAutoPublishRunRecord | null> {
  const record = mapAcceptancePolicyAutoPublishRunToRecord(run)
  const { error } = await (supabase as any)
    .from('acceptance_template_policy_auto_publish_runs')
    .insert(record)
  if (error) throw new Error(`Failed to persist acceptance policy auto-publish run: ${error.message}`)
  await persistAcceptancePolicyGovernanceCandidateEvents(run)
  return record
}

function acceptancePolicyUpdateCandidateAssetKey(
  update: Pick<AcceptancePolicyAutoPublishedUpdate | AcceptancePolicyBlockedAutoPublishUpdate, 'assetCode'>,
) {
  return `acceptance.policy_update.${update.assetCode}`
}

function acceptancePolicyUpdateCandidatePayload(
  run: AcceptancePolicyAutoPublishRun,
  update: AcceptancePolicyAutoPublishedUpdate | AcceptancePolicyBlockedAutoPublishUpdate,
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

async function persistAcceptancePolicyGovernanceCandidateEvents(run: AcceptancePolicyAutoPublishRun) {
  const updates = [
    ...run.autoPublishedUpdates,
    ...run.blockedUpdates,
  ]

  for (const update of updates) {
    await createAndPersistAlgorithmAssetCandidateEvent({
      assetKey: acceptancePolicyUpdateCandidateAssetKey(update),
      sourceSystem: 'acceptanceTemplatePolicyUpdateService',
      assetType: 'template',
      candidatePayload: acceptancePolicyUpdateCandidatePayload(run, update),
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

// workspace-isolation-global-read-approved: published acceptance policy runs are a system catalog shared by all companies.
export async function loadLatestAcceptancePolicyAutoPublishRun() {
  const { data, error } = await (supabase as any)
    .from('acceptance_template_policy_auto_publish_runs')
    .select('*')
    .eq('publication_status', 'published')
    .order('published_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return mapAcceptancePolicyAutoPublishRunRecordToRun(data as AcceptancePolicyAutoPublishRunRecord)
}

export function getLatestAcceptancePolicyAutoPublishRun() {
  return latestAutoPublishRun
}

export async function loadLatestStableAcceptancePolicyAutoPublishRun() {
  const projectedRecord = await loadLatestStablePolicyTemplateEntityRuntimeRecord(ACCEPTANCE_POLICY_TEMPLATE_RELEASE_TARGET_TABLE)
  if (projectedRecord) {
    const projectedRun = mapAcceptancePolicyAutoPublishRunRecordToRun(projectedRecord as unknown as AcceptancePolicyAutoPublishRunRecord)
    if (isPolicyOpsStableAutoPublishRun(projectedRun)) {
      latestStableAutoPublishRun = projectedRun
      return projectedRun
    }
  }

  latestStableAutoPublishRun = null
  return null
}

export function getLatestStableAcceptancePolicyAutoPublishRun() {
  return isPolicyOpsStableAutoPublishRun(latestStableAutoPublishRun)
    ? latestStableAutoPublishRun
    : null
}

export function buildAcceptancePolicyUpdateGovernanceReport(
  options: BuildAcceptancePolicyUpdateOptions = {},
): AcceptancePolicyUpdateGovernanceReport {
  const template = options.template ?? ACCEPTANCE_TIMELINE_TEMPLATE_SEED
  const asOfDate = normalizeDateInput(options.asOfDate)
  const assets = buildRegionProfileAssets(template)
  const candidates = buildAcceptancePolicyUpdateCandidates({ template, asOfDate })
  const autoPublishPlan = buildAcceptancePolicyAutoPublishPlan({ template, asOfDate, replaySamples: options.replaySamples })
  const assetDigests = assets.map((asset) => {
    const sourceIssues = buildAcceptancePolicySourceIssues(asset.policySources)
    return {
      assetCode: asset.assetCode,
      assetName: asset.assetName,
      provinceCode: asset.provinceCode,
      cityCode: asset.cityCode,
      reviewStatus: asset.profile.reviewStatus,
      sourceHealth: getSourceHealth(sourceIssues),
      sourceIssueCount: sourceIssues.length,
    }
  })
  const sourceHealthCounts = {
    healthy: assetDigests.filter((asset) => asset.sourceHealth === 'healthy').length,
    missing_url: assetDigests.filter((asset) => asset.sourceHealth === 'missing_url').length,
    untrusted_url: assetDigests.filter((asset) => asset.sourceHealth === 'untrusted_url').length,
  }

  return {
    reportCode: 'acceptance_template_policy_update_governance',
    seedVersion: ACCEPTANCE_TEMPLATE_SEED_VERSION,
    asOfDate,
    frontendExposurePolicy: 'backend_admin_api_only',
    runtimePreviewPolicy: 'business_preview_consumes_runtime_projection_only',
    summary: {
      totalPublishedRegionProfiles: assets.length,
      totalPublishedProvinceSharedProfiles: assets.filter((asset) => !asset.cityCode && asset.provinceCode !== 'default').length,
      totalPublishedCityProfiles: assets.filter((asset) => Boolean(asset.cityCode)).length,
      weakSourceAssetCount: assetDigests.filter((asset) => asset.sourceIssueCount > 0).length,
      autoPublishCandidateCount: candidates.length,
      autoPublishedUpdateCount: autoPublishPlan.summary.autoPublishedUpdateCount,
      blockedAutoPublishUpdateCount: autoPublishPlan.summary.blockedUpdateCount,
    },
    sourceHealthCounts,
    automationQuality: buildAutomationQuality({
      assets,
      replaySamples: options.replaySamples,
    }),
    assets: assetDigests,
    candidates,
    autoPublishPlan,
  }
}
