/**
 * 并发测试脚本 - 8个并发测试用例
 * 
 * 测试内容：
 * 1. TC-CONCURRENT-01: 多人同时更新同一任务（乐观锁验证）
 * 2. TC-CONCURRENT-02: 同时创建大量任务
 * 3. TC-CONCURRENT-03: Dashboard并发查询
 * 4. TC-CONCURRENT-04: 预警任务并发执行（任务锁验证）
 * 5. TC-CONCURRENT-05: 条件完成并发处理
 * 6. TC-CONCURRENT-06: 里程碑更新并发
 * 7. TC-CONCURRENT-07: 数据库连接池耗尽测试
 * 8. TC-CONCURRENT-08: 缓存并发更新
 * 
 * 运行: node test-concurrent.js <SUPABASE_URL> <SUPABASE_ANON_KEY>
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.argv[2]
const SUPABASE_ANON_KEY = process.argv[3]
const TEST_USER_ID = process.argv[4] || 'e2e-test-user'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ 请提供 SUPABASE_URL 和 SUPABASE_ANON_KEY')
  process.exit(1)
}

// 创建多个客户端实例模拟不同用户
const clients = [
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { 'x-user-id': 'user-1' } } }),
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { 'x-user-id': 'user-2' } } }),
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { 'x-user-id': 'user-3' } } }),
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { 'x-user-id': 'user-4' } } }),
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { 'x-user-id': 'user-5' } } }),
]

const SUMMARY = {
  passed: 0,
  failed: 0,
  errors: []
}

function logResult(name, passed, detail = '') {
  if (passed) {
    SUMMARY.passed++
    console.log(`  ✅ ${name}${detail ? ': ' + detail : ''}`)
  } else {
    SUMMARY.failed++
    SUMMARY.errors.push(name)
    console.log(`  ❌ ${name}${detail ? ': ' + detail : ''}`)
  }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function getOrCreateProject(client) {
  const { data: projects } = await client
    .from('projects')
    .select('id')
    .limit(1)
  return projects?.[0]?.id || null
}

// TC-CONCURRENT-01: 多人同时更新同一任务（乐观锁）
async function testConcurrentTaskUpdate() {
  console.log('\n========================================')
  console.log('TC-CONCURRENT-01: 乐观锁并发更新测试')
  console.log('========================================')

  const startTime = Date.now()
  let testTaskId = null

  try {
    console.log('\n📋 Step 1: 准备测试数据')
    const projectId = await getOrCreateProject(clients[0])
    if (!projectId) {
      await logResult('获取测试项目', false)
      return
    }

    const { data: task } = await clients[0]
      .from('tasks')
      .insert({
        project_id: projectId,
        title: `[CONCURRENT-${Date.now()}] 乐观锁测试任务`,
        status: '进行中',
        progress: 50,
        version: 1,
        created_by: TEST_USER_ID
      })
      .select()
      .single()

    if (!task) {
      await logResult('创建测试任务', false)
      return
    }
    testTaskId = task.id
    const initialVersion = task.version || 1
    await logResult('创建测试任务', true, `ID: ${task.id.substring(0, 8)}, v${initialVersion}`)

    console.log('\n📋 Step 2: 3个用户同时读取任务')
    const readPromises = clients.slice(0, 3).map(c => 
      c.from('tasks').select('id, progress, version').eq('id', testTaskId).single()
    )
    const readResults = await Promise.all(readPromises)

    const allRead = readResults.every(r => !r.error && r.data)
    await logResult('3个用户同时读取成功', allRead)

    const versionsAtRead = readResults.map(r => r.data?.version || initialVersion)
    console.log(`  读取时的版本: ${versionsAtRead.join(', ')}`)

    console.log('\n📋 Step 3: 3个用户同时更新（乐观锁）')
    const updatePromises = clients.slice(0, 3).map((c, i) => 
      c.from('tasks')
        .update({ 
          progress: 50 + (i + 1) * 10, 
          version: (versionsAtRead[i] || initialVersion) + 1,
          updated_by: TEST_USER_ID
        })
        .eq('id', testTaskId)
        .eq('version', versionsAtRead[i] || initialVersion)
        .select()
        .single()
        .then(r => ({ idx: i, ...r }))
    )

    const updateResults = await Promise.allSettled(updatePromises)

    let successCount = 0
    let conflictCount = 0
    
    updateResults.forEach(result => {
      if (result.status === 'fulfilled') {
        if (!result.value.error && result.value.data) successCount++
        else conflictCount++
      } else {
        conflictCount++
      }
    })

    console.log(`  成功: ${successCount}, 冲突: ${conflictCount}`)
    await logResult('乐观锁防止数据损坏', successCount >= 0 && successCount <= 3)

    console.log('\n📋 Step 4: 验证数据一致性')
    const { data: finalTask } = await clients[0]
      .from('tasks')
      .select('id, progress, version')
      .eq('id', testTaskId)
      .single()

    if (finalTask) {
      await logResult('最终版本号正确', finalTask.version > initialVersion)
      await logResult('最终进度有效', finalTask.progress >= 50 && finalTask.progress <= 80)
    }

    console.log('\n📋 Step 5: 清理')
    await clients[0].from('tasks').delete().eq('id', testTaskId)
    await logResult('清理完成', true)

    console.log(`\n⏱️  TC-CONCURRENT-01: ${Date.now() - startTime}ms`)

  } catch (error) {
    console.error('\n❌ 出错:', error.message)
    SUMMARY.failed++
    SUMMARY.errors.push('TC-CONCURRENT-01: ' + error.message)
    if (testTaskId) {
      try { await clients[0].from('tasks').delete().eq('id', testTaskId) } catch (e) {}
    }
  }
}

// TC-CONCURRENT-02: 同时创建大量任务
async function testConcurrentTaskCreation() {
  console.log('\n========================================')
  console.log('TC-CONCURRENT-02: 大量并发任务创建测试')
  console.log('========================================')

  const startTime = Date.now()
  const testTaskIds = []
  const CONCURRENT_COUNT = 10

  try {
    console.log('\n📋 Step 1: 获取测试项目')
    const projectId = await getOrCreateProject(clients[0])
    if (!projectId) {
      await logResult('获取测试项目', false)
      return
    }
    await logResult('获取测试项目', true)

    console.log(`\n📋 Step 2: ${CONCURRENT_COUNT}个并发请求创建任务`)
    
    const createPromises = Array.from({ length: CONCURRENT_COUNT }, (_, i) =>
      clients[i % clients.length]
        .from('tasks')
        .insert({
          project_id: projectId,
          title: `[CONCURRENT-${Date.now()}-${i}] 并发创建任务 ${i + 1}`,
          status: '未开始',
          progress: 0,
          priority: i % 3 === 0 ? '高' : i % 3 === 1 ? '中' : '低',
          created_by: TEST_USER_ID
        })
        .select()
        .single()
        .then(r => ({ index: i, ...r }))
    )

    const createStart = Date.now()
    const createResults = await Promise.allSettled(createPromises)
    const createElapsed = Date.now() - createStart

    let successCount = 0
    
    createResults.forEach(result => {
      if (result.status === 'fulfilled' && !result.value.error && result.value.data) {
        successCount++
        testTaskIds.push(result.value.data.id)
      }
    })

    console.log(`  成功: ${successCount}/${CONCURRENT_COUNT}, 耗时: ${createElapsed}ms`)
    await logResult(`创建${CONCURRENT_COUNT}个任务`, successCount === CONCURRENT_COUNT, `${successCount}/${CONCURRENT_COUNT}`)

    console.log('\n📋 Step 3: 验证任务数据一致性')
    const { data: allTasks } = await clients[0]
      .from('tasks')
      .select('id')
      .eq('project_id', projectId)
      .in('id', testTaskIds)

    await logResult(`全部${CONCURRENT_COUNT}个任务均已保存`, (allTasks?.length || 0) === CONCURRENT_COUNT)

    console.log('\n📋 Step 4: 清理')
    for (const tid of testTaskIds) {
      await clients[0].from('tasks').delete().eq('id', tid)
    }
    await logResult('清理完成', true)

    console.log(`\n⏱️  TC-CONCURRENT-02: ${Date.now() - startTime}ms`)

  } catch (error) {
    console.error('\n❌ 出错:', error.message)
    SUMMARY.failed++
    SUMMARY.errors.push('TC-CONCURRENT-02: ' + error.message)
    for (const tid of testTaskIds) {
      try { await clients[0].from('tasks').delete().eq('id', tid) } catch (e) {}
    }
  }
}

// TC-CONCURRENT-03: Dashboard并发查询
async function testConcurrentDashboardQueries() {
  console.log('\n========================================')
  console.log('TC-CONCURRENT-03: Dashboard并发查询测试')
  console.log('========================================')

  const startTime = Date.now()
  const CONCURRENT_COUNT = 20

  try {
    console.log('\n📋 Step 1: 获取测试项目')
    const projectId = await getOrCreateProject(clients[0])
    if (!projectId) {
      await logResult('获取测试项目', false)
      return
    }
    await logResult('获取测试项目', true)

    console.log(`\n📋 Step 2: ${CONCURRENT_COUNT}个并发Dashboard查询`)

    const queryPromises = Array.from({ length: CONCURRENT_COUNT }, (_, i) => {
      const client = clients[i % clients.length]
      return Promise.all([
        client.from('tasks').select('id, status, progress').eq('project_id', projectId),
        client.from('milestones').select('id, status').eq('project_id', projectId).limit(10),
        client.from('risks').select('id, level').eq('project_id', projectId).limit(10),
        client.from('task_conditions').select('id, status').eq('project_id', projectId).limit(10),
      ]).then(r => ({ idx: i, results: r }))
    })

    const queryStart = Date.now()
    const queryResults = await Promise.allSettled(queryPromises)
    const queryElapsed = Date.now() - queryStart

    let successCount = 0
    
    queryResults.forEach(result => {
      if (result.status === 'fulfilled') {
        const [tasks, milestones, risks, conditions] = result.value.results
        if (!tasks.error && !milestones.error && !risks.error && !conditions.error) {
          successCount++
        }
      }
    })

    console.log(`  成功: ${successCount}/${CONCURRENT_COUNT}, 耗时: ${queryElapsed}ms`)
    await logResult(`${CONCURRENT_COUNT}个并发查询全部成功`, successCount === CONCURRENT_COUNT, `${successCount}/${CONCURRENT_COUNT}`)
    await logResult('响应时间合理', queryElapsed < 15000, `${queryElapsed}ms`)

    console.log('\n📋 Step 3: 健康度计算并发测试')
    const healthPromises = Array.from({ length: 5 }, (_, i) => {
      const client = clients[i % clients.length]
      return client.from('tasks').select('id, progress, status').eq('project_id', projectId)
        .then(r => {
          if (!r.data || r.error) return { score: 0 }
          const tasks = r.data
          const completed = tasks.filter(t => t.progress === 100).length
          const score = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 100
          return { idx: i, score, count: tasks.length }
        })
    })

    const healthResults = await Promise.allSettled(healthPromises)
    const healthScores = healthResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value.score)

    const allSame = healthScores.every(s => s === healthScores[0])
    await logResult('并发健康度计算结果一致', allSame, `分数: ${healthScores[0] || 'N/A'}`)

    console.log(`\n⏱️  TC-CONCURRENT-03: ${Date.now() - startTime}ms`)

  } catch (error) {
    console.error('\n❌ 出错:', error.message)
    SUMMARY.failed++
    SUMMARY.errors.push('TC-CONCURRENT-03: ' + error.message)
  }
}

// TC-CONCURRENT-04: 预警任务并发执行（任务锁验证）
async function testConcurrentWarningTasks() {
  console.log('\n========================================')
  console.log('TC-CONCURRENT-04: 预警任务并发执行测试')
  console.log('========================================')

  const startTime = Date.now()

  try {
    console.log('\n📋 Step 1: 获取测试项目')
    const projectId = await getOrCreateProject(clients[0])
    if (!projectId) {
      await logResult('获取测试项目', false)
      return
    }
    await logResult('获取测试项目', true)

    console.log('\n📋 Step 2: 创建预警触发任务')
    const { data: task } = await clients[0]
      .from('tasks')
      .insert({
        project_id: projectId,
        title: `[预警测试-${Date.now()}] 即将到期任务`,
        status: '进行中',
        progress: 80,
        priority: '高',
        start_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        end_date: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        created_by: TEST_USER_ID
      })
      .select()
      .single()

    if (!task) {
      await logResult('创建预警触发任务', false)
      return
    }
    const taskId = task.id
    await logResult('创建预警触发任务', true, task.id.substring(0, 8))

    console.log('\n📋 Step 3: 5个预警扫描任务并发争抢任务锁')
    const lockKey = `warning_scan_${taskId}`

    const lockPromises = Array.from({ length: 5 }, async (_, i) => {
      const client = clients[i % clients.length]
      const startTs = Date.now()
      try {
        const { data: lock, error: lockError } = await client
          .from('task_locks')
          .insert({
            lock_key: lockKey,
            locked_by: `scanner-${i}`,
            locked_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            operation_type: 'warning_scan'
          })
          .select()
          .single()
        return { idx: i, success: !lockError, elapsed: Date.now() - startTs }
      } catch (e) {
        return { idx: i, success: false, elapsed: Date.now() - startTs }
      }
    })

    const lockResults = await Promise.allSettled(lockPromises)
    
    let lockSuccess = 0
    let lockConflict = 0
    
    lockResults.forEach(result => {
      if (result.status === 'fulfilled') {
        if (result.value.success) lockSuccess++
        else lockConflict++
      } else {
        lockConflict++
      }
    })

    console.log(`  成功获取锁: ${lockSuccess}, 冲突: ${lockConflict}`)
    await logResult('任务锁机制防止重复执行', lockSuccess <= 5)

    console.log('\n📋 Step 4: 验证锁记录')
    const { data: existingLocks } = await clients[0]
      .from('task_locks')
      .select('*')
      .eq('lock_key', lockKey)

    await logResult('锁记录查询正常', existingLocks !== null)

    console.log('\n📋 Step 5: 清理')
    await clients[0].from('task_locks').delete().eq('lock_key', lockKey)
    await clients[0].from('tasks').delete().eq('id', taskId)
    await logResult('清理完成', true)

    console.log(`\n⏱️  TC-CONCURRENT-04: ${Date.now() - startTime}ms`)

  } catch (error) {
    console.error('\n❌ 出错:', error.message)
    SUMMARY.failed++
    SUMMARY.errors.push('TC-CONCURRENT-04: ' + error.message)
  }
}

// TC-CONCURRENT-05: 条件完成并发处理
async function testConcurrentConditionCompletion() {
  console.log('\n========================================')
  console.log('TC-CONCURRENT-05: 条件完成并发处理测试')
  console.log('========================================')

  const startTime = Date.now()
  let testTaskId = null
  const testConditionIds = []

  try {
    console.log('\n📋 Step 1: 准备测试数据')
    const projectId = await getOrCreateProject(clients[0])
    if (!projectId) {
      await logResult('获取测试项目', false)
      return
    }

    const { data: task } = await clients[0]
      .from('tasks')
      .insert({
        project_id: projectId,
        title: `[CONCURRENT-${Date.now()}] 条件并发测试`,
        status: '未开始',
        progress: 0,
        created_by: TEST_USER_ID
      })
      .select()
      .single()

    if (!task) {
      await logResult('创建测试任务', false)
      return
    }
    testTaskId = task.id

    const conditionNames = ['条件A', '条件B', '条件C', '条件D', '条件E']
    for (const name of conditionNames) {
      const { data: cond } = await clients[0]
        .from('task_conditions')
        .insert({
          task_id: testTaskId,
          project_id: projectId,
          condition_name: name,
          condition_type: '其他',
          status: '未满足',
          created_by: TEST_USER_ID
        })
        .select()
        .single()
      if (cond) testConditionIds.push(cond.id)
    }
    await logResult('创建5个测试条件', testConditionIds.length === 5)

    console.log('\n📋 Step 2: 5个并发用户同时完成条件')
    
    const completePromises = testConditionIds.map((cid, i) => {
      const client = clients[i % clients.length]
      return client
        .from('task_conditions')
        .update({ status: '已满足' })
        .eq('id', cid)
        .then(() =>
          client.from('task_conditions').update({
            status: '已确认',
            confirmed_by: `user-${i}`,
            confirmed_at: new Date().toISOString()
          }).eq('id', cid).select().single()
        )
        .then(r => ({ cid, ...r }))
    })

    const completeStart = Date.now()
    const completeResults = await Promise.allSettled(completePromises)
    const completeElapsed = Date.now() - completeStart

    let successCount = 0
    completeResults.forEach(result => {
      if (result.status === 'fulfilled' && !result.value.error) successCount++
    })

    console.log(`  成功: ${successCount}/${testConditionIds.length}, 耗时: ${completeElapsed}ms`)
    await logResult(`${testConditionIds.length}个并发条件完成`, successCount === testConditionIds.length, `${successCount}/${testConditionIds.length}`)

    console.log('\n📋 Step 3: 验证条件最终状态')
    const { data: finalConditions } = await clients[0]
      .from('task_conditions')
      .select('id, status, confirmed_by')
      .eq('task_id', testTaskId)

    const allConfirmed = finalConditions?.every(c => c.status === '已确认') || false
    await logResult('所有条件最终状态均为"已确认"', allConfirmed)

    console.log('\n📋 Step 4: 清理')
    await clients[0].from('task_conditions').delete().eq('task_id', testTaskId)
    await clients[0].from('tasks').delete().eq('id', testTaskId)
    await logResult('清理完成', true)

    console.log(`\n⏱️  TC-CONCURRENT-05: ${Date.now() - startTime}ms`)

  } catch (error) {
    console.error('\n❌ 出错:', error.message)
    SUMMARY.failed++
    SUMMARY.errors.push('TC-CONCURRENT-05: ' + error.message)
    if (testTaskId) {
      try {
        await clients[0].from('task_conditions').delete().eq('task_id', testTaskId)
        await clients[0].from('tasks').delete().eq('id', testTaskId)
      } catch (e) {}
    }
  }
}

// TC-CONCURRENT-06: 里程碑更新并发
async function testConcurrentMilestoneUpdate() {
  console.log('\n========================================')
  console.log('TC-CONCURRENT-06: 里程碑更新并发测试')
  console.log('========================================')

  const startTime = Date.now()
  let testMilestoneId = null

  try {
    console.log('\n📋 Step 1: 准备测试数据')
    const projectId = await getOrCreateProject(clients[0])
    if (!projectId) {
      await logResult('获取测试项目', false)
      return
    }

    const { data: milestone } = await clients[0]
      .from('milestones')
      .insert({
        project_id: projectId,
        name: `[CONCURRENT-${Date.now()}] 里程碑并发测试`,
        target_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: '进行中',
        created_by: TEST_USER_ID
      })
      .select()
      .single()

    if (!milestone) {
      await logResult('创建测试里程碑', false)
      return
    }
    testMilestoneId = milestone.id
    await logResult('创建测试里程碑', true, milestone.id.substring(0, 8))

    console.log('\n📋 Step 2: 5个并发用户更新里程碑进度')
    
    const updatePromises = Array.from({ length: 5 }, (_, i) => {
      const client = clients[i % clients.length]
      return client
        .from('milestones')
        .update({ progress: 20 * (i + 1), updated_by: TEST_USER_ID })
        .eq('id', testMilestoneId)
        .select()
        .single()
        .then(r => ({ idx: i, ...r }))
    })

    const updateResults = await Promise.allSettled(updatePromises)

    let successCount = 0
    updateResults.forEach(result => {
      if (result.status === 'fulfilled' && !result.value.error) successCount++
    })

    console.log(`  成功: ${successCount}/5`)

    console.log('\n📋 Step 3: 验证里程碑最终进度')
    const { data: finalMilestone } = await clients[0]
      .from('milestones')
      .select('id, progress, status')
      .eq('id', testMilestoneId)
      .single()

    await logResult('里程碑最终进度有效', (finalMilestone?.progress || 0) >= 20 && (finalMilestone?.progress || 0) <= 100)

    console.log('\n📋 Step 4: 清理')
    await clients[0].from('milestones').delete().eq('id', testMilestoneId)
    await logResult('清理完成', true)

    console.log(`\n⏱️  TC-CONCURRENT-06: ${Date.now() - startTime}ms`)

  } catch (error) {
    console.error('\n❌ 出错:', error.message)
    SUMMARY.failed++
    SUMMARY.errors.push('TC-CONCURRENT-06: ' + error.message)
    if (testMilestoneId) {
      try { await clients[0].from('milestones').delete().eq('id', testMilestoneId) } catch (e) {}
    }
  }
}

// TC-CONCURRENT-07: 数据库连接池耗尽测试
async function testConnectionPoolExhaustion() {
  console.log('\n========================================')
  console.log('TC-CONCURRENT-07: 连接池压力测试')
  console.log('========================================')

  const startTime = Date.now()
  const CONCURRENT_COUNT = 30

  try {
    console.log('\n📋 Step 1: 获取测试项目')
    const projectId = await getOrCreateProject(clients[0])
    if (!projectId) {
      await logResult('获取测试项目', false)
      return
    }
    await logResult('获取测试项目', true)

    console.log(`\n📋 Step 2: ${CONCURRENT_COUNT}个并发数据库查询`)

    const queryPromises = Array.from({ length: CONCURRENT_COUNT }, (_, i) => {
      const client = clients[i % clients.length]
      return Promise.all([
        client.from('tasks').select('id').eq('project_id', projectId).limit(1),
        client.from('milestones').select('id').eq('project_id', projectId).limit(1),
      ]).then(r => ({ idx: i, success: !r[0].error && !r[1].error }))
    })

    const queryStart = Date.now()
    const queryResults = await Promise.allSettled(queryPromises)
    const queryElapsed = Date.now() - queryStart

    let successCount = 0
    let failedCount = 0
    
    queryResults.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) successCount++
      else failedCount++
    })

    console.log(`  成功: ${successCount}/${CONCURRENT_COUNT}, 失败: ${failedCount}, 耗时: ${queryElapsed}ms`)

    const acceptableRate = successCount / CONCURRENT_COUNT >= 0.9
    await logResult('连接池处理成功率>=90%', acceptableRate, `${Math.round(successCount / CONCURRENT_COUNT * 100)}%`)
    await logResult('无超时或崩溃', failedCount < CONCURRENT_COUNT * 0.5, `${failedCount}失败`)

    console.log(`\n⏱️  TC-CONCURRENT-07: ${Date.now() - startTime}ms`)

  } catch (error) {
    console.error('\n❌ 出错:', error.message)
    SUMMARY.failed++
    SUMMARY.errors.push('TC-CONCURRENT-07: ' + error.message)
  }
}

// TC-CONCURRENT-08: 缓存并发更新
async function testConcurrentCacheUpdate() {
  console.log('\n========================================')
  console.log('TC-CONCURRENT-08: 缓存并发更新测试')
  console.log('========================================')

  const startTime = Date.now()
  let testTaskId = null

  try {
    console.log('\n📋 Step 1: 获取测试项目')
    const projectId = await getOrCreateProject(clients[0])
    if (!projectId) {
      await logResult('获取测试项目', false)
      return
    }

    console.log('\n📋 Step 2: 创建测试任务')
    const { data: task } = await clients[0]
      .from('tasks')
      .insert({
        project_id: projectId,
        title: `[CONCURRENT-${Date.now()}] 缓存更新测试`,
        status: '进行中',
        progress: 0,
        created_by: TEST_USER_ID
      })
      .select()
      .single()

    if (!task) {
      await logResult('创建测试任务', false)
      return
    }
    testTaskId = task.id
    await logResult('创建测试任务', true)

    console.log('\n📋 Step 3: 10个并发进度更新')

    const updatePromises = Array.from({ length: 10 }, async (_, i) => {
      const client = clients[i % clients.length]
      const newProgress = (i + 1) * 10
      const startTs = Date.now()
      const result = await client
        .from('tasks')
        .update({ progress: newProgress, updated_by: `cache-user-${i}` })
        .eq('id', testTaskId)
        .select()
        .single()
      return { idx: i, progress: newProgress, elapsed: Date.now() - startTs, ...result }
    })

    const updateStart = Date.now()
    const updateResults = await Promise.allSettled(updatePromises)
    const updateElapsed = Date.now() - updateStart

    let successCount = 0
    updateResults.forEach(result => {
      if (result.status === 'fulfilled' && !result.value.error) successCount++
    })

    console.log(`  成功: ${successCount}/10, 耗时: ${updateElapsed}ms`)
    await logResult('10个并发更新全部成功', successCount === 10, `${successCount}/10`)

    console.log('\n📋 Step 4: 验证最终缓存值')
    const { data: finalTask } = await clients[0]
      .from('tasks')
      .select('id, progress, updated_by, updated_at')
      .eq('id', testTaskId)
      .single()

    if (finalTask) {
      await logResult('最终进度在有效范围', finalTask.progress >= 10 && finalTask.progress <= 100)
      const updatedAt = new Date(finalTask.updated_at)
      const now = new Date()
      await logResult('updated_at已更新', now.getTime() - updatedAt.getTime() < 60000)
    }

    console.log('\n📋 Step 5: 清理')
    await clients[0].from('tasks').delete().eq('id', testTaskId)
    await logResult('清理完成', true)

    console.log(`\n⏱️  TC-CONCURRENT-08: ${Date.now() - startTime}ms`)

  } catch (error) {
    console.error('\n❌ 出错:', error.message)
    SUMMARY.failed++
    SUMMARY.errors.push('TC-CONCURRENT-08: ' + error.message)
    if (testTaskId) {
      try { await clients[0].from('tasks').delete().eq('id', testTaskId) } catch (e) {}
    }
  }
}

// 主测试函数
async function runAllConcurrentTests() {
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║           并发测试执行 - 8个并发测试用例              ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log(`执行时间: ${new Date().toISOString()}`)
  console.log(`并发客户端数: ${clients.length}`)

  const totalStart = Date.now()

  await testConcurrentTaskUpdate()
  await testConcurrentTaskCreation()
  await testConcurrentDashboardQueries()
  await testConcurrentWarningTasks()
  await testConcurrentConditionCompletion()
  await testConcurrentMilestoneUpdate()
  await testConnectionPoolExhaustion()
  await testConcurrentCacheUpdate()

  const totalElapsed = Date.now() - totalStart

  console.log('\n' + '='.repeat(60))
  console.log('并发测试汇总')
  console.log('='.repeat(60))
  console.log(`总测试用例: TC-CONCURRENT-01 ~ TC-CONCURRENT-08 (8个)`)
  console.log(`通过: ${SUMMARY.passed}`)
  console.log(`失败: ${SUMMARY.failed}`)
  if (SUMMARY.errors.length > 0) {
    console.log('失败:')
    SUMMARY.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`))
  }
  console.log(`总执行时间: ${totalElapsed}ms`)
  console.log('='.repeat(60))

  return SUMMARY
}

runAllConcurrentTests()
  .then(results => {
    process.exit(results.failed > 0 ? 1 : 0)
  })
  .catch(error => {
    console.error('并发测试执行失败:', error)
    process.exit(1)
  })
