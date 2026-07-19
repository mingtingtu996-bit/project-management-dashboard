import type { Response } from 'express'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as authConfig from '../auth/config.js'
import { clearAuthTokenCookie, setAuthTokenCookie } from '../auth/http.js'

const originalEnv = { ...process.env }
const JWT_CONFIG = authConfig.JWT_CONFIG

function assertAuthRuntimeConfiguration() {
  const assertion = (authConfig as unknown as {
    assertAuthRuntimeConfiguration?: () => void
  }).assertAuthRuntimeConfiguration
  expect(typeof assertion, 'assertAuthRuntimeConfiguration must be exported').toBe('function')
  assertion?.()
}

function setProductionEnvironment(target: 'production' | 'staging') {
  process.env.NODE_ENV = 'production'
  process.env.DEPLOY_TARGET = target
  process.env.JWT_SECRET = `${target}-jwt-secret-with-at-least-32-bytes`
  process.env.JWT_ISSUER = `workbuddy-${target}`
  process.env.JWT_AUDIENCE = `workbuddy-${target}-api`
  process.env.AUTH_COOKIE_NAME = `workbuddy_${target}_auth_token`
  process.env.PUBLIC_INGRESS_MODE = 'temporary_ip_tls'
  process.env.PUBLIC_HTTPS_ORIGIN = target === 'production'
    ? 'https://124.222.54.190'
    : 'https://124.222.54.190:8443'
  process.env.CORS_ORIGIN = process.env.PUBLIC_HTTPS_ORIGIN
}

describe('auth runtime configuration', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('selects distinct production and staging cookie names, issuers, and audiences', () => {
    for (const target of ['production', 'staging'] as const) {
      setProductionEnvironment(target)
      expect(() => assertAuthRuntimeConfiguration()).not.toThrow()
      expect(JWT_CONFIG.cookie.name).toBe(`workbuddy_${target}_auth_token`)
      expect(JWT_CONFIG.issuer).toBe(`workbuddy-${target}`)
      expect(JWT_CONFIG.audience).toBe(`workbuddy-${target}-api`)
    }
  })

  it('rejects swapped cookie, issuer, audience, and implicit Supabase JWT fallback', () => {
    setProductionEnvironment('production')
    process.env.AUTH_COOKIE_NAME = 'workbuddy_staging_auth_token'
    expect(() => assertAuthRuntimeConfiguration()).toThrow(/AUTH_COOKIE_NAME/u)

    setProductionEnvironment('staging')
    process.env.JWT_ISSUER = 'workbuddy-production'
    expect(() => assertAuthRuntimeConfiguration()).toThrow(/JWT_ISSUER/u)

    setProductionEnvironment('production')
    process.env.JWT_AUDIENCE = 'workbuddy-staging-api'
    expect(() => assertAuthRuntimeConfiguration()).toThrow(/JWT_AUDIENCE/u)

    setProductionEnvironment('production')
    delete process.env.JWT_SECRET
    process.env.SUPABASE_JWT_SECRET = 'must-not-be-used-as-runtime-auth-secret'
    expect(() => assertAuthRuntimeConfiguration()).toThrow(/JWT_SECRET/u)
  })

  it('rejects missing, multi-origin, and cross-environment CORS configuration', () => {
    setProductionEnvironment('production')
    delete process.env.CORS_ORIGIN
    expect(() => assertAuthRuntimeConfiguration()).toThrow(/CORS_ORIGIN/u)

    setProductionEnvironment('production')
    process.env.CORS_ORIGIN = 'https://124.222.54.190,https://124.222.54.190:8443'
    expect(() => assertAuthRuntimeConfiguration()).toThrow(/CORS_ORIGIN/u)

    setProductionEnvironment('production')
    process.env.CORS_ORIGIN = 'https://124.222.54.190:8443'
    expect(() => assertAuthRuntimeConfiguration()).toThrow(/CORS_ORIGIN/u)

    setProductionEnvironment('staging')
    process.env.PUBLIC_HTTPS_ORIGIN = 'https://124.222.54.190'
    expect(() => assertAuthRuntimeConfiguration()).toThrow(/PUBLIC_HTTPS_ORIGIN/u)
  })

  it('rejects malformed public HTTPS origins at runtime startup', () => {
    for (const invalidOrigin of [
      'http://124.222.54.190',
      'https://user:password@124.222.54.190',
      'https://124.222.54.190/api',
      'https://124.222.54.190?environment=production',
    ]) {
      setProductionEnvironment('production')
      process.env.PUBLIC_HTTPS_ORIGIN = invalidOrigin
      process.env.CORS_ORIGIN = invalidOrigin
      expect(() => assertAuthRuntimeConfiguration()).toThrow(/PUBLIC_HTTPS_ORIGIN/u)
    }
  })

  it('never classifies an IPv6 literal as a domain HSTS origin', () => {
    setProductionEnvironment('production')
    process.env.PUBLIC_INGRESS_MODE = 'domain_hsts'
    process.env.PUBLIC_HTTPS_ORIGIN = 'https://[2001:db8::1]'
    process.env.CORS_ORIGIN = process.env.PUBLIC_HTTPS_ORIGIN

    expect(() => assertAuthRuntimeConfiguration()).toThrow(/PUBLIC_HTTPS_ORIGIN/u)
  })

  it('uses the configured cookie name for set and clear operations', () => {
    setProductionEnvironment('production')
    const response = {
      clearCookie: vi.fn(),
      cookie: vi.fn(),
    } as unknown as Response

    setAuthTokenCookie(response, 'token')
    clearAuthTokenCookie(response)

    expect(response.cookie).toHaveBeenCalledWith(
      'workbuddy_production_auth_token',
      'token',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict' }),
    )
    expect(response.clearCookie).toHaveBeenCalledWith(
      'workbuddy_production_auth_token',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'strict' }),
    )
  })

  it('retains the existing auth_token default in test mode', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.AUTH_COOKIE_NAME
    delete process.env.JWT_ISSUER
    delete process.env.JWT_AUDIENCE

    expect(JWT_CONFIG.cookie.name).toBe('auth_token')
    expect(JWT_CONFIG.issuer).toBe('construction-management-system')
    expect(JWT_CONFIG.audience).toBe('api-users')
  })
})
