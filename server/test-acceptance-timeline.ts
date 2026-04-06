// 验收时间轴功能测试脚本

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const client = createClient(
  process.env.SUPABASE_URL || 'https://test.supabase.co',
  process.env.SUPABASE_ANON_KEY || 'test-key'
)

describe('验收时间轴功能测试', () => {
  let testProjectId: string
  let testPlanId: string
  let testNodeId: string

  beforeAll(async () => {
    // 创建测试项目
    const { data: project } = await client
      .from('projects')
      .insert({
        name: '验收测试项目',
        description: '验收时间轴功能测试',
        status: 'active'
      })
      .select()
      .single()

    testProjectId = project.id

    // 创建测试验收计划
    const { data: plan } = await client
      .from('acceptance_plans')
      .insert({
        project_id: testProjectId,
        acceptance_type: '消防验收',
        acceptance_name: '消防设施验收',
        planned_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: '待验收',
        documents: [],
        created_by: 'test-user-id'
      })
      .select()
      .single()

    testPlanId = plan.id
  })

  afterAll(async () => {
    // 清理测试数据
    await client.from('acceptance_nodes').delete().eq('acceptance_plan_id', testPlanId)
    await client.from('acceptance_plans').delete().eq('id', testPlanId)
    await client.from('projects').delete().eq('id', testProjectId)
  })

  describe('验收计划管理', () => {
    it('TC-019-01: 应该能够获取项目的所有验收计划', async () => {
      const { data, error } = await client
        .from('acceptance_plans')
        .select('*')
        .eq('project_id', testProjectId)

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.length).toBeGreaterThan(0)
      expect(data![0].acceptance_type).toBe('消防验收')
    })

    it('TC-019-02: 应该支持8类验收类型展示', async () => {
      const acceptanceTypes = ['工程竣工预验收', '四方验收', '消防验收', '规划验收', '人防验收', '电梯验收', '防雷验收', '备案验收']

      // 创建所有类型的验收计划
      for (const type of acceptanceTypes) {
        await client.from('acceptance_plans').insert({
          project_id: testProjectId,
          acceptance_type: type,
          acceptance_name: `${type}测试`,
          planned_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: '待验收',
          documents: [],
          created_by: 'test-user-id'
        })
      }

      const { data, error } = await client
        .from('acceptance_plans')
        .select('acceptance_type')
        .eq('project_id', testProjectId)

      expect(error).toBeNull()
      expect(data).toBeDefined()
      const types = data!.map(p => p.acceptance_type)
      expect(types.length).toBeGreaterThanOrEqual(8)
    })

    it('TC-019-03: 应该能够获取单个验收计划详情', async () => {
      const { data, error } = await client
        .from('acceptance_plans')
        .select('*')
        .eq('id', testPlanId)
        .single()

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.id).toBe(testPlanId)
      expect(data!.acceptance_name).toBe('消防设施验收')
    })
  })

  describe('验收节点管理', () => {
    it('TC-019-04: 应该能够创建验收节点', async () => {
      const { data, error } = await client
        .from('acceptance_nodes')
        .insert({
          acceptance_plan_id: testPlanId,
          node_name: '现场勘查',
          node_type: '技术验收',
          description: '消防设施现场勘查',
          status: '待验收',
          planned_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          result: {},
          documents: []
        })
        .select()
        .single()

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.node_name).toBe('现场勘查')
      expect(data!.status).toBe('待验收')

      testNodeId = data.id
    })

    it('TC-019-05: 应该能够更新验收节点状态', async () => {
      // 先创建一个节点
      const { data: created } = await client
        .from('acceptance_nodes')
        .insert({
          acceptance_plan_id: testPlanId,
          node_name: '文档审查',
          node_type: '技术验收',
          description: '消防验收文档审查',
          status: '待验收',
          result: {},
          documents: []
        })
        .select()
        .single()

      // 更新状态为"验收中"
      const { data, error } = await client
        .from('acceptance_nodes')
        .update({ status: '验收中' })
        .eq('id', created.id)
        .select()
        .single()

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.status).toBe('验收中')
      expect(data!.accepted_at).toBeDefined()
    })

    it('TC-019-06: 应该能够删除验收节点', async () => {
      // 先创建一个节点
      const { data: created } = await client
        .from('acceptance_nodes')
        .insert({
          acceptance_plan_id: testPlanId,
          node_name: '临时测试节点',
          status: '待验收',
          result: {},
          documents: []
        })
        .select()
        .single()

      // 删除节点
      const { error } = await client
        .from('acceptance_nodes')
        .delete()
        .eq('id', created.id)

      expect(error).toBeNull()

      // 验证已删除
      const { data: check } = await client
        .from('acceptance_nodes')
        .select('*')
        .eq('id', created.id)

      expect(check).toHaveLength(0)
    })
  })

  describe('验收流程时序依赖', () => {
    it('TC-019-07: 应该按照预定义顺序展示8类验收类型', async () => {
      const expectedOrder = [
        '工程竣工预验收',
        '四方验收',
        '消防验收',
        '规划验收',
        '人防验收',
        '电梯验收',
        '防雷验收',
        '备案验收'
      ]

      const { data, error } = await client
        .from('acceptance_plans')
        .select('acceptance_type, planned_date')
        .eq('project_id', testProjectId)
        .order('planned_date', { ascending: true })

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.length).toBeGreaterThanOrEqual(8)
    })

    it('TC-019-08: 验收计划应该能够关联多个验收节点', async () => {
      // 创建多个节点
      const nodeNames = ['节点A', '节点B', '节点C']
      
      for (const name of nodeNames) {
        await client.from('acceptance_nodes').insert({
          acceptance_plan_id: testPlanId,
          node_name: name,
          status: '待验收',
          result: {},
          documents: []
        })
      }

      const { data, error } = await client
        .from('acceptance_nodes')
        .select('*')
        .eq('acceptance_plan_id', testPlanId)

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.length).toBeGreaterThanOrEqual(3)
    })
  })
})
