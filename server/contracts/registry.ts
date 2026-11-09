import type { ContractVersion } from '../../src/lib/types.js'
import { createV2Adapter } from './v2.js'
import type { ContractAdapter } from './types.js'

// Registered adapters, by contract account. v3 is specified but not built or deployed yet:
// when it exists, add its adapter here and switch NEW_INVOICE_VERSION. Existing v2 invoices keep
// resolving to the v2 adapter through the contract id stored on each invoice.
const adapters = new Map<string, ContractAdapter>()
const v2 = createV2Adapter()
adapters.set(v2.contractId, v2)

/** The contract used for newly created invoices. */
export const NEW_INVOICE_VERSION: ContractVersion = 'v2'

export function adapterForContract(contractId: string): ContractAdapter {
  const adapter = adapters.get(contractId)
  if (!adapter) throw new Error(`No adapter is registered for contract ${contractId}`)
  return adapter
}

export function adapterForNewInvoices(): ContractAdapter {
  for (const adapter of adapters.values()) if (adapter.version === NEW_INVOICE_VERSION) return adapter
  throw new Error(`No adapter is registered for ${NEW_INVOICE_VERSION}`)
}
