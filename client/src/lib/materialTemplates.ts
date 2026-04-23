export type MaterialTemplateItem = {
  name: string
  requiresSampleConfirmation?: boolean
  requiresInspection?: boolean
}

export type MaterialTemplateGroup = {
  specialtyType: string
  label: string
  items: MaterialTemplateItem[]
}

export const MATERIAL_TEMPLATE_GROUPS: MaterialTemplateGroup[] = [
  {
    specialtyType: '幕墙',
    label: '幕墙',
    items: [
      { name: '铝型材', requiresSampleConfirmation: true },
      { name: 'Low-E 玻璃', requiresSampleConfirmation: true, requiresInspection: true },
      { name: '结构胶', requiresSampleConfirmation: true },
      { name: '开启扇五金', requiresInspection: true },
    ],
  },
  {
    specialtyType: '机电',
    label: '机电',
    items: [
      { name: '桥架', requiresInspection: true },
      { name: '电缆', requiresInspection: true },
      { name: '风管', requiresInspection: true },
      { name: '阀门', requiresInspection: true },
    ],
  },
  {
    specialtyType: '消防',
    label: '消防',
    items: [
      { name: '消防泵', requiresInspection: true },
      { name: '喷淋头', requiresInspection: true },
      { name: '报警主机', requiresSampleConfirmation: true, requiresInspection: true },
      { name: '消火栓箱', requiresInspection: true },
    ],
  },
  {
    specialtyType: '装饰装修',
    label: '装饰装修',
    items: [
      { name: '石材', requiresSampleConfirmation: true },
      { name: '铝板', requiresSampleConfirmation: true },
      { name: '木饰面', requiresSampleConfirmation: true },
      { name: '乳胶漆', requiresInspection: true },
    ],
  },
  {
    specialtyType: '电梯',
    label: '电梯',
    items: [
      { name: '导轨', requiresInspection: true },
      { name: '轿厢', requiresSampleConfirmation: true, requiresInspection: true },
      { name: '控制柜', requiresInspection: true },
      { name: '门机系统', requiresInspection: true },
    ],
  },
  {
    specialtyType: '给排水',
    label: '给排水',
    items: [
      { name: '给水管', requiresInspection: true },
      { name: '排水管', requiresInspection: true },
      { name: '水泵', requiresInspection: true },
      { name: '水箱', requiresSampleConfirmation: true, requiresInspection: true },
    ],
  },
]
