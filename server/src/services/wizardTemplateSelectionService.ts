import { CHINA_GB55032_TEMPLATE_CATALOG, flattenChinaTemplateCatalog } from '../seeds/chinaGb50300TemplateCatalog.js'
import { DOMAIN_WBS_TEMPLATE_CATALOGS } from '../seeds/domainWbsTemplateCatalogs.js'
import {
  CHINA_GB55032_TEMPLATE_ID,
} from './wbsTemplateGenerationService.js'
import {
  type TemplateRecommendation,
} from './projectFactsToTemplateService.js'

export type WizardTemplateSelection = {
  templateIds: string[]
  selectedNodesByTemplate: Record<string, string[]>
}

const BUILT_IN_WIZARD_TEMPLATE_IDS = new Set([
  CHINA_GB55032_TEMPLATE_ID,
  CHINA_GB55032_TEMPLATE_CATALOG.templateId,
  ...DOMAIN_WBS_TEMPLATE_CATALOGS.map((catalog) => catalog.templateId),
].map((templateId) => templateId.toLowerCase()))

const WIZARD_TEMPLATE_ALIAS_BY_CODE: Record<string, string> = {
  civil_defense_specialty: 'china-civil-defense-specialty',
  building_fine_detail: 'china-building-fine-detail',
  facade: 'china-facade-curtain-wall',
  plumbing_addon: 'china-plumbing-heating-system',
  plumbing_gas: 'china-plumbing-heating-system',
}

const DEFAULT_MASTER_PLAN_CORE_NODE_CODES = [
  '01-02',
  '01-03',
  '01-05',
  '01-07',
  '02-01',
  '02-02',
  '03-01',
  '03-02',
  '03-04',
  '03-09',
  '03-10',
  '04-03',
  '05-01',
  '05-02',
  '06-03',
  '06-05',
  '07-02',
  '07-03',
  '07-05',
  '08-05',
  '08-14',
  '08-15',
  '09-01',
  '10-01',
]

const FOUNDATION_TEMPLATE_ID = 'china-foundation-pit-pile'
const PROJECT_MILESTONE_TEMPLATE_ID = 'china-project-milestone-handover'
const FOUNDATION_METHOD_ITEM_PACKS: Record<string, string[]> = {
  bored_pile: ['FND-01-01-01', 'FND-01-01-03', 'FND-03-01-02'],
  precast_pile: ['FND-03-01-03'],
  cfg_pile: ['FND-03-01-04'],
  diaphragm_wall: ['FND-04-01-03', 'FND-04-01-04', 'FND-04-01-05', 'FND-04-01-06'],
  smw_pile: ['FND-04-01-01'],
  trd_wall: ['FND-04-01-02'],
  soil_nailing: ['FND-04-01-12'],
  anchor_support: ['FND-04-01-11'],
  dewatering_well: ['FND-05-01-01', 'FND-06-01-01'],
}
const FOUNDATION_METHOD_ITEM_PACK_CODE_SET = new Set([
  ...Object.values(FOUNDATION_METHOD_ITEM_PACKS).flat(),
  'FND-03-01-01',
  'FND-03-01-05',
  'FND-03-01-06',
  'FND-04-01-07',
  'FND-04-01-08',
  'FND-04-01-09',
  'FND-04-01-10',
  'FND-04-01-13',
  'FND-04-01-14',
  'FND-04-01-15',
  'FND-04-01-16',
])

const WIZARD_TEMPLATE_ID_BY_STABLE_PREFIX = new Map<string, string>()
const WIZARD_TEMPLATE_ID_BY_STABLE_CODE = new Map<string, string>()
const WIZARD_STABLE_CODES_BY_TEMPLATE_ID = new Map<string, Set<string>>()

const CAMPUS_BUSINESS_TYPES = new Set(['school', 'campus', 'university'])
const HOTEL_BUSINESS_TYPES = new Set(['hotel', 'luxury_hotel', 'chain_hotel', 'hotel_complex'])
const DATA_CENTER_BUSINESS_TYPES = new Set(['data_center', 'idc'])

