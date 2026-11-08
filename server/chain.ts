import { config } from './config'
import { parseLineItems, schoolName, type InvoiceRow } from './db'
import { viewCall } from '../src/lib/rpc'
import type { ChainStatus, DisplayStatus, InvoiceView, OnchainInvoice } from '../src/lib/types'

const TTL_MS = 3000
const cache = new Map<string, { at: number; value: OnchainInvoice | null }>()

/** Reads one invoice from the contract. Null means the contract has no such invoice. */
export async function readChain(id: string, fresh = false): Promise<OnchainInvoice | null> {
  const hit = cache.get(id)
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value
  const value = await viewCall<OnchainInvoice | null>(config.rpcUrl, config.contractId, 'get_invoice', {
    invoice_id: id,
  })
  cache.set(id, { at: Date.now(), value })
  return value
}

export function forget(id: string): void {
  cache.delete(id)
}

export async function readMany(ids: string[]): Promise<Map<string, OnchainInvoice | null>> {
  const out = new Map<string, OnchainInvoice | null>()
  for (let i = 0; i < ids.length; i += 8) {
    const batch = ids.slice(i, i + 8)
    const results = await Promise.all(batch.map((id) => readChain(id)))
    batch.forEach((id, index) => out.set(id, results[index] ?? null))
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

export function toView(row: InvoiceRow, chain: OnchainInvoice | null): InvoiceView {
  return {
    id: row.id,
    schoolName: schoolName(),
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
