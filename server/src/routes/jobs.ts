import express from 'express'
import { riskStatisticsJob } from '../jobs/riskStatisticsJob.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()
router.use(authenticate)

/**
 * GET /api/jobs/status
 * 获取所有定时任务的执行状态
 */
router.get('/status', async (req, res) => {
  try {
    const riskJobStatus = riskStatisticsJob.getStatus()

    res.json({
      success: true,
      data: {
        jobs: [
          {
            name: 'riskStatisticsJob',
            displayName: '风险统计定时任务',
            isRunning: riskJobStatus.isRunning,
            isScheduled: true,
            schedule: '0 2 * * *',
            lastRun: riskJobStatus.lastRun,
            nextRun: riskJobStatus.nextRun,
            status: riskJobStatus.isRunning ? 'running' : 'idle',
            description: '为所有活跃项目生成风险统计快照'
          },
          {
            name: 'autoAlertService.daily',
            displayName: '自动预警服务（每日检测）',
            isRunning: false,
            isScheduled: true,
            schedule: '0 2-30 * * *',
            lastRun: null,
            nextRun: null,
            status: 'scheduled',
            description: '执行完整的8项检测 + 项目健康度更新'
          },
          {
            name: 'autoAlertService.hourly',
            displayName: '自动预警服务（每小时检测）',
            isRunning: false,
            isScheduled: true,
            schedule: '0 * * * *',
            lastRun: null,
            nextRun: null,
            status: 'scheduled',
            description: '检查今天到期任务、严重风险'
          },
          {
            name: 'preMilestoneWarning',
            displayName: '前期证照过期预警',
            isRunning: false,
            isScheduled: true,
            schedule: '0 3 * * *',
            lastRun: null,
            nextRun: null,
            status: 'scheduled',
            description: '扫描即将过期证照、创建预警、标记过期、清理过期预警'
          }
        ],
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('Error fetching job status:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch job status',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * POST /api/jobs/:jobName/execute
 * 手动触发指定任务
 */
router.post('/:jobName/execute', async (req, res) => {
  try {
    const { jobName } = req.params
    const jobId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    console.log(`🔄 Manual trigger: ${jobName} (Job ID: ${jobId})`)

    let result: any

    switch (jobName) {
      case 'riskStatisticsJob':
        result = await riskStatisticsJob.executeNow()
        break

      case 'autoAlertService.daily':
        res.status(501).json({
          success: false,
          error: 'Not implemented',
          message: '手动触发自动预警服务尚未实现'
        })
        return

      case 'autoAlertService.hourly':
        res.status(501).json({
          success: false,
          error: 'Not implemented',
          message: '手动触发快速检测服务尚未实现'
        })
        return

      case 'preMilestoneWarning':
        res.status(501).json({
          success: false,
          error: 'Not implemented',
          message: '手动触发证照预警服务尚未实现'
        })
        return

      default:
        res.status(404).json({
          success: false,
          error: 'Job not found',
          message: `Unknown job: ${jobName}`
        })
        return
    }

    res.json({
      success: true,
      message: `任务已触发: ${jobName}`,
      jobId,
      jobName,
      result,
      triggeredAt: new Date().toISOString()
    })
  } catch (error) {
    console.error(`Error executing job:`, error)
    res.status(500).json({
      success: false,
      error: 'Failed to execute job',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

export default router
