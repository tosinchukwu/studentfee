// Shared by the browser app and the API server.

/** Exact status values returned by the deployed contract. Never rename these. */
export type ChainStatus =
  | 'Pending'
  | 'PaymentReceived'
  | 'Settling'
  | 'Refunding'
  | 'Paid'
  | 'Cancelled'

/** Friendly status used in the interface and the CSV. */
export type DisplayStatus =
  | 'Not published'
  | 'Pending'
  | 'Overdue'
  | 'Processing'
  | 'Paid'
  | 'Cancelled'

export interface OnchainInvoice {
  amount: string
  attempt_id: number
  due_date: number
  operation_started_at: number | null
  paid_at: number | null
  payer: string | null
  status: ChainStatus
}

export interface LineItem {
  description: string
  /** Decimal USDC amount, for example "12.50". */
  amount: string
}

export interface InvoiceView {
  id: string
  schoolName: string
  studentName: string
  studentId: string
  term: string
  /** Amount in USDC base units (6 decimals). */
  amountBase: string
  /** Due date in Unix milliseconds. */
  dueDate: number
  lineItems: LineItem[]
  note: string
  createdAt: number
  /** Raw contract status, or null while the invoice is not on the contract yet. */
  chainStatus: ChainStatus | null
  status: DisplayStatus
  payer: string | null
  /** Paid time in Unix milliseconds. */
  paidAt: number | null
  paymentTx: string | null
  settlementTx: string | null
}

export interface PublicConfig {
  network: string
  contractId: string
  usdcId: string
  adminAccount: string
  treasury: string
  schoolName: string
  rpcUrl: string
  explorerUrl: string
}

export interface HealthReport {
  configMatches: boolean
  contractRegistered: boolean
  treasuryRegistered: boolean
  rpcReachable: boolean
}
