import { existsSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { randomBytes } from 'node:crypto'
import { config } from './config'
import { db, getSetting, parseLineItems, schoolName, setSetting, type InvoiceRow } from './db'
import { SIGN_IN_MESSAGE, SIGN_IN_RECIPIENT, createChallenge, login, logout, sessionFrom } from './auth'
import { forget, readChain, readMany, toView } from './chain'
import { buildCsv } from './csv'
import { getTransaction, storageBalanceOf, viewCall } from '../src/lib/rpc'
import { toBaseUnits, toDecimalText } from '../src/lib/money'
import type { HealthReport, LineItem, PublicConfig } from '../src/lib/types'

const HASH_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,50}$/
const ACCOUNT_PATTERN = /^[a-z0-9._-]{2,64}$/
const MAX_BASE = 1_000_000n * 1_000_000n

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

function requireAdmin(request: Request): string {
  const token = sessionFrom(request)
  if (!token) throw new HttpError(401, 'Please sign in as the school administrator.')
  return token
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await request.json()
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch {
    // fall through
  }
  throw new HttpError(400, 'The request could not be read.')
}

function text(value: unknown, label: string, max: number, required = true): string {
  const out = typeof value === 'string' ? value.trim() : ''
  if (required && !out) throw new HttpError(400, `${label} is required.`)
  if (out.length > max) throw new HttpError(400, `${label} is too long.`)
  return out
}

function rowById(id: string): InvoiceRow | null {
  return db.query('SELECT * FROM invoices WHERE id = ?').get(id) as InvoiceRow | null
}

function publicConfig(): PublicConfig {
  return {
    network: config.network,
    contractId: config.contractId,
    usdcId: config.usdcId,
    adminAccount: config.adminAccount,
    treasury: config.treasury,
    schoolName: schoolName(),
    rpcUrl: config.rpcUrl,
    explorerUrl: config.explorerUrl,
  }
}

