import { describe, expect, it } from 'vitest'

import {
  buildCertificateLocalOverrideSeedSwapAuditRecord,
  buildCertificateLocalOverrideSeedSwapReadinessPlan,
} from '../services/certificateTemplateLocalOverrideSeedSwapReadinessService.js'

describe('certificate template local override seed swap readiness service', () => {
  it('blocks manual seed swap readiness when no candidate-derived authoring package remains', () => {
    expect(() => buildCertificateLocalOverrideSeedSwapReadinessPlan({
      planCode: 'certificate_local_override_governed_publish_promotion_plan',
      targetSeedVersion: 'v1.4.22.2-local-override-batch-1-published-draft',
      requestedBy: 'admin-1',
      requestedWindow: '2026-06-02 22:00-23:00 Asia/Shanghai',
      reason: 'first-batch local override publication already landed in v1.4.22.2',
    })).toThrow('Certificate local override promotion plan has no candidates ready for approval.')
  })

  it('blocks manual seed swap audit when no candidate-derived readiness plan remains', () => {
    expect(() => buildCertificateLocalOverrideSeedSwapAuditRecord({
      planCode: 'certificate_local_override_governed_publish_promotion_plan',
      targetSeedVersion: 'v1.4.22.2-local-override-batch-1-published-draft',
      executedBy: 'admin-2',
      executionWindow: '2026-06-02 22:00-23:00 Asia/Shanghai',
      postSwapPreviewSmokeStatus: 'passed',
      reason: 'first-batch local override publication already landed in v1.4.22.2',
    })).toThrow('Certificate local override promotion plan has no candidates ready for approval.')
  })
})
