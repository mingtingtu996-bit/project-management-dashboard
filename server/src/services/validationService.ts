// 验证函数服务
// 提供 task_conditions, acceptance_plans, pre_milestones 的数据验证

import type {
  TaskCondition,
  AcceptancePlan,
  PreMilestone
} from '../types/db.js'

export class ValidationService {
  // 验证开工条件
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

    if (data.status && 
!['未满足', '已满足', '已确认'].includes(data.status)
) {
      errors.push('状态无效，必须是：未满足、已满足、已确认')
    }

    // 验证状态转换逻辑
    if (data.status === '已确认' && !data.confirmed_by) {
      errors.push('已确认状态必须指定确认人')
    }

    // 验证附件格式
    if (data.attachments && !Array.isArray(data.attachments)) {
      errors.push('附件必须是数组格式')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // 验证开工条件状态变更
  static validateConditionStatusUpdate(
    currentStatus: string,
    newStatus: string,
    confirmedBy?: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    const validTransitions: Record<string, string[]> = {
      '未满足': ['已满足'],
      '已满足': ['已确认'],
      '已确认': ['未满足'] // 允许回退
    }

    if (currentStatus === newStatus) {
      return { valid: true, errors: [] }
    }

    const allowedNext = validTransitions[currentStatus]
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      errors.push(`不允许从"${currentStatus}"变更为"${newStatus}"`)
    }

    // 只有"已满足"可以变为"已确认"
    if (newStatus === '已确认' && !confirmedBy) {
      errors.push('确认开工条件必须指定确认人')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // 验证阻碍记录
  static validateTaskObstacle(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.task_id) {
      errors.push('任务ID不能为空')
    }

    if (!data.obstacle_type) {
      errors.push('阻碍类型不能为空')
    } else if (
!['人员', '材料', '设备', '环境', '设计', '其他'].includes(data.obstacle_type)
) {
      errors.push('阻碍类型无效，必须是：人员、材料、设备、环境、设计、其他')
    }

    if (!data.description || data.description.trim() === '') {
      errors.push('阻碍描述不能为空')
    }

    if (!data.severity) {
      errors.push('严重程度不能为空')
    } else if (
!['低', '中', '高', '严重'].includes(data.severity)
) {
      errors.push('严重程度无效，必须是：低、中、高、严重')
    }

    if (data.status && 
!['待处理', '处理中', '已解决', '无法解决'].includes(data.status)
) {
      errors.push('状态无效，必须是：待处理、处理中、已解决、无法解决')
    }

    // 验证状态变更逻辑
    if (data.status === '已解决' && !data.resolution) {
      errors.push('已解决状态必须提供解决方案')
    }

    if (data.status === '已解决' && !data.resolved_by) {
      errors.push('已解决状态必须指定处理人')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // 验证延期历史
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

    // 验证延期日期必须晚于原日期
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

    // 验证延期天数计算是否正确
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
      errors
    }
  }

  // 验收计划验证（兼容新模型 V4.3 和旧模型）
  // 新模型字段：name, type_id, type_name, planned_date, status(英文)
  // 旧模型字段：acceptance_name, acceptance_type, planned_date, status(中文)
  static validateAcceptancePlan(data: Partial<AcceptancePlan> & { status?: string; acceptance_name?: string; acceptance_type?: string; name?: string; type_id?: string; type_name?: string; documents?: any }): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.project_id) {
      errors.push('项目ID不能为空')
    }

    // 验证名称：新模型用 name，旧模型用 acceptance_name，二选一即可
    const resolvedName = data.name?.trim() || data.acceptance_name?.trim()
    if (!resolvedName) {
      errors.push('验收名称不能为空')
    }

    // 验证类型：新模型用 type_id（任意字符串），旧模型用 acceptance_type（固定白名单）
    // 规则：type_id 存在时优先走新模型路径，完全忽略 acceptance_type 字段
    if (data.type_id !== undefined && data.type_id !== null) {
      // 新模型：type_id 存在即合法（系统类型或自定义类型均可），只校验非空字符串
      if (typeof data.type_id === 'string' && data.type_id.trim() === '') {
        errors.push('验收类型ID不能为空字符串')
      }
      // type_id 路径结束，不再检查 acceptance_type
    } else if (data.acceptance_type !== undefined && data.acceptance_type !== null && data.acceptance_type !== '') {
      // 旧模型：仅当 acceptance_type 有非空值时做白名单校验（空值宽容通过）
      const VALID_OLD_TYPES = ['工程竣工预验收', '单位工程质量竣工验收', '消防验收', '规划验收', '人防验收', '电梯验收', '防雷验收', '竣工验收备案']
      if (!VALID_OLD_TYPES.includes(data.acceptance_type)) {
        errors.push(`验收类型无效，必须是：${VALID_OLD_TYPES.join('、')}`)
      }
    }
    // 两种类型字段都不存在/均为空：宽容处理，允许通过（前端可能只传 name 不传类型）

