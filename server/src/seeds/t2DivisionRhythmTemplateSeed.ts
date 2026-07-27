import {
  BUSINESS_TYPE_RECOMMENDATIONS,
  type BusinessTypeCode,
} from '../services/projectTypeRecommendations.js'

export type T2DivisionFamily =
  | 'foundation_and_basement'
  | 'superstructure'
  | 'envelope_facade_roof'
  | 'mep_systems'
  | 'decoration_fitout'
  | 'outdoor_municipal_landscape'
  | 'commissioning_handover'
  | 'specialty_business_systems'

export type T2RhythmWorkfaceUnit =
  | 'building'
  | 'floor'
  | 'zone'
  | 'section'
  | 'system'
  | 'workface'
  | 'factory_lot'
  | 'room'
  | 'bay'

export type T2RhythmChildWindow = {
  windowCode: string
  label: string
  startDay: number
  endDay: number
  durationDays: number
  role: string
  source: 't2_division_rhythm_template_seed'
  durationBearing: boolean
}

export type T2RhythmDependencyEdge = {
  edgeCode: string
  predecessorWindowCode: string
  successorWindowCode: string
  relation: 'FS' | 'SS' | 'FF'
  lagDays: number
  mandatory: boolean
  edgeType: 'rhythm_sequence' | 'handover_gate' | 'readiness_gate' | 'quality_gate'
}

export type T2RhythmHardGate = {
  gateCode: string
  label: string
  gateType: 'readiness' | 'quality' | 'acceptance' | 'resource' | 'handover'
  blocksAutomaticMaterialization: true
}

export type T2DivisionRhythmTemplate = {
  templateId: string
  templateName: string
  tier: 'T2'
  sourceType: 'system_standard_library'
  sourceVersion: string
  sourceRefs: string[]
  reuseScope: 'industry' | 'company' | 'project'
  maturity: 'seeded_cold_start'
  confidence: 'high' | 'medium' | 'low'
  applicability: {
    businessTypeCodes: string[]
    phaseWindows: string[]
    divisionFamilies: T2DivisionFamily[]
    subdivisionFamilies: string[]
    methodVariantCodes: string[]
    structureTypeCodes: string[]
    requiredScopeDimensions: T2RhythmWorkfaceUnit[]
  }
  rhythm: {
    parentWindowDays: {
      p20: number
      p50: number
      p80: number
    }
    workfaceUnit: T2RhythmWorkfaceUnit
    overlapPolicy: 'sequential_with_controlled_overlap' | 'parallel_lanes_with_handover_gates' | 'system_zone_commissioning'
    childWindows: T2RhythmChildWindow[]
  }
  productionFeasibility: {
    calendarBasis: 'working_day'
    workfaceUnit: T2RhythmWorkfaceUnit
    minimumParallelWorkfaces: number
    recommendedCrewStreams: number
    resourceReadinessSignals: string[]
    calendarConstraintSignals: string[]
    capacityRiskTags: string[]
  }
  hardGates: T2RhythmHardGate[]
  dependencyEdges: T2RhythmDependencyEdge[]
  compatibility: {
    requiredFacts: string[]
    optionalFacts: string[]
    compatibleOrganizationAssumptions: string[]
    incompatibleAssumptions: string[]
    allowedWorkfaceUnits: T2RhythmWorkfaceUnit[]
  }
  calibration: {
    requiredActualSignals: string[]
    replayMetrics: string[]
    minimumSamplePolicy: string
  }
  scheduleTrust: {
    scheduleSemantics: {
      criticalPathRoles: string[]
      durationDrivers: string[]
      workfaceReadinessSignals: string[]
      assemblyRiskTags: string[]
    }
    evidenceAnchors: {
      standardLibraryAnchors: string[]
      calibrationAnchors: string[]
      replayAdmission: {
        minimumComparableWorkfaceWindows: number
        p80CaptureThreshold: number
        maxMedianAbsoluteErrorDays: number
      }
    }
  }
  governance: {
    governanceStatus: 'candidate_seeded'
    directRuntimeWrite: false
    autoPublish: false
    publicationPath: 'replay_candidate_shadow_gate_publish_rollback'
    manualReviewRequiredFor: string[]
  }
}

export const T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION = 'v1.4.23.1-t2-division-rhythm-cold-start-20260622'

type TemplateInput = Omit<T2DivisionRhythmTemplate, 'tier' | 'sourceType' | 'sourceVersion' | 'sourceRefs' | 'reuseScope' | 'maturity' | 'rhythm' | 'productionFeasibility' | 'hardGates' | 'dependencyEdges' | 'scheduleTrust' | 'governance'> & {
  parentWindowDays: T2DivisionRhythmTemplate['rhythm']['parentWindowDays']
  workfaceUnit: T2RhythmWorkfaceUnit
  overlapPolicy: T2DivisionRhythmTemplate['rhythm']['overlapPolicy']
  windowRoles: string[]
  durationBearingCount?: number
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right))
}

function buildChildWindows(templateId: string, roles: string[], p50: number, p80: number, durationBearingCount = Math.max(4, roles.length - 2)): T2RhythmChildWindow[] {
  const normalizedP50 = Math.max(1, Math.round(p50))
  const normalizedP80 = Math.max(normalizedP50, Math.round(p80))
  const denseRhythm = normalizedP50 <= roles.length
  const anchors = roles.map((_, index) => {
    if (denseRhythm) return Math.min(normalizedP80, index + 1)
    const ratio = roles.length <= 1 ? 0 : index / (roles.length - 1)
    return Math.min(normalizedP80, Math.max(1, Math.round(1 + (normalizedP50 - 1) * ratio)))
  })

  return roles.map((role, index) => {
    const startDay = anchors[index] ?? 1
    const nextAnchor = anchors[index + 1]
    const endDay = denseRhythm || nextAnchor == null
      ? startDay
      : Math.max(startDay, Math.min(normalizedP80, nextAnchor - 1))
    return {
      windowCode: `${templateId}:W${String(index + 1).padStart(2, '0')}`,
      label: role.replace(/_/g, ' '),
      startDay,
      endDay,
      durationDays: Math.max(1, endDay - startDay + 1),
      role,
      source: 't2_division_rhythm_template_seed',
      durationBearing: index < durationBearingCount,
    }
  })
}

function classifyDependencyGateEdgeType(role: string): T2RhythmDependencyEdge['edgeType'] | null {
  if (/readiness|permit|gate/.test(role)) return 'readiness_gate'
  if (/acceptance|testing|inspection|quality/.test(role)) return 'quality_gate'
  if (/handover|closeout/.test(role)) return 'handover_gate'
  return null
}

function buildDependencyEdges(templateId: string, windows: T2RhythmChildWindow[]): T2RhythmDependencyEdge[] {
  const edges: T2RhythmDependencyEdge[] = windows.slice(1).map((window, index) => {
    const predecessor = windows[index]
    const gateEdgeType = classifyDependencyGateEdgeType(window.role)
    return {
      edgeCode: `${templateId}:E${String(index + 1).padStart(2, '0')}`,
      predecessorWindowCode: predecessor.windowCode,
      successorWindowCode: window.windowCode,
      relation: index % 3 === 0 && gateEdgeType == null ? 'SS' : 'FS',
      lagDays: index % 3 === 0 && gateEdgeType == null ? 1 : 0,
      mandatory: gateEdgeType != null || index === windows.length - 2,
      edgeType: gateEdgeType ?? 'rhythm_sequence',
    }
  })

  let syntheticGateEdgeIndex = edges.length + 1
  for (const window of windows) {
    const gateEdgeType = classifyDependencyGateEdgeType(window.role)
    if (gateEdgeType == null) continue
    const alreadyAnchored = edges.some((edge) => (
      edge.mandatory
      && edge.edgeType !== 'rhythm_sequence'
      && (edge.predecessorWindowCode === window.windowCode || edge.successorWindowCode === window.windowCode)
    ))
    if (alreadyAnchored) continue
    const currentWindowIndex = windows.findIndex((candidate) => candidate.windowCode === window.windowCode)
    const successor = windows[currentWindowIndex + 1]
    const predecessor = windows[currentWindowIndex - 1]
    const predecessorWindowCode = successor ? window.windowCode : predecessor?.windowCode
    const successorWindowCode = successor?.windowCode ?? window.windowCode
    if (!predecessorWindowCode || !successorWindowCode || predecessorWindowCode === successorWindowCode) continue
    edges.push({
      edgeCode: `${templateId}:EG${String(syntheticGateEdgeIndex).padStart(2, '0')}`,
      predecessorWindowCode,
      successorWindowCode,
      relation: 'FS',
      lagDays: 0,
      mandatory: true,
      edgeType: gateEdgeType,
    })
    syntheticGateEdgeIndex += 1
  }

  if (!edges.some((edge) => edge.relation === 'SS')) {
    const overlapEdgeIndex = edges.findIndex((edge) => edge.edgeType === 'rhythm_sequence')
    if (overlapEdgeIndex >= 0) {
      edges[overlapEdgeIndex] = {
        ...edges[overlapEdgeIndex],
        relation: 'SS',
        lagDays: 1,
        mandatory: false,
      }
    }
  }
  return edges
}

function buildHardGates(templateId: string, roles: string[]): T2RhythmHardGate[] {
  const gateRoles = roles.filter((role) => /gate|acceptance|handover|readiness|permit|testing|closeout|inspection/.test(role))
  const selectedRoles = gateRoles.length >= 2 ? gateRoles.slice(0, 3) : [roles[1] ?? roles[0], roles[roles.length - 1]]
  return selectedRoles.map((role, index) => ({
    gateCode: `${templateId}:G${String(index + 1).padStart(2, '0')}`,
    label: role.replace(/_/g, ' '),
    gateType: index === selectedRoles.length - 1 ? 'handover' : index === 0 ? 'readiness' : 'quality',
    blocksAutomaticMaterialization: true,
  }))
}

function template(input: TemplateInput): T2DivisionRhythmTemplate {
  const childWindows = buildChildWindows(
    input.templateId,
    input.windowRoles,
    input.parentWindowDays.p50,
    input.parentWindowDays.p80,
    input.durationBearingCount,
  )
  const sourceRefs = [
    'server/src/seeds/domainWbsTemplateCatalogs.ts',
    'server/src/seeds/v1474BuildingPatternSeed.ts',
    'docs/plans/v1.4.23.1体系收口台账与验收门禁矩阵.md#C-19.15',
  ]
  const hardGates = buildHardGates(input.templateId, input.windowRoles)
  const dependencyEdges = buildDependencyEdges(input.templateId, childWindows)
  return {
    ...input,
    tier: 'T2',
    sourceType: 'system_standard_library',
    sourceVersion: T2_DIVISION_RHYTHM_TEMPLATE_SEED_VERSION,
    sourceRefs,
    reuseScope: 'industry',
    maturity: 'seeded_cold_start',
    rhythm: {
      parentWindowDays: input.parentWindowDays,
      workfaceUnit: input.workfaceUnit,
      overlapPolicy: input.overlapPolicy,
      childWindows,
    },
    productionFeasibility: buildProductionFeasibility(input, hardGates),
    hardGates,
    dependencyEdges,
    scheduleTrust: buildScheduleTrust(input, childWindows, hardGates, sourceRefs),
    governance: {
      governanceStatus: 'candidate_seeded',
      directRuntimeWrite: false,
      autoPublish: false,
      publicationPath: 'replay_candidate_shadow_gate_publish_rollback',
      manualReviewRequiredFor: [
        'materialize_task_dependencies',
        'write_plan_dates',
        'promote_to_published_experience',
      ],
    },
  }
}

function buildProductionFeasibility(
  input: TemplateInput,
  hardGates: T2RhythmHardGate[],
): T2DivisionRhythmTemplate['productionFeasibility'] {
  const parallelPolicy = input.overlapPolicy !== 'sequential_with_controlled_overlap'
  const systemCommissioning = input.overlapPolicy === 'system_zone_commissioning'
  const recommendedCrewStreams = systemCommissioning ? 3 : parallelPolicy ? 2 : 1
  const minimumParallelWorkfaces = input.workfaceUnit === 'building' ? 1 : parallelPolicy ? 2 : 1

  return {
    calendarBasis: 'working_day',
    workfaceUnit: input.workfaceUnit,
    minimumParallelWorkfaces,
    recommendedCrewStreams,
    resourceReadinessSignals: unique([
      `workface_unit:${input.workfaceUnit}`,
      `crew_streams:${recommendedCrewStreams}`,
      ...input.applicability.methodVariantCodes.map((code) => `method:${code}`),
      ...hardGates.map((gate) => `gate:${gate.gateCode}`),
    ]),
    calendarConstraintSignals: unique([
      'working_day_calendar_required',
      'holiday_blackout_check_required',
      input.parentWindowDays.p50 <= 10 ? 'continuous_cycle_weather_check' : 'monthly_productivity_window_check',
    ]),
    capacityRiskTags: unique([
      `overlap_policy:${input.overlapPolicy}`,
      `parallel_workface_min:${minimumParallelWorkfaces}`,
      `crew_stream_capacity:${recommendedCrewStreams}`,
      ...input.compatibility.incompatibleAssumptions.map((assumption) => `assumption_conflict:${assumption}`),
    ]),
  }
}

function buildScheduleTrust(
  input: TemplateInput,
  childWindows: T2RhythmChildWindow[],
  hardGates: T2RhythmHardGate[],
  sourceRefs: string[],
): T2DivisionRhythmTemplate['scheduleTrust'] {
  const criticalPathRoles = [
    ...childWindows
      .filter((window) => window.durationBearing)
      .map((window) => window.role)
      .slice(0, 3),
    ...hardGates.map((gate) => gate.gateCode),
  ].slice(0, 5)

  const durationDrivers = [
    ...input.applicability.methodVariantCodes,
    ...input.applicability.structureTypeCodes,
    `workface_unit:${input.workfaceUnit}`,
    `overlap_policy:${input.overlapPolicy}`,
  ]

  const workfaceReadinessSignals = [
    ...input.compatibility.requiredFacts,
    ...hardGates.map((gate) => gate.gateCode),
  ]

  const assemblyRiskTags = [
    ...input.compatibility.incompatibleAssumptions,
    ...input.applicability.requiredScopeDimensions.map((dimension) => `scope_dimension:${dimension}`),
    `overlap_policy:${input.overlapPolicy}`,
  ]

  return {
    scheduleSemantics: {
      criticalPathRoles,
      durationDrivers,
      workfaceReadinessSignals,
      assemblyRiskTags,
    },
    evidenceAnchors: {
      standardLibraryAnchors: [
        ...sourceRefs,
        `template:${input.templateId}`,
      ],
      calibrationAnchors: [
        ...input.calibration.requiredActualSignals,
        ...input.calibration.replayMetrics,
      ],
      replayAdmission: {
        minimumComparableWorkfaceWindows: 12,
        p80CaptureThreshold: 0.72,
        maxMedianAbsoluteErrorDays: input.parentWindowDays.p50 <= 10 ? 2 : input.parentWindowDays.p50 <= 40 ? 4 : 5,
      },
    },
  }
}

const DEFAULT_REPLAY_METRICS = [
  'actual_start_finish_mae',
  'p50_p80_interval_capture',
  'dependency_violation_count',
  'handover_gate_slippage_days',
  'resource_conflict_observation_count',
]

const DEFAULT_ACTUAL_SIGNALS = [
  'actual_start_date',
  'actual_finish_date',
  'workface_scope_key',
  'handover_gate_result',
  'progress_velocity_observation',
]

