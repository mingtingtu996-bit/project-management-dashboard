import { isTruthyFlag, normalizeStatus } from './statusHelpers.js'

export type ObstacleStatusLike = {
  is_resolved?: boolean | number | null
  status?: string | null
}

export const RESOLVED_OBSTACLE_STATUSES = new Set(['resolved', 'closed', '已解决'])

export function isActiveObstacle(obstacle: ObstacleStatusLike): boolean {
  if (obstacle.is_resolved !== undefined && obstacle.is_resolved !== null) {
    return !isTruthyFlag(obstacle.is_resolved)
  }

  return !RESOLVED_OBSTACLE_STATUSES.has(normalizeStatus(obstacle.status))
}
