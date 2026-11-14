import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, Printer, Wallet } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { ApiError, api } from '../lib/api'
import { formatDate, formatDateTime, shortHash, txUrl } from '../lib/format'
import { formatAmount, toBaseUnits } from '../lib/money'
import { ftBalanceOf } from '../lib/rpc'
import { clientAdapter } from '../lib/contracts'
import { friendlyError, useNear, isAndroid } from '../lib/near'
import type { InvoiceView } from '../lib/types'
import { Button, Card, Notice, PageShell, Spinner, StatusBadge } from '../components/ui'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Retry briefly while NEAR RPC/indexers make the confirmed transaction available. */
async function recordTxWithRetry(
  id: string,
  kind: 'payment' | 'settlement',
  hash: string,
  signerId: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await api.recordTx(id, kind, hash, signerId)
      return true
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 409)) return false
      if (attempt < 29) await sleep(2000)
    }
  }
  return false
}

function Steps({ invoice }: { invoice: InvoiceView }) {
  const chain = invoice.chainStatus
  const sentDone = chain !== null && chain !== 'Pending' && chain !== 'Cancelled'
  const finished = chain === 'Paid'
  const steps = [
    { label: 'Send payment', done: sentDone, active: chain === 'Pending' },
    { label: 'Finish payment', done: finished, active: sentDone && !finished },
  ]
  return (
    <ol className="flex items-center gap-3 text-sm" aria-label="Payment progress">
      {steps.map((step, index) => (
        <li key={step.label} className="flex items-center gap-2">
          <span
            className={clsx(
              'flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold',
              step.done ? 'bg-emerald-600 text-white' : step.active ? 'bg-brand-700 text-white' : 'bg-slate-200 text-[#82919d]',
            )}
          >
            {step.done ? '✓' : index + 1}
          </span>
          <span className={step.active || step.done ? 'font-medium text-[#edf2f7]' : 'text-[#82919d]'}>{step.label}</span>
          {index === 0 && <span className="mx-1 h-px w-6 bg-slate-300" />}
        </li>
      ))}
    </ol>
  )
}

