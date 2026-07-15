import { createHash } from 'node:crypto'

import {
  collectWbsTemplateCatalogIndexReport,
  WBS_TEMPLATE_CATALOG_INDEX,
  type WbsTemplateCatalogIndexEntry,
} from '../seeds/wbsTemplateCatalogIndex.js'
import {
  WBS_TEMPLATE_EVIDENCE_QUALITY_POLICIES,
  WBS_TEMPLATE_FEEDBACK_CANDIDATE_POLICIES,
  WBS_TEMPLATE_FEEDBACK_EVENT_POLICIES,
  WBS_TEMPLATE_FEEDBACK_METRIC_POLICIES,
  WBS_TEMPLATE_GOLDEN_GENERATED_RESULT_ASSERTIONS,
  WBS_TEMPLATE_GOLDEN_CASE_STRONG_ASSERTIONS,
  WBS_TEMPLATE_GOLDEN_CASE_STABLE_CODE_EXPECTATIONS,
  WBS_TEMPLATE_GOLDEN_CASE_EXPECTED_OUTPUTS,
  WBS_TEMPLATE_GOLDEN_PROJECT_CASES,
  WBS_TEMPLATE_METHOD_VARIANT_EXTENSION_RULES,
  WBS_TEMPLATE_METHOD_VARIANT_PRECISE_RULES,
  WBS_TEMPLATE_METHOD_VARIANT_PLAYBOOKS,
  WBS_TEMPLATE_METHOD_VARIANT_PROFILES,
  WBS_TEMPLATE_PROJECT_SCENARIO_COMBINATIONS,
  WBS_TEMPLATE_PROJECT_TEMPLATE_COMBINATIONS,
  WBS_TEMPLATE_PROJECT_APPLICABILITY_PLAYBOOKS,
  WBS_TEMPLATE_PROJECT_APPLICABILITY_PROFILES,
  WBS_TEMPLATE_QUALITY_SCORE_WEIGHTS,
  WBS_TEMPLATE_SEMANTIC_RISK_BUCKETS,
  WBS_TEMPLATE_SEED_AUTHORING_RULES,
} from '../seeds/wbsTemplateCommercialGovernanceContent.js'
import { WBS_TEMPLATE_NODE_EVIDENCE_REF_OVERRIDES } from '../seeds/wbsTemplateEvidenceRefEnrichment.js'
import {
  applyWbsTemplateSemanticOverride,
  WBS_TEMPLATE_SEMANTIC_OVERRIDES,
} from '../seeds/wbsTemplateSemanticOverrides.js'
import { supabase } from './dbService.js'

const PROCESS_TYPES = new Set(['process', 'activity_step'])

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean))]
  return String(value ?? '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function isProcessLike(entry: WbsTemplateCatalogIndexEntry) {
  return PROCESS_TYPES.has(entry.categoryType)
}

function entrySearchText(entry: WbsTemplateCatalogIndexEntry) {
  return [
    entry.templateId,
    entry.templateCode,
    entry.templateName,
    entry.catalogGroup,
    entry.templateGroup,
    entry.packType,
    entry.stableCode,
    entry.name,
  ].join(' ').toLowerCase()
}

function entryMatchesAny(entry: WbsTemplateCatalogIndexEntry, keywords: readonly string[] = []) {
  if (!keywords.length) return false
  const text = entrySearchText(entry)
  return keywords.some((keyword) => text.includes(String(keyword).toLowerCase()))
}

const matchingProcessEntryCountCache = new Map<string, number>()

function countMatchingProcessEntries(keywords: readonly string[] = []) {
  if (!keywords.length) return 0
  const cacheKey = keywords.map((keyword) => String(keyword).toLowerCase()).sort().join('|')
  const cached = matchingProcessEntryCountCache.get(cacheKey)
  if (cached !== undefined) return cached
  const count = WBS_TEMPLATE_CATALOG_INDEX.entries.filter((entry) => isProcessLike(entry) && entryMatchesAny(entry, keywords)).length
  matchingProcessEntryCountCache.set(cacheKey, count)
  return count
}

function evidenceLevels(entry: WbsTemplateCatalogIndexEntry) {
  const refs = Array.isArray(entry.metadata.evidenceRefs) ? entry.metadata.evidenceRefs : []
  return refs
    .map((ref) => String((ref as any)?.level ?? '').trim())
    .filter(Boolean)
}

function hasStablePrefix(code: string) {
  return WBS_TEMPLATE_CATALOG_INDEX.entries.some((entry) => entry.stableCode === code || entry.stableCode.startsWith(`${code}-`))
}

function hasStableCode(code: string) {
  return WBS_TEMPLATE_CATALOG_INDEX.byStableCode.has(code)
}

function hasTemplateId(templateId: string) {
  return WBS_TEMPLATE_CATALOG_INDEX.byTemplateId.has(templateId)
}

function firstEntryByStableCode(stableCode: string) {
  return WBS_TEMPLATE_CATALOG_INDEX.byStableCode.get(stableCode)?.[0] ?? null
}

function effectiveMetadata(entry: WbsTemplateCatalogIndexEntry | null) {
  if (!entry) return {}
  return applyWbsTemplateSemanticOverride(entry.stableCode, entry.metadata)
}

function hasEvidenceCode(stableCode: string, evidenceCode: string) {
  const refs = firstEntryByStableCode(stableCode)?.metadata.evidenceRefs
  return Array.isArray(refs) && refs.some((ref) => String((ref as any)?.code ?? '') === evidenceCode)
}

function fingerprintEntry(entry: WbsTemplateCatalogIndexEntry) {
  const metadata = entry.metadata
  return {
    templateId: entry.templateId,
    stableCode: entry.stableCode,
    name: entry.name,
    categoryType: entry.categoryType,
    catalogGroup: entry.catalogGroup,
    planItemKind: metadata.planItemKind ?? null,
    durationContributionMode: metadata.durationContributionMode ?? null,
    executionNature: metadata.executionNature ?? null,
    generationMode: metadata.generationMode ?? null,
    replacesCoreQualityCodes: readStringList(metadata.replacesCoreQualityCodes),
    applicableProjectTypes: readStringList(metadata.applicableProjectTypes ?? metadata.projectTypeCodes),
    applicableMethodVariantCodes: readStringList(metadata.applicableMethodVariantCodes ?? metadata.methodVariantCodes),
  }
}

