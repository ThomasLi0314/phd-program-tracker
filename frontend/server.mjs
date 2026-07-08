// Static file server for the built site (dist/) with one tiny API endpoint for
// visitor "request a field" submissions. Zero dependencies (Node built-ins).
// Submissions are appended to reports/field-requests.jsonl on THIS laptop —
// nothing leaves the machine. Usage: node server.mjs [port]  (default 8787)

import { createServer } from 'node:http'
import { readFile, stat, mkdir, appendFile } from 'node:fs/promises'
import { join, extname, normalize, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, 'dist')
const REPORTS = join(HERE, 'reports', 'field-requests.jsonl')
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8787
const HOST = process.env.HOST || '0.0.0.0'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

async function tryFile(path) {
  try {
    return (await stat(path)).isFile() ? path : null
  } catch {
    return null
  }
}

function readBody(req, limit = 8 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('payload too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const clip = (v, n) => (typeof v === 'string' ? v.slice(0, n).trim() : '')

async function handleReport(req, res) {
  try {
    const raw = await readBody(req)
    const data = JSON.parse(raw || '{}')
    const field = clip(data.field, 120)
    if (!field) {
      res.writeHead(400, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: 'A field of interest is required.' }))
      return
    }
    const entry = {
      // Timestamp is stamped server-side; note ISO time is fine here (not a cached prompt).
      at: new Date().toISOString(),
      field,
      note: clip(data.note, 1000),
      email: clip(data.email, 200),
      ip: req.socket.remoteAddress || '',
      ua: clip(req.headers['user-agent'], 300),
    }
    await mkdir(dirname(REPORTS), { recursive: true })
    await appendFile(REPORTS, JSON.stringify(entry) + '\n', 'utf8')
    console.log(`[request] new field of interest: "${field}"${entry.email ? ' (' + entry.email + ')' : ''}`)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))
  } catch (err) {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: 'Could not process the request: ' + err.message }))
  }
}

const server = createServer(async (req, res) => {
  // API: accept field-of-interest submissions.
  if (req.method === 'POST' && (req.url || '').split('?')[0] === '/api/report-field') {
    return handleReport(req, res)
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'content-type': 'text/plain' })
    res.end('Method not allowed')
    return
  }

  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
    const filePath = join(ROOT, rel)

    const resolved =
      (await tryFile(filePath)) ??
      (await tryFile(join(filePath, 'index.html'))) ??
      (await tryFile(join(ROOT, 'index.html'))) // SPA fallback

    if (!resolved) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('Not found. Run `npm run build` first.')
      return
    }
    const body = await readFile(resolved)
    const type = MIME[extname(resolved)] || 'application/octet-stream'
    const cache = /-[A-Za-z0-9_]{8,}\.(js|css|woff2)$/.test(resolved)
      ? 'public, max-age=31536000, immutable'
      : 'no-cache'
    res.writeHead(200, { 'content-type': type, 'cache-control': cache })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' })
    res.end('Server error: ' + err.message)
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Tracker site serving dist/ on http://localhost:${PORT}`)
  console.log(`Field requests append to: ${REPORTS}`)
  console.log('Point Cloudflare Tunnel at this port to share it publicly.')
})