function calibration(extraSignals: string[] = []): T2DivisionRhythmTemplate['calibration'] {
  return {
    requiredActualSignals: [...DEFAULT_ACTUAL_SIGNALS, ...extraSignals],
    replayMetrics: DEFAULT_REPLAY_METRICS,
    minimumSamplePolicy: 'candidate until replay covers at least 12 comparable workface windows and p80 captures >= 0.72',
  }
}

function compatibility(input: {
  requiredFacts: string[]
  optionalFacts?: string[]
  compatible?: string[]
  incompatible: string[]
  units: T2RhythmWorkfaceUnit[]
}): T2DivisionRhythmTemplate['compatibility'] {
  return {
    requiredFacts: input.requiredFacts,
    optionalFacts: input.optionalFacts ?? [],
    compatibleOrganizationAssumptions: input.compatible ?? [],
    incompatibleAssumptions: input.incompatible,
    allowedWorkfaceUnits: input.units,
  }
}

const CURATED_T2_DIVISION_RHYTHM_TEMPLATE_SEED: T2DivisionRhythmTemplate[] = [
  template({
    templateId: 't2-residential-basement-structure-handover-rhythm-v1',
    templateName: 'Residential basement excavation structure waterproof handover rhythm',
    confidence: 'high',
    applicability: {
      businessTypeCodes: ['general_civil', 'residential', 'commercial'],
      phaseWindows: ['foundation', 'basement'],
      divisionFamilies: ['foundation_and_basement'],
      subdivisionFamilies: ['earthwork_support', 'basement_structure', 'basement_waterproof_handover'],
      methodVariantCodes: ['open_cut', 'basement_cast_in_place', 'waterproof_membrane'],
      structureTypeCodes: ['shear_wall', 'frame_shear_wall', 'basement_podium'],
      requiredScopeDimensions: ['zone', 'section'],
    },
    parentWindowDays: { p20: 42, p50: 56, p80: 76 },
    workfaceUnit: 'zone',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['support_readiness_gate', 'earthwork_section_release', 'bottom_slab_structure', 'basement_vertical_structure', 'waterproof_protection', 'backfill_or_podium_handover', 'basement_acceptance_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasBasementScope', 'hasSupportScheme'],
      optionalFacts: ['hasWaterproofInterface', 'hasPodiumScope'],
      compatible: ['basement_first_then_tower', 'shared_podium_before_tower'],
      incompatible: ['tower_first_without_basement_handover', 'waterproof_handover_skipped'],
      units: ['zone', 'section', 'building'],
    }),
    calibration: calibration(['basement_zone_handover_date']),
  }),
  template({
    templateId: 't2-residential-standard-floor-structure-rhythm-v1',
    templateName: 'Residential standard-floor structure cycle rhythm',
    confidence: 'high',
    applicability: {
      businessTypeCodes: ['general_civil', 'residential', 'commercial', 'hotel'],
      phaseWindows: ['superstructure'],
      divisionFamilies: ['superstructure'],
      subdivisionFamilies: ['vertical_structure', 'horizontal_structure', 'standard_floor_handover'],
      methodVariantCodes: ['aluminum_formwork', 'climbing_formwork', 'large_formwork', 'prefab_concrete'],
      structureTypeCodes: ['shear_wall', 'frame_shear_wall', 'prefabricated_concrete'],
      requiredScopeDimensions: ['building', 'floor'],
    },
    parentWindowDays: { p20: 5, p50: 6, p80: 9 },
    workfaceUnit: 'floor',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['floor_control_line', 'vertical_rebar_embed', 'vertical_formwork', 'horizontal_formwork_support', 'horizontal_rebar_embed', 'concrete_pour', 'early_curing_strip_gate', 'floor_handover_quality_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasOrderedFloors', 'hasBasementHandover'],
      optionalFacts: ['hasAluminumFormwork', 'hasClimbingFrame'],
      compatible: ['basement_first_then_tower', 'tower_after_podium_handover'],
      incompatible: ['tower_first_without_basement_handover', 'floor_cycle_without_ordered_floors'],
      units: ['building', 'floor'],
    }),
    calibration: calibration(['floor_number', 'cycle_day_index']),
  }),
  template({
    templateId: 't2-residential-secondary-structure-fitout-interleave-v1',
    templateName: 'Residential secondary structure plaster and fitout interleaving rhythm',
    confidence: 'high',
    applicability: {
      businessTypeCodes: ['general_civil', 'residential', 'hotel', 'commercial'],
      phaseWindows: ['superstructure', 'decoration'],
      divisionFamilies: ['superstructure', 'decoration_fitout'],
      subdivisionFamilies: ['secondary_structure', 'rough_plaster', 'fitout_workface_handover'],
      methodVariantCodes: ['masonry_wall', 'alc_panel', 'wet_area_fitout'],
      structureTypeCodes: ['shear_wall', 'frame_shear_wall'],
      requiredScopeDimensions: ['building', 'floor'],
    },
    parentWindowDays: { p20: 18, p50: 26, p80: 38 },
    workfaceUnit: 'floor',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['structure_floor_handover_gate', 'masonry_wall_work', 'mep_chasing_and_embed', 'plaster_base_work', 'wet_area_waterproof_gate', 'rough_fitout_start_release', 'floor_quality_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasFloorHandover', 'hasMepRoughInInterface'],
      optionalFacts: ['hasWetAreaWaterproof', 'hasRoomUnitScope'],
      compatible: ['floor_by_floor_interleaving', 'tower_fitout_lagged_by_n_floors'],
      incompatible: ['fitout_start_without_structure_handover', 'wet_area_without_waterproof_gate'],
      units: ['floor', 'room', 'workface'],
    }),
    calibration: calibration(['floor_fitout_start_lag']),
  }),
  template({
    templateId: 't2-facade-roof-envelope-closeout-rhythm-v1',
    templateName: 'Facade roof envelope and water-tight closeout rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['general_civil', 'residential', 'commercial', 'hotel', 'sports_culture', 'industrial'],
      phaseWindows: ['envelope'],
      divisionFamilies: ['envelope_facade_roof'],
      subdivisionFamilies: ['facade_embedded_interface', 'facade_installation', 'roof_waterproof_handover'],
      methodVariantCodes: ['unitized_facade', 'stick_facade', 'roof_membrane'],
      structureTypeCodes: ['frame_shear_wall', 'steel_assembly', 'large_span_steel'],
      requiredScopeDimensions: ['building', 'zone'],
    },
    parentWindowDays: { p20: 35, p50: 50, p80: 72 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['structure_embed_readiness_gate', 'facade_shop_drawing_release', 'facade_frame_installation', 'panel_or_glass_installation', 'roof_waterproof_work', 'water_tight_test_gate', 'envelope_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasEnvelopeZone', 'hasStructureEmbedHandover'],
      optionalFacts: ['hasRoofWaterproofScope', 'hasCurtainWallMockup'],
      compatible: ['envelope_after_structure_zone_release'],
      incompatible: ['facade_without_embed_handover', 'roof_closeout_without_water_test'],
      units: ['building', 'zone', 'workface'],
    }),
    calibration: calibration(['water_tight_test_date']),
  }),
  template({
    templateId: 't2-mep-roughin-riser-branch-pressure-rhythm-v1',
    templateName: 'MEP riser branch rough-in pressure-test rhythm',
    confidence: 'high',
    applicability: {
      businessTypeCodes: ['general_civil', 'residential', 'commercial', 'hotel', 'school', 'hospital', 'sports_culture', 'renovation'],
      phaseWindows: ['mep'],
      divisionFamilies: ['mep_systems'],
      subdivisionFamilies: ['mep_riser', 'branch_distribution', 'pressure_or_insulation_test'],
      methodVariantCodes: ['pipe_riser', 'electrical_riser', 'duct_branch'],
      structureTypeCodes: ['mep_integrated', 'frame_shear_wall'],
      requiredScopeDimensions: ['building', 'floor', 'system'],
    },
    parentWindowDays: { p20: 24, p50: 36, p80: 54 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['shaft_readiness_gate', 'riser_main_installation', 'floor_branch_installation', 'pressure_or_insulation_test', 'ceiling_cover_permission_gate', 'defect_rectification', 'system_zone_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasSystemScope', 'hasShaftReadiness'],
      optionalFacts: ['hasCeilingClosureGate', 'hasPressureTestRecord'],
      compatible: ['mep_follows_structure_lag', 'system_zone_parallel'],
      incompatible: ['ceiling_close_before_pressure_test', 'riser_without_shaft_handover'],
      units: ['system', 'floor', 'zone'],
    }),
    calibration: calibration(['system_pressure_test_date']),
  }),
  template({
    templateId: 't2-decoration-wet-dry-room-handover-rhythm-v1',
    templateName: 'Decoration wet-dry room fitout and handover rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['general_civil', 'residential', 'hotel', 'commercial', 'renovation'],
      phaseWindows: ['decoration'],
      divisionFamilies: ['decoration_fitout'],
      subdivisionFamilies: ['wet_area_fitout', 'dry_area_finish', 'room_handover'],
      methodVariantCodes: ['wet_area_finish', 'dry_fitout', 'renovation_occupied_finish'],
      structureTypeCodes: ['fitout', 'renovation'],
      requiredScopeDimensions: ['floor', 'room', 'zone'],
    },
    parentWindowDays: { p20: 28, p50: 42, p80: 64 },
    workfaceUnit: 'room',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['room_readiness_gate', 'wet_area_waterproof_tile', 'ceiling_and_wall_base', 'floor_finish_installation', 'fixture_cabinet_installation', 'defect_punch_list', 'room_handover_acceptance_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasRoomScope', 'hasWetAreaWaterproofGate'],
      optionalFacts: ['hasOwnerSampleRoom', 'hasOccupiedRenovationConstraint'],
      compatible: ['sample_room_first', 'floor_room_batch_handover'],
      incompatible: ['room_finish_without_waterproof_gate', 'occupied_zone_without_decanting'],
      units: ['room', 'floor', 'zone'],
    }),
    calibration: calibration(['room_handover_date']),
  }),
  template({
    templateId: 't2-outdoor-municipal-landscape-interface-rhythm-v1',
    templateName: 'Outdoor municipal utilities road landscape interface rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['general_civil', 'residential', 'commercial', 'school', 'hospital', 'industrial'],
      phaseWindows: ['outdoor', 'handover'],
      divisionFamilies: ['outdoor_municipal_landscape'],
      subdivisionFamilies: ['outdoor_pipe_network', 'road_hardscape', 'landscape_greenery'],
      methodVariantCodes: ['outdoor_utilities', 'road_base_compaction', 'landscape_planting'],
      structureTypeCodes: ['campus', 'industrial_park', 'general_civil'],
      requiredScopeDimensions: ['zone', 'section'],
    },
    parentWindowDays: { p20: 30, p50: 45, p80: 68 },
    workfaceUnit: 'section',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['site_release_readiness_gate', 'pipe_network_trench_work', 'pressure_closed_water_test', 'road_base_and_paving', 'landscape_soil_and_planting', 'municipal_tie_in_acceptance_gate', 'outdoor_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasOutdoorSectionScope', 'hasMunicipalTieInInterface'],
      optionalFacts: ['hasLandscapeSeasonWindow', 'hasRoadOpeningPermit'],
      compatible: ['outdoor_after_heavy_transport_release'],
      incompatible: ['landscape_before_pipe_pressure_test', 'road_paving_before_trench_backfill'],
      units: ['section', 'zone', 'workface'],
    }),
    calibration: calibration(['municipal_tie_in_date']),
  }),
  template({
    templateId: 't2-integrated-commissioning-handover-rhythm-v1',
    templateName: 'Integrated commissioning defect closeout and handover rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['general_civil', 'residential', 'commercial', 'hotel', 'hospital', 'school', 'data_center', 'transportation_hub', 'industrial'],
      phaseWindows: ['commissioning', 'handover'],
      divisionFamilies: ['commissioning_handover'],
      subdivisionFamilies: ['single_system_commissioning', 'integrated_linkage', 'handover_defect_closeout'],
      methodVariantCodes: ['integrated_commissioning', 'life_safety_linkage', 'owner_handover'],
      structureTypeCodes: ['mep_integrated', 'mission_critical_room', 'general_civil'],
      requiredScopeDimensions: ['system', 'zone'],
    },
    parentWindowDays: { p20: 20, p50: 32, p80: 52 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['single_system_readiness_gate', 'single_system_commissioning', 'life_safety_linkage_test', 'integrated_scenario_test', 'defect_rectification_retest', 'owner_training_and_documents', 'handover_acceptance_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasSystemCommissioningScope', 'hasSingleSystemReadiness'],
      optionalFacts: ['hasOwnerTrainingRequirement', 'hasLifeSafetyLinkage'],
      compatible: ['single_system_before_integrated_commissioning'],
      incompatible: ['integrated_test_without_single_system_ready', 'handover_without_defect_closeout'],
      units: ['system', 'zone', 'building'],
    }),
    calibration: calibration(['integrated_commissioning_pass_date']),
  }),
  template({
    templateId: 't2-hospital-cleanroom-medical-system-commissioning-v1',
    templateName: 'Hospital cleanroom medical system commissioning rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['hospital'],
      phaseWindows: ['commissioning', 'handover'],
      divisionFamilies: ['specialty_business_systems', 'mep_systems'],
      subdivisionFamilies: ['cleanroom_envelope', 'medical_gas_terminal', 'clinical_system_validation'],
      methodVariantCodes: ['iso_cleanroom', 'medical_gas_commissioning', 'pressure_cascade_test'],
      structureTypeCodes: ['medical_cleanroom_system', 'mep_integrated'],
      requiredScopeDimensions: ['zone', 'system'],
    },
    parentWindowDays: { p20: 35, p50: 52, p80: 78 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['cleanroom_envelope_readiness_gate', 'medical_gas_pressure_test', 'pressure_cascade_balancing', 'particle_bacteria_testing', 'clinical_system_interface_test', 'authority_or_owner_acceptance_gate', 'department_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasMedicalCleanroomZone', 'hasSystemScope'],
      optionalFacts: ['hasAuthorityInspection', 'hasClinicalDepartmentHandover'],
      compatible: ['medical_system_zone_commissioning'],
      incompatible: ['clinical_handover_without_cleanroom_validation', 'medical_gas_use_without_terminal_test'],
      units: ['system', 'zone', 'room'],
    }),
    calibration: calibration(['cleanroom_validation_pass_date']),
  }),
  template({
    templateId: 't2-hospital-medical-gas-source-terminal-rhythm-v1',
    templateName: 'Hospital medical gas source terminal alarm emergency-switch rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['hospital'],
      phaseWindows: ['mep', 'commissioning'],
      divisionFamilies: ['specialty_business_systems', 'mep_systems'],
      subdivisionFamilies: ['medical_gas_source_station', 'medical_gas_pipeline', 'medical_gas_terminal_alarm'],
      methodVariantCodes: ['medical_gas_commissioning', 'medical_gas_terminal_test'],
      structureTypeCodes: ['medical_cleanroom_system', 'mep_integrated'],
      requiredScopeDimensions: ['system', 'zone'],
    },
    parentWindowDays: { p20: 24, p50: 38, p80: 58 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['source_station_readiness_gate', 'main_pipeline_pressure_test', 'terminal_installation_flow_test', 'alarm_panel_linkage_test', 'emergency_switch_drill', 'medical_department_acceptance_gate', 'medical_gas_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasMedicalGasScope', 'hasTerminalAlarmScope'],
      optionalFacts: ['hasSourceStationScope', 'hasEmergencySwitchRequirement'],
      compatible: ['medical_gas_before_clinical_handover'],
      incompatible: ['clinical_use_without_medical_gas_acceptance', 'terminal_alarm_skipped'],
      units: ['system', 'zone', 'room'],
    }),
    calibration: calibration(['medical_gas_terminal_acceptance_date']),
  }),
  template({
    templateId: 't2-school-campus-functional-phasing-rhythm-v1',
    templateName: 'School campus teaching living sports phased handover rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['school'],
      phaseWindows: ['outdoor', 'handover'],
      divisionFamilies: ['outdoor_municipal_landscape', 'commissioning_handover'],
      subdivisionFamilies: ['teaching_building_handover', 'living_area_handover', 'sports_field_handover'],
      methodVariantCodes: ['campus_phasing', 'sports_field_acceptance'],
      structureTypeCodes: ['campus', 'general_civil'],
      requiredScopeDimensions: ['building', 'zone'],
    },
    parentWindowDays: { p20: 32, p50: 48, p80: 72 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['teaching_area_readiness_gate', 'living_area_system_closeout', 'sports_field_base_surface', 'campus_road_and_utility_closeout', 'education_equipment_installation', 'school_owner_acceptance_gate', 'campus_phased_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasCampusFunctionZones', 'hasOpeningDateGate'],
      optionalFacts: ['hasTeachingEquipmentScope', 'hasSportsFieldScope'],
      compatible: ['campus_function_zone_parallel'],
      incompatible: ['school_opening_without_life_safety_acceptance', 'sports_field_before_drainage_ready'],
      units: ['building', 'zone', 'workface'],
    }),
    calibration: calibration(['campus_zone_handover_date']),
  }),
  template({
    templateId: 't2-industrial-main-plant-utility-equipment-rhythm-v1',
    templateName: 'Industrial main plant utility equipment installation rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['industrial'],
      phaseWindows: ['superstructure', 'mep', 'commissioning'],
      divisionFamilies: ['superstructure', 'mep_systems', 'specialty_business_systems'],
      subdivisionFamilies: ['main_plant_structure', 'utility_interface', 'process_equipment_readiness'],
      methodVariantCodes: ['steel_assembly', 'process_equipment_installation', 'utility_commissioning'],
      structureTypeCodes: ['steel_assembly', 'industrial_plant'],
      requiredScopeDimensions: ['bay', 'system'],
    },
    parentWindowDays: { p20: 40, p50: 60, p80: 90 },
    workfaceUnit: 'bay',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['plant_bay_structure_release', 'crane_or_large_equipment_path_gate', 'utility_main_installation', 'equipment_foundation_handover', 'process_equipment_installation', 'utility_commissioning_gate', 'trial_production_interface_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasIndustrialBayScope', 'hasProcessEquipmentInterface'],
      optionalFacts: ['hasCranePathConstraint', 'hasTrialProductionGate'],
      compatible: ['main_plant_utility_parallel_with_interface_gates'],
      incompatible: ['equipment_install_before_foundation_handover', 'trial_production_without_utility_commissioning'],
      units: ['bay', 'system', 'zone'],
    }),
    calibration: calibration(['equipment_foundation_handover_date']),
  }),
  template({
    templateId: 't2-modular-building-factory-lot-site-assembly-rhythm-v1',
    templateName: 'Modular building factory-lot transport site assembly commissioning rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['modular_building'],
      phaseWindows: ['superstructure', 'mep', 'interior', 'outdoor', 'commissioning', 'handover'],
      divisionFamilies: ['superstructure', 'mep_systems', 'decoration_fitout', 'outdoor_municipal_landscape', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['factory_module_production', 'module_transport_staging', 'site_module_assembly', 'module_mep_integration', 'modular_handover'],
      methodVariantCodes: ['modular_mic', 'steel_assembly', 'utility_commissioning'],
      structureTypeCodes: ['steel_assembly', 'prefabricated_concrete', 'modular_building', 'mep_integrated'],
      requiredScopeDimensions: ['factory_lot', 'building', 'zone', 'system'],
    },
    parentWindowDays: { p20: 36, p50: 54, p80: 80 },
    workfaceUnit: 'factory_lot',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['factory_lot_release_readiness_gate', 'module_fabrication_and_quality_check', 'transport_staging_and_site_lift_path_gate', 'module_lifting_and_structural_tie_in', 'module_mep_connection_and_pressure_test', 'integrated_commissioning_acceptance_gate', 'modular_building_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasFactoryLotScope', 'hasModuleTransportPlan'],
      optionalFacts: ['hasSiteLiftPathConstraint', 'hasFactoryInspectionGate'],
      compatible: ['factory_lot_parallel_with_site_preparation', 'module_lift_then_mep_integration'],
      incompatible: ['module_lift_without_transport_plan', 'factory_module_without_quality_gate'],
      units: ['factory_lot', 'building', 'zone', 'system'],
    }),
    calibration: calibration(['factory_module_release_date', 'module_lift_completion_date']),
  }),
  template({
    templateId: 't2-data-center-power-cooling-commissioning-rhythm-v1',
    templateName: 'Data center power cooling integrated commissioning rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['data_center'],
      phaseWindows: ['mep', 'commissioning'],
      divisionFamilies: ['specialty_business_systems', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['power_redundancy', 'cooling_redundancy', 'integrated_load_test'],
      methodVariantCodes: ['ups_parallel', 'chilled_water_commissioning', 'integrated_load_bank_test'],
      structureTypeCodes: ['mission_critical_room', 'data_center_building'],
      requiredScopeDimensions: ['system', 'zone'],
    },
    parentWindowDays: { p20: 45, p50: 68, p80: 96 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['power_room_readiness_gate', 'ups_battery_sts_pdu_test', 'cooling_loop_balancing', 'monitoring_dcim_integration', 'black_start_or_failover_test', 'integrated_load_bank_acceptance_gate', 'operation_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasRedundantPowerScope', 'hasCoolingSystemScope'],
      optionalFacts: ['hasLoadBankTest', 'hasBlackStartRequirement'],
      compatible: ['power_cooling_integrated_commissioning'],
      incompatible: ['load_test_without_power_redundancy_ready', 'operation_handover_without_failover_test'],
      units: ['system', 'zone', 'room'],
    }),
    calibration: calibration(['load_bank_test_pass_date']),
  }),
  template({
    templateId: 't2-transportation-hub-public-system-transfer-rhythm-v1',
    templateName: 'Transportation hub public system transfer and trial-operation rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['transportation_hub'],
      phaseWindows: ['commissioning', 'trial_operation', 'opening'],
      divisionFamilies: ['specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['passenger_flow_system', 'platform_interface', 'traffic_transfer_trial'],
      methodVariantCodes: ['passenger_flow_trial', 'traffic_transfer_system', 'public_safety_linkage'],
      structureTypeCodes: ['large_public', 'transportation_hub'],
      requiredScopeDimensions: ['zone', 'system'],
    },
    parentWindowDays: { p20: 36, p50: 54, p80: 82 },
    workfaceUnit: 'zone',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['station_zone_readiness_gate', 'platform_interface_closeout', 'passenger_flow_guidance_installation', 'fire_life_safety_linkage', 'traffic_transfer_trial_operation', 'authority_opening_acceptance_gate', 'operation_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasPassengerFlowZone', 'hasTrialOperationGate'],
      optionalFacts: ['hasAuthorityOpeningAcceptance', 'hasTrafficTransferInterface'],
      compatible: ['trial_operation_before_opening'],
      incompatible: ['opening_without_life_safety_linkage', 'passenger_flow_trial_without_platform_interface'],
      units: ['zone', 'system', 'workface'],
    }),
    calibration: calibration(['trial_operation_start_date']),
  }),
  template({
    templateId: 't2-sports-culture-longspan-envelope-event-rhythm-v1',
    templateName: 'Sports culture long-span envelope event-handover rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['sports_culture'],
      phaseWindows: ['superstructure', 'envelope', 'opening'],
      divisionFamilies: ['superstructure', 'envelope_facade_roof', 'commissioning_handover'],
      subdivisionFamilies: ['long_span_structure', 'roof_envelope', 'event_system_handover'],
      methodVariantCodes: ['large_span_steel', 'roof_system', 'event_handover'],
      structureTypeCodes: ['large_span_steel', 'sports_venue'],
      requiredScopeDimensions: ['bay', 'zone'],
    },
    parentWindowDays: { p20: 48, p50: 72, p80: 108 },
    workfaceUnit: 'bay',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['longspan_lift_readiness_gate', 'main_truss_or_roof_installation', 'envelope_water_tight_closeout', 'bowl_or_public_area_fitout', 'event_system_commissioning', 'event_rehearsal_acceptance_gate', 'event_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasLongSpanStructure', 'hasEventHandoverGate'],
      optionalFacts: ['hasRoofLiftConstraint', 'hasPublicAreaCrowdFlow'],
      compatible: ['longspan_then_envelope_then_event_system'],
      incompatible: ['event_rehearsal_without_life_safety_ready', 'roof_closeout_without_water_tight_test'],
      units: ['bay', 'zone', 'system'],
    }),
    calibration: calibration(['event_rehearsal_date']),
  }),
  template({
    templateId: 't2-tod-transfer-deck-tower-interface-rhythm-v1',
    templateName: 'TOD transfer deck upper-cover tower interface rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['tod_upper_cover', 'commercial'],
      phaseWindows: ['foundation', 'superstructure'],
      divisionFamilies: ['foundation_and_basement', 'superstructure'],
      subdivisionFamilies: ['rail_interface_protection', 'transfer_deck_structure', 'upper_tower_release'],
      methodVariantCodes: ['tod_transfer_deck', 'tower_on_podium', 'rail_interface_protection'],
      structureTypeCodes: ['tod_upper_cover', 'frame_shear_wall'],
      requiredScopeDimensions: ['building', 'zone'],
    },
    parentWindowDays: { p20: 50, p50: 76, p80: 112 },
    workfaceUnit: 'zone',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['rail_interface_protection_gate', 'transfer_deck_structure_work', 'deck_waterproof_and_load_transfer', 'podium_interface_handover', 'tower_start_release_gate', 'upper_tower_cycle_start', 'interface_acceptance_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasTransferDeckScope', 'hasRailInterfaceProtection'],
      optionalFacts: ['hasPodiumScope', 'hasUpperTowerScope'],
      compatible: ['transfer_deck_before_upper_tower'],
      incompatible: ['tower_first_without_transfer_deck_release', 'rail_interface_unprotected'],
      units: ['building', 'zone', 'floor'],
    }),
    calibration: calibration(['transfer_deck_release_date']),
  }),
  template({
    templateId: 't2-renovation-occupied-zone-decanting-cutover-rhythm-v1',
    templateName: 'Occupied renovation zone decanting cutover rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['renovation'],
      phaseWindows: ['renovation', 'handover'],
      divisionFamilies: ['decoration_fitout', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['occupied_zone_decanting', 'temporary_cutover', 'renovation_handover'],
      methodVariantCodes: ['renovation_occupied_finish', 'temporary_cutover', 'phased_decanting'],
      structureTypeCodes: ['renovation', 'fitout'],
      requiredScopeDimensions: ['zone', 'room'],
    },
    parentWindowDays: { p20: 24, p50: 36, p80: 58 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['occupied_area_decanting_gate', 'temporary_protection_and_cutover', 'demolition_or_opening_work', 'mep_reconnection_test', 'fitout_restore_work', 'user_reentry_acceptance_gate', 'renovation_zone_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasOccupiedZoneConstraint', 'hasTemporaryCutoverPlan'],
      optionalFacts: ['hasNightWorkWindow', 'hasUserReentryGate'],
      compatible: ['phased_decanting_then_cutover'],
      incompatible: ['occupied_work_without_decanting', 'cutover_without_restore_test'],
      units: ['zone', 'room', 'workface'],
    }),
    calibration: calibration(['zone_reentry_date']),
  }),
  template({
    templateId: 't2-commercial-podium-tower-fitout-interface-rhythm-v1',
    templateName: 'Commercial podium tower fitout interface rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['general_civil', 'commercial', 'hotel', 'sports_culture'],
      phaseWindows: ['decoration', 'commissioning', 'opening'],
      divisionFamilies: ['decoration_fitout', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['podium_public_fitout', 'tower_room_fitout', 'opening_system_handover'],
      methodVariantCodes: ['public_area_fitout', 'guestroom_fitout', 'opening_preparation'],
      structureTypeCodes: ['commercial_complex', 'hotel_tower'],
      requiredScopeDimensions: ['zone', 'room'],
    },
    parentWindowDays: { p20: 42, p50: 64, p80: 92 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['sample_area_approval_gate', 'podium_public_area_fitout', 'tower_room_batch_fitout', 'mep_terminal_and_controls', 'tenant_or_operator_punch_list', 'opening_readiness_acceptance_gate', 'commercial_operation_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasPublicAreaZone', 'hasOpeningReadinessGate'],
      optionalFacts: ['hasTenantInterface', 'hasHotelOperatorPunchList'],
      compatible: ['podium_public_and_tower_room_parallel_with_gates'],
      incompatible: ['opening_without_operator_acceptance', 'tenant_fitout_without_mep_terminal_ready'],
      units: ['zone', 'room', 'system'],
    }),
    calibration: calibration(['opening_readiness_acceptance_date']),
  }),
  template({
    templateId: 't2-hospital-ward-medical-tower-structure-rhythm-v1',
    templateName: 'Hospital ward medical tower structure and department release rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['hospital'],
      phaseWindows: ['superstructure'],
      divisionFamilies: ['superstructure'],
      subdivisionFamilies: ['ward_tower_structure', 'medical_department_structure_handover', 'equipment_floor_structure_release'],
      methodVariantCodes: ['frame_shear_wall', 'medical_tower_structure', 'equipment_floor_reserved_opening'],
      structureTypeCodes: ['medical_building', 'frame_shear_wall', 'mep_integrated'],
      requiredScopeDimensions: ['building', 'floor', 'zone'],
    },
    parentWindowDays: { p20: 7, p50: 10, p80: 15 },
    workfaceUnit: 'floor',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['medical_floor_control_readiness_gate', 'vertical_structure_and_embeds', 'equipment_floor_reserved_opening_check', 'horizontal_formwork_rebar_embed', 'concrete_pour_and_curing', 'department_interface_release_gate', 'medical_floor_structure_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasMedicalDepartmentZones', 'hasOrderedFloors'],
      optionalFacts: ['hasEquipmentFloorScope', 'hasLargeOpeningReservation'],
      compatible: ['medical_tower_floor_sequence', 'department_zone_handover_after_structure'],
      incompatible: ['medical_fitout_before_structure_handover', 'equipment_floor_without_embed_review'],
      units: ['building', 'floor', 'zone'],
    }),
    calibration: calibration(['medical_floor_structure_handover_date']),
  }),
  template({
    templateId: 't2-hospital-envelope-roof-watertight-rhythm-v1',
    templateName: 'Hospital facade roof watertight medical interior release rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['hospital'],
      phaseWindows: ['envelope'],
      divisionFamilies: ['envelope_facade_roof'],
      subdivisionFamilies: ['medical_facade_installation', 'roof_waterproof_medical_area', 'watertight_fitout_release'],
      methodVariantCodes: ['curtain_wall_medical', 'roof_membrane', 'watertight_zone_release'],
      structureTypeCodes: ['medical_building', 'frame_shear_wall', 'large_public'],
      requiredScopeDimensions: ['building', 'zone'],
    },
    parentWindowDays: { p20: 38, p50: 56, p80: 84 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['facade_embed_review_gate', 'medical_facade_frame_installation', 'roof_waterproof_detail_work', 'external_window_and_louver_closeout', 'watertight_spray_or_flood_test', 'interior_fitout_release_gate', 'medical_envelope_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasEnvelopeZone', 'hasMedicalFitoutInterface'],
      optionalFacts: ['hasRoofEquipmentPlatform', 'hasNegativePressureExhaustInterface'],
      compatible: ['envelope_before_sensitive_medical_fitout'],
      incompatible: ['sensitive_medical_fitout_without_watertight_release', 'roof_equipment_before_waterproof_closeout'],
      units: ['building', 'zone', 'workface'],
    }),
    calibration: calibration(['medical_watertight_release_date']),
  }),
  template({
    templateId: 't2-hospital-clinical-department-fitout-rhythm-v1',
    templateName: 'Hospital clinical department fitout and medical interface rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['hospital'],
      phaseWindows: ['decoration', 'handover'],
      divisionFamilies: ['decoration_fitout', 'specialty_business_systems'],
      subdivisionFamilies: ['clinical_department_fitout', 'medical_room_finish', 'department_handover'],
      methodVariantCodes: ['clinical_room_fitout', 'medical_interface_coordination', 'clean_zone_finish'],
      structureTypeCodes: ['medical_cleanroom_system', 'fitout', 'mep_integrated'],
      requiredScopeDimensions: ['zone', 'room', 'system'],
    },
    parentWindowDays: { p20: 34, p50: 52, p80: 78 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['department_room_readiness_gate', 'mep_terminal_above_ceiling_closeout', 'wall_floor_ceiling_medical_finish', 'medical_equipment_interface_installation', 'infection_control_quality_check', 'department_punch_list_and_training_gate', 'clinical_department_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasClinicalDepartmentScope', 'hasMepTerminalReadiness'],
      optionalFacts: ['hasInfectionControlRequirement', 'hasMedicalEquipmentInterface'],
      compatible: ['department_zone_fitout_after_watertight_release'],
      incompatible: ['clinical_handover_without_mep_terminal_ready', 'infection_control_check_skipped'],
      units: ['zone', 'room', 'system'],
    }),
    calibration: calibration(['clinical_department_handover_date']),
  }),
  template({
    templateId: 't2-school-teaching-building-structure-rhythm-v1',
    templateName: 'School teaching building structure floor-to-zone rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['school'],
      phaseWindows: ['superstructure'],
      divisionFamilies: ['superstructure'],
      subdivisionFamilies: ['teaching_building_structure', 'corridor_stair_structure', 'teaching_zone_handover'],
      methodVariantCodes: ['teaching_building_cast_in_place', 'classroom_floor_cycle', 'campus_structure_handover'],
      structureTypeCodes: ['campus', 'frame_shear_wall', 'general_civil'],
      requiredScopeDimensions: ['building', 'floor', 'zone'],
    },
    parentWindowDays: { p20: 6, p50: 8, p80: 12 },
    workfaceUnit: 'floor',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['teaching_floor_control_readiness_gate', 'column_wall_rebar_formwork', 'beam_slab_formwork_embed', 'concrete_pour_and_curing', 'stair_corridor_quality_check', 'teaching_zone_release_gate', 'teaching_structure_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasTeachingBuildingScope', 'hasOrderedFloors'],
      optionalFacts: ['hasExamOpeningConstraint', 'hasSportsBuildingInterface'],
      compatible: ['teaching_building_before_campus_fitout'],
      incompatible: ['teaching_fitout_without_structure_release', 'floor_cycle_without_ordered_floors'],
      units: ['building', 'floor', 'zone'],
    }),
    calibration: calibration(['teaching_floor_handover_date']),
  }),
  template({
    templateId: 't2-school-classroom-lab-fitout-rhythm-v1',
    templateName: 'School classroom laboratory fitout and teaching equipment rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['school'],
      phaseWindows: ['decoration', 'handover'],
      divisionFamilies: ['decoration_fitout', 'commissioning_handover'],
      subdivisionFamilies: ['classroom_fitout', 'laboratory_fitout', 'teaching_equipment_handover'],
      methodVariantCodes: ['classroom_finish', 'laboratory_ventilation_interface', 'teaching_equipment_installation'],
      structureTypeCodes: ['campus', 'fitout', 'mep_integrated'],
      requiredScopeDimensions: ['floor', 'room', 'zone'],
    },
    parentWindowDays: { p20: 24, p50: 36, p80: 56 },
    workfaceUnit: 'room',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['classroom_room_readiness_gate', 'wall_ceiling_floor_finish', 'lab_water_power_exhaust_interface', 'teaching_equipment_installation', 'environmental_quality_check', 'school_owner_acceptance_gate', 'teaching_space_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasTeachingRoomScope', 'hasOpeningDateGate'],
      optionalFacts: ['hasLaboratoryScope', 'hasTeachingEquipmentScope'],
      compatible: ['classroom_lab_batch_handover'],
      incompatible: ['school_opening_without_environment_check', 'lab_handover_without_ventilation_interface'],
      units: ['room', 'floor', 'zone'],
    }),
    calibration: calibration(['teaching_room_handover_date']),
  }),
  template({
    templateId: 't2-data-center-white-space-fitout-rhythm-v1',
    templateName: 'Data center white-space fitout rack-ready rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['data_center'],
      phaseWindows: ['decoration', 'commissioning'],
      divisionFamilies: ['decoration_fitout', 'specialty_business_systems'],
      subdivisionFamilies: ['white_space_fitout', 'rack_row_readiness', 'containment_handover'],
      methodVariantCodes: ['raised_floor_or_overhead_busway', 'rack_row_containment', 'dcim_room_readiness'],
      structureTypeCodes: ['mission_critical_room', 'data_center_building', 'fitout'],
      requiredScopeDimensions: ['room', 'zone', 'system'],
    },
    parentWindowDays: { p20: 28, p50: 44, p80: 66 },
    workfaceUnit: 'room',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['white_space_readiness_gate', 'floor_ceiling_wall_anti_static_finish', 'busway_or_cable_tray_interface', 'rack_row_containment_installation', 'cleaning_and_labeling_quality_check', 'rack_ready_acceptance_gate', 'white_space_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasWhiteSpaceRoomScope', 'hasPowerCoolingInterface'],
      optionalFacts: ['hasRackLayoutFrozen', 'hasContainmentScope'],
      compatible: ['white_space_after_watertight_and_power_room_ready'],
      incompatible: ['rack_install_before_white_space_acceptance', 'containment_without_power_cooling_interface'],
      units: ['room', 'zone', 'system'],
    }),
    calibration: calibration(['rack_ready_acceptance_date']),
  }),
  template({
    templateId: 't2-data-center-shell-room-readiness-rhythm-v1',
    templateName: 'Data center shell plant-room and white-space readiness rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['data_center'],
      phaseWindows: ['superstructure', 'envelope'],
      divisionFamilies: ['superstructure', 'envelope_facade_roof', 'mep_systems'],
      subdivisionFamilies: ['mission_critical_room_structure', 'plant_room_envelope', 'white_space_watertight_release'],
      methodVariantCodes: ['mission_critical_room_shell', 'roof_equipment_platform', 'watertight_zone_release'],
      structureTypeCodes: ['mission_critical_room', 'data_center_building', 'steel_assembly'],
      requiredScopeDimensions: ['building', 'zone', 'room'],
    },
    parentWindowDays: { p20: 36, p50: 54, p80: 80 },
    workfaceUnit: 'zone',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['critical_room_structure_release_gate', 'plant_room_structure_and_plinths', 'roof_equipment_platform_closeout', 'envelope_watertight_work', 'heavy_equipment_access_path_gate', 'white_space_shell_release', 'dc_shell_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasMissionCriticalRoomScope', 'hasHeavyEquipmentAccessPlan'],
      optionalFacts: ['hasRoofEquipmentPlatform', 'hasWatertightReleaseGate'],
      compatible: ['shell_before_power_cooling_installation'],
      incompatible: ['equipment_install_without_access_path', 'white_space_fitout_without_watertight_release'],
      units: ['building', 'zone', 'room'],
    }),
    calibration: calibration(['mission_critical_shell_release_date']),
  }),
  template({
    templateId: 't2-transport-hub-longspan-envelope-rhythm-v1',
    templateName: 'Transportation hub long-span structure envelope closeout rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['transportation_hub'],
      phaseWindows: ['superstructure', 'envelope'],
      divisionFamilies: ['superstructure', 'envelope_facade_roof'],
      subdivisionFamilies: ['station_hall_longspan_structure', 'platform_canopy_envelope', 'public_area_watertight_release'],
      methodVariantCodes: ['large_span_steel', 'station_hall_roof_system', 'platform_canopy_installation'],
      structureTypeCodes: ['transportation_hub', 'large_span_steel', 'large_public'],
      requiredScopeDimensions: ['bay', 'zone'],
    },
    parentWindowDays: { p20: 46, p50: 70, p80: 104 },
    workfaceUnit: 'bay',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['longspan_lift_or_slide_readiness_gate', 'main_roof_truss_installation', 'platform_canopy_structure', 'envelope_roof_panel_closeout', 'watertight_and_fireproof_quality_check', 'public_area_release_gate', 'hub_envelope_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasStationHallLongSpanScope', 'hasPlatformInterface'],
      optionalFacts: ['hasTrafficProtectionRequirement', 'hasRoofWaterTest'],
      compatible: ['station_hall_then_public_system_install'],
      incompatible: ['public_system_install_before_watertight_release', 'platform_trial_without_canopy_closeout'],
      units: ['bay', 'zone', 'workface'],
    }),
    calibration: calibration(['station_hall_watertight_release_date']),
  }),
  template({
    templateId: 't2-transport-hub-mep-public-systems-rhythm-v1',
    templateName: 'Transportation hub MEP public-system rough-in and linkage rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['transportation_hub'],
      phaseWindows: ['mep', 'commissioning'],
      divisionFamilies: ['mep_systems', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['public_area_mep_roughin', 'passenger_flow_device_interface', 'life_safety_linkage'],
      methodVariantCodes: ['public_safety_linkage', 'traffic_transfer_system', 'station_mep_integrated'],
      structureTypeCodes: ['transportation_hub', 'large_public', 'mep_integrated'],
      requiredScopeDimensions: ['system', 'zone'],
    },
    parentWindowDays: { p20: 34, p50: 50, p80: 76 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['public_mep_zone_readiness_gate', 'hvac_power_fire_roughin', 'passenger_device_interface_installation', 'fire_life_safety_linkage_test', 'traffic_transfer_system_joint_test', 'trial_operation_readiness_gate', 'hub_public_system_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasPassengerFlowZone', 'hasLifeSafetySystemScope'],
      optionalFacts: ['hasTrafficTransferInterface', 'hasAuthorityOpeningAcceptance'],
      compatible: ['public_system_before_trial_operation'],
      incompatible: ['trial_operation_without_life_safety_linkage', 'passenger_device_without_mep_interface_ready'],
      units: ['system', 'zone', 'workface'],
    }),
    calibration: calibration(['life_safety_linkage_pass_date']),
  }),
  template({
    templateId: 't2-tod-upper-cover-mep-interface-rhythm-v1',
    templateName: 'TOD upper-cover MEP rail-interface and tower service rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['tod_upper_cover'],
      phaseWindows: ['mep', 'superstructure'],
      divisionFamilies: ['mep_systems', 'specialty_business_systems'],
      subdivisionFamilies: ['rail_interface_mep_protection', 'transfer_deck_service_roughin', 'tower_service_release'],
      methodVariantCodes: ['tod_transfer_deck', 'rail_interface_protection', 'tower_service_riser'],
      structureTypeCodes: ['tod_upper_cover', 'mep_integrated', 'commercial_complex'],
      requiredScopeDimensions: ['zone', 'system', 'building'],
    },
    parentWindowDays: { p20: 30, p50: 46, p80: 70 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['rail_interface_mep_protection_gate', 'deck_embedded_service_review', 'utility_riser_and_transfer_installation', 'tower_service_branch_release', 'rail_safety_isolation_check', 'tower_mep_handover_gate', 'tod_mep_interface_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasRailInterfaceProtection', 'hasTransferDeckScope'],
      optionalFacts: ['hasUpperTowerScope', 'hasUtilityTieInInterface'],
      compatible: ['transfer_deck_before_upper_tower'],
      incompatible: ['tower_service_start_without_transfer_deck_release', 'rail_interface_unprotected'],
      units: ['system', 'zone', 'building'],
    }),
    calibration: calibration(['tod_mep_interface_handover_date']),
  }),
  template({
    templateId: 't2-tod-rail-interface-commissioning-handover-rhythm-v1',
    templateName: 'TOD rail-interface commissioning safety and upper-cover handover rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['tod_upper_cover'],
      phaseWindows: ['commissioning', 'handover', 'opening'],
      divisionFamilies: ['commissioning_handover', 'specialty_business_systems'],
      subdivisionFamilies: ['rail_interface_safety_acceptance', 'upper_cover_system_commissioning', 'tod_operation_handover'],
      methodVariantCodes: ['rail_interface_protection', 'integrated_commissioning', 'tod_opening_preparation'],
      structureTypeCodes: ['tod_upper_cover', 'large_public', 'mep_integrated'],
      requiredScopeDimensions: ['zone', 'system'],
    },
    parentWindowDays: { p20: 28, p50: 42, p80: 64 },
    workfaceUnit: 'zone',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['rail_safety_acceptance_readiness_gate', 'single_system_commissioning', 'rail_interface_joint_inspection', 'upper_cover_integrated_test', 'operation_readiness_drill', 'owner_or_authority_acceptance_gate', 'tod_operation_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasRailInterfaceProtection', 'hasOperationHandoverGate'],
      optionalFacts: ['hasAuthorityOpeningAcceptance', 'hasUpperTowerScope'],
      compatible: ['rail_interface_acceptance_before_operation_handover'],
      incompatible: ['operation_handover_without_rail_safety_acceptance', 'upper_cover_opening_without_integrated_test'],
      units: ['zone', 'system', 'building'],
    }),
    calibration: calibration(['tod_operation_handover_date']),
  }),
  template({
    templateId: 't2-modular-building-site-foundation-anchor-readiness-rhythm-v1',
    templateName: 'Modular building site foundation anchor and lift-readiness rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['modular_building'],
      phaseWindows: ['foundation', 'superstructure'],
      divisionFamilies: ['foundation_and_basement', 'superstructure', 'specialty_business_systems'],
      subdivisionFamilies: ['site_foundation_anchor', 'module_lift_path_preparation', 'base_connection_readiness'],
      methodVariantCodes: ['modular_mic', 'anchor_bolt_positioning', 'site_lift_preparation'],
      structureTypeCodes: ['modular_building', 'steel_assembly', 'prefabricated_concrete'],
      requiredScopeDimensions: ['building', 'zone', 'factory_lot'],
    },
    parentWindowDays: { p20: 18, p50: 28, p80: 44 },
    workfaceUnit: 'zone',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['foundation_anchor_readiness_gate', 'pile_or_base_slab_closeout', 'anchor_bolt_survey_and_correction', 'site_lift_path_and_crane_pad_preparation', 'module_delivery_staging_release', 'first_module_trial_set_acceptance_gate', 'foundation_module_interface_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasModuleFoundationScope', 'hasAnchorSurveyControl'],
      optionalFacts: ['hasCranePadConstraint', 'hasFirstModuleTrialSet'],
      compatible: ['factory_lot_parallel_with_site_foundation', 'module_lift_after_anchor_acceptance'],
      incompatible: ['module_lift_without_anchor_survey', 'factory_release_without_site_lift_path'],
      units: ['zone', 'building', 'factory_lot'],
    }),
    calibration: calibration(['anchor_survey_acceptance_date', 'first_module_trial_set_date']),
  }),
  template({
    templateId: 't2-modular-building-stacked-module-envelope-closeout-rhythm-v1',
    templateName: 'Modular building stacked module envelope and vertical connection closeout rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['modular_building'],
      phaseWindows: ['superstructure', 'envelope', 'commissioning'],
      divisionFamilies: ['superstructure', 'envelope_facade_roof', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['stacked_module_alignment', 'module_joint_weatherproofing', 'vertical_service_connection'],
      methodVariantCodes: ['modular_mic', 'module_joint_sealing', 'vertical_mep_plug_in'],
      structureTypeCodes: ['modular_building', 'steel_assembly', 'mep_integrated'],
      requiredScopeDimensions: ['building', 'floor', 'system'],
    },
    parentWindowDays: { p20: 24, p50: 38, p80: 60 },
    workfaceUnit: 'floor',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['stacked_module_alignment_readiness_gate', 'module_lift_and_temporary_fixing', 'vertical_connection_and_tolerance_correction', 'module_joint_fire_and_waterproofing', 'vertical_mep_plug_in_test', 'envelope_weatherproof_acceptance_gate', 'stacked_module_floor_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasStackedModuleSequence', 'hasVerticalMepInterface'],
      optionalFacts: ['hasJointFireproofRequirement', 'hasFacadeModuleScope'],
      compatible: ['floor_stack_then_joint_closeout', 'mep_plug_in_after_structural_alignment'],
      incompatible: ['upper_module_stack_without_lower_alignment', 'fitout_start_without_joint_weatherproofing'],
      units: ['floor', 'building', 'system'],
    }),
    calibration: calibration(['module_stack_floor_handover_date', 'joint_weatherproof_acceptance_date']),
  }),
  template({
    templateId: 't2-tod-rail-protection-transfer-deck-readiness-rhythm-v1',
    templateName: 'TOD rail protection transfer-deck readiness and isolation rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['tod_upper_cover'],
      phaseWindows: ['foundation', 'superstructure'],
      divisionFamilies: ['foundation_and_basement', 'superstructure', 'specialty_business_systems'],
      subdivisionFamilies: ['rail_operation_protection', 'transfer_deck_readiness', 'deck_load_transfer_handover'],
      methodVariantCodes: ['rail_interface_protection', 'tod_transfer_deck', 'non_stop_operation_isolation'],
      structureTypeCodes: ['tod_upper_cover', 'large_public', 'frame_shear_wall'],
      requiredScopeDimensions: ['zone', 'building', 'system'],
    },
    parentWindowDays: { p20: 44, p50: 68, p80: 104 },
    workfaceUnit: 'zone',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['rail_operation_isolation_readiness_gate', 'protection_shed_or_monitoring_installation', 'transfer_deck_support_and_formwork', 'deck_rebar_embed_and_pour', 'load_transfer_monitoring_check', 'upper_cover_start_release_gate', 'rail_protection_deck_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasRailOperationProtection', 'hasTransferDeckScope'],
      optionalFacts: ['hasNonStopOperationConstraint', 'hasRailSettlementMonitoring'],
      compatible: ['rail_protection_before_transfer_deck', 'upper_cover_after_deck_release'],
      incompatible: ['deck_work_without_rail_isolation', 'tower_start_before_load_transfer_check'],
      units: ['zone', 'building', 'system'],
    }),
    calibration: calibration(['rail_isolation_acceptance_date', 'load_transfer_release_date']),
  }),
  template({
    templateId: 't2-tod-upper-cover-tower-standard-floor-rhythm-v1',
    templateName: 'TOD upper-cover tower standard-floor cycle after transfer-deck release rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['tod_upper_cover', 'commercial'],
      phaseWindows: ['superstructure'],
      divisionFamilies: ['superstructure', 'mep_systems'],
      subdivisionFamilies: ['upper_cover_tower_floor_cycle', 'transfer_deck_vertical_interface', 'tower_service_embed'],
      methodVariantCodes: ['tower_on_podium', 'aluminum_formwork', 'tower_service_riser'],
      structureTypeCodes: ['tod_upper_cover', 'frame_shear_wall', 'commercial_complex'],
      requiredScopeDimensions: ['building', 'floor', 'system'],
    },
    parentWindowDays: { p20: 6, p50: 8, p80: 12 },
    workfaceUnit: 'floor',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['transfer_deck_tower_release_gate', 'floor_control_and_embed_review', 'vertical_structure_form_rebar', 'horizontal_slab_form_rebar_embed', 'concrete_pour_and_curing', 'service_riser_interface_check', 'tower_floor_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasUpperTowerScope', 'hasTransferDeckRelease'],
      optionalFacts: ['hasTowerServiceRiserInterface', 'hasPodiumConstraint'],
      compatible: ['transfer_deck_before_upper_tower', 'tower_floor_cycle_after_deck_release'],
      incompatible: ['tower_floor_cycle_without_transfer_deck_release', 'riser_embed_skipped'],
      units: ['building', 'floor', 'system'],
    }),
    calibration: calibration(['tod_tower_floor_cycle_date', 'tower_service_embed_check_date']),
  }),
  template({
    templateId: 't2-renovation-structural-reinforcement-envelope-rhythm-v1',
    templateName: 'Renovation structural reinforcement envelope and occupied-interface rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['renovation'],
      phaseWindows: ['startup', 'superstructure', 'envelope', 'mep', 'decoration', 'commissioning', 'handover'],
      divisionFamilies: ['superstructure', 'envelope_facade_roof', 'mep_systems', 'decoration_fitout', 'commissioning_handover'],
      subdivisionFamilies: ['structural_reinforcement', 'existing_envelope_repair', 'mep_relocation_and_restore', 'occupied_interface_handover'],
      methodVariantCodes: ['structural_reinforcement', 'facade_repair', 'phased_decanting'],
      structureTypeCodes: ['renovation', 'existing_structure', 'fitout'],
      requiredScopeDimensions: ['zone', 'room', 'workface'],
    },
    parentWindowDays: { p20: 26, p50: 40, p80: 64 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['occupied_zone_structural_survey_gate', 'temporary_support_and_protection', 'reinforcement_or_opening_work', 'existing_envelope_repair_closeout', 'mep_restore_and_safety_test', 'user_reentry_quality_acceptance_gate', 'reinforced_zone_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasStructuralReinforcementScope', 'hasOccupiedZoneConstraint'],
      optionalFacts: ['hasFacadeRepairScope', 'hasTemporarySupportDesign'],
      compatible: ['survey_then_reinforcement_then_reentry', 'phased_decanting_then_zone_handover'],
      incompatible: ['reinforcement_without_temporary_support', 'user_reentry_without_safety_test'],
      units: ['zone', 'room', 'workface'],
    }),
    calibration: calibration(['reinforcement_acceptance_date', 'occupied_zone_reentry_date']),
  }),
  template({
    templateId: 't2-renovation-energy-envelope-mep-verification-rhythm-v1',
    templateName: 'Renovation energy envelope MEP and performance-verification rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['renovation'],
      phaseWindows: ['startup', 'envelope', 'mep', 'commissioning', 'handover'],
      divisionFamilies: ['envelope_facade_roof', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['energy_envelope_retrofit', 'high_efficiency_mep_upgrade', 'metering_performance_verification'],
      methodVariantCodes: ['energy_retrofit', 'facade_repair', 'mep_energy_upgrade'],
      structureTypeCodes: ['renovation', 'existing_structure', 'fitout'],
      requiredScopeDimensions: ['zone', 'system', 'workface'],
    },
    parentWindowDays: { p20: 30, p50: 46, p80: 70 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['energy_audit_and_workface_release', 'envelope_and_window_mockup_release', 'facade_insulation_and_window_replacement', 'roof_insulation_and_thermal_bridge_closeout', 'high_efficiency_mep_and_lighting_upgrade', 'metering_and_energy_monitoring_integration', 'envelope_mep_performance_verification', 'energy_acceptance_and_operation_handover'],
    compatibility: compatibility({
      requiredFacts: ['hasEnergyRetrofitScope', 'hasOccupiedZoneConstraint'],
      optionalFacts: ['hasEnvelopeReplacementScope', 'hasMeteringUpgradeScope'],
      compatible: ['envelope_and_mep_parallel_by_released_zone', 'performance_verification_after_system_closeout'],
      incompatible: ['performance_test_before_envelope_closeout', 'occupied_zone_cutover_without_temporary_service'],
      units: ['zone', 'system', 'workface'],
    }),
    calibration: calibration(['envelope_performance_test_date', 'energy_acceptance_date']),
  }),
  template({
    templateId: 't2-renovation-heritage-craft-minimal-intervention-rhythm-v1',
    templateName: 'Heritage renovation traditional-craft and minimal-intervention rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['renovation'],
      phaseWindows: ['startup', 'superstructure', 'envelope', 'mep', 'decoration', 'commissioning', 'handover'],
      divisionFamilies: ['superstructure', 'envelope_facade_roof', 'mep_systems', 'decoration_fitout', 'commissioning_handover'],
      subdivisionFamilies: ['traditional_craft_repair', 'heritage_envelope_restoration', 'minimal_intervention_mep', 'heritage_acceptance_handover'],
      methodVariantCodes: ['heritage_conservation', 'reversible_repair', 'minimal_intervention'],
      structureTypeCodes: ['renovation', 'existing_structure', 'heritage_building'],
      requiredScopeDimensions: ['zone', 'room', 'workface'],
    },
    parentWindowDays: { p20: 36, p50: 56, p80: 88 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['heritage_survey_and_protection_boundary_release', 'traditional_material_sampling_and_trial_repair', 'reversible_support_and_substrate_stabilization', 'traditional_craft_zone_repair', 'heritage_envelope_and_roof_restoration', 'minimal_intervention_mep_and_fire_recovery', 'painted_decoration_and_micro_environment_closeout', 'expert_review_and_hidden_acceptance', 'heritage_archive_acceptance_and_opening_handover'],
    compatibility: compatibility({
      requiredFacts: ['hasHeritageConservationScope', 'hasExpertReviewGate'],
      optionalFacts: ['hasTraditionalMaterialScope', 'hasMinimalInterventionMepScope'],
      compatible: ['trial_repair_before_batch_traditional_craft', 'expert_release_before_irreversible_closeout'],
      incompatible: ['batch_repair_without_trial_sample', 'concealment_before_conservation_record'],
      units: ['zone', 'room', 'workface'],
    }),
    calibration: calibration(['traditional_craft_sample_approval_date', 'heritage_hidden_acceptance_date']),
  }),
  template({
    templateId: 't2-industrial-steel-structure-envelope-rhythm-v1',
    templateName: 'Industrial steel structure envelope and crane-bay closure rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['industrial'],
      phaseWindows: ['superstructure', 'envelope'],
      divisionFamilies: ['superstructure', 'envelope_facade_roof', 'mep_systems'],
      subdivisionFamilies: ['industrial_steel_frame', 'crane_bay_envelope', 'utility_penetration_closeout'],
      methodVariantCodes: ['steel_frame', 'large_span_steel', 'industrial_envelope_panel'],
      structureTypeCodes: ['industrial_plant', 'steel_assembly', 'large_span_steel'],
      requiredScopeDimensions: ['bay', 'zone', 'system'],
    },
    parentWindowDays: { p20: 34, p50: 52, p80: 78 },
    workfaceUnit: 'bay',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['steel_bay_lift_readiness_gate', 'main_frame_erection_and_bolting', 'crane_beam_alignment_check', 'roof_wall_envelope_panel_installation', 'utility_penetration_firestop_closeout', 'watertight_and_crane_path_acceptance_gate', 'industrial_bay_envelope_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasIndustrialSteelBayScope', 'hasCranePathConstraint'],
      optionalFacts: ['hasUtilityPenetrationInterface', 'hasRoofPanelScope'],
      compatible: ['steel_frame_before_equipment_install', 'envelope_closeout_before_process_fitout'],
      incompatible: ['equipment_install_before_steel_alignment', 'process_start_without_watertight_closeout'],
      units: ['bay', 'zone', 'system'],
    }),
    calibration: calibration(['steel_bay_alignment_acceptance_date', 'industrial_bay_watertight_date']),
  }),
  template({
    templateId: 't2-data-center-power-room-equipment-installation-rhythm-v1',
    templateName: 'Data center power-room heavy equipment installation and energization rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['data_center'],
      phaseWindows: ['mep', 'commissioning'],
      divisionFamilies: ['mep_systems', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['power_room_heavy_equipment', 'energization_readiness', 'redundancy_branch_handover'],
      methodVariantCodes: ['ups_parallel', 'heavy_equipment_placement', 'medium_voltage_energization'],
      structureTypeCodes: ['mission_critical_room', 'data_center_building', 'mep_integrated'],
      requiredScopeDimensions: ['room', 'system', 'zone'],
    },
    parentWindowDays: { p20: 32, p50: 50, p80: 76 },
    workfaceUnit: 'room',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['power_room_access_readiness_gate', 'plinth_and_cable_trench_closeout', 'transformer_ups_switchgear_placement', 'busway_cable_termination', 'pre_energization_inspection_and_ir_test', 'redundancy_branch_energization_acceptance_gate', 'power_room_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasPowerRoomScope', 'hasHeavyEquipmentAccessPlan'],
      optionalFacts: ['hasMediumVoltageInterface', 'hasRedundancyTopology'],
      compatible: ['equipment_access_before_power_room_install', 'energization_after_ir_test'],
      incompatible: ['energization_without_preinspection', 'white_space_handover_without_power_branch_ready'],
      units: ['room', 'system', 'zone'],
    }),
    calibration: calibration(['power_equipment_placement_date', 'branch_energization_acceptance_date']),
  }),
  template({
    templateId: 't2-transport-hub-station-hall-fitout-handover-rhythm-v1',
    templateName: 'Transportation hub station-hall public fitout and handover rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['transportation_hub'],
      phaseWindows: ['decoration', 'commissioning', 'handover'],
      divisionFamilies: ['decoration_fitout', 'mep_systems', 'commissioning_handover', 'specialty_business_systems'],
      subdivisionFamilies: ['station_hall_public_fitout', 'passenger_flow_device_finish', 'station_hall_handover'],
      methodVariantCodes: ['public_area_fitout', 'passenger_flow_trial', 'traffic_transfer_system'],
      structureTypeCodes: ['transportation_hub', 'large_public', 'fitout'],
      requiredScopeDimensions: ['zone', 'system', 'workface'],
    },
    parentWindowDays: { p20: 30, p50: 46, p80: 72 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['station_hall_watertight_release_gate', 'ceiling_wall_floor_public_finish', 'ticket_gate_security_and_guidance_interface', 'fire_life_safety_terminal_closeout', 'passenger_flow_trial_walkthrough', 'operator_punch_list_acceptance_gate', 'station_hall_public_area_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasStationHallPublicArea', 'hasOperatorHandoverGate'],
      optionalFacts: ['hasPassengerFlowDeviceScope', 'hasAuthorityOpeningAcceptance'],
      compatible: ['public_fitout_after_watertight_release', 'operator_walkthrough_before_opening'],
      incompatible: ['trial_operation_without_life_safety_terminal', 'public_opening_without_operator_punch_list'],
      units: ['zone', 'system', 'workface'],
    }),
    calibration: calibration(['station_hall_operator_acceptance_date', 'passenger_flow_trial_walkthrough_date']),
  }),
  template({
    templateId: 't2-tod-upper-cover-podium-public-fitout-rhythm-v1',
    templateName: 'TOD upper-cover podium public fitout and retail opening rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['tod_upper_cover', 'commercial'],
      phaseWindows: ['decoration', 'commissioning', 'opening'],
      divisionFamilies: ['decoration_fitout', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['tod_podium_public_fitout', 'retail_common_area_handover', 'upper_cover_opening_readiness'],
      methodVariantCodes: ['tod_podium_public_fitout', 'retail_public_area_fitout', 'opening_preparation'],
      structureTypeCodes: ['tod_upper_cover', 'commercial_complex', 'fitout'],
      requiredScopeDimensions: ['zone', 'system', 'workface'],
    },
    parentWindowDays: { p20: 34, p50: 52, p80: 80 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['podium_watertight_and_mep_readiness_gate', 'public_ceiling_wall_floor_finish', 'retail_common_area_interface_installation', 'fire_and_life_safety_terminal_test', 'tenant_or_operator_punch_list', 'opening_readiness_acceptance_gate', 'tod_podium_public_area_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasTodPodiumPublicArea', 'hasOpeningReadinessGate'],
      optionalFacts: ['hasRetailTenantInterface', 'hasRailOperationConstraint'],
      compatible: ['public_fitout_after_watertight_release', 'opening_after_life_safety_terminal_test'],
      incompatible: ['tenant_fitout_without_public_mep_ready', 'opening_without_operator_acceptance'],
      units: ['zone', 'system', 'workface'],
    }),
    calibration: calibration(['tod_podium_opening_acceptance_date', 'retail_common_area_handover_date']),
  }),
  template({
    templateId: 't2-tod-rail-interface-night-window-utility-tiein-rhythm-v1',
    templateName: 'TOD rail-interface night-window utility tie-in rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['tod_upper_cover'],
      phaseWindows: ['mep', 'commissioning'],
      divisionFamilies: ['mep_systems', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['rail_night_window_tiein', 'utility_shutdown_switching', 'rail_interface_recovery'],
      methodVariantCodes: ['rail_interface_protection', 'night_window_tiein', 'utility_cutover'],
      structureTypeCodes: ['tod_upper_cover', 'mep_integrated', 'large_public'],
      requiredScopeDimensions: ['system', 'zone', 'workface'],
    },
    parentWindowDays: { p20: 20, p50: 32, p80: 50 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['night_window_permit_readiness_gate', 'temporary_isolation_and_monitoring', 'utility_shutdown_and_tiein_work', 'service_recovery_and_pressure_test', 'rail_operation_safety_inspection', 'joint_acceptance_and_reopen_gate', 'night_window_tiein_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasRailNightWindowPermit', 'hasUtilityTieInInterface'],
      optionalFacts: ['hasOperationShutdownWindow', 'hasEmergencyRecoveryPlan'],
      compatible: ['tiein_inside_approved_night_window', 'service_recovery_before_rail_reopen'],
      incompatible: ['utility_tiein_without_shutdown_permit', 'rail_reopen_without_safety_inspection'],
      units: ['system', 'zone', 'workface'],
    }),
    calibration: calibration(['night_window_tiein_finish_date', 'rail_reopen_acceptance_date']),
  }),
  template({
    templateId: 't2-industrial-process-piping-equipment-commissioning-rhythm-v1',
    templateName: 'Industrial process piping equipment and utility commissioning rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['industrial'],
      phaseWindows: ['mep', 'commissioning'],
      divisionFamilies: ['mep_systems', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['process_piping_installation', 'equipment_loop_commissioning', 'trial_production_readiness'],
      methodVariantCodes: ['process_piping', 'process_equipment_installation', 'utility_commissioning'],
      structureTypeCodes: ['industrial_plant', 'mep_integrated', 'process_facility'],
      requiredScopeDimensions: ['system', 'bay', 'zone'],
    },
    parentWindowDays: { p20: 38, p50: 58, p80: 88 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['equipment_foundation_and_access_readiness_gate', 'process_piping_prefab_and_supports', 'equipment_setting_and_alignment', 'piping_pressure_or_cleaning_test', 'utility_loop_commissioning', 'trial_production_readiness_acceptance_gate', 'process_system_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasProcessPipingScope', 'hasProcessEquipmentInterface'],
      optionalFacts: ['hasCleanroomOrSpecialMedium', 'hasTrialProductionGate'],
      compatible: ['piping_after_equipment_foundation_handover', 'trial_production_after_utility_loop_pass'],
      incompatible: ['pressure_test_without_support_closeout', 'trial_production_without_utility_commissioning'],
      units: ['system', 'bay', 'zone'],
    }),
    calibration: calibration(['process_piping_test_pass_date', 'trial_production_readiness_date']),
  }),
  template({
    templateId: 't2-industrial-logistics-warehouse-mezzanine-fitout-rhythm-v1',
    templateName: 'Industrial logistics warehouse mezzanine and fitout handover rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['industrial'],
      phaseWindows: ['superstructure', 'decoration', 'handover'],
      divisionFamilies: ['superstructure', 'decoration_fitout', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['warehouse_mezzanine_structure', 'logistics_floor_hardened_finish', 'warehouse_operation_handover'],
      methodVariantCodes: ['logistics_warehouse_fitout', 'warehouse_floor_hardening', 'mezzanine_steel_frame'],
      structureTypeCodes: ['industrial_plant', 'steel_assembly', 'logistics_warehouse'],
      requiredScopeDimensions: ['bay', 'zone', 'workface'],
    },
    parentWindowDays: { p20: 30, p50: 46, p80: 70 },
    workfaceUnit: 'bay',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['warehouse_bay_structure_readiness_gate', 'mezzanine_or_platform_steel_installation', 'floor_hardening_and_joint_work', 'dock_door_and_loading_interface', 'fire_life_safety_terminal_check', 'operation_walkthrough_acceptance_gate', 'warehouse_zone_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasWarehouseBayScope', 'hasOperationHandoverGate'],
      optionalFacts: ['hasAgvOrRackInterface', 'hasLoadingDockScope'],
      compatible: ['mezzanine_before_operation_fitout', 'floor_hardening_before_rack_or_agv'],
      incompatible: ['rack_install_before_floor_acceptance', 'operation_handover_without_fire_terminal_check'],
      units: ['bay', 'zone', 'workface'],
    }),
    calibration: calibration(['warehouse_floor_acceptance_date', 'operation_walkthrough_date']),
  }),
  template({
    templateId: 't2-transport-hub-platform-canopy-trackside-interface-rhythm-v1',
    templateName: 'Transportation hub platform canopy and trackside interface rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['transportation_hub'],
      phaseWindows: ['superstructure', 'envelope', 'commissioning'],
      divisionFamilies: ['superstructure', 'envelope_facade_roof', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['platform_canopy_trackside', 'trackside_interface_protection', 'platform_operation_handover'],
      methodVariantCodes: ['platform_canopy_installation', 'trackside_protection', 'traffic_transfer_system'],
      structureTypeCodes: ['transportation_hub', 'large_span_steel', 'large_public'],
      requiredScopeDimensions: ['bay', 'zone', 'system'],
    },
    parentWindowDays: { p20: 36, p50: 56, p80: 84 },
    workfaceUnit: 'bay',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['trackside_protection_readiness_gate', 'platform_canopy_support_installation', 'roof_panel_and_drainage_closeout', 'platform_edge_device_interface', 'trackside_safety_and_clearance_check', 'traffic_transfer_acceptance_gate', 'platform_canopy_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasPlatformInterface', 'hasTracksideProtectionPlan'],
      optionalFacts: ['hasOperatingLineConstraint', 'hasPlatformEdgeDeviceScope'],
      compatible: ['trackside_protection_before_canopy_work', 'traffic_transfer_after_clearance_check'],
      incompatible: ['canopy_lift_without_trackside_protection', 'platform_opening_without_clearance_acceptance'],
      units: ['bay', 'zone', 'system'],
    }),
    calibration: calibration(['platform_canopy_watertight_date', 'trackside_clearance_acceptance_date']),
  }),
  template({
    templateId: 't2-hospital-operating-room-cleanroom-fitout-rhythm-v1',
    templateName: 'Hospital operating-room cleanroom fitout and validation rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['hospital'],
      phaseWindows: ['decoration', 'commissioning', 'handover'],
      divisionFamilies: ['decoration_fitout', 'mep_systems', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['operating_room_cleanroom_fitout', 'medical_hvac_validation', 'or_handover_acceptance'],
      methodVariantCodes: ['operating_room_cleanroom', 'medical_hvac_validation', 'infection_control_finish'],
      structureTypeCodes: ['medical_cleanroom_system', 'mep_integrated', 'fitout'],
      requiredScopeDimensions: ['room', 'system', 'zone'],
    },
    parentWindowDays: { p20: 36, p50: 54, p80: 82 },
    workfaceUnit: 'room',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['or_room_shell_and_hvac_readiness_gate', 'clean_wall_ceiling_floor_installation', 'medical_hvac_terminal_and_controls', 'laminar_flow_or_pressure_validation', 'medical_gas_and_power_terminal_check', 'infection_control_acceptance_gate', 'operating_room_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasOperatingRoomScope', 'hasMedicalHvacReadiness'],
      optionalFacts: ['hasLaminarFlowRequirement', 'hasMedicalGasTerminalScope'],
      compatible: ['or_fitout_after_watertight_release', 'infection_control_after_hvac_validation'],
      incompatible: ['or_handover_without_pressure_validation', 'medical_terminal_check_skipped'],
      units: ['room', 'system', 'zone'],
    }),
    calibration: calibration(['or_pressure_validation_date', 'operating_room_acceptance_date']),
  }),
  template({
    templateId: 't2-hospital-medical-equipment-installation-acceptance-rhythm-v1',
    templateName: 'Hospital medical equipment installation and acceptance rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['hospital'],
      phaseWindows: ['decoration', 'commissioning', 'handover'],
      divisionFamilies: ['specialty_business_systems', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['large_medical_equipment_installation', 'medical_equipment_interface_test', 'department_equipment_acceptance'],
      methodVariantCodes: ['medical_equipment_installation', 'shielding_room_interface', 'equipment_vendor_commissioning'],
      structureTypeCodes: ['medical_building', 'mep_integrated', 'special_equipment_room'],
      requiredScopeDimensions: ['room', 'system', 'zone'],
    },
    parentWindowDays: { p20: 30, p50: 48, p80: 74 },
    workfaceUnit: 'room',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['equipment_room_access_readiness_gate', 'plinth_shielding_or_anchor_closeout', 'large_equipment_delivery_and_setting', 'power_cooling_medical_gas_interface_test', 'vendor_commissioning_and_calibration', 'department_user_acceptance_gate', 'medical_equipment_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasMedicalEquipmentInterface', 'hasEquipmentRoomAccessPlan'],
      optionalFacts: ['hasShieldingRoomScope', 'hasVendorCommissioningPlan'],
      compatible: ['equipment_install_after_room_interface_ready', 'department_acceptance_after_vendor_commissioning'],
      incompatible: ['equipment_delivery_without_access_plan', 'department_handover_without_vendor_calibration'],
      units: ['room', 'system', 'zone'],
    }),
    calibration: calibration(['medical_equipment_delivery_date', 'vendor_commissioning_acceptance_date']),
  }),
  template({
    templateId: 't2-sports-culture-bowl-public-area-fitout-rhythm-v1',
    templateName: 'Sports culture bowl public-area fitout and crowd-flow handover rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['sports_culture'],
      phaseWindows: ['decoration', 'commissioning', 'opening'],
      divisionFamilies: ['decoration_fitout', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['bowl_public_area_fitout', 'crowd_flow_life_safety', 'event_area_handover'],
      methodVariantCodes: ['bowl_public_area_fitout', 'crowd_flow_life_safety', 'event_handover'],
      structureTypeCodes: ['sports_venue', 'large_public', 'fitout'],
      requiredScopeDimensions: ['zone', 'system', 'workface'],
    },
    parentWindowDays: { p20: 32, p50: 50, p80: 78 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['bowl_public_area_readiness_gate', 'seating_bowl_finish_and_railings', 'concourse_ceiling_wall_floor_finish', 'crowd_flow_signage_and_barrier_installation', 'fire_life_safety_terminal_test', 'event_area_acceptance_gate', 'sports_bowl_public_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasSportsBowlPublicArea', 'hasEventHandoverGate'],
      optionalFacts: ['hasCrowdFlowRequirement', 'hasSeatingBowlScope'],
      compatible: ['public_area_fitout_after_envelope_closeout', 'event_acceptance_after_life_safety_test'],
      incompatible: ['event_rehearsal_without_public_area_acceptance', 'crowd_flow_opening_without_life_safety_test'],
      units: ['zone', 'system', 'workface'],
    }),
    calibration: calibration(['sports_public_area_acceptance_date', 'crowd_flow_test_date']),
  }),
  template({
    templateId: 't2-sports-culture-event-systems-commissioning-rhythm-v1',
    templateName: 'Sports culture event systems commissioning and rehearsal rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['sports_culture'],
      phaseWindows: ['commissioning', 'opening'],
      divisionFamilies: ['specialty_business_systems', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['event_av_broadcast_systems', 'venue_security_ticketing', 'event_rehearsal_handover'],
      methodVariantCodes: ['event_av_commissioning', 'broadcast_system_integration', 'event_rehearsal'],
      structureTypeCodes: ['sports_venue', 'large_public', 'mep_integrated'],
      requiredScopeDimensions: ['system', 'zone'],
    },
    parentWindowDays: { p20: 24, p50: 38, p80: 60 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['event_system_power_network_readiness_gate', 'audio_video_broadcast_installation', 'ticketing_security_and_access_control_linkage', 'fire_life_safety_event_mode_test', 'full_event_rehearsal_and_defect_closeout', 'operator_event_acceptance_gate', 'venue_event_system_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasEventSystemScope', 'hasOperatorEventAcceptance'],
      optionalFacts: ['hasBroadcastRequirement', 'hasTicketingSecurityInterface'],
      compatible: ['event_system_commissioning_after_base_mep_ready', 'operator_acceptance_after_full_rehearsal'],
      incompatible: ['event_opening_without_rehearsal', 'broadcast_test_without_power_network_ready'],
      units: ['system', 'zone', 'workface'],
    }),
    calibration: calibration(['full_event_rehearsal_date', 'operator_event_acceptance_date']),
  }),
  template({
    templateId: 't2-general-civil-basement-podium-commercial-fitout-rhythm-v1',
    templateName: 'General civil basement podium commercial fitout and opening rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['general_civil', 'commercial', 'residential'],
      phaseWindows: ['decoration', 'commissioning', 'opening'],
      divisionFamilies: ['decoration_fitout', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['basement_podium_commercial_fitout', 'podium_public_mep_terminal', 'commercial_opening_handover'],
      methodVariantCodes: ['commercial_podium_fitout', 'public_area_fitout', 'opening_preparation'],
      structureTypeCodes: ['commercial_complex', 'basement_podium', 'fitout'],
      requiredScopeDimensions: ['zone', 'system', 'workface'],
    },
    parentWindowDays: { p20: 36, p50: 56, p80: 84 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['podium_structure_and_watertight_readiness_gate', 'basement_podium_public_fitout', 'mep_terminal_controls_and_fire_closeout', 'tenant_interface_and_common_area_finish', 'opening_defect_and_life_safety_check', 'commercial_opening_acceptance_gate', 'podium_commercial_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasPodiumCommercialScope', 'hasOpeningReadinessGate'],
      optionalFacts: ['hasTenantInterface', 'hasBasementPublicArea'],
      compatible: ['podium_fitout_after_watertight_release', 'opening_after_life_safety_closeout'],
      incompatible: ['tenant_entry_without_common_area_ready', 'opening_without_fire_closeout'],
      units: ['zone', 'system', 'workface'],
    }),
    calibration: calibration(['commercial_opening_acceptance_date', 'podium_public_area_handover_date']),
  }),
  template({
    templateId: 't2-school-dormitory-canteen-handover-rhythm-v1',
    templateName: 'School dormitory canteen fitout and campus handover rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['school'],
      phaseWindows: ['decoration', 'commissioning', 'handover'],
      divisionFamilies: ['decoration_fitout', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['dormitory_room_fitout', 'canteen_kitchen_systems', 'campus_living_area_handover'],
      methodVariantCodes: ['dormitory_fitout', 'canteen_kitchen_system', 'school_opening_preparation'],
      structureTypeCodes: ['campus', 'fitout', 'mep_integrated'],
      requiredScopeDimensions: ['building', 'room', 'system'],
    },
    parentWindowDays: { p20: 26, p50: 40, p80: 62 },
    workfaceUnit: 'room',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['living_area_room_readiness_gate', 'dormitory_room_batch_fitout', 'canteen_kitchen_mep_and_equipment', 'water_power_fire_terminal_test', 'environmental_and_food_safety_check', 'school_living_area_acceptance_gate', 'dormitory_canteen_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasDormitoryOrCanteenScope', 'hasSchoolOpeningDateGate'],
      optionalFacts: ['hasKitchenEquipmentScope', 'hasEnvironmentalCheckRequirement'],
      compatible: ['living_area_fitout_before_school_opening', 'canteen_acceptance_after_mep_terminal_test'],
      incompatible: ['student_move_in_without_environment_check', 'canteen_opening_without_food_safety_check'],
      units: ['building', 'room', 'system'],
    }),
    calibration: calibration(['school_living_area_acceptance_date', 'canteen_safety_check_date']),
  }),
  template({
    templateId: 't2-hotel-guestroom-mockup-batch-fitout-rhythm-v1',
    templateName: 'Hotel guestroom mockup approval and batch fitout rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['hotel'],
      phaseWindows: ['decoration', 'commissioning', 'opening'],
      divisionFamilies: ['decoration_fitout', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['guestroom_mockup_approval', 'guestroom_batch_fitout', 'hotel_operator_opening_acceptance'],
      methodVariantCodes: ['guestroom_fitout', 'mockup_room_approval', 'hotel_operator_punch'],
      structureTypeCodes: ['hotel_tower', 'fitout', 'mep_integrated'],
      requiredScopeDimensions: ['floor', 'room', 'system'],
    },
    parentWindowDays: { p20: 32, p50: 50, p80: 76 },
    workfaceUnit: 'room',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['mockup_room_approval_readiness_gate', 'guestroom_mep_terminal_and_waterproof', 'wall_floor_ceiling_and_fixed_furniture', 'bathroom_fixture_and_controls_test', 'operator_punch_list_batch_closeout', 'room_release_acceptance_gate', 'hotel_guestroom_batch_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasGuestroomScope', 'hasHotelOperatorPunchList'],
      optionalFacts: ['hasMockupRoomApproval', 'hasBathroomPodOrWetArea'],
      compatible: ['batch_fitout_after_mockup_approval', 'room_release_after_operator_punch_closeout'],
      incompatible: ['batch_fitout_without_mockup_approval', 'guestroom_opening_without_operator_acceptance'],
      units: ['floor', 'room', 'system'],
    }),
    calibration: calibration(['mockup_room_approval_date', 'guestroom_batch_release_date']),
  }),
  template({
    templateId: 't2-industrial-heavy-equipment-lifting-rhythm-v1',
    templateName: 'Industrial heavy equipment foundation lifting alignment and load-trial rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['industrial'],
      phaseWindows: ['foundation', 'superstructure', 'mep', 'commissioning'],
      divisionFamilies: ['foundation_and_basement', 'superstructure', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['heavy_equipment_foundation', 'heavy_lift_route', 'equipment_alignment_grouting', 'load_trial'],
      methodVariantCodes: ['heavy_equipment_installation', 'large_equipment_lifting', 'crane_path_control'],
      structureTypeCodes: ['heavy_industrial_plant', 'industrial_plant', 'steel_assembly'],
      requiredScopeDimensions: ['bay', 'zone', 'system'],
    },
    parentWindowDays: { p20: 52, p50: 78, p80: 116 },
    workfaceUnit: 'bay',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['heavy_foundation_strength_readiness_gate', 'lift_route_and_crane_system_release', 'equipment_heavy_lift_and_setting', 'alignment_and_secondary_grouting', 'utility_connection_and_no_load_trial', 'heavy_load_trial_acceptance_gate', 'heavy_equipment_production_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasHeavyEquipmentBay', 'hasLargeEquipmentLiftPlan'],
      optionalFacts: ['hasCranePathConstraint', 'hasHeavyLoadTrialGate'],
      compatible: ['foundation_strength_before_heavy_lift', 'secondary_grouting_after_alignment'],
      incompatible: ['heavy_lift_without_route_release', 'load_trial_without_utility_readiness'],
      units: ['bay', 'zone', 'system'],
    }),
    calibration: calibration(['heavy_foundation_strength_date', 'heavy_load_trial_acceptance_date']),
  }),
  template({
    templateId: 't2-industrial-clean-utility-validation-rhythm-v1',
    templateName: 'Industrial controlled environment clean utility and process-validation rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['industrial'],
      phaseWindows: ['envelope', 'mep', 'commissioning'],
      divisionFamilies: ['envelope_facade_roof', 'mep_systems', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['controlled_environment_shell', 'clean_utility_loop', 'equipment_iq_oq', 'process_validation'],
      methodVariantCodes: ['process_piping', 'clean_utility', 'utility_commissioning'],
      structureTypeCodes: ['process_facility', 'industrial_plant', 'mep_integrated'],
      requiredScopeDimensions: ['zone', 'system', 'workface'],
    },
    parentWindowDays: { p20: 46, p50: 70, p80: 106 },
    workfaceUnit: 'system',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['controlled_environment_shell_readiness_gate', 'clean_utility_installation_and_test', 'utility_cleaning_sampling_and_stability', 'equipment_iq_oq_interface', 'process_loop_integrated_validation', 'trial_production_release_gate', 'process_validation_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasProcessUtilityScope', 'hasControlledProductionEnvironment'],
      optionalFacts: ['hasEquipmentIqOqRequirement', 'hasTrialProductionGate'],
      compatible: ['clean_utility_after_controlled_shell', 'trial_production_after_process_validation'],
      incompatible: ['sampling_without_cleaning_closeout', 'trial_production_without_utility_stability'],
      units: ['zone', 'system', 'workface'],
    }),
    calibration: calibration(['clean_utility_validation_date', 'process_trial_release_date']),
  }),
  template({
    templateId: 't2-transport-hub-metro-night-window-transfer-rhythm-v1',
    templateName: 'Metro interchange live-operation protection night-window tie-in rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['transportation_hub'],
      phaseWindows: ['superstructure', 'mep', 'commissioning', 'opening'],
      divisionFamilies: ['superstructure', 'mep_systems', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['metro_operation_protection', 'interchange_passage', 'night_window_tiein', 'phased_opening'],
      methodVariantCodes: ['night_window_tiein', 'metro_transfer_passage', 'traffic_transfer_system'],
      structureTypeCodes: ['underground_station', 'transportation_hub', 'large_public'],
      requiredScopeDimensions: ['zone', 'system', 'workface'],
    },
    parentWindowDays: { p20: 34, p50: 52, p80: 80 },
    workfaceUnit: 'zone',
    overlapPolicy: 'sequential_with_controlled_overlap',
    windowRoles: ['metro_operation_protection_readiness_gate', 'interchange_passage_workface_release', 'night_window_isolation_and_tiein', 'service_recovery_and_joint_test', 'peak_transfer_passenger_trial', 'metro_phased_opening_acceptance_gate', 'metro_interchange_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasMetroOperationInterface', 'hasNightWindowPermit'],
      optionalFacts: ['hasTransferPassageScope', 'hasNonStopOperationConstraint'],
      compatible: ['tiein_inside_approved_night_window', 'passenger_trial_after_service_recovery'],
      incompatible: ['night_window_work_without_operation_protection', 'opening_without_transfer_trial'],
      units: ['zone', 'system', 'workface'],
    }),
    calibration: calibration(['night_window_recovery_date', 'metro_phased_opening_date']),
  }),
  template({
    templateId: 't2-transport-hub-bus-yard-charging-rhythm-v1',
    templateName: 'Bus terminal yard charging dispatch and passenger-vehicle trial rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['transportation_hub'],
      phaseWindows: ['outdoor', 'mep', 'commissioning', 'opening'],
      divisionFamilies: ['outdoor_municipal_landscape', 'mep_systems', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['bus_yard_traffic', 'charging_fire_system', 'vehicle_dispatch', 'passenger_vehicle_trial'],
      methodVariantCodes: ['bus_yard_phasing', 'charging_system_commissioning', 'passenger_flow_trial'],
      structureTypeCodes: ['transportation_hub', 'large_public', 'mep_integrated'],
      requiredScopeDimensions: ['zone', 'system', 'workface'],
    },
    parentWindowDays: { p20: 30, p50: 46, p80: 70 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['bus_yard_pavement_and_drainage_readiness_gate', 'charging_power_and_fire_installation', 'dispatch_terminal_and_vehicle_guidance', 'vehicle_flow_and_charging_safety_test', 'passenger_vehicle_separation_trial', 'bus_operation_acceptance_gate', 'bus_terminal_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasBusYardScope', 'hasChargingSystemScope'],
      optionalFacts: ['hasDispatchCenter', 'hasPassengerVehicleSeparationRequirement'],
      compatible: ['charging_after_yard_interface_release', 'operation_after_passenger_vehicle_trial'],
      incompatible: ['charging_without_fire_linkage', 'bus_opening_without_vehicle_flow_trial'],
      units: ['zone', 'system', 'workface'],
    }),
    calibration: calibration(['charging_fire_acceptance_date', 'bus_operation_trial_date']),
  }),
  template({
    templateId: 't2-sports-culture-theater-stage-acoustic-rhythm-v1',
    templateName: 'Theater auditorium acoustic stage-machinery and performance-rehearsal rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['sports_culture'],
      phaseWindows: ['decoration', 'commissioning', 'opening'],
      divisionFamilies: ['decoration_fitout', 'specialty_business_systems', 'mep_systems', 'commissioning_handover'],
      subdivisionFamilies: ['auditorium_acoustic_fitout', 'stage_machinery', 'performance_systems', 'dress_rehearsal'],
      methodVariantCodes: ['stage_machinery', 'acoustic_fitout', 'performance_rehearsal'],
      structureTypeCodes: ['theater_building', 'large_public', 'mep_integrated'],
      requiredScopeDimensions: ['zone', 'system', 'workface'],
    },
    parentWindowDays: { p20: 38, p50: 58, p80: 88 },
    workfaceUnit: 'zone',
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    windowRoles: ['theater_shell_and_grid_readiness_gate', 'auditorium_acoustic_fitout', 'stage_machinery_and_fire_curtain', 'lighting_audio_video_system_commissioning', 'full_dress_rehearsal_and_defect_closeout', 'operator_performance_acceptance_gate', 'theater_operation_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasTheaterAuditorium', 'hasStageMachineryScope'],
      optionalFacts: ['hasAcousticPerformanceTarget', 'hasDressRehearsalGate'],
      compatible: ['acoustic_fitout_after_shell_release', 'handover_after_full_dress_rehearsal'],
      incompatible: ['stage_test_without_fire_curtain', 'opening_without_performance_rehearsal'],
      units: ['zone', 'system', 'workface'],
    }),
    calibration: calibration(['auditorium_acoustic_acceptance_date', 'full_dress_rehearsal_date']),
  }),
  template({
    templateId: 't2-sports-culture-exhibition-environment-rhythm-v1',
    templateName: 'Museum exhibition environment display-security and trial-opening rhythm',
    confidence: 'medium',
    applicability: {
      businessTypeCodes: ['sports_culture'],
      phaseWindows: ['decoration', 'commissioning', 'opening'],
      divisionFamilies: ['decoration_fitout', 'mep_systems', 'specialty_business_systems', 'commissioning_handover'],
      subdivisionFamilies: ['collection_environment', 'exhibition_fitout', 'display_security', 'trial_opening'],
      methodVariantCodes: ['collection_environment_control', 'exhibition_fitout', 'smart_guidance'],
      structureTypeCodes: ['large_public', 'museum_building', 'mep_integrated'],
      requiredScopeDimensions: ['zone', 'room', 'system'],
    },
    parentWindowDays: { p20: 34, p50: 52, p80: 80 },
    workfaceUnit: 'zone',
    overlapPolicy: 'system_zone_commissioning',
    windowRoles: ['exhibition_shell_readiness_gate', 'collection_environment_system_installation', 'exhibition_display_and_special_lighting', 'security_guidance_and_multimedia_linkage', 'environment_stability_and_trial_opening', 'curator_operator_acceptance_gate', 'exhibition_operation_handover_closeout'],
    compatibility: compatibility({
      requiredFacts: ['hasExhibitionHall', 'hasCollectionEnvironmentRequirement'],
      optionalFacts: ['hasCollectionStorage', 'hasInteractiveDisplayScope'],
      compatible: ['display_install_after_environment_system_ready', 'opening_after_environment_stability'],
      incompatible: ['collection_entry_without_environment_validation', 'opening_without_security_linkage'],
      units: ['zone', 'room', 'system'],
    }),
    calibration: calibration(['collection_environment_stability_date', 'exhibition_trial_opening_date']),
  }),
]

