import { useMemo, useState } from 'react'
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { api } from '../lib/api'
import { clientAdapter } from '../lib/contracts'
import { downloadStudentCsvTemplate, parseStudentCsv, type StudentCsvRow } from '../lib/csv-import'
import { formatAmount } from '../lib/money'
import { friendlyError, useNear } from '../lib/near'
import { Button, Card, Notice } from '../components/ui'
import type { InvoiceView } from '../lib/types'

interface PublishedStudent { studentName: string; studentId: string; amountBase: string; invoiceId: string; paymentLink: string }
const BATCH_SIZE = 5
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))
const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`

function downloadResults(rows: PublishedStudent[]) {
  const data = [
    ['Student Name', 'Student ID', 'Fee (USDC)', 'Invoice ID', 'Payment Link'],
    ...rows.map((row) => [row.studentName, row.studentId, formatAmount(row.amountBase, false), row.invoiceId, row.paymentLink]),
  ]
  const blob = new Blob([data.map((line) => line.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `studentfee-payment-links-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url)
}

export default function BulkStudentImport({ shareBase, existingInvoices, onClose, onDone }: {
  shareBase: string | null; existingInvoices: InvoiceView[]; onClose: () => void; onDone: () => void
}) {
  const near = useNear()
  const [rows, setRows] = useState<StudentCsvRow[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [draftsCreated, setDraftsCreated] = useState(0)
  const [published, setPublished] = useState<PublishedStudent[]>([])
  const [complete, setComplete] = useState(false)
  const invalidCount = useMemo(() => rows.filter((row) => row.error).length, [rows])
  const validRows = useMemo(() => rows.filter((row) => !row.error), [rows])
  const linkBase = shareBase ?? window.location.origin

  const selectFile = async (file?: File) => {
    setError(null); setRows([]); setPublished([]); setComplete(false); setDraftsCreated(0); setProgress(0)
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Choose a .csv file.'); return }
    if (file.size > 1_000_000) { setError('The CSV file must be smaller than 1 MB.'); return }
    try {
      const parsed = parseStudentCsv(await file.text())
      const existingKeys = new Set(existingInvoices.filter((invoice) => invoice.studentId && invoice.status !== 'Cancelled').map((invoice) => `${invoice.studentId.toLowerCase()}::${invoice.term.toLowerCase()}`))
      const checked = parsed.map((row) => {
        const key = `${row.studentId.toLowerCase()}::${row.term.toLowerCase()}`
        return !row.error && row.studentId && existingKeys.has(key)
          ? { ...row, error: 'An invoice already exists for this Student ID and Term.' }
          : row
      })
      setRows(checked); setFileName(file.name)
      if (checked.some((row) => row.error)) setError('Correct the highlighted rows in your spreadsheet, then upload the corrected CSV.')
    } catch (e) { setError(friendlyError(e)) }
  }

  const startImport = async () => {
    setError(null)
    if (!near.config) { setError('The NEAR wallet is still loading. Try again in a moment.'); return }
    if (!near.accountId) { near.connect(); setError('Connect the school administrator wallet, then press Generate invoices again.'); return }
    if (near.accountId !== near.config.adminAccount) { setError(`Switch to the school administrator wallet (${near.config.adminAccount}).`); return }
    if (!validRows.length || invalidCount) return
    setBusy(true)
    let createdCount = 0
    const output: PublishedStudent[] = []
    try {
      for (let offset = 0; offset < validRows.length; offset += BATCH_SIZE) {
        const group = validRows.slice(offset, offset + BATCH_SIZE)
        const drafts = []
        for (const row of group) {
          const draft = await api.createInvoice({
            studentName: row.studentName, studentId: row.studentId, term: row.term,
            amount: row.amount, dueDate: row.dueDate, note: row.note, lineItems: [],
          })
          drafts.push({ ...draft, studentName: row.studentName, studentId: row.studentId })
          createdCount += 1; setDraftsCreated(createdCount)
        }
        const adapter = clientAdapter(drafts[0].contractVersion)
        const txHash = await near.callBatch(drafts.map((draft) => adapter.publish(draft)))
        if (!txHash) throw new Error('Your wallet did not return a transaction reference. Check the invoice list before retrying.')
        let verified: Awaited<ReturnType<typeof api.invoice>>[] = []
        for (let attempt = 0; attempt < 4; attempt += 1) {
          await wait(1800)
          verified = await Promise.all(drafts.map((draft) => api.invoice(draft.id)))
          if (verified.every((invoice) => invoice.chainStatus !== null)) break
        }
        if (verified.length !== drafts.length || verified.some((invoice) => invoice.chainStatus === null)) {
          throw new Error('The batch was sent, but one or more invoices are not yet visible on-chain. Stop and refresh the invoice list before retrying.')
        }
        output.push(...drafts.map((draft) => ({
          studentName: draft.studentName, studentId: draft.studentId, amountBase: draft.amountBase,
          invoiceId: draft.id, paymentLink: `${linkBase}/pay/${draft.id}`,
        })))
        setPublished([...output]); setProgress(Math.min(offset + group.length, validRows.length))
      }
      setComplete(true); onDone()
    } catch (e) {
      setError(friendlyError(e))
      if (createdCount > 0) onDone()
    } finally { setBusy(false) }
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="font-display text-xl font-semibold text-ink">Bulk student import</h2>
          <p className="mt-1 text-sm text-slate-600">Upload up to 200 students and publish individual invoices in wallet-approved batches.</p></div>
        <Button variant="ghost" onClick={onClose} disabled={busy} aria-label="Close bulk import"><X className="h-4 w-4" /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={downloadStudentCsvTemplate}><Download className="h-4 w-4" /> Download CSV template</Button>
        <span className="text-xs text-slate-500">Required: Student Name, Term, Fee (USDC), Due Date. Dates accept DD/MM/YYYY or YYYY-MM-DD (ambiguous dates use DD/MM/YYYY). Student ID and Note are optional.</span>
      </div>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-brand-500">
        <FileSpreadsheet className="h-8 w-8 text-brand-700" />
        <span className="font-semibold text-ink">{fileName || 'Choose a student CSV file'}</span>
        <span className="text-xs text-slate-500">CSV only · maximum 1 MB · up to 200 students</span>
        <input type="file" accept=".csv,text/csv" className="sr-only" disabled={busy || draftsCreated > 0} onChange={(event) => void selectFile(event.target.files?.[0])} />
      </label>
      {rows.length > 0 && <div className="space-y-3">
        <div className="flex gap-3 text-sm">
          <span className="rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-800">{validRows.length} valid</span>
          <span className="rounded-lg bg-rose-50 px-3 py-2 font-semibold text-rose-800">{invalidCount} errors</span>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Row</th><th className="p-3">Student</th><th className="p-3">Student ID</th><th className="p-3">Term</th><th className="p-3">Fee</th><th className="p-3">Validation</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.slice(0, 12).map((row) => <tr key={row.rowNumber}>
              <td className="p-3">{row.rowNumber}</td><td className="p-3 font-medium">{row.studentName || '—'}</td><td className="p-3">{row.studentId || '—'}</td>
              <td className="p-3">{row.term || '—'}</td><td className="p-3">{row.amount || '—'}</td>
              <td className="p-3">{row.error ? <span className="text-rose-700">{row.error}</span> : <span className="text-emerald-700">Ready</span>}</td>
            </tr>)}</tbody>
          </table>
          {rows.length > 12 && <p className="border-t px-3 py-2 text-xs text-slate-500">Showing 12 of {rows.length} rows. All rows are validated.</p>}
        </div>
      </div>}
      {busy && <div className="space-y-2">
        <div className="flex justify-between text-sm"><span>Publishing invoices</span><span>{progress} / {validRows.length}</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-brand-700 transition-all" style={{ width: `${validRows.length ? (progress / validRows.length) * 100 : 0}%` }} /></div>
        <p className="text-xs text-slate-500">Approve each batch in your NEAR wallet. Each transaction contains up to five invoices.</p>
      </div>}
      {draftsCreated > published.length && !complete && !busy && <Notice tone="warn">{draftsCreated - published.length} draft invoice(s) were saved but not confirmed as published. Do not restart this upload, because that could create duplicates. Refresh the invoice list and inspect these drafts; publish only those still marked Not published.</Notice>}
      {published.length > 0 && <div className="space-y-3">
        <Notice tone={complete ? 'info' : 'warn'}>{complete ? `Successfully published ${published.length} of ${validRows.length} invoices. Individual payment links are ready.` : `${published.length} invoices have been verified on-chain so far.`}</Notice>
        <Button variant="secondary" onClick={() => downloadResults(published)}><Download className="h-4 w-4" /> Download payment links CSV</Button>
        <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200">{published.map((row) => <div key={row.invoiceId} className="border-b px-3 py-2 last:border-0">
          <p className="text-sm font-semibold">{row.studentName} · ${formatAmount(row.amountBase)}</p>
          <a className="break-all text-xs text-brand-700 underline" href={row.paymentLink} target="_blank" rel="noreferrer">{row.paymentLink}</a>
        </div>)}</div>
      </div>}
      {error && <Notice tone="error">{error}</Notice>}
      {!complete && <div className="flex flex-wrap gap-2">
        <Button busy={busy} disabled={!rows.length || invalidCount > 0 || validRows.length === 0 || busy || draftsCreated > 0} onClick={() => void startImport()}><Upload className="h-4 w-4" /> {busy ? 'Working...' : 'Generate invoices and payment links'}</Button>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
      </div>}
      {complete && <Button onClick={onClose}>Done</Button>}
      <p className="text-xs leading-5 text-slate-500">Creates individual invoices on NEAR Testnet using the existing v2 contract. Wallet approval is required for each batch. No mainnet funds are used.</p>
    </Card>
  )
}
