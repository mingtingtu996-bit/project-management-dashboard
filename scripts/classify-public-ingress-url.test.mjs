import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const modulePath = resolve(import.meta.dirname, 'classify-public-ingress-url.mjs')

async function loadClassifier() {
  assert.ok(existsSync(modulePath), 'scripts/classify-public-ingress-url.mjs must exist')
  return import(pathToFileURL(modulePath).href)
}

test('classifies a public IPv4 health URL as ineligible for HSTS policy', async () => {
  const { classifyPublicIngressUrl } = await loadClassifier()

  assert.deepEqual(
    classifyPublicIngressUrl({
      environment: 'staging',
      expectedMode: 'temporary_ip_tls',
      expectedHost: '124.222.54.190',
      redirectValue: 'http://124.222.54.190/staging-redirect/api/readyz',
      value: 'https://124.222.54.190:8443/api/readyz',
    }),
    {
      environment: 'staging',
      hostKind: 'ipv4',
      hstsUserAgentPolicyApplicable: false,
      ingressMode: 'temporary_ip_tls',
      pass: true,
      port: 8443,
      reasonCodes: ['hsts_policy_inapplicable_ip_literal'],
    },
  )

})

test('allows an explicitly approved production IP mode without claiming domain HSTS', async () => {
  const { classifyPublicIngressUrl } = await loadClassifier()

  const ipLiteral = classifyPublicIngressUrl({
    environment: 'production',
    expectedMode: 'temporary_ip_tls',
    expectedHost: '124.222.54.190',
    redirectValue: 'http://124.222.54.190/api/readyz',
    value: 'https://124.222.54.190/api/readyz',
  })
  assert.equal(ipLiteral.pass, true)
  assert.equal(ipLiteral.hstsUserAgentPolicyApplicable, false)
  assert.equal(ipLiteral.ingressMode, 'temporary_ip_tls')
  assert.deepEqual(ipLiteral.reasonCodes, ['hsts_policy_inapplicable_ip_literal'])

  assert.deepEqual(
    classifyPublicIngressUrl({
      environment: 'production',
      expectedMode: 'domain_hsts',
      expectedHost: 'app.workbuddy.cn',
      redirectValue: 'http://app.workbuddy.cn/api/readyz',
      value: 'https://app.workbuddy.cn/api/readyz',
    }),
    {
      environment: 'production',
      hostKind: 'dns',
      hstsUserAgentPolicyApplicable: true,
      ingressMode: 'domain_hsts',
      pass: true,
      port: 443,
      reasonCodes: [],
    },
  )
})

test('rejects non-HTTPS, non-readyz, credential-bearing, and unsupported targets', async () => {
  const { classifyPublicIngressUrl } = await loadClassifier()

  for (const input of [
    { environment: 'staging', expectedMode: 'temporary_ip_tls', expectedHost: '124.222.54.190', redirectValue: 'http://124.222.54.190/staging-redirect/api/readyz', value: 'http://124.222.54.190/api/readyz' },
    { environment: 'staging', expectedMode: 'temporary_ip_tls', expectedHost: '124.222.54.190', redirectValue: 'http://124.222.54.190/staging-redirect/api/readyz', value: 'https://124.222.54.190/health' },
    { environment: 'staging', expectedMode: 'temporary_ip_tls', expectedHost: '124.222.54.190', redirectValue: 'http://124.222.54.190/staging-redirect/api/readyz', value: 'https://user:pass@124.222.54.190/api/readyz' },
    { environment: 'preview', expectedMode: 'domain_hsts', expectedHost: 'app.workbuddy.cn', redirectValue: 'http://app.workbuddy.cn/api/readyz', value: 'https://app.workbuddy.cn/api/readyz' },
    { environment: 'production', expectedMode: 'domain_hsts', expectedHost: '124.222.54.190', redirectValue: 'http://124.222.54.190/api/readyz', value: 'https://124.222.54.190/api/readyz' },
    { environment: 'production', expectedMode: 'temporary_ip_tls', expectedHost: 'app.workbuddy.cn', redirectValue: 'http://app.workbuddy.cn/api/readyz', value: 'https://app.workbuddy.cn/api/readyz' },
  ]) {
    const result = classifyPublicIngressUrl(input)
    assert.equal(result.pass, false)
    assert.ok(result.reasonCodes.length > 0)
  }
})

test('rejects private or reserved IPs, wrong ports, and cross-target redirect URLs', async () => {
  const { classifyPublicIngressUrl } = await loadClassifier()

  for (const input of [
    { environment: 'production', expectedMode: 'temporary_ip_tls', expectedHost: '127.0.0.1', redirectValue: 'http://127.0.0.1/api/readyz', value: 'https://127.0.0.1/api/readyz' },
    { environment: 'production', expectedMode: 'temporary_ip_tls', expectedHost: '10.0.0.8', redirectValue: 'http://10.0.0.8/api/readyz', value: 'https://10.0.0.8/api/readyz' },
    { environment: 'staging', expectedMode: 'temporary_ip_tls', expectedHost: '192.168.1.8', redirectValue: 'http://192.168.1.8/staging-redirect/api/readyz', value: 'https://192.168.1.8:8443/api/readyz' },
    { environment: 'staging', expectedMode: 'temporary_ip_tls', expectedHost: '2001:db8::1', redirectValue: 'http://[2001:db8::1]/staging-redirect/api/readyz', value: 'https://[2001:db8::1]:8443/api/readyz' },
    { environment: 'production', expectedMode: 'temporary_ip_tls', expectedHost: '124.222.54.190', redirectValue: 'http://124.222.54.190/api/readyz', value: 'https://124.222.54.190:8443/api/readyz' },
    { environment: 'staging', expectedMode: 'temporary_ip_tls', expectedHost: '124.222.54.190', redirectValue: 'http://124.222.54.190/staging-redirect/api/readyz', value: 'https://124.222.54.190/api/readyz' },
    { environment: 'staging', expectedMode: 'temporary_ip_tls', expectedHost: '124.222.54.190', redirectValue: 'http://124.222.54.190/api/readyz', value: 'https://124.222.54.190:8443/api/readyz' },
    { environment: 'staging', expectedMode: 'temporary_ip_tls', expectedHost: '124.222.54.190', redirectValue: 'http://user:pass@124.222.54.190/staging-redirect/api/readyz', value: 'https://124.222.54.190:8443/api/readyz' },
    { environment: 'staging', expectedMode: 'temporary_ip_tls', expectedHost: '124.222.54.191', redirectValue: 'http://124.222.54.190/staging-redirect/api/readyz', value: 'https://124.222.54.190:8443/api/readyz' },
  ]) {
    const result = classifyPublicIngressUrl(input)
    assert.equal(result.pass, false, JSON.stringify(input))
  }
})
