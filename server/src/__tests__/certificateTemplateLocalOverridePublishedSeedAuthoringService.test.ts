import { describe, expect, it } from 'vitest'

import { buildCertificateLocalOverridePublishedSeedAuthoringPackage } from '../services/certificateTemplateLocalOverridePublishedSeedAuthoringService.js'

describe('certificate template local override published seed authoring service', () => {
  it('blocks authoring when first-batch local overrides have already been published into the runtime seed', () => {
    expect(() => buildCertificateLocalOverridePublishedSeedAuthoringPackage({
      planCode: 'certificate_local_override_governed_publish_promotion_plan',
      approvedBy: 'admin-1',
      targetSeedVersion: 'v1.4.22.2-local-override-batch-1-published-draft',
      reason: 'first-batch local override publication already landed in v1.4.22.2',
    })).toThrow('Certificate local override promotion plan has no candidates ready for approval.')
  })
})
