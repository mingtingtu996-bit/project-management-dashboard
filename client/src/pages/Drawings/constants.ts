import type { DrawingTemplateOption, ReviewMode } from './types'

export const DRAWING_DISCIPLINE_OPTIONS = [
  '全部专业',
  '总图',
  '建筑',
  '结构',
  '给排水',
  '暖通',
  '电气',
  '智能化',
  '消防',
  '人防',
  '幕墙',
  '景观',
  '精装',
  '市政配套',
  '其他',
] as const

export const DRAWING_PURPOSE_OPTIONS = [
  '全部用途',
  '施工执行',
  '送审报批',
  '变更修订',
  '竣工归档',
] as const

export const DRAWING_REVIEW_MODE_LABELS: Record<ReviewMode, string> = {
  mandatory: '必审',
  optional: '可选',
  none: '不适用',
  manual_confirm: '人工确认',
}

export const DRAWING_STATUS_LABELS: Record<string, string> = {
  pending: '待启动',
  preparing: '编制中',
  reviewing: '送审中',
  revising: '修订中',
  issued: '已出图',
  completed: '已完成',
}

export const DRAWING_TEMPLATES: DrawingTemplateOption[] = [
  {
    templateCode: 'architecture-construction',
    templateName: '建筑施工图包',
    disciplineType: '建筑',
    documentPurpose: '施工执行',
    defaultReviewMode: 'none',
  },
  {
    templateCode: 'structure-construction',
    templateName: '结构施工图包',
    disciplineType: '结构',
    documentPurpose: '施工执行',
    defaultReviewMode: 'none',
  },
  {
    templateCode: 'water-construction',
    templateName: '给排水施工图包',
    disciplineType: '给排水',
    documentPurpose: '施工执行',
    defaultReviewMode: 'none',
  },
  {
    templateCode: 'hvac-construction',
    templateName: '暖通施工图包',
    disciplineType: '暖通',
    documentPurpose: '施工执行',
    defaultReviewMode: 'none',
  },
  {
    templateCode: 'electrical-construction',
    templateName: '电气施工图包',
    disciplineType: '电气',
    documentPurpose: '施工执行',
    defaultReviewMode: 'none',
  },
  {
    templateCode: 'fire-review',
    templateName: '消防专项包',
    disciplineType: '消防',
    documentPurpose: '送审报批',
    defaultReviewMode: 'mandatory',
  },
  {
    templateCode: 'civil-defense-review',
    templateName: '人防专项包',
    disciplineType: '人防',
    documentPurpose: '送审报批',
    defaultReviewMode: 'mandatory',
  },
  {
    templateCode: 'completion-archive',
    templateName: '竣工归档包',
    disciplineType: '竣工归档',
    documentPurpose: '竣工归档',
    defaultReviewMode: 'manual_confirm',
  },
]

