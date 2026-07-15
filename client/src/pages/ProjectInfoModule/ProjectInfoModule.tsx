// v1.4.22.1 §7: Project modeling wizard content used inside the task-list workbench.
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { StepIndicator } from '@/components/project/wizard/StepIndicator'
import { StickyFooter } from '@/components/project/wizard/StickyFooter'
import { Step1ProjectIdentityTime } from '@/components/project/wizard/Step1ProjectIdentityTime'
import { Step2BusinessMethodPrefab } from '@/components/project/wizard/Step2BusinessMethodPrefab'
import {
  businessTypeRequiresSubtype,
  isBusinessSubtypeForType,
} from '@/components/project/wizard/BusinessTypeCard'
import { Step0EntryChoice } from '@/components/project/wizard/Step0EntryChoice'
import { WizardAutoSaveIndicator } from '@/components/project/wizard/WizardAutoSaveIndicator'
import { WizardOnboardingTour } from '@/components/project/wizard/WizardOnboardingTour'
import {
  commitWizardProject,
  createWizardProjectDraft,
  getWizardGenerationStatus,
  listCompanyProjectDrafts,
  listCompanyProjectTemplates,
  listVisibleProjects,
  previewWizardProfile,
  saveWizardProjectDraft,
  type CompanyProjectTemplateItem,
  type ProjectListItem,
  type WizardCreateResult,
  type WizardDraftItem,
  type WizardGenerationStatus,
  type WizardProfileIssue,
  type WizardProfilePreview,
} from '@/components/project/wizard/projectWizardApi'
import {
  SCOPE_MODELING_STAGE_ORDER,
  type ScopeModelingStage,
  type WizardDraftPayload,
  type WizardMode,
  type WizardStep,
} from '@/components/project/wizard/types'
import { ApiClientError } from '@/lib/apiClient'
import { Button } from '@/components/ui/button'

const TOTAL_STEPS = 6
const WIZARD_ACCELERATION_STORAGE_PREFIX = 'workbuddy:wizard-acceleration:'
export const WIZARD_GENERATION_EVIDENCE_STORAGE_PREFIX = 'workbuddy:wizard-generation-evidence:'
export const PROFILE_PREVIEW_TIMEOUT_MS = 15_000
const WIZARD_GENERATION_POLL_INTERVAL_MS = import.meta.env.MODE === 'test' ? 10 : 1_500
const WIZARD_GENERATION_MAX_POLL_COUNT = 120
export const PROFILE_PREVIEW_TIMEOUT_MESSAGE = '项目画像试算超时，请重新试算。'

export function withProfilePreviewTimeout<T>(
  previewPromise: Promise<T>,
  timeoutMs = PROFILE_PREVIEW_TIMEOUT_MS,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(PROFILE_PREVIEW_TIMEOUT_MESSAGE)), timeoutMs)
  })

  return Promise.race([previewPromise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function pollWizardGeneration(projectId: string, attemptId: string): Promise<WizardGenerationStatus> {
  let latest: WizardGenerationStatus | null = null
  for (let index = 0; index < WIZARD_GENERATION_MAX_POLL_COUNT; index += 1) {
    latest = await getWizardGenerationStatus(projectId, attemptId)
    if (latest.state === 'completed') return latest
    if (latest.state === 'failed') {
      throw new Error(latest.error || '任务列表生成失败，请重试。')
    }
    await sleep(WIZARD_GENERATION_POLL_INTERVAL_MS)
  }
  throw new Error(latest?.state === 'running'
    ? '任务列表仍在生成，请稍后进入项目查看。'
    : '任务列表生成等待超时，请稍后进入项目查看。')
}

type WizardCommitGenerationEvidence = Partial<NonNullable<WizardCreateResult['generation']> & WizardGenerationStatus>

function hasWizardCommitGenerationEvidence(generation?: WizardCommitGenerationEvidence | null) {
  return Boolean(
    generation?.durationAssetUtilizationSummary
      || generation?.candidateDurationAssetPreview
      || generation?.candidateNetworkEvaluation
      || generation?.candidateAcceptancePlanPreview
      || generation?.criticalPathRefresh,
  )
}

function persistWizardCommitGenerationEvidence(projectId: string, generation?: WizardCommitGenerationEvidence | null) {
  if (!hasWizardCommitGenerationEvidence(generation) || typeof window === 'undefined') return false
  try {
    window.sessionStorage.setItem(`${WIZARD_GENERATION_EVIDENCE_STORAGE_PREFIX}${projectId}`, JSON.stringify({
      source: 'project_wizard_commit_generation_evidence',
      mutationBoundary: 'client_handoff_evidence_only_no_runtime_write',
      generationBatchId: generation?.generationBatchId ?? null,
      generatedAt: new Date().toISOString(),
      durationAssetUtilizationSummary: generation?.durationAssetUtilizationSummary ?? null,
      candidateDurationAssetPreview: generation?.candidateDurationAssetPreview ?? null,
      candidateNetworkEvaluation: generation?.candidateNetworkEvaluation ?? null,
      candidateAcceptancePlanPreview: generation?.candidateAcceptancePlanPreview ?? null,
      criticalPathRefresh: generation?.criticalPathRefresh ?? null,
    }))
    return true
  } catch {
    return false
  }
}
const LazyStep3EngineeringScopeScale = lazy(() => import('@/components/project/wizard/Step3EngineeringScopeScale')
  .then((module) => ({ default: module.Step3EngineeringScopeScale })))
const LazyStep4KeyFeaturesConstraints = lazy(() => import('@/components/project/wizard/Step4KeyFeaturesConstraints')
  .then((module) => ({ default: module.Step4KeyFeaturesConstraints })))
const LazyStep5StartingLine = lazy(() => import('@/components/project/wizard/Step5StartingLine')
  .then((module) => ({ default: module.Step5StartingLine })))
const LazyStep6Generation = lazy(() => import('@/components/project/wizard/Step6Generation')
  .then((module) => ({ default: module.Step6Generation })))
const LazyStep6ProjectProfileConfirmation = lazy(() => import('@/components/project/wizard/Step6ProjectProfileConfirmation')
  .then((module) => ({ default: module.Step6ProjectProfileConfirmation })))

function WizardStepLoading() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
      正在打开当前步骤...
    </div>
  )
}

