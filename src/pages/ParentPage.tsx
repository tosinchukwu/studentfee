import { useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, BadgeCheck, BookOpen, CircleDollarSign, Clock3, ExternalLink, Plus, ReceiptText, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { formatDate } from '../lib/format'
import { formatAmount } from '../lib/money'
import type { InvoiceView } from '../lib/types'
import { navigate } from '../lib/router'
import { Button, Card, Notice, PageShell, Spinner, StatusBadge } from '../components/ui'

const STORAGE_KEY = 'studentfee.parent.invoice-ids'
const extractId = (value: string) => /([0-9a-f]{32})/i.exec(value.trim())?.[1].toLowerCase() ?? null

export default function ParentPage() {
  const [value, setValue] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const [invoices, setInvoices] = useState<InvoiceView[]>([])
  const [failedIds, setFailedIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
      if (Array.isArray(stored)) setIds(stored.filter((id): id is string => typeof id === 'string' && /^[0-9a-f]{32}$/.test(id)))
    } catch { setIds([]) }
  }, [])

  useEffect(() => {
    let active = true
    if (!ids.length) {
      setInvoices([])
      setFailedIds([])
      setLoading(false)
      setRefreshing(false)
      return
    }
    setLoading(true)
    Promise.all(ids.map(async (id) => {
      try { return { id, invoice: await api.invoice(id) } }
      catch { return { id, invoice: null } }
    }))
      .then((results) => {
        if (!active) return
        setInvoices(results.flatMap((item) => item.invoice ? [item.invoice] : []))
        setFailedIds(results.filter((item) => item.invoice === null).map((item) => item.id))
      })
      .finally(() => {
        if (active) {
          setLoading(false)
          setRefreshing(false)
        }
      })
    return () => { active = false }
  }, [ids, refreshToken])

  const addInvoice = async (event: FormEvent) => {
    event.preventDefault()
    const id = extractId(value)
    if (!id) { setError('Paste the full payment link sent by your school, or its 32-character invoice code.'); return }
    setBusy(true); setError(null)
    try {
      const invoice = await api.invoice(id)
      const next = [id, ...ids.filter((item) => item !== id)].slice(0, 10)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setInvoices((current) => [invoice, ...current.filter((item) => item.id !== id)])
      setFailedIds((current) => current.filter((item) => item !== id))
      setIds(next); setValue('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'We could not find that invoice. Check the link and try again.')
    } finally { setBusy(false) }
  }

  const remove = (id: string) => {
    const next = ids.filter((item) => item !== id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setIds(next)
    setInvoices((items) => items.filter((item) => item.id !== id))
    setFailedIds((items) => items.filter((item) => item !== id))
  }

  const refresh = () => {
    setRefreshing(true)
    setRefreshToken((value) => value + 1)
  }
  const dueInvoices = invoices.filter((item) => item.status === 'Pending' || item.status === 'Overdue')
  const processingInvoices = invoices.filter((item) => item.status === 'Processing')
  const paidInvoices = invoices.filter((item) => item.status === 'Paid')
  const openBalance = dueInvoices.reduce((total, item) => total + BigInt(item.amountBase), 0n)
  const paidTotal = paidInvoices.reduce((total, item) => total + BigInt(item.amountBase), 0n)
  return (
    <PageShell schoolName="Parent fee hub">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-[1.75rem] bg-[#101D35] px-6 py-8 text-white shadow-card sm:px-9 sm:py-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-teal-200"><ShieldCheck className="h-4 w-4" /> Parent portal</div>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-teal-100">NEAR TESTNET · USDC</span>
          </div>
          <h1 className="mt-4 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">Your school fees, in one place.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">See what is due, follow payments in progress and return to verified receipts without searching through old messages.</p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs text-slate-300"><span className="rounded-full bg-white/10 px-3 py-1.5">USDC payments</span><span className="rounded-full bg-white/10 px-3 py-1.5">NEAR network</span><span className="rounded-full bg-white/10 px-3 py-1.5">Printable receipts</span></div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Fee summary">
          <Card className="relative overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-medium text-slate-500">Open balance</p><p className="mt-2 font-display text-2xl font-semibold tabular-nums text-ink">${formatAmount(openBalance)}</p><p className="mt-1 text-xs text-slate-500">USDC · {dueInvoices.length} invoice${dueInvoices.length === 1 ? "" : "s"} awaiting payment</p></div>
              <span className="rounded-2xl bg-amber-50 p-3 text-amber-700"><CircleDollarSign className="h-5 w-5" /></span>
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-medium text-slate-500">In progress</p><p className="mt-2 font-display text-3xl font-semibold text-ink">${processingInvoices.length}</p><p className="mt-1 text-xs text-slate-500">Payment${processingInvoices.length === 1 ? "" : "s"} being confirmed</p></div>
              <span className="rounded-2xl bg-sky-50 p-3 text-sky-700"><Clock3 className="h-5 w-5" /></span>
            </div>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-medium text-slate-500">Paid to date</p><p className="mt-2 font-display text-2xl font-semibold tabular-nums text-emerald-700">${formatAmount(paidTotal)}</p><p className="mt-1 text-xs text-slate-500">{paidInvoices.length} confirmed payment${paidInvoices.length === 1 ? "" : "s"}</p></div>
              <span className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><BadgeCheck className="h-5 w-5" /></span>
            </div>
          </Card>
        </section>

        <Card className="space-y-4">
          <div className="flex items-center gap-3"><span className="rounded-xl bg-teal-50 p-2.5 text-brand-700"><Plus className="h-5 w-5" /></span><div><h2 className="font-display text-xl font-semibold text-ink">Add a school invoice</h2><p className="text-sm text-slate-500">Paste the payment link provided by your school.</p></div></div>
          <form onSubmit={(event) => void addInvoice(event)} className="flex flex-col gap-3 sm:flex-row">
            <input className="field min-w-0 flex-1" value={value} onChange={(event) => { setValue(event.target.value); setError(null) }} placeholder="Paste invoice payment link or code" aria-label="Invoice payment link or code" />
            <Button type="submit" busy={busy} className="sm:min-w-36">Add invoice <ArrowRight className="h-4 w-4" /></Button>
          </form>
          {error && <Notice tone="error">{error}</Notice>}
          <p className="text-xs leading-5 text-slate-500">Your saved invoice list is stored only in this browser. It is not a school-wide parent account and won't automatically sync to another device.</p>
        </Card>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-display text-xl font-semibold text-ink">Your invoices</h2><p className="text-sm text-slate-500">Latest status retrieved from the StudentFee service</p></div>
            <Button variant="secondary" className="!min-h-[40px]" busy={refreshing || loading} disabled={loading || refreshing || ids.length === 0} onClick={refresh}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          </div>
          {failedIds.length > 0 && <Notice tone="warn">{failedIds.length} saved invoice{failedIds.length === 1 ? '' : 's'} could not be refreshed. Check your connection and try Refresh; your saved links have not been deleted.</Notice>}
          {loading ? <Card><Spinner label="Loading saved invoices" /></Card> : invoices.length ? (
            <div className="space-y-3">{invoices.map((invoice) => (
              <Card key={invoice.id} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{invoice.studentName}</h3><StatusBadge status={invoice.status} /></div>
                  <p className="mt-1 text-sm text-slate-600">{invoice.schoolName} · {invoice.term}</p>
                  <p className="mt-1 text-xs text-slate-500">Due {formatDate(invoice.dueDate)} · Invoice {invoice.id.slice(0, 8)}</p>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <p className="font-display text-xl font-semibold tabular-nums text-ink">${formatAmount(invoice.amountBase)} <span className="text-xs font-medium text-slate-500">USDC</span></p>
                  <Button onClick={() => navigate(`/pay/${invoice.id}`)}>{invoice.status === 'Paid' ? 'View receipt' : invoice.status === 'Processing' ? 'Continue' : 'View & pay'} <ArrowRight className="h-4 w-4" /></Button>
                  <button type="button" onClick={() => remove(invoice.id)} aria-label={`Remove invoice for ${invoice.studentName} from this device`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                </div>
              </Card>
            ))}</div>
          ) : <Card className="py-10 text-center"><BookOpen className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-semibold text-ink">No saved invoices yet</p><p className="mt-1 text-sm text-slate-500">Add a payment link above to see your child's fee details here.</p></Card>}
        </section>
        <p className="flex items-center justify-center gap-2 text-xs text-slate-500"><ExternalLink className="h-3.5 w-3.5" /> For help with an invoice, contact your school accounts office.</p>
      </div>
    </PageShell>
  )
}
