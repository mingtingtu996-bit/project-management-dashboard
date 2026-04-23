import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { asyncHandler } from '../middleware/errorHandler.js'
import { authenticate } from '../middleware/auth.js'
import { logger } from '../middleware/logger.js'
import { executeSQL, executeSQLOne } from '../services/dbService.js'
import type { ApiResponse } from '../types/index.js'
import type { CertificateDependency } from '../types/db.js'

const router = Router({ mergeParams: true })
router.use(authenticate)

function buildDependencyNodeKey(type: string, id: string) {
  return `${type.trim()}:${id.trim()}`
}

function wouldIntroduceDependencyCycle(
  dependencies: CertificateDependency[],
  candidate: Pick<
    CertificateDependency,
    'predecessor_type' | 'predecessor_id' | 'successor_type' | 'successor_id'
  >,
) {
  const predecessorKey = buildDependencyNodeKey(candidate.predecessor_type, candidate.predecessor_id)
  const successorKey = buildDependencyNodeKey(candidate.successor_type, candidate.successor_id)

  if (!predecessorKey || !successorKey || predecessorKey === successorKey) {
    return true
  }

  const adjacency = new Map<string, Set<string>>()
  for (const dependency of dependencies) {
    const from = buildDependencyNodeKey(dependency.predecessor_type, dependency.predecessor_id)
    const to = buildDependencyNodeKey(dependency.successor_type, dependency.successor_id)
    if (!adjacency.has(from)) {
      adjacency.set(from, new Set<string>())
    }
    adjacency.get(from)!.add(to)
  }

  const visited = new Set<string>()
  const stack = [successorKey]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current === predecessorKey) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const next of adjacency.get(current) ?? []) {
      if (!visited.has(next)) {
        stack.push(next)
      }
    }
  }

  return false
}

export const certificateDependencyContracts = {
  types: ['CertificateDependency'],
  endpoints: [
    {
      method: 'GET',
      path: '/api/projects/:projectId/certificate-dependencies',
      requestShape: '{ projectId: string, certificate_id?: string }',
      responseShape: '{ items: CertificateDependency[] }',
      errorCodes: ['NOT_FOUND', 'VALIDATION_ERROR'],
    },
    {
      method: 'POST',
      path: '/api/projects/:projectId/certificate-dependencies',
      requestShape: '{ predecessor_type: "certificate" | "work_item", predecessor_id: string, successor_type: "certificate" | "work_item", successor_id: string, dependency_kind?: "hard" | "soft" }',
      responseShape: 'CertificateDependency',
      errorCodes: ['VALIDATION_ERROR', 'DEPENDENCY_CYCLE_DETECTED'],
    },
    {
      method: 'DELETE',
      path: '/api/projects/:projectId/certificate-dependencies/:id',
      requestShape: '{ id: string }',
      responseShape: '{ success: boolean }',
      errorCodes: ['NOT_FOUND'],
    },
  ],
} as const

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string | undefined
    const certificateId = req.query.certificate_id as string | undefined

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    logger.info('Fetching certificate dependencies', { projectId, certificateId })

    let data = (await executeSQL(
      'SELECT * FROM certificate_dependencies WHERE project_id = ? ORDER BY created_at ASC',
      [projectId]
    )) as CertificateDependency[]

    if (certificateId) {
      data = data.filter(
        (dependency) =>
          dependency.predecessor_id === certificateId || dependency.successor_id === certificateId
      )
    }

    const response: ApiResponse<typeof data> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string | undefined
    const {
      predecessor_type,
      predecessor_id,
      successor_type,
      successor_id,
      dependency_kind = 'hard',
      notes,
    } = req.body ?? {}

    if (!projectId || !predecessor_type || !predecessor_id || !successor_type || !successor_id) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId, predecessor_type, predecessor_id, successor_type, successor_id 不能为空',
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    const existingDependencies = (await executeSQL(
      'SELECT * FROM certificate_dependencies WHERE project_id = ? ORDER BY created_at ASC',
      [projectId],
    )) as CertificateDependency[]

    if (wouldIntroduceDependencyCycle(existingDependencies, {
      predecessor_type,
      predecessor_id,
      successor_type,
      successor_id,
    })) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'DEPENDENCY_CYCLE_DETECTED',
          message: '当前依赖关系会形成闭环，请调整前后置关系后再试',
        },
        timestamp: new Date().toISOString(),
      }
      return res.status(409).json(response)
    }

    const id = uuidv4()
    const now = new Date().toISOString()

    await executeSQL(
      `INSERT INTO certificate_dependencies
       (id, project_id, predecessor_type, predecessor_id, successor_type, successor_id, dependency_kind, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        projectId,
        predecessor_type,
        predecessor_id,
        successor_type,
        successor_id,
        dependency_kind,
        notes ?? null,
        now,
      ]
    )

    const data = await executeSQLOne('SELECT * FROM certificate_dependencies WHERE id = ? LIMIT 1', [id])
    const response: ApiResponse<CertificateDependency> = {
      success: true,
      data: data as CertificateDependency,
      timestamp: new Date().toISOString(),
    }
    res.status(201).json(response)
  })
)

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const projectId = req.params.projectId as string | undefined
    const { id } = req.params

    if (!projectId) {
      const response: ApiResponse = {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId 不能为空' },
        timestamp: new Date().toISOString(),
      }
      return res.status(400).json(response)
    }

    await executeSQL('DELETE FROM certificate_dependencies WHERE id = ? AND project_id = ?', [id, projectId])

    const response: ApiResponse = {
      success: true,
      timestamp: new Date().toISOString(),
    }
    res.json(response)
  })
)

export default router
