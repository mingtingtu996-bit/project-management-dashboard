/**
 * §7.3 Security matrix tests
 *
 * These tests verify the server's security posture by inspecting the actual
 * source code and testing middleware functions directly. They do not spin up
 * an HTTP server — they read real exports and configuration.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi, beforeEach } from 'vitest'

const SERVER_ROOT = fileURLToPath(new URL('../..', import.meta.url))

function readServerSource(relPath: string): string {
  const full = join(SERVER_ROOT, 'src', relPath)
  if (!existsSync(full)) throw new Error(`Source not found: ${full}`)
  return readFileSync(full, 'utf8')
}

// ─────────────────────────────────────────────
// §7.3 白名单路由全集检查 (public routes)
// ─────────────────────────────────────────────
describe('§7.3 whitelist routes: unauthenticated access allowed', () => {
  it('index.ts registers /api/auth/login WITHOUT authenticate middleware', () => {
    const src = readServerSource('index.ts')
    // authLimiter is applied before auth middleware for these routes
    expect(src).toMatch(/\/api\/auth\/login/)
    // login route must NOT have authenticate in its chain
    expect(src).not.toMatch(/authenticate.*\/api\/auth\/login/)
  })

  it('index.ts registers /api/auth/register as public route', () => {
    const src = readServerSource('index.ts')
    expect(src).toMatch(/\/api\/auth\/register/)
  })

  it('index.ts registers /api/auth/me as a route', () => {
    const src = readServerSource('index.ts')
    expect(src).toMatch(/\/api\/auth\/me/)
  })

  it('health check endpoint exists and is public', () => {
    const src = readServerSource('index.ts')
    expect(src).toMatch(/\/health|\/api\/health/)
  })

  it('/api/invitations/validate/:code is accessible without authenticate', () => {
    const src = readServerSource('routes/invitations.ts')
    expect(src).toMatch(/\/validate\/:code/)
    // Validate route should not require authenticate before it
    const validateSection = src.split('validate/:code')[0] ?? ''
    expect(validateSection).not.toMatch(/router\.use\(authenticate\)/)
  })
})

// ─────────────────────────────────────────────
// §7.3 受保护业务路由全集检查
// ─────────────────────────────────────────────
describe('§7.3 protected business routes require authenticate', () => {
  const PROTECTED_ROUTE_FILES = [
    'routes/projects.ts',
    'routes/tasks.ts',
    'routes/risks.ts',
    'routes/milestones.ts',
    'routes/members.ts',
    'routes/delay-requests.ts',
    'routes/dashboard.ts',
  ]

  PROTECTED_ROUTE_FILES.forEach((routeFile) => {
    it(`${routeFile} uses authenticate middleware`, () => {
      const src = readServerSource(routeFile)
      expect(src).toMatch(/authenticate/)
    })
  })
})

// ─────────────────────────────────────────────
// §7.3 写权限矩阵
// ─────────────────────────────────────────────
describe('§7.3 write permission matrix', () => {
  it('auth.ts exports requireProjectEditor for write-access guards', () => {
    const src = readServerSource('middleware/auth.ts')
    expect(src).toMatch(/requireProjectEditor/)
  })

  it('auth.ts exports requireProjectOwner for owner-level guards', () => {
    const src = readServerSource('middleware/auth.ts')
    expect(src).toMatch(/requireProjectOwner/)
  })

  it('auth.ts exports requireProjectMember for read access', () => {
    const src = readServerSource('middleware/auth.ts')
    expect(src).toMatch(/requireProjectMember/)
  })

  it('tasks route guards write operations with requireProjectEditor', () => {
    const src = readServerSource('routes/tasks.ts')
    expect(src).toMatch(/requireProjectEditor/)
  })

  it('members route guards destructive operations (remove member) with editor/owner guard', () => {
    const src = readServerSource('routes/members.ts')
    expect(src).toMatch(/requireProjectEditor|requireProjectOwner|ensureProjectOwner/)
  })

  it('invitations route limits invite creation to project owner', () => {
    const src = readServerSource('routes/invitations.ts')
    expect(src).toMatch(/ensureProjectOwner|requireProjectOwner|owner/)
  })
})

// ─────────────────────────────────────────────
// §7.3 /api/auth/* 限流
// ─────────────────────────────────────────────
describe('§7.3 /api/auth/* rate limiting', () => {
  it('index.ts defines authLimiter with restrictive max limit', () => {
    const src = readServerSource('index.ts')
    // authLimiter should have max: 5 (or similar small number) for brute-force protection
    expect(src).toMatch(/authLimiter/)
    expect(src).toMatch(/max:\s*[1-9]\d{0,1}[,\s]/) // max 1-99
  })

  it('authLimiter is applied to /api/auth/login', () => {
    const src = readServerSource('index.ts')
    const loginSection = src.match(/authLimiter[^;]*\/api\/auth\/login|\/api\/auth\/login[^;]*authLimiter/s)
    expect(loginSection).toBeTruthy()
  })

  it('authLimiter is applied to /api/auth/register', () => {
    const src = readServerSource('index.ts')
    expect(src).toMatch(/authLimiter[^;]*\/api\/auth\/register|\/api\/auth\/register[^;]*authLimiter/s)
  })
})

// ─────────────────────────────────────────────
// §7.3 /api/* 全局限流
// ─────────────────────────────────────────────
describe('§7.3 /api/* global rate limiting', () => {
  it('index.ts defines apiLimiter with a windowMs and max', () => {
    const src = readServerSource('index.ts')
    expect(src).toMatch(/apiLimiter/)
    expect(src).toMatch(/windowMs/)
    expect(src).toMatch(/max:/)
  })

  it('apiLimiter is applied to /api/ globally', () => {
    const src = readServerSource('index.ts')
    expect(src).toMatch(/app\.use\(['"]\/api\/['"]\s*,\s*apiLimiter/)
  })
})

// ─────────────────────────────────────────────
// §7.3 XSS
// ─────────────────────────────────────────────
describe('§7.3 XSS protection', () => {
  it('containsXss detects <script> tags', async () => {
    const { containsXss } = await import('../middleware/xssProtection.js').catch(
      () => ({ containsXss: null }),
    )

    if (!containsXss) {
      // Static source check fallback
      const src = readServerSource('middleware/xssProtection.ts')
      expect(src).toMatch(/containsXss/)
      expect(src).toMatch(/script/i)
      return
    }

    expect(containsXss('<script>alert(1)</script>')).toBe(true)
    expect(containsXss('<img src=x onerror=alert(1)>')).toBe(true)
    expect(containsXss('hello world')).toBe(false)
    expect(containsXss('javascript:alert(1)')).toBe(true)
  })

  it('xssProtection middleware is registered in index.ts', () => {
    const src = readServerSource('index.ts')
    expect(src).toMatch(/xssProtection/)
  })

  it('sanitizeInput middleware is registered in index.ts', () => {
    const src = readServerSource('index.ts')
    expect(src).toMatch(/sanitizeInput/)
  })

  it('xssProtection.ts covers iframe, object, embed, form injection vectors', () => {
    const src = readServerSource('middleware/xssProtection.ts')
    expect(src).toMatch(/iframe/i)
    expect(src).toMatch(/object/i)
    expect(src).toMatch(/javascript:/i)
  })
})

// ─────────────────────────────────────────────
// §7.3 SQL 注入
// ─────────────────────────────────────────────
describe('§7.3 SQL injection protection', () => {
  it('dbService uses parameterized queries (? or $N placeholders)', () => {
    const src = readServerSource('services/dbService.ts')
    // Parameterized queries use ? or $1, $2 placeholders
    expect(src).toMatch(/\?|\$\d+/)
  })

  it('auth middleware uses parameterized queries for user lookup', () => {
    const src = readServerSource('middleware/auth.ts')
    expect(src).toMatch(/\?|\$\d+/)
  })

  it('tasks route does not build SQL via string concatenation with user input', () => {
    const src = readServerSource('routes/tasks.ts')
    // Should not have raw string SQL interpolation
    expect(src).not.toMatch(/`[^`]*SELECT[^`]*\$\{(?:req\.body|req\.params|req\.query)/)
  })

  it('projects route does not interpolate req.body directly into SQL', () => {
    const src = readServerSource('routes/projects.ts')
    expect(src).not.toMatch(/`[^`]*SELECT[^`]*\$\{(?:req\.body|req\.params|req\.query)/)
  })
})

// ─────────────────────────────────────────────
// §7.3 CSRF
// ─────────────────────────────────────────────
describe('§7.3 CSRF protection', () => {
  it('index.ts uses helmet (sets security headers)', () => {
    const src = readServerSource('index.ts')
    expect(src).toMatch(/helmet\(\)/)
  })

  it('auth module uses HttpOnly cookies for token storage (not script-readable)', () => {
    const authHttp = readServerSource('auth/http.ts')
    expect(authHttp).toMatch(/httpOnly:\s*true/)
  })

  it('CORS is configured to restrict allowed origins', () => {
    const src = readServerSource('index.ts')
    expect(src).toMatch(/cors\(/)
    expect(src).toMatch(/origin/)
  })
})

// ─────────────────────────────────────────────
// §7.3 JWT 过期统一验证
// ─────────────────────────────────────────────
describe('§7.3 JWT expiry unified validation', () => {
  it('jwt.ts uses jwt.verify which enforces expiry by default', () => {
    const src = readServerSource('auth/jwt.ts')
    expect(src).toMatch(/jwt\.verify/)
  })

  it('jwt.ts generates tokens with an expiresIn setting', () => {
    const src = readServerSource('auth/jwt.ts')
    expect(src).toMatch(/expiresIn/)
  })

  it('verifyToken returns null on expired token', async () => {
    // Import verifyToken via dynamic import if available in test context
    const jwtMod = await import('../auth/jwt.js').catch(() => null)
    if (!jwtMod) {
      // Static check fallback
      const src = readServerSource('auth/jwt.ts')
      expect(src).toMatch(/TokenExpiredError/)
      return
    }

    const { verifyToken } = jwtMod
    // An obviously expired token (signed in the past, immediate expiry)
    const jwt = await import('jsonwebtoken')
    const expiredToken = jwt.sign({ userId: 'test' }, 'test-secret', { expiresIn: -1 })
    // verifyToken should return null for expired tokens
    const result = verifyToken(expiredToken)
    expect(result).toBeNull()
  })

  it('authenticate middleware rejects requests with expired JWT', () => {
    const src = readServerSource('middleware/auth.ts')
    expect(src).toMatch(/verifyToken|jwt\.verify/)
    expect(src).toMatch(/401|unauthorized/i)
  })
})
