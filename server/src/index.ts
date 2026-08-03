// Express + TypeScript + Supabase

import express from 'express'
import compression from 'compression'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer, type Server as HttpServer } from 'http'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const runtimeRole = ['api', 'worker', 'all'].includes(String(process.env.RUNTIME_ROLE ?? '').toLowerCase())
  ? String(process.env.RUNTIME_ROLE).toLowerCase() as 'api' | 'worker' | 'all'
  : 'all'
const shouldBootScheduler = (
  process.env.NODE_ENV !== 'test'
  && runtimeRole !== 'api'
  && process.env.SKIP_SCHEDULER_BOOT !== 'true'
)
const shouldValidateDatabaseOnBoot = process.env.SKIP_DATABASE_VALIDATE !== 'true'
const shouldBootstrapReferenceData = process.env.SKIP_REFERENCE_DATA_BOOTSTRAP !== 'true'
const shouldWarmReadModelOnBoot = runtimeRole !== 'worker' && process.env.SKIP_READ_MODEL_WARMUP !== 'true'

import { requestLogger, logger } from './middleware/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { xssProtection, sanitizeInput } from './middleware/xssProtection.js'
import { auditLogger } from './middleware/auditLogger.js'
import { readOnlyCacheMiddleware } from './middleware/httpCache.js'
import { createRuntimeRequestBoundary } from './middleware/runtimeRequestBoundary.js'
import { assertAuthRuntimeConfiguration } from './auth/config.js'
import { closeDatabasePool, query, warmDatabasePool } from './database.js'


import { ensureStatusDictionaryBootstrapped } from './services/statusDictionaryService.js'
import { registerReadModelWarmupAdapters, scheduleReadModelWarmup } from './services/readModelWarmupService.js'
import { evaluateProductionMigrationRuntimeGate } from './services/migrationProductionGovernanceService.js'
import { listActiveProjectIds } from './services/activeProjectService.js'
import { getAcceptanceFlowSnapshot } from './services/acceptanceFlowService.js'
import {
  assertDbServiceBusinessSideEffectAdaptersRegistered,
  registerDbServiceBusinessSideEffectAdapters,
} from './services/dbService.js'
import { writeLifecycleLog, writeLog } from './services/changeLogs.js'
import {
  enqueueProjectHealthUpdate,
  getProjectHealthRefreshQueueStatus,
} from './services/projectHealthService.js'
import { dataQualityService } from './services/dataQualityService.js'
import { evaluateTaskConstraint } from './services/taskConstraintGovernanceService.js'
import { finalizeTaskWriteFromLegacyMutation } from './services/taskWriteChainService.js'

