export const USDC_DECIMALS = 6
const SCALE = 10n ** BigInt(USDC_DECIMALS)

/** Parses a plain decimal such as "12.34" into base units. Returns null if invalid. */
export function toBaseUnits(input: string): bigint | null {
  const value = input.trim()
  if (!/^\d{1,12}(\.\d{1,6})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(USDC_DECIMALS, '0'))
}

/** Formats base units as a plain two-decimal number such as "1,234.50". */
export function formatAmount(base: string | bigint, grouping = true): string {
  const value = typeof base === 'bigint' ? base : BigInt(base)
  const whole = value / SCALE
  const cents = ((value % SCALE) * 100n) / SCALE
  const wholeText = grouping ? whole.toLocaleString('en-US') : whole.toString()
  return `${wholeText}.${cents.toString().padStart(2, '0')}`
}

/** Exact decimal text with up to six places, trailing zeros trimmed to two. */
export function toDecimalText(base: string | bigint): string {
  const value = typeof base === 'bigint' ? base : BigInt(base)
  const whole = value / SCALE
  const fraction = (value % SCALE).toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '')
  return `${whole}.${fraction.padEnd(2, '0')}`
}
