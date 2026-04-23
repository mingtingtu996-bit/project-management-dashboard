/**
 * WBSTemplates 共享类型定义
 */

export type TemplateStatus = 'draft' | 'published' | 'disabled'

export interface WbsNode {
  id?: string
  name?: string
  reference_days?: number
  is_milestone?: boolean
  description?: string
  children?: WbsNode[]
  [key: string]: any
}

export interface WbsTemplate {
  id: string
  name: string
  description?: string
  category?: string
  template_type?: string
  tags?: string[]
  applicable_building_types?: string[]
  applicable_project_types?: string[]
  min_area?: number
  max_area?: number
  template_data: any
  /** 兼容旧版数据格式（template_data 之前叫 wbs_nodes） */
  wbs_nodes?: WbsNode[]
  usage_count: number
  rating?: number
  is_public: boolean
  is_builtin: boolean
  is_active: boolean
  is_default?: boolean
  created_by?: string
  created_at: string
  updated_at: string
  // 设计稿扩展字段（前端展示用）
  node_count?: number
  depth?: number
  reference_days?: number
  /** B3: 三态状态 draft=草稿/published=已发布/disabled=停用 */
  status?: TemplateStatus
  color?: string
}

export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: { code: string; message: string }
  timestamp: string
}

export interface WbsProject {
  id: string
  name: string
  status?: string
  health_status?: string
}

export interface PreviewNode {
  id: string
  name: string
  reference_days?: number
  is_milestone?: boolean
  description?: string
  children?: WbsNode[]
  level: number
  path: string
}
