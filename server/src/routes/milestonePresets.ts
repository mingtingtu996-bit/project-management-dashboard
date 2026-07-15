// v1.4.22.1 §14: GET /api/milestone-presets — Read milestone seed presets for wizard step 5
import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import type { ApiResponse } from '../types/index.js'

const router = Router()

// Predefined milestone presets per business type and main stage
// Source: milestoneSeed presets (v1.4.7.2 seed catalogs)
const MILESTONE_PRESETS: Record<string, Record<string, { code: string; label: string; required: boolean }[]>> = {
  general_civil: {
    basement_construction: [
      { code: 'pile_foundation_acceptance', label: '桩基验收', required: true },
      { code: 'foundation_acceptance', label: '基础验收', required: true },
      { code: 'energy_saving_acceptance', label: '节能验收', required: false },
    ],
    main_structure: [
      { code: 'pile_foundation_acceptance', label: '桩基验收', required: true },
      { code: 'foundation_acceptance', label: '基础验收', required: true },
      { code: 'main_structure_acceptance', label: '主体结构验收', required: true },
      { code: 'energy_saving_acceptance', label: '节能验收', required: false },
    ],
    decoration: [
      { code: 'waterproof_acceptance', label: '防水验收', required: true },
      { code: 'facade_acceptance', label: '外立面验收', required: true },
      { code: 'model_room_acceptance', label: '精装样板间验收', required: false },
      { code: 'energy_saving_acceptance', label: '节能验收', required: false },
    ],
    mep_installation: [
      { code: 'integrated_pipeline_acceptance', label: '综合管线验收', required: true },
      { code: 'terminal_power_on_acceptance', label: '末端通电验收', required: true },
      { code: 'system_commissioning_acceptance', label: '系统调试验收', required: true },
    ],
  },
  hospital: {
    basement_construction: [
      { code: 'pile_foundation_acceptance', label: '桩基验收', required: true },
      { code: 'foundation_acceptance', label: '基础验收', required: true },
    ],
    main_structure: [
      { code: 'pile_foundation_acceptance', label: '桩基验收', required: true },
      { code: 'foundation_acceptance', label: '基础验收', required: true },
      { code: 'main_structure_acceptance', label: '主体结构验收', required: true },
      { code: 'medical_gas_acceptance', label: '医气专项验收', required: true },
    ],
    decoration: [
      { code: 'cleanroom_acceptance', label: '洁净区域验收', required: true },
      { code: 'medical_gas_acceptance', label: '医气专项验收', required: true },
      { code: 'radiation_protection_acceptance', label: '放射防护验收', required: true },
    ],
    mep_installation: [
      { code: 'integrated_pipeline_acceptance', label: '综合管线验收', required: true },
      { code: 'terminal_power_on_acceptance', label: '末端通电验收', required: true },
      { code: 'system_commissioning_acceptance', label: '系统调试验收', required: true },
      { code: 'medical_gas_acceptance', label: '医气专项验收', required: true },
    ],
  },
  industrial: {
    main_structure: [
      { code: 'pile_foundation_acceptance', label: '桩基验收', required: true },
      { code: 'foundation_acceptance', label: '基础验收', required: true },
      { code: 'steel_structure_acceptance', label: '钢结构验收', required: true },
    ],
    mep_installation: [
      { code: 'explosion_proof_acceptance', label: '防爆验收', required: false },
      { code: 'system_commissioning_acceptance', label: '系统调试验收', required: true },
    ],
  },
  data_center: {
    main_structure: [
      { code: 'foundation_acceptance', label: '基础验收', required: true },
      { code: 'main_structure_acceptance', label: '主体结构验收', required: true },
    ],
    mep_installation: [
      { code: 'tier_certification', label: 'Tier认证', required: true },
      { code: 'dual_power_acceptance', label: '双路市电验收', required: true },
      { code: 'fire_suppression_acceptance', label: '消防验收', required: true },
    ],
  },
}

const DEFAULT_PRESETS = [
  { code: 'foundation_acceptance', label: '基础验收', required: true },
  { code: 'main_structure_acceptance', label: '主体结构验收', required: true },
  { code: 'system_commissioning_acceptance', label: '系统调试验收', required: true },
  { code: 'fire_acceptance', label: '消防验收', required: true },
]

const querySchema = z.object({
  businessType: z.string().trim().min(1).optional(),
  mainStage: z.string().trim().min(1).optional(),
})

// GET /api/milestone-presets?businessType=&mainStage=
router.get('/api/milestone-presets', authenticate, asyncHandler(async (req, res) => {
  const params = querySchema.parse(req.query)
  const ts = new Date().toISOString()

  let presets = DEFAULT_PRESETS

  if (params.businessType && params.mainStage) {
    const typePresets = MILESTONE_PRESETS[params.businessType]
    if (typePresets) {
      presets = typePresets[params.mainStage] ?? typePresets[Object.keys(typePresets)[0]] ?? DEFAULT_PRESETS
    }
  } else if (params.businessType) {
    const typePresets = MILESTONE_PRESETS[params.businessType]
    if (typePresets) {
      // Merge all stages for this type
      const merged = new Map<string, { code: string; label: string; required: boolean }>()
      for (const stagePresets of Object.values(typePresets)) {
        for (const p of stagePresets) {
          if (!merged.has(p.code)) merged.set(p.code, p)
        }
      }
      presets = [...merged.values()]
    }
  }

  res.json({ success: true, data: presets, timestamp: ts } as ApiResponse)
}))

export default router