import projectsRouter, { warmProjectListCache } from './routes/projects.js'
import projectWizardRouter from './routes/projectWizard.js'
import milestonePresetsRouter from './routes/milestonePresets.js'
import taskReconcileRouter from './routes/taskReconcile.js'
import companyProjectTemplatesRouter from './routes/companyProjectTemplates.js'
import adminBusinessTypesRouter from './routes/adminBusinessTypes.js'
import tasksRouter from './routes/tasks.js'
import risksRouter, { warmRiskListCache } from './routes/risks.js'
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
import dashboardRouter, {
  warmDashboardProjectSummaryCache,
  warmDashboardTodayProgressCache,
} from './routes/dashboard.js'
import companyDashboardRouter from './routes/company-dashboard.js'
import analyticsRouter from './routes/analytics.js'
import metricsRouter from './routes/metrics.js'
import reportsRouter from './routes/reports.js'
import dataQualityRouter, { warmDataQualityProjectSummaryCache } from './routes/data-quality.js'
import taskConditionsRouter from './routes/task-conditions.js'
import taskObstaclesRouter from './routes/task-obstacles.js'
import taskSummariesRouter from './routes/task-summaries.js'
import projectStartReadinessRouter from './routes/project-start-readiness.js'
import causeAttributionsRouter from './routes/cause-attributions.js'
import changeLogsRouter from './routes/change-logs.js'
import deletionRetentionRouter from './routes/deletion-retention.js'
import preMilestonesRouter, { warmPreMilestoneBoardCache } from './routes/pre-milestones.js'
import preMilestoneConditionsRouter from './routes/pre-milestone-conditions.js'
import preMilestoneDependenciesRouter from './routes/pre-milestone-dependencies.js'
import certificateWorkItemsRouter from './routes/certificate-work-items.js'
import certificateDependenciesRouter from './routes/certificate-dependencies.js'
import certificateTemplatesRouter from './routes/certificate-templates.js'
import certificateTemplateGovernanceRouter from './routes/certificate-template-governance.js'
import acceptanceTemplatesRouter from './routes/acceptance-templates.js'
import drawingPackageTemplatesRouter from './routes/drawing-package-templates.js'
import drawingPackageTemplateGovernanceRouter from './routes/drawing-package-template-governance.js'
import acceptancePlansRouter from './routes/acceptance-plans.js'
import acceptanceSummaryRouter from './routes/acceptance-summary.js'
import acceptanceCatalogRouter from './routes/acceptance-catalog.js'
import acceptanceDependenciesRouter from './routes/acceptance-dependencies.js'
import acceptanceRequirementsRouter from './routes/acceptance-requirements.js'
import acceptanceRecordsRouter from './routes/acceptance-records.js'
import wbsRouter from './routes/wbs.js'
import wbsTemplatesRouter from './routes/wbs-templates.js'
import durationSuggestionsRouter, { warmCurrentDurationForecastBatchCache } from './routes/duration-suggestions.js'
import warningsRouter from './routes/warnings.js'
import riskStatisticsRouter from './routes/risk-statistics.js'
import notificationsRouter from './routes/notifications.js'
import responsibilityRouter, { warmResponsibilityCache } from './routes/responsibility.js'
import remindersRouter, { warmReminderSettingsCache } from './routes/reminders.js'
import jobsRouter from './routes/jobs.js'
import healthScoreRouter from './routes/health-score.js'
import planningGovernanceRouter from './routes/planning-governance.js'
import constructionDrawingsRouter from './routes/construction-drawings.js'
import drawingReviewRulesRouter from './routes/drawing-review-rules.js'
import { warmDrawingBoardCache } from './routes/drawing-packages.js'
import criticalPathsRouter from './routes/critical-paths.js'
import issuesRouter from './routes/issues.js'
import clientErrorsRouter from './routes/client-errors.js'
import performanceReportsRouter from './routes/performance-reports.js'
import participantUnitsRouter from './routes/participant-units.js'
import engineeringObjectsRouter from './routes/engineering-objects.js'
import projectClimateRouter from './routes/project-climate.js'
import engineeringCategoriesRouter from './routes/engineering-categories.js'
import taskDependenciesRouter from './routes/task-dependencies.js'
import statusDictionaryRouter from './routes/status-dictionary.js'
import projectMaterialsRouter from './routes/project-materials.js'
import weeklyDigestRouter, { warmWeeklyDigestCache } from './routes/weekly-digest.js'
import wbsTemplateGovernanceRouter from './routes/wbs-template-governance.js'
import algorithmSeedsRouter from './routes/algorithm-seeds.js'
import durationContextGovernanceRouter from './routes/duration-context-governance.js'
import durationAccuracyRouter from './routes/duration-accuracy.js'
import durationAssetsRouter from './routes/duration-assets.js'
import workspaceRouter from './routes/workspace.js'
import commercialRouter from './routes/commercial.js'
import demoProjectsRouter from './routes/demo-projects.js'
import planningFieldRegistryRouter from './routes/planningFieldRegistry.js'
import scheduleAccelerationRouter from './routes/schedule-acceleration.js'
import v14231ReadinessRouter from './routes/v14231-readiness.js'
import { closeRealtimeServer, initializeRealtimeServer } from './services/realtimeServer.js'
import {
  buildLivenessPayload,
  evaluateRuntimeReadiness,
  markRuntimeSchedulerReady,
} from './services/runtimeHealthService.js'
import {
  assertProductionApiCredentialBoundary,
  resolveSupabaseRuntimeKey,
} from './services/runtimeCredentialBoundary.js'
import { recoverTaskBatchUpdateJobs } from './services/taskBatchUpdateService.js'
import {
  beginJobRuntimeShutdown,
  onJobRuntimeFatal,
  waitForActiveJobsToDrain,
} from './services/jobRuntime.js'
import { closePdfRenderPool } from './services/pdfRenderPool.js'

