import { adapterForContract } from './contracts/registry.js'
import { parseLineItems } from './lineItems.js'
import type { InvoiceRow } from './store.js'
import type { ChainStatus, DisplayStatus, InvoiceView, OnchainInvoice } from '../src/lib/types.js'

const TTL_MS = 3000
const cache = new Map<string, { at: number; value: OnchainInvoice | null }>()

/** Reads one invoice from the contract it belongs to. Null means the contract has no such invoice. */
export async function readChain(row: Pick<InvoiceRow, 'id' | 'contract_id'>, fresh = false): Promise<OnchainInvoice | null> {
  const key = `${row.contract_id}:${row.id}`
  const hit = cache.get(key)
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value
  const value = await adapterForContract(row.contract_id).readInvoice(row.id)
  cache.set(key, { at: Date.now(), value })
  return value
}

export function forget(row: Pick<InvoiceRow, 'id' | 'contract_id'>): void {
  cache.delete(`${row.contract_id}:${row.id}`)
}

export async function readMany(rows: InvoiceRow[]): Promise<Map<string, OnchainInvoice | null>> {
  const out = new Map<string, OnchainInvoice | null>()
  for (let i = 0; i < rows.length; i += 8) {
    const batch = rows.slice(i, i + 8)
    const results = await Promise.all(batch.map((row) => readChain(row)))
    batch.forEach((row, index) => out.set(row.id, results[index] ?? null))
  }
  return out
}

const PROCESSING: ChainStatus[] = ['PaymentReceived', 'Settling', 'Refunding']

export function displayStatus(chain: OnchainInvoice | null, dueDate: number): DisplayStatus {
  if (!chain) return 'Not published'
  if (PROCESSING.includes(chain.status)) return 'Processing'
  if (chain.status === 'Paid') return 'Paid'
  if (chain.status === 'Cancelled') return 'Cancelled'
  return dueDate < Date.now() ? 'Overdue' : 'Pending'
}

export function toView(row: InvoiceRow, chain: OnchainInvoice | null, schoolName: string): InvoiceView {
  return {
    id: row.id,
    contractId: row.contract_id,
    contractVersion: row.contract_version,
    schoolName,
    studentName: row.student_name,
    studentId: row.student_id,
    term: row.term,
    amountBase: row.amount_base,
    dueDate: row.due_date_ms,
    lineItems: parseLineItems(row.line_items),
    note: row.note,
    createdAt: row.created_at,
    chainStatus: chain?.status ?? null,
    status: displayStatus(chain, row.due_date_ms),
    payer: chain?.payer ?? null,
    // The contract stores nanoseconds; the app works in milliseconds.
    paidAt: chain?.paid_at ? Math.floor(chain.paid_at / 1_000_000) : null,
    paymentTx: row.payment_tx,
    settlementTx: row.settlement_tx,
  }
}