function hashJson(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function collectReplacementReport() {
  const replacementEntries = WBS_TEMPLATE_CATALOG_INDEX.entries
    .filter((entry) => readStringList(entry.metadata.replacesCoreQualityCodes).length > 0)
  const unresolved: Array<{ stableCode: string; name: string; code: string }> = []
  const missingReplacementMode: Array<{ stableCode: string; name: string; generationMode: unknown }> = []
  const byTemplate: Record<string, number> = {}
  for (const entry of replacementEntries) {
    byTemplate[entry.templateId] = (byTemplate[entry.templateId] ?? 0) + 1
    for (const code of readStringList(entry.metadata.replacesCoreQualityCodes)) {
      if (!hasStablePrefix(code)) unresolved.push({ stableCode: entry.stableCode, name: entry.name, code })
    }
    if (entry.metadata.generationMode !== 'replace_core_when_selected') {
      missingReplacementMode.push({ stableCode: entry.stableCode, name: entry.name, generationMode: entry.metadata.generationMode })
    }
  }
  return {
    reportCode: 'wbs_template_core_replacement_suppression_report',
    replacementNodeCount: replacementEntries.length,
    byTemplate,
    unresolvedCoreReplacementCodeCount: unresolved.length,
    missingReplacementModeCount: missingReplacementMode.length,
    unresolved: unresolved.slice(0, 50),
    missingReplacementMode: missingReplacementMode.slice(0, 50),
    policy: {
      replacementSuppressesCoreRowsOnlyAtGenerationTime: true,
      additiveSpecialtyDoesNotSuppressCoreRows: true,
      ordinaryFrontendExposesTechnicalReplacementDiff: false,
    },
  }
}

function collectEvidenceRefReport() {
  const processEntries = WBS_TEMPLATE_CATALOG_INDEX.entries.filter(isProcessLike)
  const missingEvidenceRefs = processEntries.filter((entry) => !readStringList(entry.metadata.evidenceRefs).length && !Array.isArray(entry.metadata.evidenceRefs))
  const byLevel: Record<string, number> = {}
  for (const entry of processEntries) {
    const refs = Array.isArray(entry.metadata.evidenceRefs) ? entry.metadata.evidenceRefs : []
    for (const ref of refs) {
      const level = String((ref as any)?.level ?? 'unknown')
      byLevel[level] = (byLevel[level] ?? 0) + 1
    }
  }
  return {
    reportCode: 'wbs_template_evidence_ref_report',
    processLikeNodeCount: processEntries.length,
    missingEvidenceRefsCount: missingEvidenceRefs.length,
    byEvidenceRefLevel: byLevel,
    samplesMissingEvidenceRefs: missingEvidenceRefs.slice(0, 20).map((entry) => ({
      stableCode: entry.stableCode,
      name: entry.name,
      templateId: entry.templateId,
    })),
    exactNodeOverrides: {
      overrideCount: Object.keys(WBS_TEMPLATE_NODE_EVIDENCE_REF_OVERRIDES).length,
      unresolvedOverrideCount: Object.keys(WBS_TEMPLATE_NODE_EVIDENCE_REF_OVERRIDES)
        .filter((stableCode) => !hasStableCode(stableCode)).length,
      samplesUnresolvedOverrides: Object.keys(WBS_TEMPLATE_NODE_EVIDENCE_REF_OVERRIDES)
        .filter((stableCode) => !hasStableCode(stableCode))
        .slice(0, 20),
      policy: {
        exactStableCodeEvidenceRefsWinOverKeywordInference: true,
        nodeOverridesAreEvidenceOnlyNotDurationOrDependencyRules: true,
      },
    },
  }
}

function collectEvidenceQualityPolicyReport() {
  const processEntries = WBS_TEMPLATE_CATALOG_INDEX.entries.filter(isProcessLike)
  const policies = WBS_TEMPLATE_EVIDENCE_QUALITY_POLICIES.map((policy) => {
    const matchedEntries = processEntries.filter((entry) => entryMatchesAny(entry, policy.matchKeywords))
    const missingRequired = matchedEntries.filter((entry) => {
      const levels = evidenceLevels(entry)
      return policy.requiredEvidenceLevels.some((level) => !levels.includes(level))
    })
    const missingPreferred = matchedEntries.filter((entry) => {
      const levels = evidenceLevels(entry)
      return !policy.preferredEvidenceLevels.some((level) => levels.includes(level))
    })
    return {
      ...policy,
      matchedNodeCount: matchedEntries.length,
      missingRequiredEvidenceCount: missingRequired.length,
      missingPreferredEvidenceCount: missingPreferred.length,
      preferredEvidenceCoverageRatio: matchedEntries.length
        ? Number(((matchedEntries.length - missingPreferred.length) / matchedEntries.length).toFixed(3))
        : 1,
      requiredDeliverableCount: policy.requiredDeliverables.length,
      preferredDeliverableCount: policy.preferredDeliverables.length,
      responsiblePartyCount: policy.responsibleParties.length,
      completionSignalCount: policy.completionSignals.length,
      upgradeCandidateSignalCount: policy.upgradeCandidateSignals.length,
      samplesMissingPreferredEvidence: missingPreferred.slice(0, 10).map((entry) => ({
        stableCode: entry.stableCode,
        name: entry.name,
        templateId: entry.templateId,
        evidenceLevels: evidenceLevels(entry),
      })),
    }
  })
  return {
    reportCode: 'wbs_template_evidence_quality_policy_report',
    policyCount: policies.length,
    policies,
    policy: {
      missingRequiredEvidenceBlocksRelease: true,
      missingPreferredEvidenceCreatesGovernanceCandidate: true,
      ordinaryFrontendExposesEvidencePolicyDetails: false,
    },
  }
}

function collectSeedAuthoringRuleReport() {
  const rules = WBS_TEMPLATE_SEED_AUTHORING_RULES.map((rule) => ({
    ...rule,
    requiredFieldCount: rule.requiredFields.length,
    forbiddenFieldCount: rule.forbiddenFields.length,
    validationSignalCount: rule.validationSignals.length,
    exposesOrdinaryFrontendTechnicalDetail: rule.ordinaryFrontendExposure !== 'hidden'
      && rule.ordinaryFrontendExposure !== 'business_summary_only',
    hasRationale: Boolean(rule.rationale),
  }))
  return {
    reportCode: 'wbs_template_seed_authoring_rule_report',
    ruleCount: rules.length,
    rulesMissingRequiredFieldsCount: rules.filter((rule) => rule.requiredFieldCount <= 0).length,
    rulesMissingValidationSignalsCount: rules.filter((rule) => rule.validationSignalCount < 2).length,
    rulesMissingRationaleCount: rules.filter((rule) => !rule.hasRationale).length,
    ordinaryFrontendTechnicalExposureCount: rules.filter((rule) => rule.exposesOrdinaryFrontendTechnicalDetail).length,
    rules,
    policy: {
      authoringRulesAreReleaseGates: true,
      authoringRulesDoNotCreateRuntimeTasks: true,
      ordinaryFrontendKeepsSeedMechanicsHiddenOrSummarized: true,
    },
  }
}

function collectApplicabilityMatrixReport() {
  const processEntries = WBS_TEMPLATE_CATALOG_INDEX.entries.filter(isProcessLike)
  const withProjectType = processEntries.filter((entry) => readStringList(entry.metadata.applicableProjectTypes ?? entry.metadata.projectTypeCodes).length > 0)
  const withMethodVariant = processEntries.filter((entry) => readStringList(entry.metadata.applicableMethodVariantCodes ?? entry.metadata.methodVariantCodes).length > 0)
  const withElementVariant = processEntries.filter((entry) => readStringList(entry.metadata.elementVariantCodes ?? entry.metadata.applicableElementVariantCodes).length > 0)
  return {
    reportCode: 'wbs_template_applicability_matrix_report',
    processLikeNodeCount: processEntries.length,
    withProjectTypeCount: withProjectType.length,
    withMethodVariantCount: withMethodVariant.length,
    withElementVariantCount: withElementVariant.length,
    projectTypeIndexKeys: Array.from(WBS_TEMPLATE_CATALOG_INDEX.byProjectType.keys()).sort(),
    methodVariantIndexKeys: Array.from(WBS_TEMPLATE_CATALOG_INDEX.byMethodVariant.keys()).sort(),
    policy: {
      applicabilityNarrowsGenerationCandidates: true,
      applicabilityDoesNotCreateDurationOrDependencyRules: true,
      missingApplicabilityMeansGeneralBuildingScope: true,
    },
  }
}

function collectApplicabilityProfileReport() {
  const scenarioCombinations = WBS_TEMPLATE_PROJECT_SCENARIO_COMBINATIONS.map((scenario) => {
    const unresolvedTemplates = [
      ...scenario.primaryTemplateIds,
      ...scenario.supportingTemplateIds,
      ...(scenario.optionalTemplateIds ?? []),
      ...(scenario.greyOutTemplateIds ?? []),
    ].filter((templateId) => !hasTemplateId(templateId))
    const unresolvedStableCodes = scenario.requiredStableCodes.filter((stableCode) => !hasStableCode(stableCode))
    const unresolvedStablePrefixes = scenario.requiredStableCodePrefixes.filter((stableCode) => !hasStablePrefix(stableCode))
    return {
      ...scenario,
      primaryTemplateCount: scenario.primaryTemplateIds.length,
      supportingTemplateCount: scenario.supportingTemplateIds.length,
      requiredStableCodeCount: scenario.requiredStableCodes.length,
      requiredStableCodePrefixCount: scenario.requiredStableCodePrefixes.length,
      unresolvedTemplateCount: unresolvedTemplates.length,
      unresolvedStableCodeCount: unresolvedStableCodes.length,
      unresolvedStablePrefixCount: unresolvedStablePrefixes.length,
      unresolvedTemplates: unresolvedTemplates.slice(0, 20),
      unresolvedStableCodes: unresolvedStableCodes.slice(0, 20),
      unresolvedStablePrefixes: unresolvedStablePrefixes.slice(0, 20),
    }
  })
  const profiles = WBS_TEMPLATE_PROJECT_APPLICABILITY_PROFILES.map((profile) => {
    const playbook = WBS_TEMPLATE_PROJECT_APPLICABILITY_PLAYBOOKS[profile.projectType]
    const preciseCombination = WBS_TEMPLATE_PROJECT_TEMPLATE_COMBINATIONS[profile.projectType]
    const groupCounts = Object.fromEntries(profile.requiredGroups.map((group) => [
      group,
      (WBS_TEMPLATE_CATALOG_INDEX.byCatalogGroup.get(group) ?? []).filter(isProcessLike).length,
    ]))
    const recommendedSpecialtyHits = profile.recommendedSpecialtyKeywords.map((keyword) => ({
      keyword,
      matchedProcessCount: countMatchingProcessEntries([keyword]),
    }))
    const excludedSpecialtyHits = (profile.excludedSpecialtyKeywords ?? []).map((keyword) => ({
      keyword,
      matchedProcessCount: countMatchingProcessEntries([keyword]),
    }))
    const unresolvedPreciseTemplates = preciseCombination
      ? [
        ...preciseCombination.requiredTemplateIds,
        ...preciseCombination.recommendedTemplateIds,
        ...preciseCombination.greyOutTemplateIds,
        ...preciseCombination.conditionalTemplateRules.flatMap((rule) => rule.includeTemplateIds),
      ].filter((templateId) => !hasTemplateId(templateId))
      : []
    const unresolvedPrecisePrefixes = preciseCombination
      ? preciseCombination.conditionalTemplateRules
        .flatMap((rule) => rule.requireStableCodePrefixes)
        .filter((stableCode) => !hasStablePrefix(stableCode))
      : []
    return {
      ...profile,
      groupCounts,
      projectTypeSpecificProcessCount: (WBS_TEMPLATE_CATALOG_INDEX.byProjectType.get(profile.projectType) ?? []).filter(isProcessLike).length,
      triggerKeywordHitCount: countMatchingProcessEntries(profile.triggerKeywords),
      recommendedSpecialtyHits,
      excludedSpecialtyHits,
      advisoryGapCount: recommendedSpecialtyHits.filter((item) => item.matchedProcessCount <= 0).length,
      playbook: playbook ?? null,
      playbookCompleteness: playbook
        ? {
          hasGroupSelection: Object.keys(playbook.groupSelection).length > 0,
          requiredFeatureFieldCount: playbook.requiredFeatureFields.length,
          recommendationRuleCount: playbook.recommendationRules.length,
          greyOutRuleCount: playbook.greyOutRules.length,
          acceptanceMilestoneKeywordCount: playbook.acceptanceMilestoneKeywords.length,
          evidenceFocusKeywordCount: playbook.evidenceFocusKeywords.length,
        }
        : null,
      preciseTemplateCombination: preciseCombination
        ? {
          requiredTemplateCount: preciseCombination.requiredTemplateIds.length,
          recommendedTemplateCount: preciseCombination.recommendedTemplateIds.length,
          conditionalRuleCount: preciseCombination.conditionalTemplateRules.length,
          greyOutTemplateCount: preciseCombination.greyOutTemplateIds.length,
          unresolvedTemplateCount: unresolvedPreciseTemplates.length,
          unresolvedStablePrefixCount: unresolvedPrecisePrefixes.length,
          unresolvedTemplates: [...new Set(unresolvedPreciseTemplates)].slice(0, 20),
          unresolvedStablePrefixes: [...new Set(unresolvedPrecisePrefixes)].slice(0, 20),
        }
        : null,
    }
  })
  const unresolvedCombinationReferenceCount = profiles.reduce((sum, profile) => {
    const precise = profile.preciseTemplateCombination
    return sum + (precise?.unresolvedTemplateCount ?? 0) + (precise?.unresolvedStablePrefixCount ?? 0)
  }, 0)
  const unresolvedScenarioReferenceCount = scenarioCombinations.reduce((sum, scenario) => (
    sum + scenario.unresolvedTemplateCount + scenario.unresolvedStableCodeCount + scenario.unresolvedStablePrefixCount
  ), 0)
  return {
    reportCode: 'wbs_template_project_applicability_profile_report',
    profileCount: profiles.length,
    playbookCount: Object.keys(WBS_TEMPLATE_PROJECT_APPLICABILITY_PLAYBOOKS).length,
    preciseCombinationCount: Object.keys(WBS_TEMPLATE_PROJECT_TEMPLATE_COMBINATIONS).length,
    scenarioCombinationCount: scenarioCombinations.length,
    unresolvedCombinationReferenceCount,
    unresolvedScenarioReferenceCount,
    profiles,
    scenarioCombinations,
    policy: {
      profilesAreGenerationRecommendations: true,
      profilesDoNotHideCoreQualityUniverse: true,
      projectTypeSpecificCoverageCanBeInheritedFromProfile: true,
      preciseTemplateCombinationsAreRecommendationBoundariesOnly: true,
      scenarioCombinationsRepresentFieldUseCasesNotNewCatalogGroups: true,
    },
  }
}

function collectMethodVariantProfileReport() {
  const extensionRules = WBS_TEMPLATE_METHOD_VARIANT_EXTENSION_RULES.map((rule) => {
    const unresolvedTemplates = rule.includeTemplateIds.filter((templateId) => !hasTemplateId(templateId))
    const unresolvedStableCodes = [
      ...rule.requireStableCodes,
      ...rule.triggerDangerStableCodes,
      ...rule.evidenceStableCodes,
    ].filter((stableCode) => !hasStableCode(stableCode))
    const unresolvedReplacementPrefixes = rule.replaceCoreStableCodePrefixes.filter((stableCode) => !hasStablePrefix(stableCode))
    return {
      ...rule,
      includeTemplateCount: rule.includeTemplateIds.length,
      requiredStableCodeCount: rule.requireStableCodes.length,
      evidenceStableCodeCount: rule.evidenceStableCodes.length,
      confirmationFieldCount: rule.confirmationFields.length,
      unresolvedTemplateCount: unresolvedTemplates.length,
      unresolvedStableCodeCount: unresolvedStableCodes.length,
      unresolvedReplacementPrefixCount: unresolvedReplacementPrefixes.length,
      unresolvedTemplates: unresolvedTemplates.slice(0, 20),
      unresolvedStableCodes: unresolvedStableCodes.slice(0, 20),
      unresolvedReplacementPrefixes: unresolvedReplacementPrefixes.slice(0, 20),
    }
  })
  const profiles = WBS_TEMPLATE_METHOD_VARIANT_PROFILES.map((profile) => {
    const playbook = WBS_TEMPLATE_METHOD_VARIANT_PLAYBOOKS[profile.methodVariantCode]
    const preciseRule = WBS_TEMPLATE_METHOD_VARIANT_PRECISE_RULES[profile.methodVariantCode]
    const preferredTemplateHits = profile.preferredTemplateKeywords.map((keyword) => ({
      keyword,
      matchedProcessCount: countMatchingProcessEntries([keyword]),
    }))
    const unresolvedPreciseTemplates = preciseRule
      ? preciseRule.includeTemplateIds.filter((templateId) => !hasTemplateId(templateId))
      : []
    const unresolvedPreciseStableCodes = preciseRule
      ? [
        ...preciseRule.requireStableCodes,
        ...preciseRule.triggerDangerStableCodes,
        ...preciseRule.evidenceStableCodes,
      ].filter((stableCode) => !hasStableCode(stableCode))
      : []
    const unresolvedReplacementPrefixes = preciseRule
      ? preciseRule.replaceCoreStableCodePrefixes.filter((stableCode) => !hasStablePrefix(stableCode))
      : []
    return {
      ...profile,
      indexedMethodVariantProcessCount: (WBS_TEMPLATE_CATALOG_INDEX.byMethodVariant.get(profile.methodVariantCode) ?? []).filter(isProcessLike).length,
      triggerKeywordHitCount: countMatchingProcessEntries(profile.triggerKeywords),
      preferredTemplateHits,
      advisoryGapCount: preferredTemplateHits.filter((item) => item.matchedProcessCount <= 0).length,
      playbook: playbook ?? null,
      playbookCompleteness: playbook
        ? {
          recommendedActionCount: playbook.recommendedActions.length,
          controlCheckpointCount: playbook.controlCheckpoints.length,
          evidenceKeywordCount: playbook.evidenceKeywords.length,
          hasNonAutoExpansionReason: Boolean(playbook.notAutoExpandedBecause),
        }
        : null,
      preciseRule: preciseRule
        ? {
          includeTemplateCount: preciseRule.includeTemplateIds.length,
          replaceCoreStablePrefixCount: preciseRule.replaceCoreStableCodePrefixes.length,
          requiredStableCodeCount: preciseRule.requireStableCodes.length,
          triggerDangerStableCodeCount: preciseRule.triggerDangerStableCodes.length,
          evidenceStableCodeCount: preciseRule.evidenceStableCodes.length,
          confirmationFieldCount: preciseRule.confirmationFields.length,
          unresolvedTemplateCount: unresolvedPreciseTemplates.length,
          unresolvedStableCodeCount: unresolvedPreciseStableCodes.length,
          unresolvedReplacementPrefixCount: unresolvedReplacementPrefixes.length,
          unresolvedTemplates: unresolvedPreciseTemplates.slice(0, 20),
          unresolvedStableCodes: unresolvedPreciseStableCodes.slice(0, 20),
          unresolvedReplacementPrefixes: unresolvedReplacementPrefixes.slice(0, 20),
        }
        : null,
    }
  })
  const unresolvedPreciseRuleReferenceCount = profiles.reduce((sum, profile) => {
    const precise = profile.preciseRule
    return sum
      + (precise?.unresolvedTemplateCount ?? 0)
      + (precise?.unresolvedStableCodeCount ?? 0)
      + (precise?.unresolvedReplacementPrefixCount ?? 0)
  }, 0)
  const unresolvedExtensionRuleReferenceCount = extensionRules.reduce((sum, rule) => (
    sum + rule.unresolvedTemplateCount + rule.unresolvedStableCodeCount + rule.unresolvedReplacementPrefixCount
  ), 0)
  return {
    reportCode: 'wbs_template_method_variant_profile_report',
    profileCount: profiles.length,
    playbookCount: Object.keys(WBS_TEMPLATE_METHOD_VARIANT_PLAYBOOKS).length,
    preciseRuleCount: Object.keys(WBS_TEMPLATE_METHOD_VARIANT_PRECISE_RULES).length,
    extensionRuleCount: extensionRules.length,
    unresolvedPreciseRuleReferenceCount,
    unresolvedExtensionRuleReferenceCount,
    profiles,
    extensionRules,
    policy: {
      methodProfilesNarrowOrRecommendTemplatePackages: true,
      methodProfilesDoNotCreateCartesianRowsByThemselves: true,
      preciseRulesRecommendIncludeReplaceAndEvidenceTargetsOnly: true,
      extensionRulesRequireFeatureConfirmationBeforeGeneration: true,
    },
  }
}

function collectGoldenCaseReport() {
  const cases = WBS_TEMPLATE_GOLDEN_PROJECT_CASES.map((item) => {
    const expectedOutput = WBS_TEMPLATE_GOLDEN_CASE_EXPECTED_OUTPUTS[item.caseCode]
    const stableCodeExpectation = WBS_TEMPLATE_GOLDEN_CASE_STABLE_CODE_EXPECTATIONS[item.caseCode]
    const strongAssertion = WBS_TEMPLATE_GOLDEN_CASE_STRONG_ASSERTIONS[item.caseCode]
    const groups: Record<string, number> = Object.fromEntries(item.requiredGroups.map((group) => [
      group,
      (WBS_TEMPLATE_CATALOG_INDEX.byCatalogGroup.get(group) ?? []).filter(isProcessLike).length,
    ]))
    const missingGroups = (Object.entries(groups) as Array<[string, number]>)
      .filter(([, count]) => count <= 0)
      .map(([group]) => group)
    const projectTypeSpecificCount = (WBS_TEMPLATE_CATALOG_INDEX.byProjectType.get(item.projectType) ?? []).filter(isProcessLike).length
    const specialtyKeywordHits = (item.expectedSpecialtyKeywords ?? []).map((keyword) => ({
      keyword,
      matchedProcessCount: countMatchingProcessEntries([keyword]),
    }))
    const managementKeywordHits = (item.expectedManagementKeywords ?? []).map((keyword) => ({
      keyword,
      matchedProcessCount: countMatchingProcessEntries([keyword]),
    }))
    const dangerKeywordHits = (item.expectedDangerKeywords ?? []).map((keyword) => ({
      keyword,
      matchedProcessCount: countMatchingProcessEntries([keyword]),
    }))
    const advisoryGaps = [
      ...specialtyKeywordHits,
      ...managementKeywordHits,
      ...dangerKeywordHits,
    ].filter((hit) => hit.matchedProcessCount <= 0)
    const requiredKeywordGroupResults = (expectedOutput?.requiredKeywordGroups ?? []).map((expectation) => {
      const matchedProcessCount = countMatchingProcessEntries(expectation.keywords)
      return {
        ...expectation,
        matchedProcessCount,
        pass: matchedProcessCount >= expectation.minMatchedProcessCount,
      }
    })
    const expectedOutputGapCount = expectedOutput
      ? requiredKeywordGroupResults.filter((expectation) => !expectation.pass).length
      : 1
    const unresolvedTemplateIds = stableCodeExpectation
      ? stableCodeExpectation.requiredTemplateIds.filter((templateId) => !hasTemplateId(templateId))
      : []
    const unresolvedStableCodes = stableCodeExpectation
      ? [
        ...stableCodeExpectation.requiredStableCodes,
        ...(stableCodeExpectation.acceptanceProjectionCodes ?? []),
      ].filter((stableCode) => !hasStableCode(stableCode))
      : []
    const unresolvedStableCodePrefixes = stableCodeExpectation
      ? [
        ...stableCodeExpectation.requiredStableCodePrefixes,
        ...(stableCodeExpectation.duplicateSuppressionCodes ?? []),
      ].filter((stableCode) => !hasStablePrefix(stableCode))
      : []
    const stableCodeExpectationGapCount = stableCodeExpectation
      ? unresolvedTemplateIds.length + unresolvedStableCodes.length + unresolvedStableCodePrefixes.length
      : 1
    const semanticCheckResults = (strongAssertion?.semanticChecks ?? []).map((check) => {
      const entry = firstEntryByStableCode(check.stableCode)
      const actualValue = effectiveMetadata(entry)?.[check.metadataField] ?? null
      return {
        ...check,
        actualValue,
        pass: actualValue === check.expectedValue,
      }
    })
    const evidenceRefCheckResults = (strongAssertion?.evidenceRefChecks ?? []).map((check) => ({
      ...check,
      pass: hasEvidenceCode(check.stableCode, check.evidenceCode),
    }))
    const strongAssertionGapCount = strongAssertion
      ? semanticCheckResults.filter((check) => !check.pass).length + evidenceRefCheckResults.filter((check) => !check.pass).length
      : 0
    return {
      ...item,
      groupProcessCounts: groups,
      projectTypeSpecificCount,
      pass: missingGroups.length === 0 && expectedOutputGapCount === 0 && stableCodeExpectationGapCount === 0 && strongAssertionGapCount === 0,
      missingGroups,
      specialtyKeywordHits,
      managementKeywordHits,
      dangerKeywordHits,
      advisoryGapCount: advisoryGaps.length,
      advisoryGaps,
      expectedOutput: expectedOutput ?? null,
      requiredKeywordGroupResults,
      expectedOutputGapCount,
      expectedOutputCompleteness: expectedOutput
        ? {
          requiredKeywordGroupCount: expectedOutput.requiredKeywordGroups.length,
          expectedPlanItemKindCount: expectedOutput.expectedPlanItemKinds.length,
          triggerAssertionCount: expectedOutput.expectedTriggerAssertions.length,
          duplicateSuppressionAssertionCount: expectedOutput.duplicateSuppressionAssertions.length,
          acceptanceProjectionAssertionCount: expectedOutput.acceptanceProjectionAssertions.length,
          evidenceAssertionCount: expectedOutput.evidenceAssertions.length,
        }
        : null,
      stableCodeExpectation: stableCodeExpectation
        ? {
          requiredTemplateCount: stableCodeExpectation.requiredTemplateIds.length,
          requiredStableCodeCount: stableCodeExpectation.requiredStableCodes.length,
          requiredStableCodePrefixCount: stableCodeExpectation.requiredStableCodePrefixes.length,
          duplicateSuppressionCodeCount: stableCodeExpectation.duplicateSuppressionCodes?.length ?? 0,
          acceptanceProjectionCodeCount: stableCodeExpectation.acceptanceProjectionCodes?.length ?? 0,
          unresolvedTemplateIdCount: unresolvedTemplateIds.length,
          unresolvedStableCodeCount: unresolvedStableCodes.length,
          unresolvedStableCodePrefixCount: unresolvedStableCodePrefixes.length,
          unresolvedTemplateIds: unresolvedTemplateIds.slice(0, 20),
          unresolvedStableCodes: unresolvedStableCodes.slice(0, 20),
          unresolvedStableCodePrefixes: unresolvedStableCodePrefixes.slice(0, 20),
        }
        : null,
      stableCodeExpectationGapCount,
      strongAssertion: strongAssertion
        ? {
          semanticCheckCount: strongAssertion.semanticChecks.length,
          evidenceRefCheckCount: strongAssertion.evidenceRefChecks.length,
          semanticCheckResults,
          evidenceRefCheckResults,
          gapCount: strongAssertionGapCount,
        }
        : null,
      strongAssertionGapCount,
    }
  })
  return {
    reportCode: 'wbs_template_golden_case_regression_report',
    caseCount: cases.length,
    expectedOutputCaseCount: Object.keys(WBS_TEMPLATE_GOLDEN_CASE_EXPECTED_OUTPUTS).length,
    stableCodeExpectationCaseCount: Object.keys(WBS_TEMPLATE_GOLDEN_CASE_STABLE_CODE_EXPECTATIONS).length,
    strongAssertionCaseCount: Object.keys(WBS_TEMPLATE_GOLDEN_CASE_STRONG_ASSERTIONS).length,
    passedCaseCount: cases.filter((item) => item.pass).length,
    failedCaseCount: cases.filter((item) => !item.pass).length,
    stableCodeExpectationGapCount: cases.reduce((sum, item) => sum + item.stableCodeExpectationGapCount, 0),
    strongAssertionGapCount: cases.reduce((sum, item) => sum + item.strongAssertionGapCount, 0),
    cases,
    policy: {
      runsAfterSeedChange: true,
      validatesSeedShapeAndCommercialCoverage: true,
      validatesSeedShapeNotRuntimeDates: true,
      ordinaryFrontendExposesGoldenCaseDetails: false,
      stableCodeExpectationsPreventKeywordOnlyGoldenCases: true,
      strongAssertionsProtectRuntimeSemanticsFromRegression: true,
    },
  }
}

function collectGeneratedResultAssertionReport() {
  const assertions = WBS_TEMPLATE_GOLDEN_GENERATED_RESULT_ASSERTIONS.map((assertion) => {
    const templateEntries = assertion.expectedTemplateIds
      .flatMap((templateId) => WBS_TEMPLATE_CATALOG_INDEX.byTemplateId.get(templateId) ?? [])
      .filter(isProcessLike)
    const unresolvedTemplates = assertion.expectedTemplateIds.filter((templateId) => !hasTemplateId(templateId))
    const unresolvedStableCodes = assertion.expectedStableCodes.filter((stableCode) => !hasStableCode(stableCode))
    const unresolvedStablePrefixes = assertion.expectedStableCodePrefixes.filter((stableCode) => !hasStablePrefix(stableCode))
    const missingPlanItemKinds = assertion.expectedPlanItemKinds.filter((kind) => (
      !templateEntries.some((entry) => String(entry.metadata.planItemKind ?? '') === kind)
    ))
    const missingDurationContributionModes = assertion.expectedDurationContributionModes.filter((mode) => (
      !templateEntries.some((entry) => String(entry.metadata.durationContributionMode ?? '') === mode)
    ))
    return {
      ...assertion,
      expectedTemplateCount: assertion.expectedTemplateIds.length,
      expectedStableCodeCount: assertion.expectedStableCodes.length,
      expectedStableCodePrefixCount: assertion.expectedStableCodePrefixes.length,
      expectedPlanItemKindCount: assertion.expectedPlanItemKinds.length,
      expectedDurationContributionModeCount: assertion.expectedDurationContributionModes.length,
      forbiddenRuntimeEffectCount: assertion.forbiddenRuntimeEffects.length,
      matchedTemplateProcessCount: templateEntries.length,
      unresolvedTemplateCount: unresolvedTemplates.length,
      unresolvedStableCodeCount: unresolvedStableCodes.length,
      unresolvedStablePrefixCount: unresolvedStablePrefixes.length,
      missingPlanItemKindCount: missingPlanItemKinds.length,
      missingDurationContributionModeCount: missingDurationContributionModes.length,
      unresolvedTemplates: unresolvedTemplates.slice(0, 20),
      unresolvedStableCodes: unresolvedStableCodes.slice(0, 20),
      unresolvedStablePrefixes: unresolvedStablePrefixes.slice(0, 20),
      missingPlanItemKinds,
      missingDurationContributionModes,
      pass: unresolvedTemplates.length === 0
        && unresolvedStableCodes.length === 0
        && unresolvedStablePrefixes.length === 0
        && missingPlanItemKinds.length === 0
        && missingDurationContributionModes.length === 0,
    }
  })
  return {
    reportCode: 'wbs_template_generated_result_assertion_report',
    assertionCount: assertions.length,
    passedAssertionCount: assertions.filter((assertion) => assertion.pass).length,
    failedAssertionCount: assertions.filter((assertion) => !assertion.pass).length,
    unresolvedReferenceCount: assertions.reduce((sum, assertion) => (
      sum
      + assertion.unresolvedTemplateCount
      + assertion.unresolvedStableCodeCount
      + assertion.unresolvedStablePrefixCount
      + assertion.missingPlanItemKindCount
      + assertion.missingDurationContributionModeCount
    ), 0),
    assertions,
    policy: {
      assertionsDescribeGeneratedRowsNotSeedInternals: true,
      assertionsDoNotExecuteRuntimeDurationOrDependencyMath: true,
      failuresCreateBackendGovernanceCandidates: true,
      ordinaryFrontendExposesAssertionDetails: false,
    },
  }
}

function collectSemanticRiskBucketReport() {
  const overrides = new Set(WBS_TEMPLATE_SEMANTIC_OVERRIDES.map((item) => item.stableCode))
  const buckets = WBS_TEMPLATE_SEMANTIC_RISK_BUCKETS.map((bucket) => {
    const entries = WBS_TEMPLATE_CATALOG_INDEX.entries.filter((entry) => isProcessLike(entry) && entryMatchesAny(entry, bucket.keywords))
    const overrideHits = entries.filter((entry) => overrides.has(entry.stableCode))
    const likelyModeMismatch = entries.filter((entry) => {
      const mode = String(entry.metadata.durationContributionMode ?? '')
      return mode && mode !== bucket.expectedDurationContributionMode
    })
    return {
      ...bucket,
      matchedNodeCount: entries.length,
      semanticOverrideHitCount: overrideHits.length,
      likelyModeMismatchCount: likelyModeMismatch.length,
      overrideCoverageRatio: entries.length ? Number((overrideHits.length / entries.length).toFixed(3)) : 1,
      samplesNeedingReview: likelyModeMismatch.slice(0, 10).map((entry) => ({
        stableCode: entry.stableCode,
        name: entry.name,
        templateId: entry.templateId,
        durationContributionMode: entry.metadata.durationContributionMode ?? null,
        executionNature: entry.metadata.executionNature ?? null,
      })),
    }
  })
  return {
    reportCode: 'wbs_template_semantic_risk_bucket_report',
    bucketCount: buckets.length,
    highPriorityBucketCount: buckets.filter((bucket) => bucket.priority === 'P0').length,
    buckets,
    policy: {
      p0BucketsShouldReceiveExactStableCodeOverridesFirst: true,
      keywordBucketsCreateReviewQueuesOnly: true,
      keywordBucketsDoNotOverrideRuntimeSemantics: true,
    },
  }
}

function collectFeedbackCandidatePolicyReport() {
  const policies = WBS_TEMPLATE_FEEDBACK_CANDIDATE_POLICIES.map((policy) => {
    const metrics = WBS_TEMPLATE_FEEDBACK_METRIC_POLICIES.filter((metric) => metric.candidateCode === policy.candidateCode)
    return {
      ...policy,
      sourceSignalCount: policy.sourceSignals.length,
      quarantineConditionCount: policy.quarantineConditions.length,
      negativeSignalCount: policy.negativeSignals.length,
      hasPromotionGate: Boolean(policy.promotionGate),
      hasCandidateOutput: Boolean(policy.candidateOutput),
      metricCount: metrics.length,
      metrics,
    }
  })
  const metricCandidateCodes = new Set(WBS_TEMPLATE_FEEDBACK_METRIC_POLICIES.map((metric) => metric.candidateCode))
  const policyCandidateCodes = new Set(WBS_TEMPLATE_FEEDBACK_CANDIDATE_POLICIES.map((policy) => policy.candidateCode))
  const orphanMetrics = WBS_TEMPLATE_FEEDBACK_METRIC_POLICIES.filter((metric) => !policyCandidateCodes.has(metric.candidateCode))
  const policiesMissingMetric = WBS_TEMPLATE_FEEDBACK_CANDIDATE_POLICIES.filter((policy) => !metricCandidateCodes.has(policy.candidateCode))
  const orphanEvents = WBS_TEMPLATE_FEEDBACK_EVENT_POLICIES.filter((event) => !policyCandidateCodes.has(event.candidateCode))
  const eventCandidateCodes = new Set(WBS_TEMPLATE_FEEDBACK_EVENT_POLICIES.map((event) => event.candidateCode))
  const policiesMissingEvent = WBS_TEMPLATE_FEEDBACK_CANDIDATE_POLICIES.filter((policy) => !eventCandidateCodes.has(policy.candidateCode))
  return {
    reportCode: 'wbs_template_feedback_candidate_policy_report',
    policyCount: policies.length,
    metricPolicyCount: WBS_TEMPLATE_FEEDBACK_METRIC_POLICIES.length,
    eventPolicyCount: WBS_TEMPLATE_FEEDBACK_EVENT_POLICIES.length,
    orphanMetricPolicyCount: orphanMetrics.length,
    orphanEventPolicyCount: orphanEvents.length,
    policiesMissingMetricCount: policiesMissingMetric.length,
    policiesMissingEventCount: policiesMissingEvent.length,
    policies,
    metricPolicies: WBS_TEMPLATE_FEEDBACK_METRIC_POLICIES,
    eventPolicies: WBS_TEMPLATE_FEEDBACK_EVENT_POLICIES.map((event) => ({
      ...event,
      requiredPayloadFieldCount: event.requiredPayloadFields.length,
      aggregationKeyFieldCount: event.aggregationKeyFields.length,
      sampleValidityRuleCount: event.sampleValidityRules.length,
      hasCandidateEmitCondition: Boolean(event.candidateEmitCondition),
    })),
    orphanMetricPolicies: orphanMetrics,
    orphanEventPolicies: orphanEvents,
    policiesMissingMetric: policiesMissingMetric.map((policy) => policy.candidateCode),
    policiesMissingEvent: policiesMissingEvent.map((policy) => policy.candidateCode),
    minimumSampleSizeTotal: policies.reduce((sum, policy) => sum + policy.minimumSampleSize, 0),
    averageConfidenceThreshold: policies.length
      ? Number((policies.reduce((sum, policy) => sum + policy.confidenceThreshold, 0) / policies.length).toFixed(3))
      : 0,
    policy: {
      projectHistoryCreatesCandidatesOnly: true,
      candidatesDoNotSilentlyMutateTemplateSeeds: true,
      promotionRequiresManualGovernance: true,
      feedbackMetricsAreComputableCandidateSignalsNotAutoPromotion: true,
      feedbackEventsAreObservationContractsNotUserFacingWorkflow: true,
    },
  }
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(3)) : null
}

