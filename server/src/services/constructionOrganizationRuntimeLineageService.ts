export const CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY = 'construction_organization_plan_network' as const

export type ConstructionOrganizationPlanNetworkRuntimeLineage = {
  assetKey: typeof CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY
  publicationKey: string
  runtimePublicationKey: string
  businessType?: string | null
  draftNetworkKey?: string | null
  optionId?: string | null
  lineageSource: string
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function buildConstructionOrganizationPlanNetworkRuntimeLineage(
  publicationKey: unknown,
  lineageSource = 'construction_organization_plan_network_runtime_publication',
  identity?: {
    businessType?: unknown
    draftNetworkKey?: unknown
    optionId?: unknown
  } | null,
): ConstructionOrganizationPlanNetworkRuntimeLineage | null {
  const key = normalizeText(publicationKey)
  if (!key) return null
  const businessType = normalizeText(identity?.businessType)
  const draftNetworkKey = normalizeText(identity?.draftNetworkKey)
  const optionId = normalizeText(identity?.optionId)
  return {
    assetKey: CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY,
    publicationKey: key,
    runtimePublicationKey: key,
    ...(businessType ? { businessType } : {}),
    ...(draftNetworkKey ? { draftNetworkKey } : {}),
    ...(optionId ? { optionId } : {}),
    lineageSource,
  }
}

function readPublicationKeyFromRecord(record: Record<string, unknown>): string | null {
  return normalizeText(
    record.publicationKey
      ?? record.publication_key
      ?? record.runtimePublicationKey
      ?? record.runtime_publication_key
      ?? record.releaseRecordTarget
      ?? record.release_record_target,
  )
}

function readPublicationKeyFromPlanOptionRecord(record: Record<string, unknown>): string | null {
  return readPublicationKeyFromRecord(record)
    ?? readPublicationKeyFromRecord(readRecord(record.runtimeEngineEvidence ?? record.runtime_engine_evidence))
    ?? readPublicationKeyFromRecord(readRecord(record.runtimeMaterializationEvidence ?? record.runtime_materialization_evidence))
    ?? readPublicationKeyFromRecord(readRecord(record.planNetworkPublication ?? record.plan_network_publication))
}

function lineageIdentityRecords(record: Record<string, unknown>) {
  return [
    record,
    readRecord(record.observationContext ?? record.observation_context),
    readRecord(record.metadata),
    readRecord(record.decisionSignals ?? record.decision_signals),
    readRecord(record.factBasis ?? record.fact_basis),
    readRecord(record.projectGenerationFacts ?? record.project_generation_facts),
  ]
}

function readFirstText(records: Record<string, unknown>[], keys: string[]): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = normalizeText(record[key])
      if (value) return value
    }
  }
  return null
}

function readBusinessTypeFromRecord(record: Record<string, unknown>): string | null {
  return readFirstText(lineageIdentityRecords(record), [
    'businessType',
    'business_type',
    'businessTypeCode',
    'business_type_code',
    'projectTypeCode',
    'project_type_code',
  ])
}

function readDraftNetworkKeyFromRecord(record: Record<string, unknown>): string | null {
  return readFirstText(lineageIdentityRecords(record), [
    'draftNetworkKey',
    'draft_network_key',
    'networkDraftKey',
    'network_draft_key',
  ])
}

function readOptionIdFromRecord(record: Record<string, unknown>): string | null {
  return readFirstText(lineageIdentityRecords(record), [
    'optionId',
    'option_id',
    'recommendedOptionId',
    'recommended_option_id',
  ])
}

function buildLineageFromRecord(
  record: Record<string, unknown>,
  publicationKey: string,
  lineageSource: string,
): ConstructionOrganizationPlanNetworkRuntimeLineage | null {
  return buildConstructionOrganizationPlanNetworkRuntimeLineage(publicationKey, lineageSource, {
    businessType: readBusinessTypeFromRecord(record),
    draftNetworkKey: readDraftNetworkKeyFromRecord(record),
    optionId: readOptionIdFromRecord(record),
  })
}

function buildLineageFromPlanOptionRecord(
  record: Record<string, unknown>,
  option: Record<string, unknown>,
  lineageSource: string,
): ConstructionOrganizationPlanNetworkRuntimeLineage | null {
  const publicationKey = readPublicationKeyFromPlanOptionRecord(option)
  if (!publicationKey) return null
  return buildLineageFromRecord({
    ...record,
    ...option,
  }, publicationKey, lineageSource)
}

