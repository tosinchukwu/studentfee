import type { LineItem } from '../src/lib/types.js'

/** Accepts the JSON value stored in the database and returns clean line items. */
export function parseLineItems(raw: unknown): LineItem[] {
  const value: unknown = typeof raw === 'string' ? safeParse(raw) : raw
  if (!Array.isArray(value)) return []
  return value.flatMap((item): LineItem[] => {
    const entry = (item ?? {}) as Record<string, unknown>
    return typeof entry.description === 'string' && typeof entry.amount === 'string'
      ? [{ description: entry.description, amount: entry.amount }]
      : []
  })
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