type T2BusinessGenerationProfile = {
  nameSlug: string
  methodSeed: string
  structureTypeCodes: string[]
  requiredFacts: string[]
  optionalFacts: string[]
  compatibleAssumption: string
  incompatibleAssumption: string
  units: T2RhythmWorkfaceUnit[]
}

type T2ExtensionBlueprint = {
  code: string
  phaseWindows: string[]
  divisionFamilies: T2DivisionFamily[]
  subdivisionSeed: string
  methodVariantCode: string
  structureTypeCode: string
  workfaceUnit: T2RhythmWorkfaceUnit
  parentWindowDays: T2DivisionRhythmTemplate['rhythm']['parentWindowDays']
  overlapPolicy: T2DivisionRhythmTemplate['rhythm']['overlapPolicy']
  coreRole: string
}

const BUSINESS_GENERATION_PROFILES: Record<BusinessTypeCode, T2BusinessGenerationProfile> = {
  general_civil: {
    nameSlug: 'general civil',
    methodSeed: 'general_civil',
    structureTypeCodes: ['frame_shear_wall', 'commercial_complex', 'basement_podium'],
    requiredFacts: ['hasGeneralCivilScope', 'hasBuildingZoneBreakdown'],
    optionalFacts: ['hasCommercialPodium', 'hasResidentialTower'],
    compatibleAssumption: 'general_civil_controlled_parallel_workfaces',
    incompatibleAssumption: 'general_civil_template_without_scope_breakdown',
    units: ['building', 'floor', 'zone', 'section', 'system', 'workface', 'room'],
  },
  hotel: {
    nameSlug: 'hotel',
    methodSeed: 'hotel',
    structureTypeCodes: ['hotel_tower', 'fitout', 'mep_integrated'],
    requiredFacts: ['hasHotelOperatorInterface', 'hasGuestroomOrPublicAreaScope'],
    optionalFacts: ['hasMockupRoomApproval', 'hasOpeningReadinessGate'],
    compatibleAssumption: 'hotel_operator_batch_acceptance',
    incompatibleAssumption: 'hotel_opening_without_operator_acceptance',
    units: ['building', 'floor', 'room', 'zone', 'system', 'workface'],
  },
  hospital: {
    nameSlug: 'hospital',
    methodSeed: 'hospital',
    structureTypeCodes: ['medical_building', 'medical_cleanroom_system', 'mep_integrated'],
    requiredFacts: ['hasMedicalDepartmentScope', 'hasClinicalSystemInterface'],
    optionalFacts: ['hasInfectionControlRequirement', 'hasMedicalEquipmentInterface'],
    compatibleAssumption: 'hospital_department_interface_control',
    incompatibleAssumption: 'hospital_handover_without_medical_system_acceptance',
    units: ['building', 'floor', 'zone', 'room', 'system', 'workface'],
  },
  school: {
    nameSlug: 'school',
    methodSeed: 'school',
    structureTypeCodes: ['campus', 'fitout', 'mep_integrated'],
    requiredFacts: ['hasCampusFunctionZones', 'hasSchoolOpeningDateGate'],
    optionalFacts: ['hasTeachingEquipmentScope', 'hasDormitoryOrCanteenScope'],
    compatibleAssumption: 'school_campus_phased_handover',
    incompatibleAssumption: 'school_opening_without_safety_environment_acceptance',
    units: ['building', 'floor', 'zone', 'room', 'system', 'workface'],
  },
  industrial: {
    nameSlug: 'industrial',
    methodSeed: 'industrial',
    structureTypeCodes: ['industrial_plant', 'steel_assembly', 'process_facility'],
    requiredFacts: ['hasIndustrialBayScope', 'hasProcessEquipmentInterface'],
    optionalFacts: ['hasTrialProductionGate', 'hasCranePathConstraint'],
    compatibleAssumption: 'industrial_equipment_utility_interface_gates',
    incompatibleAssumption: 'industrial_trial_without_utility_commissioning',
    units: ['bay', 'zone', 'system', 'workface', 'building'],
  },
  data_center: {
    nameSlug: 'data center',
    methodSeed: 'data_center',
    structureTypeCodes: ['data_center_building', 'mission_critical_room', 'mep_integrated'],
    requiredFacts: ['hasMissionCriticalRoomScope', 'hasPowerCoolingInterface'],
    optionalFacts: ['hasRedundancyTopology', 'hasLoadBankTest'],
    compatibleAssumption: 'data_center_redundancy_branch_handover',
    incompatibleAssumption: 'data_center_operation_without_failover_test',
    units: ['room', 'zone', 'system', 'building', 'workface'],
  },
  transportation_hub: {
    nameSlug: 'transportation hub',
    methodSeed: 'transport_hub',
    structureTypeCodes: ['transportation_hub', 'large_public', 'large_span_steel'],
    requiredFacts: ['hasPassengerFlowZone', 'hasAuthorityOpeningAcceptance'],
    optionalFacts: ['hasTrafficTransferInterface', 'hasPlatformInterface'],
    compatibleAssumption: 'hub_trial_operation_after_life_safety_linkage',
    incompatibleAssumption: 'hub_opening_without_traffic_transfer_acceptance',
    units: ['bay', 'zone', 'system', 'workface', 'building'],
  },
  sports_culture: {
    nameSlug: 'sports culture',
    methodSeed: 'sports_culture',
    structureTypeCodes: ['sports_venue', 'large_public', 'large_span_steel'],
    requiredFacts: ['hasEventHandoverGate', 'hasCrowdFlowRequirement'],
    optionalFacts: ['hasBroadcastRequirement', 'hasOperatorEventAcceptance'],
    compatibleAssumption: 'sports_event_rehearsal_before_opening',
    incompatibleAssumption: 'sports_event_without_life_safety_readiness',
    units: ['bay', 'zone', 'system', 'workface', 'building'],
  },
  tod_upper_cover: {
    nameSlug: 'TOD upper cover',
    methodSeed: 'tod_upper_cover',
    structureTypeCodes: ['tod_upper_cover', 'large_public', 'commercial_complex'],
    requiredFacts: ['hasRailInterfaceProtection', 'hasTransferDeckScope'],
    optionalFacts: ['hasNonStopOperationConstraint', 'hasUpperTowerScope'],
    compatibleAssumption: 'tod_transfer_deck_before_upper_cover_release',
    incompatibleAssumption: 'tod_work_without_rail_operation_isolation',
    units: ['building', 'floor', 'zone', 'system', 'workface'],
  },
  renovation: {
    nameSlug: 'renovation',
    methodSeed: 'renovation',
    structureTypeCodes: ['renovation', 'existing_structure', 'fitout'],
    requiredFacts: ['hasOccupiedZoneConstraint', 'hasTemporaryCutoverPlan'],
    optionalFacts: ['hasStructuralReinforcementScope', 'hasNightWorkWindow'],
    compatibleAssumption: 'renovation_phased_decanting_and_reentry',
    incompatibleAssumption: 'renovation_user_reentry_without_safety_test',
    units: ['zone', 'room', 'workface', 'system', 'building'],
  },
  modular_building: {
    nameSlug: 'modular building',
    methodSeed: 'modular_building',
    structureTypeCodes: ['modular_building', 'steel_assembly', 'mep_integrated'],
    requiredFacts: ['hasFactoryLotScope', 'hasModuleTransportPlan'],
    optionalFacts: ['hasSiteLiftPathConstraint', 'hasFactoryInspectionGate'],
    compatibleAssumption: 'modular_factory_lot_parallel_with_site_preparation',
    incompatibleAssumption: 'modular_site_lift_without_transport_readiness',
    units: ['factory_lot', 'building', 'floor', 'zone', 'system'],
  },
}

