import { existsSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { config } from './config.js'
import { handle } from './handler.js'

// Local and self-hosted entry point. On Vercel the same handler runs as a serverless function
// (api/[...path].ts). All application data lives in PostgreSQL, never on this machine's disk.

const DIST = join(process.cwd(), 'dist')

async function serveStatic(pathname: string): Promise<Response> {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const file = Bun.file(join(DIST, safe))
  if (safe !== '/' && (await file.exists())) return new Response(file)
  return new Response(Bun.file(join(DIST, 'index.html')))
}

Bun.serve({
  port: config.port,
  hostname: '0.0.0.0',
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) return handle(request)
    if (existsSync(DIST)) return serveStatic(url.pathname)
    return new Response('Not found', { status: 404 })
  },
})

console.log(`API listening on port ${config.port}`)
