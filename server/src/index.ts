// 椤圭洰绠＄悊绯荤粺 API 鏈嶅姟鍣?
// Express + TypeScript + Supabase

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

// 鍔犺浇鐜鍙橀噺
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env') })

if (process.env.NODE_ENV !== 'test') {
  await import('./scheduler.js')
}

// 瀵煎叆涓棿浠?
import { requestLogger, logger } from './middleware/logger.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { xssProtection, sanitizeInput } from './middleware/xssProtection.js'
import { auditLogger } from './middleware/auditLogger.js'

// 瀵煎叆骞跺惎鍔ㄥ畾鏃朵换鍔¤皟搴﹀櫒

// 瀵煎叆 Supabase 瀹㈡埛绔?
import { supabase } from './services/dbService.js'

// 鈹€鈹€鈹€ 瀵煎叆璺敱 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 鍩虹妯″潡锛堝師鏈夛級
import projectsRouter from './routes/projects.js'
import tasksRouter from './routes/tasks.js'
import risksRouter from './routes/risks.js'
import milestonesRouter from './routes/milestones.js'
import membersRouter from './routes/members.js'
import invitationsRouter from './routes/invitations.js'

// 鏂板妯″潡
import authRouter from './routes/auth.js'
import authRegisterRouter from './routes/auth-register.js'
import authLogoutRouter from './routes/auth-logout.js'
import authMeRouter from './routes/auth-me.js'
import authChangePasswordRouter from './routes/auth-change-password.js'
import authProfileRouter from './routes/auth-profile.js'
import dashboardRouter from './routes/dashboard.js'
import taskConditionsRouter from './routes/task-conditions.js'
import taskObstaclesRouter from './routes/task-obstacles.js'
import taskDelaysRouter from './routes/task-delays.js'
import taskSummariesRouter from './routes/task-summaries.js'
import preMilestonesRouter from './routes/pre-milestones.js'
import preMilestoneConditionsRouter from './routes/pre-milestone-conditions.js'
import preMilestoneDependenciesRouter from './routes/pre-milestone-dependencies.js'
import certificateApprovalsRouter from './routes/certificate-approvals.js'
import acceptancePlansRouter from './routes/acceptance-plans.js'
import acceptanceNodesRouter from './routes/acceptance-nodes.js'
import wbsRouter from './routes/wbs.js'
import wbsTemplatesRouter from './routes/wbs-templates.js'
import standardProcessesRouter from './routes/standard-processes.js'
import aiDurationRouter from './routes/ai-duration.js'
import aiScheduleRouter from './routes/aiSchedule.js'
import warningsRouter from './routes/warnings.js'
import riskStatisticsRouter from './routes/risk-statistics.js'
import notificationsRouter from './routes/notifications.js'
import remindersRouter from './routes/reminders.js'
import jobsRouter from './routes/jobs.js'
import healthScoreRouter from './routes/health-score.js'
import constructionDrawingsRouter from './routes/construction-drawings.js'

// 鈹€鈹€鈹€ 鏁版嵁搴撹繛鎺ラ獙璇?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
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
    logger.error('鏁版嵁搴撹繛鎺ラ獙璇佸け璐?', error)
    console.error('鉂?鏁版嵁搴撹繛鎺ラ獙璇佸け璐?', error)
    console.error('璇锋鏌?.env 鏂囦欢涓殑 SUPABASE_URL 鍜?SUPABASE_ANON_KEY 閰嶇疆')
    process.exit(1)
  }
}

// 鈹€鈹€鈹€ 搴旂敤鍒濆鍖?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
const app = express()
const PORT = process.env.PORT || 3001
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

function isLocalDevRequest(ip?: string) {
  if (!ip) return false
  return ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1'
}

// 涓棿浠?
app.use(helmet())
// CORS 閰嶇疆锛氭敮鎸侀€楀彿鍒嗛殧鐨勫鍩熷悕
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173'];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}))
app.use(express.json({ limit: '10mb' }))