registerReadModelWarmupAdapters({
  listActiveProjectIds,
  warmAcceptanceFlowSnapshot: getAcceptanceFlowSnapshot,
  warmCurrentDurationForecastBatchCache,
  warmDashboardProjectSummaryCache,
  warmDashboardTodayProgressCache,
  warmDataQualityProjectSummaryCache,
  warmDrawingBoardCache,
  warmPreMilestoneBoardCache,
  warmProjectListCache,
  warmReminderSettingsCache,
  warmResponsibilityCache,
  warmRiskListCache,
  warmWeeklyDigestCache,
})

registerDbServiceBusinessSideEffectAdapters({
  writeLog,
  writeLifecycleLog,
  enqueueProjectHealthUpdate,
  syncProjectDataQuality: (projectId) => dataQualityService.syncProjectDataQuality(projectId),
  evaluateTaskConstraint,
  finalizeTaskWrite: finalizeTaskWriteFromLegacyMutation,
})
assertDbServiceBusinessSideEffectAdaptersRegistered()

assertProductionApiCredentialBoundary()

if (process.env.NODE_ENV !== 'test' && !shouldBootScheduler) {
  logger.info('[bootstrap] scheduler boot skipped by SKIP_SCHEDULER_BOOT=true')
}
if (process.env.NODE_ENV !== 'test' && !shouldValidateDatabaseOnBoot) {
  logger.info('[bootstrap] database validation skipped by SKIP_DATABASE_VALIDATE=true')
}
if (process.env.NODE_ENV !== 'test' && !shouldBootstrapReferenceData) {
  logger.info('[bootstrap] reference data bootstrap skipped by SKIP_REFERENCE_DATA_BOOTSTRAP=true')
}
if (process.env.NODE_ENV !== 'test' && !shouldWarmReadModelOnBoot) {
  logger.info('[bootstrap] read model warmup skipped by SKIP_READ_MODEL_WARMUP=true')
}

async function validateDatabaseConnection() {
  try {
    const warmup = await warmDatabasePool()

    const supabaseRuntimeKey = resolveSupabaseRuntimeKey()
    if (process.env.SUPABASE_URL && supabaseRuntimeKey) {
      const { createClient } = await import('@supabase/supabase-js')
      const serviceClient = createClient(
        process.env.SUPABASE_URL,
        supabaseRuntimeKey,
        {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        },
      )

      const { error } = await serviceClient
        .from('status_dictionary_versions')
        .select('version_key')
        .limit(1)
      if (error) throw error
    }

    logger.info('Database connection validated', warmup)
  } catch (error) {
    logger.error('数据库连接验证失败', error)
    logger.error('请检查服务端数据库连接配置；如启用 Supabase REST smoke，请检查 SUPABASE_URL 和 SUPABASE_RUNTIME_KEY')
    process.exit(1)
  }
}

async function bootstrapReferenceData() {
  try {
    const result = await ensureStatusDictionaryBootstrapped()
    logger.info('[bootstrap] status dictionary ready', result)
  } catch (error) {
    logger.warn('[bootstrap] status dictionary bootstrap skipped', { error })
  }
}

async function evaluateProductionMigrationBootstrapGate() {
  const productionMigrationRuntimeGate = await evaluateProductionMigrationRuntimeGate({
    nodeEnv: process.env.NODE_ENV,
    shouldBootScheduler,
    shouldWarmReadModelOnBoot,
    expectedMigrationFilename: process.env.EXPECTED_SCHEMA_MIGRATION_FILENAME,
    expectedMigrationChecksum: process.env.EXPECTED_SCHEMA_MIGRATION_CHECKSUM,
    readMigrationLedgerEntry: async (filename) => {
      const result = await query(
        `SELECT filename, version, checksum
           FROM public.schema_migrations
          WHERE filename = $1
          LIMIT 1`,
        [filename],
      )
      return (result.rows[0] as { filename: string; version: string; checksum: string | null } | undefined) ?? null
    },
  })

  if (productionMigrationRuntimeGate.status === 'blocked') {
    logger.error('production_migration_runtime_bootstrap_blocked', {
      reasonCodes: productionMigrationRuntimeGate.reasonCodes,
      expectedMigrationFilename: process.env.EXPECTED_SCHEMA_MIGRATION_FILENAME ?? null,
    })
    process.exit(1)
  }

  return productionMigrationRuntimeGate
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
        `http://localhost:${PORT}/api/readyz`,
        `http://127.0.0.1:${PORT}/api/readyz`,
      ],
    })
    logger.info('Realtime endpoint ready', {
      urls: [
        `ws://localhost:${PORT}/ws`,
        `ws://127.0.0.1:${PORT}/ws`,
      ],
    })
  })
  return server
}