// workspace-isolation-capability-read-approved: the company governance route supplies visible project ids and this report filters every calibration row to that exact set.
async function collectTemplateCandidateCalibrationReport(options: { limit?: number; projectIds: string[] }) {
  const limit = Math.max(1, Math.min(200, Math.trunc(options.limit ?? 50)))
  const projectIds = Array.from(new Set(
    options.projectIds.map((projectId) => String(projectId ?? '').trim()).filter(Boolean),
  ))
  if (projectIds.length === 0) {
    return {
      reportCode: 'wbs_template_candidate_calibration_report',
      available: true,
      rowCount: 0,
      summary: {
        totalCandidates: 0,
        retainedCandidates: 0,
        rejectedCandidates: 0,
        pendingCandidates: 0,
        acceptanceRate: null,
        rejectionRate: null,
        pendingRate: null,
        upgradeCandidateReadyCount: 0,
        quarantineReviewCount: 0,
        insufficientSampleCount: 0,
      },
      rows: [],
      policy: {
        acceptanceRateUsesRetainedRowsOnly: true,
        generatedRowsAreNotImplicitlyAccepted: true,
        promotionGate: 'totalCandidates >= 8 and acceptanceRate >= 0.78 and rejectionRate <= 0.18',
        quarantineGate: 'rejectionRate >= 0.45',
        ordinaryFrontendExposesCalibrationDetails: false,
      },
    }
  }
  try {
    const table = supabase.from('wbs_template_candidate_aggregations')
    if (typeof table?.select !== 'function') {
      return {
        reportCode: 'wbs_template_candidate_calibration_report',
        available: false,
        reason: 'supabase_table_unavailable',
        rows: [],
        summary: null,
        policy: {
          acceptanceRateUsesRetainedRowsOnly: true,
          generatedRowsAreNotImplicitlyAccepted: true,
          ordinaryFrontendExposesCalibrationDetails: false,
        },
      }
    }

    let query = table
      .select('project_id, template_id, period_month, total_candidates, accepted_candidates, rejected_candidates, pending_candidates, acceptance_rate, metadata, updated_at')
      .in('project_id', projectIds)
      .order('updated_at', { ascending: false })
      .limit(limit)
    const { data, error } = await query
    if (error) throw error

    const rows = (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => {
      const total = readNumber(row.total_candidates)
      const retained = readNumber(row.accepted_candidates)
      const rejected = readNumber(row.rejected_candidates)
      const pending = readNumber(row.pending_candidates)
      const acceptanceRate = ratio(retained, total)
      const rejectionRate = ratio(rejected, total)
      const pendingRate = ratio(pending, total)
      const calibrationStatus = total < 8
        ? 'insufficient_samples'
        : acceptanceRate !== null && acceptanceRate >= 0.78 && rejectionRate !== null && rejectionRate <= 0.18
          ? 'upgrade_candidate_ready'
          : rejectionRate !== null && rejectionRate >= 0.45
            ? 'quarantine_review'
            : 'monitor'
      return {
        projectId: row.project_id ?? null,
        templateId: row.template_id ?? null,
        periodMonth: row.period_month ?? null,
        totalCandidates: total,
        retainedCandidates: retained,
        rejectedCandidates: rejected,
        pendingCandidates: pending,
        acceptanceRate,
        rejectionRate,
        pendingRate,
        calibrationStatus,
        metadata: row.metadata ?? {},
        updatedAt: row.updated_at ?? null,
      }
    })
    const totals = rows.reduce((acc, row) => ({
      totalCandidates: acc.totalCandidates + row.totalCandidates,
      retainedCandidates: acc.retainedCandidates + row.retainedCandidates,
      rejectedCandidates: acc.rejectedCandidates + row.rejectedCandidates,
      pendingCandidates: acc.pendingCandidates + row.pendingCandidates,
    }), {
      totalCandidates: 0,
      retainedCandidates: 0,
      rejectedCandidates: 0,
      pendingCandidates: 0,
    })
    return {
      reportCode: 'wbs_template_candidate_calibration_report',
      available: true,
      rowCount: rows.length,
      summary: {
        ...totals,
        acceptanceRate: ratio(totals.retainedCandidates, totals.totalCandidates),
        rejectionRate: ratio(totals.rejectedCandidates, totals.totalCandidates),
        pendingRate: ratio(totals.pendingCandidates, totals.totalCandidates),
        upgradeCandidateReadyCount: rows.filter((row) => row.calibrationStatus === 'upgrade_candidate_ready').length,
        quarantineReviewCount: rows.filter((row) => row.calibrationStatus === 'quarantine_review').length,
        insufficientSampleCount: rows.filter((row) => row.calibrationStatus === 'insufficient_samples').length,
      },
      rows,
      policy: {
        acceptanceRateUsesRetainedRowsOnly: true,
        generatedRowsAreNotImplicitlyAccepted: true,
        promotionGate: 'totalCandidates >= 8 and acceptanceRate >= 0.78 and rejectionRate <= 0.18',
        quarantineGate: 'rejectionRate >= 0.45',
        ordinaryFrontendExposesCalibrationDetails: false,
      },
    }
  } catch (error) {
    return {
      reportCode: 'wbs_template_candidate_calibration_report',
      available: false,
      reason: error instanceof Error ? error.message : String(error),
      rows: [],
      summary: null,
      policy: {
        acceptanceRateUsesRetainedRowsOnly: true,
        generatedRowsAreNotImplicitlyAccepted: true,
        ordinaryFrontendExposesCalibrationDetails: false,
      },
    }
  }
}

