import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowUpRight, CheckCircle2, Clock3, Download, FileText, Plus, Search, Upload, ShieldCheck, TriangleAlert, Wallet } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { ApiError, api, session } from '../lib/api'
import { copyText, formatDate } from '../lib/format'
import { formatAmount } from '../lib/money'
import { clientAdapter } from '../lib/contracts'
import { friendlyError, isAndroid, useNear } from '../lib/near'
import { getShareBase } from '../lib/share'
import type { DisplayStatus, HealthReport, InvoiceView } from '../lib/types'
import { Button, Card, Notice, PageShell, Spinner } from '../components/ui'
import InvoiceList, { type RowAction } from './InvoiceList'
import NewInvoiceForm from './NewInvoiceForm'
import BulkStudentImport from './BulkStudentImport'
import AdminWorkspace from '../components/AdminWorkspace'

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
          {isAndroid && (
            <p className="text-center text-xs text-slate-500">Using NEAR Mobile? It must be set to the Testnet network.</p>
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
  const [showBulkImport, setShowBulkImport] = useState(false)
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
    let overdue = 0n
    for (const invoice of invoices ?? []) {
      const amount = BigInt(invoice.amountBase)
      if (invoice.status === 'Cancelled' || invoice.status === 'Not published') continue
      billed += amount
      if (invoice.status === 'Paid') collected += amount
      else {
        outstanding += amount
        if (invoice.status === 'Overdue') overdue += amount
      }
    }
    return { billed, collected, outstanding, overdue }
  }, [invoices])

  const paidRate = totals.billed > 0n ? Number((totals.collected * 10000n) / totals.billed) / 100 : 0
  const recentInvoices = (invoices ?? []).slice(0, 5)
  const statusSummary = [
    { label: 'Paid', count: counts.Paid ?? 0, color: 'bg-emerald-500' },
    { label: 'Pending', count: counts.Pending ?? 0, color: 'bg-sky-500' },
    { label: 'Processing', count: counts.Processing ?? 0, color: 'bg-amber-500' },
    { label: 'Overdue', count: counts.Overdue ?? 0, color: 'bg-rose-500' },
  ]
  const monthlyCollections = useMemo(() => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1)
      return { key: `${date.getFullYear()}-${date.getMonth()}`, label: date.toLocaleDateString('en', { month: 'short' }), amount: 0n, count: 0 }
    })
    for (const invoice of invoices ?? []) {
      if (invoice.status !== 'Paid' || !invoice.paidAt) continue
      const date = new Date(invoice.paidAt)
      const bucket = months.find((month) => month.key === `${date.getFullYear()}-${date.getMonth()}`)
      if (bucket) { bucket.amount += BigInt(invoice.amountBase); bucket.count += 1 }
    }
    return months
  }, [invoices])
  const maxMonthly = monthlyCollections.reduce((max, month) => month.amount > max ? month.amount : max, 0n)

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

  const disconnectWallet = async () => {
    await signOut()
    await near.disconnect()
  }

  const schoolName = near.config?.schoolName ?? 'School fees'
  if (!authed) {
    return (
      <PageShell schoolName={schoolName} showDisconnect={false}>
        <SignIn onSignedIn={() => setAuthed(true)} />
      </PageShell>
    )
  }

  const filters: Filter[] = ['All', 'Pending', 'Overdue', 'Processing', 'Paid', 'Cancelled']
  if (counts['Not published']) filters.push('Not published')

  return (
    <AdminWorkspace schoolName={schoolName} accountId={near.config?.adminAccount ?? ''} onSignOut={() => void signOut()} onDisconnectWallet={() => void disconnectWallet()}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Fee invoices</h1>
            <p className="text-sm text-slate-600">Signed in as {near.config?.adminAccount}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={exporting} onClick={() => void exportCsv()}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Button>
            <Button variant="secondary" onClick={() => { setShowBulkImport(true); setShowForm(false) }}>
              <Upload className="h-4 w-4" aria-hidden /> Import CSV
            </Button>
            <Button onClick={() => { setShowBulkImport(false); setShowForm(true); setCreated(null) }}>
              <Plus className="h-4 w-4" aria-hidden /> New invoice
            </Button>
          </div>
        </div>

        <HealthStrip health={health} />

        {showBulkImport && <BulkStudentImport shareBase={shareBase} existingInvoices={invoices ?? []} onClose={() => setShowBulkImport(false)} onDone={() => void load()} />}

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
            <div className="flex items-center justify-between gap-2 text-sm text-slate-500"><span>Total billed</span><span className="rounded-xl bg-slate-100 p-2 text-slate-700"><FileText className="h-4 w-4" /></span></div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">${formatAmount(totals.billed)}</p>
            <p className="mt-1 text-xs text-slate-500">USDC across active invoices</p>
          </div>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 shadow-card sm:p-5">
            <div className="flex items-center justify-between gap-2 text-sm text-emerald-800"><span>Collected</span><span className="rounded-xl bg-white/80 p-2"><Wallet className="h-4 w-4" /></span></div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-emerald-800 sm:text-3xl">${formatAmount(totals.collected)}</p>
            <p className="mt-1 text-xs text-emerald-800/70">{paidRate.toFixed(1)}% of billed fees</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 shadow-card sm:p-5">
            <div className="flex items-center justify-between gap-2 text-sm text-amber-900"><span>Outstanding</span><span className="rounded-xl bg-white/80 p-2"><Clock3 className="h-4 w-4" /></span></div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-amber-900 sm:text-3xl">${formatAmount(totals.outstanding)}</p>
            <p className="mt-1 text-xs text-amber-900/70">Awaiting payment or settlement</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4 shadow-card sm:p-5">
            <div className="flex items-center justify-between gap-2 text-sm text-rose-800"><span>Overdue</span><span className="rounded-xl bg-white/80 p-2"><TriangleAlert className="h-4 w-4" /></span></div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-rose-800 sm:text-3xl">${formatAmount(totals.overdue)}</p>
            <p className="mt-1 text-xs text-rose-800/70">{counts.Overdue ?? 0} invoices need follow-up</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-5">
            <div className="flex items-center justify-between gap-2 text-sm text-slate-500"><span>Invoices</span><span className="rounded-xl bg-teal-50 p-2 text-brand-700"><Activity className="h-4 w-4" /></span></div>
            <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{counts.All ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">{counts.Paid ?? 0} fully paid</p>
          </div>
        </div>

        <div id="analytics" className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
          <Card className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-semibold text-ink">Collection overview</p><p className="mt-1 text-xs text-slate-500">Live breakdown from your invoice records</p></div>
              <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-brand-800">USDC</span>
            </div>
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-3xl font-display font-semibold tracking-tight text-ink">{paidRate.toFixed(1)}%</p><p className="mt-1 text-xs text-slate-500">Collection rate</p></div>
              <p className="text-right text-sm font-medium text-emerald-700">${formatAmount(totals.collected)} <span className="block text-xs font-normal text-slate-500">received</span></p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${paidRate.toFixed(1)} percent of billed fees collected`}>
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, paidRate)}%` }} />
            </div>
            <div className="space-y-3">
              {statusSummary.map((item) => (
                <div key={item.label} className="flex items-center gap-3 text-sm">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${item.color}`} />
                  <span className="w-24 text-slate-600">{item.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${counts.All ? (item.count / counts.All) * 100 : 0}%` }} /></div>
                  <span className="w-8 text-right font-semibold tabular-nums text-ink">{item.count}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-sm font-semibold text-ink">Recent invoices</p><p className="mt-1 text-xs text-slate-500">Latest records from the school office</p></div>
              <span className="rounded-xl bg-slate-100 p-2 text-slate-600"><ArrowUpRight className="h-4 w-4" /></span>
            </div>
            {recentInvoices.length ? (
              <ul className="divide-y divide-slate-100">
                {recentInvoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{invoice.studentName}</p><p className="mt-1 truncate text-xs text-slate-500">{invoice.term} · {formatDate(invoice.createdAt)}</p></div>
                    <div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums text-ink">${formatAmount(invoice.amountBase)}</p><p className={clsx('mt-1 text-xs font-medium', invoice.status === 'Paid' ? 'text-emerald-700' : invoice.status === 'Overdue' ? 'text-rose-700' : 'text-slate-500')}>{invoice.status}</p></div>
                  </li>
                ))}
              </ul>
            ) : <p className="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Your latest invoices will appear here.</p>}
          </Card>
        </div>

        <div id="analytics-chart"><Card className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-display text-lg font-semibold text-ink">Collection trend</p><p className="mt-1 text-xs text-slate-500">Confirmed paid invoices · last six months</p></div>
            <span className="rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-brand-800">USDC · on-chain paid</span>
          </div>
          <div className="grid grid-cols-6 gap-2 sm:gap-4">
            {monthlyCollections.map((month) => {
              const height = maxMonthly > 0n ? Math.max(5, Number((month.amount * 100n) / maxMonthly)) : 0
              return (
                <div key={month.key} className="flex min-w-0 flex-col items-center gap-2">
                  <span className="text-[10px] font-semibold tabular-nums text-slate-500 sm:text-xs">{month.count}</span>
                  <div className="flex h-28 w-full items-end justify-center rounded-xl bg-slate-50 p-1.5 sm:h-36">
                    <div className="w-full max-w-10 rounded-t-lg bg-gradient-to-t from-[#0f665f] to-[#35b8a7] transition-all" style={{ height: `${height}%`, minHeight: month.amount > 0n ? '6px' : '0' }} title={`${formatAmount(month.amount)} · ${month.count} paid invoices`} />
                  </div>
                  <span className="text-xs font-medium text-slate-500">{month.label}</span>
                  <span className="max-w-full truncate text-[10px] tabular-nums text-slate-400 sm:text-xs">${formatAmount(month.amount)}</span>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-slate-500">Only invoices marked Paid by the deployed contract are counted. This chart is based on the invoice history currently available to this school account.</p>
        </Card></div>

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

        <div id="invoices" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <div id="payments"><InvoiceList invoices={visible} config={near.config} busyId={busyId} linksReady={shareBase !== null} onAction={(a, i) => void onAction(a, i)} /></div>
        )}
      </div>
    </AdminWorkspace>
  )
}
