import { config } from '../config.js'
import { storageBalanceOf, viewCall } from '../../src/lib/rpc.js'
import type { HealthReport, OnchainInvoice } from '../../src/lib/types.js'
import type { ContractAdapter } from './types.js'

interface DemoInvoice {
  creator: string
  amount: string
  due_date: number
  status: OnchainInvoice['status']
  payer: string | null
  paid_at: number | null
  attempt_id: number
  operation_started_at: number | null
}

/** Adapter for the separately deployed, permissionless Testnet demo contract. */
export function createDemoAdapter(): ContractAdapter {
  const contractId = config.demoContractId
  return {
    version: 'demo',
    contractId,
    async readInvoice(invoiceId) {
      const raw = await viewCall<DemoInvoice | null>(config.rpcUrl, contractId, 'get_invoice', { invoice_id: invoiceId })
      if (!raw) return null
      return {
        amount: raw.amount,
        attempt_id: raw.attempt_id,
        due_date: raw.due_date,
        operation_started_at: raw.operation_started_at,
        paid_at: raw.paid_at,
        payer: raw.payer,
        status: raw.status,
      }
    },
    expectedTx: (kind, invoiceId) =>
      kind === 'payment'
        ? { receiver: config.usdcId, method: 'ft_transfer_call', matches: (args) => args.msg === invoiceId && args.receiver_id === contractId }
        : { receiver: contractId, method: 'settle_invoice', matches: (args) => args.invoice_id === invoiceId },
    async health(): Promise<HealthReport> {
      const report: HealthReport = { configMatches: false, contractRegistered: false, treasuryRegistered: false, rpcReachable: true }
      try {
        const [onchain, registered] = await Promise.all([
          viewCall<[string, string]>(config.rpcUrl, contractId, 'get_config'),
          storageBalanceOf(config.rpcUrl, config.usdcId, contractId),
        ])
        report.configMatches = onchain[0] === config.treasury && onchain[1] === config.usdcId
        report.contractRegistered = registered !== null
        report.treasuryRegistered = (await storageBalanceOf(config.rpcUrl, config.usdcId, config.treasury)) !== null
      } catch {
        report.rpcReachable = false
      }
      return report
    },
  }
}
