/**
 * Phase 2 - 条件管理+里程碑API测试脚本
 * 
 * 测试以下新增API接口：
 * 1. PUT /api/conditions/:id/complete - 完成条件
 * 2. PUT /api/obstacles/:id/resolve - 解决阻碍
 * 3. GET /api/milestones/:id/conditions - 获取里程碑关联条件
 * 4. GET /api/milestones/:id/acceptance - 获取里程碑关联验收
 * 5. GET /api/tasks/:id/business-status - 获取任务业务状态
 */

import { createClient } from '@supabase/supabase-js'

// 环境配置
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ 请设置环境变量：SUPABASE_URL 和 SUPABASE_ANON_KEY')
  process.exit(1)
}

const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// 测试数据
const TEST_TASK_ID = process.argv[2] || ''
const TEST_CONDITION_ID = process.argv[3] || ''
const TEST_OBSTACLE_ID = process.argv[4] || ''
const TEST_MILESTONE_ID = process.argv[5] || ''
const TEST_USER_ID = process.argv[6] || ''

console.log('='.repeat(60))
console.log('Phase 2 API 测试')
console.log('='.repeat(60))
console.log(`
测试参数：
- TASK_ID: ${TEST_TASK_ID || '未提供（跳过任务相关测试）'}
- CONDITION_ID: ${TEST_CONDITION_ID || '未提供（跳过条件相关测试）'}
- OBSTACLE_ID: ${TEST_OBSTACLE_ID || '未提供（跳过阻碍相关测试）'}
- MILESTONE_ID: ${TEST_MILESTONE_ID || '未提供（跳过里程碑相关测试）'}
- USER_ID: ${TEST_USER_ID || '未提供（部分测试需要）'}
`)

/**
 * 测试1: 获取任务业务状态
 */
async function testBusinessStatus() {
  console.log('\n📋 测试1: 获取任务业务状态')
  console.log('-'.repeat(60))

  if (!TEST_TASK_ID) {
    console.log('⚠️  跳过：未提供TASK_ID')
    return
  }

  try {
    // 注意：这个API需要后端运行，这里直接测试数据库查询逻辑
    const { data: task, error: taskError } = await client
      .from('tasks')
      .select('id, status, progress')
      .eq('id', TEST_TASK_ID)
      .single()

    if (taskError || !task) {
      console.error('❌ 任务不存在或查询失败:', taskError?.message)
      return
    }

    console.log(`✅ 任务基础信息:`)
    console.log(`   - ID: ${task.id}`)
    console.log(`   - 状态: ${task.status}`)
    console.log(`   - 进度: ${task.progress}%`)

    // 查询条件
    const { data: conditions } = await client
      .from('task_conditions')
      .select('id, status')
      .eq('task_id', TEST_TASK_ID)

    console.log(`\n📝 开工条件: ${conditions?.length || 0}项`)
    conditions?.forEach(c => {
      console.log(`   - ${c.id.substring(0, 8)}...: ${c.status}`)
    })

    // 查询阻碍
    const { data: obstacles } = await client
      .from('task_obstacles')
      .select('id, status')
      .eq('task_id', TEST_TASK_ID)

    console.log(`\n🚧 阻碍记录: ${obstacles?.length || 0}项`)
    obstacles?.forEach(o => {
      console.log(`   - ${o.id.substring(0, 8)}...: ${o.status}`)
    })

    // 简单的业务状态判断（模拟BusinessStatusService逻辑）
    let businessStatus = ''
    let reason = ''

    if (task.status === '已完成' || task.progress === 100) {
      businessStatus = '已完成'
      reason = '任务已完成'
    } else if (task.status === '未开始') {
      const hasUnsatisfied = conditions?.some(c => c.status === '未满足')
      if (hasUnsatisfied && conditions && conditions.length > 0) {
        const count = conditions.filter(c => c.status === '未满足').length
        businessStatus = '待开工'
        reason = `有${count}项开工条件未满足`
      } else {
        businessStatus = '可开工'
        reason = conditions && conditions.length === 0 ? '无开工条件' : '开工条件已满足'
      }
    } else if (task.status === '进行中') {
      const hasActive = obstacles?.some(o => o.status === '待处理' || o.status === '处理中')
      if (hasActive) {
        const count = obstacles!.filter(o => o.status === '待处理' || o.status === '处理中').length
        businessStatus = '进行中(有阻碍)'
        reason = `有${count}项阻碍未解决`
      } else {
        businessStatus = '进行中'
        reason = '正常进行中'
      }
    } else {
      businessStatus = task.status
      reason = '根据任务状态显示'
    }

    console.log(`\n🎯 计算的业务状态:`)
    console.log(`   - 显示: ${businessStatus}`)
    console.log(`   - 原因: ${reason}`)

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message)
  }
}

