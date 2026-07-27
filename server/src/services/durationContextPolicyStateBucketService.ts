export type DurationContextPolicyExperienceTier = 'T1' | 'T2' | 'T3'
export type DurationContextPolicyRiskTier = 'none' | 'low' | 'medium' | 'high'

export interface DurationContextPolicyStateBucketInput {
  maturityTier?: string | null
  scheduleState?: string | null
  highRiskFactorCount?: number | null
  mediumRiskFactorCount?: number | null
  lowRiskFactorCount?: number | null
  hardConstraintActive?: boolean | null
  experienceTier: DurationContextPolicyExperienceTier
}

export interface DurationContextPolicyParsedStateBucket {
  maturityTier: string
  riskTier: DurationContextPolicyRiskTier | null
  scheduleState: string
  hardConstraintActive: boolean | null
  experienceTier: DurationContextPolicyExperienceTier | null
  unknownSegments: string[]
}

export interface ValidateDurationContextPolicyStateBucketOptions {
  expectedExperienceTier?: DurationContextPolicyExperienceTier | null
}

export interface ValidateDurationContextPolicyStateBucketResult {
  isValid: boolean
  parsed: DurationContextPolicyParsedStateBucket
  reasonCodes: string[]
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function readNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readRiskTier(stateVector: DurationContextPolicyStateBucketInput): DurationContextPolicyRiskTier {
  if (readNumber(stateVector.highRiskFactorCount, 0) > 0) return 'high'
  if (readNumber(stateVector.mediumRiskFactorCount, 0) > 0) return 'medium'
  if (readNumber(stateVector.lowRiskFactorCount, 0) > 0) return 'low'
  return 'none'
}

function parseRiskTier(value: string): DurationContextPolicyRiskTier | null {
  if (value === 'none' || value === 'low' || value === 'medium' || value === 'high') return value
  return null
}

function parseExperienceTier(value: string): DurationContextPolicyExperienceTier | null {
  const normalized = value.toUpperCase()
  if (normalized === 'T1' || normalized === 'T2' || normalized === 'T3') return normalized
  return null
}

export function buildDurationContextPolicyStateBucket(input: DurationContextPolicyStateBucketInput) {
  const maturityTier = normalizeText(input.maturityTier) || 'cold_start'
  const riskTier = readRiskTier(input)
  const scheduleState = normalizeText(input.scheduleState) || 'none'
  const hardConstraint = input.hardConstraintActive === true ? '1' : '0'
  return `${maturityTier}|risk:${riskTier}|schedule:${scheduleState}|hard:${hardConstraint}|experience:${input.experienceTier}`
}

export function parseDurationContextPolicyStateBucket(value: unknown): DurationContextPolicyParsedStateBucket {
  const segments = normalizeText(value).split('|').map((segment) => segment.trim()).filter(Boolean)
  const [maturityTier = ''] = segments
  const unknownSegments: string[] = []
  let riskTier: DurationContextPolicyRiskTier | null = null
  let scheduleState = ''
  let hardConstraintActive: boolean | null = null
  let experienceTier: DurationContextPolicyExperienceTier | null = null

  for (const segment of segments.slice(1)) {
    if (segment.startsWith('risk:')) {
      riskTier = parseRiskTier(segment.slice('risk:'.length))
    } else if (segment.startsWith('schedule:')) {
      scheduleState = segment.slice('schedule:'.length)
    } else if (segment.startsWith('hard:')) {
      const hardValue = segment.slice('hard:'.length)
      hardConstraintActive = hardValue === '1' ? true : hardValue === '0' ? false : null
    } else if (segment.startsWith('experience:')) {
      experienceTier = parseExperienceTier(segment.slice('experience:'.length))
    } else {
      unknownSegments.push(segment)
    }
  }

  return {
    maturityTier,
    riskTier,
    scheduleState,
    hardConstraintActive,
    experienceTier,
    unknownSegments,
  }
}

export function isLowRiskDurationContextPolicyStateBucket(value: unknown) {
  return normalizeText(value).includes('|risk:low|')
}

export function validateDurationContextPolicyStateBucket(
  value: unknown,
  options: ValidateDurationContextPolicyStateBucketOptions = {},
): ValidateDurationContextPolicyStateBucketResult {
  const parsed = parseDurationContextPolicyStateBucket(value)
  const reasonCodes: string[] = []

  if (!parsed.maturityTier) reasonCodes.push('maturity_tier_missing')
  if (!parsed.riskTier) reasonCodes.push('risk_tier_missing_or_invalid')
  if (!parsed.scheduleState) reasonCodes.push('schedule_state_missing')
  if (parsed.hardConstraintActive == null) reasonCodes.push('hard_constraint_missing_or_invalid')
  if (!parsed.experienceTier) reasonCodes.push('experience_tier_missing_or_invalid')
  if (parsed.unknownSegments.length > 0) reasonCodes.push('unknown_bucket_segment_present')
  if (
    options.expectedExperienceTier
    && parsed.experienceTier
    && parsed.experienceTier !== options.expectedExperienceTier
  ) {
    reasonCodes.push('experience_tier_mismatch')
  }

  return {
    isValid: reasonCodes.length === 0,
    parsed,
    reasonCodes,
  }
}