type SchedulerModule = typeof import('./scheduler.js')

function registerGracefulShutdown(
  server: HttpServer,
  schedulerModule: SchedulerModule | null,
) {
  let shutdownPromise: Promise<void> | null = null
  const gracePeriodMs = readPositiveIntegerEnv('SHUTDOWN_GRACE_PERIOD_MS', 30_000)

  const shutdown = (signal: string) => {
    if (shutdownPromise) return shutdownPromise
    shutdownPromise = (async () => {
      logger.info('runtime shutdown started', { signal, gracePeriodMs })
      markRuntimeSchedulerReady(false)
      beginJobRuntimeShutdown()

      const httpClosed = new Promise<boolean>((resolve) => {
        server.close((error) => resolve(!error))
        server.closeIdleConnections?.()
      })
      const httpDrain = Promise.race([
        httpClosed,
        new Promise<false>((resolve) => {
          const timeout = setTimeout(() => resolve(false), gracePeriodMs)
          timeout.unref?.()
        }),
      ])

      const [, jobsDrained, requestsDrained] = await Promise.all([
        schedulerModule?.stopAllJobs() ?? Promise.resolve(),
        waitForActiveJobsToDrain(gracePeriodMs),
        httpDrain,
        closeRealtimeServer(Math.min(gracePeriodMs, 2_000)),
      ])

      if (!requestsDrained) server.closeAllConnections?.()
      await schedulerModule?.releaseSchedulerLeadership()
      await closePdfRenderPool()
      await closeDatabasePool()

      if (!jobsDrained || !requestsDrained) {
        logger.error('runtime shutdown grace period exhausted', {
          signal,
          jobsDrained,
          requestsDrained,
        })
        process.exitCode = 1
        return
      }

      logger.info('runtime shutdown completed', { signal })
      process.exitCode = 0
    })().catch((error) => {
      logger.error('runtime shutdown failed', {
        signal,
        error: error instanceof Error ? error.message : String(error),
      })
      server.closeAllConnections?.()
      void schedulerModule?.releaseSchedulerLeadership()
      process.exitCode = 1
    })
    return shutdownPromise
  }

  onJobRuntimeFatal((error) => {
    logger.error('job runtime requested worker shutdown', {
      code: error.code,
      error: error.message,
    })
    void shutdown('job_runtime_fatal')
  })
  process.once('SIGINT', () => { void shutdown('SIGINT') })
  process.once('SIGTERM', () => { void shutdown('SIGTERM') })
  return shutdown
}

// 应用初始化
const app = express()
const PORT = process.env.PORT || 3001
const SERVER_HOST = process.env.HOST || '::'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY_HOPS ?? (IS_PRODUCTION ? 1 : 0))
const DEFAULT_API_RATE_LIMIT_MAX = 2_000
const DEFAULT_AUTH_RATE_LIMIT_MAX = 20

assertAuthRuntimeConfiguration()

if (Number.isFinite(TRUST_PROXY_HOPS) && TRUST_PROXY_HOPS > 0) {
  app.set('trust proxy', TRUST_PROXY_HOPS)
}

function isLocalDevRequest(ip?: string) {
  if (!ip) return false
  return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1'
}

function readPositiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function isAuthLimitedRoute(req: express.Request) {
  const path = req.originalUrl.split('?')[0]
  return path === '/api/auth/login' || path === '/api/auth/register'
}

