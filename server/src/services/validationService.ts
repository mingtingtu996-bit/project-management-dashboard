import type {
  AcceptanceRequirement,
  AcceptancePlan,
  PreMilestone,
  TaskCondition,
} from '../types/db.js'
import { CERTIFICATE_STAGE_VALUES, CERTIFICATE_STATUS_VALUES } from '../types/db.js'
import {
  ACCEPTANCE_STATUSES,
  ACCEPTANCE_STATUS_TRANSITIONS,
  acceptanceStatusLabel,
  parseAcceptanceStatus,
} from '../utils/acceptanceStatus.js'

export class ValidationService {
  static validateTaskCondition(data: Partial<TaskCondition>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.task_id) {
      errors.push('任务ID不能为空')
    }

    if (!data.condition_type) {
      errors.push('条件类型不能为空')
    } else if (
      !['material', 'personnel', 'weather', 'design-change', 'preceding', 'other', '图纸', '材料', '人员', '设备', '其他'].includes(data.condition_type)
    ) {
      errors.push('条件类型无效，必须是：material/personnel/weather/design-change/preceding/other 或 图纸/材料/人员/设备/其他')
    }

    if (!data.condition_name || data.condition_name.trim() === '') {
      errors.push('条件名称不能为空')
    }

    if (data.status && !['未满足', '已满足', '已确认'].includes(data.status)) {
      errors.push('状态无效，必须是：未满足、已满足、已确认')
    }

    if (data.status === '已确认' && !data.confirmed_by) {
      errors.push('已确认状态必须指定确认人')
    }

