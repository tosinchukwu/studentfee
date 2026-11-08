import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from './config'
import type { LineItem } from '../src/lib/types'

mkdirSync(dirname(config.dbPath), { recursive: true })
export const db = new Database(config.dbPath, { create: true })
db.exec('PRAGMA journal_mode = WAL')

db.exec(`
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  student_id TEXT NOT NULL DEFAULT '',
  term TEXT NOT NULL,
  amount_base TEXT NOT NULL,
  due_date_ms INTEGER NOT NULL,
  line_items TEXT NOT NULL DEFAULT '[]',
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  payment_tx TEXT,
  settlement_tx TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS challenges (nonce TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
`)

export interface InvoiceRow {
  id: string
  student_name: string
  student_id: string
  term: string
  amount_base: string
  due_date_ms: number
  line_items: string
  note: string
  created_at: number
  payment_tx: string | null
  settlement_tx: string | null
}

export function parseLineItems(raw: string): LineItem[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LineItem[]) : []
  } catch {
    return []
  }
}

export function getSetting(key: string): string | null {
  const row = db.query('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | null
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.query('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function schoolName(): string {
  return getSetting('school_name') ?? config.defaultSchoolName
}