// 鈹€鈹€鈹€ 闄愭祦閰嶇疆 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 閫氱敤API闄愭祦锛?00娆?15min锛堥槻姝㈡帴鍙ｆ互鐢級
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skip: (req) => !IS_PRODUCTION && isLocalDevRequest(req.ip),
  message: { success: false, error: { code: 'RATE_LIMITED', message: '璇锋眰杩囦簬棰戠箒锛岃绋嶅悗鍐嶈瘯' } }
})
// 鐧诲綍/娉ㄥ唽涓ユ牸闄愭祦锛?娆?15min锛堥槻鏆村姏鐮磋В锛?
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skip: (req) => !IS_PRODUCTION && isLocalDevRequest(req.ip),
  skipSuccessfulRequests: true, // 鎴愬姛璇锋眰涓嶈鍏ヨ鏁?
  message: { success: false, error: { code: 'AUTH_RATE_LIMITED', message: 'Too many login attempts, please try again in 15 minutes' } }
})

app.use('/api/', apiLimiter)
app.use(requestLogger)
app.use(auditLogger)
app.use(sanitizeInput)
app.use(xssProtection)

// 鍋ュ悍妫€鏌ワ紙鏃犻渶璁よ瘉锛?
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// 鈹€鈹€鈹€ API 璺敱娉ㄥ唽 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
// 璁よ瘉妯″潡锛堢櫥褰?娉ㄥ唽浣跨敤涓ユ牸闄愭祦锛?
app.use('/api/auth/login', authLimiter, authRouter)
app.use('/api/auth/register', authLimiter, authRegisterRouter)
app.use('/api/auth/logout', authLogoutRouter)
app.use('/api/auth/me', authMeRouter)
app.use('/api/auth/change-password', authChangePasswordRouter)
app.use('/api/auth/profile', authProfileRouter)

// 鍩虹妯″潡
app.use('/api/projects', projectsRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api/risks', risksRouter)
app.use('/api/milestones', milestonesRouter)
app.use('/api/members', membersRouter)
app.use('/api/invitations', invitationsRouter)

// Dashboard
app.use('/api/dashboard', dashboardRouter)

// 浠诲姟鎵╁睍
app.use('/api/task-conditions', taskConditionsRouter)
app.use('/api/task-obstacles', taskObstaclesRouter)
app.use('/api/task-delays', taskDelaysRouter)
app.use('/api/task-summaries', taskSummariesRouter)

// 鍓嶆湡璇佺収锛堝紑宸ュ墠閲岀▼纰戯級
app.use('/api/pre-milestones', preMilestonesRouter)
app.use('/api/pre-milestone-conditions', preMilestoneConditionsRouter)
app.use('/api/pre-milestone-dependencies', preMilestoneDependenciesRouter)
app.use('/api/certificate-approvals', certificateApprovalsRouter)

// 楠屾敹
app.use('/api/acceptance-plans', acceptancePlansRouter)
app.use('/api/acceptance-nodes', acceptanceNodesRouter)

// WBS
app.use('/api/wbs', wbsRouter)
app.use('/api/wbs-templates', wbsTemplatesRouter)
app.use('/api/standard-processes', standardProcessesRouter)

// AI 宸ユ湡
app.use('/api/ai-duration', aiDurationRouter)
app.use('/api/ai-schedule', aiScheduleRouter)

// 棰勮涓庨€氱煡
app.use('/api/warnings', warningsRouter)
app.use('/api/risk-statistics', riskStatisticsRouter)
app.use('/api/notifications', notificationsRouter)
app.use('/api/reminders', remindersRouter)

// 鍚庡彴浠诲姟
app.use('/api/jobs', jobsRouter)

// 鍋ュ悍搴?
app.use('/api/health-score', healthScoreRouter)

// 鏂藉伐鍥剧焊锛堢嫭绔嬩簬鍓嶆湡璇佺収锛?
app.use('/api/construction-drawings', constructionDrawingsRouter)

// 閿欒澶勭悊
app.use(notFoundHandler)
app.use(errorHandler)

// 鍚姩鏈嶅姟鍣紙浠呭湪闈炴祴璇曠幆澧冿級
if (process.env.NODE_ENV !== 'test') {
  // 楠岃瘉鏁版嵁搴撹繛鎺ュ悗鍐嶅惎鍔ㄦ湇鍔″櫒
  validateDatabaseConnection().then(() => {
    app.listen(PORT, () => {
      logger.info(`Server started`, { port: PORT })
      console.log(`馃殌 API Server running on http://localhost:${PORT}`)
      console.log(`馃搵 Health check: http://localhost:${PORT}/api/health`)
    })
  }).catch((error) => {
    logger.error('鏁版嵁搴撻獙璇佸け璐ワ紝鏈嶅姟鍣ㄦ湭鍚姩:', error)
    process.exit(1)
  })
}

export default app


