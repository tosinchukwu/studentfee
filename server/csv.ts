// CSV that opens cleanly in Excel, Numbers and Google Sheets.

function cell(value: string): string {
  // Stop spreadsheet formulas from running if a text field starts with a formula character.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function buildCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(cell).join(','))
  // Byte order mark so Excel reads accented names correctly.
  return `\uFEFF${lines.join('\r\n')}\r\n`
}
