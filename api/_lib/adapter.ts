import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle } from '../../server/handler.js'

// Shared by every file in api/. Each file is one Vercel function route and simply re-exports this.
// It turns the Node request into a standard Request, runs the shared handler, and writes the
// Response back. Data lives in PostgreSQL (DATABASE_URL), so functions keep no state.

const MAX_BODY_BYTES = 64 * 1024

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  // Vercel may already have parsed the body.
  if (typeof req.body === 'string') return Buffer.from(req.body)
  if (Buffer.isBuffer(req.body)) return req.body
  if (req.body !== undefined && req.body !== null) return Buffer.from(JSON.stringify(req.body))
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string)
    size += piece.length
    if (size > MAX_BODY_BYTES * 2) break
    chunks.push(piece)
  }
  return Buffer.concat(chunks)
}

export default async function vercelHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost')
  const proto = String(req.headers['x-forwarded-proto'] ?? 'https').split(',')[0]
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item)
    else if (value !== undefined) headers.set(name, value)
  }
  const body = await readBody(req)
  const request = new Request(`${proto}://${host}${req.url ?? '/'}`, {
    method: req.method,
    headers,
    body: body && body.length ? new Uint8Array(body) : undefined,
  })
  const response = await handle(request)
  res.statusCode = response.status
  response.headers.forEach((value, name) => res.setHeader(name, value))
  res.end(Buffer.from(await response.arrayBuffer()))
}
