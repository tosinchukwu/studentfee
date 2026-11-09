import { createHash } from 'node:crypto'
import { config } from './config.js'
import { query, queryOne } from './db.js'
import type { ContractVersion, LineItem } from '../src/lib/types.js'

export interface InvoiceRow {
  id: string
  contract_id: string
  contract_version: ContractVersion
  student_name: string
  student_id: string
  term: string
  amount_base: string
  due_date_ms: number
  line_items: LineItem[]
  note: string
  created_at: number
  payment_tx: string | null
  settlement_tx: string | null
}

export type NewInvoice = Omit<InvoiceRow, 'payment_tx' | 'settlement_tx'>

// ---- invoices ----

export async function insertInvoice(invoice: NewInvoice): Promise<void> {
  await query(
    `INSERT INTO invoices (id, contract_id, contract_version, student_name, student_id, term, amount_base,
                           due_date_ms, line_items, note, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)`,
    [
      invoice.id,
      invoice.contract_id,
      invoice.contract_version,
      invoice.student_name,
      invoice.student_id,
      invoice.term,
      invoice.amount_base,
      invoice.due_date_ms,
      JSON.stringify(invoice.line_items),
      invoice.note,
      invoice.created_at,
    ],
  )
}

export function getInvoice(id: string): Promise<InvoiceRow | null> {
  return queryOne<InvoiceRow>('SELECT * FROM invoices WHERE id = $1', [id])
}

export function listInvoices(order: 'newest' | 'oldest'): Promise<InvoiceRow[]> {
  return query<InvoiceRow>(`SELECT * FROM invoices ORDER BY created_at ${order === 'newest' ? 'DESC' : 'ASC'}`)
}

export async function deleteInvoice(id: string): Promise<void> {
  await query('DELETE FROM invoices WHERE id = $1', [id])
}

/** Stores a verified transaction reference once. Returns false if one was already stored. */
export async function setInvoiceTx(id: string, kind: 'payment' | 'settlement', hash: string): Promise<boolean> {
  const column = kind === 'payment' ? 'payment_tx' : 'settlement_tx'
  const rows = await query<{ id: string }>(
    `UPDATE invoices SET ${column} = $2 WHERE id = $1 AND ${column} IS NULL RETURNING id`,
    [id, hash],
  )
  return rows.length > 0
}

// ---- settings ----

export async function getSetting(key: string): Promise<string | null> {
  return (await queryOne<{ value: string }>('SELECT value FROM settings WHERE key = $1', [key]))?.value ?? null
}

export async function setSetting(key: string, value: string): Promise<void> {
  await query(
    'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, value],
  )
}

export async function schoolName(): Promise<string> {
  return (await getSetting('school_name')) ?? config.defaultSchoolName
}

// ---- sign-in challenges and sessions ----

const MAX_OPEN_CHALLENGES = 5000

export async function saveChallenge(nonce: string, expiresAt: number): Promise<boolean> {
  await query('DELETE FROM challenges WHERE expires_at < $1', [Date.now()])
  const open = await queryOne<{ count: string }>('SELECT count(*)::text AS count FROM challenges')
  if (Number(open?.count ?? 0) >= MAX_OPEN_CHALLENGES) return false
  await query('INSERT INTO challenges (nonce, expires_at) VALUES ($1, $2)', [nonce, expiresAt])
  return true
}

/** Removes the challenge and returns its expiry, so each challenge works once. */
export async function consumeChallenge(nonce: string): Promise<number | null> {
  const row = await queryOne<{ expires_at: number }>('DELETE FROM challenges WHERE nonce = $1 RETURNING expires_at', [nonce])
  return row?.expires_at ?? null
}

// Only a hash of the session token is stored, so a database leak does not expose live sessions.
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export async function saveSession(token: string, accountId: string, expiresAt: number): Promise<void> {
  await query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()])
  await query('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)', [hashToken(token), accountId, expiresAt])
}

export async function findSession(token: string): Promise<{ account_id: string; expires_at: number } | null> {
  return queryOne('SELECT account_id, expires_at FROM sessions WHERE token_hash = $1', [hashToken(token)])
}

export async function deleteSession(token: string): Promise<void> {
  await query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
}
