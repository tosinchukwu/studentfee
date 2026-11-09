import type { ContractVersion, HealthReport, OnchainInvoice } from '../../src/lib/types.js'

/** What a transaction must look like to count as a payment or a settlement for an invoice. */
export interface TxExpectation {
  receiver: string
  method: string
  matches(args: Record<string, unknown>): boolean
}

/**
 * One adapter per deployed contract version. The rest of the server talks only to this interface,
 * so v3 can be added later as a new adapter without changing routes, storage or the handler.
 */
export interface ContractAdapter {
  readonly version: ContractVersion
  readonly contractId: string
  /** Reads one invoice from the contract. Null means the contract has no such invoice. */
  readInvoice(invoiceId: string): Promise<OnchainInvoice | null>
  /** The transaction shape that proves a payment or a settlement for this invoice. */
  expectedTx(kind: 'payment' | 'settlement', invoiceId: string): TxExpectation
  /** Checks the contract configuration and USDC registrations. */
  health(): Promise<HealthReport>
}
