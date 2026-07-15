import { getClient } from '../database.js'
import { logger } from '../middleware/logger.js'

type SchedulerLeadershipOptions = {
  ownerId: string
  onLost?: (error: Error) => void
}

export type SchedulerLeadership = {
  ownerId: string
  release: () => Promise<void>
}

const SCHEDULER_LOCK_NAMESPACE = 'workbuddy_scheduler_leadership'
const SCHEDULER_LOCK_NAME = 'primary'

export async function acquireSchedulerLeadership(
  options: SchedulerLeadershipOptions,
): Promise<SchedulerLeadership | null> {
  const client = await getClient()
  let released = false
  let lost = false

  const reportLost = (cause?: unknown) => {
    if (released || lost) return
    lost = true
    const error = cause instanceof Error
      ? cause
      : new Error('Scheduler leadership database connection ended')
    logger.error('scheduler leadership lost', {
      ownerId: options.ownerId,
      error: error.message,
    })
    options.onLost?.(error)
  }

  try {
    const result = await client.query(
      'SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS acquired',
      [SCHEDULER_LOCK_NAMESPACE, SCHEDULER_LOCK_NAME],
    )
    if (result.rows?.[0]?.acquired !== true) {
      client.release()
      logger.warn('scheduler leadership is held by another runtime', {
        ownerId: options.ownerId,
      })
      return null
    }

    client.on('error', reportLost)
    client.on('end', reportLost)
    logger.info('scheduler leadership acquired', { ownerId: options.ownerId })

    return {
      ownerId: options.ownerId,
      release: async () => {
        if (released) return
        released = true
        client.removeListener('error', reportLost)
        client.removeListener('end', reportLost)
        try {
          if (!lost) {
            const unlock = await client.query(
              'SELECT pg_advisory_unlock(hashtext($1), hashtext($2)) AS released',
              [SCHEDULER_LOCK_NAMESPACE, SCHEDULER_LOCK_NAME],
            )
            if (unlock.rows?.[0]?.released !== true) {
              throw new Error('Scheduler leadership lock was not held by this database session')
            }
          }
        } finally {
          client.release()
        }
      },
    }
  } catch (error) {
    client.release()
    throw error
  }
}