function normalizeWizardStep(value: unknown): WizardStep {
  const number = Number(value)
  if (Number.isInteger(number) && number >= 0 && number <= TOTAL_STEPS) return number as WizardStep
  return 0
}

function normalizeScopeModelingStage(value: unknown): ScopeModelingStage {
  return SCOPE_MODELING_STAGE_ORDER.includes(value as ScopeModelingStage)
    ? value as ScopeModelingStage
    : 'spaces'
}

function getAdjacentScopeModelingStage(stage: ScopeModelingStage, direction: 1 | -1): ScopeModelingStage {
  const index = Math.max(0, SCOPE_MODELING_STAGE_ORDER.findIndex((item) => item === stage))
  const nextIndex = Math.min(SCOPE_MODELING_STAGE_ORDER.length - 1, Math.max(0, index + direction))
  return SCOPE_MODELING_STAGE_ORDER[nextIndex]
}

function mergeDraft(base: WizardDraftPayload, patch?: Partial<WizardDraftPayload> | null): WizardDraftPayload {
  return {
    ...base,
    ...(patch ?? {}),
    step: normalizeWizardStep(patch?.step ?? base.step),
    mode: patch?.mode ?? base.mode,
  }
}

type ScopeNodeLike = {
  id?: unknown
  name?: unknown
  type?: unknown
  metadata?: unknown
  children?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function collectScopeNodes(nodes: unknown): ScopeNodeLike[] {
  if (!Array.isArray(nodes)) return []
  return nodes.flatMap((node) => {
    if (!isRecord(node)) return []
    return [node as ScopeNodeLike, ...collectScopeNodes(node.children)]
  })
}

function hasBuildingWithoutFunctionalUsage(scopeTree: unknown): boolean {
  return collectScopeNodes(scopeTree).some((node) => {
    if (node.type !== 'building') return false
    const metadata = isRecord(node.metadata) ? node.metadata : {}
    return !String(metadata.functionalUsage ?? '').trim()
  })
}

function isPhysicalLedgerNode(node: ScopeNodeLike): boolean {
  return node.type === 'building' || node.type === 'basement' || node.type === 'floor' || node.type === 'physical_zone'
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null
}

function countDescendantFloorNodes(node: ScopeNodeLike): number {
  const children = Array.isArray(node.children)
    ? node.children.filter(isRecord).map((child) => child as ScopeNodeLike)
    : []
  return children.reduce<number>((sum, child) => (
    sum + (child.type === 'floor' ? 1 : 0) + countDescendantFloorNodes(child)
  ), 0)
}

function isScopeStructureClosed(node: ScopeNodeLike): boolean {
  if (!isPhysicalLedgerNode(node)) return true
  if (node.type === 'floor') return true
  const metadata = isRecord(node.metadata) ? node.metadata : {}
  if (node.type === 'building') {
    return countDescendantFloorNodes(node) > 0 || Boolean(readPositiveInteger(metadata.standardFloorCount))
  }
  if (node.type === 'basement') return Boolean(readPositiveInteger(metadata.basementLevelCount))
  return true
}

function scopeTreeHasIncompleteStructures(scopeTree: unknown): boolean {
  return collectScopeNodes(scopeTree)
    .filter((node) => node.type === 'building' || node.type === 'basement' || node.type === 'physical_zone')
    .some((node) => !isScopeStructureClosed(node))
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseScopeWbsReadinessIssues(error: unknown): WizardProfileIssue[] {
  if (!(error instanceof ApiClientError) || !error.rawText) return []

  let payload: unknown
  try {
    payload = JSON.parse(error.rawText)
  } catch {
    return []
  }

  const errorBlock = isRecord(payload) && isRecord(payload.error) ? payload.error : payload
  if (!isRecord(errorBlock) || readString(errorBlock.code) !== 'SCOPE_MODEL_NOT_READY_FOR_WBS') return []

  const details = isRecord(errorBlock.details) ? errorBlock.details : {}
  const rawIssues = Array.isArray(details.issues) ? details.issues : []
  const issues = rawIssues
    .filter(isRecord)
    .map((issue) => {
      const message = readString(issue.message)
      const action = readString(issue.action)
      const title = readString(issue.title)
      const impact = readString(issue.impact)
      const scopeName = readString(issue.scopeName)
      const source = readString(issue.source)
      const issueDetails = isRecord(issue.details) ? issue.details : null
      const fallbackMessage = [message, action].filter(Boolean).join(' ')
      return {
        code: 'SCOPE_WBS_READINESS_MISSING',
        severity: 'blocking' as const,
        title: title || scopeName || null,
        message: message || fallbackMessage,
        action: action || null,
        impact: impact || null,
        scopeName: scopeName || null,
        source: source || null,
        details: issueDetails,
      }
    })
    .filter((issue) => Boolean(issue.message))

  if (issues.length === 0) {
    const fallbackMessage = readString(errorBlock.message)
    return fallbackMessage
      ? [{ code: 'SCOPE_WBS_READINESS_MISSING', severity: 'blocking', message: fallbackMessage }]
      : []
  }

  return issues
}

function appendProfileIssues(preview: WizardProfilePreview, issues: WizardProfileIssue[]): WizardProfilePreview {
  const existing = preview.profile.issues ?? []
  const existingKeys = new Set(existing.map((issue) => `${issue.code}:${issue.message}`))
  const nextIssues = [
    ...existing,
    ...issues.filter((issue) => !existingKeys.has(`${issue.code}:${issue.message}`)),
  ]
  return {
    ...preview,
    profile: {
      ...preview.profile,
      issues: nextIssues,
    },
  }
}

export interface ProjectInfoModuleProps {
  embedded?: boolean
  projectId?: string | null
  initialMode?: 'generate' | 'adjust'
  autosaveEnabled?: boolean
  onExit?: () => void
  onGenerated?: (projectId: string, targetParams: string) => void
}

export default function ProjectInfoModule({
  embedded = false,
  projectId,
  initialMode,
  autosaveEnabled,
  onExit,
  onGenerated,
}: ProjectInfoModuleProps = {}) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user } = useAuth()

  const adjustMode = initialMode === 'adjust' || searchParams.get('mode') === 'adjust'
  const entrySource = searchParams.get('from')
  const initialProjectId = projectId ?? searchParams.get('projectId')
  const taskListReturnPath = (entrySource === 'task_list' || adjustMode) && initialProjectId
    ? `/projects/${encodeURIComponent(initialProjectId)}/gantt`
    : null

  const [mode, setMode] = useState<WizardMode>('new')
  const [step, setStep] = useState<WizardStep>(0)
  const [showFreeMode, setShowFreeMode] = useState(false)
  const [draft, setDraft] = useState<WizardDraftPayload>({ step: 0, mode: 'new', detailLevel: 'overview' })
  const [draftProjectId, setDraftProjectId] = useState<string | null>(initialProjectId)
  const [templates, setTemplates] = useState<CompanyProjectTemplateItem[]>([])
  const [drafts, setDrafts] = useState<WizardDraftItem[]>([])
  const [projects, setProjects] = useState<ProjectListItem[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generationStatusMessage, setGenerationStatusMessage] = useState<string | null>(null)
  const [stepValidationMessage, setStepValidationMessage] = useState<string | null>(null)
  const [profilePreview, setProfilePreview] = useState<WizardProfilePreview | null>(null)
  const [profilePreviewLoading, setProfilePreviewLoading] = useState(false)
  const [profilePreviewError, setProfilePreviewError] = useState<string | null>(null)
  const previewDraftRef = useRef(draft)
  const previewModeRef = useRef(mode)
  const previewProjectIdRef = useRef(draftProjectId)

  const companyId = user?.currentCompanyId ?? null
  const hasCompanyTemplates = templates.length > 0
  const hasExistingProjects = projects.length > 0
  const showStep0 = !embedded && !adjustMode && (hasCompanyTemplates || hasExistingProjects)
  const effectiveStep = showStep0 && step === 0 ? 0 : showStep0 ? step : step || 1
  const canPersistDraft = autosaveEnabled ?? !embedded
  const autoSaveDraft = useMemo(() => ({
    ...draft,
    step: effectiveStep as WizardStep,
    mode,
  }), [draft, effectiveStep, mode])

  const step1Draft = useMemo<WizardDraftPayload>(() => ({
    step: draft.step,
    mode: draft.mode,
    projectName: draft.projectName,
    location: draft.location,
    plannedStartDate: draft.plannedStartDate,
    plannedEndDate: draft.plannedEndDate,
    actualStartDate: draft.actualStartDate,
    planScopeCaliber: draft.planScopeCaliber,
    deliveryStandard: draft.deliveryStandard,
    terminalEvent: draft.terminalEvent,
    totalAreaM2: draft.totalAreaM2,
    aboveGroundAreaM2: draft.aboveGroundAreaM2,
    basementAreaM2: draft.basementAreaM2,
    siteAreaM2: draft.siteAreaM2,
  }), [
    draft.aboveGroundAreaM2,
    draft.actualStartDate,
    draft.basementAreaM2,
    draft.deliveryStandard,
    draft.location,
    draft.mode,
    draft.planScopeCaliber,
    draft.plannedEndDate,
    draft.plannedStartDate,
    draft.projectName,
    draft.siteAreaM2,
    draft.step,
    draft.terminalEvent,
    draft.totalAreaM2,
  ])

  const step2Draft = useMemo<WizardDraftPayload>(() => ({
    step: draft.step,
    mode: draft.mode,
    businessType: draft.businessType,
    businessSubtype: draft.businessSubtype,
    methodVariantCodes: draft.methodVariantCodes,
    prefabSystemCodes: draft.prefabSystemCodes,
  }), [draft.businessSubtype, draft.businessType, draft.methodVariantCodes, draft.mode, draft.prefabSystemCodes, draft.step])

  const step3Draft = useMemo<WizardDraftPayload>(() => ({
    step: draft.step,
    mode: draft.mode,
    businessType: draft.businessType,
    businessSubtype: draft.businessSubtype,
    scopeTree: draft.scopeTree,
    scopeModelingStage: draft.scopeModelingStage,
    totalAreaM2: draft.totalAreaM2,
    aboveGroundAreaM2: draft.aboveGroundAreaM2,
    basementAreaM2: draft.basementAreaM2,
    siteAreaM2: draft.siteAreaM2,
  }), [
    draft.aboveGroundAreaM2,
    draft.basementAreaM2,
    draft.businessSubtype,
    draft.businessType,
    draft.mode,
    draft.scopeModelingStage,
    draft.scopeTree,
    draft.siteAreaM2,
    draft.step,
    draft.totalAreaM2,
  ])

  const step4Draft = useMemo<WizardDraftPayload>(() => ({
    step: draft.step,
    mode: draft.mode,
    businessType: draft.businessType,
    methodVariantCodes: draft.methodVariantCodes,
    projectFeatures: draft.projectFeatures,
    scopeTree: draft.scopeTree,
  }), [draft.businessType, draft.methodVariantCodes, draft.mode, draft.projectFeatures, draft.scopeTree, draft.step])

  const step6Draft = useMemo<WizardDraftPayload>(() => ({
    step: draft.step,
    mode: draft.mode,
    detailLevel: draft.detailLevel,
    saveAsCompanyTemplate: draft.saveAsCompanyTemplate,
    companyTemplateName: draft.companyTemplateName,
    projectName: draft.projectName,
  }), [draft.companyTemplateName, draft.detailLevel, draft.mode, draft.projectName, draft.saveAsCompanyTemplate, draft.step])

  useEffect(() => {
    if (embedded) return
    document.title = '新建项目 | WorkBuddy'
  }, [embedded])

  useEffect(() => {
    if (!user || embedded) return
    let cancelled = false
    const loadEntryData = async () => {
      setLoadingEntries(true)
      try {
        const [templateRows, draftRows, projectRows] = await Promise.all([
          companyId ? listCompanyProjectTemplates(companyId).catch(() => []) : Promise.resolve([]),
          companyId ? listCompanyProjectDrafts(companyId).catch(() => []) : Promise.resolve([]),
          listVisibleProjects().catch(() => []),
        ])
        if (cancelled) return
        setTemplates(templateRows)
        setDrafts(draftRows)
        setProjects(projectRows.filter((project) => project.status !== 'wizard_drafting'))
      } finally {
        if (!cancelled) setLoadingEntries(false)
      }
    }
    void loadEntryData()
    return () => {
      cancelled = true
    }
  }, [companyId, user])

  useEffect(() => {
    if (!draftProjectId || drafts.length === 0) return
    const matched = drafts.find((item) => item.id === draftProjectId)
    if (!matched?.wizard_draft_payload) return
    const nextDraft = mergeDraft(draft, matched.wizard_draft_payload)
    setDraft(nextDraft)
    setMode(nextDraft.mode)
    setStep(nextDraft.step)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftProjectId, drafts])

  const handleStepChange = useCallback((newStep: WizardStep) => {
    setStepValidationMessage(null)
    const resolvedStep = mode === 'new' && newStep === 5 ? 4 : newStep
    setStep(resolvedStep)
    setDraft(prev => ({ ...prev, step: resolvedStep }))
  }, [mode])

  const handleModeChange = useCallback((newMode: WizardMode) => {
    setMode(newMode)
    setProfilePreview(null)
    setStep(currentStep => (newMode === 'new' && currentStep === 5 ? 4 : currentStep))
    setDraft(prev => ({
      ...prev,
      mode: newMode,
      step: newMode === 'new' && prev.step === 5 ? 4 : prev.step,
      planScopeCaliber: newMode === 'starting_line'
        ? 'continuation_start_line'
        : prev.planScopeCaliber === 'continuation_start_line'
          ? undefined
          : prev.planScopeCaliber,
      actualStartDate: newMode === 'new' ? undefined : prev.actualStartDate,
      onboardingSubstage: newMode === 'new' ? undefined : prev.onboardingSubstage,
      onboardingPhaseProgress: newMode === 'new' ? undefined : prev.onboardingPhaseProgress,
      onboardingPassedMilestones: newMode === 'new' ? [] : prev.onboardingPassedMilestones,
    }))
  }, [])

  const handleDraftUpdate = useCallback((update: Partial<WizardDraftPayload>) => {
    setStepValidationMessage(null)
    setProfilePreview(null)
    setDraft(prev => {
      const nextMode = update.planScopeCaliber === 'continuation_start_line' ? 'starting_line' : prev.mode
      if (nextMode !== prev.mode) setMode(nextMode)
      if (nextMode === 'new' && prev.step === 5) setStep(4)
      return {
        ...prev,
        ...update,
        mode: nextMode,
        step: nextMode === 'new' && prev.step === 5 ? 4 : prev.step,
      }
    })
  }, [])

  const stepBlockMessage = useMemo(() => {
    if (
      effectiveStep === 2
      && businessTypeRequiresSubtype(draft.businessType)
      && !isBusinessSubtypeForType(draft.businessType, draft.businessSubtype)
    ) {
      return '请选择具体项目子类型后再继续。'
    }
    if (effectiveStep !== 3) return null
    if (hasBuildingWithoutFunctionalUsage(draft.scopeTree)) {
      return '请先为所有单体选择功能用途'
    }
    if (
      normalizeScopeModelingStage(draft.scopeModelingStage) === 'review'
      && scopeTreeHasIncompleteStructures(draft.scopeTree)
    ) {
      return '仍有 WBS 必要信息待补充，暂不能生成 WBS。请先补齐单体层数或地下室层数。'
    }
    return null
  }, [draft.businessSubtype, draft.businessType, draft.scopeModelingStage, draft.scopeTree, effectiveStep])

  const handleNext = useCallback(() => {
    if (stepBlockMessage) {
      setStepValidationMessage(stepBlockMessage)
      return
    }
    if (effectiveStep === 3) {
      const currentStage = normalizeScopeModelingStage(draft.scopeModelingStage)
      if (currentStage !== 'review') {
        const nextStage = getAdjacentScopeModelingStage(currentStage, 1)
        setStepValidationMessage(null)
        setDraft(prev => ({ ...prev, scopeModelingStage: nextStage }))
        return
      }
    }
    const nextStep = mode === 'new' && effectiveStep === 4 ? 6 : Math.min(TOTAL_STEPS, effectiveStep + 1)
    handleStepChange(nextStep as WizardStep)
  }, [draft.scopeModelingStage, effectiveStep, handleStepChange, mode, stepBlockMessage])

  const handlePrev = useCallback(() => {
    if (effectiveStep === 3) {
      const currentStage = normalizeScopeModelingStage(draft.scopeModelingStage)
      if (currentStage !== 'spaces') {
        const previousStage = getAdjacentScopeModelingStage(currentStage, -1)
        setStepValidationMessage(null)
        setDraft(prev => ({ ...prev, scopeModelingStage: previousStage }))
        return
      }
    }
    const minStep = showStep0 ? 0 : 1
    const previousStep = mode === 'new' && effectiveStep === 6 ? 4 : Math.max(minStep, effectiveStep - 1)
    handleStepChange(previousStep as WizardStep)
  }, [draft.scopeModelingStage, effectiveStep, handleStepChange, mode, showStep0])

  const handleExit = useCallback(() => {
    if (onExit) {
      onExit()
      return
    }
    navigate(taskListReturnPath ?? '/workspace')
  }, [navigate, onExit, taskListReturnPath])

  const ensureDraftProject = useCallback(async () => {
    if (!canPersistDraft && draftProjectId) return draftProjectId
    if (draftProjectId) return draftProjectId
    const result = await createWizardProjectDraft({ ...draft, step, mode }, companyId)
    setDraftProjectId(result.projectId)
    return result.projectId
  }, [canPersistDraft, companyId, draft, draftProjectId, mode, step])

  const handleSaveDraft = useCallback(async () => {
    setSavingDraft(true)
    setError(null)
    try {
      if (!canPersistDraft) return
      const savedProjectId = await ensureDraftProject()
      await saveWizardProjectDraft(savedProjectId, { ...draft, step, mode }, step)
    } catch (err) {
      setError(err instanceof Error ? err.message : '草稿保存失败')
    } finally {
      setSavingDraft(false)
    }
  }, [canPersistDraft, draft, ensureDraftProject, mode, step])

  const loadProfilePreview = useCallback(async () => {
    setProfilePreviewLoading(true)
    setProfilePreviewError(null)
    try {
      const preview = await withProfilePreviewTimeout(previewWizardProfile({
          ...previewDraftRef.current,
          step: 6 as WizardStep,
          mode: previewModeRef.current,
        }, previewProjectIdRef.current))
      setProfilePreview(preview)
    } catch (err) {
      setProfilePreviewError(err instanceof Error ? err.message : '项目画像试算失败')
    } finally {
      setProfilePreviewLoading(false)
    }
  }, [])

  useEffect(() => {
    previewDraftRef.current = draft
    previewModeRef.current = mode
    previewProjectIdRef.current = draftProjectId
  }, [draft, draftProjectId, mode])

  useEffect(() => {
    if (effectiveStep !== 6) return
    void loadProfilePreview()
  }, [effectiveStep, loadProfilePreview])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    setGenerationStatusMessage(null)
    try {
      const payload = { ...draft, step: 6 as WizardStep, mode }
      const result = await commitWizardProject(payload, { projectId: draftProjectId, companyId })
      let targetFeasibility = result.generation?.targetFeasibility
      let generationEvidence: WizardCommitGenerationEvidence | null = result.generation ?? null
      const attemptId = result.generation?.attemptId
      const generationState = result.generation?.state
      if (attemptId && (generationState === 'queued' || generationState === 'running')) {
        setError('正在生成计划表，请保持当前页面打开。')
        setGenerationStatusMessage('正在生成计划表，请保持当前页面打开。')
        const status = await pollWizardGeneration(result.projectId, attemptId)
        targetFeasibility = status.targetFeasibility ?? targetFeasibility
        generationEvidence = {
          ...(result.generation ?? {}),
          ...status,
          generationBatchId: status.generationBatchId ?? result.generation?.generationBatchId,
        }
      }
      if (targetFeasibility && targetFeasibility.overshootDays > 0 && typeof window !== 'undefined') {
        window.sessionStorage.setItem(`${WIZARD_ACCELERATION_STORAGE_PREFIX}${result.projectId}`, JSON.stringify({
          targetFeasibility,
          generatedAt: new Date().toISOString(),
        }))
      }
      const handoffSearchParams = new URLSearchParams()
      if (targetFeasibility && targetFeasibility.overshootDays > 0) {
        handoffSearchParams.set('target_overshoot_days', String(targetFeasibility.overshootDays))
        handoffSearchParams.set('target_natural_end', targetFeasibility.naturalEndDate)
        handoffSearchParams.set('target_end', targetFeasibility.targetEndDate)
      }
      if (persistWizardCommitGenerationEvidence(result.projectId, generationEvidence)) {
        handoffSearchParams.set('wizard_evidence', 'true')
      }
      const serializedHandoffParams = handoffSearchParams.toString()
      const targetParams = serializedHandoffParams ? `&${serializedHandoffParams}` : ''
      if (onGenerated) {
        onGenerated(result.projectId, targetParams)
    } else {
      navigate(`/projects/${result.projectId}/gantt?wizard_generated=true${targetParams}`)
    }
  } catch (err) {
      setGenerationStatusMessage(null)
      const readinessIssues = parseScopeWbsReadinessIssues(err)
      if (readinessIssues.length > 0) {
        setProfilePreview(prev => prev ? appendProfileIssues(prev, readinessIssues) : prev)
        setProfilePreviewError(null)
        setError('范围体量还不能生成 WBS，请按下方提示补齐后再试。')
        return
      }
      setError(err instanceof Error ? err.message : '任务列表生成失败')
    } finally {
      setGenerating(false)
      setGenerationStatusMessage(null)
    }
  }, [companyId, draft, draftProjectId, mode, navigate, onGenerated])

  const handleBackToScopeCompletion = useCallback(() => {
    setStepValidationMessage(null)
    setProfilePreview(null)
    setStep(3)
    setDraft(prev => ({
      ...prev,
      step: 3 as WizardStep,
      scopeModelingStage: 'review',
    }))
  }, [])

  const handleSelectBlank = useCallback(() => {
    const nextDraft: WizardDraftPayload = { step: 1, mode, detailLevel: 'overview' }
    setDraft(nextDraft)
    setStep(1)
  }, [mode])

  const handleSelectTemplate = useCallback(() => {
    const template = templates[0]
    const snapshot = template?.snapshot ?? {}
    const nextDraft = mergeDraft(
      { step: 1, mode: 'new', detailLevel: template?.default_detail_level ?? 'overview' },
      {
        ...snapshot,
        projectName: undefined,
        companyTemplateName: undefined,
        saveAsCompanyTemplate: false,
      },
    )
    setMode(nextDraft.mode)
    setDraft({ ...nextDraft, step: 1 })
    setStep(1)
  }, [templates])

  const handleSelectCopy = useCallback(() => {
    const source = projects[0]
    const metadata = source?.metadata ?? {}
    const nextDraft = mergeDraft(
      { step: 1, mode: 'new', detailLevel: 'overview' },
      {
        ...(metadata.wizard_payload_snapshot as Partial<WizardDraftPayload> | undefined),
        projectName: undefined,
        companyTemplateName: undefined,
        saveAsCompanyTemplate: false,
      },
    )
    setMode(nextDraft.mode)
    setDraft({ ...nextDraft, step: 1 })
    setStep(1)
  }, [projects])

  if (!user) {
    return (
      <div className={embedded ? 'flex min-h-[24rem] items-center justify-center bg-slate-50/80' : 'page-shell flex min-h-screen items-center justify-center bg-slate-50/80'}>
        <p className="text-slate-500">请先登录</p>
      </div>
    )
  }

  return (
    <div className={embedded ? 'flex h-full min-h-0 flex-col bg-slate-50/80' : 'page-shell flex min-h-screen flex-col bg-slate-50/80'}>
      {!embedded ? <WizardOnboardingTour /> : null}

      <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center border-b border-slate-200 bg-white px-6">
        <div className="mx-auto flex w-full max-w-screen-2xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Button unstyled
              type="button"
              onClick={handleExit}
              className="rounded-lg px-2 py-1 text-sm text-slate-600 transition-colors hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 outline-none"
            >
              返回
            </Button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">新建项目</h1>
              {loadingEntries ? <p className="text-xs text-slate-400">正在加载模板与草稿</p> : null}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              <Button unstyled
                type="button"
                onClick={() => handleModeChange('new')}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  mode === 'new' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                新项目
              </Button>
              <Button unstyled
                type="button"
                onClick={() => handleModeChange('starting_line')}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  mode === 'starting_line' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                已开工
              </Button>
            </div>
            <WizardAutoSaveIndicator
              draft={autoSaveDraft}
              projectId={draftProjectId}
              disabled={!canPersistDraft}
            />
          </div>
        </div>
      </header>

      <StepIndicator
        currentStep={effectiveStep}
        totalSteps={TOTAL_STEPS}
        mode={mode}
        onStepClick={handleStepChange}
        onToggleFreeMode={() => setShowFreeMode(!showFreeMode)}
        showFreeMode={showFreeMode}
      />

      <main className="flex-1 overflow-y-auto py-8">
        <div className="mx-auto max-w-[1100px] space-y-6 px-6">
          {error ? (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}
          {generationStatusMessage ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {generationStatusMessage}
            </div>
          ) : null}
          {stepValidationMessage ? (
            <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {stepValidationMessage}
            </div>
          ) : null}

          <Suspense fallback={<WizardStepLoading />}>
          {!showFreeMode ? (
            <>
              {effectiveStep === 0 ? (
                <Step0EntryChoice
                  onSelectBlank={handleSelectBlank}
                  onSelectTemplate={handleSelectTemplate}
                  onSelectCopy={handleSelectCopy}
                />
              ) : null}
              {effectiveStep === 1 ? (
                <Step1ProjectIdentityTime draft={step1Draft} mode={mode} onUpdate={handleDraftUpdate} />
              ) : null}
              {effectiveStep === 2 ? (
                <Step2BusinessMethodPrefab draft={step2Draft} onUpdate={handleDraftUpdate} />
              ) : null}
              {effectiveStep === 3 ? (
                <LazyStep3EngineeringScopeScale draft={step3Draft} onUpdate={handleDraftUpdate} />
              ) : null}
              {effectiveStep === 4 ? (
                <LazyStep4KeyFeaturesConstraints draft={step4Draft} onUpdate={handleDraftUpdate} />
              ) : null}
              {effectiveStep === 5 && mode === 'starting_line' ? (
                <LazyStep5StartingLine draft={draft} onUpdate={handleDraftUpdate} />
              ) : null}
              {effectiveStep === 6 ? (
                <div className="space-y-6">
                  <LazyStep6Generation
                    draft={step6Draft}
                    projectId={draftProjectId}
                    onGenerate={handleGenerate}
                    onUpdate={handleDraftUpdate}
                    generating={generating}
                    hideGenerateButton
                  />
                  <LazyStep6ProjectProfileConfirmation
                    preview={profilePreview}
                    loading={profilePreviewLoading}
                    error={profilePreviewError}
                    generating={generating}
                    onGenerate={handleGenerate}
                    onRefresh={loadProfilePreview}
                    onBackToScope={handleBackToScopeCompletion}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <div className="space-y-8 pt-4">
              <div id="free-step-1" className="border-t border-slate-200 pt-8">
                <Step1ProjectIdentityTime draft={step1Draft} mode={mode} onUpdate={handleDraftUpdate} />
              </div>
              <div id="free-step-2" className="border-t border-slate-200 pt-8">
                <Step2BusinessMethodPrefab draft={step2Draft} onUpdate={handleDraftUpdate} />
              </div>
              <div id="free-step-3" className="border-t border-slate-200 pt-8">
                <LazyStep3EngineeringScopeScale draft={step3Draft} onUpdate={handleDraftUpdate} />
              </div>
              <div id="free-step-4" className="border-t border-slate-200 pt-8">
                <LazyStep4KeyFeaturesConstraints draft={step4Draft} onUpdate={handleDraftUpdate} />
              </div>
              {mode === 'starting_line' ? (
                <div id="free-step-5" className="border-t border-slate-200 pt-8">
                  <LazyStep5StartingLine draft={draft} onUpdate={handleDraftUpdate} />
                </div>
              ) : null}
              <div id="free-step-6" className="border-t border-slate-200 pt-8">
                <LazyStep6Generation
                  draft={step6Draft}
                  projectId={draftProjectId}
                  onGenerate={handleGenerate}
                  onUpdate={handleDraftUpdate}
                  generating={generating}
                  hideGenerateButton
                />
                <div className="mt-6">
                  <LazyStep6ProjectProfileConfirmation
                    preview={profilePreview}
                    loading={profilePreviewLoading}
                    error={profilePreviewError}
                    generating={generating}
                    onGenerate={handleGenerate}
                    onRefresh={loadProfilePreview}
                    onBackToScope={handleBackToScopeCompletion}
                  />
                </div>
              </div>
            </div>
          )}
          </Suspense>
        </div>
      </main>

      <StickyFooter
        currentStep={effectiveStep}
        totalSteps={TOTAL_STEPS}
        mode={mode}
        onPrev={handlePrev}
        onNext={handleNext}
        onSaveDraft={handleSaveDraft}
        canGoNext={effectiveStep < TOTAL_STEPS}
        generating={generating || savingDraft}
        hideGenerateOnLastStep
      />
    </div>
  )
}
