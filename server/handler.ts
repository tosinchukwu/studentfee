import { randomBytes } from 'node:crypto'
import { config } from './config.js'
import { SIGN_IN_MESSAGE, SIGN_IN_RECIPIENT, createChallenge, login, logout, sessionFrom } from './auth.js'
import { forget, readChain, readMany, toView } from './chain.js'
import { buildCsv } from './csv.js'
import { adapterForContract, adapterForNewInvoices } from './contracts/registry.js'
import { DatabaseConfigError, ensureSchema } from './db.js'
import { parseLineItems } from './lineItems.js'
import {
  deleteInvoice,
  getInvoice,
  insertInvoice,
  listInvoices,
  schoolName,
  setInvoiceTx,
  setSetting,
} from './store.js'
import { getTransaction } from '../src/lib/rpc.js'
import { toBaseUnits, toDecimalText } from '../src/lib/money.js'
import type { LineItem, PublicConfig } from '../src/lib/types.js'

// The whole API as one function: Request in, Response out. The Vercel function (api/) and the
// local Bun server (server/index.ts) both call it, and a future scheduled settlement job can too.

const HASH_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,50}$/
const ACCOUNT_PATTERN = /^[a-z0-9._-]{2,64}$/
const MAX_BASE = 1_000_000n * 1_000_000n
const MAX_BODY_BYTES = 64 * 1024

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

async function requireAdmin(request: Request): Promise<string> {
  const token = await sessionFrom(request)
  if (!token) throw new HttpError(401, 'Please sign in as the school administrator.')
  return token
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'The request is too large.')
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof HttpError) throw error
  }
  throw new HttpError(400, 'The request could not be read.')
}

function text(value: unknown, label: string, max: number, required = true): string {
  const out = typeof value === 'string' ? value.trim() : ''
  if (required && !out) throw new HttpError(400, `${label} is required.`)
  if (out.length > max) throw new HttpError(400, `${label} is too long.`)
  return out
}

async function publicConfig(): Promise<PublicConfig> {
  return {
    network: config.network,
    contractId: config.contractId,
    usdcId: config.usdcId,
    adminAccount: config.adminAccount,
    treasury: config.treasury,
    schoolName: await schoolName(),
    rpcUrl: config.rpcUrl,
    explorerUrl: config.explorerUrl,
  }
}

async function createInvoice(request: Request): Promise<Response> {
  await requireAdmin(request)
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
    const amount = toBaseUnits(typeof item.amount === 'string' ? item.amount : '')
    if (amount === null || amount <= 0n) throw new HttpError(400, `Enter a valid amount for "${description}".`)
    itemsTotal += amount
    lineItems.push({ description, amount: toDecimalText(amount) })
  }

  const total = lineItems.length ? itemsTotal : toBaseUnits(typeof input.amount === 'string' ? input.amount : '')
  if (total === null || total <= 0n) throw new HttpError(400, 'Enter a valid fee amount.')
  if (total > MAX_BASE) throw new HttpError(400, 'The amount is too large.')

  const dueMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof input.dueDate === 'string' ? input.dueDate : '')
  if (!dueMatch) throw new HttpError(400, 'Choose a due date.')
  const dueDate = Date.UTC(Number(dueMatch[1]), Number(dueMatch[2]) - 1, Number(dueMatch[3]), 23, 59, 59)
  if (Number.isNaN(dueDate)) throw new HttpError(400, 'Choose a valid due date.')

  const adapter = adapterForNewInvoices()
  const id = randomBytes(16).toString('hex')
  await insertInvoice({
    id,
    contract_id: adapter.contractId,
    contract_version: adapter.version,
    student_name: studentName,
    student_id: studentId,
    term,
    amount_base: total.toString(),
    due_date_ms: dueDate,
    line_items: lineItems,
    note,
    created_at: Date.now(),
  })
  return json(
    { id, amountBase: total.toString(), dueDate, contractId: adapter.contractId, contractVersion: adapter.version },
    201,
  )
}

async function listAll(request: Request): Promise<Response> {
  await requireAdmin(request)
  const rows = await listInvoices('newest')
  const [chain, name] = await Promise.all([readMany(rows), schoolName()])
  return json({ invoices: rows.map((row) => toView(row, chain.get(row.id) ?? null, name)) })
}

