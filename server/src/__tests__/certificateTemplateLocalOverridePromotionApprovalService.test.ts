import { describe, expect, it } from 'vitest'

import {
  approveCertificateLocalOverridePromotionPlan,
  rejectCertificateLocalOverridePromotionPlan,
} from '../services/certificateTemplateLocalOverridePromotionApprovalService.js'

describe('certificate template local override promotion approval service', () => {
  it('blocks approval when no first-batch local override candidate remains', () => {
    expect(() => approveCertificateLocalOverridePromotionPlan({
      planCode: 'certificate_local_override_governed_publish_promotion_plan',
      approvedBy: 'admin-1',
      reason: 'first batch has already been published as runtime seed rules',
    })).toThrow('Certificate local override promotion plan has no candidates ready for approval.')
  })

  it('blocks rejection when no first-batch local override candidate remains', () => {
    expect(() => rejectCertificateLocalOverridePromotionPlan({
      planCode: 'certificate_local_override_governed_publish_promotion_plan',
      rejectedBy: 'admin-2',
      reason: 'first batch has already been published as runtime seed rules',
    })).toThrow('Certificate local override promotion plan has no candidates ready for approval.')
  })
})
