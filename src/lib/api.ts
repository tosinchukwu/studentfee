import type { ContractVersion, HealthReport, InvoiceView, LineItem, PublicConfig } from './types'

const TOKEN_KEY = 'fees.admin.session'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export const session = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
}

async function send(path: string, init: RequestInit = {}, auth = false): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('content-type', 'application/json')
  const token = session.get()
  if (auth && token) headers.set('authorization', `Bearer ${token}`)
  let res: Response
  try {
    res = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError('The service is not reachable. Check your connection and try again.', 0)
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    if (res.status === 401 && auth) session.clear()
    throw new ApiError(data.error ?? 'Something went wrong. Please try again.', res.status)
  }
  return res
}

async function getJson<T>(path: string, auth = false): Promise<T> {
  return (await send(path, {}, auth)).json() as Promise<T>
}

async function postJson<T>(path: string, body: unknown, auth = false, method = 'POST'): Promise<T> {
  return (await send(path, { method, body: JSON.stringify(body) }, auth)).json() as Promise<T>
}

export interface NewInvoiceInput {
  studentName: string
  studentId: string
  term: string
  amount: string
  dueDate: string
  note: string
  lineItems: LineItem[]
}

export const api = {
  config: () => getJson<PublicConfig>('/api/config'),
  invoice: (id: string) => getJson<InvoiceView>(`/api/invoices/${id}`),
  createDemoInvoice: (input: { id: string; creator: string; studentName: string; studentId: string; term: string; amount: string; dueDate: number; note: string }) =>
    postJson<{ id: string; amountBase: string; dueDate: number; contractId: string; contractVersion: ContractVersion }>('/api/demo/invoices', input),
  recordTx: (id: string, kind: 'payment' | 'settlement', hash: string, signerId: string) =>
    postJson<{ ok: boolean }>(`/api/invoices/${id}/tx`, { kind, hash, signerId }),

  challenge: () => postJson<{ nonce: string; message: string; recipient: string }>('/api/auth/challenge', {}),
  login: (input: { accountId: string; publicKey: string; signature: string; nonce: string; callbackUrls: string[] }) =>
    postJson<{ token: string }>('/api/auth/login', input),
  logout: () => postJson<{ ok: boolean }>('/api/auth/logout', {}, true),

  adminInvoices: () => getJson<{ invoices: InvoiceView[] }>('/api/admin/invoices', true),
  createInvoice: (input: NewInvoiceInput) =>
    postJson<{ id: string; amountBase: string; dueDate: number; contractId: string; contractVersion: ContractVersion }>(
      '/api/admin/invoices',
      input,
      true,
    ),
  deleteInvoice: (id: string) => postJson<{ ok: boolean }>(`/api/admin/invoices/${id}`, {}, true, 'DELETE'),
  health: () => getJson<HealthReport>('/api/admin/health', true),
  saveSchoolName: (schoolName: string) => postJson<PublicConfig>('/api/admin/settings', { schoolName }, true, 'PUT'),

  async downloadCsv(): Promise<void> {
    const res = await send('/api/admin/export', {}, true)
    const url = URL.createObjectURL(await res.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = `school-fees-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  },
}
