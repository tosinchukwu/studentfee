import { GAS_100_TGAS, GAS_30_TGAS } from './near'
import type { ContractVersion, InvoiceView, PublicConfig } from './types'

/** One wallet call to a contract. */
export interface ContractCall {
  receiverId: string
  methodName: string
  args: Record<string, unknown>
  gas: bigint
  deposit?: bigint
}

type InvoiceRef = Pick<InvoiceView, 'id' | 'contractId'>

/**
 * Browser-side adapter for one contract version: it knows the method names and argument shapes.
 * Pages ask the adapter for the call and never hardcode a contract's interface.
 * v3 is specified but not built, so it has no adapter yet.
 */
export interface ClientContractAdapter {
  version: ContractVersion
  /** The parent's payment: a USDC transfer-and-call into the invoice's contract. */
  pay(invoice: InvoiceRef & Pick<InvoiceView, 'amountBase'>, config: PublicConfig): ContractCall
  /** Moves a received payment to the school treasury. Anyone may send it. */
  settle(invoice: InvoiceRef): ContractCall
  /** Registers an invoice on the contract. School administrator only. */
  publish(invoice: InvoiceRef & Pick<InvoiceView, 'amountBase' | 'dueDate'>): ContractCall
  cancel(invoice: InvoiceRef): ContractCall
  refund(invoice: InvoiceRef): ContractCall
}

const v2: ClientContractAdapter = {
  version: 'v2',
  pay: (invoice, config) => ({
    receiverId: config.usdcId,
    methodName: 'ft_transfer_call',
    args: { receiver_id: invoice.contractId, amount: invoice.amountBase, msg: invoice.id },
    gas: GAS_100_TGAS,
    deposit: 1n,
  }),
  settle: (invoice) => ({
    receiverId: invoice.contractId,
    methodName: 'settle_invoice',
    args: { invoice_id: invoice.id },
    gas: GAS_100_TGAS,
  }),
  publish: (invoice) => ({
    receiverId: invoice.contractId,
    methodName: 'create_invoice',
    args: { invoice_id: invoice.id, amount: invoice.amountBase, due_date: invoice.dueDate },
    gas: GAS_30_TGAS,
  }),
  cancel: (invoice) => ({
    receiverId: invoice.contractId,
    methodName: 'cancel_invoice',
    args: { invoice_id: invoice.id },
    gas: GAS_30_TGAS,
  }),
  refund: (invoice) => ({
    receiverId: invoice.contractId,
    methodName: 'refund_payment',
    args: { invoice_id: invoice.id },
    gas: GAS_100_TGAS,
  }),
}

export function clientAdapter(version: ContractVersion): ClientContractAdapter {
  if (version === 'v2') return v2
  throw new Error('This invoice uses a contract version this app does not support yet.')
}