function Details({ invoice }: { invoice: InvoiceView }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[#a6b3c0]">Fee invoice for</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#edf2f7]">{invoice.studentName}</h1>
          <p className="text-sm text-[#a6b3c0]">
            {invoice.term}
            {invoice.studentId ? ` · Student ID ${invoice.studentId}` : ''}
          </p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>
      {invoice.lineItems.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg bg-white/[.045] px-4 text-sm">
          {invoice.lineItems.map((item, index) => (
            <li key={`${item.description}-${index}`} className="flex justify-between gap-3 py-2.5">
              <span>{item.description}</span>
              <span className="tabular-nums">{formatAmount(toBaseUnits(item.amount) ?? 0n)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end justify-between border-t border-white/10 pt-4">
        <div>
          <p className="text-sm text-[#a6b3c0]">Total due</p>
          <p className="font-display text-4xl font-bold tabular-nums tracking-tight !text-white opacity-100" style={{ color: "#edf2f7", opacity: 1 }}>
            ${formatAmount(invoice.amountBase)}
          </p>
        </div>
        <p className="text-right text-sm text-[#a6b3c0]">
          Due {formatDate(invoice.dueDate)}
          <br />
          <span className="text-xs">Paid in USDC (digital dollars)</span>
        </p>
      </div>
      {invoice.note && <p className="text-sm text-[#a6b3c0]">{invoice.note}</p>}
    </div>
  )
}

export default function PayPage({ id }: { id: string }) {
  const near = useNear()
  const { config, accountId } = near
  const [invoice, setInvoice] = useState<InvoiceView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'paying' | 'settling' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [balanceOf, setBalanceOf] = useState<{ account: string; value: bigint } | null>(null)
  const [paymentHash, setPaymentHash] = useState<string | null>(null)
  const balance = balanceOf && balanceOf.account === accountId ? balanceOf.value : null
  const payHash = useRef<string | null>(null)

  const refresh = useCallback(async (): Promise<InvoiceView | null> => {
    try {
      const next = await api.invoice(id)
      setInvoice(next)
      setLoadError(null)
      return next
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'The invoice could not be loaded.')
      return null
    }
  }, [id])

  useEffect(() => {
    let alive = true
    api
      .invoice(id)
      .then((next) => alive && setInvoice(next))
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : 'The invoice could not be loaded.'))
    return () => {
      alive = false
    }
  }, [id])

  // Keep the page current while a payment is moving through the network.
  const inFlight = invoice?.status === 'Processing' || busy !== null
  useEffect(() => {
    if (!inFlight) return
    const timer = setInterval(() => void refresh(), 4000)
    return () => clearInterval(timer)
  }, [inFlight, refresh])

  useEffect(() => {
    if (!accountId || !config) return
    let alive = true
    ftBalanceOf(config.rpcUrl, config.usdcId, accountId)
      .then((value) => alive && setBalanceOf({ account: accountId, value: BigInt(value) }))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [accountId, config, invoice?.status])

  const waitFor = async (done: (v: InvoiceView) => boolean, timeoutMs = 90_000): Promise<InvoiceView | null> => {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      await sleep(3000)
      const next = await refresh()
      if (next && done(next)) return next
    }
    return null
  }

  const pay = async () => {
    if (!config || !invoice) return
    if (!accountId) {
      near.connect()
      return
    }
    setError(null)
    const amount = BigInt(invoice.amountBase)
    if (balance !== null && balance < amount) {
      setError(`This account has $${formatAmount(balance)} in USDC, which is less than the $${formatAmount(amount)} due.`)
      return
    }
    setBusy('paying')
    const signerId = accountId
    try {
      payHash.current = await near.call(clientAdapter(invoice.contractVersion).pay(invoice, config))
      setPaymentHash(payHash.current)
      const next = await waitFor((v) => v.chainStatus !== 'Pending')
      // Persist the wallet-returned transaction hash even if the status poll timed out.
      // The API independently verifies the hash, signer, contract and invoice before saving it.
      const referenceSaved = payHash.current
        ? await recordTxWithRetry(id, 'payment', payHash.current, signerId)
        : false
      await refresh()
      if (!next || next.chainStatus === 'Pending') {
        setError('Your wallet submitted the payment, but the invoice is still waiting for network confirmation. Refresh this page shortly; do not pay again.')
      } else if (next.payer !== signerId) {
        setError('The network payment is recorded, but the payer account did not match this connected wallet. Please contact the school office.')
      } else if (!referenceSaved) {
        toast.error('Payment is confirmed, but its transaction reference is still syncing. Refresh the receipt shortly.')
      }
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(null)
    }
  }

  const finish = async () => {
    if (!config || !invoice) return
    if (!accountId) {
      near.connect()
      return
    }
    setError(null)
    setBusy('settling')
    try {
      const hash = await near.call(clientAdapter(invoice.contractVersion).settle(invoice))
      if (hash) await api.recordTx(id, 'settlement', hash, accountId).catch(() => undefined)
      const next = await waitFor((v) => v.chainStatus === 'Paid' || v.chainStatus === 'PaymentReceived', 90_000)
      if (next?.chainStatus === 'Paid') toast.success('Payment complete')
      else if (next?.chainStatus === 'PaymentReceived') setError('The school could not receive the payment yet. Please try finishing again in a moment.')
      await refresh()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(null)
    }
  }

  const header = config?.schoolName ?? 'School fees'
  const wallet = accountId ? (
    <span className="no-print hidden max-w-[12rem] truncate text-sm text-[#a6b3c0] sm:inline">{accountId}</span>
  ) : null

  if (loadError && !invoice) {
    return (
      <PageShell schoolName={header}>
        <Card className="mx-auto max-w-lg">
          <Notice tone="error">{loadError}</Notice>
        </Card>
      </PageShell>
    )
  }
  if (!invoice || !config) {
    return (
      <PageShell schoolName={header}>
        <Spinner label="Loading your invoice" />
      </PageShell>
    )
  }

  const chain = invoice.chainStatus
  const paymentTx = invoice.paymentTx ?? paymentHash
  return (
    <PageShell schoolName={invoice.schoolName} right={wallet}>
      <div className="mx-auto max-w-2xl space-y-4 sm:space-y-5">
        <div className="rounded-[20px] border border-white/10 bg-[#071014] px-5 py-4 text-white shadow-card sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5ef2c4]">StudentFee secure checkout</p>
              <p className="mt-1 text-sm text-white/80">School fee payment portal</p>
            </div>
            <span className="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-[#5ef2c4] ring-1 ring-white/15">USDC · NEAR</span>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-white/75">
            <span className="h-2 w-2 rounded-full bg-[#5ef2c4]" />
            Payment status is checked against the NEAR network
          </div>
        </div>
        <Card className="space-y-6">
          <Details invoice={invoice} />

          {invoice.status === 'Not published' && <Notice tone="info">This invoice is not ready for payment yet. Please contact the school office.</Notice>}
          {invoice.status === 'Cancelled' && <Notice tone="warn">This invoice was cancelled by the school. No payment is needed.</Notice>}

          {(chain === 'Pending' || chain === 'PaymentReceived' || chain === 'Settling' || chain === 'Refunding') && (
            <div className="space-y-4 border-t border-white/10 pt-5">
              {chain !== 'Refunding' && <Steps invoice={invoice} />}
              {invoice.status === 'Overdue' && <Notice tone="warn">This invoice is past its due date. You can still pay it now.</Notice>}

              {chain === 'Pending' && (
                <>
                  <Button className="w-full" busy={busy === 'paying'} onClick={() => void pay()}>
                    {!busy && !accountId && <Wallet className="h-4 w-4" aria-hidden />}
                    {busy === 'paying' ? 'Confirm in your wallet...' : accountId ? `Pay $${formatAmount(invoice.amountBase)}` : 'Connect wallet to pay'}
                  </Button>
                  {isAndroid && !accountId && (
                    <button type="button" onClick={near.connectOther} className="min-h-[44px] w-full text-sm font-medium text-[#5ef2c4] underline">
                      Use another wallet
                    </button>
                  )}
                  {isAndroid && !accountId && (
                    <p className="text-center text-xs text-[#82919d]">Using NEAR Mobile? It must be set to the Testnet network to approve test payments.</p>
                  )}
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-white p-4 text-center sm:flex-row sm:text-left">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=176x176&margin=8&data=${encodeURIComponent(window.location.href)}`}
                      alt="QR code linking to this school fee invoice"
                      width="132"
                      height="132"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-[132px] w-[132px] rounded-lg border border-white/10 bg-white"
                    />
                    <div className="space-y-1">
                      <p className="font-semibold text-[#edf2f7]">Scan to open this invoice</p>
                      <p className="text-xs leading-5 text-[#82919d]">Use another phone camera to open this payment page. The QR image is generated by an external service from this public invoice link; copy the link instead if you prefer not to load the QR. Payment still requires your wallet approval.</p>
                      <button type="button" onClick={() => { void navigator.clipboard.writeText(window.location.href).then(() => toast.success('Invoice link copied')).catch(() => toast.error('Could not copy the invoice link')) }} className="text-xs font-semibold text-[#5ef2c4] underline">Copy invoice link</button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[.045] p-3.5">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-[#a6b3c0]">Payment method</span>
                      <span className="font-semibold text-[#edf2f7]">USDC on NEAR</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-[#a6b3c0]">Network fee</span>
                      <span className="font-medium text-[#edf2f7]">Paid in NEAR</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-[#82919d]">
                      {accountId
                        ? `Connected wallet: ${accountId}${balance !== null ? ` · USDC balance: ${formatAmount(balance)}` : ''}`
                        : 'Your wallet will ask you to approve the payment. StudentFee never has access to your recovery phrase or private keys.'}
                    </p>
                  </div>
                </>
              )}

              {chain === 'PaymentReceived' && (
                <>
                  <Notice tone="info">Step 1 is done. Your payment has reached the school. One more confirmation moves it into the school account.</Notice>
                  <Button className="w-full" busy={busy === 'settling'} onClick={() => void finish()}>
                    {busy === 'settling' ? 'Finishing payment...' : accountId ? 'Finish payment' : 'Connect wallet to finish'}
                  </Button>
                </>
              )}

              {chain === 'Settling' && <Spinner label="Finishing your payment. This takes a few seconds." />}
              {chain === 'Refunding' && <Notice tone="info">A refund for this invoice is being processed. The status will update here.</Notice>}
            </div>
          )}

          {error && <Notice tone="error">{error}</Notice>}
        </Card>

        {chain === 'Paid' && (
          <Card className="receipt-print relative space-y-5 overflow-hidden border-[#5ef2c4]/20">
            <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 rounded-full bg-teal-400/20 blur-[85px]" />
            <div className="relative flex flex-col items-center gap-3 py-5 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#5ef2c4]/70 bg-[#5ef2c4]/10 text-[#5ef2c4] shadow-[0_0_65px_rgba(45,212,191,.25)]">
                <CheckCircle2 className="h-10 w-10" aria-hidden />
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white">Payment received</h2>
              <p className="font-display text-5xl font-bold tracking-tight text-white">${formatAmount(invoice.amountBase)}</p>
              <p className="text-sm text-[#a6b3c0]">USDC · Verified on NEAR</p>
              <span className="rounded-full bg-[#5ef2c4]/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#5ef2c4]">Verified · Paid</span>
            </div>
            <div className="relative rounded-xl border border-white/10 bg-white/[.045] p-4">
              <p className="text-xs font-semibold uppercase tracking-[.14em] text-[#82919d]">{invoice.schoolName}</p>
              <p className="mt-1 font-display text-xl font-semibold text-white">{invoice.studentName}</p>
              <p className="mt-1 text-xs text-[#82919d]">{invoice.term} · Invoice {invoice.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <dl className="relative grid grid-cols-[auto,1fr] gap-x-4 gap-y-3 rounded-xl border border-white/10 bg-white/[.035] p-4 text-sm">
              <dt className="text-[#a6b3c0]">Status</dt><dd className="text-right font-semibold text-[#5ef2c4]">Paid</dd>
              <dt className="text-[#a6b3c0]">Amount received</dt><dd className="text-right font-semibold tabular-nums">${formatAmount(invoice.amountBase)} USDC</dd>
              <dt className="text-[#a6b3c0]">Network</dt><dd className="text-right">NEAR Testnet</dd>
              {invoice.paidAt && <><dt className="text-[#a6b3c0]">Paid on</dt><dd className="text-right">{formatDateTime(invoice.paidAt)}</dd></>}
              {invoice.payer && <><dt className="text-[#a6b3c0]">Paid by</dt><dd className="break-all text-right">{invoice.payer}</dd></>}
              <dt className="text-[#a6b3c0]">Blockchain transaction</dt>
              <dd className="break-all text-right">
                {paymentTx ? (
                  <a className="inline-flex items-center gap-1 text-[#5ef2c4] underline" href={txUrl(config, paymentTx)} target="_blank" rel="noopener noreferrer">{shortHash(paymentTx)} <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
                ) : invoice.settlementTx ? (
                  <a className="inline-flex items-center gap-1 text-[#5ef2c4] underline" href={txUrl(config, invoice.settlementTx)} target="_blank" rel="noopener noreferrer">{shortHash(invoice.settlementTx)} <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
                ) : <span className="text-[#fbbf77]">Transaction hash is still syncing. Refresh this receipt shortly.</span>}
              </dd>
              {invoice.settlementTx && paymentTx && <><dt className="text-[#a6b3c0]">Settlement</dt><dd className="break-all text-right"><a className="inline-flex items-center gap-1 text-[#5ef2c4] underline" href={txUrl(config, invoice.settlementTx)} target="_blank" rel="noopener noreferrer">{shortHash(invoice.settlementTx)} <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a></dd></>}
            </dl>
            <p className="relative text-center text-xs leading-5 text-[#82919d]">Keep this receipt for your records. Both payment and settlement references can be checked on the NEAR explorer.</p>
            <Button variant="secondary" className="no-print relative w-full !min-h-12" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print receipt
            </Button>
          </Card>
        )}
      </div>
    </PageShell>
  )
}
