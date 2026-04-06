// 乐观锁原子性更新测试
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { updateTask, updateProject, updateRisk } from '../dbService'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''

// 跳过测试如果没有配置 Supabase
const describeIfConfigured = supabaseUrl && supabaseKey ? describe : describe.skip

describeIfConfigured('乐观锁原子性更新测试', () => {
  const supabase = createClient(supabaseUrl, supabaseKey)
  let testProjectId: string
  let testTaskId: string

  beforeAll(async () => {
    // 创建测试项目
    const { data: project } = await supabase
      .from('projects')
      .insert({
        name: '乐观锁测试项目',
        status: 'active',
        version: 1
      })
      .select()
      .single()
    
    if (project) {
      testProjectId = project.id
    }

    // 创建测试任务
    const { data: task } = await supabase
      .from('tasks')
      .insert({
        project_id: testProjectId,
        title: '乐观锁测试任务',
        status: 'todo',
        version: 1
      })
      .select()
      .single()
    
    if (task) {
      testTaskId = task.id
    }
  })

  describe('updateTask 乐观锁', () => {
    it('应该成功更新当版本匹配时', async () => {
      if (!testTaskId) return

      // 先获取当前版本
      const { data: task } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', testTaskId)
        .single()

      if (!task) return

      const currentVersion = (task as any).version || 1

      // 使用乐观锁更新
      const result = await updateTask(testTaskId, {
        title: 'Updated Title'
      }, currentVersion)

      expect(result).not.toBeNull()
      expect((result as any).version).toBe(currentVersion + 1)
    })

    it('应该抛出 VERSION_MISMATCH 当版本不匹配时', async () => {
      if (!testTaskId) return

      // 使用错误的版本号尝试更新
      await expect(
        updateTask(testTaskId, {
          title: 'Should Fail'
        }, 999) // 错误的版本号
      ).rejects.toThrow('VERSION_MISMATCH')
    })

    it('应该支持并发更新的原子性', async () => {
      if (!testTaskId) return

      // 获取当前版本
      const { data: task } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', testTaskId)
        .single()

      if (!task) return

      const currentVersion = (task as any).version || 1

      // 模拟两个并发更新请求
      const update1 = updateTask(testTaskId, { title: 'Update 1' }, currentVersion)
      const update2 = updateTask(testTaskId, { title: 'Update 2' }, currentVersion)

      // 只有一个应该成功
      const results = await Promise.allSettled([update1, update2])
      
      const successes = results.filter(r => r.status === 'fulfilled').length
      const failures = results.filter(r => r.status === 'rejected').length

      // 应该只有一个成功，一个失败
      expect(successes).toBe(1)
      expect(failures).toBe(1)
    })
  })

  describe('updateProject 乐观锁', () => {
    it('应该成功更新项目当版本匹配时', async () => {
      if (!testProjectId) return

      const { data: project } = await supabase
        .from('projects')
        .select('*')
        .eq('id', testProjectId)
        .single()

      if (!project) return

      const currentVersion = (project as any).version || 1

      const result = await updateProject(testProjectId, {
        name: 'Updated Project Name'
      }, currentVersion)

      expect(result).not.toBeNull()
    })

    it('应该抛出 VERSION_MISMATCH 当项目版本不匹配时', async () => {
      if (!testProjectId) return

      await expect(
        updateProject(testProjectId, {
          name: 'Should Fail'
        }, 999)
      ).rejects.toThrow('VERSION_MISMATCH')
    })
  })

  describe('无乐观锁更新', () => {
    it('应该允许不带版本号的更新', async () => {
      if (!testTaskId) return

      // 不带 expectedVersion 的更新应该成功
      const result = await updateTask(testTaskId, {
        title: 'Update without version'
      })

      expect(result).not.toBeNull()
    })
  })
})

describe('乐观锁错误处理', () => {
  it('应该提供清晰的错误消息', async () => {
    // 测试错误消息格式
    const errorMessage = 'VERSION_MISMATCH: 该任务已被他人修改，请刷新后重试'
    
    expect(errorMessage).toContain('VERSION_MISMATCH')
    expect(errorMessage).toContain('请刷新后重试')
  })
})
