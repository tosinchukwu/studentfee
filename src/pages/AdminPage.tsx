import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, LogOut, Plus, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { ApiError, api, session } from '../lib/api'
import { copyText } from '../lib/format'
import { formatAmount } from '../lib/money'
import { clientAdapter } from '../lib/contracts'
import { friendlyError, isAndroid, useNear } from '../lib/near'
import { getShareBase } from '../lib/share'
import type { DisplayStatus, HealthReport, InvoiceView } from '../lib/types'
import { Button, Card, Notice, PageShell, Spinner } from '../components/ui'
import InvoiceList, { type RowAction } from './InvoiceList'
import NewInvoiceForm from './NewInvoiceForm'

type Filter = 'All' | DisplayStatus

function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const near = useNear()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const admin = near.config?.adminAccount ?? ''
  const wrongAccount = near.accountId !== null && near.accountId !== admin

  const signIn = async () => {
    setError(null)
    setBusy(true)
    try {
      const challenge = await api.challenge()
      const signed = await near.signLogin(challenge.nonce, challenge.message, challenge.recipient)
      const { token } = await api.login({
        accountId: signed.accountId,
        publicKey: signed.publicKey,
        signature: signed.signature,
        nonce: challenge.nonce,
        callbackUrls: [window.location.href, window.location.origin],
      })
      session.set(token)
      onSignedIn()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto max-w-md space-y-4 text-center">
      <ShieldCheck className="mx-auto h-9 w-9 text-brand-700" aria-hidden />
      <h1 className="font-display text-2xl font-semibold">School administrator</h1>
      <p className="text-sm text-slate-600">Sign in with the school wallet to create invoices and see payments.</p>
      {wrongAccount && (
        <Notice tone="warn">
          You are connected as {near.accountId}. Please switch to the school administrator account ({admin}).
        </Notice>
      )}
      {near.accountId === null ? (
        <>
          <Button className="w-full" onClick={near.connect}>Connect school wallet</Button>
          {isAndroid && (
            <button type="button" onClick={near.connectOther} className="min-h-[44px] w-full text-sm font-medium text-brand-700 underline">
              Use another wallet
            </button>
          )}
        </>
      ) : wrongAccount ? (
        <Button className="w-full" variant="secondary" onClick={() => void near.disconnect()}>Use a different wallet</Button>
      ) : (
        <Button className="w-full" busy={busy} onClick={() => void signIn()}>
          {busy ? 'Waiting for your wallet...' : 'Sign in'}
        </Button>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-card">
      <p className="text-sm text-slate-600">{label}</p>
      <p className={clsx('mt-1 font-display text-2xl font-semibold tabular-nums', tone)}>{value}</p>
    </div>
  )
}

function HealthStrip({ health }: { health: HealthReport | null }) {
  if (!health) return null
  const problems = [
    !health.rpcReachable && 'The network could not be reached to check the setup.',
    health.rpcReachable && !health.configMatches && 'The deployed contract settings do not match this app.',
    health.rpcReachable && !health.contractRegistered && 'The fee contract is not registered to receive USDC.',
    health.rpcReachable && !health.treasuryRegistered && 'The school treasury is not registered to receive USDC.',
  ].filter(Boolean)
  if (problems.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Payments are ready: the contract and school account are set up to receive USDC.
      </p>
    )
  }
  return (
    <Notice tone="warn">
      <span className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{problems.join(' ')}</span>
      </span>
    </Notice>
  )
}

export default function AdminPage() {
  const near = useNear()
  const [authed, setAuthed] = useState(() => session.get() !== null)
  const [invoices, setInvoices] = useState<InvoiceView[] | null>(null)
  const [health, setHealth] = useState<HealthReport | null>(null)
  const [filter, setFilter] = useState<Filter>('All')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareBase, setShareBase] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    void getShareBase().then(setShareBase)
  }, [])

  const load = useCallback(async () => {
    try {
      setInvoices((await api.adminInvoices()).invoices)
      setError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuthed(false)
      else setError(e instanceof Error ? e.message : 'Invoices could not be loaded.')
    }
  }, [])

  useEffect(() => {
    if (!authed) return
    let alive = true
    const pull = () =>
      api
        .adminInvoices()
        .then((result) => alive && (setInvoices(result.invoices), setError(null)))
        .catch((e: unknown) => {
          if (!alive) return
          if (e instanceof ApiError && e.status === 401) setAuthed(false)
          else setError(e instanceof Error ? e.message : 'Invoices could not be loaded.')
        })
    void pull()
    api.health().then((report) => alive && setHealth(report)).catch(() => undefined)
    const timer = setInterval(() => void pull(), 8000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [authed])

  const linkFor = (id: string) => `${shareBase ?? window.location.origin}/pay/${id}`

  const counts = useMemo(() => {
    const out: Record<string, number> = { All: invoices?.length ?? 0 }
    for (const invoice of invoices ?? []) out[invoice.status] = (out[invoice.status] ?? 0) + 1
    return out
  }, [invoices])

  const totals = useMemo(() => {
    let billed = 0n
    let collected = 0n
    let outstanding = 0n
    for (const invoice of invoices ?? []) {
      const amount = BigInt(invoice.amountBase)
      if (invoice.status === 'Cancelled' || invoice.status === 'Not published') continue
      billed += amount
      if (invoice.status === 'Paid') collected += amount
      else outstanding += amount
    }
    return { billed, collected, outstanding }
  }, [invoices])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (invoices ?? []).filter(
      (invoice) =>
        (filter === 'All' || invoice.status === filter) &&
        (!needle || `${invoice.studentName} ${invoice.studentId} ${invoice.term}`.toLowerCase().includes(needle)),
    )
  }, [invoices, filter, query])

  const requireAdminWallet = (): boolean => {
    if (!near.accountId) {
      near.connect()
      setError('Connect the school wallet, then try again.')
      return false
    }
    if (near.accountId !== near.config?.adminAccount) {
      setError(`Switch your wallet to the school administrator account (${near.config?.adminAccount}).`)
      return false
    }
    return true
  }

  const onAction = async (action: RowAction, invoice: InvoiceView) => {
    const config = near.config
    if (!config) return
    if (action === 'copy') {
      const ok = await copyText(linkFor(invoice.id))
      if (ok) toast.success('Payment link copied')
      else toast.error('Copying failed. Select the link and copy it by hand.')
      return
    }
    setError(null)
    if (action === 'delete') {
      if (!window.confirm(`Delete the draft invoice for ${invoice.studentName}?`)) return
      setBusyId(invoice.id)
      await api.deleteInvoice(invoice.id).catch((e: unknown) => setError(friendlyError(e)))
      setBusyId(null)
      await load()
      return
    }
    if (action === 'cancel' && !window.confirm(`Cancel the invoice for ${invoice.studentName}? Parents will no longer be able to pay it.`)) return
    if (action === 'refund' && !window.confirm(`Refund the payment for ${invoice.studentName} to ${invoice.payer}?`)) return
    if (action !== 'finish' && !requireAdminWallet()) return
    if (action === 'finish' && !near.accountId) {
      near.connect()
      return
    }

    setBusyId(invoice.id)
    try {
      const adapter = clientAdapter(invoice.contractVersion)
      const calls = {
        publish: adapter.publish(invoice),
        cancel: adapter.cancel(invoice),
        finish: adapter.settle(invoice),
        refund: adapter.refund(invoice),
      } as const
      const hash = await near.call(calls[action])
      if (action === 'finish' && hash && near.accountId) await api.recordTx(invoice.id, 'settlement', hash, near.accountId).catch(() => undefined)
      toast.success('Done. The status will update in a moment.')
      await load()
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusyId(null)
    }
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      await api.downloadCsv()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The export failed.')
    } finally {
      setExporting(false)
    }
  }

  const signOut = async () => {
    await api.logout().catch(() => undefined)
    session.clear()
    setAuthed(false)
    setInvoices(null)
  }

  const schoolName = near.config?.schoolName ?? 'School fees'
  if (!authed) {
    return (
      <PageShell schoolName={schoolName}>
        <SignIn onSignedIn={() => setAuthed(true)} />
      </PageShell>
    )
  }

  const filters: Filter[] = ['All', 'Pending', 'Overdue', 'Processing', 'Paid', 'Cancelled']
  if (counts['Not published']) filters.push('Not published')

  return (
    <PageShell
      schoolName={schoolName}
      right={
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Fee invoices</h1>
            <p className="text-sm text-slate-600">Signed in as {near.config?.adminAccount}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={exporting} onClick={() => void exportCsv()}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Button>
            <Button onClick={() => { setShowForm(true); setCreated(null) }}>
              <Plus className="h-4 w-4" aria-hidden /> New invoice
            </Button>
          </div>
        </div>

        <HealthStrip health={health} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Billed" value={`$${formatAmount(totals.billed)}`} />
          <Stat label="Collected" value={`$${formatAmount(totals.collected)}`} tone="text-emerald-700" />
          <Stat label="Outstanding" value={`$${formatAmount(totals.outstanding)}`} tone={totals.outstanding > 0n ? 'text-amber-700' : undefined} />
        </div>

        {created && (
          <Notice tone="info">
            <p className="font-medium">Invoice created. Send this link to the parent:</p>
            <p className="mt-1 break-all font-mono text-xs">{linkFor(created)}</p>
            <Button className="mt-2 !min-h-[40px]" variant="secondary" disabled={!shareBase} onClick={() => void onAction('copy', { id: created } as InvoiceView)}>
              Copy payment link
            </Button>
          </Notice>
        )}

        {showForm && (
          <NewInvoiceForm
            onClose={() => setShowForm(false)}
            onChanged={() => void load()}
            onPublished={(id) => {
              setShowForm(false)
              setCreated(id)
              void load()
            }}
          />
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
            {filters.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={filter === name}
                onClick={() => setFilter(name)}
                className={clsx(
                  'min-h-[40px] rounded-full px-3.5 text-sm font-medium ring-1 ring-inset transition-colors',
                  filter === name ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50',
                )}
              >
                {name} <span className="opacity-70">{counts[name] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="relative sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="field !pl-9" placeholder="Search student or term" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search invoices" />
          </div>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {invoices === null || !near.config ? (
          <Spinner label="Loading invoices" />
        ) : (
          <InvoiceList invoices={visible} config={near.config} busyId={busyId} linksReady={shareBase !== null} onAction={(a, i) => void onAction(a, i)} />
        )}
      </div>
    </PageShell>
  )
}