function collectCommercialQualityScoreReport(input: {
  goldenCases: ReturnType<typeof collectGoldenCaseReport>
  replacementSuppression: ReturnType<typeof collectReplacementReport>
  evidenceQuality: ReturnType<typeof collectEvidenceQualityPolicyReport>
  applicabilityProfiles: ReturnType<typeof collectApplicabilityProfileReport>
  methodVariantProfiles: ReturnType<typeof collectMethodVariantProfileReport>
  semanticRiskBuckets: ReturnType<typeof collectSemanticRiskBucketReport>
  feedbackPolicies: ReturnType<typeof collectFeedbackCandidatePolicyReport>
}) {
  const weights = WBS_TEMPLATE_QUALITY_SCORE_WEIGHTS
  const semanticOverrideCoverage = Math.min(1, WBS_TEMPLATE_SEMANTIC_OVERRIDES.length / Math.max(1, WBS_TEMPLATE_SEMANTIC_RISK_BUCKETS.length * 3))
  const evidencePolicyRows = input.evidenceQuality.policies
  const evidenceQuality = evidencePolicyRows.length
    ? evidencePolicyRows.reduce((sum, item) => sum + item.preferredEvidenceCoverageRatio, 0) / evidencePolicyRows.length
    : 1
  const applicabilityProfileReadiness = input.applicabilityProfiles.profiles.length
    ? input.applicabilityProfiles.profiles.filter((profile) => profile.advisoryGapCount === 0).length / input.applicabilityProfiles.profiles.length
    : 1
  const methodVariantReadiness = input.methodVariantProfiles.profiles.length
    ? input.methodVariantProfiles.profiles.filter((profile) => profile.advisoryGapCount === 0).length / input.methodVariantProfiles.profiles.length
    : 1
  const applicabilityCoverage = (applicabilityProfileReadiness + methodVariantReadiness) / 2
  const replacementIntegrity = input.replacementSuppression.replacementNodeCount > 0
    && input.replacementSuppression.unresolvedCoreReplacementCodeCount === 0
    && input.replacementSuppression.missingReplacementModeCount === 0
    ? 1
    : 0
  const goldenCaseCoverage = input.goldenCases.caseCount
    ? input.goldenCases.passedCaseCount / input.goldenCases.caseCount
    : 1
  const feedbackReadiness = input.feedbackPolicies.policyCount >= 5 ? 1 : input.feedbackPolicies.policyCount / 5
  const weightedScore = (
    semanticOverrideCoverage * weights.semanticOverrideCoverage
    + evidenceQuality * weights.evidenceQuality
    + applicabilityCoverage * weights.applicabilityCoverage
    + replacementIntegrity * weights.replacementIntegrity
    + goldenCaseCoverage * weights.goldenCaseCoverage
    + feedbackReadiness * weights.feedbackReadiness
  )
  return {
    reportCode: 'wbs_template_commercial_quality_score_report',
    score: Number((weightedScore * 100).toFixed(1)),
    level: weightedScore >= 0.85 ? 'commercial_ready' : weightedScore >= 0.7 ? 'commercial_governance_needed' : 'content_thickening_required',
    components: {
      semanticOverrideCoverage: Number(semanticOverrideCoverage.toFixed(3)),
      evidenceQuality: Number(evidenceQuality.toFixed(3)),
      applicabilityCoverage: Number(applicabilityCoverage.toFixed(3)),
      replacementIntegrity,
      goldenCaseCoverage: Number(goldenCaseCoverage.toFixed(3)),
      feedbackReadiness,
    },
    weights,
    policy: {
      scoreIsGovernanceSignalNotRuntimeBlocker: true,
      releaseGateShouldReviewScoresBelow85: true,
      frontendShouldExposeBusinessUpgradeSummaryOnly: true,
    },
  }
}