    if (!data.planned_date) {
      errors.push('计划验收日期不能为空')
    }

    // 兼容中英文状态值
    const VALID_EN_STATUSES = ['pending', 'in_progress', 'passed', 'failed', 'needs_revision']
    const VALID_ZH_STATUSES = ['待验收', '验收中', '已通过', '未通过', '需补充']
    if (data.status &&
      !VALID_EN_STATUSES.includes(data.status) &&
      !VALID_ZH_STATUSES.includes(data.status)
    ) {
      errors.push(`状态无效，必须是：${[...VALID_EN_STATUSES, ...VALID_ZH_STATUSES].join('、')}`)
    }

    // 验证状态与实际日期的关联（中英文均兼容）
    if (((data.status as string) === '已通过' || (data.status as string) === 'passed') && !data.actual_date) {
      // 仅警告，不强制（创建时可以没有实际日期）
    }

    // 验证文档清单格式
    if (data.documents && !Array.isArray(data.documents)) {
      errors.push('文档清单必须是数组格式')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // 验收状态变更验证
  static validateAcceptanceStatusUpdate(
    currentStatus: string,
    newStatus: string,
    actualDate?: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (currentStatus === newStatus) {
      return { valid: true, errors: [] }
    }

    const validTransitions: Record<string, string[]> = {
      // 中文 key（向后兼容）
      '待验收': ['验收中', '已通过', '未通过'],
      '验收中': ['已通过', '未通过', '待验收'],
      '已通过': [],
      '未通过': ['验收中', '待验收'],
      // 英文 key
      'pending': ['in_progress', 'passed', 'failed'],
      'in_progress': ['passed', 'failed', 'pending'],
      'passed': [],
      'failed': ['in_progress', 'pending']
    }

    const allowedNext = validTransitions[currentStatus]
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      errors.push(`不允许从"${currentStatus}"变更为"${newStatus}"`)
    }

    // 已通过必须提供实际验收日期（中英文均兼容）
    if ((newStatus === '已通过' || newStatus === 'passed') && !actualDate) {
      errors.push('已通过状态必须提供实际验收日期')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // WBS模板验证
  static validateWbsTemplate(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.template_name || data.template_name.trim() === '') {
      errors.push('模板名称不能为空')
    }

    if (!data.template_type) {
      errors.push('模板类型不能为空')
    } else if (
!['住宅', '商业', '工业', '市政'].includes(data.template_type)
) {
      errors.push('模板类型无效，必须是：住宅、商业、工业、市政')
    }

    if (!data.wbs_nodes || !Array.isArray(data.wbs_nodes)) {
      errors.push('WBS节点必须是数组格式')
    } else if (data.wbs_nodes.length === 0) {
      errors.push('WBS节点不能为空')
    } else {
      // 验证每个节点的基本结构
      data.wbs_nodes.forEach((node: any, index: number) => {
        if (!node.id || !node.name) {
          errors.push(`第${index + 1}个节点缺少id或name字段`)
        }
      })
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // 前期证照验证
  static validatePreMilestone(data: Partial<PreMilestone>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data.project_id) {
      errors.push('项目ID不能为空')
    }

    // milestone_type 改为可选（支持用户自定义输入证照名称）
    // 但如果提供了类型，必须是有效值
    if (data.milestone_type && 
        !['土地证', '规划证', '施工证', '预售证', '产权证', '其他'].includes(data.milestone_type)) {
      errors.push('证照类型无效，必须是：土地证、规划证、施工证、预售证、产权证、其他')
    }

    if (!data.milestone_name || data.milestone_name.trim() === '') {
      errors.push('证照名称不能为空')
    }

    if (data.status && 
!['待申请', '办理中', '已取得', '已过期', '需延期'].includes(data.status)
) {
      errors.push('状态无效，必须是：待申请、办理中、已取得、已过期、需延期')
    }

    // 验证日期逻辑
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
      errors
    }
  }

  // 证照状态变更验证
  static validatePreMilestoneStatusUpdate(
    currentStatus: string,
    newStatus: string,
    documentNo?: string,
    issueDate?: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (currentStatus === newStatus) {
      return { valid: true, errors: [] }
    }

    const validTransitions: Record<string, string[]> = {
      '待申请': ['办理中'],
      '办理中': ['已取得'],
      '已取得': ['已过期', '需延期'],
      '已过期': ['需延期'],
      '需延期': ['办理中']
    }

    const allowedNext = validTransitions[currentStatus]
    if (!allowedNext || !allowedNext.includes(newStatus)) {
      errors.push(`不允许从"${currentStatus}"变更为"${newStatus}"`)
    }

    // 已取得状态必须有证件编号和发证日期
    if (newStatus === '已取得' && !documentNo) {
      errors.push('已取得状态必须提供证件编号')
    }

    if (newStatus === '已取得' && !issueDate) {
      errors.push('已取得状态必须提供发证日期')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }
}
