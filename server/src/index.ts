// Express + TypeScript + Supabase

import express from 'express'
import compression from 'compression'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const shouldBootScheduler = (
  process.env.NODE_ENV !== 'test'
  && process.env.SKIP_SCHEDULER_BOOT !== 'true'
)
const shouldValidateDatabaseOnBoot = process.env.SKIP_DATABASE_VALIDATE !== 'true'

if (shouldBootScheduler) {
  await import('./scheduler.js')
}

import { requestLogger, logger } from './middleware/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { xssProtection, sanitizeInput } from './middleware/xssProtection.js'
import { auditLogger } from './middleware/auditLogger.js'
import { readOnlyCacheMiddleware } from './middleware/httpCache.js'


import { supabase } from './services/dbService.js'

import projectsRouter from './routes/projects.js'
import tasksRouter from './routes/tasks.js'
import risksRouter from './routes/risks.js'
import milestonesRouter from './routes/milestones.js'
import taskBaselinesRouter from './routes/task-baselines.js'
import monthlyPlansRouter from './routes/monthly-plans.js'
import progressDeviationRouter from './routes/progress-deviation.js'
import membersRouter from './routes/members.js'
import invitationsRouter from './routes/invitations.js'

// 扩展模块
import authRouter from './routes/auth.js'
import authRegisterRouter from './routes/auth-register.js'
import authLogoutRouter from './routes/auth-logout.js'
import authMeRouter from './routes/auth-me.js'
import authChangePasswordRouter from './routes/auth-change-password.js'
import authProfileRouter from './routes/auth-profile.js'
import authResetPasswordRouter from './routes/auth-reset-password.js'
import dashboardRouter from './routes/dashboard.js'
import dataQualityRouter from './routes/data-quality.js'
import taskConditionsRouter from './routes/task-conditions.js'
import taskObstaclesRouter from './routes/task-obstacles.js'
import delayRequestsRouter from './routes/delay-requests.js'
import taskSummariesRouter from './routes/task-summaries.js'
import changeLogsRouter from './routes/change-logs.js'
import preMilestonesRouter from './routes/pre-milestones.js'
import preMilestoneConditionsRouter from './routes/pre-milestone-conditions.js'
import preMilestoneDependenciesRouter from './routes/pre-milestone-dependencies.js'
import certificateWorkItemsRouter from './routes/certificate-work-items.js'
import certificateDependenciesRouter from './routes/certificate-dependencies.js'
import acceptancePlansRouter from './routes/acceptance-plans.js'
import acceptanceCatalogRouter from './routes/acceptance-catalog.js'
import acceptanceDependenciesRouter from './routes/acceptance-dependencies.js'
import acceptanceRequirementsRouter from './routes/acceptance-requirements.js'
import acceptanceRecordsRouter from './routes/acceptance-records.js'
import acceptanceNodesRouter from './routes/acceptance-nodes.js'
import wbsRouter from './routes/wbs.js'
import wbsTemplatesRouter from './routes/wbs-templates.js'
import standardProcessesRouter from './routes/standard-processes.js'
import aiDurationRouter from './routes/ai-duration.js'
import aiScheduleRouter from './routes/aiSchedule.js'
import warningsRouter from './routes/warnings.js'
import riskStatisticsRouter from './routes/risk-statistics.js'
import notificationsRouter from './routes/notifications.js'
import responsibilityRouter from './routes/responsibility.js'
import remindersRouter from './routes/reminders.js'
import jobsRouter from './routes/jobs.js'
import healthScoreRouter from './routes/health-score.js'
import planningGovernanceRouter from './routes/planning-governance.js'
import constructionDrawingsRouter from './routes/construction-drawings.js'
import criticalPathsRouter from './routes/critical-paths.js'
import issuesRouter from './routes/issues.js'
import clientErrorsRouter from './routes/client-errors.js'
import scopeDimensionsRouter from './routes/scope-dimensions.js'
import participantUnitsRouter from './routes/participant-units.js'
import projectMaterialsRouter from './routes/project-materials.js'
import weeklyDigestRouter from './routes/weekly-digest.js'
import wbsTemplateGovernanceRouter from './routes/wbs-template-governance.js'
import { initializeRealtimeServer } from './services/realtimeServer.js'

if (process.env.NODE_ENV !== 'test' && !shouldBootScheduler) {
  logger.info('[bootstrap] scheduler boot skipped by SKIP_SCHEDULER_BOOT=true')
}
if (process.env.NODE_ENV !== 'test' && !shouldValidateDatabaseOnBoot) {
  logger.info('[bootstrap] database validation skipped by SKIP_DATABASE_VALIDATE=true')
}

async function validateDatabaseConnection() {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const testClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    )

    const { data, error } = await testClient.from('projects').select('id').limit(1)
    if (error) throw error

    logger.info('Database connection validated')
  } catch (error) {
    logger.error('数据库连接验证失败', error)
    logger.error('请检查 .env 文件中的 SUPABASE_URL 和 SUPABASE_ANON_KEY 配置')
    process.exit(1)
  }
}