const MASTER_CONTROL_ADDITIONAL_ITEM_PACK_CODES_BY_BUSINESS_TYPE: Record<string, string[]> = {
  school: [
    'CMP-02-01-03',
    'CMP-03-01-01',
    'CMP-04-01-01',
  ],
  hospital: [
    'CLN-03-01-01',
    'CLN-03-01-02',
    'FIR-01-01-01',
    'FIR-01-01-02',
    'FIR-03-01-01',
    'FIR-03-02-01',
    'FIR-05-01-02',
    'FIR-07-01-01',
    'HVA-01-01-01',
    'HVA-01-01-02',
    'HVA-02-01-01',
    'HVA-02-01-02',
    'PLU-01-01-01',
    'PLU-01-01-02',
    'PLU-01-02-01',
    'PLU-02-01-02',
    'PLU-03-01-01',
    'ELE-01-01-01',
    'ELE-01-01-02',
    'ELE-01-01-03',
    'ELE-02-01-01',
    'ELE-04-01-01',
    'INT-01-01-01',
    'INT-01-01-02',
    'INT-02-01-01',
    'INT-02-01-02',
    'ELV-01-01-01',
    'ELV-02-01-01',
    'ELV-02-01-02',
  ],
  tod_upper_cover: [
    'TOD-01-01-01',
    'TOD-02-01-01',
    'TOD-02-01-02',
    'TOD-03-01-01',
    'TOD-03-01-02',
    'TOD-03-01-03',
    'TOD-04-01-02',
    'TOD-04-01-03',
    'TOD-04-01-04',
    'TOD-04-01-05',
    'TOD-04-01-06',
    'TOD-04-01-07',
    'TOD-04-01-09',
    'TOD-04-01-10',
    'TOD-04-01-11',
    'TOD-04-01-12',
    'TOD-04-01-13',
    'TOD-04-01-14',
    'TOD-04-01-15',
    'TOD-04-01-16',
    'TOD-04-01-17',
    'TOD-04-01-19',
    'TOD-04-01-20',
    'TOD-04-01-23',
  ],
  modular_building: [
    'MIC-01-01-01',
    'MIC-01-01-02',
    'MIC-02-01-01',
    'MIC-02-01-02',
    'MIC-02-01-03',
    'MIC-03-01-01',
    'MIC-03-01-02',
    'MIC-04-01-01',
    'MIC-04-01-02',
    'MIC-05-01-01',
    'MIC-05-01-02',
    'MIC-06-01-02',
    'MIC-06-01-03',
    'MIC-06-01-04',
    'MIC-06-01-05',
    'MIC-06-01-06',
    'MIC-06-01-07',
    'MIC-06-01-08',
    'MIC-06-01-09',
    'MIC-06-01-10',
    'MIC-06-01-11',
    'MIC-06-01-12',
    'MIC-06-01-13',
    'MIC-06-01-14',
    'MIC-06-01-15',
    'MIC-06-01-16',
    'MIC-06-01-17',
    'MIC-06-01-18',
    'MIC-06-01-19',
    'MIC-06-01-20',
    'MIC-06-01-22',
  ],
  renovation: [
    'RNV-01-01-01',
    'RNV-01-01-02',
    'RNV-02-01-02',
    'RNV-02-01-03',
    'RNV-02-02-01',
    'RNV-02-02-02',
    'RNV-04-01-01',
    'RNV-04-01-02',
    'RNV-04-01-03',
    'RNV-04-01-04',
    'RNV-04-01-05',
    'RNV-04-01-06',
    'RNV-04-01-07',
    'RNV-04-01-08',
    'RNV-04-01-09',
    'RNV-04-01-10',
    'RNV-04-01-11',
    'RNV-04-01-12',
    'RNV-04-01-13',
    'RNV-04-01-14',
    'RNV-04-01-15',
    'RNV-04-01-16',
    'RNV-04-01-17',
    'RNV-04-01-18',
    'RNV-04-01-19',
    'RNV-04-01-20',
    'RNV-04-01-21',
    'RNV-04-01-22',
    'RNV-04-01-23',
    'RNV-04-01-24',
    'RNV-04-01-27',
    'RNV-04-01-28',
    'FIR-01-01-01',
    'FIR-03-02-01',
    'FIR-05-01-02',
    'ELE-01-01-01',
    'ELE-01-01-02',
    'ELE-02-01-01',
    'PLU-01-01-01',
    'PLU-01-01-02',
  ],
  hotel: [
    'HTL-01-01-01',
    'HTL-01-01-02',
    'HTL-01-01-03',
    'HTL-02-01-01',
    'HTL-02-01-02',
    'HTL-03-01-01',
    'HTL-03-01-02',
    'HTL-04-01-02',
    'HTL-05-01-01',
    'HTL-05-01-02',
    'FIR-01-01-01',
    'FIR-01-01-02',
    'FIR-07-01-01',
    'FIR-03-01-01',
    'FIR-03-02-01',
    'FIR-05-01-02',
    'HVA-01-01-01',
    'HVA-01-01-02',
    'HVA-02-01-01',
    'HVA-02-01-02',
    'PLU-01-01-01',
    'PLU-01-01-02',
    'PLU-01-02-01',
    'PLU-02-01-02',
    'PLU-03-01-01',
    'ELE-01-01-01',
    'ELE-01-01-02',
    'ELE-01-01-03',
    'ELE-02-01-01',
    'ELE-04-01-01',
    'INT-01-01-01',
    'INT-01-01-02',
    'INT-02-01-01',
    'INT-02-01-02',
    'ELV-01-01-01',
    'ELV-02-01-01',
    'ELV-02-01-02',
  ],
  industrial: [
    'IPL-01-01-01',
    'IPL-01-01-02',
    'IPL-02-01-01',
    'IPL-02-01-02',
    'IPL-03-01-01',
    'IPL-03-01-02',
    'IPL-04-01-01',
    'IPL-04-01-02',
  ],
  transportation_hub: [
    'TRH-01-01-01',
    'TRH-01-01-02',
    'TRH-02-01-01',
    'TRH-02-01-02',
    'TRH-02-01-03',
    'TRH-03-01-01',
    'TRH-03-01-02',
    'TRH-03-01-03',
  ],
  sports_culture: [
    'SPC-01-01-01',
    'SPC-01-01-02',
    'SPC-02-01-01',
    'SPC-02-01-02',
    'SPC-03-01-01',
    'SPC-03-01-02',
    'SPC-04-01-01',
    'SPC-04-01-02',
  ],
}

