/**
 * Phase 3.6 触发器修复验证测试
 * 测试内容:
 * 1. P0-001: 验证触发器使用正确的字段名 (end_date 而非 planned_end_date)
 * 2. P0-002: 验证触发器使用正确的字段名 (title 而非 name)
 * 3. 验证触发器在任务进度达到100%时正确生成报告
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('错误: 缺少 Supabase 环境变量')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// 测试配置
const TEST_PROJECT_ID = '00000000-0000-0000-0000-000000000001'
const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'

interface TestResult {
  name: string
  passed: boolean
  message: string
  details?: any
}

const testResults: TestResult[] = []

// 辅助函数：延迟
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// 辅助函数：清理测试数据
async function cleanupTestData(taskId: string) {
  console.log(`  清理测试数据: ${taskId}`)
  await supabase.from('task_completion_reports').delete().eq('task_id', taskId)
  await supabase.from('tasks').delete().eq('id', taskId)
}

// 测试 1: 验证触发器字段引用正确
async function testTriggerFieldReferences(): Promise<TestResult> {
  console.log('\n📋 测试 1: 验证触发器字段引用正确')
  
  try {
    // 创建测试任务
    const testTask = {
      project_id: TEST_PROJECT_ID,
      title: '触发器字段测试任务',
      description: '测试触发器字段引用修复',
      status: 'in_progress',
      progress: 50,
      start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7天前
      end_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],   // 3天后
      created_at: new Date().toISOString()
    }
    
    const { data: task, error: createError } = await supabase
      .from('tasks')
      .insert(testTask)
      .select()
      .single()
    
    if (createError || !task) {
      return {
        name: '触发器字段引用测试',
        passed: false,
        message: `创建测试任务失败: ${createError?.message}`,
        details: createError
      }
    }
    
    console.log(`  创建测试任务: ${task.id}`)
    
    // 更新任务进度到100%，触发触发器
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ progress: 100, status: 'completed' })
      .eq('id', task.id)
    
    if (updateError) {
      await cleanupTestData(task.id)
      return {
        name: '触发器字段引用测试',
        passed: false,
        message: `更新任务进度失败: ${updateError.message}`,
        details: updateError
      }
    }
    
    console.log('  任务进度更新为 100%，等待触发器执行...')
    await delay(1000) // 等待触发器执行
    
    // 检查是否生成了报告
    const { data: report, error: reportError } = await supabase
      .from('task_completion_reports')
      .select('*')
      .eq('task_id', task.id)
      .single()
    
    if (reportError || !report) {
      await cleanupTestData(task.id)
      return {
        name: '触发器字段引用测试',
        passed: false,
        message: `未找到生成的报告: ${reportError?.message}`,
        details: reportError
      }
    }
    
    console.log(`  找到生成的报告: ${report.id}`)
    
    // 验证报告内容
    const checks = [
      { name: '报告标题包含任务标题', pass: report.title.includes('触发器字段测试任务') },
      { name: '计划工期计算正确', pass: report.planned_duration === 10 }, // 7天前到3天后 = 10天
      { name: '实际工期已计算', pass: report.actual_duration >= 7 },
      { name: '效率比为NULL(由服务层计算)', pass: report.efficiency_ratio === null },
      { name: '任务ID关联正确', pass: report.task_id === task.id }
    ]
    
    const failedChecks = checks.filter(c => !c.pass)
    
    // 清理
    await cleanupTestData(task.id)
    
    if (failedChecks.length > 0) {
      return {
        name: '触发器字段引用测试',
        passed: false,
        message: `部分检查失败: ${failedChecks.map(c => c.name).join(', ')}`,
        details: { checks, report }
      }
    }
    
    return {
      name: '触发器字段引用测试',
      passed: true,
      message: '触发器字段引用正确，报告生成成功',
      details: { checks, report }
    }
    
  } catch (error: any) {
    return {
      name: '触发器字段引用测试',
      passed: false,
      message: `测试异常: ${error.message}`,
      details: error
    }
  }
}

// 测试 2: 验证标题字段使用正确 (P0-002)
async function testTitleFieldReference(): Promise<TestResult> {
  console.log('\n📋 测试 2: 验证标题字段使用正确 (P0-002: name -> title)')
  
  try {
    // 创建带特殊标题的测试任务
    const testTask = {
      project_id: TEST_PROJECT_ID,
      title: 'P0-002修复验证任务',
      description: '测试title字段引用',
      status: 'in_progress',
      progress: 90,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      created_at: new Date().toISOString()
    }
    
    const { data: task, error: createError } = await supabase
      .from('tasks')
      .insert(testTask)
      .select()
      .single()
    
    if (createError || !task) {
      return {
        name: '标题字段引用测试',
        passed: false,
        message: `创建测试任务失败: ${createError?.message}`
      }
    }
    
    console.log(`  创建测试任务: ${task.id}`)
    
    // 更新到100%
    await supabase
      .from('tasks')
      .update({ progress: 100, status: 'completed' })
      .eq('id', task.id)
    
    await delay(1000)
    
    // 检查报告标题
    const { data: report } = await supabase
      .from('task_completion_reports')
      .select('title')
      .eq('task_id', task.id)
      .single()
    
    await cleanupTestData(task.id)
    
    if (!report) {
      return {
        name: '标题字段引用测试',
        passed: false,
        message: '未生成报告'
      }
    }
    
    const expectedTitle = 'P0-002修复验证任务 完成总结'
    const titleCorrect = report.title === expectedTitle
    
    return {
      name: '标题字段引用测试',
      passed: titleCorrect,
      message: titleCorrect 
        ? `报告标题正确: "${report.title}"`
        : `报告标题错误: 期望 "${expectedTitle}", 实际 "${report.title}"`,
      details: { expected: expectedTitle, actual: report.title }
    }
    
  } catch (error: any) {
    return {
      name: '标题字段引用测试',
      passed: false,
      message: `测试异常: ${error.message}`
    }
  }
}

// 测试 3: 验证日期字段使用正确 (P0-001)
async function testDateFieldReference(): Promise<TestResult> {
  console.log('\n📋 测试 3: 验证日期字段使用正确 (P0-001: planned_end_date -> end_date)')
  
  try {
    const startDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    const endDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    
    const testTask = {
      project_id: TEST_PROJECT_ID,
      title: 'P0-001日期字段测试',
      status: 'in_progress',
      progress: 95,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
      created_at: new Date().toISOString()
    }
    
    const { data: task, error: createError } = await supabase
      .from('tasks')
      .insert(testTask)
      .select()
      .single()
    
    if (createError || !task) {
      return {
        name: '日期字段引用测试',
        passed: false,
        message: `创建测试任务失败: ${createError?.message}`
      }
    }
    
    console.log(`  创建测试任务: ${task.id}`)
    console.log(`  计划工期: ${startDate.toISOString().split('T')[0]} 到 ${endDate.toISOString().split('T')[0]} (10天)`)
    
    // 更新到100%
    await supabase
      .from('tasks')
      .update({ progress: 100, status: 'completed' })
      .eq('id', task.id)
    
    await delay(1000)
    
    // 检查计划工期
    const { data: report } = await supabase
      .from('task_completion_reports')
      .select('planned_duration, actual_duration')
      .eq('task_id', task.id)
      .single()
    
    await cleanupTestData(task.id)
    
    if (!report) {
      return {
        name: '日期字段引用测试',
        passed: false,
        message: '未生成报告'
      }
    }
    
    const expectedDuration = 10 // 5天前到5天后 = 10天
    const durationCorrect = report.planned_duration === expectedDuration
    
    return {
      name: '日期字段引用测试',
      passed: durationCorrect,
      message: durationCorrect
        ? `计划工期计算正确: ${report.planned_duration} 天`
        : `计划工期计算错误: 期望 ${expectedDuration} 天, 实际 ${report.planned_duration} 天`,
      details: { 
        expected: expectedDuration, 
        actual: report.planned_duration,
        actual_duration: report.actual_duration
      }
    }
    
  } catch (error: any) {
    return {
      name: '日期字段引用测试',
      passed: false,
      message: `测试异常: ${error.message}`
    }
  }
}

// 主测试函数
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║  Phase 3.6 触发器修复验证测试                          ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log(`\n测试时间: ${new Date().toISOString()}`)
  console.log(`Supabase URL: ${supabaseUrl}`)
  
  // 运行所有测试
  testResults.push(await testTriggerFieldReferences())
  testResults.push(await testTitleFieldReference())
  testResults.push(await testDateFieldReference())
  
  // 输出结果汇总
  console.log('\n╔════════════════════════════════════════════════════════╗')
  console.log('║  测试结果汇总                                          ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  
  let passed = 0
  let failed = 0
  
  for (const result of testResults) {
    const icon = result.passed ? '✅' : '❌'
    console.log(`\n${icon} ${result.name}`)
    console.log(`   结果: ${result.passed ? '通过' : '失败'}`)
    console.log(`   消息: ${result.message}`)
    
    if (result.passed) {
      passed++
    } else {
      failed++
    }
  }
  
  console.log('\n────────────────────────────────────────────────────────')
  console.log(`总计: ${testResults.length} 个测试`)
  console.log(`通过: ${passed} 个 ✅`)
  console.log(`失败: ${failed} 个 ${failed > 0 ? '❌' : ''}`)
  
  if (failed === 0) {
    console.log('\n🎉 所有测试通过！Phase 3.6 触发器修复验证成功。')
  } else {
    console.log('\n⚠️ 部分测试失败，请检查修复是否已正确应用。')
    process.exit(1)
  }
}

runTests().catch(error => {
  console.error('测试执行异常:', error)
  process.exit(1)
})
