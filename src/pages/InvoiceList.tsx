import { Copy, ExternalLink } from 'lucide-react'
import { formatAmount } from '../lib/money'
import { formatDate, shortHash, txUrl } from '../lib/format'
import type { InvoiceView, PublicConfig } from '../lib/types'
import { Button, StatusBadge } from '../components/ui'

export type RowAction = 'copy' | 'publish' | 'cancel' | 'finish' | 'refund' | 'delete'

export default function InvoiceList({
  invoices,
  config,
  busyId,
  linksReady,
  onAction,
}: {
  invoices: InvoiceView[]
  config: PublicConfig
  busyId: string | null
  linksReady: boolean
  onAction: (action: RowAction, invoice: InvoiceView) => void
}) {
  if (invoices.length === 0) {
    return <p className="rounded-xl bg-white px-4 py-10 text-center text-slate-600 shadow-card">No invoices match this view.</p>
  }
  return (
    <ul className="space-y-3">
      {invoices.map((invoice) => {
        const busy = busyId === invoice.id
        return (
          <li key={invoice.id} className="rounded-xl bg-white p-4 shadow-card">
            <div className="grid gap-3 md:grid-cols-[2fr,1fr,1fr,1.2fr] md:items-center">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{invoice.studentName}</p>
                <p className="truncate text-sm text-slate-600">
                  {invoice.term}
                  {invoice.studentId ? ` · ${invoice.studentId}` : ''}
                </p>
              </div>
              <div>
                <p className="font-bold tabular-nums text-[#17243b] opacity-100" style={{ color: "#17243b", opacity: 1 }}>${formatAmount(invoice.amountBase)}</p>
                <p className="text-sm text-slate-600">Due {formatDate(invoice.dueDate)}</p>
              </div>
              <div>
                <StatusBadge status={invoice.status} />
              </div>
              <div className="min-w-0 text-sm text-slate-600">
                {invoice.paymentTx ? (
                  <a
                    className="inline-flex items-center gap-1 text-brand-700 underline"
                    href={txUrl(config, invoice.paymentTx)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {shortHash(invoice.paymentTx)} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ) : invoice.status === 'Paid' ? (
                  <span>Paid by {invoice.payer}</span>
                ) : (
                  <span className="text-slate-400">No payment yet</span>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              {invoice.chainStatus && (
                <Button variant="secondary" className="!min-h-[40px]" disabled={!linksReady} onClick={() => onAction('copy', invoice)}>
                  <Copy className="h-4 w-4" aria-hidden /> Copy payment link
                </Button>
              )}
              {invoice.chainStatus === null && (
                <>
                  <Button className="!min-h-[40px]" busy={busy} onClick={() => onAction('publish', invoice)}>
                    Publish invoice
                  </Button>
                  <Button variant="danger" className="!min-h-[40px]" disabled={busy} onClick={() => onAction('delete', invoice)}>
                    Delete draft
                  </Button>
                </>
              )}
              {invoice.chainStatus === 'Pending' && (
                <Button variant="danger" className="!min-h-[40px]" busy={busy} onClick={() => onAction('cancel', invoice)}>
                  Cancel invoice
                </Button>
              )}
              {invoice.chainStatus === 'PaymentReceived' && (
                <>
                  <Button className="!min-h-[40px]" busy={busy} onClick={() => onAction('finish', invoice)}>
                    Finish payment
                  </Button>
                  <Button variant="danger" className="!min-h-[40px]" disabled={busy} onClick={() => onAction('refund', invoice)}>
                    Refund payer
                  </Button>
                </>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