function collectVersionDiffReadinessReport() {
  const fingerprints = WBS_TEMPLATE_CATALOG_INDEX.entries.map(fingerprintEntry)
  const processFingerprints = fingerprints.filter((item) => PROCESS_TYPES.has(item.categoryType))
  return {
    reportCode: 'wbs_template_seed_version_diff_readiness_report',
    currentSnapshotHash: hashJson(fingerprints),
    nodeCount: fingerprints.length,
    processLikeNodeCount: processFingerprints.length,
    semanticFingerprintHash: hashJson(processFingerprints.map((item) => ({
      stableCode: item.stableCode,
      planItemKind: item.planItemKind,
      durationContributionMode: item.durationContributionMode,
      executionNature: item.executionNature,
    }))),
    replacementFingerprintHash: hashJson(processFingerprints.map((item) => ({
      stableCode: item.stableCode,
      generationMode: item.generationMode,
      replacesCoreQualityCodes: item.replacesCoreQualityCodes,
    }))),
    sampleFingerprints: fingerprints.slice(0, 20),
    policy: {
      reportIsForBackendGovernanceAndCi: true,
      ordinaryFrontendExposesTechnicalDiff: false,
      stableCodeChangeRequiresReleaseReview: true,
      semanticOrReplacementChangeRequiresGoldenCaseRerun: true,
    },
  }
}