async function recordTransaction(id: string, input: Record<string, unknown>): Promise<Response> {
  const row = await getInvoice(id)
  if (!row) throw new HttpError(404, 'Invoice not found.')
  const kind = input.kind
  const hash = typeof input.hash === 'string' ? input.hash : ''
  const signerId = typeof input.signerId === 'string' ? input.signerId : ''
  if (kind !== 'payment' && kind !== 'settlement') throw new HttpError(400, 'Unknown reference type.')
  if (!HASH_PATTERN.test(hash) || !ACCOUNT_PATTERN.test(signerId)) throw new HttpError(400, 'Invalid reference.')
  if (kind === 'payment' ? row.payment_tx : row.settlement_tx) return json({ ok: true })

  const chain = await readChain(row, true)
  if (!chain) throw new HttpError(409, 'This invoice is not on the network yet.')
  if (kind === 'payment' && chain.payer !== signerId) throw new HttpError(409, 'This payment does not match the invoice payer.')

  const tx = await getTransaction(config.rpcUrl, hash, signerId).catch(() => null)
  if (!tx) throw new HttpError(404, 'That transaction was not found.')
  const expected = adapterForContract(row.contract_id).expectedTx(kind, id)
  const succeeded =
    typeof tx.status === 'object' && tx.status !== null && ('SuccessValue' in tx.status || 'SuccessReceiptId' in tx.status)
  const call = tx.transaction.actions
    .map((action) => (typeof action === 'object' ? action.FunctionCall : undefined))
    .find((fn) => fn?.method_name === expected.method)
  let args: Record<string, unknown> = {}
  try {
    args = call ? (JSON.parse(Buffer.from(call.args, 'base64').toString()) as Record<string, unknown>) : {}
  } catch {
    // leave empty
  }
  const belongs =
    succeeded &&
    tx.transaction.receiver_id === expected.receiver &&
    tx.transaction.signer_id === signerId &&
    call !== undefined &&
    expected.matches(args)
  if (!belongs) throw new HttpError(409, 'That transaction does not belong to this invoice.')

  await setInvoiceTx(id, kind, hash)
  forget(row)
  return json({ ok: true })
}

async function exportCsv(request: Request): Promise<Response> {
  await requireAdmin(request)
  const rows = await listInvoices('oldest')
  const [chain, name] = await Promise.all([readMany(rows), schoolName()])
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
    const view = toView(row, chain.get(row.id) ?? null, name)
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
      'cache-control': 'no-store',
    },
  })
}

/** Public check used after deployment. Reports only yes or no, never connection details. */
async function healthCheck(): Promise<Response> {
  let database: 'ok' | 'not_configured' | 'error' = 'ok'
  try {
    await ensureSchema()
  } catch (error) {
    database = error instanceof DatabaseConfigError ? 'not_configured' : 'error'
    if (database === 'error') console.error('Health check: database error', error instanceof Error ? error.message : error)
  }
  const ok = database === 'ok'
  return json({ ok, database, contract: adapterForNewInvoices().version }, ok ? 200 : 503)
}

async function route(request: Request, url: URL): Promise<Response> {
  const { pathname } = url
  const method = request.method
  const invoiceMatch = /^\/api\/invoices\/([0-9a-f]{32})(\/tx)?$/.exec(pathname)

  if (pathname === '/api/health' && method === 'GET') return healthCheck()
  if (pathname === '/api/config' && method === 'GET') return json(await publicConfig())

  if (invoiceMatch && method === 'GET' && !invoiceMatch[2]) {
    const row = await getInvoice(invoiceMatch[1])
    if (!row) throw new HttpError(404, 'This payment link is not valid.')
    return json(toView(row, await readChain(row), await schoolName()))
  }
  if (invoiceMatch?.[2] && method === 'POST') return recordTransaction(invoiceMatch[1], await body(request))

  if (pathname === '/api/auth/challenge' && method === 'POST') {
    const nonce = await createChallenge()
    if (!nonce) throw new HttpError(429, 'Too many sign-in attempts. Please try again in a few minutes.')
    return json({ nonce, message: SIGN_IN_MESSAGE, recipient: SIGN_IN_RECIPIENT })
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
      if (error instanceof DatabaseConfigError) throw error
      throw new HttpError(401, error instanceof Error ? error.message : 'Sign-in failed.')
    }
  }
  if (pathname === '/api/auth/logout' && method === 'POST') {
    await logout(await requireAdmin(request))
    return json({ ok: true })
  }

  if (pathname === '/api/admin/invoices' && method === 'GET') return listAll(request)
  if (pathname === '/api/admin/invoices' && method === 'POST') return createInvoice(request)
  if ((pathname === '/api/admin/export' || pathname === '/api/admin/export.csv') && method === 'GET') return exportCsv(request)
  if (pathname === '/api/admin/health' && method === 'GET') {
    await requireAdmin(request)
    return json(await adapterForNewInvoices().health())
  }

  const draftMatch = /^\/api\/admin\/invoices\/([0-9a-f]{32})$/.exec(pathname)
  if (draftMatch && method === 'DELETE') {
    await requireAdmin(request)
    const row = await getInvoice(draftMatch[1])
    if (!row) return json({ ok: true })
    if (await readChain(row, true)) throw new HttpError(409, 'Published invoices cannot be deleted. Cancel it instead.')
    await deleteInvoice(row.id)
    return json({ ok: true })
  }
  if (pathname === '/api/admin/settings' && method === 'PUT') {
    await requireAdmin(request)
    await setSetting('school_name', text((await body(request)).schoolName, 'School name', 80))
    return json(await publicConfig())
  }
  throw new HttpError(404, 'Not found.')
}

export async function handle(request: Request): Promise<Response> {
  try {
    return await route(request, new URL(request.url))
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status)
    if (error instanceof DatabaseConfigError) {
      console.error('Database is not configured: set DATABASE_URL')
      return json({ error: 'The service is not set up yet. Please try again later.' }, 503)
    }
    console.error(error instanceof Error ? error.message : error)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
}