export function readConstructionOrganizationPlanNetworkRuntimeLineage(
  value: unknown,
  lineageSource = 'construction_organization_context',
): ConstructionOrganizationPlanNetworkRuntimeLineage | null {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const lineage = readConstructionOrganizationPlanNetworkRuntimeLineage(item, `${lineageSource}.${index}`)
      if (lineage) return lineage
    }
    return null
  }

  const record = readRecord(value)
  const runtimeArtifactPublications = record.runtimeArtifactPublications ?? record.runtime_artifact_publications
  if (Array.isArray(runtimeArtifactPublications)) {
    const lineage = readConstructionOrganizationPlanNetworkRuntimeLineage(
      runtimeArtifactPublications,
      `${lineageSource}.runtimeArtifactPublications`,
    )
    if (lineage) return lineage
  }

  const directAssetKey = normalizeText(record.assetKey ?? record.asset_key)
  const directPublicationKey = readPublicationKeyFromRecord(record)
  if (directAssetKey === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY && directPublicationKey) {
    return buildLineageFromRecord(record, directPublicationKey, lineageSource)
  }
  const sourceType = normalizeText(record.sourceType ?? record.source_type)
  if (sourceType === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY && directPublicationKey) {
    return buildLineageFromRecord(record, directPublicationKey, `${lineageSource}.sourceType`)
  }

  const runtimeLineage = readRecord(record.runtimeLineage ?? record.runtime_lineage)
  const runtimeLineageAssetKey = normalizeText(runtimeLineage.assetKey ?? runtimeLineage.asset_key)
  const runtimeLineagePublicationKey = readPublicationKeyFromRecord(runtimeLineage)
  if (runtimeLineageAssetKey === CONSTRUCTION_ORGANIZATION_PLAN_NETWORK_ASSET_KEY && runtimeLineagePublicationKey) {
    return buildLineageFromRecord(runtimeLineage, runtimeLineagePublicationKey, `${lineageSource}.runtimeLineage`)
  }

  const planNetworkPublication = readRecord(record.planNetworkPublication ?? record.plan_network_publication)
  const planNetworkPublicationKey = readPublicationKeyFromRecord(planNetworkPublication)
  if (planNetworkPublicationKey) {
    const source = {
      ...record,
      ...planNetworkPublication,
    }
    return buildLineageFromRecord(source, planNetworkPublicationKey, `${lineageSource}.planNetworkPublication`)
  }

  const planNetworkDraftRecommendations = readRecord(record.planNetworkDraftRecommendations ?? record.plan_network_draft_recommendations)
  for (const [key, recommendation] of Object.entries(planNetworkDraftRecommendations)) {
    const recommendationRecord = readRecord(recommendation)
    const recommendationPublicationKey = readPublicationKeyFromRecord(recommendationRecord)
    if (recommendationPublicationKey) {
      const source = {
        ...record,
        ...recommendationRecord,
      }
      return buildLineageFromRecord(source, recommendationPublicationKey, `${lineageSource}.planNetworkDraftRecommendations.${key}`)
    }
  }

  const recommendedPlanOption = readRecord(record.recommendedPlanOption ?? record.recommended_plan_option)
  if (Object.keys(recommendedPlanOption).length > 0) {
    const lineage = buildLineageFromPlanOptionRecord(
      record,
      recommendedPlanOption,
      `${lineageSource}.recommendedPlanOption`,
    )
    if (lineage) return lineage
  }

  const planOptions = record.planOptions ?? record.plan_options
  if (Array.isArray(planOptions)) {
    for (const [index, option] of planOptions.entries()) {
      const lineage = buildLineageFromPlanOptionRecord(
        record,
        readRecord(option),
        `${lineageSource}.planOptions.${index}`,
      )
      if (lineage) return lineage
    }
  }

  const scenarioSelection = readRecord(record.scenarioSelection ?? record.scenario_selection)
  if (Object.keys(scenarioSelection).length > 0) {
    return readConstructionOrganizationPlanNetworkRuntimeLineage(scenarioSelection, `${lineageSource}.scenarioSelection`)
  }

  const constructionOrganizationScenario = readRecord(record.constructionOrganizationScenario ?? record.construction_organization_scenario)
  if (Object.keys(constructionOrganizationScenario).length > 0) {
    return readConstructionOrganizationPlanNetworkRuntimeLineage(
      constructionOrganizationScenario,
      `${lineageSource}.constructionOrganizationScenario`,
    )
  }

  const projectOrganization = readRecord(record.projectOrganization ?? record.project_organization)
  if (Object.keys(projectOrganization).length > 0) {
    return readConstructionOrganizationPlanNetworkRuntimeLineage(projectOrganization, `${lineageSource}.projectOrganization`)
  }

  return null
}

export function mergeConstructionOrganizationLineageIntoContext<T extends Record<string, unknown>>(
  context: T,
  lineage: ConstructionOrganizationPlanNetworkRuntimeLineage | null | undefined,
) {
  if (!lineage) return context
  return {
    ...context,
    assetKey: lineage.assetKey,
    publicationKey: lineage.publicationKey,
    runtimePublicationKey: lineage.runtimePublicationKey,
    ...(lineage.businessType ? { businessType: lineage.businessType } : {}),
    ...(lineage.draftNetworkKey ? { draftNetworkKey: lineage.draftNetworkKey } : {}),
    ...(lineage.optionId ? { optionId: lineage.optionId } : {}),
    constructionOrganizationPlanNetwork: lineage,
  }
}
