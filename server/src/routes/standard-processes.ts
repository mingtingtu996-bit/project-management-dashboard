import express from 'express'
import { executeSQL } from '../services/dbService.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'

const router = express.Router()
router.use(authenticate)

// ==========================================
// GET /api/standard-processes
// 搜索标准工序库
// Query params:
//   q       - 关键字搜索（名称、标签）
//   category - 分类过滤 civil|structure|fitout|mep|general
//   phase    - 阶段过滤
//   limit    - 条数限制（默认50）
// ==========================================
router.get('/', asyncHandler(async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim()
  const category = req.query.category as string | undefined
  const phase = req.query.phase as string | undefined
  const limit = Math.min(Number(req.query.limit ?? 50), 200)

  const conditions: string[] = ['is_active = 1']
  const values: any[] = []

  if (q) {
    conditions.push('(name LIKE ? OR tags LIKE ?)')
    values.push(`%${q}%`, `%${q}%`)
  }
  if (category && category !== 'all') {
    conditions.push('category = ?')
    values.push(category)
  }
  if (phase && phase !== 'all') {
    conditions.push('phase = ?')
    values.push(phase)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`
  values.push(limit)

  const data = await executeSQL(
    `SELECT id, name, category, phase, reference_days, description, tags, sort_order
     FROM standard_processes ${whereClause} ORDER BY sort_order ASC LIMIT ?`,
    values
  )

  res.json({ success: true, data: data ?? [] })
}))

// ==========================================
// GET /api/standard-processes/categories
// 获取所有分类（用于前端筛选 Tab）
// ==========================================
router.get('/categories', asyncHandler(async (req, res) => {
  const categories = [
    { key: 'all',       label: '全部',    icon: '📋' },
    { key: 'civil',     label: '土建',    icon: '🏗️' },
    { key: 'structure', label: '主体结构', icon: '🧱' },
    { key: 'fitout',    label: '装饰装修', icon: '🎨' },
    { key: 'mep',       label: '机电安装', icon: '⚡' },
    { key: 'general',   label: '通用',    icon: '📌' },
  ]
  res.json({ success: true, data: categories })
}))

export default router
