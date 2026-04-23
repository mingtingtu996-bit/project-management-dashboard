import { query } from '../database.js'
import { logger } from '../middleware/logger.js'
import { cleanupJobFailures } from './jobRuntime.js'

export interface DataRetentionResult {
  operationLogsDeleted: number
  taskProgressSnapshotsDeleted: number
  changeLogsDeleted: number
  jobFailuresDeleted: number
}

const OPERATION_LOG_RETENTION_DAYS = 90
const JOB_FAILURE_RETENTION_DAYS = 30

export class DataRetentionService {
  async runRetentionPolicy(): Promise<DataRetentionResult> {
    const operationLogsDeleted = await this.cleanupOperationLogs()
    const taskProgressSnapshotsDeleted = await this.cleanupTaskProgressSnapshots()
    const changeLogsDeleted = await this.cleanupArchivedChangeLogs()
    const jobFailuresDeleted = await cleanupJobFailures(JOB_FAILURE_RETENTION_DAYS)

    logger.info('[dataRetentionService] retention policy executed', {
      operationLogsDeleted,
      taskProgressSnapshotsDeleted,
      changeLogsDeleted,
      jobFailuresDeleted,
    })

    return {
      operationLogsDeleted,
      taskProgressSnapshotsDeleted,
      changeLogsDeleted,
      jobFailuresDeleted,
    }
  }

  private async cleanupOperationLogs() {
    const result = await query(
      `DELETE FROM public.operation_logs
        WHERE created_at < NOW() - ($1 * INTERVAL '1 day')`,
      [OPERATION_LOG_RETENTION_DAYS],
    )

    return result.rowCount ?? 0
  }

  private async cleanupTaskProgressSnapshots() {
    // 任务快照承载完整生命周期事件链，按治理口径长期保留，不做日常清理。
    return 0
  }

  private async cleanupArchivedChangeLogs() {
    // change_logs 是流程治理审计主链，按完整生命周期保留，不做日常清理。
    return 0
  }
}
