import { createReadStream, existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import http from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const repoRoot = normalize(join(__dirname, '..'))
const distRoot = join(repoRoot, 'client', 'dist')
const indexFile = join(distRoot, 'index.html')
const port = Number(process.env.PORT || 4173)
const apiTargetHost = process.env.API_HOST || '127.0.0.1'
const apiTargetPort = Number(process.env.API_PORT || 3001)

const contentTypeMap = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function isSafePath(filePath) {
  return normalize(filePath).startsWith(normalize(distRoot))
}

function resolveStaticPath(urlPath) {
  const cleaned = urlPath === '/' ? '/index.html' : urlPath
  const filePath = join(distRoot, cleaned)
  if (!isSafePath(filePath)) return null
  if (!existsSync(filePath)) return null
  if (!statSync(filePath).isFile()) return null
  return filePath
}

function sendFile(res, filePath) {
  const contentType = contentTypeMap.get(extname(filePath).toLowerCase()) || 'application/octet-stream'
  res.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': filePath === indexFile ? 'no-cache' : 'public, max-age=31536000, immutable',
  })
  createReadStream(filePath).pipe(res)
}

function proxyApi(req, res) {
  const proxyReq = http.request(
    {
      hostname: apiTargetHost,
      port: apiTargetPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
      proxyRes.pipe(res)
    },
  )

  proxyReq.on('error', (error) => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({
      success: false,
      error: {
        code: 'PREVIEW_PROXY_ERROR',
        message: `Failed to proxy API request: ${error.message}`,
      },
    }))
  })

  req.pipe(proxyReq)
}

function acceptWebSocket(req, socket) {
  const rawKey = req.headers['sec-websocket-key']
  const webSocketKey = Array.isArray(rawKey) ? rawKey[0] : rawKey

  if (!webSocketKey) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n')
    socket.destroy()
    return
  }

  const acceptKey = createHash('sha1')
    .update(`${webSocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64')

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n',
  ].join('\r\n'))

  socket.on('error', () => {})
  socket.on('data', () => {})
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400)
    res.end('Missing URL')
    return
  }

  if (req.url.startsWith('/api/')) {
    proxyApi(req, res)
    return
  }

  const requestUrl = new URL(req.url, `http://127.0.0.1:${port}`)
  const staticPath = resolveStaticPath(requestUrl.pathname)

  if (staticPath) {
    sendFile(res, staticPath)
    return
  }

  try {
    const html = await readFile(indexFile)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    })
    res.end(html)
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(`Failed to read index.html: ${error instanceof Error ? error.message : String(error)}`)
  }
})

server.on('upgrade', (req, socket) => {
  if (!req.url?.startsWith('/ws')) {
    socket.destroy()
    return
  }

  acceptWebSocket(req, socket)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Preview server listening at http://127.0.0.1:${port}`)
})
