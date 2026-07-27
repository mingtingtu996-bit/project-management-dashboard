import { describe, expect, it } from 'vitest'

import {
  CERTIFICATE_TEMPLATE_GOVERNANCE_META,
  CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES,
  CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE,
  CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES,
  CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE,
  CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES,
  GENERAL_CERTIFICATE_TEMPLATE_CODE,
  SYSTEM_CERTIFICATE_TEMPLATE_SEEDS,
} from '../seeds/certificateTemplateSeed.js'

describe('certificate template seed', () => {
  it('registers one uniquely coded general construction template with the four certificate chain', () => {
    const templateCodes = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.map((seed) => seed.templateCode)

    expect(new Set(templateCodes).size).toBe(templateCodes.length)
    expect(templateCodes).toContain(GENERAL_CERTIFICATE_TEMPLATE_CODE)

    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )

    expect(generalTemplate).toBeDefined()
    expect(generalTemplate?.seedVersion).toMatch(/^v\d+\.\d+\.\d+/)
    expect(generalTemplate?.governanceStatus).toBe('system_default')
    expect(generalTemplate?.certificates.map((certificate) => certificate.certificateType)).toEqual([
      'land_certificate',
      'land_use_planning_permit',
      'engineering_planning_permit',
      'construction_permit',
    ])
  })

  it('keeps work item codes unique and includes the PDF-derived shared materials', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    const workItemCodes = generalTemplate?.workItems.map((item) => item.workItemCode) ?? []

    expect(new Set(workItemCodes).size).toBe(workItemCodes.length)
    expect(workItemCodes).toEqual(
      expect.arrayContaining([
        'CERT-DOC-PROJECT-BASIC',
        'CERT-DOC-PROJECT-FILING',
        'CERT-DOC-FEASIBILITY',
        'CERT-DOC-LAND-TRANSFER',
        'CERT-DOC-DESIGN-SCHEME',
        'CERT-DOC-DRAWING-REVIEW',
        'CERT-DOC-QUALITY-SAFETY',
        'CERT-DOC-SITE-CONDITIONS',
      ]),
    )

    const sharedItems = generalTemplate?.workItems.filter((item) => item.isShared) ?? []
    expect(sharedItems.length).toBeGreaterThanOrEqual(6)
    expect(sharedItems.every((item) => item.certificateTypes.length > 1)).toBe(true)
  })

  it('models land acquisition methods as selectable branches with transfer matching the source file path', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )

    expect(generalTemplate?.landAcquisitionMethods.map((method) => method.methodCode)).toEqual([
      'transfer',
      'allocation',
      'existing_land',
      'redevelopment',
    ])

    const transfer = generalTemplate?.landAcquisitionMethods.find((method) => method.methodCode === 'transfer')
    expect(transfer).toMatchObject({
      methodName: '出让取得',
      defaultSelected: true,
    })
    expect(transfer?.materialNames).toEqual(
      expect.arrayContaining(['出让合同', '场地红线图', '交地单', '契税、印花税缴纳', '完税证明']),
    )

    const methodWorkItemCodes = new Set(generalTemplate?.workItems.flatMap((item) => item.landAcquisitionMethodCodes ?? []) ?? [])
    expect(methodWorkItemCodes).toEqual(new Set(['transfer', 'allocation', 'existing_land', 'redevelopment']))
  })

  it('structures four-certificate material packages as first-class seed assets', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    expect(generalTemplate.materialPackages.map((materialPackage) => materialPackage.packageCode)).toEqual([
      'PKG-CERT-LAND-COMMON',
      'PKG-CERT-LUP-COMMON',
      'PKG-CERT-EPP-COMMON',
      'PKG-CERT-CP-COMMON',
    ])
    expect(generalTemplate.materialPackages.map((materialPackage) => materialPackage.certificateTypes)).toEqual([
      ['land_certificate'],
      ['land_use_planning_permit'],
      ['engineering_planning_permit'],
      ['construction_permit'],
    ])

    const constructionPermitPackage = generalTemplate.materialPackages.find(
      (materialPackage) => materialPackage.packageCode === 'PKG-CERT-CP-COMMON',
    )
    expect(constructionPermitPackage).toMatchObject({
      packageScope: 'certificate_common',
      requiredPolicy: 'required',
    })
    expect(constructionPermitPackage?.workItemCodes).toEqual(
      expect.arrayContaining([
        'CERT-DOC-DRAWING-REVIEW',
        'CERT-DOC-QUALITY-SAFETY',
        'CERT-DOC-CONSTRUCTION-CONTRACT',
        'CERT-DOC-SITE-CONDITIONS',
      ]),
    )
    expect(constructionPermitPackage?.materialNames).toEqual(
      expect.arrayContaining(['审图合格证', '质量安全监督手续', '施工合同及参建单位资料', '现场开工条件']),
    )
  })

  it('models the four-certificate handling path as material-source-authority-output reuse steps', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const handlingSteps = generalTemplate.handlingSteps
    expect(new Set(handlingSteps.map((step) => step.stepCode)).size).toBe(handlingSteps.length)
    expect(new Set(handlingSteps.map((step) => step.certificateType))).toEqual(
      new Set([
        'land_certificate',
        'land_use_planning_permit',
        'engineering_planning_permit',
        'construction_permit',
      ]),
    )

    for (const step of handlingSteps) {
      expect(step.sourceParties.length, step.stepCode).toBeGreaterThan(0)
      expect(step.handlingAuthority, step.stepCode).toBeTruthy()
      expect(step.submitMaterials.length, step.stepCode).toBeGreaterThan(0)
      expect(step.outputDocument, step.stepCode).toBeTruthy()
      expect(step.satisfiesMaterialCodes.length, step.stepCode).toBeGreaterThan(0)
      expect(step.satisfiesMaterials.length, step.stepCode).toBeGreaterThan(0)
    }

    const stepCodes = handlingSteps.map((step) => step.stepCode)
    expect(stepCodes).toEqual(
      expect.arrayContaining([
        'LAND-ACQUISITION-PRECHECK',
        'LAND-OWNERSHIP-REGISTRATION',
        'LUP-LAND-METHOD-MATERIALS',
        'LUP-PRE-REVIEW-SELECTION',
        'LUP-MATERIAL-SUBMISSION',
        'LUP-PERMIT-ISSUE',
        'EPP-DESIGN-PACKAGE-ASSEMBLY',
        'EPP-SCHEME-REVIEW',
        'EPP-PUBLIC-NOTICE-OR-COMMITTEE',
        'EPP-SPECIAL-TECHNICAL-REVIEW',
        'EPP-BLUEPRINT-CHECK',
        'EPP-PERMIT-ISSUE',
        'CP-BIDDING-CONTRACT-LOCK',
        'CP-DRAWING-REVIEW',
        'CP-FIRE-HFD-SPECIALS',
        'CP-CONTRACT-PARTICIPANTS',
        'CP-QUALITY-SAFETY',
        'CP-WAGE-REALNAME-DUST',
        'CP-SITE-CONDITIONS',
        'CP-PERMIT-ISSUE',
      ]),
    )

    const constructionPermitOutputs = handlingSteps
      .filter((step) => step.certificateType === 'construction_permit')
      .map((step) => step.outputDocument)
    expect(constructionPermitOutputs).toEqual(
      expect.arrayContaining(['审图合格证', '消防、人防或专项审查资料', '质量安全监督手续', '施工许可证']),
    )

    const stepsByCertificate = handlingSteps.reduce<Record<string, string[]>>((accumulator, step) => {
      accumulator[step.certificateType] = [...(accumulator[step.certificateType] ?? []), step.stepName]
      return accumulator
    }, {})
    expect(stepsByCertificate.land_certificate.length).toBeGreaterThanOrEqual(2)
    expect(stepsByCertificate.land_use_planning_permit.length).toBeGreaterThanOrEqual(4)
    expect(stepsByCertificate.engineering_planning_permit.length).toBeGreaterThanOrEqual(6)
    expect(stepsByCertificate.construction_permit.length).toBeGreaterThanOrEqual(8)
    expect(stepsByCertificate.land_certificate.join(' ')).toContain('土地取得方式资料核验')
    expect(stepsByCertificate.land_use_planning_permit.join(' ')).toContain('土地取得方式资料确认')
    expect(stepsByCertificate.land_use_planning_permit.join(' ')).toContain('用地预审')
    expect(stepsByCertificate.land_use_planning_permit.join(' ')).toContain('用地规划许可核发')
    expect(stepsByCertificate.engineering_planning_permit.join(' ')).toContain('方案资料组包')
    expect(stepsByCertificate.engineering_planning_permit.join(' ')).toContain('专项技术审查')
    expect(stepsByCertificate.engineering_planning_permit.join(' ')).toContain('方案公示或规委会审查')
    expect(stepsByCertificate.engineering_planning_permit.join(' ')).toContain('工程规划许可核发')
    expect(stepsByCertificate.construction_permit.join(' ')).toContain('招采与合同锁定')
    expect(stepsByCertificate.construction_permit.join(' ')).toContain('消防人防与专项审查')
    expect(stepsByCertificate.construction_permit.join(' ')).toContain('合同与参建单位')
    expect(stepsByCertificate.construction_permit.join(' ')).toContain('工资实名制与扬尘治理')
    expect(stepsByCertificate.construction_permit.join(' ')).toContain('现场开工条件')
  })

  it('aligns formal handling path material codes with generated work item codes', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const generatedWorkItemCodes = new Set(generalTemplate.workItems.map((item) => item.workItemCode))
    const missingCodes = generalTemplate.handlingSteps
      .flatMap((step) => step.satisfiesMaterialCodes.map((code) => ({ stepCode: step.stepCode, code })))
      .filter((item) => !generatedWorkItemCodes.has(item.code))

    expect(missingCodes).toEqual([])
  })

  it('does not publish garbled land acquisition text from the template seed', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const seedText = JSON.stringify(generalTemplate)
    expect(seedText).not.toMatch(/[ĹЭ鼯ͨ]/)
    expect(seedText).toContain('通过招拍挂、协议出让等方式取得国有建设用地使用权')
    expect(seedText).toContain('确认出让合同签署、价款约定和合同附件')
  })

  it('declares reusable outputs from land-use planning through engineering planning to construction permit', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const handlingSteps = generalTemplate.handlingSteps
    expect(
      handlingSteps.some(
        (step) =>
          step.certificateType === 'land_use_planning_permit' &&
          step.reusableForCertificateTypes.includes('engineering_planning_permit'),
      ),
    ).toBe(true)
    expect(
      handlingSteps.some(
        (step) =>
          step.certificateType === 'engineering_planning_permit' &&
          step.reusableForCertificateTypes.includes('construction_permit'),
      ),
    ).toBe(true)
  })

  it('keeps province profiles as overlays instead of duplicating the full template', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )

    expect(generalTemplate?.provinceProfiles.length).toBeGreaterThanOrEqual(1)
    const defaultProfile = generalTemplate?.provinceProfiles.find((profile) => profile.provinceCode === 'default')
    expect(defaultProfile).toMatchObject({
      provinceName: '全国通用',
      profileVersion: 'v1.4.22.2',
    })
    expect(defaultProfile?.policySources.every((source) => source.updateMode === 'governed_seed_update')).toBe(true)
    expect(defaultProfile?.notes.join(' ')).toContain('不复制整套四证模板')
  })

  it('declares template-catalog governance metadata instead of entering the algorithm seed lifecycle', () => {
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META).toMatchObject({
      seedVersion: 'v1.4.22.2',
      seedScope: 'pre_certificate_template_catalog',
      relationshipRole: 'draft_template_catalog_for_certificate_workspace',
      webVerified: true,
      reviewNeeded: false,
    })
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.expectedCounts).toMatchObject({
      certificates: 4,
      landAcquisitionMethods: 4,
      provinceRecognitionRules: expect.any(Number),
    })
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.expectedCounts.provinceRecognitionRules).toBeGreaterThanOrEqual(31)
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.boundaryPolicy.join(' ')).toContain('template_catalog')
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.boundaryPolicy.join(' ')).toContain('no live page scrape')
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.provincePolicyUpdatePolicy.actionPolicy).toContain('trusted source')
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.provincePolicyUpdatePolicy.actionPolicy).toContain('published profile')
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.provincePolicyUpdatePolicy.candidateTable).toBe(
      'certificate_template_policy_auto_publish_runs',
    )
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.provincePolicyUpdatePolicy.governanceService).toBe(
      'certificateTemplatePolicyUpdateService',
    )
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.provincePolicyUpdatePolicy.adminReportEndpoint).toBe(
      '/api/admin/certificate-template-governance/policy-updates/report',
    )
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.provincePolicyUpdatePolicy.runtimePreviewPolicy).toBe(
      'business_preview_consumes_runtime_projection_only',
    )
  })

  it('keeps nationwide province recognition broad while limiting policy profiles to published overlays', () => {
    const expectedMainlandProvinceCodes = [
      'beijing',
      'tianjin',
      'hebei',
      'shanxi',
      'inner_mongolia',
      'liaoning',
      'jilin',
      'heilongjiang',
      'shanghai',
      'jiangsu',
      'zhejiang',
      'anhui',
      'fujian',
      'jiangxi',
      'shandong',
      'henan',
      'hubei',
      'hunan',
      'guangdong',
      'guangxi',
      'hainan',
      'chongqing',
      'sichuan',
      'guizhou',
      'yunnan',
      'tibet',
      'shaanxi',
      'gansu',
      'qinghai',
      'ningxia',
      'xinjiang',
    ]
    const recognitionCodes = CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.map((rule) => rule.provinceCode)
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    const publishedProfileCodes = new Set(
      generalTemplate?.provinceProfiles
        .filter((profile) => profile.reviewStatus === 'published')
        .map((profile) => profile.provinceCode) ?? [],
    )

    expect(recognitionCodes).toEqual(expect.arrayContaining(expectedMainlandProvinceCodes))
    expect(new Set(recognitionCodes).size).toBe(recognitionCodes.length)
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provinceCode: 'beijing', profileCode: 'beijing', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'tianjin', profileCode: 'tianjin', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'hebei', profileCode: 'hebei', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'shanxi', profileCode: 'shanxi', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'inner_mongolia', profileCode: 'inner_mongolia', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'liaoning', profileCode: 'liaoning', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'jilin', profileCode: 'jilin', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'heilongjiang', profileCode: 'heilongjiang', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'shanghai', profileCode: 'shanghai', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'anhui', profileCode: 'anhui', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'fujian', profileCode: 'fujian', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'jiangxi', profileCode: 'jiangxi', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'shandong', profileCode: 'shandong', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'henan', profileCode: 'henan', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'hubei', profileCode: 'hubei', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'hunan', profileCode: 'hunan', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'guangxi', profileCode: 'guangxi', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'hainan', profileCode: 'hainan', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'chongqing', profileCode: 'chongqing', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'sichuan', profileCode: 'sichuan', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'guizhou', profileCode: 'guizhou', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'yunnan', profileCode: 'yunnan', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'tibet', profileCode: 'tibet', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'shaanxi', profileCode: 'shaanxi', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'gansu', profileCode: 'gansu', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'qinghai', profileCode: 'qinghai', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'ningxia', profileCode: 'ningxia', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'xinjiang', profileCode: 'xinjiang', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'guangdong', profileCode: 'guangdong', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'jiangsu', profileCode: 'jiangsu', profileStatus: 'published_profile' }),
        expect.objectContaining({ provinceCode: 'zhejiang', profileCode: 'zhejiang', profileStatus: 'published_profile' }),
      ]),
    )

    for (const rule of CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES) {
      expect(rule.aliases.length).toBeGreaterThanOrEqual(2)
      if (rule.profileStatus === 'published_profile') {
        expect(publishedProfileCodes.has(rule.profileCode)).toBe(true)
      } else {
        expect(rule.profileCode).toBe('default')
      }
    }

    const aliases = CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.flatMap((rule) => rule.aliases)
    expect(aliases).toEqual(expect.arrayContaining(['北京', 'beijing', '广东', 'guangdong', '浙江', 'zhejiang']))
  })

  it('only references existing certificates and work items from dependencies', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const certificateTypes = new Set(generalTemplate.certificates.map((certificate) => certificate.certificateType))
    const workItemCodes = new Set(generalTemplate.workItems.map((item) => item.workItemCode))

    for (const dependency of generalTemplate.dependencies) {
      const endpoints = [dependency.predecessor, dependency.successor]
      for (const endpoint of endpoints) {
        if (endpoint.type === 'certificate') {
          expect(certificateTypes.has(endpoint.certificateType)).toBe(true)
        } else {
          expect(workItemCodes.has(endpoint.workItemCode)).toBe(true)
        }
      }
    }
  })

  it('requires province profiles to carry governed publication metadata', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    expect(generalTemplate.provinceProfiles.map((profile) => profile.provinceCode)).toEqual(
      expect.arrayContaining(['default', 'guangdong', 'jiangsu', 'zhejiang']),
    )
    expect(generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'zhejiang')).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
    })
    expect(generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'zhejiang')?.policySources[0]).toMatchObject({
      sourceName: '浙江省深化工程建设项目审批制度改革工作实施方案',
      sourceUrl: expect.stringContaining('zj.gov.cn'),
    })

    for (const profile of generalTemplate.provinceProfiles) {
      expect(['published', 'candidate', 'deprecated']).toContain(profile.reviewStatus)
      expect(['national', 'province']).toContain(profile.policyLevel)
      expect(profile.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(profile.lastReviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(profile.nextReviewDueAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(profile.curationMethod).toBe('governed_seed')
      expect(Array.isArray(profile.materialOverrides)).toBe(true)
      expect(profile.policySources.length).toBeGreaterThan(0)
      for (const source of profile.policySources) {
        expect(source.sourceName).toBeTruthy()
        expect(source.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(source.updateMode).toBe('governed_seed_update')
        expect(['national', 'province', 'city']).toContain(source.policyLevel)
      }
    }
  })

  it('uses Zhejiang as a commercial-depth four-certificate province profile sample', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const zhejiangProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'zhejiang')
    expect(zhejiangProfile).toBeDefined()
    if (!zhejiangProfile) return

    expect(zhejiangProfile.reviewStatus).toBe('published')
    expect(zhejiangProfile.authorityAliases).toMatchObject({
      naturalResources: expect.stringContaining('自然资源'),
      housingConstruction: expect.stringContaining('住房城乡建设'),
      approvalWindow: expect.stringContaining('工程建设项目审批'),
    })
    expect(zhejiangProfile.optionalWorkItemCodes).toEqual(
      expect.arrayContaining(['CERT-EPP-PUBLIC-NOTICE', 'CERT-EPP-BLUEPRINT-CHECK']),
    )
    expect(zhejiangProfile.softDependencyCodes).toEqual(
      expect.arrayContaining(['DEP-LAND-TO-LUP', 'DEP-BLUEPRINT-CHECK-TO-EPP']),
    )

    const overridesByPackage = new Map(
      zhejiangProfile.materialPackageOverrides.map((override) => [override.materialPackageCode, override]),
    )
    expect([...overridesByPackage.keys()]).toEqual(
      expect.arrayContaining([
        'PKG-CERT-LAND-COMMON',
        'PKG-CERT-LUP-COMMON',
        'PKG-CERT-EPP-COMMON',
        'PKG-CERT-CP-COMMON',
      ]),
    )
    expect(overridesByPackage.get('PKG-CERT-LAND-COMMON')?.addMaterialNames).toEqual(
      expect.arrayContaining(['浙江省投资项目在线审批监管平台项目代码', '宗地图、界址点成果及交地确认材料']),
    )
    expect(overridesByPackage.get('PKG-CERT-LUP-COMMON')?.addMaterialNames).toEqual(
      expect.arrayContaining(['建设项目用地预审与选址或规划条件材料', '土地取得或权属证明材料']),
    )
    expect(overridesByPackage.get('PKG-CERT-EPP-COMMON')?.addMaterialNames).toEqual(
      expect.arrayContaining(['设计方案文本及总平面图', '蓝图、定位图及规划校核材料']),
    )
    expect(overridesByPackage.get('PKG-CERT-CP-COMMON')?.addMaterialNames).toEqual(
      expect.arrayContaining(['施工图联合审查合格资料', '质量安全监督登记和实名制管理材料']),
    )
    expect(zhejiangProfile.notes.join(' ')).toContain('四证资料包深度样板')
  })

  it('requires every published province profile to meet four-certificate material depth', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const requiredPackageCodes = [
      'PKG-CERT-LAND-COMMON',
      'PKG-CERT-LUP-COMMON',
      'PKG-CERT-EPP-COMMON',
      'PKG-CERT-CP-COMMON',
    ]
    const publishedProvinceProfiles = generalTemplate.provinceProfiles.filter(
      (profile) => profile.reviewStatus === 'published' && profile.policyLevel === 'province',
    )

    expect(publishedProvinceProfiles.map((profile) => profile.provinceCode)).toEqual(
      expect.arrayContaining(['beijing', 'tianjin', 'hebei', 'shanxi', 'inner_mongolia', 'liaoning', 'jilin', 'heilongjiang', 'shanghai', 'anhui', 'fujian', 'jiangxi', 'shandong', 'henan', 'hubei', 'hunan', 'guangxi', 'hainan', 'chongqing', 'sichuan', 'guangdong', 'jiangsu', 'zhejiang']),
    )

    for (const profile of publishedProvinceProfiles) {
      const overridesByPackage = new Map(
        profile.materialPackageOverrides.map((override) => [override.materialPackageCode, override]),
      )
      expect([...overridesByPackage.keys()], profile.provinceCode).toEqual(
        expect.arrayContaining(requiredPackageCodes),
      )
      for (const packageCode of requiredPackageCodes) {
        const materialOverride = overridesByPackage.get(packageCode)
        expect(materialOverride?.addMaterialNames?.length ?? 0, `${profile.provinceCode}:${packageCode}:materials`).toBeGreaterThanOrEqual(2)
        expect(materialOverride?.addPolicyBasis?.length ?? 0, `${profile.provinceCode}:${packageCode}:basis`).toBeGreaterThanOrEqual(1)
      }
      expect(profile.notes.join(' '), profile.provinceCode).toContain('四证资料包深度样板')
    }
  })

  it('declares the reusable quality gate for future province profile publication', () => {
    expect(CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE).toMatchObject({
      gateCode: 'published_province_four_certificate_depth',
      requiredPublicationStatus: 'published',
      requiredPolicyLevel: 'province',
      minimumAddMaterialNamesPerPackage: 2,
      minimumPolicyBasisPerPackage: 1,
    })
    expect(CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.requiredMaterialPackageCodes).toEqual([
      'PKG-CERT-LAND-COMMON',
      'PKG-CERT-LUP-COMMON',
      'PKG-CERT-EPP-COMMON',
      'PKG-CERT-CP-COMMON',
    ])
    expect(CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.publishPrerequisites.join(' ')).toContain('official_policy_source')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.publishPrerequisites.join(' ')).toContain('four_certificate_material_packages')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.publishPrerequisites.join(' ')).toContain('governed_review')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.publishPrerequisites.join(' ')).toContain('no_live_page_scrape')
  })

  it('plans province expansion batches without publishing unverified recognition-only provinces', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const recognitionOnlyCodes = CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES
      .filter((rule) => rule.profileStatus === 'recognition_only')
      .map((rule) => rule.provinceCode)
    const publishedProvinceProfileCodes = new Set(
      generalTemplate.provinceProfiles
        .filter((profile) => profile.reviewStatus === 'published' && profile.policyLevel === 'province')
        .map((profile) => profile.provinceCode),
    )
    const batchedCodes = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.flatMap((batch) => batch.provinceCodes)

    expect(new Set(batchedCodes).size).toBe(batchedCodes.length)
    expect([...batchedCodes].sort()).toEqual([...recognitionOnlyCodes].sort())
    expect(batchedCodes.some((code) => publishedProvinceProfileCodes.has(code))).toBe(false)
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.expectedCounts.provinceExpansionBatches).toBe(
      CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.length,
    )

    for (const batch of CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES) {
      expect(batch.profileQualityGateCode).toBe(CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.gateCode)
      expect(batch.targetProfileStatus).toBe('candidate')
      expect(batch.sourceDiscoveryPolicy).toContain('official_policy_source_discovery')
      expect(batch.sourceDiscoveryPolicy).toContain('no_live_page_scrape')
      expect(batch.promotionPolicy).toContain('candidate profile')
      expect(batch.promotionPolicy).toContain('published profile')
      expect(batch.referenceProfileCodes.length).toBeGreaterThanOrEqual(2)
      for (const referenceCode of batch.referenceProfileCodes) {
        expect(publishedProvinceProfileCodes.has(referenceCode), `${batch.batchCode}:${referenceCode}`).toBe(true)
      }
    }
  })

  it('plans high-value local override expansion batches without using market-tier labels as rules', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const publishedOverrideCodes = new Set(
      generalTemplate.cityOverrides
        .filter((override) => override.reviewStatus === 'published')
        .map((override) => override.overrideCode),
    )
    const targetCodes = CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES
      .flatMap((batch) => batch.targets)
      .map((target) => `${target.provinceCode}:${target.cityCode}`)
    const targetCategories = CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES
      .flatMap((batch) => batch.targetCategories)

    expect(CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE.gateCode).toBe('local_override_four_certificate_material_depth')
    expect(CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE.requiredMaterialPackageCodes).toEqual([
      'PKG-CERT-LAND-COMMON',
      'PKG-CERT-LUP-COMMON',
      'PKG-CERT-EPP-COMMON',
      'PKG-CERT-CP-COMMON',
    ])
    expect(CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE.minimumAddMaterialNamesPerPackage).toBe(2)
    expect(new Set(targetCodes).size).toBe(targetCodes.length)
    expect(targetCategories).toEqual(expect.arrayContaining(['high_frequency_city', 'major_city']))
    expect(targetCategories).not.toContain('key_park')
    expect(targetCategories.join(' ')).not.toContain('first_tier')
    expect(targetCategories.join(' ')).not.toContain('second_tier')
    expect(CERTIFICATE_TEMPLATE_GOVERNANCE_META.expectedCounts.localOverrideExpansionBatches).toBe(
      CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES.length,
    )

    const firstBatch = CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES[0]
    expect(firstBatch.batchCode).toBe('local_override_high_value_city_batch_1')
    expect(firstBatch.targetOverrideStatus).toBe('published')
    expect(firstBatch.localOverrideQualityGateCode).toBe(CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_QUALITY_GATE.gateCode)
    expect(firstBatch.runtimePreviewPolicy).toBe('published_override_only')
    expect(firstBatch.targets).toHaveLength(8)
    expect(firstBatch.targets.map((target) => target.cityCode)).toEqual(
      expect.arrayContaining(['beijing', 'guangzhou', 'nanjing', 'chengdu', 'wuhan', 'xian']),
    )
    expect(firstBatch.targets.map((target) => target.cityCode)).toEqual(
      expect.arrayContaining(['shanghai', 'hangzhou']),
    )
    expect(firstBatch.sourceDiscoveryPolicy).toContain('official_policy_source_discovery')
    expect(firstBatch.sourceDiscoveryPolicy).toContain('no_live_page_scrape')
    expect(firstBatch.promotionPolicy).toContain('published local override seed asset')
    expect(firstBatch.promotionPolicy).toContain('business preview consumes published override directly')

    for (const referenceCode of firstBatch.referenceOverrideCodes) {
      expect(publishedOverrideCodes.has(referenceCode), referenceCode).toBe(true)
    }
    for (const target of firstBatch.targets) {
      expect(target.seedAssetStatus, `${target.provinceCode}:${target.cityCode}`).toBe('published_seed_asset')
      expect(target.sourceDiscoveryKeywords.length, `${target.provinceCode}:${target.cityCode}`).toBeGreaterThanOrEqual(2)
      expect(target.referenceOverrideCodes).toEqual(expect.arrayContaining(firstBatch.referenceOverrideCodes))
    }
  })

  it('keeps local override seed assets city-scoped without park or zone rules', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const cityOverrides = (generalTemplate as any).cityOverrides ?? []
    const expansionTargets = CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES.flatMap((batch) => batch.targets)
    const targetCategories = CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES.flatMap((batch) => batch.targetCategories)
    const referenceCodes = CERTIFICATE_TEMPLATE_LOCAL_OVERRIDE_EXPANSION_BATCHES.flatMap((batch) => batch.referenceOverrideCodes)

    expect(cityOverrides.length).toBeGreaterThan(0)
    expect(cityOverrides.every((override: any) => override.overrideScope === 'city')).toBe(true)
    expect(cityOverrides.every((override: any) => !override.zoneCode && !override.zoneName)).toBe(true)
    expect(cityOverrides.map((override: any) => override.overrideCode).join(' ')).not.toMatch(/park_override|district_override/)
    expect(expansionTargets.every((target) => target.overrideScope === 'city')).toBe(true)
    expect(expansionTargets.every((target) => !(target as any).zoneCode && !(target as any).zoneName)).toBe(true)
    expect(targetCategories).not.toContain('key_park')
    expect(referenceCodes.join(' ')).not.toMatch(/park_override|district_override/)
  })

  it('publishes Shanghai as the first governed expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const shanghaiProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'shanghai')
    expect(shanghaiProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(shanghaiProfile?.policySources.map((source) => source.sourceUrl)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('shanghai.gov.cn'),
      ]),
    )
    expect(shanghaiProfile?.notes.join(' ')).toContain('first expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'shanghai')).toMatchObject({
      provinceCode: 'shanghai',
      profileCode: 'shanghai',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Fujian as the second governed expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const fujianProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'fujian')
    expect(fujianProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(fujianProfile?.policySources[0]).toMatchObject({
      sourceName: '福建省全面开展工程建设项目审批制度改革实施方案',
      sourceUrl: expect.stringContaining('fujian.gov.cn'),
      checkedAt: '2026-05-28',
    })
    expect(fujianProfile?.notes.join(' ')).toContain('first expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'fujian')).toMatchObject({
      provinceCode: 'fujian',
      profileCode: 'fujian',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Anhui as the third governed expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const anhuiProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'anhui')
    expect(anhuiProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(anhuiProfile?.policySources[0]).toMatchObject({
      sourceName: '安徽政务服务网工程建设项目审批服务入口治理记录',
      sourceUrl: expect.stringContaining('ahzwfw.gov.cn'),
      checkedAt: '2026-05-28',
    })
    expect(anhuiProfile?.notes.join(' ')).toContain('first expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'anhui')).toMatchObject({
      provinceCode: 'anhui',
      profileCode: 'anhui',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Shandong as the fourth governed expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const shandongProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'shandong')
    expect(shandongProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(shandongProfile?.policySources[0]).toMatchObject({
      sourceUrl: expect.stringContaining('zwfwzx.jining.gov.cn'),
      checkedAt: '2026-05-28',
    })
    expect(shandongProfile?.notes.join(' ')).toContain('first expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'shandong')).toMatchObject({
      provinceCode: 'shandong',
      profileCode: 'shandong',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Jiangxi as the fifth governed expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const jiangxiProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'jiangxi')
    expect(jiangxiProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(jiangxiProfile?.policySources[0]).toMatchObject({
      sourceName: '关于印发江西省工程建设项目审批各阶段办事指南、申请表单、申报材料清单示范文本的通知（赣工改办〔2020〕22号）',
      sourceUrl: expect.stringContaining('zjj.nc.gov.cn'),
      checkedAt: '2026-05-28',
    })
    expect(jiangxiProfile?.notes.join(' ')).toContain('first expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'jiangxi')).toMatchObject({
      provinceCode: 'jiangxi',
      profileCode: 'jiangxi',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Beijing as the first governed north expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const beijingProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'beijing')
    expect(beijingProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(beijingProfile?.policySources.map((source) => source.sourceUrl)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('tzxm.beijing.gov.cn/front/article/4679'),
        expect.stringContaining('tzxm.beijing.gov.cn/bjpc/bjpc/article_file'),
      ]),
    )
    expect(beijingProfile?.notes.join(' ')).toContain('north expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'beijing')).toMatchObject({
      provinceCode: 'beijing',
      profileCode: 'beijing',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Tianjin as the second governed north expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const tianjinProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'tianjin')
    expect(tianjinProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(tianjinProfile?.policySources.map((source) => source.sourceUrl)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('zwfwb.tj.gov.cn/zwgk/zcwj/sjzcwj'),
        expect.stringContaining('zfcxjs.tj.gov.cn/sylm/gabsycs/tzgggh/202312'),
      ]),
    )
    expect(tianjinProfile?.notes.join(' ')).toContain('north expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'tianjin')).toMatchObject({
      provinceCode: 'tianjin',
      profileCode: 'tianjin',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Hebei as the third governed north expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const hebeiProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'hebei')
    expect(hebeiProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(hebeiProfile?.policySources[0]).toMatchObject({
      sourceName: '河北省人民政府办公厅关于印发河北省全面深化工程建设项目审批制度改革实施方案的通知（冀政办字〔2019〕42号）',
      sourceUrl: expect.stringContaining('xiongan.gov.cn/2018-12/04'),
      checkedAt: '2026-05-28',
    })
    expect(hebeiProfile?.policySources.map((source) => source.sourceUrl)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('xiongan.gov.cn/2018-12/04'),
      ]),
    )
    expect(hebeiProfile?.notes.join(' ')).toContain('north expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'hebei')).toMatchObject({
      provinceCode: 'hebei',
      profileCode: 'hebei',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Shanxi as the fourth governed north expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const shanxiProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'shanxi')
    expect(shanxiProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(shanxiProfile?.policySources[0]).toMatchObject({
      sourceName: '山西省人民政府办公厅关于印发山西省进一步优化项目审批流程若干举措的通知',
      sourceUrl: expect.stringContaining('sxgp.gov.cn/xwzx_358/szfwj_1327'),
      checkedAt: '2026-05-28',
    })
    expect(shanxiProfile?.policySources.map((source) => source.sourceName)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('进一步优化项目审批流程若干举措'),
        expect.stringContaining('全面推进工程建设项目审批制度改革实施方案'),
      ]),
    )
    expect(shanxiProfile?.notes.join(' ')).toContain('north expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'shanxi')).toMatchObject({
      provinceCode: 'shanxi',
      profileCode: 'shanxi',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Inner Mongolia as the fifth governed north expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const innerMongoliaProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'inner_mongolia')
    expect(innerMongoliaProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(innerMongoliaProfile?.policySources[0]).toMatchObject({
      sourceName: '内蒙古自治区进一步深化工程建设项目审批制度改革实施方案',
      sourceUrl: expect.stringContaining('qsq.gov.cn/kdyxtz/88919'),
      checkedAt: '2026-05-28',
    })
    expect(innerMongoliaProfile?.policySources.map((source) => source.sourceName)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('进一步深化工程建设项目审批制度改革'),
        expect.stringContaining('内蒙古政务服务网工程建设项目审批服务入口'),
      ]),
    )
    expect(innerMongoliaProfile?.notes.join(' ')).toContain('north expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'inner_mongolia')).toMatchObject({
      provinceCode: 'inner_mongolia',
      profileCode: 'inner_mongolia',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Liaoning as the first governed northeast expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const liaoningProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'liaoning')
    expect(liaoningProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(liaoningProfile?.policySources[0]).toMatchObject({
      sourceName: '辽宁省人民政府办公厅关于印发辽宁省工程建设项目审批制度改革实施方案的通知（辽政办发〔2019〕18号）',
      sourceUrl: expect.stringContaining('ln.gov.cn/web/zwgkx'),
      checkedAt: '2026-05-29',
    })
    expect(liaoningProfile?.policySources.map((source) => source.sourceName)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('辽宁省工程建设项目审批制度改革实施方案'),
        expect.stringContaining('辽宁省工程建设项目审批服务事项清单（2025年版）'),
        expect.stringContaining('施工许可、竣工验收阶段'),
      ]),
    )
    expect(liaoningProfile?.notes.join(' ')).toContain('northeast expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'liaoning')).toMatchObject({
      provinceCode: 'liaoning',
      profileCode: 'liaoning',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Jilin as the second governed northeast expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const jilinProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'jilin')
    expect(jilinProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(jilinProfile?.policySources[0]).toMatchObject({
      sourceName: '吉林省人民政府办公厅关于印发吉林省全面开展工程建设项目审批制度改革实施方案的通知（吉政办发〔2019〕30号）',
      sourceUrl: expect.stringContaining('xxgk.jl.gov.cn/szf/gkml/201905'),
      checkedAt: '2026-05-29',
    })
    expect(jilinProfile?.policySources.map((source) => source.sourceName)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('吉林省全面开展工程建设项目审批制度改革实施方案'),
        expect.stringContaining('政策解读'),
        expect.stringContaining('进一步提升工程建设项目审批服务效能工作方案'),
      ]),
    )
    expect(jilinProfile?.notes.join(' ')).toContain('northeast expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'jilin')).toMatchObject({
      provinceCode: 'jilin',
      profileCode: 'jilin',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Heilongjiang as the third governed northeast expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const heilongjiangProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'heilongjiang')
    expect(heilongjiangProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(heilongjiangProfile?.policySources[0]).toMatchObject({
      sourceName: '关于印发《黑龙江省工程建设项目审批服务事项清单（2025年版）》的通知',
      sourceUrl: expect.stringContaining('zfcxjst.hlj.gov.cn/zfcxjst/c114789'),
      checkedAt: '2026-05-29',
    })
    expect(heilongjiangProfile?.policySources.map((source) => source.sourceName)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('工程建设项目审批服务事项清单'),
        expect.stringContaining('黑龙江省工程建设项目审批制度改革实施方案'),
        expect.stringContaining('数字化施工图审查系统'),
      ]),
    )
    expect(heilongjiangProfile?.notes.join(' ')).toContain('northeast expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'heilongjiang')).toMatchObject({
      provinceCode: 'heilongjiang',
      profileCode: 'heilongjiang',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Henan as the first governed central-south expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const henanProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'henan')
    expect(henanProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(henanProfile?.policySources[0]).toMatchObject({
      sourceName: '河南省全面推进工程建设项目审批制度改革实施方案（豫政办〔2019〕38号）',
      sourceUrl: expect.stringContaining('henan.gov.cn'),
      checkedAt: '2026-05-30',
    })
    expect(henanProfile?.policySources.map((source) => source.sourceName)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('工程建设项目审批制度改革'),
        expect.stringContaining('多审合一、多证合一'),
        expect.stringContaining('施工许可'),
      ]),
    )
    expect(henanProfile?.notes.join(' ')).toContain('central-south expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'henan')).toMatchObject({
      provinceCode: 'henan',
      profileCode: 'henan',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Hubei as the second governed central-south expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const hubeiProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'hubei')
    expect(hubeiProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(hubeiProfile?.policySources[0]).toMatchObject({
      sourceName: '省人民政府办公厅关于印发湖北省工程建设项目审批制度改革实施方案的通知（鄂政办发〔2019〕44号）',
      sourceUrl: expect.stringContaining('zrzyt.hubei.gov.cn'),
      checkedAt: '2026-05-30',
    })
    expect(hubeiProfile?.policySources.map((source) => source.sourceName)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('工程建设项目审批制度改革'),
        expect.stringContaining('多审合一'),
        expect.stringContaining('施工图联合审查'),
      ]),
    )
    expect(hubeiProfile?.notes.join(' ')).toContain('central-south expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'hubei')).toMatchObject({
      provinceCode: 'hubei',
      profileCode: 'hubei',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Hunan as the third governed central-south expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const hunanProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'hunan')
    expect(hunanProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
    })
    expect(hunanProfile?.policySources[0]).toMatchObject({
      sourceName: '湖南省人民政府办公厅关于印发《湖南省工程建设项目审批制度改革工作实施方案》的通知（湘政办发〔2019〕24号）',
      sourceUrl: expect.stringContaining('hunan.gov.cn'),
      checkedAt: '2026-05-30',
    })
    expect(hunanProfile?.policySources.map((source) => source.sourceName)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('工程建设项目审批制度改革'),
        expect.stringContaining('工程建设项目审批工作指南'),
        expect.stringContaining('一窗受理'),
      ]),
    )
    expect(hunanProfile?.notes.join(' ')).toContain('central-south expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'hunan')).toMatchObject({
      provinceCode: 'hunan',
      profileCode: 'hunan',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Guangxi as the fourth governed central-south expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const guangxiProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'guangxi')
    expect(guangxiProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(guangxiProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('zjt.gxzf.gov.cn'),
        expect.stringContaining('gov.cn/lianbo/difang'),
      ]),
    )
    expect(guangxiProfile?.notes.join(' ')).toContain('central-south expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'guangxi')).toMatchObject({
      provinceCode: 'guangxi',
      profileCode: 'guangxi',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Hainan as the fifth governed central-south expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const hainanProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'hainan')
    expect(hainanProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(hainanProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([expect.stringContaining('hainan.gov.cn')]),
    )
    expect(hainanProfile?.notes.join(' ')).toContain('central-south expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'hainan')).toMatchObject({
      provinceCode: 'hainan',
      profileCode: 'hainan',
      profileStatus: 'published_profile',
    })
  })

  it('publishes Chongqing as the first governed southwest expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const chongqingProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'chongqing')
    expect(chongqingProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(chongqingProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('cq.gov.cn/zwgk/zfxxgkml/szfwj/xzgfxwj/szf/201910'),
        expect.stringContaining('zfcxjw.cq.gov.cn/zwxx_166/gsgg/202601'),
        expect.stringContaining('zfcxjw.cq.gov.cn/zwxx_166/gsgg/202507'),
      ]),
    )
    expect(chongqingProfile?.notes.join(' ')).toContain('southwest expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'chongqing')).toMatchObject({
      provinceCode: 'chongqing',
      profileCode: 'chongqing',
      profileStatus: 'published_profile',
    })

    const southwestBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_southwest_batch_5',
    )
    expect(southwestBatch?.provinceCodes).toEqual([])
  })

  it('publishes Sichuan as the second governed southwest expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const sichuanProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'sichuan')
    expect(sichuanProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(sichuanProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('sczwfw.gov.cn/art/2019/5/24/art_15330_87344'),
        expect.stringContaining('gcjs.sczwfw.gov.cn'),
        expect.stringContaining('dnr.sc.gov.cn/scdnr/xzgfxwj/2019/11/15'),
      ]),
    )
    expect(sichuanProfile?.notes.join(' ')).toContain('southwest expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'sichuan')).toMatchObject({
      provinceCode: 'sichuan',
      profileCode: 'sichuan',
      profileStatus: 'published_profile',
    })

    const southwestBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_southwest_batch_5',
    )
    expect(southwestBatch?.provinceCodes).toEqual([])
  })

  it('publishes Guizhou as the third governed southwest expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const guizhouProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'guizhou')
    expect(guizhouProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(guizhouProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('guizhou.gov.cn'),
        expect.stringContaining('zwfw.guizhou.gov.cn'),
        expect.stringContaining('zrzy.guizhou.gov.cn'),
      ]),
    )
    expect(guizhouProfile?.notes.join(' ')).toContain('southwest expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'guizhou')).toMatchObject({
      provinceCode: 'guizhou',
      profileCode: 'guizhou',
      profileStatus: 'published_profile',
    })

    const southwestBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_southwest_batch_5',
    )
    expect(southwestBatch?.provinceCodes).toEqual([])
  })

  it('publishes Yunnan as the fourth governed southwest expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const yunnanProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'yunnan')
    expect(yunnanProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(yunnanProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('zfcxjst.yn.gov.cn'),
        expect.stringContaining('zwfw.yn.gov.cn'),
        expect.stringContaining('dnr.yn.gov.cn/html/2020/xingzhengguifanxingwenjian_0330'),
      ]),
    )
    expect(yunnanProfile?.notes.join(' ')).toContain('southwest expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'yunnan')).toMatchObject({
      provinceCode: 'yunnan',
      profileCode: 'yunnan',
      profileStatus: 'published_profile',
    })

    const southwestBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_southwest_batch_5',
    )
    expect(southwestBatch?.provinceCodes).toEqual([])
  })

  it('publishes Tibet as the final governed southwest expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const tibetProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'tibet')
    expect(tibetProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(tibetProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('xizang.gov.cn/zwgk/xxfb/zbwj/201911'),
        expect.stringContaining('xzzwfw.gov.cn'),
        expect.stringContaining('zrzyt.xizang.gov.cn/fw/bszn/202005'),
      ]),
    )
    expect(tibetProfile?.notes.join(' ')).toContain('southwest expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'tibet')).toMatchObject({
      provinceCode: 'tibet',
      profileCode: 'tibet',
      profileStatus: 'published_profile',
    })

    const southwestBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_southwest_batch_5',
    )
    expect(southwestBatch?.provinceCodes).toEqual([])
  })

  it('publishes Shaanxi as the first governed northwest expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const shaanxiProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'shaanxi')
    expect(shaanxiProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(shaanxiProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('shaanxi.gov.cn/zfxxgk/fdzdgknr/zcwj/nszfbgtwj/szbf'),
        expect.stringContaining('zwfw.shaanxi.gov.cn'),
        expect.stringContaining('zrzyt.shaanxi.gov.cn'),
      ]),
    )
    expect(shaanxiProfile?.notes.join(' ')).toContain('northwest expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'shaanxi')).toMatchObject({
      provinceCode: 'shaanxi',
      profileCode: 'shaanxi',
      profileStatus: 'published_profile',
    })

    const northwestBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_northwest_batch_6',
    )
    expect(northwestBatch?.provinceCodes).not.toContain('shaanxi')
  })

  it('publishes Gansu as the second governed northwest expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const gansuProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'gansu')
    expect(gansuProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(gansuProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('gansu.gov.cn/gsszf/c100055/202106'),
        expect.stringContaining('zwfw.gansu.gov.cn'),
        expect.stringContaining('zhangye.gov.cn'),
      ]),
    )
    expect(gansuProfile?.notes.join(' ')).toContain('northwest expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'gansu')).toMatchObject({
      provinceCode: 'gansu',
      profileCode: 'gansu',
      profileStatus: 'published_profile',
    })

    const northwestBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_northwest_batch_6',
    )
    expect(northwestBatch?.provinceCodes).not.toContain('gansu')
  })

  it('publishes Qinghai as the third governed northwest expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const qinghaiProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'qinghai')
    expect(qinghaiProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(qinghaiProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('qhzwfw.gov.cn'),
        expect.stringContaining('tzxm.qinghai.gov.cn'),
        expect.stringContaining('zrzyt.qinghai.gov.cn'),
      ]),
    )
    expect(qinghaiProfile?.notes.join(' ')).toContain('northwest expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'qinghai')).toMatchObject({
      provinceCode: 'qinghai',
      profileCode: 'qinghai',
      profileStatus: 'published_profile',
    })

    const northwestBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_northwest_batch_6',
    )
    expect(northwestBatch?.provinceCodes).not.toContain('qinghai')
  })

  it('publishes Ningxia as the fourth governed northwest expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const ningxiaProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'ningxia')
    expect(ningxiaProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(ningxiaProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('nx.gov.cn'),
        expect.stringContaining('jst.nx.gov.cn'),
        expect.stringContaining('zwfw.nx.gov.cn'),
      ]),
    )
    expect(ningxiaProfile?.notes.join(' ')).toContain('northwest expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'ningxia')).toMatchObject({
      provinceCode: 'ningxia',
      profileCode: 'ningxia',
      profileStatus: 'published_profile',
    })

    const northwestBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_northwest_batch_6',
    )
    expect(northwestBatch?.provinceCodes).not.toContain('ningxia')
  })

  it('publishes Xinjiang as the final governed northwest expansion province profile', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const xinjiangProfile = generalTemplate.provinceProfiles.find((profile) => profile.provinceCode === 'xinjiang')
    expect(xinjiangProfile).toMatchObject({
      reviewStatus: 'published',
      policyLevel: 'province',
      curationMethod: 'governed_seed',
      effectiveFrom: '2026-05-30',
      lastReviewedAt: '2026-05-30',
      nextReviewDueAt: '2026-08-30',
    })
    expect(xinjiangProfile?.policySources.map((source) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('xjtc.gov.cn'),
        expect.stringContaining('zwfw.xinjiang.gov.cn'),
        expect.stringContaining('zrzyt.xinjiang.gov.cn'),
      ]),
    )
    expect(xinjiangProfile?.notes.join(' ')).toContain('northwest expansion published profile')
    expect(CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.find((rule) => rule.provinceCode === 'xinjiang')).toMatchObject({
      provinceCode: 'xinjiang',
      profileCode: 'xinjiang',
      profileStatus: 'published_profile',
    })

    const northwestBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_northwest_batch_6',
    )
    expect(northwestBatch?.provinceCodes).toEqual([])
  })

  it('keeps the remaining first expansion batch as candidate province profiles only', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const firstBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_east_coast_batch_1',
    )
    expect(firstBatch?.provinceCodes).toEqual([])

    const profilesByCode = new Map(generalTemplate.provinceProfiles.map((profile) => [profile.provinceCode, profile]))
    const recognitionRulesByCode = new Map(
      CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.map((rule) => [rule.provinceCode, rule]),
    )

    for (const provinceCode of firstBatch?.provinceCodes ?? []) {
      const profile = profilesByCode.get(provinceCode)
      expect(profile, provinceCode).toBeDefined()
      if (!profile) continue

      expect(profile).toMatchObject({
        reviewStatus: 'candidate',
        policyLevel: 'province',
        curationMethod: 'governed_seed',
      })
      expect(profile.policySources.length, provinceCode).toBeGreaterThanOrEqual(1)
      expect(profile.policySources.every((source) => source.updateMode === 'governed_seed_update'), provinceCode).toBe(true)
      expect(profile.policySources.every((source) => source.policyLevel === 'province'), provinceCode).toBe(true)
      expect(profile.materialOverrides.some((override) => override.landAcquisitionMethodCode === 'transfer'), provinceCode).toBe(true)
      expect(profile.notes.join(' '), provinceCode).toContain('candidate profile')
      expect(profile.notes.join(' '), provinceCode).toContain('not applied by business preview')
      expect(profile.notes.join(' '), provinceCode).toContain('governed review')

      const overridesByPackage = new Map(
        profile.materialPackageOverrides.map((override) => [override.materialPackageCode, override]),
      )
      expect([...overridesByPackage.keys()], provinceCode).toEqual(
        expect.arrayContaining([...CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.requiredMaterialPackageCodes]),
      )
      for (const packageCode of CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.requiredMaterialPackageCodes) {
        const override = overridesByPackage.get(packageCode)
        expect(override?.addMaterialNames?.length ?? 0, `${provinceCode}:${packageCode}:materials`).toBeGreaterThanOrEqual(2)
        expect(override?.addPolicyBasis?.length ?? 0, `${provinceCode}:${packageCode}:basis`).toBeGreaterThanOrEqual(1)
      }

      expect(recognitionRulesByCode.get(provinceCode)).toMatchObject({
        provinceCode,
        profileCode: 'default',
        profileStatus: 'recognition_only',
      })
    }
  })

  it('stages the north expansion batch as candidate province profiles only', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const northBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_north_batch_2',
    )
    expect(northBatch?.provinceCodes).toEqual([])

    const profilesByCode = new Map(generalTemplate.provinceProfiles.map((profile) => [profile.provinceCode, profile]))
    const recognitionRulesByCode = new Map(
      CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.map((rule) => [rule.provinceCode, rule]),
    )

    for (const provinceCode of northBatch?.provinceCodes ?? []) {
      const profile = profilesByCode.get(provinceCode)
      expect(profile, provinceCode).toBeDefined()
      if (!profile) continue

      expect(profile).toMatchObject({
        reviewStatus: 'candidate',
        policyLevel: 'province',
        curationMethod: 'governed_seed',
      })
      expect(profile.policySources.length, provinceCode).toBeGreaterThanOrEqual(1)
      expect(profile.policySources.every((source) => source.policyLevel === 'province'), provinceCode).toBe(true)
      expect(profile.notes.join(' '), provinceCode).toContain('candidate profile')
      expect(profile.notes.join(' '), provinceCode).toContain('not applied by business preview')

      const overridesByPackage = new Map(
        profile.materialPackageOverrides.map((override) => [override.materialPackageCode, override]),
      )
      expect([...overridesByPackage.keys()], provinceCode).toEqual(
        expect.arrayContaining([...CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.requiredMaterialPackageCodes]),
      )
      for (const packageCode of CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_QUALITY_GATE.requiredMaterialPackageCodes) {
        const override = overridesByPackage.get(packageCode)
        expect(override?.addMaterialNames?.length ?? 0, `${provinceCode}:${packageCode}:materials`).toBeGreaterThanOrEqual(2)
        expect(override?.addPolicyBasis?.length ?? 0, `${provinceCode}:${packageCode}:basis`).toBeGreaterThanOrEqual(1)
      }

      expect(recognitionRulesByCode.get(provinceCode)).toMatchObject({
        provinceCode,
        profileCode: 'default',
        profileStatus: 'recognition_only',
      })
    }
  })

  it('stages the remaining northeast expansion batch as candidate province profiles only', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const northeastBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_northeast_batch_3',
    )
    expect(northeastBatch?.provinceCodes).toEqual([])

    const profilesByCode = new Map(generalTemplate.provinceProfiles.map((profile) => [profile.provinceCode, profile]))
    const recognitionRulesByCode = new Map(
      CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.map((rule) => [rule.provinceCode, rule]),
    )

    for (const provinceCode of northeastBatch?.provinceCodes ?? []) {
      const profile = profilesByCode.get(provinceCode)
      expect(profile, provinceCode).toBeUndefined()

      expect(recognitionRulesByCode.get(provinceCode)).toMatchObject({
        provinceCode,
        profileCode: 'default',
        profileStatus: 'recognition_only',
      })
    }
  })

  it('stages the remaining central-south expansion batch as recognition-only province profiles', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const centralSouthBatch = CERTIFICATE_TEMPLATE_PROVINCE_PROFILE_EXPANSION_BATCHES.find(
      (batch) => batch.batchCode === 'province_profile_central_south_batch_4',
    )
    expect(centralSouthBatch?.provinceCodes).toEqual([])

    const profilesByCode = new Map(generalTemplate.provinceProfiles.map((profile) => [profile.provinceCode, profile]))
    const recognitionRulesByCode = new Map(
      CERTIFICATE_TEMPLATE_PROVINCE_RECOGNITION_RULES.map((rule) => [rule.provinceCode, rule]),
    )

    for (const provinceCode of centralSouthBatch?.provinceCodes ?? []) {
      const profile = profilesByCode.get(provinceCode)
      expect(profile, provinceCode).toBeUndefined()

      expect(recognitionRulesByCode.get(provinceCode)).toMatchObject({
        provinceCode,
        profileCode: 'default',
        profileStatus: 'recognition_only',
      })
    }
  })

  it('keeps province profile overlays referentially safe', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const workItemCodes = new Set(generalTemplate.workItems.map((item) => item.workItemCode))
    const dependencyCodes = new Set(generalTemplate.dependencies.map((dependency) => dependency.dependencyCode))
    const landMethodCodes = new Set(generalTemplate.landAcquisitionMethods.map((method) => method.methodCode))

    for (const materialPackage of generalTemplate.materialPackages) {
      for (const code of materialPackage.workItemCodes) {
        expect(workItemCodes.has(code), `${materialPackage.packageCode}:${code}`).toBe(true)
      }
    }

    for (const profile of generalTemplate.provinceProfiles) {
      for (const code of [...profile.additionalWorkItemCodes, ...profile.optionalWorkItemCodes]) {
        expect(workItemCodes.has(code), `${profile.provinceCode}:${code}`).toBe(true)
      }
      for (const code of profile.softDependencyCodes) {
        expect(dependencyCodes.has(code), `${profile.provinceCode}:${code}`).toBe(true)
      }
      for (const override of profile.materialPackageOverrides) {
        expect(
          generalTemplate.materialPackages.some((materialPackage) => materialPackage.packageCode === override.materialPackageCode),
          `${profile.provinceCode}:${override.materialPackageCode}`,
        ).toBe(true)
      }
      for (const override of profile.materialOverrides) {
        expect(landMethodCodes.has(override.landAcquisitionMethodCode), `${profile.provinceCode}:${override.landAcquisitionMethodCode}`).toBe(true)
      }
    }
  })

  it('stages city overlays as governed seed assets starting with Shenzhen and Suzhou', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const cityOverrides = (generalTemplate as any).cityOverrides ?? []
    const shenzhenOverride = cityOverrides.find((override: any) => override.cityCode === 'shenzhen')
    const suzhouOverride = cityOverrides.find((override: any) => override.overrideCode === 'city_override_jiangsu_suzhou_v14222')

    expect(shenzhenOverride).toMatchObject({
      cityCode: 'shenzhen',
      cityName: '深圳市',
      provinceCode: 'guangdong',
      reviewStatus: 'published',
      policyLevel: 'city',
      curationMethod: 'governed_seed',
    })
    expect(shenzhenOverride.aliases).toEqual(expect.arrayContaining(['深圳', '深圳市', 'shenzhen', '前海', '南山区']))
    expect(shenzhenOverride.policySources.every((source: any) => source.policyLevel === 'city')).toBe(true)
    expect(shenzhenOverride.overrideScope).toBe('city')
    expect(shenzhenOverride).not.toHaveProperty('zoneCode')
    expect(shenzhenOverride).not.toHaveProperty('zoneName')
    expect(shenzhenOverride.materialPackageOverrides.map((override: any) => override.materialPackageCode)).toEqual(
      expect.arrayContaining([
        'PKG-CERT-LAND-COMMON',
        'PKG-CERT-LUP-COMMON',
        'PKG-CERT-EPP-COMMON',
        'PKG-CERT-CP-COMMON',
      ]),
    )
    expect(
      shenzhenOverride.materialOverrides.find((override: any) => override.landAcquisitionMethodCode === 'transfer')?.addMaterialNames,
    ).toEqual(expect.arrayContaining(['深圳市出让取得土地权属链补充材料']))

    expect(suzhouOverride).toMatchObject({
      cityCode: 'suzhou',
      cityName: '苏州市',
      provinceCode: 'jiangsu',
      overrideScope: 'city',
      reviewStatus: 'published',
      policyLevel: 'city',
      curationMethod: 'governed_seed',
    })
    expect(suzhouOverride).not.toHaveProperty('zoneCode')
    expect(suzhouOverride).not.toHaveProperty('zoneName')
    expect(suzhouOverride.aliases).toEqual(expect.arrayContaining(['苏州', '苏州市', '苏州工业园区', '工业园区', 'sip', 'Suzhou Industrial Park']))
    expect(suzhouOverride.policySources.every((source: any) => source.policyLevel === 'city')).toBe(true)
    expect(suzhouOverride.policySources.map((source: any) => source.sourceUrl ?? '')).toEqual(
      expect.arrayContaining([
        expect.stringContaining('suzhou.gov.cn/szsrmzf/qxkx'),
        expect.stringContaining('jszwfw.gov.cn'),
      ]),
    )
    expect(suzhouOverride.notes.join(' ')).toContain('城市级规则')
    expect(suzhouOverride.materialPackageOverrides.map((override: any) => override.materialPackageCode)).toEqual(
      expect.arrayContaining([
        'PKG-CERT-LAND-COMMON',
        'PKG-CERT-LUP-COMMON',
        'PKG-CERT-EPP-COMMON',
        'PKG-CERT-CP-COMMON',
      ]),
    )
    expect(
      suzhouOverride.materialOverrides.find((override: any) => override.landAcquisitionMethodCode === 'transfer')?.addMaterialNames,
    ).toEqual(expect.arrayContaining(['苏州市土地出让及不动产权属链补充材料']))
  })

  it('publishes the first-batch local city rules as preview-consumed templates', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const cityOverrides = (generalTemplate as any).cityOverrides ?? []
    const expectedOverrides = [
      {
        overrideCode: 'city_override_beijing_beijing_v14222',
        cityCode: 'beijing',
        cityName: '北京市',
        provinceCode: 'beijing',
        overrideScope: 'city',
        transferMaterial: '北京市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_guangdong_guangzhou_v14222',
        cityCode: 'guangzhou',
        cityName: '广州市',
        provinceCode: 'guangdong',
        overrideScope: 'city',
        transferMaterial: '广州市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_jiangsu_nanjing_v14222',
        cityCode: 'nanjing',
        cityName: '南京市',
        provinceCode: 'jiangsu',
        overrideScope: 'city',
        transferMaterial: '南京市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_sichuan_chengdu_v14222',
        cityCode: 'chengdu',
        cityName: '成都市',
        provinceCode: 'sichuan',
        overrideScope: 'city',
        transferMaterial: '成都市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_hubei_wuhan_v14222',
        cityCode: 'wuhan',
        cityName: '武汉市',
        provinceCode: 'hubei',
        overrideScope: 'city',
        transferMaterial: '武汉市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_shaanxi_xian_v14222',
        cityCode: 'xian',
        cityName: '西安市',
        provinceCode: 'shaanxi',
        overrideScope: 'city',
        transferMaterial: '西安市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_shanghai_shanghai_v14222',
        cityCode: 'shanghai',
        cityName: '上海市',
        provinceCode: 'shanghai',
        overrideScope: 'city',
        transferMaterial: '上海市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_zhejiang_hangzhou_v14222',
        cityCode: 'hangzhou',
        cityName: '杭州市',
        provinceCode: 'zhejiang',
        overrideScope: 'city',
        transferMaterial: '杭州市出让取得土地权属链补充材料',
      },
    ]

    for (const expectedOverride of expectedOverrides) {
      const override = cityOverrides.find((item: any) => item.overrideCode === expectedOverride.overrideCode)
      expect(override).toMatchObject({
        cityCode: expectedOverride.cityCode,
        cityName: expectedOverride.cityName,
        provinceCode: expectedOverride.provinceCode,
        overrideScope: expectedOverride.overrideScope,
        reviewStatus: 'published',
        policyLevel: 'city',
        curationMethod: 'governed_seed',
      })
      expect(override).not.toHaveProperty('zoneCode')
      expect(override).not.toHaveProperty('zoneName')
      expect(override.policyLevel, override.overrideCode).toBe('city')
      expect(override.curationMethod, override.overrideCode).toBe('governed_seed')
      expect(override.notes.join(' '), override.overrideCode).toContain('直接叠加')
      expect(override.notes.join(' '), override.overrideCode).not.toContain('not applied by business preview')
      expect(override.materialPackageOverrides.map((item: any) => item.materialPackageCode), override.overrideCode).toEqual(
        expect.arrayContaining([
          'PKG-CERT-LAND-COMMON',
          'PKG-CERT-LUP-COMMON',
          'PKG-CERT-EPP-COMMON',
          'PKG-CERT-CP-COMMON',
        ]),
      )
      for (const packageOverride of override.materialPackageOverrides) {
        expect(packageOverride.addMaterialNames.length, `${expectedOverride.overrideCode}:${packageOverride.materialPackageCode}`).toBeGreaterThanOrEqual(2)
      }
      expect(override.materialOverrides.some((item: any) => item.landAcquisitionMethodCode === 'transfer'), override.overrideCode).toBe(true)
      expect(
        override.materialOverrides.find((item: any) => item.landAcquisitionMethodCode === 'transfer')?.addMaterialNames,
      ).toEqual(expect.arrayContaining([expectedOverride.transferMaterial]))
      expect(override.governedSourceEvidence.map((source: any) => source.sourceType)).toEqual([
        'engineering_approval_portal',
        'planning_natural_resources',
        'housing_construction_permit',
        'land_supply_or_transaction',
      ])
    }
  })

  it('keeps Beijing as a published city override with governed source evidence', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const cityOverrides = (generalTemplate as any).cityOverrides ?? []
    const beijingOverride = cityOverrides.find((override: any) => override.overrideCode === 'city_override_beijing_beijing_v14222')

    expect(beijingOverride).toMatchObject({
      cityCode: 'beijing',
      cityName: '北京市',
      provinceCode: 'beijing',
      overrideScope: 'city',
      reviewStatus: 'published',
      policyLevel: 'city',
      curationMethod: 'governed_seed',
    })
    expect(beijingOverride.aliases).toEqual(expect.arrayContaining(['beijing', '北京', '北京市']))
    expect(beijingOverride.notes.join(' ')).toContain('项目命中该城市时直接叠加城市资料包')
    expect(beijingOverride.notes.join(' ')).not.toContain('not applied by business preview')
    expect(beijingOverride.materialPackageOverrides.map((item: any) => item.materialPackageCode)).toEqual(
      expect.arrayContaining([
        'PKG-CERT-LAND-COMMON',
        'PKG-CERT-LUP-COMMON',
        'PKG-CERT-EPP-COMMON',
        'PKG-CERT-CP-COMMON',
      ]),
    )
    for (const packageOverride of beijingOverride.materialPackageOverrides) {
      expect(packageOverride.addMaterialNames.length, packageOverride.materialPackageCode).toBeGreaterThanOrEqual(2)
    }
    expect(
      beijingOverride.materialOverrides.find((override: any) => override.landAcquisitionMethodCode === 'transfer')?.addMaterialNames,
    ).toEqual(expect.arrayContaining(['北京市出让取得土地权属链补充材料']))
    expect(beijingOverride.governedSourceTypes).toEqual([
      'engineering_approval_portal',
      'planning_natural_resources',
      'housing_construction_permit',
      'land_supply_or_transaction',
    ])
    expect(beijingOverride.governedSourceEvidence.map((source: any) => source.sourceType)).toEqual(beijingOverride.governedSourceTypes)
    expect(beijingOverride.governedSourceEvidence.every((source: any) => source.sourceUrl?.startsWith('https://'))).toBe(true)
  })

  it('keeps Guangzhou as a published city override with governed source evidence', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const cityOverrides = (generalTemplate as any).cityOverrides ?? []
    const guangzhouOverride = cityOverrides.find((override: any) => override.overrideCode === 'city_override_guangdong_guangzhou_v14222')

    expect(guangzhouOverride).toMatchObject({
      cityCode: 'guangzhou',
      cityName: '广州市',
      provinceCode: 'guangdong',
      overrideScope: 'city',
      reviewStatus: 'published',
      policyLevel: 'city',
      curationMethod: 'governed_seed',
    })
    expect(guangzhouOverride.aliases).toEqual(expect.arrayContaining(['guangzhou', '广州', '广州市']))
    expect(guangzhouOverride.notes.join(' ')).toContain('项目命中该城市时直接叠加城市资料包')
    expect(guangzhouOverride.notes.join(' ')).not.toContain('not applied by business preview')
    expect(guangzhouOverride.materialPackageOverrides.map((item: any) => item.materialPackageCode)).toEqual(
      expect.arrayContaining([
        'PKG-CERT-LAND-COMMON',
        'PKG-CERT-LUP-COMMON',
        'PKG-CERT-EPP-COMMON',
        'PKG-CERT-CP-COMMON',
      ]),
    )
    for (const packageOverride of guangzhouOverride.materialPackageOverrides) {
      expect(packageOverride.addMaterialNames.length, packageOverride.materialPackageCode).toBeGreaterThanOrEqual(2)
    }
    expect(
      guangzhouOverride.materialOverrides.find((override: any) => override.landAcquisitionMethodCode === 'transfer')?.addMaterialNames,
    ).toEqual(expect.arrayContaining(['广州市出让取得土地权属链补充材料']))
    expect(guangzhouOverride.governedSourceTypes).toEqual([
      'engineering_approval_portal',
      'planning_natural_resources',
      'housing_construction_permit',
      'land_supply_or_transaction',
    ])
    expect(guangzhouOverride.governedSourceEvidence.map((source: any) => source.sourceType)).toEqual(guangzhouOverride.governedSourceTypes)
    expect(guangzhouOverride.governedSourceEvidence.every((source: any) => source.sourceUrl?.startsWith('https://'))).toBe(true)
  })

  it('keeps Nanjing as a published city override with governed source evidence', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const cityOverrides = (generalTemplate as any).cityOverrides ?? []
    const nanjingOverride = cityOverrides.find((override: any) => override.overrideCode === 'city_override_jiangsu_nanjing_v14222')

    expect(nanjingOverride).toMatchObject({
      cityCode: 'nanjing',
      cityName: '南京市',
      provinceCode: 'jiangsu',
      overrideScope: 'city',
      reviewStatus: 'published',
      policyLevel: 'city',
      curationMethod: 'governed_seed',
    })
    expect(nanjingOverride.aliases).toEqual(expect.arrayContaining(['nanjing', '南京', '南京市']))
    expect(nanjingOverride.notes.join(' ')).toContain('项目命中该城市时直接叠加城市资料包')
    expect(nanjingOverride.notes.join(' ')).not.toContain('not applied by business preview')
    expect(nanjingOverride.materialPackageOverrides.map((item: any) => item.materialPackageCode)).toEqual(
      expect.arrayContaining([
        'PKG-CERT-LAND-COMMON',
        'PKG-CERT-LUP-COMMON',
        'PKG-CERT-EPP-COMMON',
        'PKG-CERT-CP-COMMON',
      ]),
    )
    for (const packageOverride of nanjingOverride.materialPackageOverrides) {
      expect(packageOverride.addMaterialNames.length, packageOverride.materialPackageCode).toBeGreaterThanOrEqual(2)
    }
    expect(
      nanjingOverride.materialOverrides.find((override: any) => override.landAcquisitionMethodCode === 'transfer')?.addMaterialNames,
    ).toEqual(expect.arrayContaining(['南京市出让取得土地权属链补充材料']))
    expect(nanjingOverride.governedSourceTypes).toEqual([
      'engineering_approval_portal',
      'planning_natural_resources',
      'housing_construction_permit',
      'land_supply_or_transaction',
    ])
    expect(nanjingOverride.governedSourceEvidence.map((source: any) => source.sourceType)).toEqual(nanjingOverride.governedSourceTypes)
    expect(nanjingOverride.governedSourceEvidence.every((source: any) => source.sourceUrl?.startsWith('https://'))).toBe(true)
  })

  it('keeps Chengdu Wuhan and Xian as published city overrides with governed source evidence', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const cityOverrides = (generalTemplate as any).cityOverrides ?? []
    const expectedOverrides = [
      {
        overrideCode: 'city_override_sichuan_chengdu_v14222',
        cityCode: 'chengdu',
        cityName: '成都市',
        provinceCode: 'sichuan',
        aliases: ['chengdu', '成都', '成都市'],
        transferMaterial: '成都市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_hubei_wuhan_v14222',
        cityCode: 'wuhan',
        cityName: '武汉市',
        provinceCode: 'hubei',
        aliases: ['wuhan', '武汉', '武汉市'],
        transferMaterial: '武汉市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_shaanxi_xian_v14222',
        cityCode: 'xian',
        cityName: '西安市',
        provinceCode: 'shaanxi',
        aliases: ['Xian', 'Xi’an', '西安', '西安市'],
        transferMaterial: '西安市出让取得土地权属链补充材料',
      },
    ]

    for (const expectedOverride of expectedOverrides) {
      const override = cityOverrides.find((item: any) => item.overrideCode === expectedOverride.overrideCode)
      expect(override).toMatchObject({
        cityCode: expectedOverride.cityCode,
        cityName: expectedOverride.cityName,
        provinceCode: expectedOverride.provinceCode,
        overrideScope: 'city',
        reviewStatus: 'published',
        policyLevel: 'city',
        curationMethod: 'governed_seed',
      })
      expect(override.aliases).toEqual(expect.arrayContaining(expectedOverride.aliases))
      expect(override.notes.join(' '), expectedOverride.overrideCode).toContain('项目命中该城市时直接叠加城市资料包')
      expect(override.notes.join(' '), expectedOverride.overrideCode).not.toContain('not applied by business preview')
      expect(override.materialPackageOverrides.map((item: any) => item.materialPackageCode), expectedOverride.overrideCode).toEqual(
        expect.arrayContaining([
          'PKG-CERT-LAND-COMMON',
          'PKG-CERT-LUP-COMMON',
          'PKG-CERT-EPP-COMMON',
          'PKG-CERT-CP-COMMON',
        ]),
      )
      for (const packageOverride of override.materialPackageOverrides) {
        expect(packageOverride.addMaterialNames.length, `${expectedOverride.overrideCode}:${packageOverride.materialPackageCode}`).toBeGreaterThanOrEqual(2)
      }
      expect(
        override.materialOverrides.find((item: any) => item.landAcquisitionMethodCode === 'transfer')?.addMaterialNames,
      ).toEqual(expect.arrayContaining([expectedOverride.transferMaterial]))
      expect(override.governedSourceTypes).toEqual([
        'engineering_approval_portal',
        'planning_natural_resources',
        'housing_construction_permit',
        'land_supply_or_transaction',
      ])
      expect(override.governedSourceEvidence.map((source: any) => source.sourceType)).toEqual(override.governedSourceTypes)
      expect(override.governedSourceEvidence.every((source: any) => source.sourceUrl?.startsWith('https://'))).toBe(true)
    }
  })

  it('publishes the direct city expansion batch as preview-consumed local templates', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const cityOverrides = (generalTemplate as any).cityOverrides ?? []
    const expectedOverrides = [
      {
        overrideCode: 'city_override_tianjin_tianjin_v14222',
        cityCode: 'tianjin',
        cityName: '天津市',
        provinceCode: 'tianjin',
        transferMaterial: '天津市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_chongqing_chongqing_v14222',
        cityCode: 'chongqing',
        cityName: '重庆市',
        provinceCode: 'chongqing',
        transferMaterial: '重庆市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_shandong_qingdao_v14222',
        cityCode: 'qingdao',
        cityName: '青岛市',
        provinceCode: 'shandong',
        transferMaterial: '青岛市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_zhejiang_ningbo_v14222',
        cityCode: 'ningbo',
        cityName: '宁波市',
        provinceCode: 'zhejiang',
        transferMaterial: '宁波市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_fujian_xiamen_v14222',
        cityCode: 'xiamen',
        cityName: '厦门市',
        provinceCode: 'fujian',
        transferMaterial: '厦门市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_anhui_hefei_v14222',
        cityCode: 'hefei',
        cityName: '合肥市',
        provinceCode: 'anhui',
        transferMaterial: '合肥市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_jiangsu_wuxi_v14222',
        cityCode: 'wuxi',
        cityName: '无锡市',
        provinceCode: 'jiangsu',
        transferMaterial: '无锡市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_guangdong_foshan_v14222',
        cityCode: 'foshan',
        cityName: '佛山市',
        provinceCode: 'guangdong',
        transferMaterial: '佛山市出让取得土地权属链补充材料',
      },
    ]

    for (const expectedOverride of expectedOverrides) {
      const override = cityOverrides.find((item: any) => item.overrideCode === expectedOverride.overrideCode)
      expect(override).toMatchObject({
        cityCode: expectedOverride.cityCode,
        cityName: expectedOverride.cityName,
        provinceCode: expectedOverride.provinceCode,
        overrideScope: 'city',
        reviewStatus: 'published',
        policyLevel: 'city',
        curationMethod: 'governed_seed',
      })
      expect(override.notes.join(' '), expectedOverride.overrideCode).toContain('项目命中该城市时直接叠加城市资料包')
      expect(override.materialPackageOverrides.map((item: any) => item.materialPackageCode), expectedOverride.overrideCode).toEqual(
        expect.arrayContaining([
          'PKG-CERT-LAND-COMMON',
          'PKG-CERT-LUP-COMMON',
          'PKG-CERT-EPP-COMMON',
          'PKG-CERT-CP-COMMON',
        ]),
      )
      for (const packageOverride of override.materialPackageOverrides) {
        expect(packageOverride.addMaterialNames.length, `${expectedOverride.overrideCode}:${packageOverride.materialPackageCode}`).toBeGreaterThanOrEqual(2)
      }
      expect(
        override.materialOverrides.find((item: any) => item.landAcquisitionMethodCode === 'transfer')?.addMaterialNames,
      ).toEqual(expect.arrayContaining([expectedOverride.transferMaterial]))
      expect(override.governedSourceEvidence.map((source: any) => source.sourceType)).toEqual([
        'engineering_approval_portal',
        'planning_natural_resources',
        'housing_construction_permit',
        'land_supply_or_transaction',
      ])
      expect(override.governedSourceEvidence.every((source: any) => source.sourceUrl?.startsWith('https://'))).toBe(true)
    }
  })

  it('publishes the second direct key city expansion batch as preview-consumed city templates', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const cityOverrides = (generalTemplate as any).cityOverrides ?? []
    const expectedOverrides = [
      {
        overrideCode: 'city_override_henan_zhengzhou_v14222',
        cityCode: 'zhengzhou',
        cityName: '郑州市',
        provinceCode: 'henan',
        transferMaterial: '郑州市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_hunan_changsha_v14222',
        cityCode: 'changsha',
        cityName: '长沙市',
        provinceCode: 'hunan',
        transferMaterial: '长沙市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_shandong_jinan_v14222',
        cityCode: 'jinan',
        cityName: '济南市',
        provinceCode: 'shandong',
        transferMaterial: '济南市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_fujian_fuzhou_v14222',
        cityCode: 'fuzhou',
        cityName: '福州市',
        provinceCode: 'fujian',
        transferMaterial: '福州市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_liaoning_shenyang_v14222',
        cityCode: 'shenyang',
        cityName: '沈阳市',
        provinceCode: 'liaoning',
        transferMaterial: '沈阳市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_liaoning_dalian_v14222',
        cityCode: 'dalian',
        cityName: '大连市',
        provinceCode: 'liaoning',
        transferMaterial: '大连市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_yunnan_kunming_v14222',
        cityCode: 'kunming',
        cityName: '昆明市',
        provinceCode: 'yunnan',
        transferMaterial: '昆明市出让取得土地权属链补充材料',
      },
      {
        overrideCode: 'city_override_jiangxi_nanchang_v14222',
        cityCode: 'nanchang',
        cityName: '南昌市',
        provinceCode: 'jiangxi',
        transferMaterial: '南昌市出让取得土地权属链补充材料',
      },
    ]

    for (const expectedOverride of expectedOverrides) {
      const override = cityOverrides.find((item: any) => item.overrideCode === expectedOverride.overrideCode)
      expect(override).toMatchObject({
        cityCode: expectedOverride.cityCode,
        cityName: expectedOverride.cityName,
        provinceCode: expectedOverride.provinceCode,
        overrideScope: 'city',
        reviewStatus: 'published',
        policyLevel: 'city',
        curationMethod: 'governed_seed',
      })
      expect(override).not.toHaveProperty('zoneCode')
      expect(override).not.toHaveProperty('zoneName')
      expect(override.materialPackageOverrides.map((item: any) => item.materialPackageCode), expectedOverride.overrideCode).toEqual(
        expect.arrayContaining([
          'PKG-CERT-LAND-COMMON',
          'PKG-CERT-LUP-COMMON',
          'PKG-CERT-EPP-COMMON',
          'PKG-CERT-CP-COMMON',
        ]),
      )
      expect(
        override.materialOverrides.find((item: any) => item.landAcquisitionMethodCode === 'transfer')?.addMaterialNames,
      ).toEqual(expect.arrayContaining([expectedOverride.transferMaterial]))
      expect(override.governedSourceEvidence.map((source: any) => source.sourceType)).toEqual([
        'engineering_approval_portal',
        'planning_natural_resources',
        'housing_construction_permit',
        'land_supply_or_transaction',
      ])
      expect(override.governedSourceEvidence.every((source: any) => source.sourceUrl?.startsWith('https://'))).toBe(true)
    }
  })

  it('publishes exactly 50 key city overrides with material authority reuse and city-difference depth', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const publishedCityOverrides = ((generalTemplate as any).cityOverrides ?? [])
      .filter((override: any) => override.reviewStatus === 'published')
    const cityCodes = publishedCityOverrides.map((override: any) => override.cityCode)

    expect(publishedCityOverrides).toHaveLength(50)
    expect(new Set(cityCodes).size).toBe(50)
    expect(cityCodes).toEqual(
      expect.arrayContaining([
        'shenzhen',
        'suzhou',
        'beijing',
        'shanghai',
        'hangzhou',
        'guangzhou',
        'nanjing',
        'chengdu',
        'wuhan',
        'xian',
        'tianjin',
        'chongqing',
        'qingdao',
        'ningbo',
        'xiamen',
        'hefei',
        'wuxi',
        'foshan',
        'zhengzhou',
        'changsha',
        'jinan',
        'fuzhou',
        'shenyang',
        'dalian',
        'kunming',
        'nanchang',
        'shijiazhuang',
        'taiyuan',
        'hohhot',
        'changchun',
        'harbin',
        'changzhou',
        'wenzhou',
        'dongguan',
        'zhuhai',
        'nanning',
        'haikou',
        'guiyang',
        'lanzhou',
        'urumqi',
        'nantong',
        'jiaxing',
        'yantai',
        'weifang',
        'luoyang',
        'xiangyang',
        'zhuzhou',
        'mianyang',
        'yibin',
        'quanzhou',
      ]),
    )

    const expectedPackageCodes = [
      'PKG-CERT-LAND-COMMON',
      'PKG-CERT-LUP-COMMON',
      'PKG-CERT-EPP-COMMON',
      'PKG-CERT-CP-COMMON',
    ]
    const expectedSourceTypes = [
      'engineering_approval_portal',
      'planning_natural_resources',
      'housing_construction_permit',
      'land_supply_or_transaction',
    ]
    const expectedAuthorityKeys = [
      'land',
      'landUsePlanning',
      'engineeringPlanning',
      'constructionPermit',
    ]
    const expectedReuseKeys = [
      'landToLandUsePlanning',
      'landUsePlanningToEngineeringPlanning',
      'engineeringPlanningToConstructionPermit',
      'drawingReviewToConstructionPermit',
    ]

    for (const override of publishedCityOverrides) {
      expect(override.overrideScope, override.overrideCode).toBe('city')
      expect(override.policyLevel, override.overrideCode).toBe('city')
      expect(override.curationMethod, override.overrideCode).toBe('governed_seed')
      expect(override, override.overrideCode).not.toHaveProperty('zoneCode')
      expect(override, override.overrideCode).not.toHaveProperty('zoneName')
      expect(override.overrideCode, override.overrideCode).not.toMatch(/park_override|district_override/)

      expect(override.materialPackageOverrides.map((item: any) => item.materialPackageCode), override.overrideCode).toEqual(
        expect.arrayContaining(expectedPackageCodes),
      )
      for (const packageCode of expectedPackageCodes) {
        const packageOverride = override.materialPackageOverrides.find(
          (item: any) => item.materialPackageCode === packageCode,
        )
        expect(packageOverride?.addMaterialNames.length, `${override.overrideCode}:${packageCode}`).toBeGreaterThanOrEqual(2)
      }

      const transferOverride = override.materialOverrides.find(
        (item: any) => item.landAcquisitionMethodCode === 'transfer',
      )
      expect(transferOverride?.addMaterialNames.length, override.overrideCode).toBeGreaterThanOrEqual(2)
      expect(transferOverride?.addRecommendedFor.length, override.overrideCode).toBeGreaterThanOrEqual(1)

      expect(Object.keys(override.handlingAuthorityOverrides ?? {}), override.overrideCode).toEqual(
        expect.arrayContaining(expectedAuthorityKeys),
      )
      for (const key of expectedAuthorityKeys) {
        expect(override.handlingAuthorityOverrides?.[key]?.length, `${override.overrideCode}:${key}`).toBeGreaterThan(0)
      }

      expect(Object.keys(override.reusableOutputOverrides ?? {}), override.overrideCode).toEqual(
        expect.arrayContaining(expectedReuseKeys),
      )
      for (const key of expectedReuseKeys) {
        expect(override.reusableOutputOverrides?.[key]?.length, `${override.overrideCode}:${key}`).toBeGreaterThanOrEqual(2)
      }

      expect(override.governedSourceTypes, override.overrideCode).toEqual(expectedSourceTypes)
      expect(override.governedSourceEvidence.map((source: any) => source.sourceType), override.overrideCode).toEqual(
        expectedSourceTypes,
      )
      expect(
        override.governedSourceEvidence.every((source: any) => source.sourceUrl?.startsWith('https://')),
        override.overrideCode,
      ).toBe(true)
    }
  })

  it('does not make optional or conditional items the only hard predecessor of a dependency', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const workItemsByCode = new Map(generalTemplate.workItems.map((item) => [item.workItemCode, item]))
    const unsafeHardDependencies = generalTemplate.dependencies.filter((dependency) => {
      if (dependency.dependencyKind !== 'hard') return false
      if (dependency.predecessor.type !== 'work_item') return false
      const predecessor = workItemsByCode.get(dependency.predecessor.workItemCode)
      return predecessor?.requiredPolicy !== 'required'
    })

    expect(unsafeHardDependencies).toEqual([])
  })

  it('gates non-default regional and project-feature packs behind explicit conditions or province profiles', () => {
    const generalTemplate = SYSTEM_CERTIFICATE_TEMPLATE_SEEDS.find(
      (seed) => seed.templateCode === GENERAL_CERTIFICATE_TEMPLATE_CODE,
    )
    expect(generalTemplate).toBeDefined()
    if (!generalTemplate) return

    const gatedCodes = [
      'CERT-DOC-TRAFFIC-IMPACT',
      'CERT-EPP-TRAFFIC-REVIEW',
      'CERT-EPP-COMMITTEE',
      'CERT-EPP-PUBLIC-NOTICE',
      'CERT-EPP-BLUEPRINT-CHECK',
      'CERT-CP-FIRE-REVIEW',
      'CERT-CP-HFD-CERT',
      'CERT-CP-TEMP-PERMIT',
      'CERT-DOC-CITY-FEE',
    ]
    const workItemsByCode = new Map(generalTemplate.workItems.map((item) => [item.workItemCode, item]))

    for (const code of gatedCodes) {
      const item = workItemsByCode.get(code)
      expect(item, code).toBeDefined()
      expect(
        Boolean(item?.appliesWhen?.length) || Boolean(item?.provinceProfileCodes?.length),
        code,
      ).toBe(true)
      expect(item?.requiredPolicy).not.toBe('required')
    }
  })
})
