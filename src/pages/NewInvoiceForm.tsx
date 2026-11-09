import { useMemo, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '../lib/api'
import { formatAmount, toBaseUnits } from '../lib/money'
import { clientAdapter } from '../lib/contracts'
import { friendlyError, useNear } from '../lib/near'
import { Button, Card, Notice } from '../components/ui'

interface ItemDraft {
  description: string
  amount: string
}

function defaultDueDate(): string {
  const date = new Date(Date.now() + 14 * 86_400_000)
  return date.toISOString().slice(0, 10)
}

export default function NewInvoiceForm({
  onPublished,
  onChanged,
  onClose,
}: {
  onPublished: (id: string) => void
  onChanged: () => void
  onClose: () => void
}) {
  const near = useNear()
  const [studentName, setStudentName] = useState('')
  const [studentId, setStudentId] = useState('')
  const [term, setTerm] = useState('')
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<ItemDraft[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const itemsTotal = useMemo(() => {
    let total = 0n
    for (const item of items) total += toBaseUnits(item.amount) ?? 0n
    return total
  }, [items])

  const updateItem = (index: number, patch: Partial<ItemDraft>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!near.config) return
    if (!near.accountId) {
      near.connect()
      setError('Connect the school wallet first, then press Create invoice again.')
      return
    }
    if (near.accountId !== near.config.adminAccount) {
      setError(`Only the school administrator account (${near.config.adminAccount}) can create invoices.`)
      return
    }
    const cleanItems = items.filter((item) => item.description.trim() || item.amount.trim())
    for (const item of cleanItems) {
      if (!item.description.trim() || (toBaseUnits(item.amount) ?? 0n) <= 0n) {
        setError('Each fee item needs a description and an amount.')
        return
      }
    }
    if (cleanItems.length === 0 && (toBaseUnits(amount) ?? 0n) <= 0n) {
      setError('Enter the fee amount, for example 250.00.')
      return
    }

    setBusy(true)
    let created: Awaited<ReturnType<typeof api.createInvoice>> | null = null
    try {
      created = await api.createInvoice({ studentName, studentId, term, amount, dueDate, note, lineItems: cleanItems })
      await near.call(clientAdapter(created.contractVersion).publish(created))
      onPublished(created.id)
    } catch (e) {
      setError(
        created
          ? `The invoice was saved as a draft but could not be published: ${friendlyError(e)} You can publish it from the list.`
          : friendlyError(e),
      )
      if (created) onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={(e) => void submit(e)} className="space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">New fee invoice</h2>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="studentName">Student name</label>
            <input id="studentName" className="field" required maxLength={120} value={studentName} onChange={(e) => setStudentName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="studentId">Student ID (optional)</label>
            <input id="studentId" className="field" maxLength={40} value={studentId} onChange={(e) => setStudentId(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="term">Term</label>
            <input id="term" className="field" required maxLength={60} placeholder="Term 1, 2026" value={term} onChange={(e) => setTerm(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="dueDate">Due date</label>
            <input id="dueDate" type="date" className="field" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="label !mb-0">Fee items (optional)</span>
            <Button variant="ghost" className="!min-h-[36px]" onClick={() => setItems([...items, { description: '', amount: '' }])}>
              <Plus className="h-4 w-4" aria-hidden /> Add item
            </Button>
          </div>
          {items.map((item, index) => (
            <div key={index} className="flex gap-2">
              <input aria-label="Item description" className="field" placeholder="Tuition" value={item.description} onChange={(e) => updateItem(index, { description: e.target.value })} />
              <input aria-label="Item amount" className="field !w-32" inputMode="decimal" placeholder="0.00" value={item.amount} onChange={(e) => updateItem(index, { amount: e.target.value })} />
              <Button variant="ghost" aria-label="Remove item" className="!px-3" onClick={() => setItems(items.filter((_, i) => i !== index))}>
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="amount">Total amount (USD)</label>
            {items.length > 0 ? (
              <p id="amount" className="flex min-h-[44px] items-center rounded-lg bg-slate-50 px-3 font-semibold tabular-nums">
                ${formatAmount(itemsTotal)}
              </p>
            ) : (
              <input id="amount" className="field" inputMode="decimal" placeholder="250.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            )}
            <p className="mt-1 text-xs text-slate-500">Parents pay this amount in USDC, which is worth one US dollar.</p>
          </div>
          <div>
            <label className="label" htmlFor="note">Note for the parent (optional)</label>
            <input id="note" className="field" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        <Button type="submit" className="w-full sm:w-auto" busy={busy}>
          {busy ? 'Creating invoice...' : 'Create invoice'}
        </Button>
      </form>
    </Card>
  )
}
