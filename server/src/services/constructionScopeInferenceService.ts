import type { AlgorithmSeedResolveContext } from './algorithmSeedResolver.js'
import type { BuildingPatternExecutionFactInput } from './buildingPatternExecutionProfileService.js'
import { readProjectGenerationFactsSnapshot } from './projectGenerationFactsSnapshotService.js'
import { buildAlgorithmFactContext, summarizeAlgorithmFactContext } from './algorithmFactContextService.js'
import { normalizeSpatialSemanticCode } from './spatialSemanticDictionaryService.js'

export type ConstructionScopeInference = {
  systemKey: string | null
  workfaceKey: string | null
  scopeDimensions: string[]
  rhythmDrivers: string[]
  phaseWindow: string | null
  primaryWorkfaceType: string | null
  expansionStrategy: string | null
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase()
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)))
}

function readTextArrayFromRecord(record: Record<string, unknown>, keys: string[]) {
  const values: string[] = []
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      values.push(...value.map(normalizeText).filter(Boolean))
      continue
    }
    const text = normalizeText(value)
    if (text) values.push(text)
  }
  return values
}

function readNestedRecord(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const nested = readRecord(record[key])
    if (Object.keys(nested).length > 0) return nested
  }
  return {}
}

function readScopeSnapshot(fact: BuildingPatternExecutionFactInput) {
  return readRecord(fact.scope_snapshot)
}

function readScopeObjects(fact: BuildingPatternExecutionFactInput) {
  return readRecord(readScopeSnapshot(fact).objects)
}

function readScopeDimensionsRecord(fact: BuildingPatternExecutionFactInput) {
  return readRecord(readScopeSnapshot(fact).dimensions)
}

function readSnapshotObjectId(objects: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = normalizeText(objects[key])
    if (direct) return direct
    const recordId = normalizeText(readRecord(objects[key]).id)
    if (recordId) return recordId
  }
  return ''
}

function hasSnapshotDimension(dimensions: Record<string, unknown>, keys: string[]) {
  return keys.some((key) => {
    const value = dimensions[key]
    if (normalizeText(value)) return true
    return Object.keys(readRecord(value)).length > 0
  })
}

function mergeFeatureProfile(fact: BuildingPatternExecutionFactInput) {
  const metadata = readRecord(fact.standard_task_metadata)
  const generationMetadata = readRecord(fact.generation_metadata)
  const wbsSnapshot = readRecord(fact.wbs_snapshot)
  const taskFactSnapshot = readRecord(fact.task_fact_snapshot)
  const projectGenerationFacts = readProjectGenerationFactsSnapshot(
    fact,
    metadata,
    generationMetadata,
    wbsSnapshot,
    taskFactSnapshot,
  )
  const factContext = buildAlgorithmFactContext({
    phase: 'duration_context',
    projectGenerationFacts,
    runtimeExecutionFacts: {
      progressCompletionRatio: fact.current_progress == null && fact.progress == null
        ? undefined
        : Number(fact.current_progress ?? fact.progress) / 100,
      evidenceCodes: Object.keys(taskFactSnapshot).length > 0 ? ['task_fact_snapshot'] : [],
    },
  })
  return {
    projectTypeCode: factContext.projectGenerationFacts.businessType,
    structureTypeCode: factContext.projectGenerationFacts.structureTypeCode,
    methodVariantCodes: factContext.projectGenerationFacts.methodVariantCodes,
    elementVariantCodes: factContext.projectGenerationFacts.elementVariantCodes,
    algorithmFactContext: summarizeAlgorithmFactContext(factContext),
    ...readNestedRecord(fact, ['featureProfile', 'feature_profile']),
    ...readNestedRecord(metadata, ['featureProfile', 'feature_profile']),
    ...readNestedRecord(generationMetadata, ['featureProfile', 'feature_profile']),
    ...readNestedRecord(wbsSnapshot, ['featureProfile', 'feature_profile']),
    ...readNestedRecord(taskFactSnapshot, ['featureProfile', 'feature_profile']),
  }
}

