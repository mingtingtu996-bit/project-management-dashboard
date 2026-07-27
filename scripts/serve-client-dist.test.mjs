import assert from 'node:assert/strict'
import test from 'node:test'

import { buildPreviewProxyHeaders, sendPreviewProxyError } from './serve-client-dist.mjs'

test('preview proxy error does not write headers after response already started', () => {
  let writeHeadCalled = false
  let endCalled = false
  let destroyedWith = null
  const error = new Error('socket hang up')
  const response = {
    headersSent: true,
    writeHead() {
      writeHeadCalled = true
      throw new Error('ERR_HTTP_HEADERS_SENT')
    },
    end() {
      endCalled = true
    },
    destroy(cause) {
      destroyedWith = cause
    },
  }

  sendPreviewProxyError(response, error)

  assert.equal(writeHeadCalled, false)
  assert.equal(endCalled, false)
  assert.equal(destroyedWith, error)
})

test('preview proxy error returns JSON 502 before response headers are sent', () => {
  let statusCode = null
  let headers = null
  let body = null
  const response = {
    headersSent: false,
    writeHead(status, nextHeaders) {
      statusCode = status
      headers = nextHeaders
    },
    end(nextBody) {
      body = JSON.parse(nextBody)
    },
    destroy() {
      throw new Error('destroy should not be called before headers are sent')
    },
  }

  sendPreviewProxyError(response, new Error('ECONNRESET'))

  assert.equal(statusCode, 502)
  assert.equal(headers['Content-Type'], 'application/json; charset=utf-8')
  assert.equal(body.success, false)
  assert.equal(body.error.code, 'PREVIEW_PROXY_ERROR')
  assert.match(body.error.message, /ECONNRESET/)
})

test('preview proxy headers replace browser hop-by-hop headers for API target', () => {
  const headers = buildPreviewProxyHeaders({
    host: '127.0.0.1:4175',
    connection: 'keep-alive',
    'proxy-connection': 'keep-alive',
    'keep-alive': 'timeout=5',
    authorization: 'Bearer test-token',
    'content-type': 'application/json',
  }, '127.0.0.1', 3106)

  assert.equal(headers.host, '127.0.0.1:3106')
  assert.equal(headers.authorization, 'Bearer test-token')
  assert.equal(headers['content-type'], 'application/json')
  assert.equal('connection' in headers, false)
  assert.equal('proxy-connection' in headers, false)
  assert.equal('keep-alive' in headers, false)
})