const T2_EXTENSION_BLUEPRINTS: T2ExtensionBlueprint[] = [
  {
    code: 'foundation-interface',
    phaseWindows: ['foundation', 'basement'],
    divisionFamilies: ['foundation_and_basement'],
    subdivisionSeed: 'foundation_interface_readiness',
    methodVariantCode: 'foundation_interface_control',
    structureTypeCode: 'foundation_and_podium',
    workfaceUnit: 'zone',
    parentWindowDays: { p20: 24, p50: 36, p80: 56 },
    overlapPolicy: 'sequential_with_controlled_overlap',
    coreRole: 'foundation_interface_work',
  },
  {
    code: 'vertical-structure',
    phaseWindows: ['superstructure'],
    divisionFamilies: ['superstructure'],
    subdivisionSeed: 'vertical_structure_cycle',
    methodVariantCode: 'vertical_structure_cycle',
    structureTypeCode: 'vertical_structure',
    workfaceUnit: 'floor',
    parentWindowDays: { p20: 6, p50: 9, p80: 14 },
    overlapPolicy: 'sequential_with_controlled_overlap',
    coreRole: 'vertical_structure_cycle_work',
  },
  {
    code: 'envelope-watertight',
    phaseWindows: ['envelope'],
    divisionFamilies: ['envelope_facade_roof'],
    subdivisionSeed: 'envelope_watertight_release',
    methodVariantCode: 'envelope_watertight_closeout',
    structureTypeCode: 'envelope_system',
    workfaceUnit: 'zone',
    parentWindowDays: { p20: 30, p50: 46, p80: 70 },
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    coreRole: 'envelope_watertight_work',
  },
  {
    code: 'mep-roughin',
    phaseWindows: ['mep'],
    divisionFamilies: ['mep_systems'],
    subdivisionSeed: 'mep_roughin_branch_release',
    methodVariantCode: 'mep_roughin_branch',
    structureTypeCode: 'mep_integrated',
    workfaceUnit: 'system',
    parentWindowDays: { p20: 24, p50: 38, p80: 58 },
    overlapPolicy: 'system_zone_commissioning',
    coreRole: 'mep_roughin_branch_work',
  },
  {
    code: 'fitout-batch',
    phaseWindows: ['decoration'],
    divisionFamilies: ['decoration_fitout'],
    subdivisionSeed: 'fitout_batch_handover',
    methodVariantCode: 'batch_fitout_handover',
    structureTypeCode: 'fitout',
    workfaceUnit: 'room',
    parentWindowDays: { p20: 22, p50: 34, p80: 54 },
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    coreRole: 'batch_fitout_work',
  },
  {
    code: 'outdoor-interface',
    phaseWindows: ['outdoor', 'handover'],
    divisionFamilies: ['outdoor_municipal_landscape'],
    subdivisionSeed: 'outdoor_municipal_interface',
    methodVariantCode: 'outdoor_municipal_interface',
    structureTypeCode: 'outdoor_municipal',
    workfaceUnit: 'zone',
    parentWindowDays: { p20: 26, p50: 40, p80: 62 },
    overlapPolicy: 'parallel_lanes_with_handover_gates',
    coreRole: 'outdoor_interface_work',
  },
  {
    code: 'specialty-system',
    phaseWindows: ['specialty', 'mep'],
    divisionFamilies: ['specialty_business_systems', 'mep_systems'],
    subdivisionSeed: 'specialty_system_interface',
    methodVariantCode: 'specialty_system_installation',
    structureTypeCode: 'special_system',
    workfaceUnit: 'system',
    parentWindowDays: { p20: 24, p50: 36, p80: 56 },
    overlapPolicy: 'system_zone_commissioning',
    coreRole: 'specialty_system_installation_work',
  },
  {
    code: 'commissioning-handover',
    phaseWindows: ['commissioning', 'handover'],
    divisionFamilies: ['commissioning_handover'],
    subdivisionSeed: 'integrated_commissioning_handover',
    methodVariantCode: 'integrated_commissioning',
    structureTypeCode: 'handover_system',
    workfaceUnit: 'system',
    parentWindowDays: { p20: 18, p50: 28, p80: 44 },
    overlapPolicy: 'system_zone_commissioning',
    coreRole: 'integrated_commissioning_work',
  },
]