async function createInvoice(request: Request): Promise<Response> {
  requireAdmin(request)
  const input = await body(request)
  const studentName = text(input.studentName, 'Student name', 120)
  const studentId = text(input.studentId, 'Student ID', 40, false)
  const term = text(input.term, 'Term', 60)
  const note = text(input.note, 'Note', 300, false)

  const rawItems = Array.isArray(input.lineItems) ? (input.lineItems as unknown[]) : []
  if (rawItems.length > 15) throw new HttpError(400, 'Too many line items.')
  const lineItems: LineItem[] = []
  let itemsTotal = 0n
  for (const raw of rawItems) {
    const item = (raw ?? {}) as Record<string, unknown>
    const description = text(item.description, 'Line item description', 80)
    const amount = toBaseUnits(String(item.amount ?? ''))
    if (amount === null || amount <= 0n) throw new HttpError(400, `Enter a valid amount for "${description}".`)
    itemsTotal += amount
    lineItems.push({ description, amount: toDecimalText(amount) })
  }

  const total = lineItems.length ? itemsTotal : toBaseUnits(String(input.amount ?? ''))
  if (total === null || total <= 0n) throw new HttpError(400, 'Enter a valid fee amount.')
  if (total > MAX_BASE) throw new HttpError(400, 'The amount is too large.')

  const dueMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input.dueDate ?? ''))
  if (!dueMatch) throw new HttpError(400, 'Choose a due date.')
  const dueDate = Date.UTC(Number(dueMatch[1]), Number(dueMatch[2]) - 1, Number(dueMatch[3]), 23, 59, 59)
  if (Number.isNaN(dueDate)) throw new HttpError(400, 'Choose a valid due date.')

  const id = randomBytes(16).toString('hex')
  db.query(
    `INSERT INTO invoices (id, student_name, student_id, term, amount_base, due_date_ms, line_items, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, studentName, studentId, term, total.toString(), dueDate, JSON.stringify(lineItems), note, Date.now())
  return json({ id, amountBase: total.toString(), dueDate }, 201)
}

async function listInvoices(request: Request): Promise<Response> {
  requireAdmin(request)
  const rows = db.query('SELECT * FROM invoices ORDER BY created_at DESC').all() as InvoiceRow[]
  const chain = await readMany(rows.map((row) => row.id))
  return json({ invoices: rows.map((row) => toView(row, chain.get(row.id) ?? null)) })
}

async function recordTransaction(id: string, input: Record<string, unknown>): Promise<Response> {
  const row = rowById(id)
  if (!row) throw new HttpError(404, 'Invoice not found.')
  const kind = input.kind
  const hash = String(input.hash ?? '')
  const signerId = String(input.signerId ?? '')
  if (kind !== 'payment' && kind !== 'settlement') throw new HttpError(400, 'Unknown reference type.')
  if (!HASH_PATTERN.test(hash) || !ACCOUNT_PATTERN.test(signerId)) throw new HttpError(400, 'Invalid reference.')

  const column = kind === 'payment' ? 'payment_tx' : 'settlement_tx'
  if (row[column]) return json({ ok: true })

  const chain = await readChain(id, true)
  if (!chain) throw new HttpError(409, 'This invoice is not on the network yet.')
  if (kind === 'payment' && chain.payer !== signerId) throw new HttpError(409, 'This payment does not match the invoice payer.')

  const tx = await getTransaction(config.rpcUrl, hash, signerId).catch(() => null)
  if (!tx) throw new HttpError(404, 'That transaction was not found.')
  const ok =
    typeof tx.status === 'object' && tx.status !== null && ('SuccessValue' in tx.status || 'SuccessReceiptId' in tx.status)
  const expectedReceiver = kind === 'payment' ? config.usdcId : config.contractId
  const expectedMethod = kind === 'payment' ? 'ft_transfer_call' : 'settle_invoice'
  const matches = tx.transaction.receiver_id === expectedReceiver && tx.transaction.signer_id === signerId
  const call = tx.transaction.actions
    .map((action) => (typeof action === 'object' ? action.FunctionCall : undefined))
    .find((fn) => fn?.method_name === expectedMethod)
  let args: Record<string, unknown> = {}
  try {
    args = call ? (JSON.parse(Buffer.from(call.args, 'base64').toString()) as Record<string, unknown>) : {}
  } catch {
    // leave empty
  }
  const argsMatch =
    kind === 'payment' ? args.msg === id && args.receiver_id === config.contractId : args.invoice_id === id
  if (!ok || !matches || !call || !argsMatch) throw new HttpError(409, 'That transaction does not belong to this invoice.')

  db.query(`UPDATE invoices SET ${column} = ? WHERE id = ? AND ${column} IS NULL`).run(hash, id)
  forget(id)
  return json({ ok: true })
}

async function exportCsv(request: Request): Promise<Response> {
  requireAdmin(request)
  const rows = db.query('SELECT * FROM invoices ORDER BY created_at ASC').all() as InvoiceRow[]
  const chain = await readMany(rows.map((row) => row.id))
  const header = [
    'Invoice ID',
    'Student ID',
    'Student name',
    'Term',
    'Fee items',
    'Amount (USDC)',
    'Due date',
    'Status',
    'Paid at (UTC)',
    'Paid by (account)',
    'Payment reference',
    'Settlement reference',
  ]
  const stamp = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ') : '')
  const lines = rows.map((row) => {
    const view = toView(row, chain.get(row.id) ?? null)
    const items = parseLineItems(row.line_items)
      .map((item) => `${item.description} ${item.amount}`)
      .join('; ')
    return [
      view.id,
      view.studentId,
      view.studentName,
      view.term,
      items,
      toDecimalText(view.amountBase),
      new Date(view.dueDate).toISOString().slice(0, 10),
      view.status,
      stamp(view.paidAt),
      view.payer ?? '',
      view.paymentTx ?? '',
      view.settlementTx ?? '',
    ]
  })
  const date = new Date().toISOString().slice(0, 10)
  return new Response(buildCsv(header, lines), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="school-fees-${date}.csv"`,
    },
  })
}

