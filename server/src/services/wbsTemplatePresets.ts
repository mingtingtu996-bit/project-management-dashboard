export type WbsTemplateType = '住宅' | '商业' | '工业' | '公共建筑'

export type WbsTemplateNode = {
  id?: string
  name: string
  description?: string
  reference_days: number
  is_milestone?: boolean
  children?: WbsTemplateNode[]
}

type BareWbsTemplateNode = Omit<WbsTemplateNode, 'id' | 'children'> & {
  children?: BareWbsTemplateNode[]
}

export type BuiltInWbsTemplatePreset = {
  templateName: string
  templateType: WbsTemplateType
  description: string
  nodes: WbsTemplateNode[]
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function assignNodeIds(nodes: BareWbsTemplateNode[], prefix: string): WbsTemplateNode[] {
  return nodes.map((node, index) => {
    const id = `${prefix}${index + 1}`
    return {
      ...node,
      id,
      children: Array.isArray(node.children) ? assignNodeIds(node.children, `${id}-`) : [],
    }
  })
}

function scaleNodes(nodes: BareWbsTemplateNode[], factor: number): BareWbsTemplateNode[] {
  return nodes.map((node) => ({
    ...node,
    reference_days: Math.max(3, Math.round(node.reference_days * factor)),
    children: Array.isArray(node.children) ? scaleNodes(node.children, factor) : [],
  }))
}

function sumLeafReferenceDays(nodes: BareWbsTemplateNode[]): number {
  return nodes.reduce((total, node) => {
    if (Array.isArray(node.children) && node.children.length > 0) {
      return total + sumLeafReferenceDays(node.children)
    }

    return total + node.reference_days
  }, 0)
}

function rebalanceNodesToLeafTarget(nodes: BareWbsTemplateNode[], targetLeafDays: number): BareWbsTemplateNode[] {
  const currentLeafDays = sumLeafReferenceDays(nodes)
  if (currentLeafDays <= 0) {
    return nodes
  }

  return scaleNodes(nodes, targetLeafDays / currentLeafDays)
}

function cloneNodes(nodes: WbsTemplateNode[]): WbsTemplateNode[] {
  return nodes.map((node) => ({
    ...node,
    children: Array.isArray(node.children) ? cloneNodes(node.children) : [],
  }))
}

function buildScaleFactor(months: number | null, baselineMonths: number, extraFactor = 1) {
  if (!months || Number.isNaN(months)) {
    return clamp(extraFactor, 0.82, 1.22)
  }

  const monthFactor = months / baselineMonths
  return clamp(monthFactor * 0.75 + extraFactor * 0.25, 0.82, 1.22)
}

const residentialRawNodes: BareWbsTemplateNode[] = [
  {
    name: '场地准备与测量',
    reference_days: 22,
    children: [
      { name: '三通一平与场地移交', reference_days: 7 },
      { name: '围挡临建与临水临电', reference_days: 9 },
      { name: '控制网复核与轴线放样', reference_days: 6 },
    ],
  },
  {
    name: '基坑支护与土方',
    reference_days: 48,
    children: [
      { name: '围护桩/支护体系施工', reference_days: 14 },
      { name: '降水井及基坑监测', reference_days: 11 },
      { name: '土方开挖与外运', reference_days: 15 },
      { name: '垫层与防水基层', reference_days: 8 },
    ],
  },
  {
    name: '地基基础及地下室结构',
    reference_days: 82,
    is_milestone: true,
    children: [
      { name: '工程桩与地基处理', reference_days: 20 },
      { name: '承台/筏板及基础梁', reference_days: 22 },
      { name: '地下室底板与外墙结构', reference_days: 24 },
      { name: '地下室顶板、防水与回填', reference_days: 16 },
    ],
  },
  {
    name: '主体结构',
    reference_days: 178,
    is_milestone: true,
    children: [
      { name: '塔楼标准层结构循环', reference_days: 128 },
      { name: '屋面层及机房层结构', reference_days: 18 },
      { name: '楼梯、构造柱与零星现浇', reference_days: 14 },
      { name: '主体结构实测实量与修补', reference_days: 18 },
    ],
  },
  {
    name: '二次结构与屋面工程',
    reference_days: 74,
    children: [
      { name: '砌体及二次结构', reference_days: 26 },
      { name: '抹灰基层与门洞收口', reference_days: 20 },
      { name: '屋面找坡、保温与防水', reference_days: 16 },
      { name: '烟风道、栏杆预埋与构件安装', reference_days: 12 },
    ],
  },
  {
    name: '机电安装',
    reference_days: 126,
    children: [
      { name: '给排水及消防立管', reference_days: 26 },
      { name: '桥架配管与配线', reference_days: 31 },
      { name: '通风防排烟与暖通末端', reference_days: 24 },
      { name: '电梯设备安装', reference_days: 16 },
      { name: '机房设备、户内末端与调试准备', reference_days: 29 },
    ],
  },
  {
    name: '外立面及门窗',
    reference_days: 78,
    children: [
      { name: '外墙基层与保温系统', reference_days: 18 },
      { name: '铝合金门窗及栏杆安装', reference_days: 24 },
      { name: '外墙涂料/真石漆与线条收口', reference_days: 20 },
      { name: '屋面泛水、百叶与外立面收边', reference_days: 16 },
    ],
  },
  {
    name: '公区与户内交付面',
    reference_days: 96,
    children: [
      { name: '公共区域精装', reference_days: 28 },
      { name: '户内地面墙顶与固定家具基层', reference_days: 34 },
      { name: '洁具五金、灯具面板与户内门安装', reference_days: 18 },
      { name: '分户验收、整改与成品保护', reference_days: 16 },
    ],
  },
  {
    name: '室外综合配套',
    reference_days: 64,
    children: [
      { name: '室外雨污、给水与电力管网', reference_days: 24 },
      { name: '道路硬景、消防登高面与停车位', reference_days: 18 },
      { name: '景观绿化与海绵设施', reference_days: 14 },
      { name: '围墙大门、照明与标识', reference_days: 8 },
    ],
  },
  {
    name: '专项验收与交付',
    reference_days: 42,
    is_milestone: true,
    children: [
      { name: '机电单体调试与联调联试', reference_days: 12 },
      { name: '消防、电梯、人防、节能专项验收', reference_days: 16 },
      { name: '竣工验收与备案', reference_days: 9 },
      { name: '资料移交与交付准备', reference_days: 5 },
    ],
  },
]

const commercialRawNodes: BareWbsTemplateNode[] = [
  {
    name: '场地准备与基坑工程',
    reference_days: 52,
    children: [
      { name: '围挡临建与场地平整', reference_days: 11 },
      { name: '支护、降水与监测', reference_days: 16 },
      { name: '土方开挖与外运', reference_days: 15 },
      { name: '垫层及基础防水基层', reference_days: 10 },
    ],
  },
  {
    name: '基础与地下室结构',
    reference_days: 96,
    is_milestone: true,
    children: [
      { name: '桩基及承台/筏板', reference_days: 28 },
      { name: '地下室结构', reference_days: 34 },
      { name: '机房、设备基础与后浇带', reference_days: 16 },
      { name: '外墙防水、肥槽回填与顶板覆土', reference_days: 18 },
    ],
  },
  {
    name: '地上主体结构',
    reference_days: 208,
    is_milestone: true,
    children: [
      { name: '塔楼核心筒/框架结构', reference_days: 112 },
      { name: '裙房及大空间结构', reference_days: 46 },
      { name: '机房屋面及钢结构雨棚', reference_days: 20 },
      { name: '二次结构与楼梯间穿插', reference_days: 30 },
    ],
  },
  {
    name: '外立面与屋面',
    reference_days: 134,
    children: [
      { name: '幕墙埋件与龙骨', reference_days: 28 },
      { name: '玻璃/铝板/石材幕墙安装', reference_days: 48 },
      { name: '外立面收口与泛光预留', reference_days: 24 },
      { name: '屋面保温、防水及机房外装', reference_days: 34 },
    ],
  },
  {
    name: '机电安装',
    reference_days: 172,
    children: [
      { name: '机电深化与综合管线排布', reference_days: 16 },
      { name: '给排水及消防系统', reference_days: 36 },
      { name: '供配电及照明', reference_days: 42 },
      { name: '暖通空调与防排烟', reference_days: 46 },
      { name: '弱电智能化、BA 与安防', reference_days: 18 },
      { name: '电梯扶梯安装', reference_days: 14 },
    ],
  },
  {
    name: '公区精装与机房末端',
    reference_days: 124,
    children: [
      { name: '大堂与标准层公区精装', reference_days: 38 },
      { name: '商业公区地面、吊顶与卫生间', reference_days: 34 },
      { name: '机房装修、末端设备与标识', reference_days: 24 },
      { name: '收边收口、样板层与成品保护', reference_days: 28 },
    ],
  },
  {
    name: '室外工程与市政接驳',
    reference_days: 72,
    children: [
      { name: '室外综合管网接驳', reference_days: 26 },
      { name: '道路广场、卸货区与车行流线', reference_days: 20 },
      { name: '景观照明、导视与硬景', reference_days: 16 },
      { name: '海绵设施与室外收边', reference_days: 10 },
    ],
  },
  {
    name: '调试验收与移交',
    reference_days: 56,
    is_milestone: true,
    children: [
      { name: '机电系统单机调试', reference_days: 14 },
      { name: '联调联试与综合调试', reference_days: 16 },
      { name: '消防、电梯、防雷、节能专项验收', reference_days: 16 },
      { name: '竣工验收、备案与工程移交', reference_days: 10 },
    ],
  },
]

const industrialRawNodes: BareWbsTemplateNode[] = [
  {
    name: '场地准备与测量',
    reference_days: 22,
    children: [
      { name: '场平碾压与临时道路', reference_days: 8 },
      { name: '临建、临水临电与排水组织', reference_days: 8 },
      { name: '控制网复核与轴线放样', reference_days: 6 },
    ],
  },
  {
    name: '地基与基础',
    reference_days: 64,
    is_milestone: true,
    children: [
      { name: '地基处理与换填', reference_days: 16 },
      { name: '独立基础及设备基础', reference_days: 22 },
      { name: '地梁、短柱与预埋件', reference_days: 14 },
      { name: '基础回填及地坪基层', reference_days: 12 },
    ],
  },
  {
    name: '钢结构主体与围护',
    reference_days: 118,
    is_milestone: true,
    children: [
      { name: '钢构件深化设计与加工', reference_days: 26 },
      { name: '钢柱钢梁与支撑系统安装', reference_days: 34 },
      { name: '檩条、系杆与稳定体系', reference_days: 18 },
      { name: '屋面板、墙面板与保温围护', reference_days: 24 },
      { name: '门窗、采光带、天沟与落水', reference_days: 16 },
    ],
  },
  {
    name: '室内地坪与装卸配套',
    reference_days: 48,
    children: [
      { name: '地坪钢筋及混凝土', reference_days: 16 },
      { name: '耐磨/环氧地坪', reference_days: 12 },
      { name: '月台、雨棚与装卸口', reference_days: 12 },
      { name: '散水坡道与门口收边', reference_days: 8 },
    ],
  },
  {
    name: '机电与工艺配套',
    reference_days: 98,
    children: [
      { name: '给排水及消防管网', reference_days: 24 },
      { name: '供配电、动力照明与接地', reference_days: 28 },
      { name: '通风空调与防排烟', reference_days: 18 },
      { name: '压缩空气/工艺公用工程预留', reference_days: 14 },
      { name: '消防报警、安防与弱电', reference_days: 14 },
    ],
  },
  {
    name: '室外工程',
    reference_days: 42,
    children: [
      { name: '室外雨污、给水与电力接驳', reference_days: 16 },
      { name: '园区道路与场地硬化', reference_days: 12 },
      { name: '围墙、大门与门卫室', reference_days: 9 },
      { name: '绿化与室外收边', reference_days: 5 },
    ],
  },
  {
    name: '调试验收与移交',
    reference_days: 32,
    is_milestone: true,
    children: [
      { name: '消防联动与专项检测', reference_days: 10 },
      { name: '单机试运转与联动试车', reference_days: 10 },
      { name: '竣工验收与资料移交', reference_days: 12 },
    ],
  },
]

const publicBuildingRawNodes: BareWbsTemplateNode[] = [
  {
    name: '场地准备与测量',
    reference_days: 24,
    children: [
      { name: '场地平整与临设布置', reference_days: 8 },
      { name: '临水临电、围挡与交通导改', reference_days: 8 },
      { name: '测量控制网与轴线复核', reference_days: 8 },
    ],
  },
  {
    name: '基础与地下结构',
    reference_days: 88,
    is_milestone: true,
    children: [
      { name: '基坑支护、降水与监测', reference_days: 20 },
      { name: '土方开挖与垫层', reference_days: 16 },
      { name: '桩基/筏板及承台基础', reference_days: 24 },
      { name: '地下结构、防水与回填', reference_days: 28 },
    ],
  },
  {
    name: '主体结构',
    reference_days: 186,
    is_milestone: true,
    children: [
      { name: '主体框架/框剪结构施工', reference_days: 124 },
      { name: '大空间及屋面结构', reference_days: 26 },
      { name: '楼梯、二次构件与结构修补', reference_days: 18 },
      { name: '结构实测实量与中间验收', reference_days: 18 },
    ],
  },
  {
    name: '围护、屋面与门窗',
    reference_days: 86,
    children: [
      { name: '砌体及外围护墙体', reference_days: 24 },
      { name: '屋面找坡、保温与防水', reference_days: 18 },
      { name: '幕墙/外墙装饰及线条收口', reference_days: 22 },
      { name: '门窗、栏杆与采光顶', reference_days: 22 },
    ],
  },
  {
    name: '机电安装',
    reference_days: 144,
    children: [
      { name: '给排水及消防系统', reference_days: 30 },
      { name: '供配电、照明与防雷接地', reference_days: 32 },
      { name: '暖通空调与防排烟', reference_days: 34 },
      { name: '弱电智能化与安防广播', reference_days: 24 },
      { name: '电梯及设备机房安装', reference_days: 24 },
    ],
  },
  {
    name: '专项系统与功能用房',
    reference_days: 102,
    children: [
      { name: '净化/医气/厨房等专项预留安装', reference_days: 28 },
      { name: '实验室/诊室/教室等功能房配套', reference_days: 34 },
      { name: '固定家具、洁具及末端设备安装', reference_days: 20 },
      { name: '专项系统调试准备与成品保护', reference_days: 20 },
    ],
  },
  {
    name: '室内装修与室外配套',
    reference_days: 112,
    children: [
      { name: '公共区域精装及吊顶墙地面', reference_days: 34 },
      { name: '功能用房精装与收边收口', reference_days: 30 },
      { name: '室外综合管网与道路广场', reference_days: 28 },
      { name: '景观绿化、标识与附属设施', reference_days: 20 },
    ],
  },
  {
    name: '调试验收与移交',
    reference_days: 52,
    is_milestone: true,
    children: [
      { name: '机电单机调试与联调联试', reference_days: 14 },
      { name: '消防、电梯、节能等专项验收', reference_days: 16 },
      { name: '竣工验收、备案与使用移交', reference_days: 12 },
      { name: '资料归档、培训与保修移交', reference_days: 10 },
    ],
  },
]

// Default leaf-node durations are calibrated to practical baseline schedules
// for common China房建项目:
// - 18F住宅（地库+塔楼）: about 20 months
// - 商业办公综合体（塔楼+裙房）: about 26 months
// - 钢结构厂房/仓储: about 10 months
// - 学校/医院类公共建筑: about 23 months
const residentialBaseNodes = rebalanceNodesToLeafTarget(residentialRawNodes, 600)
const commercialBaseNodes = rebalanceNodesToLeafTarget(commercialRawNodes, 780)
const industrialBaseNodes = rebalanceNodesToLeafTarget(industrialRawNodes, 300)
const publicBuildingBaseNodes = rebalanceNodesToLeafTarget(publicBuildingRawNodes, 690)

function buildResidentialPreset(
  months: number | null,
  floors: number | null,
  structureTag: string | null,
  nameOverride?: string,
): BuiltInWbsTemplatePreset {
  const floorFactor = floors ? clamp(floors / 18, 0.85, 1.2) : 1
  const scaleFactor = buildScaleFactor(months, 20, floorFactor)
  const heightLabel = floors && floors <= 8 ? '多层住宅' : floors && floors >= 30 ? '超高层住宅' : '高层住宅'
  const structureLabel = structureTag ? `（${structureTag}）` : ''

  return {
    templateName: nameOverride ?? `${heightLabel}${structureLabel}WBS模板`,
    templateType: '住宅',
    description: '面向房地产住宅交付主链，覆盖场地、地下室、主体、机电、外立面、室外配套和专项验收，不含拿地、营销、招商等非工程节点。',
    nodes: assignNodeIds(scaleNodes(residentialBaseNodes, scaleFactor), 'R'),
  }
}

function buildCommercialPreset(months: number | null, structureTag: string | null, nameOverride?: string): BuiltInWbsTemplatePreset {
  const structureFactor = structureTag === '钢结构' ? 0.96 : 1
  const scaleFactor = buildScaleFactor(months, 26, structureFactor)
  const suffix = structureTag ? `（${structureTag}）` : ''

  return {
    templateName: nameOverride ?? `商业办公综合体${suffix}WBS模板`,
    templateType: '商业',
    description: '适用于商业办公综合体、写字楼与带裙房的房建项目，突出地库、主体、幕墙、机电、精装和联调验收，不包含招商、开业筹备等非工程工作。',
    nodes: assignNodeIds(scaleNodes(commercialBaseNodes, scaleFactor), 'C'),
  }
}

function buildIndustrialPreset(months: number | null, isSteel: boolean): BuiltInWbsTemplatePreset {
  const scaleFactor = buildScaleFactor(months, 10, isSteel ? 1 : 1.06)
  const name = isSteel ? '钢结构厂房/仓储WBS模板' : '工业厂房WBS模板'

  return {
    templateName: name,
    templateType: '工业',
    description: '适用于厂房、仓储和物流类房建项目，覆盖基础、钢结构、围护、地坪、机电与工艺公用工程、试运转和移交，不包含工艺审批等非工程节点。',
    nodes: assignNodeIds(scaleNodes(industrialBaseNodes, scaleFactor), 'I'),
  }
}

function buildPublicBuildingPreset(
  months: number | null,
  specialization: 'school' | 'hospital' | 'general' = 'general',
): BuiltInWbsTemplatePreset {
  const scaleFactor = buildScaleFactor(months, 23, specialization === 'hospital' ? 1.05 : 1)
  const nodes = scaleNodes(publicBuildingBaseNodes, scaleFactor)

  if (specialization === 'hospital') {
    const specialistNode = nodes.find((node) => node.name === '专项系统与功能用房')
    if (specialistNode?.children) {
      specialistNode.children = specialistNode.children.map((child) =>
        child.name === '净化/医气/厨房等专项预留安装'
          ? { ...child, name: '净化、医气与洁净区域专项安装' }
          : child,
      )
    }
  }

  if (specialization === 'school') {
    const specialistNode = nodes.find((node) => node.name === '专项系统与功能用房')
    if (specialistNode?.children) {
      specialistNode.children = specialistNode.children.map((child) =>
        child.name === '实验室/诊室/教室等功能房配套'
          ? { ...child, name: '教室、实验室及图书阅览空间配套' }
          : child,
      )
    }
  }

  const templateName = specialization === 'hospital'
    ? '医院公共建筑WBS模板'
    : specialization === 'school'
      ? '学校公共建筑WBS模板'
      : '公共建筑（学校/医院）WBS模板'

  return {
    templateName,
    templateType: '公共建筑',
    description: '适用于学校、医院及其他公共建筑项目，覆盖地下结构、主体、机电、专项系统、功能用房、室外配套和专项验收，不含运营管理等非工程节点。',
    nodes: assignNodeIds(nodes, 'P'),
  }
}

export function getBuiltInWbsTemplatePresets(): BuiltInWbsTemplatePreset[] {
  return [
    buildResidentialPreset(null, 18, '框剪', '高层住宅（地库+塔楼）WBS模板'),
    buildCommercialPreset(null, null, '商业办公综合体（塔楼+裙房）WBS模板'),
    buildIndustrialPreset(null, true),
    buildPublicBuildingPreset(null, 'general'),
  ].map((template) => ({
    ...template,
    nodes: cloneNodes(template.nodes),
  }))
}

export function buildSuggestedWbsTemplate(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase()
  const isCommercial = /商业|综合体|商场|购物|办公|写字楼|酒店/.test(normalizedPrompt)
  const isIndustrial = /工业|厂房|仓库|物流|车间|生产/.test(normalizedPrompt)
  const isPublicBuilding = /学校|教学楼|宿舍楼|实验楼|医院|门诊|病房|医技|图书馆|体育馆|公共建筑/.test(normalizedPrompt)
  const isSteel = /钢结构|steel/.test(normalizedPrompt)
  const isFrame = /框架|frame/.test(normalizedPrompt)
  const isShearWall = /框剪|剪力墙|shear/.test(normalizedPrompt)

  const floorsMatch = normalizedPrompt.match(/(\d+)\s*[层楼]/)
  const monthsMatch = normalizedPrompt.match(/(\d+)\s*个?月/)

  const floors = floorsMatch ? Number.parseInt(floorsMatch[1], 10) : null
  const months = monthsMatch ? Number.parseInt(monthsMatch[1], 10) : null
  const structureTag = isShearWall ? '框剪' : isFrame ? '框架' : null
  const publicSpecialization = /医院|门诊|病房|医技/.test(normalizedPrompt)
    ? 'hospital'
    : /学校|教学楼|宿舍楼|实验楼/.test(normalizedPrompt)
      ? 'school'
      : 'general'

  const preset = isCommercial
    ? buildCommercialPreset(months, isSteel ? '钢结构' : null)
    : isPublicBuilding
      ? buildPublicBuildingPreset(months, publicSpecialization)
      : isIndustrial
        ? buildIndustrialPreset(months, isSteel || /仓库|物流/.test(normalizedPrompt))
        : buildResidentialPreset(months, floors, structureTag)

  return {
    suggestedName: preset.templateName,
    suggestedType: preset.templateType,
    nodes: cloneNodes(preset.nodes),
  }
}