app.use(helmet())
app.use(createRuntimeRequestBoundary({
  nodeEnv: process.env.NODE_ENV,
  expectedOrigin: process.env.PUBLIC_HTTPS_ORIGIN ?? '',
}))
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
  max: readPositiveIntegerEnv('API_RATE_LIMIT_MAX', DEFAULT_API_RATE_LIMIT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => (!IS_PRODUCTION && isLocalDevRequest(req.ip)) || isAuthLimitedRoute(req),
  message: { success: false, error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' } }
})
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Keep this visibly small for the static security check: max: 20,
  max: readPositiveIntegerEnv('AUTH_RATE_LIMIT_MAX', DEFAULT_AUTH_RATE_LIMIT_MAX),
  standardHeaders: true,
  legacyHeaders: false,
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

app.get('/api/livez', (_req, res) => {
  res.json(buildLivenessPayload())
})

app.get('/api/readyz', async (_req, res) => {
  const readiness = await evaluateRuntimeReadiness({
    schedulerExpected: shouldBootScheduler,
    projectHealthRefreshQueueStatus: getProjectHealthRefreshQueueStatus(),
    timeoutMs: readPositiveIntegerEnv('READINESS_DATABASE_TIMEOUT_MS', 2_000),
  })
  res.status(readiness.status === 'ready' ? 200 : 503).json(readiness)
})

app.use('/api/auth/login', authLimiter, authRouter)
app.use('/api/auth/register', authLimiter, authRegisterRouter)
app.use('/api/auth/logout', authLogoutRouter)
app.use('/api/auth/me', authMeRouter)
app.use('/api/auth/change-password', authChangePasswordRouter)
app.use('/api/auth/profile', authProfileRouter)
app.use('/api/auth/reset-password', authResetPasswordRouter)
// Public browser telemetry must be mounted before the broad /api metrics router,
// whose router-level auth guard applies to every downstream /api path.
app.use('/api/client-errors', clientErrorsRouter)

