// 数据导出模块
// 支持导出项目数据为JSON/Excel格式，方便备份和迁移

import * as XLSX from 'xlsx'

import { projectDb, taskDb, riskDb, milestoneDb, memberDb, invitationDb, generateId } from './localDb'
import { Project, Task, Risk, Milestone, ProjectMember, Invitation } from './localDb'

// ============================================
// 导出数据类型
// ============================================
export interface ExportData {
  version: string
  exportedAt: string
  projects: Project[]
  tasks: Task[]
  risks: Risk[]
  milestones: Milestone[]
  members: ProjectMember[]
  invitations: Invitation[]
}

// ============================================
// 导入数据类型
// ============================================
export interface ImportResult {
  success: boolean
  imported: {
    projects: number
    tasks: number
    risks: number
    milestones: number
    members: number
    invitations: number
  }
  errors: string[]
}

// ============================================
// 导出全部数据
// ============================================
export function exportAllData(): ExportData {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    projects: projectDb.getAll(),
    tasks: taskDb.getAll(),
    risks: riskDb.getAll(),
    milestones: milestoneDb.getAll(),
    members: memberDb.getAll(),
    invitations: invitationDb.getAll()
  }
}

// ============================================
// 导出为JSON文件
// ============================================
export function exportToJSON(data: ExportData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = `pm-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ============================================
// 导出指定项目数据
// ============================================
export function exportProjectData(projectId: string): ExportData | null {
  const project = projectDb.getById(projectId)
  if (!project) return null

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    projects: [project],
    tasks: taskDb.getByProject(projectId),
    risks: riskDb.getByProject(projectId),
    milestones: milestoneDb.getByProject(projectId),
    members: memberDb.getByProject(projectId),
    invitations: invitationDb.getByProject(projectId)
  }
}

// ============================================
// 导入数据
// ============================================
export function importData(data: ExportData): ImportResult {
  const result: ImportResult = {
    success: true,
    imported: {
      projects: 0,
      tasks: 0,
      risks: 0,
      milestones: 0,
      members: 0,
      invitations: 0
    },
    errors: []
  }

  // 验证版本兼容性
  if (!data.version) {
    result.errors.push('无效的备份文件：缺少版本信息')
    result.success = false
    return result
  }

  try {
    // 导入项目
    if (data.projects?.length) {
      data.projects.forEach(project => {
        const existing = projectDb.getById(project.id)
        if (!existing) {
          projectDb.create(project)
          result.imported.projects++
        }
      })
    }

    // 导入任务
    if (data.tasks?.length) {
      data.tasks.forEach(task => {
        const existing = taskDb.getById(task.id)
        if (!existing) {
          taskDb.create(task)
          result.imported.tasks++
        }
      })
    }

    // 导入风险
    if (data.risks?.length) {
      data.risks.forEach(risk => {
        const existing = riskDb.getById(risk.id)
        if (!existing) {
          riskDb.create(risk)
          result.imported.risks++
        }
      })
    }

    // 导入里程碑
    if (data.milestones?.length) {
      data.milestones.forEach(milestone => {
        const existing = milestoneDb.getById(milestone.id)
        if (!existing) {
          milestoneDb.create(milestone)
          result.imported.milestones++
        }
      })
    }

    // 导入成员
    if (data.members?.length) {
      data.members.forEach(member => {
        const existing = memberDb.getById(member.id)
        if (!existing) {
          memberDb.create(member)
          result.imported.members++
        }
      })
    }

    // 导入邀请码
    if (data.invitations?.length) {
      data.invitations.forEach(invitation => {
        const existing = invitationDb.getById(invitation.id)
        if (!existing) {
          invitationDb.create(invitation)
          result.imported.invitations++
        }
      })
    }
  } catch (error) {
    result.errors.push(`导入过程出错: ${error instanceof Error ? error.message : '未知错误'}`)
    result.success = false
  }

  return result
}

// ============================================
// 从JSON文件导入
// ============================================
export function importFromJSON(file: File): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as ExportData
        const result = importData(data)
        resolve(result)
      } catch (error) {
        resolve({
          success: false,
          imported: { projects: 0, tasks: 0, risks: 0, milestones: 0, members: 0, invitations: 0 },
          errors: [`解析JSON失败: ${error instanceof Error ? error.message : '未知错误'}`]
        })
      }
    }
    
    reader.onerror = () => {
      resolve({
        success: false,
        imported: { projects: 0, tasks: 0, risks: 0, milestones: 0, members: 0, invitations: 0 },
        errors: ['读取文件失败']
      })
    }
    
    reader.readAsText(file)
  })
}

// ============================================
// 清除全部数据（谨慎使用）
// ============================================
export function clearAllData(): void {
  localStorage.clear()
}

// ============================================
// 获取存储使用情况
// ============================================
export function getStorageUsage(): { used: number; quota: number; percentage: number } {
  let used = 0
  
  for (const key in localStorage) {
    if (localStorage.hasOwnProperty(key)) {
      used += localStorage[key].length + key.length
    }
  }
  
  // 估算 quota (大多数浏览器提供5MB)
  const quota = 5 * 1024 * 1024
  
  return {
    used,
    quota,
    percentage: Math.round((used / quota) * 100)
  }
}

// ============================================
// Excel导出功能
// ============================================

// 导出项目任务为Excel
export function exportTasksToExcel(projectId: string): void {
  const tasks = taskDb.getByProject(projectId)
  const project = projectDb.getById(projectId)
  
  if (!project || tasks.length === 0) {
    throw new Error('没有可导出的任务数据')
  }
  
  // 准备Excel数据
  const taskData = tasks.map(task => ({
    '任务名称': task.title || '',
    '描述': task.description || '',
    '状态': getTaskStatusText(task.status),
    '优先级': getPriorityText(task.priority),
    '开始日期': task.start_date || '',
    '结束日期': task.end_date || '',
    '进度(%)': task.progress || 0,
    '责任人': task.assignee || '',
    '责任单位': task.assignee_unit || '',
    '是否为里程碑': task.is_milestone ? '是' : '否',
    '依赖任务': task.dependencies?.length ? '有依赖' : '无'
  }))
  
  // 创建工作簿
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(taskData)
  
  // 设置列宽
  ws['!cols'] = [
    { wch: 25 }, // 任务名称
    { wch: 30 }, // 描述
    { wch: 10 }, // 状态
    { wch: 10 }, // 优先级
    { wch: 12 }, // 开始日期
    { wch: 12 }, // 结束日期
    { wch: 10 }, // 进度
    { wch: 15 }, // 责任人
    { wch: 15 }, // 责任单位
    { wch: 12 }, // 里程碑
    { wch: 10 }  // 依赖
  ]
  
  XLSX.utils.book_append_sheet(wb, ws, '任务列表')
  
  // 导出Excel文件
  const fileName = `${project.name}-任务导出-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, fileName)
}