function mergeBuildingPatternObservation(fact: BuildingPatternExecutionFactInput) {
  const metadata = readRecord(fact.standard_task_metadata)
  const generationMetadata = readRecord(fact.generation_metadata)
  const wbsSnapshot = readRecord(fact.wbs_snapshot)
  const taskFactSnapshot = readRecord(fact.task_fact_snapshot)
  return {
    ...readNestedRecord(fact, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readNestedRecord(metadata, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readNestedRecord(generationMetadata, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readNestedRecord(wbsSnapshot, ['buildingPatternObservation', 'building_pattern_observation']),
    ...readNestedRecord(taskFactSnapshot, ['buildingPatternObservation', 'building_pattern_observation']),
  }
}

function compactFactText(fact: BuildingPatternExecutionFactInput) {
  return [
    fact.title,
    fact.name,
    fact.description,
    fact.standard_work_name,
    fact.standard_work_code,
    fact.wbs_node_type,
    fact.wbs_path,
    fact.engineering_category_id,
    fact.template_id,
    fact.template_node_id,
  ].map(normalizeText).filter(Boolean).join(' ')
}

function codeStartsWithAny(code: string, prefixes: string[]) {
  return prefixes.some((prefix) => code === prefix || code.startsWith(`${prefix}-`) || code.startsWith(prefix))
}

function textIncludesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term.toLowerCase()))
}

function readTemplateId(fact: BuildingPatternExecutionFactInput) {
  return normalizeLower(
    fact.template_id
      ?? fact.source_template_id
      ?? readRecord(fact.generation_metadata).source_template_id
      ?? readRecord(fact.generation_metadata).template_id,
  )
}

