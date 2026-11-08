import type { DisplayStatus, PublicConfig } from './types'

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  })
}

export function shortHash(hash: string): string {
  return hash.length > 14 ? `${hash.slice(0, 7)}...${hash.slice(-6)}` : hash
}

export function txUrl(config: PublicConfig, hash: string): string {
  return `${config.explorerUrl}/txns/${hash}`
}

export const STATUS_STYLES: Record<DisplayStatus, string> = {
  'Not published': 'bg-slate-100 text-slate-700 ring-slate-200',
  Pending: 'bg-sky-50 text-sky-800 ring-sky-200',
  Overdue: 'bg-red-50 text-red-800 ring-red-200',
  Processing: 'bg-amber-50 text-amber-800 ring-amber-200',
  Paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  Cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}
