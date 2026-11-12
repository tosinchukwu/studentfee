import { toBaseUnits } from './money'

export interface StudentCsvRow {
  rowNumber: number
  studentName: string
  studentId: string
  term: string
  amount: string
  dueDate: string
  note: string
  error: string | null
}

function parseRecords(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = input.replace(/^\uFEFF/, '')

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true
    } else if (char === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1
      row.push(cell.trim())
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  if (quoted) throw new Error('The CSV contains an unclosed quotation mark.')
  row.push(cell.trim())
  if (row.some((value) => value.length > 0)) rows.push(row)
  return rows
}

function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function normalizeDate(value: string): string | null {
  const input = value.trim()
  let year: number
  let month: number
  let day: number

  // Year-first formats: YYYY-MM-DD, YYYY/MM/DD, or YYYY.MM.DD.
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(input)
  if (match) {
    year = Number(match[1])
    month = Number(match[2])
    day = Number(match[3])
  } else {
    // Day-first formats are preferred. If only one of the first two
    // numbers can be a month, infer the order (e.g. 12/31/2026).
    match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(input)
    if (!match) return null
    const first = Number(match[1])
    const second = Number(match[2])
    year = Number(match[3])
    if (first > 12 && second <= 12) {
      day = first
      month = second
    } else if (second > 12 && first <= 12) {
      month = first
      day = second
    } else {
      // Ambiguous dates such as 04/05/2026 are read as DD/MM/YYYY.
      day = first
      month = second
    }
  }

  const date = new Date(Date.UTC(year, month - 1, day))
  if (year < 1000 || date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

export function parseStudentCsv(input: string): StudentCsvRow[] {
  const records = parseRecords(input)
  if (records.length < 2) throw new Error('Add a header row and at least one student record.')
  const headers = records[0].map(key)
  const find = (...names: string[]) => headers.findIndex((header) => names.includes(header))
  const columns = {
    name: find('studentname', 'name'),
    id: find('studentid', 'admissionnumber', 'admissionid'),
    term: find('term', 'academicterm', 'session'),
    amount: find('feeusdc', 'amountusdc', 'fee', 'amount'),
    due: find('duedate', 'paymentduedate'),
    note: find('note', 'parentnote', 'description'),
  }
  if (columns.name < 0 || columns.term < 0 || columns.amount < 0 || columns.due < 0) {
    throw new Error('Required columns: Student Name, Term, Fee (USDC), Due Date. Student ID and Note are optional.')
  }
  if (records.length - 1 > 200) throw new Error('A single upload can contain up to 200 students. Split larger lists into separate CSV files.')

  const seen = new Set<string>()
  return records.slice(1).map((cells, index) => {
    const value = (column: number) => (column >= 0 ? (cells[column] ?? '').trim() : '')
    const studentName = value(columns.name)
    const studentId = value(columns.id)
    const term = value(columns.term)
    const amount = value(columns.amount).replace(/^\$/, '')
    const rawDueDate = value(columns.due)
    const dueDate = normalizeDate(rawDueDate) ?? rawDueDate
    const note = value(columns.note)
    let error: string | null = null

    if (!studentName) error = 'Student name is required.'
    else if (studentName.length > 120) error = 'Student name is longer than 120 characters.'
    else if (!term) error = 'Term is required.'
    else if (term.length > 60) error = 'Term is longer than 60 characters.'
    else if (studentId.length > 40) error = 'Student ID is longer than 40 characters.'
    else if (!toBaseUnits(amount) || toBaseUnits(amount)! <= 0n) error = 'Enter a fee greater than 0 with up to 6 decimal places.'
    else if (toBaseUnits(amount)! > 1_000_000_000_000n) error = 'Fee exceeds the 1,000,000 USDC invoice limit.'
    else if (!normalizeDate(rawDueDate)) error = 'Enter a valid date, e.g. 2026-12-15 or 15/12/2026 (DD/MM/YYYY).'
    else if (note.length > 300) error = 'Note is longer than 300 characters.'

    if (!error && studentId) {
      const duplicateKey = `${studentId.toLowerCase()}::${term.toLowerCase()}`
      if (seen.has(duplicateKey)) error = 'Duplicate Student ID and Term in this CSV.'
      else seen.add(duplicateKey)
    }

    return { rowNumber: index + 2, studentName, studentId, term, amount, dueDate, note, error }
  })
}

export const STUDENT_CSV_TEMPLATE = [
  'Student Name,Student ID,Term,Fee (USDC),Due Date,Note',
  'John Peter,ST001,Term 1 2026,50.00,2026-12-15,Tuition fee',
  'Mary James,ST002,Term 1 2026,75.00,2026-12-15,Tuition and materials',
].join('\n')

export function downloadStudentCsvTemplate(): void {
  const blob = new Blob([STUDENT_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'studentfee-import-template.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
