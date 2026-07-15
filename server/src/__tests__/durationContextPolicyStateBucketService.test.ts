import { describe, expect, it } from 'vitest'

import {
  buildDurationContextPolicyStateBucket,
  isLowRiskDurationContextPolicyStateBucket,
  parseDurationContextPolicyStateBucket,
  validateDurationContextPolicyStateBucket,
} from '../services/durationContextPolicyStateBucketService.js'

describe('durationContextPolicyStateBucketService', () => {
  it('builds state buckets with the experience tier dimension while preserving risk tokens', () => {
    const bucket = buildDurationContextPolicyStateBucket({
      maturityTier: 'mature_90d',
      scheduleState: 'accelerating',
      highRiskFactorCount: 0,
      mediumRiskFactorCount: 0,
      lowRiskFactorCount: 2,
      hardConstraintActive: false,
      experienceTier: 'T2',
    })

    expect(bucket).toBe('mature_90d|risk:low|schedule:accelerating|hard:0|experience:T2')
    expect(isLowRiskDurationContextPolicyStateBucket(bucket)).toBe(true)
  })

  it('parses legacy risk:low bucket strings without treating missing experience tier as T1', () => {
    const parsed = parseDurationContextPolicyStateBucket('mature_90d|risk:low|schedule:stable|hard:0')

    expect(parsed).toEqual({
      maturityTier: 'mature_90d',
      riskTier: 'low',
      scheduleState: 'stable',
      hardConstraintActive: false,
      experienceTier: null,
      unknownSegments: [],
    })
    expect(isLowRiskDurationContextPolicyStateBucket('mature_90d|risk:low|schedule:stable|hard:0')).toBe(true)
    expect(validateDurationContextPolicyStateBucket('mature_90d|risk:low|schedule:stable|hard:0').isValid).toBe(false)
  })

  it('blocks T3 project-level experience from matching a T1 bucket expectation', () => {
    const t3Bucket = buildDurationContextPolicyStateBucket({
      maturityTier: 'mature_90d',
      scheduleState: 'stable',
      highRiskFactorCount: 0,
      mediumRiskFactorCount: 0,
      lowRiskFactorCount: 1,
      hardConstraintActive: false,
      experienceTier: 'T3',
    })

    expect(t3Bucket).not.toBe('mature_90d|risk:low|schedule:stable|hard:0|experience:T1')
    expect(validateDurationContextPolicyStateBucket(t3Bucket, { expectedExperienceTier: 'T1' })).toEqual({
      isValid: false,
      parsed: expect.objectContaining({ experienceTier: 'T3' }),
      reasonCodes: ['experience_tier_mismatch'],
    })
    expect(validateDurationContextPolicyStateBucket(t3Bucket, { expectedExperienceTier: 'T3' })).toEqual({
      isValid: true,
      parsed: expect.objectContaining({ experienceTier: 'T3' }),
      reasonCodes: [],
    })
  })
})
