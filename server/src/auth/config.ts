/**
 * JWT配置文件
 */

import { isIP } from 'node:net'

const AUTH_RUNTIME_TARGETS = {
  production: {
    audience: 'workbuddy-production-api',
    cookieName: 'workbuddy_production_auth_token',
    issuer: 'workbuddy-production',
  },
  staging: {
    audience: 'workbuddy-staging-api',
    cookieName: 'workbuddy_staging_auth_token',
    issuer: 'workbuddy-staging',
  },
} as const

const COOKIE_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u

function validatedCookieName(value: string): string {
  if (!COOKIE_NAME_PATTERN.test(value)) {
    throw new Error('AUTH_COOKIE_NAME must be an RFC token-safe cookie name')
  }
  return value
}

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production'
}

function productionTarget() {
  const target = process.env.DEPLOY_TARGET
  if (target === 'production' || target === 'staging') return target
  throw new Error('DEPLOY_TARGET must be production or staging in the production runtime')
}

function productionValue(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required in the production runtime`)
  return value
}

export function normalizePublicHttpsOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('PUBLIC_HTTPS_ORIGIN must be an exact HTTPS origin')
  }
  if (url.protocol !== 'https:'
    || url.username
    || url.password
    || url.pathname !== '/'
    || url.search
    || url.hash
    || value !== url.origin) {
    throw new Error('PUBLIC_HTTPS_ORIGIN must be an exact HTTPS origin')
  }
  return url.origin
}

function assertPublicOriginMatchesTarget(target: keyof typeof AUTH_RUNTIME_TARGETS): string {
  const ingressMode = productionValue('PUBLIC_INGRESS_MODE')
  const publicOrigin = normalizePublicHttpsOrigin(productionValue('PUBLIC_HTTPS_ORIGIN'))
  const url = new URL(publicOrigin)
  const effectivePort = url.port || '443'
  const ipHost = url.hostname.startsWith('[') && url.hostname.endsWith(']')
    ? url.hostname.slice(1, -1)
    : url.hostname
  const ipVersion = isIP(ipHost)

  if (ingressMode === 'temporary_ip_tls') {
    const expectedPort = target === 'production' ? '443' : '8443'
    if (ipVersion !== 4 || effectivePort !== expectedPort) {
      throw new Error(`PUBLIC_HTTPS_ORIGIN does not match temporary_ip_tls ${target}`)
    }
  } else if (ingressMode === 'domain_hsts') {
    if (ipVersion !== 0 || effectivePort !== '443') {
      throw new Error(`PUBLIC_HTTPS_ORIGIN does not match domain_hsts ${target}`)
    }
  } else {
    throw new Error('PUBLIC_INGRESS_MODE must be temporary_ip_tls or domain_hsts')
  }

  return publicOrigin
}

export function assertAuthRuntimeConfiguration(): void {
  if (!isProductionRuntime()) return

  const target = productionTarget()
  const expected = AUTH_RUNTIME_TARGETS[target]
  const checks = [
    ['AUTH_COOKIE_NAME', expected.cookieName],
    ['JWT_ISSUER', expected.issuer],
    ['JWT_AUDIENCE', expected.audience],
  ] as const

  for (const [name, expectedValue] of checks) {
    if (productionValue(name) !== expectedValue) {
      throw new Error(`${name} must equal ${expectedValue} for ${target}`)
    }
  }

  if (productionValue('JWT_SECRET').length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters in the production runtime')
  }

  const publicOrigin = assertPublicOriginMatchesTarget(target)
  const corsOrigin = productionValue('CORS_ORIGIN')
  if (corsOrigin.includes(',') || corsOrigin !== publicOrigin) {
    throw new Error('CORS_ORIGIN must exactly equal PUBLIC_HTTPS_ORIGIN in the production runtime')
  }
}

export const JWT_CONFIG = {
  // JWT密钥（使用 getter 延迟读取，避免模块在 dotenv.config() 之前初始化时读到空值）
  get secret(): string {
    if (isProductionRuntime()) return productionValue('JWT_SECRET')
    return (
      process.env.JWT_SECRET ||
      process.env.SUPABASE_JWT_SECRET ||
      ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test')
        ? 'dev-local-jwt-secret'
        : '')
    );
  },

  // 访问令牌有效期（7天）
  accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '7d',

  // 令牌签发者
  get issuer(): string {
    return isProductionRuntime()
      ? productionValue('JWT_ISSUER')
      : (process.env.JWT_ISSUER || 'construction-management-system')
  },

  // 令牌受众
  get audience(): string {
    return isProductionRuntime()
      ? productionValue('JWT_AUDIENCE')
      : (process.env.JWT_AUDIENCE || 'api-users')
  },

  // Cookie配置
  cookie: {
    get name(): string {
      return validatedCookieName(isProductionRuntime()
        ? productionValue('AUTH_COOKIE_NAME')
        : (process.env.AUTH_COOKIE_NAME || 'auth_token'))
    },
    httpOnly: true,
    get secure(): boolean {
      return isProductionRuntime()
    },
    sameSite: 'strict' as const,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
    path: '/',
  },
};