    if (data.attachments && !Array.isArray(data.attachments)) {
      errors.push('附件必须是数组格式')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  static validateConditionStatusUpdate(
    currentStatus: string,
    newStatus: string,
    confirmedBy?: string,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    const validTransitions: Record<string, string[]> = {
      未满足: ['已满足'],
      已满足: ['已确认'],
      已确认: ['未满足'],
    }

    if (currentStatus === newStatus) {
      return { valid: true, errors: [] }
    }

    const allowedNext = validTransitions[currentStatus]
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      errors.push(`不允许从"${currentStatus}"变更为"${newStatus}"`)
    }

    if (newStatus === '已确认' && !confirmedBy) {
      errors.push('确认开工条件必须指定确认人')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  static validateTaskObstacle(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.task_id) {
      errors.push('任务ID不能为空')
    }

    if (!data.obstacle_type) {
      errors.push('阻碍类型不能为空')
    } else if (!['人员', '材料', '设备', '环境', '设计', '其他'].includes(data.obstacle_type)) {
      errors.push('阻碍类型无效，必须是：人员、材料、设备、环境、设计、其他')
    }

    if (!data.description || data.description.trim() === '') {
      errors.push('阻碍描述不能为空')
    }

    if (!data.severity) {
      errors.push('严重程度不能为空')
    } else if (!['低', '中', '高', '严重'].includes(data.severity)) {
      errors.push('严重程度无效，必须是：低、中、高、严重')
    }

    if (data.status && !['待处理', '处理中', '已解决'].includes(data.status)) {
      errors.push('状态无效，必须是：待处理、处理中、已解决')
    }

    if (data.status === '已解决' && !data.resolution) {
      errors.push('已解决状态必须提供解决方案')
    }

    if (data.status === '已解决' && !data.resolved_by) {
      errors.push('已解决状态必须指定处理人')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  static validateDelayHistory(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.task_id) {
      errors.push('任务ID不能为空')
    }

    if (!data.original_date) {
      errors.push('原计划日期不能为空')
    }

    if (!data.delayed_date) {
      errors.push('延期后日期不能为空')
    }

    if (data.original_date && data.delayed_date) {
      const original = new Date(data.original_date)
      const delayed = new Date(data.delayed_date)
      if (delayed <= original) {
        errors.push('延期后日期必须晚于原计划日期')
      }
    }

    if (!data.delay_days || data.delay_days <= 0) {
      errors.push('延期天数必须大于0')
    }

    if (data.original_date && data.delayed_date && data.delay_days) {
      const original = new Date(data.original_date)
      const delayed = new Date(data.delayed_date)
      const actualDays = Math.ceil((delayed.getTime() - original.getTime()) / (1000 * 60 * 60 * 24))

      if (actualDays !== data.delay_days) {
        errors.push(`延期天数计算错误，应为${actualDays}天`)
      }
    }

    if (!data.delay_reason || data.delay_reason.trim() === '') {
      errors.push('延期原因不能为空')
    }

    if (!data.approved_by) {
      errors.push('审批人不能为空')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  static validateAcceptancePlan(
    data: Partial<AcceptancePlan> & {
      status?: string
      acceptance_name?: string
      acceptance_type?: string
      name?: string
      type_id?: string
      type_name?: string
      documents?: any
    },
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.project_id) {
      errors.push('项目ID不能为空')
    }

    const resolvedName = data.name?.trim() || data.acceptance_name?.trim()
    if (!resolvedName) {
      errors.push('验收名称不能为空')
    }

    const hasTypeId = typeof data.type_id === 'string' ? data.type_id.trim() !== '' : data.type_id != null
    const hasTypeName = typeof data.type_name === 'string' ? data.type_name.trim() !== '' : data.type_name != null

    if (hasTypeId || hasTypeName) {
      if (typeof data.type_id === 'string' && data.type_id.trim() === '') {
        errors.push('验收类型ID不能为空字符串')
      }
    } else if (data.acceptance_type !== undefined && data.acceptance_type !== null && data.acceptance_type !== '') {
      const validOldTypes = [
        '工程竣工预验收',
        '单位工程质量竣工验收',
        '消防验收',
        '规划验收',
        '人防验收',
        '电梯验收',
        '防雷验收',
        '竣工验收备案',
        '分项',
        '分部',
        '竣工',
        '消防',
        '环保',
        '规划',
        '节能',
        '智能',
        '其他',
      ]
      if (!validOldTypes.includes(data.acceptance_type)) {
        errors.push(`验收类型无效，必须是：${validOldTypes.join('、')}`)
      }
    }

    if (!data.planned_date) {
      errors.push('计划验收日期不能为空')
    }

    if (data.status && !ACCEPTANCE_STATUSES.includes(data.status as AcceptancePlan['status'])) {
      errors.push(`状态无效，必须是：${ACCEPTANCE_STATUSES.join('、')}`)
    }

    if (data.documents && !Array.isArray(data.documents)) {
      errors.push('文档清单必须是数组格式')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  static validateAcceptanceStatusUpdate(
    currentStatus: string,
    newStatus: string,
    actualDate?: string,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []
    const current = parseAcceptanceStatus(currentStatus)
    const next = parseAcceptanceStatus(newStatus)

    if (currentStatus === newStatus) {
      return { valid: true, errors: [] }
    }

    if (!current) {
      errors.push('当前验收状态无效，无法执行状态流转')
    }
    if (!next) {
      errors.push('验收状态无效，必须使用标准状态枚举')
    }
    if (!current || !next) {
      return {
        valid: false,
        errors,
      }
    }

    const allowedNext = ACCEPTANCE_STATUS_TRANSITIONS[current]
    if (!allowedNext || !allowedNext.includes(next)) {
      errors.push(`不允许从"${acceptanceStatusLabel(current)}"变更为"${acceptanceStatusLabel(next)}"`)
    }

    if (next === 'passed' && !actualDate) {
      errors.push('已通过状态必须提供实际验收日期')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  static validateAcceptanceStatusPreconditions(
    targetStatus: string,
    requirements: Array<
      Pick<
        AcceptanceRequirement,
        | 'id'
        | 'requirement_type'
        | 'source_entity_type'
        | 'source_entity_id'
        | 'description'
        | 'status'
        | 'is_required'
        | 'is_satisfied'
      >
    >,
  ): { valid: boolean; errors: string[] } {
    const next = parseAcceptanceStatus(targetStatus)
    if (!next || !['ready_to_submit', 'submitted', 'inspecting'].includes(next)) {
      return { valid: true, errors: [] }
    }

    const blockingRequirements = requirements.filter((requirement) => {
      const normalizedStatus = String(requirement.status ?? 'open').trim().toLowerCase()
      const isRequired = requirement.is_required !== false
      const isSatisfied = requirement.is_satisfied === true || normalizedStatus === 'met' || normalizedStatus === 'closed'
      return isRequired && !isSatisfied
    })

    if (blockingRequirements.length === 0) {
      return { valid: true, errors: [] }
    }

    const preview = blockingRequirements.slice(0, 3).map((requirement) => {
      const description = requirement.description?.trim()
      if (description) return description

      const requirementType = requirement.requirement_type?.trim() || '未命名前置条件'
      const sourceType = requirement.source_entity_type?.trim() || 'unknown'
      const sourceId = requirement.source_entity_id?.trim() || requirement.id
      return `${requirementType}（${sourceType}:${sourceId}）`
    })

    const errors = [
      `前置条件未满足，不能推进到“${acceptanceStatusLabel(next)}”`,
      `仍有 ${blockingRequirements.length} 项前置条件未满足：${preview.join('、')}${blockingRequirements.length > preview.length ? ' 等' : ''}`,
    ]

    return {
      valid: false,
      errors,
    }
  }

  static validateWbsTemplate(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.template_name || data.template_name.trim() === '') {
      errors.push('模板名称不能为空')
    }

    if (!data.template_type) {
      errors.push('模板类型不能为空')
    } else if (!['住宅', '商业', '工业', '公共建筑', '市政'].includes(data.template_type)) {
      errors.push('模板类型无效，必须是：住宅、商业、工业、公共建筑、市政')
    }

    if (!data.wbs_nodes || !Array.isArray(data.wbs_nodes)) {
      errors.push('WBS节点必须是数组格式')
    } else if (data.wbs_nodes.length === 0) {
      errors.push('WBS节点不能为空')
    } else {
      data.wbs_nodes.forEach((node: any, index: number) => {
        if (!node.id || !node.name) {
          errors.push(`第${index + 1}个节点缺少id或name字段`)
        }
      })
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  static validatePreMilestone(data: Partial<PreMilestone>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.project_id) {
      errors.push('项目ID不能为空')
    }

    if (
      data.milestone_type &&
      ![
        'land_certificate',
        'land_use_planning_permit',
        'engineering_planning_permit',
        'construction_permit',
        '土地证',
        '规划证',
        '施工证',
        '预售证',
        '产权证',
        '其他',
      ].includes(data.milestone_type)
    ) {
      errors.push('证照类型无效，必须是当前正式证照类型编码或兼容旧中文类型')
    }

    if (!data.milestone_name || data.milestone_name.trim() === '') {
      errors.push('证照名称不能为空')
    }

    if (data.status && !CERTIFICATE_STATUS_VALUES.includes(data.status as (typeof CERTIFICATE_STATUS_VALUES)[number])) {
      errors.push(`状态无效，必须是：${CERTIFICATE_STATUS_VALUES.join('、')}`)
    }

    if (data.current_stage && !CERTIFICATE_STAGE_VALUES.includes(data.current_stage as (typeof CERTIFICATE_STAGE_VALUES)[number])) {
      errors.push(`当前阶段无效，必须是：${CERTIFICATE_STAGE_VALUES.join('、')}`)
    }

    if (data.application_date && data.issue_date) {
      const application = new Date(data.application_date)
      const issue = new Date(data.issue_date)
      if (issue < application) {
        errors.push('发证日期不能早于申请日期')
      }
    }

    if (data.issue_date && data.expiry_date) {
      const issue = new Date(data.issue_date)
      const expiry = new Date(data.expiry_date)
      if (expiry <= issue) {
        errors.push('过期日期必须晚于发证日期')
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  static validatePreMilestoneStatusUpdate(
    currentStatus: string,
    newStatus: string,
    certificateNo?: string,
    issueDate?: string,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (currentStatus === newStatus) {
      return { valid: true, errors: [] }
    }

    const validTransitions: Record<string, string[]> = {
      pending: ['preparing_documents', 'internal_review', 'voided'],
      preparing_documents: ['internal_review', 'external_submission', 'issued', 'voided'],
      internal_review: ['external_submission', 'supplement_required', 'approved', 'issued', 'voided'],
      external_submission: ['supplement_required', 'approved', 'issued', 'voided'],
      supplement_required: ['preparing_documents', 'internal_review', 'external_submission', 'voided'],
      approved: ['issued', 'supplement_required', 'voided'],
      issued: ['expired', 'voided'],
      expired: ['supplement_required', 'voided'],
      voided: [],
    }

    const allowedNext = validTransitions[currentStatus]
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      errors.push(`不允许从"${currentStatus}"变更为"${newStatus}"`)
    }

    if (newStatus === 'issued' && !certificateNo) {
      errors.push('已取得状态必须提供证件编号')
    }

    if (newStatus === 'issued' && !issueDate) {
      errors.push('已取得状态必须提供发证日期')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}