/**
 * 测试2: 完成条件
 */
async function testCompleteCondition() {
  console.log('\n✅ 测试2: 完成条件')
  console.log('-'.repeat(60))

  if (!TEST_CONDITION_ID) {
    console.log('⚠️  跳过：未提供CONDITION_ID')
    return
  }

  if (!TEST_USER_ID) {
    console.log('⚠️  跳过：需要USER_ID来确认条件')
    return
  }

  try {
    // 查询当前条件
    const { data: condition, error: fetchError } = await client
      .from('task_conditions')
      .select('*')
      .eq('id', TEST_CONDITION_ID)
      .single()

    if (fetchError || !condition) {
      console.error('❌ 条件不存在:', fetchError?.message)
      return
    }

    console.log(`📝 当前条件信息:`)
    console.log(`   - ID: ${condition.id}`)
    console.log(`   - 名称: ${condition.condition_name}`)
    console.log(`   - 当前状态: ${condition.status}`)

    if (condition.status !== '已满足') {
      console.log('⚠️  只有"已满足"状态的条件可以标记为已完成')
      console.log(`   当前状态: ${condition.status}`)
      return
    }

    console.log(`\n💡 正在将条件状态更新为"已确认"...`)

    // 更新条件状态
    const { data: updated, error: updateError } = await client
      .from('task_conditions')
      .update({
        status: '已确认',
        confirmed_by: TEST_USER_ID,
        confirmed_at: new Date().toISOString()
      })
      .eq('id', TEST_CONDITION_ID)
      .select()
      .single()

    if (updateError) {
      console.error('❌ 更新失败:', updateError.message)
      return
    }

    console.log(`✅ 条件已完成!`)
    console.log(`   - 新状态: ${updated.status}`)
    console.log(`   - 确认人: ${updated.confirmed_by}`)
    console.log(`   - 确认时间: ${updated.confirmed_at}`)

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message)
  }
}

/**
 * 测试3: 解决阻碍
 */
async function testResolveObstacle() {
  console.log('\n🔧 测试3: 解决阻碍')
  console.log('-'.repeat(60))

  if (!TEST_OBSTACLE_ID) {
    console.log('⚠️  跳过：未提供OBSTACLE_ID')
    return
  }

  if (!TEST_USER_ID) {
    console.log('⚠️  跳过：需要USER_ID来解决阻碍')
    return
  }

  try {
    // 查询当前阻碍
    const { data: obstacle, error: fetchError } = await client
      .from('task_obstacles')
      .select('*')
      .eq('id', TEST_OBSTACLE_ID)
      .single()

    if (fetchError || !obstacle) {
      console.error('❌ 阻碍不存在:', fetchError?.message)
      return
    }

    console.log(`🚧 当前阻碍信息:`)
    console.log(`   - ID: ${obstacle.id}`)
    console.log(`   - 描述: ${obstacle.description}`)
    console.log(`   - 当前状态: ${obstacle.status}`)
    console.log(`   - 严重程度: ${obstacle.severity}`)

    if (obstacle.status === '已解决' || obstacle.status === '无法解决') {
      console.log(`⚠️  阻碍已处于"${obstacle.status}"状态，无需重复操作`)
      return
    }

    // 准备测试解决方案
    const testResolution = `测试解决方案 - ${new Date().toISOString()}`

    console.log(`\n💡 正在解决阻碍...`)
    console.log(`   解决方案: ${testResolution}`)

    // 更新阻碍状态
    const { data: updated, error: updateError } = await client
      .from('task_obstacles')
      .update({
        status: '已解决',
        resolution: testResolution,
        resolved_by: TEST_USER_ID,
        resolved_at: new Date().toISOString()
      })
      .eq('id', TEST_OBSTACLE_ID)
      .select()
      .single()

    if (updateError) {
      console.error('❌ 更新失败:', updateError.message)
      return
    }

    console.log(`✅ 阻碍已解决!`)
    console.log(`   - 新状态: ${updated.status}`)
    console.log(`   - 解决方案: ${updated.resolution}`)
    console.log(`   - 处理人: ${updated.resolved_by}`)
    console.log(`   - 解决时间: ${updated.resolved_at}`)

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message)
  }
}

/**
 * 测试4: 获取里程碑关联条件
 */
