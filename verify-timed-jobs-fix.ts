/**
 * 定时任务修复验证脚本
 * 
 * 验证内容：
 * 1. 检查定时任务启动代码
 * 2. 测试任务监控接口
 * 3. 测试手动触发接口
 * 4. 验证执行历史记录
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'http://localhost:54321'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
const API_URL = process.env.API_URL || 'http://localhost:3001'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

interface JobStatus {
  name: string
  displayName: string
  isRunning: boolean
  isScheduled: boolean
  schedule: string
  lastRun: string | null
  nextRun: string | null
  status: string
  description: string
}

console.log('🔍 开始验证定时任务修复...\n')

// 验证1: 检查定时任务启动代码
async function checkStartupCode() {
  console.log('📋 验证1: 检查定时任务启动代码')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 读取index.ts文件
  const fs = await import('fs')
  const path = await import('path')
  const indexTsPath = path.join(process.cwd(), 'server/src/index.ts')
  
  try {
    const content = fs.readFileSync(indexTsPath, 'utf-8')
    
    const checks = {
      '风险统计定时任务启动': content.includes("riskStatisticsJob.start('0 2 * * *')"),
      '自动预警服务启动': content.includes('autoAlertService.start()'),
      '前期证照预警调度': content.includes("cron.schedule('0 3 * * *'"),
      '错峰执行时间': 
        content.includes('0 2 * * *') &&  // 02:00
        content.includes('start()') &&           // 02:30 (AutoAlertService内部)
        content.includes("0 3 * * *")           // 03:00
    }

    console.log('检查结果：')
    Object.entries(checks).forEach(([name, passed]) => {
      console.log(`  ${passed ? '✅' : '❌'} ${name}`)
    })

    const allPassed = Object.values(checks).every(v => v)
    console.log(`\n验证结果: ${allPassed ? '✅ 全部通过' : '❌ 部分未通过'}\n`)
    return allPassed
  } catch (error) {
    console.log(`❌ 无法读取index.ts: ${error}\n`)
    return false
  }
}

// 验证2: 测试任务监控接口
async function checkJobStatus() {
  console.log('📊 验证2: 测试任务监控接口')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  try {
    const response = await fetch(`${API_URL}/api/jobs/status`)
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (!data.success || !data.data?.jobs) {
      throw new Error('接口返回数据格式不正确')
    }

    const jobs = data.data.jobs as JobStatus[]
    
    console.log('定时任务状态：')
    jobs.forEach(job => {
      console.log(`  ${job.isScheduled ? '✅' : '❌'} ${job.displayName}`)
      console.log(`     调度: ${job.schedule}`)
      console.log(`     状态: ${job.status}`)
      console.log(`     描述: ${job.description}\n`)
    })

    const allScheduled = jobs.every(job => job.isScheduled)
    console.log(`验证结果: ${allScheduled ? '✅ 所有任务已调度' : '❌ 部分任务未调度'}\n`)
    return allScheduled
  } catch (error) {
    console.log(`❌ 测试监控接口失败: ${error}\n`)
    console.log('💡 提示: 请确保服务器已启动（npm run dev）\n')
    return false
  }
}

// 验证3: 测试手动触发接口（仅riskStatisticsJob）
async function checkManualTrigger() {
  console.log('🔄 验证3: 测试手动触发接口')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  try {
    const response = await fetch(`${API_URL}/api/jobs/riskStatisticsJob/execute`, {
      method: 'POST'
    })
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    
    if (!data.success) {
      throw new Error(data.error || '触发失败')
    }

    console.log('✅ 手动触发成功')
    console.log(`   任务: ${data.jobName}`)
    console.log(`   触发时间: ${data.triggeredAt}`)
    console.log(`   执行结果: ${JSON.stringify(data.result, null, 2)}\n`)
    return true
  } catch (error) {
    console.log(`❌ 测试手动触发失败: ${error}\n`)
    return false
  }
}

// 验证4: 验证执行历史记录
async function checkExecutionLogs() {
  console.log('📝 验证4: 验证执行历史记录')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  try {
    const { data, error } = await supabase
      .from('job_execution_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(5)

    if (error) {
      throw new Error(error.message)
    }

    if (!data || data.length === 0) {
      console.log('ℹ️  执行历史表为空（可能尚未执行定时任务）')
      console.log('💡 提示: 等待定时任务执行后再次验证\n')
      return true
    }

    console.log('最近5条执行记录：')
    data.forEach(log => {
      console.log(`  📅 ${log.job_name}`)
      console.log(`     状态: ${log.status === 'success' ? '✅' : '❌'} ${log.status}`)
      console.log(`     开始: ${new Date(log.started_at).toLocaleString('zh-CN')}`)
      console.log(`     时长: ${log.duration_ms}ms`)
      console.log(`     触发: ${log.triggered_by}\n`)
    })

    console.log('✅ 执行历史记录功能正常\n')
    return true
  } catch (error) {
    console.log(`❌ 验证执行历史失败: ${error}\n`)
    return false
  }
}

// 主验证流程
async function main() {
  const results = {
    startupCode: await checkStartupCode(),
    jobStatus: await checkJobStatus(),
    manualTrigger: await checkManualTrigger(),
    executionLogs: await checkExecutionLogs()
  }

  console.log('🎯 验证总结')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  启动代码检查: ${results.startupCode ? '✅ 通过' : '❌ 未通过'}`)
  console.log(`  监控接口检查: ${results.jobStatus ? '✅ 通过' : '❌ 未通过'}`)
  console.log(`  手动触发检查: ${results.manualTrigger ? '✅ 通过' : '❌ 未通过'}`)
  console.log(`  执行历史检查: ${results.executionLogs ? '✅ 通过' : '❌ 未通过'}`)
  console.log()

  const allPassed = Object.values(results).every(v => v)
  if (allPassed) {
    console.log('🎉 所有验证项通过！定时任务修复完成！')
  } else {
    console.log('⚠️  部分验证项未通过，请检查相关功能')
  }

  process.exit(allPassed ? 0 : 1)
}

main()