function inferSystemKeyByStructuredFact(fact: BuildingPatternExecutionFactInput, text: string) {
  const standardCode = normalizeLower(fact.standard_work_code)
  const templateId = readTemplateId(fact)
  const featureProfile = mergeFeatureProfile(fact)
  const methodCodes = unique([
    ...readTextArrayFromRecord(featureProfile, ['methodVariantCode', 'method_variant_code', 'methodVariantCodes', 'method_variant_codes']),
  ]).map((item) => item.toLowerCase())
  const elementCodes = unique([
    ...readTextArrayFromRecord(featureProfile, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
  ]).map((item) => item.toLowerCase())

  const containsMethodOrElement = (terms: string[]) => (
    methodCodes.some((code) => terms.includes(code))
    || elementCodes.some((code) => terms.includes(code))
  )

  if (
    codeStartsWithAny(standardCode, ['CLN'])
    || templateId.includes('cleanroom')
    || templateId.includes('medical')
    || containsMethodOrElement(['medical_cleanroom_envelope', 'medical_gas_commissioning', 'cleanroom_validation'])
    || textIncludesAny(text, ['cleanroom', 'medical gas', '洁净', '医气', '医用气体', '手术室'])
  ) return 'system:medical_cleanroom'

  if (
    templateId.includes('data-center')
    || containsMethodOrElement(['data_center_room', 'idc_room'])
    || textIncludesAny(text, ['data center', 'idc', '数据中心', '机房'])
  ) return 'system:data_center'

  if (
    codeStartsWithAny(standardCode, ['FIR'])
    || templateId.includes('fire-system')
    || containsMethodOrElement(['fire_protection_system', 'fire_alarm', 'sprinkler_system', 'hydrant_system', 'smoke_control', 'gas_extinguishing'])
    || textIncludesAny(text, ['fire', 'sprinkler', 'hydrant', 'smoke control', '消防', '喷淋', '消火栓', '防排烟', '火灾报警'])
  ) return 'system:fire'

  if (
    codeStartsWithAny(standardCode, ['HVA', '06'])
    || templateId.includes('hvac')
    || containsMethodOrElement(['medical_hvac_balancing', 'cleanroom_hvac', 'hvac_system'])
    || textIncludesAny(text, ['hvac', 'ventilation', 'air conditioning', '暖通', '通风', '空调', '风管', '防排烟'])
  ) return 'system:hvac'

  if (
    codeStartsWithAny(standardCode, ['PLU', '05'])
    || templateId.includes('plumbing')
    || templateId.includes('heating')
    || textIncludesAny(text, ['plumbing', 'water supply', 'drainage', 'heating', '给排水', '给水', '排水', '采暖', '管道'])
  ) return 'system:plumbing_heating'

  if (
    codeStartsWithAny(standardCode, ['ELE', '07'])
    || templateId.includes('electrical')
    || textIncludesAny(text, ['electrical', 'power', 'lighting', '电气', '强电', '照明', '配电', '桥架'])
  ) return 'system:electrical'

  if (
    codeStartsWithAny(standardCode, ['INT', '08'])
    || templateId.includes('intelligent')
    || textIncludesAny(text, ['intelligent', 'weak current', 'security system', '智能化', '弱电', '安防', '门禁', '综合布线'])
  ) return 'system:intelligent'

  if (
    codeStartsWithAny(standardCode, ['10'])
    || templateId.includes('elevator')
    || textIncludesAny(text, ['elevator', 'lift', '电梯', '井道', '轿厢'])
  ) return 'system:elevator'

  return null
}

function inferWorkfaceKeyByStructuredFact(fact: BuildingPatternExecutionFactInput, text: string, systemKey: string | null) {
  const standardCode = normalizeLower(fact.standard_work_code)
  const templateId = readTemplateId(fact)
  const featureProfile = mergeFeatureProfile(fact)
  const featureProfileRecord = readRecord(featureProfile)
  const projectTypeCode = normalizeLower(featureProfile.projectTypeCode ?? featureProfileRecord.project_type_code ?? fact.project_type_code ?? fact.projectTypeCode)
  const structureTypeCode = normalizeLower(featureProfile.structureTypeCode ?? featureProfileRecord.structure_type_code ?? fact.structure_type_code ?? fact.structureTypeCode)
  const elementCodes = unique([
    ...readTextArrayFromRecord(featureProfile, ['elementVariantCode', 'element_variant_code', 'elementVariantCodes', 'element_variant_codes']),
  ]).map((item) => item.toLowerCase())

  if (codeStartsWithAny(standardCode, ['01']) || templateId.includes('foundation') || textIncludesAny(text, ['foundation', 'pile', 'excavation', 'basement', '基础', '桩', '基坑', '土方', '地下室'])) {
    return 'workface:foundation_section'
  }
  if (templateId.includes('steel-structure') || textIncludesAny(text, ['steel structure', 'steel bay', '钢结构', '钢梁', '钢柱', '网架'])) {
    return 'workface:steel_bay'
  }
  if (templateId.includes('facade') || textIncludesAny(text, ['facade', 'curtain wall', '幕墙', '外立面', '外墙'])) {
    return 'workface:facade_elevation_zone'
  }
  if (templateId.includes('outdoor') || templateId.includes('municipal') || codeStartsWithAny(standardCode, ['OUT', '11']) || textIncludesAny(text, ['outdoor', 'municipal', 'landscape', '室外', '市政', '道路', '园林', '景观', '绿化'])) {
    return 'workface:outdoor_zone'
  }
  if (templateId.includes('decoration') || codeStartsWithAny(standardCode, ['03']) || textIncludesAny(text, ['decoration', 'fitout', 'ceiling', 'tile', 'paint', '精装', '装修', '吊顶', '贴砖', '涂料', '腻子'])) {
    return 'workface:decoration_room_zone'
  }
  if (
    textIncludesAny(text, [
      'pc factory',
      'prefab factory',
      'first article review',
      'assembly rate',
      'precast logistics',
      'supplier score',
      'pc 工厂',
      'pc工厂',
      '首件评审',
      '装配率核定',
      '装配式深化设计',
      '构件物流',
      '厂家月度评分',
    ])
  ) {
    return 'workface:prefab_factory_coordination_zone'
  }
  if (templateId.includes('prefabricated') || templateId.includes('prefab') || structureTypeCode.includes('prefab') || textIncludesAny(text, ['prefabricated', 'precast', '装配式', '预制'])) {
    return 'workface:prefab_floor_zone'
  }
  if (templateId.includes('modular') || templateId.includes('mic') || textIncludesAny(text, ['mic', 'module', '模块'])) {
    return 'workface:mic_module_zone'
  }
  if (templateId.includes('hotel') || projectTypeCode.includes('hotel') || textIncludesAny(text, ['hotel', 'guestroom', '酒店', '客房'])) {
    return 'workface:hotel_room_public_zone'
  }
  if (templateId.includes('campus') || projectTypeCode.includes('school') || textIncludesAny(text, ['campus', 'school', 'teaching', '校园', '学校', '教学楼'])) {
    return 'workface:campus_function_zone'
  }
  if (templateId.includes('renovation') || templateId.includes('heritage') || textIncludesAny(text, ['renovation', 'retrofit', 'heritage', '改造', '文保', '保护'])) {
    return 'workface:renovation_protection_zone'
  }
  if (templateId.includes('tod') || textIncludesAny(text, ['tod', 'transfer deck', '盖板', '上盖'])) {
    return 'workface:tod_transfer_deck_zone'
  }
  if (systemKey === 'system:cleanroom' || projectTypeCode.includes('hospital') || elementCodes.includes('operating_room')) {
    return 'workface:medical_cleanroom_zone'
  }
  if (systemKey === 'system:data_center_room') return 'workface:data_center_room_zone'
  if (systemKey) return 'workface:mep_system_zone'
  if (codeStartsWithAny(standardCode, ['02']) || textIncludesAny(text, ['standard floor', '主体', '标准层', '钢筋', '模板', '混凝土', '砌筑'])) {
    return 'workface:standard_floor'
  }
  return null
}

function normalizeInferredSemanticKey(value: string | null, dimension: 'system' | 'workface') {
  if (!value) return null
  const entry = normalizeSpatialSemanticCode(value)
  if (!entry || entry.dimension !== dimension) return null
  return `${dimension}:${entry.code}`
}

function readExplicitDimension(fact: BuildingPatternExecutionFactInput, dimension: string) {
  const objects = readScopeObjects(fact)
  const dimensions = readScopeDimensionsRecord(fact)
  switch (dimension) {
    case 'building':
      return normalizeText(fact.building_object_id)
        || readSnapshotObjectId(objects, ['building'])
        || (hasSnapshotDimension(dimensions, ['building']) ? 'dimension:building' : '')
    case 'floor':
      return normalizeText(fact.floor_object_id)
        || normalizeText(fact.floor_sequence_label)
        || normalizeText(fact.floor_sequence_number)
        || readSnapshotObjectId(objects, ['floor'])
        || (hasSnapshotDimension(dimensions, ['floor']) ? 'dimension:floor' : '')
    case 'zone':
      return normalizeText(fact.physical_zone_object_id)
        || normalizeText(fact.functional_area_object_id)
        || readSnapshotObjectId(objects, ['physical_zone', 'functional_area', 'region'])
        || (hasSnapshotDimension(dimensions, ['physical_zone', 'functional_area', 'region']) ? 'dimension:zone' : '')
    case 'section':
      return normalizeText(fact.section_object_id)
        || readSnapshotObjectId(objects, ['section'])
        || (hasSnapshotDimension(dimensions, ['section']) ? 'dimension:section' : '')
    case 'system':
      return normalizeText(fact.system_object_id)
        || normalizeText(fact.functional_area_object_id)
        || readSnapshotObjectId(objects, ['system', 'functional_area'])
        || (hasSnapshotDimension(dimensions, ['functional_area', 'system']) ? 'dimension:system' : '')
    case 'workface':
      return normalizeText(fact.workface_object_id)
        || normalizeText(fact.engineering_object_id)
        || readSnapshotObjectId(objects, ['workface', 'main'])
        || (hasSnapshotDimension(dimensions, ['workface', 'main']) ? 'dimension:workface' : '')
    case 'factory_lot':
      return normalizeText(fact.factory_lot_object_id)
        || normalizeText(fact.factory_batch_object_id)
        || normalizeText(fact.factory_lot_label)
        || normalizeText(fact.production_lot_id)
        || readSnapshotObjectId(objects, ['factory_lot', 'factoryBatch', 'factory_batch', 'production_lot', 'lot'])
        || (hasSnapshotDimension(dimensions, ['factory_lot', 'factoryBatch', 'factory_batch', 'production_lot', 'lot']) ? 'dimension:factory_lot' : '')
    default:
      return ''
  }
}

function inferPhaseWindow(fact: BuildingPatternExecutionFactInput, dimensions: string[], text: string, systemKey: string | null, workfaceKey: string | null) {
  const observation = mergeBuildingPatternObservation(fact)
  const explicit = normalizeLower(fact.phaseWindow ?? fact.phase_window ?? observation.phaseWindow ?? observation.phase_window)
  if (explicit) return explicit
  const standardCode = normalizeLower(fact.standard_work_code)
  const normalized = text.toLowerCase()
  if (normalized.includes('opening') || normalized.includes('开业')) return 'opening'
  if (normalized.includes('handover') || normalized.includes('delivery') || normalized.includes('交付')) return 'handover'
  if (normalized.includes('trial operation') || normalized.includes('试运行')) return 'trial_operation'
  if (normalized.includes('factory') || normalized.includes('mic') || normalized.includes('模块')) return 'factory'
  if (normalized.includes('renovation') || normalized.includes('改造') || normalized.includes('文保')) return 'renovation'
  if (dimensions.includes('section') || workfaceKey === 'workface:foundation_section' || standardCode.startsWith('01')) return 'foundation'
  if (systemKey || /^0[5-8]/.test(standardCode) || normalized.includes('mep') || normalized.includes('commission') || normalized.includes('调试')) return 'mep'
  if (workfaceKey === 'workface:outdoor_zone') return 'outdoor'
  if (workfaceKey === 'workface:decoration_room_zone') return 'decoration'
  if (dimensions.includes('floor') || workfaceKey === 'workface:standard_floor' || standardCode.startsWith('02')) return 'superstructure'
  return null
}

function inferPrimaryWorkfaceType(fact: BuildingPatternExecutionFactInput, dimensions: string[], phaseWindow: string | null, text: string, workfaceKey: string | null) {
  const observation = mergeBuildingPatternObservation(fact)
  const explicit = normalizeLower(fact.primaryWorkfaceType ?? fact.primary_workface_type ?? observation.primaryWorkfaceType ?? observation.primary_workface_type)
  if (explicit) return explicit
  if (workfaceKey?.startsWith('workface:')) return workfaceKey.slice('workface:'.length)
  const normalized = text.toLowerCase()
  if (phaseWindow === 'foundation') return 'foundation_section'
  if (phaseWindow === 'opening') return 'public_system_zone'
  if (phaseWindow === 'trial_operation') return 'hotel_room_public_zone'
  if (phaseWindow === 'factory') return 'mic_module_zone'
  if (phaseWindow === 'renovation') return 'renovation_protection_zone'
  if (normalized.includes('data center') || normalized.includes('idc') || normalized.includes('数据中心')) return 'data_center_room_zone'
  if (normalized.includes('hospital') || normalized.includes('medical') || normalized.includes('医院')) return 'medical_cleanroom_zone'
  if (phaseWindow === 'mep') return 'mep_system_zone'
  if (phaseWindow === 'outdoor') return 'outdoor_zone'
  if (phaseWindow === 'decoration') return 'decoration_room_zone'
  if (dimensions.includes('floor')) return 'standard_floor'
  if (dimensions.includes('building')) return 'building_zone'
  return null
}

function inferExpansionStrategy(fact: BuildingPatternExecutionFactInput, dimensions: string[], systemKey: string | null, workfaceKey: string | null) {
  const observation = mergeBuildingPatternObservation(fact)
  const explicit = normalizeLower(fact.expansionStrategy ?? fact.expansion_strategy ?? observation.expansionStrategy ?? observation.expansion_strategy)
  if (explicit) return explicit
  if (dimensions.includes('factory_lot') || workfaceKey === 'workface:mic_module_zone' || workfaceKey === 'workface:prefab_factory_coordination_zone') return 'factory_lot_ordered'
  if (dimensions.includes('section')) return 'section_ordered'
  if (dimensions.includes('system') || systemKey) return 'system_zone'
  if (dimensions.includes('floor')) return 'floor_ordered'
  if (dimensions.includes('zone')) return 'zone_ordered'
  if (dimensions.includes('building')) return 'building'
  if (dimensions.includes('workface') || workfaceKey) return 'workface_ordered'
  return null
}

export function inferConstructionScopeFromFact(fact: BuildingPatternExecutionFactInput): ConstructionScopeInference {
  const text = compactFactText(fact)
  const normalizedText = text.toLowerCase()
  const systemKey = normalizeInferredSemanticKey(
    inferSystemKeyByStructuredFact(fact, normalizedText),
    'system',
  )
  const workfaceKey = normalizeInferredSemanticKey(
    inferWorkfaceKeyByStructuredFact(fact, normalizedText, systemKey),
    'workface',
  )
  const scopeDimensions = unique([
    readExplicitDimension(fact, 'building') ? 'building' : null,
    readExplicitDimension(fact, 'floor') ? 'floor' : null,
    readExplicitDimension(fact, 'zone') ? 'zone' : null,
    readExplicitDimension(fact, 'section') ? 'section' : null,
    readExplicitDimension(fact, 'system') || systemKey ? 'system' : null,
    readExplicitDimension(fact, 'workface') || workfaceKey ? 'workface' : null,
    readExplicitDimension(fact, 'factory_lot') ? 'factory_lot' : null,
  ])
  const phaseWindow = inferPhaseWindow(fact, scopeDimensions, text, systemKey, workfaceKey)
  const primaryWorkfaceType = inferPrimaryWorkfaceType(fact, scopeDimensions, phaseWindow, text, workfaceKey)
  const expansionStrategy = inferExpansionStrategy(fact, scopeDimensions, systemKey, workfaceKey)
  const rhythmDrivers = unique([
    scopeDimensions.includes('floor') ? 'floor_count' : null,
    scopeDimensions.includes('building') ? 'building_count' : null,
    scopeDimensions.includes('zone') ? 'zone_count' : null,
    scopeDimensions.includes('section') ? 'section_count' : null,
    scopeDimensions.includes('system') ? 'system_count' : null,
    scopeDimensions.includes('workface') ? 'workface_count' : null,
    scopeDimensions.includes('factory_lot') ? 'factory_lot_count' : null,
  ])
  return {
    systemKey,
    workfaceKey,
    scopeDimensions,
    rhythmDrivers,
    phaseWindow,
    primaryWorkfaceType,
    expansionStrategy,
  }
}

export function readConstructionDimensionValue(fact: BuildingPatternExecutionFactInput, unit: string) {
  if (unit === 'project') return normalizeText(fact.project_id) || 'project'
  const explicit = readExplicitDimension(fact, unit)
  if (explicit && !explicit.startsWith('dimension:')) return explicit
  const inference = inferConstructionScopeFromFact(fact)
  if (unit === 'system') return inference.systemKey ?? explicit
  if (unit === 'workface') return inference.workfaceKey ?? explicit
  if (unit === 'factory_lot') return explicit || inference.workfaceKey || ''
  return explicit
}

export function buildConstructionSeedScopeContext(
  fact: BuildingPatternExecutionFactInput,
  baseContext: AlgorithmSeedResolveContext = {},
): Pick<AlgorithmSeedResolveContext, 'scopeDimensions' | 'rhythmDrivers' | 'primaryWorkfaceType' | 'phaseWindow' | 'expansionStrategy'> {
  const inference = inferConstructionScopeFromFact(fact)
  return {
    scopeDimensions: unique([
      ...readArray(baseContext.scopeDimensions).map(normalizeText),
      ...inference.scopeDimensions,
    ]),
    rhythmDrivers: unique([
      ...readArray(baseContext.rhythmDrivers).map(normalizeText),
      ...inference.rhythmDrivers,
    ]),
    primaryWorkfaceType: normalizeText(baseContext.primaryWorkfaceType) || inference.primaryWorkfaceType,
    phaseWindow: normalizeText(baseContext.phaseWindow) || inference.phaseWindow,
    expansionStrategy: normalizeText(baseContext.expansionStrategy) || inference.expansionStrategy,
  }
}