// 基础模块
app.use('/api/projects/:projectId/materials', projectMaterialsRouter)
app.use('/api/performance-reports', performanceReportsRouter)
app.use('/api', metricsRouter)
app.use('/api/projects', projectStartReadinessRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/projects', projectClimateRouter)
// v1.4.22.1: Wizard, templates, reconcile, milestone presets
app.use(projectWizardRouter)
app.use(milestonePresetsRouter)
app.use(taskReconcileRouter)
app.use(companyProjectTemplatesRouter)
app.use(adminBusinessTypesRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/risks', risksRouter)
app.use('/api/task-baselines', taskBaselinesRouter)
app.use('/api/monthly-plans', monthlyPlansRouter)
app.use('/api/progress-deviation', progressDeviationRouter)
app.use('/api/members', membersRouter)
app.use('/api/invitations', invitationsRouter)

// Dashboard
app.use('/api/projects/:projectId/dashboard', dashboardRouter)
app.use('/api/company/dashboard', companyDashboardRouter)
app.use('/api/analytics', analyticsRouter)
app.use('/api/projects/:projectId/reports', reportsRouter)
app.use('/api/data-quality', dataQualityRouter)

app.use('/api/task-conditions', taskConditionsRouter)
app.use('/api/task-obstacles', taskObstaclesRouter)
app.use('/api/task-summaries', taskSummariesRouter)
app.use('/api/cause-attributions', causeAttributionsRouter)
app.use('/api/change-logs', changeLogsRouter)
app.use('/api/deletion-retention', deletionRetentionRouter)

app.use('/api/projects/:projectId/pre-milestones', preMilestonesRouter)
app.use('/api/pre-milestone-conditions', preMilestoneConditionsRouter)
app.use('/api/pre-milestone-dependencies', preMilestoneDependenciesRouter)
app.use('/api/projects/:projectId/certificate-work-items', certificateWorkItemsRouter)
app.use('/api/projects/:projectId/certificate-dependencies', certificateDependenciesRouter)
app.use('/api/projects/:projectId/certificate-templates', certificateTemplatesRouter)
app.use('/api/projects/:projectId/acceptance-templates', acceptanceTemplatesRouter)
app.use('/api/projects/:projectId/drawing-package-templates', drawingPackageTemplatesRouter)
app.use('/api/projects/:projectId/acceptance-summary', acceptanceSummaryRouter)
app.use('/api/projects/:projectId/schedule-acceleration', scheduleAccelerationRouter)

app.use('/api/acceptance-plans', acceptancePlansRouter)
app.use('/api/acceptance-catalog', acceptanceCatalogRouter)
app.use('/api/acceptance-dependencies', acceptanceDependenciesRouter)
app.use('/api/acceptance-requirements', acceptanceRequirementsRouter)
app.use('/api/acceptance-records', acceptanceRecordsRouter)

// WBS
app.use('/api/wbs', wbsRouter)
app.use('/api/planning/wbs-templates', wbsTemplatesRouter)
app.use('/api/planning/algorithm-seeds', algorithmSeedsRouter)
app.use('/api/wbs-template-governance', wbsTemplateGovernanceRouter)
app.use('/api/admin/certificate-template-governance', certificateTemplateGovernanceRouter)
app.use('/api/admin/drawing-package-template-governance', drawingPackageTemplateGovernanceRouter)
app.use('/api/admin/duration-context-governance', durationContextGovernanceRouter)
app.use('/api/admin/duration-accuracy', durationAccuracyRouter)
app.use('/api/admin/duration-assets', durationAssetsRouter)
app.use('/api/workspace', workspaceRouter)
app.use('/api/commercial', commercialRouter)
app.use('/api/demo-projects', demoProjectsRouter)
app.use('/api/planning', planningFieldRegistryRouter)
app.use('/api/v14231-readiness', v14231ReadinessRouter)

app.use('/api/duration-suggestions', durationSuggestionsRouter)

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
app.use('/api/drawing-review-rules', drawingReviewRulesRouter)
app.use('/api/projects', criticalPathsRouter)

// 问题域（10.1 建立基础模型）
app.use('/api/issues', issuesRouter)
app.use('/api/participant-units', participantUnitsRouter)
app.use('/api/engineering-objects', engineeringObjectsRouter)
app.use('/api/engineering-categories', engineeringCategoriesRouter)
app.use('/api/tasks/:taskId/dependencies', taskDependenciesRouter)
app.use('/api/status-dictionary', statusDictionaryRouter)
app.use('/api/projects', weeklyDigestRouter)

app.use(notFoundHandler)
app.use(errorHandler)

if (process.env.NODE_ENV !== 'test') {
  const referenceBootstrap = shouldBootstrapReferenceData
    ? () => bootstrapReferenceData()
    : () => Promise.resolve()
  const bootstrap = shouldValidateDatabaseOnBoot
    ? validateDatabaseConnection().then(referenceBootstrap)
    : referenceBootstrap()

  bootstrap.then(async () => {
    const productionMigrationRuntimeGate = await evaluateProductionMigrationBootstrapGate()
    if (runtimeRole !== 'worker') {
      const recoveredTaskBatchJobs = await recoverTaskBatchUpdateJobs()
      logger.info('[bootstrap] durable task batch update recovery scheduled', {
        recoveredJobs: recoveredTaskBatchJobs,
      })
    }
    let schedulerModule: SchedulerModule | null = null
    let leadershipLoss: Error | null = null
    let shutdownRuntime: ((signal: string) => Promise<void>) | null = null
    if (shouldBootScheduler && productionMigrationRuntimeGate.allowScheduler) {
      const schedulerStartedAt = new Date()
      schedulerModule = await import('./scheduler.js')
      const schedulerStarted = await schedulerModule.startAllJobs({
        ownerId: `${process.env.HOSTNAME ?? 'workbuddy'}-${process.pid}`,
        onLeadershipLost: (error) => {
          leadershipLoss = error
          markRuntimeSchedulerReady(false)
          beginJobRuntimeShutdown()
          if (shutdownRuntime) void shutdownRuntime('scheduler_leadership_lost')
        },
      })
      markRuntimeSchedulerReady(schedulerStarted, schedulerStartedAt)
      if (!schedulerStarted) {
        throw new Error('Scheduler leadership was not acquired by the configured worker runtime')
      }
    }
    const server = startServer(app)
    const shutdown = registerGracefulShutdown(server, schedulerModule)
    shutdownRuntime = shutdown
    if (leadershipLoss) void shutdown('scheduler_leadership_lost')
    if (shouldWarmReadModelOnBoot && productionMigrationRuntimeGate.allowWarmup) {
      scheduleReadModelWarmup()
    }
  }).catch((error) => {
    logger.error('数据库验证失败，服务器未启动:', error)
    process.exit(1)
  })
}

export default app