const MASTER_CONTROL_ITEM_PACK_CODES_BY_ORGANIZATION_VARIANT: Record<string, string[]> = {
  general_civil_office_commercial: [
    'FAC-01-01-01',
    'FAC-01-01-04',
    'FAC-02-01-01',
    'FAC-02-01-02',
    'FAC-02-01-03',
    'FAC-02-01-04',
    'FAC-04-01-01',
    'FAC-04-01-02',
    'FAC-04-01-04',
    'DEC-05-01-01',
    'DEC-06-01-01',
    'INT-01-01-01',
    'INT-02-01-01',
    'INT-02-01-02',
    'INT-02-01-04',
    'ELV-01-01-01',
    'ELV-01-01-02',
    'ELV-02-01-01',
    'ELV-02-01-02',
    'ELV-02-01-04',
    'ELV-03-01-01',
    'ELV-03-01-02',
    'ELE-06-01-01',
    'OUT-03-03-01',
  ],
  general_civil_mixed_use_complex: [
    'FAC-01-01-01',
    'FAC-01-01-04',
    'FAC-02-01-01',
    'FAC-02-01-02',
    'FAC-02-01-03',
    'FAC-02-01-04',
    'FAC-04-01-01',
    'FAC-04-01-02',
    'FAC-04-01-04',
    'DEC-05-01-01',
    'DEC-06-01-01',
    'INT-01-01-01',
    'INT-02-01-01',
    'INT-02-01-02',
    'INT-02-01-04',
    'ELV-01-01-01',
    'ELV-01-01-02',
    'ELV-02-01-01',
    'ELV-02-01-02',
    'ELV-02-01-04',
    'ELV-03-01-01',
    'ELV-03-01-02',
    'ELE-06-01-01',
    'OUT-03-03-01',
    'OUT-05-01-01',
    'WPI-01-01-02',
    'WPI-02-01-02',
    'WPI-02-01-03',
  ],
  renovation_seismic_reinforcement: [
    'RNV-02-01-01',
    'RNV-04-01-25',
    'MS-01-01-60',
  ],
  renovation_energy_retrofit: [
    'RNV-04-01-14',
    'RNV-04-01-15',
    'RNV-04-01-26',
    'FAC-03-01-01',
    'FAC-03-01-02',
    'WPI-01-01-02',
    'WPI-02-01-02',
    'WPI-02-01-03',
    'WPI-02-01-04',
    'WPI-02-01-05',
    'WPI-02-01-06',
    'ELE-03-01-01',
    'ELE-03-01-02',
    'MS-01-01-63',
  ],
  renovation_heritage_conservation: [
    'HRT-01-01-01',
    'HRT-01-01-02',
    'HRT-02-01-01',
    'HRT-02-01-02',
    'HRT-02-02-01',
    'HRT-02-02-02',
    'HRT-03-01-01',
    'HRT-03-01-02',
    'MS-01-01-61',
  ],
  industrial_general_manufacturing: ['IPL-05-04-01', 'IPL-05-04-02'],
  industrial_logistics_automation: ['IPL-05-01-01', 'IPL-05-01-02', 'IPL-05-04-01', 'IPL-05-04-02'],
  industrial_process_validation: ['IPL-05-02-01', 'IPL-05-02-02', 'IPL-05-04-01', 'IPL-05-04-02'],
  industrial_heavy_equipment: ['IPL-05-03-01', 'IPL-05-03-02', 'IPL-05-04-01', 'IPL-05-04-02'],
  transportation_multimodal_hub: ['TRH-04-04-01', 'TRH-04-04-02'],
  transportation_rail_station: ['TRH-04-01-01', 'TRH-04-01-02', 'TRH-04-04-01', 'TRH-04-04-02'],
  transportation_metro_interchange: ['TRH-04-02-01', 'TRH-04-02-02', 'TRH-04-04-01', 'TRH-04-04-02'],
  transportation_bus_terminal: ['TRH-04-03-01', 'TRH-04-03-02', 'TRH-04-04-01', 'TRH-04-04-02'],
  sports_culture_stadium: ['SPC-05-04-01', 'SPC-05-04-02'],
  sports_culture_indoor_arena: ['SPC-05-01-01', 'SPC-05-01-02', 'SPC-05-04-01', 'SPC-05-04-02'],
  sports_culture_theater: ['SPC-05-02-01', 'SPC-05-02-02', 'SPC-05-04-01', 'SPC-05-04-02'],
  sports_culture_exhibition: ['SPC-05-03-01', 'SPC-05-03-02', 'SPC-05-04-01', 'SPC-05-04-02'],
}