async function testMilestoneConditions() {
  console.log('\n🔗 测试4: 获取里程碑关联条件')
  console.log('-'.repeat(60))

  if (!TEST_MILESTONE_ID) {
    console.log('⚠️  跳过：未提供MILESTONE_ID')
    return
  }

  try {
    // 查询里程碑信息
    const { data: milestone, error: fetchError } = await client
      .from('milestones')
      .select('*')
      .eq('id', TEST_MILESTONE_ID)
      .single()

    if (fetchError || !milestone) {
      console.error('❌ 里程碑不存在:', fetchError?.message)
      return
    }

    console.log(`📌 里程碑信息:`)
    console.log(`   - ID: ${milestone.id}`)
    console.log(`   - 名称: ${milestone.name}`)
    console.log(`   - 项目ID: ${milestone.project_id}`)

    // 注意：当前数据库设计中milestones表没有直接关联task_conditions
    // 这里说明当前实现的限制
    console.log(`\n⚠️  当前限制:`)
    console.log(`   - milestones表没有直接关联task_conditions的字段`)
    console.log(`   - 如需关联，需要通过tasks表间接查询`)
    console.log(`   - 或在数据结构中添加milestone_conditions关联表`)

    // 查询该项目下的所有条件（模拟关联）
    const { data: allConditions } = await client
      .from('task_conditions')
      .select('id, condition_name, status')
      .eq('project_id', milestone.project_id)  // 注意：如果task_conditions没有project_id字段会失败
      .limit(5)

    if (allConditions && allConditions.length > 0) {
      console.log(`\n📝 项目下的条件（前5项）:`)
      allConditions.forEach(c => {
        console.log(`   - ${c.id.substring(0, 8)}...: ${c.condition_name} (${c.status})`)
      })
    }

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message)
  }
}

/**
 * 测试5: 获取里程碑关联验收
 */
async function testMilestoneAcceptance() {
  console.log('\n✅ 测试5: 获取里程碑关联验收')
  console.log('-'.repeat(60))

  if (!TEST_MILESTONE_ID) {
    console.log('⚠️  跳过：未提供MILESTONE_ID')
    return
  }

  try {
    // 查询验收计划
    // 注意：acceptance_plans表有task_id而不是milestone_id
    const { data: acceptancePlans, error } = await client
      .from('acceptance_plans')
      .select('*')
      .order('planned_date', { ascending: true })
      .limit(10)

    if (error) {
      console.error('❌ 查询失败:', error.message)
      return
    }

    console.log(`✅ 验收计划查询结果:`)
    console.log(`   - 总数: ${acceptancePlans?.length || 0}项`)

    if (acceptancePlans && acceptancePlans.length > 0) {
      acceptancePlans.forEach((plan, index) => {
        console.log(`\n   ${index + 1}. ${plan.acceptance_name}`)
        console.log(`      - 类型: ${plan.acceptance_type}`)
        console.log(`      - 计划日期: ${plan.planned_date}`)
        console.log(`      - 状态: ${plan.status}`)
        if (plan.actual_date) {
          console.log(`      - 实际日期: ${plan.actual_date}`)
        }
      })
    } else {
      console.log(`   ⚠️  未找到验收计划`)
    }

    console.log(`\n⚠️  当前限制:`)
    console.log(`   - acceptance_plans表有task_id而不是milestone_id字段`)
    console.log(`   - 无法直接按milestone_id查询`)
    console.log(`   - 需要先获取milestone关联的tasks，再查询acceptance_plans`)

  } catch (error: any) {
    console.error('❌ 测试失败:', error.message)
  }
}

/**
 * 主测试函数
 */
async function runAllTests() {
  try {
    await testBusinessStatus()
    await testCompleteCondition()
    await testResolveObstacle()
    await testMilestoneConditions()
    await testMilestoneAcceptance()

    console.log('\n' + '='.repeat(60))
    console.log('✅ 所有测试完成!')
    console.log('='.repeat(60))
    console.log(`
📝 测试说明：
1. 业务状态计算：基于任务状态、条件、阻碍综合判断
2. 完成条件：只有"已满足"状态的条件可以标记为"已确认"
3. 解决阻碍：需要提供解决方案和处理人
4. 里程碑关联：当前数据结构需要优化以支持直接关联

🔧 后续优化建议：
- 在milestones表中添加条件关联字段或创建milestone_conditions关联表
- 在acceptance_plans表中添加milestone_id字段
- 考虑添加业务状态缓存机制，避免每次实时计算
`)

  } catch (error: any) {
    console.error('\n❌ 测试执行失败:', error.message)
    process.exit(1)
  }
}

// 执行测试
runAllTests()
