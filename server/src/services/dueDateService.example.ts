// 通用到期状态服务使用示例

import {
  calculateDueStatus,
  batchCalculateDueStatus,
  sortByDueStatus,
  countDueStatus,
  filterByDueStatus,
  getAttentionRequired,
  calculateTaskDueStatus,
  calculateMilestoneDueStatus,
  calculatePermitDueStatus,
  calculateAcceptanceDueStatus,
  calculateConditionDueStatus,
  type WithDueStatus,
} from './dueDateService.js'

// ==================== 基础用法 ====================

// 1. 计算单个日期到期状态
const dueResult = calculateDueStatus('2026-03-25')
console.log(dueResult)
// {
//   days_until_due: 2,
//   due_status: 'urgent',
//   due_label: '2 天后到期',
//   due_color: 'amber'
// }

// 2. 自定义阈值
const customDueResult = calculateDueStatus('2026-03-25', {
  urgentDays: 5,        // 5天内算紧急
  approachingDays: 14,  // 14天内算即将到期
})

// ==================== 批量处理 ====================

// 3. 批量计算任务到期状态
const tasks = [
  { id: 1, title: '任务A', end_date: '2026-03-20' },
  { id: 2, title: '任务B', end_date: '2026-03-25' },
  { id: 3, title: '任务C', end_date: '2026-04-01' },
]

const tasksWithDue = batchCalculateDueStatus(tasks, 'end_date')
// 每个任务都会添加 days_until_due, due_status, due_label, due_color

// 4. 按到期状态排序
const sortedTasks = sortByDueStatus(tasksWithDue)
// 已延期 > 紧急 > 即将到期 > 正常

// 5. 统计分布
const stats = countDueStatus(tasksWithDue)
// { total: 3, overdue: 1, urgent: 1, approaching: 0, normal: 1 }

// ==================== 特定场景 ====================

// 6. 任务到期状态
interface Task {
  id: number
  title: string
  end_date?: string
}
const task: Task = { id: 1, title: '主体结构封顶', end_date: '2026-03-20' }
const taskWithDue = calculateTaskDueStatus(task)

// 7. 里程碑到期状态
interface Milestone {
  id: number
  name: string
  planned_date?: string
}
const milestone: Milestone = { id: 1, name: '地基验收', planned_date: '2026-03-25' }
const milestoneWithDue = calculateMilestoneDueStatus(milestone)

// 8. 证照到期状态
interface Permit {
  id: number
  name: string
  expiry_date?: string
}
const permit: Permit = { id: 1, name: '施工许可证', expiry_date: '2026-03-20' }
const permitWithDue = calculatePermitDueStatus(permit)
// 标签会显示"已过期"而不是"已延期"

// 9. 验收计划到期状态
interface Acceptance {
  id: number
  name: string
  planned_date?: string
}
const acceptance: Acceptance = { id: 1, name: '主体结构验收', planned_date: '2026-04-01' }
const acceptanceWithDue = calculateAcceptanceDueStatus(acceptance)

// 10. 开工条件到期状态
interface Condition {
  id: number
  name: string
  required_date?: string
}
const condition: Condition = { id: 1, name: '施工图纸审查', required_date: '2026-03-20' }
const conditionWithDue = calculateConditionDueStatus(condition)
// 标签会显示"已逾期"

// ==================== 过滤和查询 ====================

// 11. 过滤指定状态
const urgentItems = filterByDueStatus(tasksWithDue, ['urgent', 'overdue'])

// 12. 获取需要关注的项目（已延期 + 紧急 + 即将到期）
const attentionRequired = getAttentionRequired(tasksWithDue)

// ==================== 在API路由中使用 ====================

/*
// milestones.ts - 里程碑API
import { calculateMilestoneDueStatus, sortByDueStatus, countDueStatus } from '../services/dueDateService.js'

router.get('/api/milestones/with-due-status', async (req, res) => {
  const { projectId } = req.query
  
  // 查询里程碑
  const { data: milestones } = await supabase
    .from('milestones')
    .select('*')
    .eq('project_id', projectId)
  
  // 计算到期状态
  const milestonesWithDue = batchCalculateDueStatus(milestones, 'planned_date')
  
  // 排序
  const sorted = sortByDueStatus(milestonesWithDue)
  
  // 统计
  const stats = countDueStatus(milestonesWithDue)
  
  res.json({ data: sorted, stats })
})

// permits.ts - 证照API
import { calculatePermitDueStatus } from '../services/dueDateService.js'

router.get('/api/permits/expiring', async (req, res) => {
  const { projectId } = req.query
  
  const { data: permits } = await supabase
    .from('permits')
    .select('*')
    .eq('project_id', projectId)
  
  // 计算到期状态
  const permitsWithDue = permits.map(calculatePermitDueStatus)
  
  // 只返回需要关注的
  const expiring = getAttentionRequired(permitsWithDue)
  
  res.json({ data: expiring })
})
*/

// ==================== 前端使用 ====================

/*
// 如果前端也需要相同逻辑，可以创建一个对应的 TypeScript 工具函数

// utils/dueDate.ts
import { calculateDueStatus, DUE_CONFIG } from './dueDateService'

export function useDueStatus(endDate: string | Date | null) {
  return calculateDueStatus(endDate)
}

// 组件中使用
function TaskCard({ task }: { task: Task }) {
  const dueStatus = useDueStatus(task.end_date)
  
  return (
    <div className={`border-l-4 border-${dueStatus.due_color}-500`}>
      <h3>{task.title}</h3>
      {dueStatus.due_label && (
        <span className={`text-${dueStatus.due_color}-600`}>
          {dueStatus.due_label}
        </span>
      )}
    </div>
  )
}
*/