const WIZARD_MILESTONE_CODES_BY_SEMANTIC_CODE: Record<string, string[]> = {
  aviation_suitability_acceptance: ['MS-01-01-31'],
  biosafety_acceptance: ['MS-01-01-30'],
  canopy_corridor_handover: ['MS-01-01-15'],
  civil_defense_acceptance: ['MS-01-01-10'],
  completion_acceptance: ['MS-01-01-11'],
  dq: ['MS-01-01-39'],
  energy_saving_acceptance: ['MS-01-01-10'],
  foundation_acceptance: ['MS-01-01-06'],
  health_supervision_acceptance: ['MS-01-01-28'],
  heritage_acceptance: ['MS-01-01-61'],
  integral_lifting_acceptance: ['MS-01-01-51'],
  iq: ['MS-01-01-41'],
  isolation_acceptance: ['MS-01-01-75'],
  mechanical_floor_system_handover: ['MS-01-01-08', 'MS-01-01-16'],
  medical_gas_acceptance: ['MS-01-01-27'],
  mep_transfer_ready: ['MS-01-01-08'],
  mezzanine_structure_handover: ['MS-01-01-07'],
  metro_operator_acceptance: ['MS-01-01-77'],
  noise_acceptance: ['MS-01-01-76'],
  oq: ['MS-01-01-42'],
  pile_foundation_acceptance: ['MS-01-01-102'],
  podium_roof_interface_handover: ['MS-01-01-15'],
  pq: ['MS-01-01-43'],
  prefab_rate_acceptance: ['MS-01-01-24'],
  production_validation: ['MS-01-01-44'],
  refuge_floor_fire_life_safety_acceptance: ['MS-01-01-17', 'MS-FIRE-ACCEPTANCE'],
  roof_waterproof_lightning_acceptance: ['MS-01-01-10'],
  seismic_retrofit_acceptance: ['MS-01-01-60'],
  tccf: ['MS-01-01-33'],
  tcdd: ['MS-01-01-32'],
  tcos: ['MS-01-01-38'],
  transfer_floor_structural_acceptance: ['MS-01-01-07'],
  trial_opening: ['MS-01-01-94'],
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function registerWizardCatalogStablePrefixes(templateId: string, nodes: Parameters<typeof flattenChinaTemplateCatalog>[0]) {
  const flattenedNodes = flattenChinaTemplateCatalog(nodes)
  const normalizedTemplateId = normalizeText(templateId).toLowerCase()
  const firstNode = flattenedNodes[0]
  const prefix = normalizeText(firstNode?.stableCode).split('-')[0]?.toLowerCase()
  if (prefix) WIZARD_TEMPLATE_ID_BY_STABLE_PREFIX.set(prefix, templateId)
  const stableCodes = WIZARD_STABLE_CODES_BY_TEMPLATE_ID.get(normalizedTemplateId) ?? new Set<string>()
  for (const node of flattenedNodes) {
    const stableCode = normalizeText(node.stableCode).toLowerCase()
    if (stableCode) {
      WIZARD_TEMPLATE_ID_BY_STABLE_CODE.set(stableCode, templateId)
      stableCodes.add(stableCode)
    }
  }
  if (normalizedTemplateId) WIZARD_STABLE_CODES_BY_TEMPLATE_ID.set(normalizedTemplateId, stableCodes)
}

registerWizardCatalogStablePrefixes(CHINA_GB55032_TEMPLATE_ID, CHINA_GB55032_TEMPLATE_CATALOG.divisions)
for (const catalog of DOMAIN_WBS_TEMPLATE_CATALOGS) {
  registerWizardCatalogStablePrefixes(catalog.templateId, catalog.divisions)
}

function resolveWizardTemplateIdForCode(code: string): string | null {
  const normalized = normalizeText(code)
  const lower = normalized.toLowerCase()
  if (!lower) return null
  if (BUILT_IN_WIZARD_TEMPLATE_IDS.has(lower)) return lower
  if (WIZARD_TEMPLATE_ALIAS_BY_CODE[lower]) return WIZARD_TEMPLATE_ALIAS_BY_CODE[lower]
  if (WIZARD_TEMPLATE_ID_BY_STABLE_CODE.has(lower)) return WIZARD_TEMPLATE_ID_BY_STABLE_CODE.get(lower) ?? null
  const prefix = lower.split('-')[0] ?? ''
  if (prefix === 'danger') return 'china-dangerous-subproject-control'
  return WIZARD_TEMPLATE_ID_BY_STABLE_PREFIX.get(prefix) ?? null
}

function isWizardCatalogTemplateCode(code: string) {
  return BUILT_IN_WIZARD_TEMPLATE_IDS.has(normalizeText(code).toLowerCase())
}

function recommendationBusinessType(recommendation: TemplateRecommendation) {
  return normalizeText(recommendation.businessType).toLowerCase()
}

function recommendationTriggersAnyItemPack(recommendation: TemplateRecommendation, patterns: string[]) {
  const normalizedPatterns = patterns.map((pattern) => pattern.toLowerCase())
  return recommendation.triggeredItemPacks.some((itemPack) => {
    const normalized = normalizeText(itemPack).toLowerCase()
    return normalizedPatterns.some((pattern) => normalized === pattern || normalized.startsWith(pattern))
  })
}

function resolveContextualWizardMilestoneCodes(
  semanticCode: string,
  recommendation: TemplateRecommendation,
) {
  const businessType = recommendationBusinessType(recommendation)
  if (semanticCode === 'opening_readiness') {
    if (CAMPUS_BUSINESS_TYPES.has(businessType)) return ['MS-01-01-71']
    if (HOTEL_BUSINESS_TYPES.has(businessType)) return ['MS-01-01-95']
    return ['MS-OCCUPANCY-USE']
  }
  if (semanticCode === 'food_safety_acceptance') {
    if (CAMPUS_BUSINESS_TYPES.has(businessType)) return ['MS-01-01-66']
    return ['MS-01-01-91']
  }
  if (semanticCode === 'biosafety_acceptance') {
    if (CAMPUS_BUSINESS_TYPES.has(businessType)) return ['MS-01-01-68']
    return ['MS-01-01-30']
  }
  if (semanticCode === 'classified_protection_level_3') {
    if (CAMPUS_BUSINESS_TYPES.has(businessType)) return ['MS-01-01-70']
    if (HOTEL_BUSINESS_TYPES.has(businessType)) return ['MS-01-01-96']
    if (DATA_CENTER_BUSINESS_TYPES.has(businessType)) return ['MS-01-01-36']
    return ['MS-01-01-36']
  }
  if (semanticCode === 'monitoring_commissioning') {
    const codes = new Set<string>()
    if (recommendationTriggersAnyItemPack(recommendation, ['FND-06'])) codes.add('MS-01-01-100')
    if (recommendationTriggersAnyItemPack(recommendation, ['STL-04-01-27'])) codes.add('MS-01-01-53')
    if (codes.size === 0) {
      codes.add('MS-01-01-100')
      codes.add('MS-01-01-53')
    }
    return [...codes]
  }
  if (semanticCode === 'owner_handover') return ['MS-01-01-11', 'MS-01-01-12']
  return WIZARD_MILESTONE_CODES_BY_SEMANTIC_CODE[semanticCode] ?? []
}

function resolveWizardMilestoneCodes(
  code: unknown,
  recommendation: TemplateRecommendation,
) {
  const normalized = normalizeText(code)
  const lower = normalized.toLowerCase()
  if (!lower) return []
  const directTemplateId = resolveWizardTemplateIdForCode(normalized)
  if (directTemplateId === PROJECT_MILESTONE_TEMPLATE_ID) return [normalized]
  return resolveContextualWizardMilestoneCodes(lower, recommendation)
}

export function findWizardStableCodeMatchingTemplateId(
  triggeredKeys: string[],
  pattern: unknown,
  matches: (stableCode: string, pattern: string) => boolean,
) {
  const normalizedPattern = normalizeText(pattern)
  if (!normalizedPattern) return null
  for (const key of triggeredKeys) {
    const normalizedTemplateId = normalizeText(key).toLowerCase()
    const stableCodes = WIZARD_STABLE_CODES_BY_TEMPLATE_ID.get(normalizedTemplateId)
    if (!stableCodes) continue
    for (const stableCode of stableCodes) {
      if (matches(stableCode, normalizedPattern)) return normalizedTemplateId
    }
  }
  return null
}

export function buildWizardTemplateSelection(recommendation: TemplateRecommendation): WizardTemplateSelection {
  const templateIds = new Set<string>([CHINA_GB55032_TEMPLATE_ID])
  const selectedNodes = new Map<string, Set<string>>([
    [CHINA_GB55032_TEMPLATE_ID.toLowerCase(), new Set(DEFAULT_MASTER_PLAN_CORE_NODE_CODES)],
  ])
  const addTemplateId = (templateId: string | null | undefined) => {
    const lower = normalizeText(templateId).toLowerCase()
    if (lower && BUILT_IN_WIZARD_TEMPLATE_IDS.has(lower)) templateIds.add(lower)
  }
  const addSelectedNode = (templateId: string, stableCode: string) => {
    addTemplateId(templateId)
    const lowerTemplateId = normalizeText(templateId).toLowerCase()
    const normalizedStableCode = normalizeText(stableCode)
    if (!lowerTemplateId || !normalizedStableCode) return
    const bucket = selectedNodes.get(lowerTemplateId) ?? new Set<string>()
    bucket.add(normalizedStableCode)
    selectedNodes.set(lowerTemplateId, bucket)
  }
  const selectedFoundationCodes = new Set(
    (recommendation.foundationMethodCandidates ?? [])
      .filter((candidate) => candidate.selected)
      .map((candidate) => normalizeText(candidate.code))
      .filter(Boolean),
  )
  const addSelectedFoundationNodes = () => {
    for (const code of selectedFoundationCodes) {
      for (const itemPack of FOUNDATION_METHOD_ITEM_PACKS[code] ?? []) {
        addSelectedNode(FOUNDATION_TEMPLATE_ID, itemPack)
      }
    }
  }
  const addSelectedMilestoneNodes = () => {
    for (const rawCode of recommendation.triggeredMilestones) {
      for (const milestoneCode of resolveWizardMilestoneCodes(rawCode, recommendation)) {
        addSelectedNode(PROJECT_MILESTONE_TEMPLATE_ID, milestoneCode)
      }
    }
  }
  const addBusinessTypeMasterControlAssetNodes = () => {
    if (recommendation.defaultPlanOutput !== 'master_plan') return
    const businessType = recommendationBusinessType(recommendation)
    const stableCodes = [
      ...(MASTER_CONTROL_ADDITIONAL_ITEM_PACK_CODES_BY_BUSINESS_TYPE[businessType] ?? []),
      ...(MASTER_CONTROL_ITEM_PACK_CODES_BY_ORGANIZATION_VARIANT[
        normalizeText(recommendation.projectOrganizationVariantCode).toLowerCase()
      ] ?? []),
    ]
    for (const stableCode of stableCodes) {
      const templateId = resolveWizardTemplateIdForCode(stableCode)
      if (templateId) addSelectedNode(templateId, stableCode)
    }
  }

  for (const rawCode of [
    ...recommendation.triggeredItemPacks,
    ...recommendation.triggeredDangerItems,
  ]) {
    const code = normalizeText(rawCode)
    const templateId = resolveWizardTemplateIdForCode(code)
    if (!templateId) continue
    if (isWizardCatalogTemplateCode(code)) {
      addTemplateId(templateId)
      continue
    } else if (WIZARD_TEMPLATE_ID_BY_STABLE_CODE.has(code.toLowerCase())) {
      if (templateId === FOUNDATION_TEMPLATE_ID && FOUNDATION_METHOD_ITEM_PACK_CODE_SET.has(code)) continue
      addSelectedNode(templateId, code)
    } else {
      addTemplateId(templateId)
    }
  }
  addSelectedFoundationNodes()
  addSelectedMilestoneNodes()
  addBusinessTypeMasterControlAssetNodes()

  return {
    templateIds: [...templateIds],
    selectedNodesByTemplate: Object.fromEntries(
      [...selectedNodes.entries()].map(([templateId, codes]) => [templateId, [...codes]]),
    ),
  }
}
