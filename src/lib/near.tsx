import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setupWalletSelector, type WalletSelector } from '@near-wallet-selector/core'
import { setupModal, type WalletSelectorModal } from '@near-wallet-selector/modal-ui'
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet'
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet'
import { setupHereWallet } from '@near-wallet-selector/here-wallet'
import { actionCreators } from '@near-js/transactions'
import '@near-wallet-selector/modal-ui/styles.css'
import { api } from './api'
import type { PublicConfig } from './types'

export const GAS_100_TGAS = 100_000_000_000_000n
export const GAS_30_TGAS = 30_000_000_000_000n

export interface SignedLogin {
  accountId: string
  publicKey: string
  signature: string
}

interface NearContextValue {
  config: PublicConfig | null
  loadError: string | null
  accountId: string | null
  connect: () => void
  disconnect: () => Promise<void>
  /** Signs and sends one function call. Resolves with the transaction hash when the wallet reports it. */
  call: (input: {
    receiverId: string
    methodName: string
    args: Record<string, unknown>
    gas: bigint
    deposit?: bigint
  }) => Promise<string | null>
  signLogin: (nonce: string, message: string, recipient: string) => Promise<SignedLogin>
}

const NearContext = createContext<NearContextValue | null>(null)

export function useNear(): NearContextValue {
  const value = useContext(NearContext)
  if (!value) throw new Error('useNear must be used inside NearProvider')
  return value
}

/** Turns wallet and network failures into plain language. */
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/closed|cancel|reject|denied|declined|user/i.test(message)) return 'The request was cancelled in your wallet.'
  if (/not enough|NotEnoughBalance|balance/i.test(message)) return 'This account does not have enough funds for the payment.'
  if (/not registered|storage/i.test(message)) return 'This account is not set up to hold USDC yet.'
  return message || 'Something went wrong. Please try again.'
}

export function NearProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const selectorRef = useRef<WalletSelector | null>(null)
  const modalRef = useRef<WalletSelectorModal | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    void (async () => {
      try {
        const cfg = await api.config()
        const selector = await setupWalletSelector({
          network: 'testnet',
          modules: [setupMyNearWallet(), setupMeteorWallet(), setupHereWallet()],
        })
        if (abort.signal.aborted) return
        selectorRef.current = selector
        modalRef.current = setupModal(selector, { contractId: cfg.contractId })
        const active = (state: ReturnType<WalletSelector['store']['getState']>) =>
          state.accounts.find((account) => account.active)?.accountId ?? null
        setAccountId(active(selector.store.getState()))
        const sub = selector.store.observable.subscribe((state) => setAccountId(active(state)))
        unsubscribeRef.current = () => sub.unsubscribe()
        setConfig(cfg)
      } catch (error) {
        if (!abort.signal.aborted) setLoadError(error instanceof Error ? error.message : 'The app could not start.')
      }
    })()
    return () => {
      abort.abort()
      unsubscribeRef.current?.()
    }
  }, [])

  const connect = useCallback(() => modalRef.current?.show(), [])

  const disconnect = useCallback(async () => {
    const selector = selectorRef.current
    if (!selector) return
    const wallet = await selector.wallet().catch(() => null)
    await wallet?.signOut().catch(() => undefined)
  }, [])

  const call = useCallback<NearContextValue['call']>(async ({ receiverId, methodName, args, gas, deposit = 0n }) => {
    const selector = selectorRef.current
    if (!selector) throw new Error('The wallet is still loading.')
    const wallet = await selector.wallet()
    const outcome = await wallet.signAndSendTransaction({
      receiverId,
      actions: [actionCreators.functionCall(methodName, args, gas, deposit)],
    })
    return outcome?.transaction_outcome?.id ?? null
  }, [])

  const signLogin = useCallback<NearContextValue['signLogin']>(async (nonce, message, recipient) => {
    const selector = selectorRef.current
    if (!selector) throw new Error('The wallet is still loading.')
    const wallet = await selector.wallet()
    if (!wallet.signMessage) throw new Error('This wallet cannot sign in messages. Try another wallet.')
    const signed = await wallet.signMessage({ message, recipient, nonce: Buffer.from(nonce, 'base64') })
    if (!signed) throw new Error('The wallet did not return a signature.')
    return signed
  }, [])

  const value = useMemo(
    () => ({ config, loadError, accountId, connect, disconnect, call, signLogin }),
    [config, loadError, accountId, connect, disconnect, call, signLogin],
  )
  return <NearContext.Provider value={value}>{children}</NearContext.Provider>
}