// 导出项目风险为Excel
export function exportRisksToExcel(projectId: string): void {
  const risks = riskDb.getByProject(projectId)
  const project = projectDb.getById(projectId)
  
  if (!project || risks.length === 0) {
    throw new Error('没有可导出的风险数据')
  }
  
  const riskData = risks.map(risk => ({
    '风险名称': risk.title || '',
    '描述': risk.description || '',
    '等级': getRiskLevelText(risk.level),
    '状态': getRiskStatusText(risk.status),
    '概率(%)': risk.probability || 0,
    '影响(%)': risk.impact || 0,
    '应对措施': risk.mitigation || ''
  }))
  
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(riskData)
  
  ws['!cols'] = [
    { wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 30 }
  ]
  
  XLSX.utils.book_append_sheet(wb, ws, '风险列表')
  
  const fileName = `${project.name}-风险导出-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, fileName)
}

// 导出项目里程碑为Excel
export function exportMilestonesToExcel(projectId: string): void {
  const milestones = milestoneDb.getByProject(projectId)
  const project = projectDb.getById(projectId)
  
  if (!project || milestones.length === 0) {
    throw new Error('没有可导出的里程碑数据')
  }
  
  const milestoneData = milestones.map(milestone => ({
    '里程碑名称': milestone.title || '',
    '描述': milestone.description || '',
    '目标日期': milestone.target_date || '',
    '状态': getMilestoneStatusText(milestone.status),
    '完成时间': milestone.completed_at || ''
  }))
  
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(milestoneData)
  
  ws['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 20 }]
  
  XLSX.utils.book_append_sheet(wb, ws, '里程碑列表')
  
  const fileName = `${project.name}-里程碑导出-${new Date().toISOString().slice(0, 10)}.xlsx`
  XLSX.writeFile(wb, fileName)
}

// ============================================
// Excel导入功能
// ============================================

// 从Excel文件导入任务
export function importTasksFromExcel(file: File, projectId: string): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(sheet) as any[]
        
        const result: ImportResult = {
          success: true,
          imported: { projects: 0, tasks: 0, risks: 0, milestones: 0, members: 0, invitations: 0 },
          errors: []
        }
        
        // 验证并导入任务
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i]
          
          // 验证必填字段
          if (!row['任务名称']) {
            result.errors.push(`第${i + 2}行：缺少任务名称`)
            continue
          }
          
          const task = {
            id: generateId(),
            project_id: projectId,
            title: row['任务名称'],
            description: row['描述'] || '',
            status: parseTaskStatus(row['状态']),
            priority: parsePriority(row['优先级']),
            start_date: row['开始日期'] || null,
            end_date: row['结束日期'] || null,
            progress: parseInt(row['进度(%)']) || 0,
            assignee: row['责任人'] || '',
            assignee_unit: row['责任单位'] || '',
            dependencies: [],
            is_milestone: row['是否为里程碑'] === '是',
            created_at: new Date().toISOString()
          }
          
          taskDb.create(task)
          result.imported.tasks++
        }
        
        if (result.imported.tasks === 0) {
          result.errors.push('没有有效的任务数据')
          result.success = false
        }
        
        resolve(result)
      } catch (error) {
        resolve({
          success: false,
          imported: { projects: 0, tasks: 0, risks: 0, milestones: 0, members: 0, invitations: 0 },
          errors: [`解析Excel失败: ${error instanceof Error ? error.message : '未知错误'}`]
        })
      }
    }
    
    reader.onerror = () => {
      resolve({
        success: false,
        imported: { projects: 0, tasks: 0, risks: 0, milestones: 0, members: 0, invitations: 0 },
        errors: ['读取文件失败']
      })
    }
    
    reader.readAsBinaryString(file)
  })
}

// ============================================
// 模板下载
// ============================================

// 下载任务导入模板
export function downloadTaskTemplate(): void {
  const templateData = [{
    '任务名称': '示例任务',
    '描述': '任务描述（可选）',
    '状态': 'todo',
    '优先级': 'medium',
    '开始日期': '2024-01-01',
    '结束日期': '2024-01-31',
    '进度(%)': 0,
    '责任人': '张三',
    '责任单位': '技术部',
    '是否为里程碑': '否',
    '依赖任务': '无'
  }]
  
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(templateData)
  
  ws['!cols'] = [
    { wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 },
    { wch: 15 }, { wch: 12 }, { wch: 10 }
  ]
  
  // 添加填写说明
  const instructionData = [{
    '说明': '状态可选值：todo, in_progress, completed',
    '优先级可选值': 'low, medium, high',
    '责任人': '填写负责人姓名',
    '责任单位': '填写负责单位名称',
    '是否为里程碑': '填"是"或"否"'
  }]
  
  const ws2 = XLSX.utils.json_to_sheet(instructionData)
  ws2['!cols'] = [{ wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 20 }, { wch: 30 }]
  
  XLSX.utils.book_append_sheet(wb, ws, '任务模板')
  XLSX.utils.book_append_sheet(wb, ws2, '填写说明')
  
  XLSX.writeFile(wb, '任务导入模板.xlsx')
}

// ============================================
// 辅助函数
// ============================================

function getTaskStatusText(status: string): string {
  const map: Record<string, string> = {
    'todo': '待处理',
    'in_progress': '进行中',
    'completed': '已完成'
  }
  return map[status] || status
}

function parseTaskStatus(status: string): 'todo' | 'in_progress' | 'completed' {
  const map: Record<string, 'todo' | 'in_progress' | 'completed'> = {
    '待处理': 'todo',
    '进行中': 'in_progress',
    '已完成': 'completed',
    'todo': 'todo',
    'in_progress': 'in_progress',
    'completed': 'completed'
  }
  return map[status] || 'todo'
}

function getPriorityText(priority: string): string {
  const map: Record<string, string> = {
    'low': '低',
    'medium': '中',
    'high': '高'
  }
  return map[priority] || priority
}

function parsePriority(priority: string): 'low' | 'medium' | 'high' | 'urgent' {
  const map: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
    '低': 'low',
    '中': 'medium',
    '高': 'high',
    'low': 'low',
    'medium': 'medium',
    'high': 'high',
    'urgent': 'urgent'
  }
  return map[priority] || 'medium'
}

function getRiskLevelText(level: string): string {
  const map: Record<string, string> = {
    'low': '低',
    'medium': '中',
    'high': '高',
    'critical': '严重'
  }
  return map[level] || level
}

function getRiskStatusText(status: string): string {
  const map: Record<string, string> = {
    'identified': '已识别',
    'monitoring': '监控中',
    'mitigated': '已缓解',
    'resolved': '已解决'
  }
  return map[status] || status
}

function getMilestoneStatusText(status: string): string {
  const map: Record<string, string> = {
    'pending': '待完成',
    'in_progress': '进行中',
    'completed': '已完成',
    'delayed': '已延期'
  }
  return map[status] || status
}
