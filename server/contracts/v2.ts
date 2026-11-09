import { config } from '../config.js'
import { storageBalanceOf, viewCall } from '../../src/lib/rpc.js'
import type { HealthReport, OnchainInvoice } from '../../src/lib/types.js'
import type { ContractAdapter } from './types.js'

// Adapter for the deployed v2 contract (one admin, one treasury, six statuses).
// The v2 contract is only read and called. It is never modified or redeployed.
export function createV2Adapter(): ContractAdapter {
  const contractId = config.contractId
  return {
    version: 'v2',
    contractId,

    readInvoice: (invoiceId) =>
      viewCall<OnchainInvoice | null>(config.rpcUrl, contractId, 'get_invoice', { invoice_id: invoiceId }),

    expectedTx: (kind, invoiceId) =>
      kind === 'payment'
        ? {
            receiver: config.usdcId,
            method: 'ft_transfer_call',
            matches: (args) => args.msg === invoiceId && args.receiver_id === contractId,
          }
        : {
            receiver: contractId,
            method: 'settle_invoice',
            matches: (args) => args.invoice_id === invoiceId,
          },

    async health(): Promise<HealthReport> {
      const report: HealthReport = { configMatches: false, contractRegistered: false, treasuryRegistered: false, rpcReachable: true }
      try {
        const onchain = await viewCall<{ admin: string; treasury: string; usdc_token: string }>(
          config.rpcUrl,
          contractId,
          'get_config',
        )
        report.configMatches =
          onchain.admin === config.adminAccount && onchain.treasury === config.treasury && onchain.usdc_token === config.usdcId
        report.contractRegistered = (await storageBalanceOf(config.rpcUrl, config.usdcId, contractId)) !== null
        report.treasuryRegistered = (await storageBalanceOf(config.rpcUrl, config.usdcId, config.treasury)) !== null
      } catch {
        report.rpcReachable = false
      }
      return report
    },
  }
}