export async function collectWbsTemplateSeedArchitectureGovernanceReport(options: { projectIds: string[] }) {
  const authoringRules = collectSeedAuthoringRuleReport()
  const goldenCases = collectGoldenCaseReport()
  const generatedResultAssertions = collectGeneratedResultAssertionReport()
  const replacementSuppression = collectReplacementReport()
  const evidenceRefs = collectEvidenceRefReport()
  const evidenceQuality = collectEvidenceQualityPolicyReport()
  const applicabilityMatrix = collectApplicabilityMatrixReport()
  const applicabilityProfiles = collectApplicabilityProfileReport()
  const methodVariantProfiles = collectMethodVariantProfileReport()
  const semanticRiskBuckets = collectSemanticRiskBucketReport()
  const feedbackCandidatePolicies = collectFeedbackCandidatePolicyReport()
  const candidateCalibration = await collectTemplateCandidateCalibrationReport({ projectIds: options.projectIds })
  return {
    generatedAt: new Date().toISOString(),
    reportCode: 'wbs_template_seed_architecture_governance',
    version: 'v1.4.22.10',
    scope: 'china_gb55032_core_quality_and_domain_wbs_template_catalogs',
    governancePolicy: {
      templateSeedsAreFoundationFactsOnly: true,
      durationAndDependencyCalculationOwnedByDedicatedSeeds: true,
      titleWeakRecognitionMapsHandwrittenTasksToStableCodes: true,
      semanticOverridesInterpretStableCodesAfterRecognition: true,
      ordinaryFrontendExposesTechnicalSeedReports: false,
    },
    catalogIndex: collectWbsTemplateCatalogIndexReport(),
    authoringRules,
    semanticOverrides: {
      reportCode: 'wbs_template_semantic_override_report',
      overrideCount: WBS_TEMPLATE_SEMANTIC_OVERRIDES.length,
      overrides: WBS_TEMPLATE_SEMANTIC_OVERRIDES,
      precedence: [
        'stableCode semantic override',
        'template node explicit metadata',
        'semantic inference rules',
        'title weak recognition fallback',
        'review_required governance',
      ],
    },
    semanticRiskBuckets,
    goldenCases,
    generatedResultAssertions,
    replacementSuppression,
    evidenceRefs,
    evidenceQuality,
    applicabilityMatrix,
    applicabilityProfiles,
    methodVariantProfiles,
    feedbackCandidatePolicies,
    candidateCalibration,
    commercialQualityScore: collectCommercialQualityScoreReport({
      goldenCases,
      replacementSuppression,
      evidenceQuality,
      applicabilityProfiles,
      methodVariantProfiles,
      semanticRiskBuckets,
      feedbackPolicies: feedbackCandidatePolicies,
    }),
    versionDiff: collectVersionDiffReadinessReport(),
  }
}
