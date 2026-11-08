import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, Printer, Wallet } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { api } from '../lib/api'
import { formatDate, formatDateTime, shortHash, txUrl } from '../lib/format'
import { formatAmount, toBaseUnits } from '../lib/money'
import { ftBalanceOf } from '../lib/rpc'
import { GAS_100_TGAS, friendlyError, useNear } from '../lib/near'
import type { InvoiceView } from '../lib/types'
import { Button, Card, Notice, PageShell, Spinner, StatusBadge } from '../components/ui'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
              step.done ? 'bg-emerald-600 text-white' : step.active ? 'bg-brand-700 text-white' : 'bg-slate-200 text-slate-500',
            )}
          >
            {step.done ? '✓' : index + 1}
          </span>
          <span className={step.active || step.done ? 'font-medium text-ink' : 'text-slate-500'}>{step.label}</span>
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
          <p className="text-sm text-slate-600">Fee invoice for</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{invoice.studentName}</h1>
          <p className="text-sm text-slate-600">
            {invoice.term}
            {invoice.studentId ? ` · Student ID ${invoice.studentId}` : ''}
          </p>
        </div>
        <StatusBadge status={invoice.status} />
      </div>
      {invoice.lineItems.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg bg-slate-50 px-4 text-sm">
          {invoice.lineItems.map((item, index) => (
            <li key={`${item.description}-${index}`} className="flex justify-between gap-3 py-2.5">
              <span>{item.description}</span>
              <span className="tabular-nums">{formatAmount(toBaseUnits(item.amount) ?? 0n)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end justify-between border-t border-slate-100 pt-4">
        <div>
          <p className="text-sm text-slate-600">Total due</p>
          <p className="font-display text-4xl font-semibold tabular-nums tracking-tight text-ink">
            ${formatAmount(invoice.amountBase)}
          </p>
        </div>
        <p className="text-right text-sm text-slate-600">
          Due {formatDate(invoice.dueDate)}
          <br />
          <span className="text-xs">Paid in USDC (digital dollars)</span>
        </p>
      </div>
      {invoice.note && <p className="text-sm text-slate-600">{invoice.note}</p>}
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
    try {
      payHash.current = await near.call({
        receiverId: config.usdcId,
        methodName: 'ft_transfer_call',
        args: { receiver_id: config.contractId, amount: invoice.amountBase, msg: invoice.id },
        gas: GAS_100_TGAS,
        deposit: 1n,
      })
      const next = await waitFor((v) => v.chainStatus !== 'Pending')
      if (!next || next.chainStatus === 'Pending') {
        setError('We did not see your payment on the invoice. Nothing was kept. Please check your wallet and try again.')
      } else if (payHash.current && next.payer === accountId) {
        await api.recordTx(id, 'payment', payHash.current, accountId).catch(() => undefined)
        await refresh()
      }
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(null)
    }
  }

  const finish = async () => {
    if (!config) return
    if (!accountId) {
      near.connect()
      return
    }
    setError(null)
    setBusy('settling')
    try {
      const hash = await near.call({
        receiverId: config.contractId,
        methodName: 'settle_invoice',
        args: { invoice_id: id },
        gas: GAS_100_TGAS,
      })
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
    <span className="no-print hidden max-w-[12rem] truncate text-sm text-slate-600 sm:inline">{accountId}</span>
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
  return (
    <PageShell schoolName={invoice.schoolName} right={wallet}>
      <div className="mx-auto max-w-lg space-y-4">
        <Card className="space-y-6">
          <Details invoice={invoice} />

          {invoice.status === 'Not published' && <Notice tone="info">This invoice is not ready for payment yet. Please contact the school office.</Notice>}
          {invoice.status === 'Cancelled' && <Notice tone="warn">This invoice was cancelled by the school. No payment is needed.</Notice>}

          {(chain === 'Pending' || chain === 'PaymentReceived' || chain === 'Settling' || chain === 'Refunding') && (
            <div className="space-y-4 border-t border-slate-100 pt-5">
              {chain !== 'Refunding' && <Steps invoice={invoice} />}
              {invoice.status === 'Overdue' && <Notice tone="warn">This invoice is past its due date. You can still pay it now.</Notice>}

              {chain === 'Pending' && (
                <>
                  <Button className="w-full" busy={busy === 'paying'} onClick={() => void pay()}>
                    {!busy && !accountId && <Wallet className="h-4 w-4" aria-hidden />}
                    {busy === 'paying' ? 'Confirm in your wallet...' : accountId ? `Pay $${formatAmount(invoice.amountBase)}` : 'Connect wallet to pay'}
                  </Button>
                  <p className="text-center text-xs text-slate-500">
                    {accountId
                      ? `Paying from ${accountId}${balance !== null ? ` · Balance $${formatAmount(balance)}` : ''}`
                      : 'You will confirm the payment in your NEAR wallet. We never see your keys.'}
                  </p>
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
          <Card className="space-y-4 border-t-4 border-emerald-500">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-6 w-6" aria-hidden />
              <h2 className="font-display text-xl font-semibold">Payment received</h2>
            </div>
            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-600">Status</dt>
              <dd className="font-medium">Paid</dd>
              <dt className="text-slate-600">Amount</dt>
              <dd className="tabular-nums">${formatAmount(invoice.amountBase)}</dd>
              {invoice.paidAt && (
                <>
                  <dt className="text-slate-600">Paid on</dt>
                  <dd>{formatDateTime(invoice.paidAt)}</dd>
                </>
              )}
              {invoice.payer && (
                <>
                  <dt className="text-slate-600">Paid by</dt>
                  <dd className="break-all">{invoice.payer}</dd>
                </>
              )}
              <dt className="text-slate-600">Reference</dt>
              <dd className="break-all">
                {invoice.paymentTx ? (
                  <a className="inline-flex items-center gap-1 text-brand-700 underline" href={txUrl(config, invoice.paymentTx)} target="_blank" rel="noopener noreferrer">
                    {shortHash(invoice.paymentTx)} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : (
                  <span>Recorded on the network (invoice {shortHash(invoice.id)})</span>
                )}
              </dd>
            </dl>
            <Button variant="secondary" className="no-print w-full" onClick={() => window.print()}>
              <Printer className="h-4 w-4" aria-hidden /> Print receipt
            </Button>
          </Card>
        )}
      </div>
    </PageShell>
  )
}
