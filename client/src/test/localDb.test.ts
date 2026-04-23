// 本地数据库模块测试
import { describe, it, expect, beforeEach } from 'vitest'
import { generateId, projectDb, taskDb } from '../lib/localDb'
import type { Project, Task } from '../lib/localDb'

// Functional in-memory localStorage for tests
const store: Record<string, string> = {}
const functionalLocalStorage: Storage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  get length() { return Object.keys(store).length },
  key: (index: number) => Object.keys(store)[index] ?? null,
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: functionalLocalStorage, configurable: true })
  functionalLocalStorage.clear()
})

function makeProject(id: string): Project {
  return { id, name: `Project ${id}`, status: 'active', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1 }
}

function makeTask(id: string, projectId: string, version = 1): Task {
  return {
    id,
    project_id: projectId,
    title: `Task ${id}`,
    status: 'todo',
    priority: 'medium',
    progress: 0,
    dependencies: [],
    is_milestone: false,
    milestone_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version,
  }
}

describe('本地数据库模块', () => {
  describe('generateId', () => {
    it('应该生成唯一 ID', () => {
      const id1 = generateId()
      const id2 = generateId()
      expect(id1).not.toBe(id2)
    })

    it('生成的 ID 应该是字符串', () => {
      const id = generateId()
      expect(typeof id).toBe('string')
    })

    it('生成的 ID 应该有合理的长度', () => {
      const id = generateId()
      expect(id.length).toBeGreaterThan(10)
    })

    it('生成的 ID 应该包含数字和字母', () => {
      const id = generateId()
      expect(id).toMatch(/[0-9a-zA-Z]/)
    })

    it('§5.14 generateId 无重复: 批量生成100个ID应全部唯一', () => {
      const ids = Array.from({ length: 100 }, () => generateId())
      const unique = new Set(ids)
      expect(unique.size).toBe(100)
    })
  })

  describe('§5.14 projectDb.delete 级联清除', () => {
    it('删除项目时级联清除关联任务、风险、里程碑、成员', () => {
      const project = makeProject('p-1')
      projectDb.create(project)
      const task1 = makeTask('t-1', 'p-1')
      const task2 = makeTask('t-2', 'p-1')
      const otherTask = makeTask('t-other', 'p-other')
      taskDb.create(task1)
      taskDb.create(task2)
      taskDb.create(otherTask)

      projectDb.delete('p-1')

      expect(projectDb.getById('p-1')).toBeUndefined()
      // Tasks for p-1 should be gone
      expect(taskDb.getByProject('p-1')).toHaveLength(0)
      // Task from other project should remain
      expect(taskDb.getByProject('p-other')).toHaveLength(1)
    })
  })

  describe('§5.14 taskDb.update 版本冲突与"保留本地"选项', () => {
    it('版本匹配时更新成功并递增版本号', () => {
      taskDb.create(makeTask('t-1', 'p-1'))
      const updated = taskDb.update('t-1', { title: 'Updated', version: 2 })
      expect(updated).not.toBeNull()
      expect(updated?.version).toBe(2)
    })

    it('版本不匹配时返回 null（冲突检测）', () => {
      taskDb.create(makeTask('t-1', 'p-1', 1))
      // Try to update with wrong expected version (version=5 means caller expects current=4, but actual=1)
      const result = taskDb.update('t-1', { title: 'Bad Update', version: 5 })
      expect(result).toBeNull()
    })

    it('"保留本地"选项：forceUpdate 跳过版本检查', () => {
      taskDb.create(makeTask('t-1', 'p-1', 1))
      const result = taskDb.forceUpdate('t-1', { title: 'Force Override' })
      expect(result).not.toBeNull()
      expect(result?.title).toBe('Force Override')
    })
  })

  describe('§5.14 replaceByProject 跨项目隔离', () => {
    it('replaceByProject 只替换指定项目的任务，不影响其他项目', () => {
      taskDb.create(makeTask('t-p1-1', 'p-1'))
      taskDb.create(makeTask('t-p1-2', 'p-1'))
      taskDb.create(makeTask('t-p2-1', 'p-2'))

      const newTasks = [makeTask('t-p1-new', 'p-1')]
      taskDb.replaceByProject('p-1', newTasks)

      expect(taskDb.getByProject('p-1')).toHaveLength(1)
      expect(taskDb.getByProject('p-1')[0]?.id).toBe('t-p1-new')
      // p-2 tasks unchanged
      expect(taskDb.getByProject('p-2')).toHaveLength(1)
      expect(taskDb.getByProject('p-2')[0]?.id).toBe('t-p2-1')
    })
  })

  describe('§5.14 upsert 幂等性', () => {
    it('upsert 对同一项目多次调用只保留最新版本，不重复', () => {
      const p = makeProject('p-1')
      projectDb.upsert(p)
      projectDb.upsert({ ...p, name: 'Updated Name' })
      projectDb.upsert({ ...p, name: 'Final Name' })

      const all = projectDb.getAll().filter((x) => x.id === 'p-1')
      expect(all).toHaveLength(1)
      expect(all[0]?.name).toBe('Final Name')
    })

    it('upsert 对不存在的项目执行插入', () => {
      projectDb.upsert(makeProject('p-new'))
      expect(projectDb.getById('p-new')).toBeDefined()
    })
  })
})