async function health(request: Request): Promise<Response> {
  requireAdmin(request)
  const report: HealthReport = { configMatches: false, contractRegistered: false, treasuryRegistered: false, rpcReachable: true }
  try {
    const onchain = await viewCall<{ admin: string; treasury: string; usdc_token: string }>(
      config.rpcUrl,
      config.contractId,
      'get_config',
    )
    report.configMatches =
      onchain.admin === config.adminAccount && onchain.treasury === config.treasury && onchain.usdc_token === config.usdcId
    report.contractRegistered = (await storageBalanceOf(config.rpcUrl, config.usdcId, config.contractId)) !== null
    report.treasuryRegistered = (await storageBalanceOf(config.rpcUrl, config.usdcId, config.treasury)) !== null
  } catch {
    report.rpcReachable = false
  }
  return json(report)
}

async function route(request: Request, url: URL): Promise<Response | null> {
  const { pathname } = url
  const method = request.method
  const invoiceMatch = /^\/api\/invoices\/([0-9a-f]{32})(\/tx)?$/.exec(pathname)

  if (pathname === '/api/config' && method === 'GET') return json(publicConfig())

  if (invoiceMatch && method === 'GET' && !invoiceMatch[2]) {
    const row = rowById(invoiceMatch[1])
    if (!row) throw new HttpError(404, 'This payment link is not valid.')
    return json(toView(row, await readChain(row.id)))
  }
  if (invoiceMatch?.[2] && method === 'POST') return recordTransaction(invoiceMatch[1], await body(request))

  if (pathname === '/api/auth/challenge' && method === 'POST') {
    return json({ nonce: createChallenge(), message: SIGN_IN_MESSAGE, recipient: SIGN_IN_RECIPIENT })
  }
  if (pathname === '/api/auth/login' && method === 'POST') {
    const input = await body(request)
    try {
      const token = await login({
        accountId: String(input.accountId ?? ''),
        publicKey: String(input.publicKey ?? ''),
        signature: String(input.signature ?? ''),
        nonce: String(input.nonce ?? ''),
        callbackUrls: Array.isArray(input.callbackUrls) ? input.callbackUrls.map(String) : [],
      })
      return json({ token })
    } catch (error) {
      throw new HttpError(401, error instanceof Error ? error.message : 'Sign-in failed.')
    }
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    logout(requireAdmin(request))
    return json({ ok: true })
  }

  if (pathname === '/api/admin/invoices' && method === 'GET') return listInvoices(request)
  if (pathname === '/api/admin/invoices' && method === 'POST') return createInvoice(request)
  if (pathname === '/api/admin/export.csv' && method === 'GET') return exportCsv(request)
  if (pathname === '/api/admin/health' && method === 'GET') return health(request)

  const draftMatch = /^\/api\/admin\/invoices\/([0-9a-f]{32})$/.exec(pathname)
  if (draftMatch && method === 'DELETE') {
    requireAdmin(request)
    if (await readChain(draftMatch[1], true)) throw new HttpError(409, 'Published invoices cannot be deleted. Cancel it instead.')
    db.query('DELETE FROM invoices WHERE id = ?').run(draftMatch[1])
    return json({ ok: true })
  }
  if (pathname === '/api/admin/settings' && method === 'PUT') {
    requireAdmin(request)
    setSetting('school_name', text((await body(request)).schoolName, 'School name', 80))
    return json(publicConfig())
  }
  if (pathname.startsWith('/api/')) throw new HttpError(404, 'Not found.')
  return null
}

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
    try {
      const response = await route(request, url)
      if (response) return response
      if (existsSync(DIST)) return await serveStatic(url.pathname)
      return new Response('Not found', { status: 404 })
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status)
      console.error(error)
      return json({ error: 'Something went wrong. Please try again.' }, 500)
    }
  },
})

console.log(`API listening on port ${config.port} (${getSetting('school_name') ?? config.defaultSchoolName})`)