function startServer(app: express.Express) {
  const server = createServer(app)
  initializeRealtimeServer(server)
  server.listen({
    port: Number(PORT),
    host: SERVER_HOST,
    ipv6Only: false,
  }, () => {
    logger.info(`Server started`, { port: PORT })
    logger.info('API Server running', {
      host: SERVER_HOST,
      urls: [
        `http://localhost:${PORT}`,
        `http://127.0.0.1:${PORT}`,
      ],
    })
    logger.info('Health check ready', {
      urls: [
        `http://localhost:${PORT}/api/health`,
        `http://127.0.0.1:${PORT}/api/health`,
      ],
    })
    logger.info('Realtime endpoint ready', {
      urls: [
        `ws://localhost:${PORT}/ws`,
        `ws://127.0.0.1:${PORT}/ws`,
      ],
    })
  })
}

// 应用初始化
const app = express()
const PORT = process.env.PORT || 3001
const SERVER_HOST = process.env.HOST || '::'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function isLocalDevRequest(ip?: string) {
  if (!ip) return false
  return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1'
}

app.use(helmet())
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}))
app.use(compression({ threshold: 0 }))
app.use(express.json({ limit: '10mb' }))

// 限流配置
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req) => !IS_PRODUCTION && isLocalDevRequest(req.ip),
  message: { success: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } }
})
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: (req) => !IS_PRODUCTION && isLocalDevRequest(req.ip),
  skipSuccessfulRequests: true,
  message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many login attempts, please try again in 15 minutes' } }
})

app.use('/api/', apiLimiter)
app.use(requestLogger)
app.use(auditLogger)
app.use(sanitizeInput)
app.use(xssProtection)
app.use(readOnlyCacheMiddleware)

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

app.use('/api/auth/login', authLimiter, authRouter)
app.use('/api/auth/register', authLimiter, authRegisterRouter)
app.use('/api/auth/logout', authLogoutRouter)
app.use('/api/auth/me', authMeRouter)
app.use('/api/auth/change-password', authChangePasswordRouter)
app.use('/api/auth/profile', authProfileRouter)
app.use('/api/auth/reset-password', authResetPasswordRouter)

// 基础模块
app.use('/api/scope-dimensions', scopeDimensionsRouter)
app.use('/api/projects/:projectId/materials', projectMaterialsRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/risks', risksRouter)
app.use('/api/milestones', milestonesRouter)
app.use('/api/task-baselines', taskBaselinesRouter)
app.use('/api/monthly-plans', monthlyPlansRouter)
app.use('/api/progress-deviation', progressDeviationRouter)
app.use('/api/members', membersRouter)
app.use('/api/invitations', invitationsRouter)

// Dashboard
app.use('/api/dashboard', dashboardRouter)
app.use('/api/data-quality', dataQualityRouter)

app.use('/api/task-conditions', taskConditionsRouter)
app.use('/api/task-obstacles', taskObstaclesRouter)
app.use('/api/delay-requests', delayRequestsRouter)
app.use('/api/task-summaries', taskSummariesRouter)
app.use('/api/change-logs', changeLogsRouter)

app.use('/api/pre-milestones', preMilestonesRouter)
app.use('/api/projects/:projectId/pre-milestones', preMilestonesRouter)
app.use('/api/pre-milestone-conditions', preMilestoneConditionsRouter)
app.use('/api/pre-milestone-dependencies', preMilestoneDependenciesRouter)
app.use('/api/projects/:projectId/certificate-work-items', certificateWorkItemsRouter)
app.use('/api/projects/:projectId/certificate-dependencies', certificateDependenciesRouter)

app.use('/api/acceptance-plans', acceptancePlansRouter)
app.use('/api/acceptance-catalog', acceptanceCatalogRouter)
app.use('/api/acceptance-dependencies', acceptanceDependenciesRouter)
app.use('/api/acceptance-requirements', acceptanceRequirementsRouter)
app.use('/api/acceptance-records', acceptanceRecordsRouter)
app.use('/api/acceptance-nodes', acceptanceNodesRouter)

// WBS
app.use('/api/wbs', wbsRouter)
app.use('/api/planning/wbs-templates', wbsTemplatesRouter)
app.use('/api/wbs-templates', wbsTemplatesRouter)
app.use('/api/wbs-template-governance', wbsTemplateGovernanceRouter)
app.use('/api/standard-processes', standardProcessesRouter)

app.use('/api/ai-duration', aiDurationRouter)
app.use('/api/ai-schedule', aiScheduleRouter)

// 预警与通知
app.use('/api/warnings', warningsRouter)
app.use('/api/risk-statistics', riskStatisticsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/projects/:projectId/responsibility', responsibilityRouter)
app.use('/api/reminders', remindersRouter)

app.use('/api/jobs', jobsRouter)

// 健康度
app.use('/api/health-score', healthScoreRouter)
app.use('/api/planning-governance', planningGovernanceRouter)

app.use('/api/construction-drawings', constructionDrawingsRouter)
app.use('/api/projects', criticalPathsRouter)

// 问题域（10.1 建立基础模型）
app.use('/api/issues', issuesRouter)
app.use('/api/client-errors', clientErrorsRouter)
app.use('/api/participant-units', participantUnitsRouter)
app.use('/api/projects', weeklyDigestRouter)

app.use(notFoundHandler)
app.use(errorHandler)

if (process.env.NODE_ENV !== 'test') {
  const bootstrap = shouldValidateDatabaseOnBoot
    ? validateDatabaseConnection()
    : Promise.resolve()

  bootstrap.then(() => {
    startServer(app)
  }).catch((error) => {
    logger.error('数据库验证失败，服务器未启动:', error)
    process.exit(1)
  })
}

export default app