function kebab(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function safeRolePrefix(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(handover|gate|acceptance|readiness|quality|inspection|testing|permit|closeout)/g, 'stage')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function extensionTemplate(input: {
  businessTypeCode: BusinessTypeCode
  sequence: number
  blueprint: T2ExtensionBlueprint
}): T2DivisionRhythmTemplate {
  const profile = BUSINESS_GENERATION_PROFILES[input.businessTypeCode]
  const serial = String(input.sequence).padStart(3, '0')
  const businessSlug = kebab(input.businessTypeCode)
  const blueprintSlug = kebab(input.blueprint.code)
  const templateId = `t2-${businessSlug}-standard-library-${blueprintSlug}-${serial}-rhythm-v1`
  const factSuffix = `${input.businessTypeCode}_${input.blueprint.code.replace(/-/g, '_')}_${serial}`
  const rolePrefix = safeRolePrefix(`${businessSlug}_${input.blueprint.code}_${serial}`)
  const primarySubdivision = `${input.businessTypeCode}_${input.blueprint.subdivisionSeed}_${serial}`
  const workfaceUnit = profile.units.includes(input.blueprint.workfaceUnit)
    ? input.blueprint.workfaceUnit
    : profile.units[0]

  return template({
    templateId,
    templateName: `${profile.nameSlug} ${input.blueprint.code.replace(/-/g, ' ')} standard-library rhythm ${serial}`,
    confidence: 'medium',
    applicability: {
      businessTypeCodes: [input.businessTypeCode],
      phaseWindows: input.blueprint.phaseWindows,
      divisionFamilies: input.blueprint.divisionFamilies,
      subdivisionFamilies: [
        primarySubdivision,
        `${input.businessTypeCode}_${input.blueprint.subdivisionSeed}_interface_${serial}`,
        `${input.businessTypeCode}_${input.blueprint.subdivisionSeed}_handover_${serial}`,
      ],
      methodVariantCodes: [
        `${profile.methodSeed}_${input.blueprint.methodVariantCode}`,
        `${profile.methodSeed}_standard_library_variant_${serial}`,
      ],
      structureTypeCodes: unique([
        ...profile.structureTypeCodes.slice(0, 2),
        input.blueprint.structureTypeCode,
      ]),
      requiredScopeDimensions: unique([
        workfaceUnit,
        ...profile.units.slice(0, 3),
      ]) as T2RhythmWorkfaceUnit[],
    },
    parentWindowDays: input.blueprint.parentWindowDays,
    workfaceUnit,
    overlapPolicy: input.blueprint.overlapPolicy,
    windowRoles: [
      `${rolePrefix}_readiness_gate`,
      `${rolePrefix}_workface_release`,
      `${rolePrefix}_${input.blueprint.coreRole}`,
      `${rolePrefix}_parallel_interface_installation`,
      `${rolePrefix}_quality_testing_check`,
      `${rolePrefix}_acceptance_gate`,
      `${rolePrefix}_handover_closeout`,
    ],
    compatibility: compatibility({
      requiredFacts: [
        ...profile.requiredFacts,
        `has_${factSuffix}_scope`,
      ],
      optionalFacts: [
        ...profile.optionalFacts,
        `has_${factSuffix}_resource_plan`,
      ],
      compatible: [
        profile.compatibleAssumption,
        `${factSuffix}_controlled_overlap`,
      ],
      incompatible: [
        profile.incompatibleAssumption,
        `${factSuffix}_gate_skipped`,
      ],
      units: unique([
        workfaceUnit,
        ...profile.units,
      ]) as T2RhythmWorkfaceUnit[],
    }),
    calibration: calibration([
      `${factSuffix}_actual_finish_date`,
      `${factSuffix}_handover_acceptance_date`,
    ]),
  })
}

function buildGeneratedT2DivisionRhythmTemplates() {
  const formalBusinessTypeCodes = Object.values(BUSINESS_TYPE_RECOMMENDATIONS)
    .map((recommendation) => recommendation.businessType)
  const generated: T2DivisionRhythmTemplate[] = []
  const generatedCounts = new Map<BusinessTypeCode, number>()
  const nextSequence = (businessTypeCode: BusinessTypeCode) => {
    const nextValue = (generatedCounts.get(businessTypeCode) ?? 0) + 1
    generatedCounts.set(businessTypeCode, nextValue)
    return nextValue
  }
  const countTemplatesForBusinessType = (businessTypeCode: BusinessTypeCode) => (
    [...CURATED_T2_DIVISION_RHYTHM_TEMPLATE_SEED, ...generated]
      .filter((candidate) => candidate.applicability.businessTypeCodes.includes(businessTypeCode))
      .length
  )
  const appendGeneratedTemplate = (businessTypeCode: BusinessTypeCode) => {
    const sequence = nextSequence(businessTypeCode)
    generated.push(extensionTemplate({
      businessTypeCode,
      sequence,
      blueprint: T2_EXTENSION_BLUEPRINTS[(sequence - 1) % T2_EXTENSION_BLUEPRINTS.length],
    }))
  }

  for (const recommendation of Object.values(BUSINESS_TYPE_RECOMMENDATIONS)) {
    while (countTemplatesForBusinessType(recommendation.businessType) < recommendation.templateCountHint) {
      appendGeneratedTemplate(recommendation.businessType)
    }
  }

  const targetTemplateCount = Object.values(BUSINESS_TYPE_RECOMMENDATIONS)
    .reduce((sum, recommendation) => sum + recommendation.templateCountHint, 0)
  let roundRobinIndex = 0
  while (CURATED_T2_DIVISION_RHYTHM_TEMPLATE_SEED.length + generated.length < targetTemplateCount) {
    appendGeneratedTemplate(formalBusinessTypeCodes[roundRobinIndex % formalBusinessTypeCodes.length])
    roundRobinIndex += 1
  }

  return generated
}

const GENERATED_T2_DIVISION_RHYTHM_TEMPLATE_SEED = buildGeneratedT2DivisionRhythmTemplates()

export const T2_DIVISION_RHYTHM_TEMPLATE_SEED: T2DivisionRhythmTemplate[] = [
  ...CURATED_T2_DIVISION_RHYTHM_TEMPLATE_SEED,
  ...GENERATED_T2_DIVISION_RHYTHM_TEMPLATE_SEED,
]
