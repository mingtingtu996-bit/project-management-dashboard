/**
 * 监控系统 - 异常监控和性能追踪
 * 支持 Sentry 集成，也可以作为独立的本地监控系统
 */

// Sentry 条件导入 - 如果未安装则跳过
let Sentry: any = null
try {
  Sentry = require('@sentry/react')
} catch {
  console.log('[Monitor] Sentry 未安装，使用本地监控模式')
}

// 监控配置
interface MonitoringConfig {
  enabled: boolean
  sentryDsn?: string
  environment: 'development' | 'production' | 'test'
  sampleRate: number
  enablePerformanceMonitoring: boolean
}

// API 请求监控数据
interface ApiMetrics {
  url: string
  method: string
  statusCode: number
  duration: number
  timestamp: number
  error?: string
}

// 性能指标
interface PerformanceMetrics {
  name: string
  value: number
  timestamp: number
  metadata?: Record<string, unknown>
}

// 本地监控存储
class LocalMonitor {
  private apiMetrics: ApiMetrics[] = []
  private performanceMetrics: PerformanceMetrics[] = []
  private maxStoredMetrics = 1000

  // 记录 API 指标
  trackApiCall(metrics: ApiMetrics): void {
    this.apiMetrics.push(metrics)
    if (this.apiMetrics.length > this.maxStoredMetrics) {
      this.apiMetrics.shift()
    }
  }

  // 记录性能指标
  trackPerformance(metrics: PerformanceMetrics): void {
    this.performanceMetrics.push(metrics)
    if (this.performanceMetrics.length > this.maxStoredMetrics) {
      this.performanceMetrics.shift()
    }
  }

  // 获取 API 指标
  getApiMetrics(): ApiMetrics[] {
    return [...this.apiMetrics]
  }

  // 获取性能指标
  getPerformanceMetrics(): PerformanceMetrics[] {
    return [...this.performanceMetrics]
  }

  // 获取平均响应时间
  getAverageResponseTime(): number {
    if (this.apiMetrics.length === 0) return 0
    const sum = this.apiMetrics.reduce((acc, m) => acc + m.duration, 0)
    return sum / this.apiMetrics.length
  }

  // 获取错误率
  getErrorRate(): number {
    if (this.apiMetrics.length === 0) return 0
    const errors = this.apiMetrics.filter(m => m.statusCode >= 400 || m.error)
    return errors.length / this.apiMetrics.length
  }

  // 获取慢请求
  getSlowRequests(threshold = 3000): ApiMetrics[] {
    return this.apiMetrics.filter(m => m.duration > threshold)
  }

  // 清空指标
  clearMetrics(): void {
    this.apiMetrics = []
    this.performanceMetrics = []
  }
}

// 全局监控实例
export const localMonitor = new LocalMonitor()

// 初始化监控
export function initMonitoring(config: MonitoringConfig): void {
  if (!config.enabled) {
    console.log('[Monitor] 监控已禁用')
    return
  }

  if (config.sentryDsn && Sentry) {
    // 初始化 Sentry
    Sentry.init({
      dsn: config.sentryDsn,
      environment: config.environment,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      // 采样率
      tracesSampleRate: config.sampleRate,
      // Replay 采样率
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
    })
    console.log('[Monitor] Sentry 初始化完成')
  } else if (!Sentry) {
    console.log('[Monitor] 本地监控模式启用（Sentry 未安装）')
  } else {
    console.log('[Monitor] 本地监控模式启用')
  }
}

// API 请求监控包装器
export function withApiMonitoring<T>(
  url: string,
  method: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  const startTime = performance.now()
  
  return fetchFn()
    .then(result => {
      const duration = performance.now() - startTime
      localMonitor.trackApiCall({
        url,
        method,
        statusCode: 200,
        duration,
        timestamp: Date.now(),
      })
      return result
    })
    .catch(error => {
      const duration = performance.now() - startTime
      localMonitor.trackApiCall({
        url,
        method,
        statusCode: 0,
        duration,
        timestamp: Date.now(),
        error: error.message,
      })
      throw error
    })
}

// 创建性能追踪标记
export function createPerformanceMark(name: string): () => void {
  const startTime = performance.now()
  
  return () => {
    const duration = performance.now() - startTime
    localMonitor.trackPerformance({
      name,
      value: duration,
      timestamp: Date.now(),
    })
  }
}

// 错误上报
export function captureError(error: Error, context?: Record<string, unknown>): void {
  if (Sentry) {
    if (context) {
      Sentry.setContext('additional', context)
    }
    Sentry.captureException(error)
  } else {
    console.error('[Monitor] Error:', error.message, context)
  }
}

// 手动上报消息
export function captureMessage(message: string, level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' = 'info'): void {
  if (Sentry) {
    Sentry.captureMessage(message, level)
  } else {
    console.log('[Monitor] Message:', message, level)
  }
}

// 设置用户信息
export function setUser(userId: string, email?: string): void {
  if (Sentry) {
    Sentry.setUser({
      id: userId,
      email,
    })
  }
}

// 清除用户信息
export function clearUser(): void {
  if (Sentry) {
    Sentry.setUser(null)
  }
}

// 导出类型
export type { MonitoringConfig, ApiMetrics, PerformanceMetrics }
