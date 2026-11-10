// Minimal NEAR JSON-RPC helpers. Used in the browser and on the server.

const FALLBACK_RPC = 'https://test.rpc.fastnear.com'

interface RpcResponse<T> {
  result?: T
  error?: { message?: string; data?: unknown; cause?: { name?: string } }
}

export async function rpc<T>(rpcUrl: string, method: string, params: unknown): Promise<T> {
  const urls = rpcUrl === FALLBACK_RPC ? [rpcUrl] : [rpcUrl, FALLBACK_RPC]
  let lastError = new Error('The network is not reachable right now.')
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'fees', method, params }),
      })
      const body = (await res.json()) as RpcResponse<T>
      if (body.error) {
        lastError = new Error(body.error.data ? (typeof body.error.data === 'string' ? body.error.data : JSON.stringify(body.error.data)) : (body.error.message ?? 'RPC error'))
        // A definite answer from the chain (for example unknown transaction) is not retried.
        if (body.error.cause?.name) throw lastError
        continue
      }
      if (body.result === undefined) continue
      return body.result
    } catch (error) {
      lastError = error instanceof Error ? error : lastError
      if (/UNKNOWN_TRANSACTION|DOES_NOT_EXIST|UNKNOWN_ACCESS_KEY/.test(lastError.message)) throw lastError
    }
  }
  throw lastError
}

interface CallResult {
  result: number[]
  error?: string
}

/** Calls a read-only contract method and parses its JSON result. */
export async function viewCall<T>(
  rpcUrl: string,
  contractId: string,
  methodName: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const out = await rpc<CallResult>(rpcUrl, 'query', {
    request_type: 'call_function',
    finality: 'final',
    account_id: contractId,
    method_name: methodName,
    args_base64: btoa(JSON.stringify(args)),
  })
  if (out.error) throw new Error(out.error)
  const text = new TextDecoder().decode(new Uint8Array(out.result))
  return JSON.parse(text) as T
}

export interface TxStatus {
  status: unknown
  transaction: {
    signer_id: string
    receiver_id: string
    hash: string
    actions: Array<{ FunctionCall?: { method_name: string; args: string } } | string>
  }
}

export function getTransaction(rpcUrl: string, hash: string, signerId: string): Promise<TxStatus> {
  return rpc<TxStatus>(rpcUrl, 'tx', { tx_hash: hash, sender_account_id: signerId, wait_until: 'FINAL' })
}

/** True when the account exists on the network behind this RPC endpoint (so a mainnet-only account is false on testnet). */
export async function accountExists(rpcUrl: string, accountId: string): Promise<boolean> {
  try {
    await rpc(rpcUrl, 'query', { request_type: 'view_account', finality: 'final', account_id: accountId })
    return true
  } catch (error) {
    if (error instanceof Error && /does not exist|UNKNOWN_ACCOUNT/i.test(error.message)) return false
    throw error
  }
}

export interface AccessKeyInfo {
  permission: 'FullAccess' | { FunctionCall: unknown }
}

export function viewAccessKey(rpcUrl: string, accountId: string, publicKey: string): Promise<AccessKeyInfo> {
  return rpc<AccessKeyInfo>(rpcUrl, 'query', {
    request_type: 'view_access_key',
    finality: 'final',
    account_id: accountId,
    public_key: publicKey,
  })
}

export interface StorageBalance {
  total: string
  available: string
}

/** Returns null when the account is not registered with the token. */
export function storageBalanceOf(rpcUrl: string, tokenId: string, accountId: string) {
  return viewCall<StorageBalance | null>(rpcUrl, tokenId, 'storage_balance_of', { account_id: accountId })
}

export function ftBalanceOf(rpcUrl: string, tokenId: string, accountId: string) {
  return viewCall<string>(rpcUrl, tokenId, 'ft_balance_of', { account_id: accountId })
}
