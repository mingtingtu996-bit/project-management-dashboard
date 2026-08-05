import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateWorkspaceIsolationGuard } from '../../scripts/guard-workspace-isolation.mjs'

function makeFixture(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'workspace-isolation-guard-'))
  const routesDir = join(root, 'src', 'routes')
  mkdirSync(routesDir, { recursive: true })
  for (const [name, source] of Object.entries(files)) {
    const target = name.includes('/') ? join(root, 'src', name) : join(routesDir, name)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, source, 'utf8')
  }
  return root
}

describe('workspace isolation guard', () => {
  it('blocks tenant data route handlers without company or project isolation signals', () => {
    const root = makeFixture({
      'unsafe.ts': `
        import { Router } from 'express'
        import { executeSQL } from '../services/dbService.js'
        const router = Router()
        router.get('/unsafe', async (_req, res) => {
          const rows = await executeSQL('SELECT id, name FROM projects WHERE deleted_at IS NULL', [])
          res.json(rows)
        })
        export default router
      `,
    })

    const result = evaluateWorkspaceIsolationGuard(root)

    expect(result.violations).toEqual([
      expect.objectContaining({
        reason: 'tenant_data_route_without_company_or_project_isolation_signal',
      }),
    ])
  })

  it('allows current-company scoped tenant route handlers', () => {
    const root = makeFixture({
      'safe.ts': `
        import { Router } from 'express'
        import { getCurrentCompanyMembership } from '../auth/access.js'
        import { getRequestCompanyId } from '../auth/companyContext.js'
        import { executeSQL } from '../services/dbService.js'
        const router = Router()
        router.get('/safe', async (req, res) => {
          const membership = await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
          const rows = await executeSQL('SELECT id, name FROM projects WHERE company_id = ?', [membership.companyId])
          res.json(rows)
        })
        export default router
      `,
    })

    const result = evaluateWorkspaceIsolationGuard(root)

    expect(result.violations).toEqual([])
  })

  it('does not let an earlier scoped route exempt a later unscoped route in the same file', () => {
    const root = makeFixture({
      'mixed.ts': `
        import { Router } from 'express'
        import { getCurrentCompanyMembership } from '../auth/access.js'
        import { getRequestCompanyId } from '../auth/companyContext.js'
        import { executeSQL } from '../services/dbService.js'
        const router = Router()
        router.get('/safe', async (req, res) => {
          const membership = await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
          const rows = await executeSQL('SELECT id FROM projects WHERE company_id = ?', [membership.companyId])
          res.json(rows)
        })
        router.get('/unsafe', async (_req, res) => {
          const rows = await executeSQL('SELECT id FROM projects', [])
          res.json(rows)
        })
        export default router
      `,
    })

    const result = evaluateWorkspaceIsolationGuard(root)

    expect(result.violations).toEqual([
      expect.objectContaining({
        line: 12,
        reason: 'tenant_data_route_without_company_or_project_isolation_signal',
      }),
    ])
  })

  it('resolves named route handlers before deciding whether the route is scoped', () => {
    const root = makeFixture({
      'named-handler.ts': `
        import { Router } from 'express'
        import { getCurrentCompanyMembership } from '../auth/access.js'
        import { getRequestCompanyId } from '../auth/companyContext.js'
        import { executeSQL } from '../services/dbService.js'
        const router = Router()
        async function handleProjects(req, res) {
          const membership = await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
          const rows = await executeSQL('SELECT id FROM projects WHERE company_id = ?', [membership.companyId])
          res.json(rows)
        }
        router.get('/projects', handleProjects)
        export default router
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([])
  })

  it('does not treat req.query as a database query', () => {
    const root = makeFixture({
      'query-filter.ts': `
        import { Router } from 'express'
        import { getCurrentCompanyMembership } from '../auth/access.js'
        import { getRequestCompanyId } from '../auth/companyContext.js'
        import { executeSQL } from '../services/dbService.js'
        const router = Router()
        router.get('/filter', async (req, res) => res.json({ filter: req.query.filter }))
        router.get('/projects', async (req, res) => {
          const membership = await getCurrentCompanyMembership(req.user.id, getRequestCompanyId(req))
          const rows = await executeSQL('SELECT id FROM projects WHERE company_id = ?', [membership.companyId])
          res.json(rows)
        })
        export default router
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([])
  })

  it('does not accept a caller supplied companyId as proof of membership', () => {
    const root = makeFixture({
      'untrusted-company.ts': `
        import { Router } from 'express'
        import { executeSQL } from '../services/dbService.js'
        const router = Router()
        router.get('/projects', async (req, res) => {
          const companyId = req.query.companyId
          const rows = await executeSQL('SELECT id FROM projects WHERE company_id = ?', [companyId])
          res.json(rows)
        })
        export default router
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([
      expect.objectContaining({
        reason: 'tenant_data_route_without_company_or_project_isolation_signal',
      }),
    ])
  })

  it('allows explicit global read-only catalog approvals', () => {
    const root = makeFixture({
      'catalog.ts': `
        import { Router } from 'express'
        import { executeSQL } from '../services/dbService.js'
        const router = Router()
        // workspace-isolation-global-read-approved: public demo catalog only, not tenant workspace data.
        router.get('/catalog', async (_req, res) => {
          const rows = await executeSQL('SELECT id, name FROM projects WHERE metadata->>\\'is_system_example\\' = \\'true\\'', [])
          res.json(rows)
        })
        export default router
      `,
    })

    const result = evaluateWorkspaceIsolationGuard(root)

    expect(result.violations).toEqual([])
  })

  it('allows explicit single-use capability reads such as invitation-code validation', () => {
    const root = makeFixture({
      'capability.ts': `
        import { Router } from 'express'
        import { supabase } from '../services/dbService.js'
        const router = Router()
        // workspace-isolation-capability-read-approved: random invitation code is the pre-membership capability.
        router.get('/invitations/:code', async (req, res) => {
          const row = await supabase.from('project_invitations').select('project_id, company_id').eq('invitation_code', req.params.code).single()
          res.json(row)
        })
        export default router
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([])
  })

  it('allows explicitly reviewed fixed capability reads in service functions', () => {
    const root = makeFixture({
      'empty.ts': `import { Router } from 'express'; export default Router()`,
      'services/project-capability.ts': `
        import { executeSQL } from './dbService.js'
        // workspace-isolation-capability-read-approved: this fixed lookup resolves a project's owning company before downstream scoped reads.
        export async function resolveProjectCompany(lookupKey: string) {
          return executeSQL('SELECT company_id FROM public.projects WHERE id = $1::uuid LIMIT 1', [lookupKey])
        }
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([])
  })

  it('allows an explicitly reviewed capability write such as accepting an invitation', () => {
    const root = makeFixture({
      'capability-write.ts': `
        import { Router } from 'express'
        import { supabase } from '../services/dbService.js'
        const router = Router()
        // workspace-isolation-capability-write-approved: authenticated user accepts a single-use invitation code.
        router.post('/invitations/:code/accept', async (req, res) => {
          await supabase.from('project_members').insert({ project_id: req.body.projectId, user_id: req.user.id })
          res.json({ success: true })
        })
        export default router
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([])
  })

  it('does not treat matching project_members.user_id to the caller as project authorization', () => {
    const root = makeFixture({
      'unsafe-membership-write.ts': `
        import { Router } from 'express'
        import { supabase } from '../services/dbService.js'
        const router = Router()
        router.post('/projects/:projectId/members', async (req, res) => {
          await supabase.from('project_members').insert({ project_id: req.params.projectId, user_id: req.user.id })
          res.json({ success: true })
        })
        export default router
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([
      expect.objectContaining({
        reason: 'tenant_data_route_without_company_or_project_isolation_signal',
      }),
    ])
  })

  it('allows an explicitly reviewed public company directory', () => {
    const root = makeFixture({
      'directory.ts': `
        import { Router } from 'express'
        import { supabase } from '../services/dbService.js'
        const router = Router()
        // workspace-isolation-public-directory-approved: only searchable company names are returned.
        router.get('/companies/search', async (_req, res) => {
          const rows = await supabase.from('companies').select('id, name').eq('discoverability', 'searchable')
          res.json(rows)
        })
        export default router
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([])
  })

  it('allows personal rows constrained to the authenticated user id', () => {
    const root = makeFixture({
      'personal.ts': `
        import { Router } from 'express'
        import { supabase } from '../services/dbService.js'
        const router = Router()
        router.delete('/join-request/:id', async (req, res) => {
          const userId = req.user.id
          await supabase.from('company_join_requests').delete().eq('id', req.params.id).eq('user_id', userId)
          res.json({ success: true })
        })
        export default router
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([])
  })

  it('blocks service functions that access tenant tables without an explicit company or project scope', () => {
    const root = makeFixture({
      'empty.ts': `import { Router } from 'express'; export default Router()`,
      'services/unsafe.ts': `
        import { executeSQL } from './dbService.js'
        export async function listAllProjects() {
          return executeSQL('SELECT id, company_id FROM projects', [])
        }
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([
      expect.objectContaining({
        reason: 'tenant_data_service_without_explicit_scope',
      }),
    ])
  })

  it('allows service functions whose database access is explicitly company scoped', () => {
    const root = makeFixture({
      'empty.ts': `import { Router } from 'express'; export default Router()`,
      'services/safe.ts': `
        import { executeSQL } from './dbService.js'
        export async function listProjectsForCompany(companyId: string) {
          return executeSQL('SELECT id FROM projects WHERE company_id = ?', [companyId])
        }
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([])
  })

  it('does not accept an unused companyId parameter as proof that the database call is scoped', () => {
    const root = makeFixture({
      'empty.ts': `import { Router } from 'express'; export default Router()`,
      'services/unused-scope.ts': `
        import { executeSQL } from './dbService.js'
        export async function listProjectsForCompany(companyId: string) {
          return executeSQL('SELECT id, company_id FROM projects', [])
        }
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([
      expect.objectContaining({
        reason: 'tenant_data_service_without_bound_scope',
      }),
    ])
  })

  it('does not accept scope used only for logging while the database call remains unscoped', () => {
    const root = makeFixture({
      'empty.ts': `import { Router } from 'express'; export default Router()`,
      'services/log-only-scope.ts': `
        import { executeSQL } from './dbService.js'
        export async function listProjectsForCompany(companyId: string) {
          console.info({ companyId })
          return executeSQL('SELECT id, company_id FROM projects', [])
        }
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([
      expect.objectContaining({
        reason: 'tenant_data_service_without_bound_scope',
      }),
    ])
  })

  it('recognizes company and project scope declared through a local input type', () => {
    const root = makeFixture({
      'empty.ts': `import { Router } from 'express'; export default Router()`,
      'services/typed-scope.ts': `
        import { executeSQL } from './dbService.js'
        interface ProjectReadInput { projectId: string; limit?: number }
        export async function listProjectTasks(input: ProjectReadInput) {
          return executeSQL('INSERT INTO tasks (project_id) VALUES (?)', [input.projectId])
        }
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([])
  })

  it('lets transaction callbacks inherit the enclosing service scope', () => {
    const root = makeFixture({
      'empty.ts': `import { Router } from 'express'; export default Router()`,
      'services/transaction.ts': `
        import { getClient } from '../database.js'
        export async function updateProject(projectId: string) {
          const client = await getClient()
          return async function runTransaction() {
            return client.query('UPDATE projects SET updated_at = NOW() WHERE id = $1', [projectId])
          }
        }
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([])
  })

  it('does not let one scoped service function exempt a later unscoped function', () => {
    const root = makeFixture({
      'empty.ts': `import { Router } from 'express'; export default Router()`,
      'services/mixed.ts': `
        import { executeSQL } from './dbService.js'
        export async function listProjectsForCompany(companyId: string) {
          return executeSQL('SELECT id FROM projects WHERE company_id = ?', [companyId])
        }
        export async function listAllProjects() {
          return executeSQL('SELECT id FROM projects', [])
        }
      `,
    })

    expect(evaluateWorkspaceIsolationGuard(root).violations).toEqual([
      expect.objectContaining({
        reason: 'tenant_data_service_without_explicit_scope',
      }),
    ])
  })
})
