/** Read-only statement review primitives. Nothing here creates a financial record or a match. */
export type StatementColumnChoices = {
  date: number
  description: number
  amount: number
  reference?: number
  /** The selected file's convention, chosen by a person after reviewing the statement. */
  positiveMeans: 'inflow' | 'outflow'
  currency: 'USD'
}
export type StatementReviewRow = {
  rowNumber: number
  raw: string[]
  date: string | null
  description: string
  reference: string | null
  amountCents: number | null
  direction: 'inflow' | 'outflow' | null
  currency: 'USD'
  issues: string[]
  possibleDuplicateRows: number[]
}
export type ExistingMatchCandidate = {
  sourceType: string
  sourceId: string
  accountId: string | null
  date: string | null
  amountCents: number | null
  direction: 'inflow' | 'outflow' | null
  currency: string | null
  /** Candidate data must be an actual transaction, not a bill, schedule, or forecast. */
  actual: boolean
}
export type MatchSuggestion = { sourceType: string; sourceId: string; reason: string; requiresConfirmation: true }
export type StatementReviewFilter = 'all' | 'unresolved' | 'duplicates' | 'parsed'

/** Reject incompatible persisted or preview data rather than rendering it as verified. */
export function isStatementReviewRows(value: unknown): value is StatementReviewRow[] {
  return Array.isArray(value) && value.length <= 5001 && value.every((row) => row && typeof row === 'object'
    && Number.isInteger(row.rowNumber) && row.rowNumber > 0
    && Array.isArray(row.raw) && row.raw.length <= 100 && row.raw.every((v: unknown) => typeof v === 'string')
    && (row.date === null || typeof row.date === 'string') && typeof row.description === 'string'
    && (row.reference === null || typeof row.reference === 'string')
    && (row.amountCents === null || (Number.isSafeInteger(row.amountCents) && row.amountCents > 0))
    && (row.direction === null || row.direction === 'inflow' || row.direction === 'outflow') && row.currency === 'USD'
    && Array.isArray(row.issues) && row.issues.every((v: unknown) => typeof v === 'string')
    && Array.isArray(row.possibleDuplicateRows) && row.possibleDuplicateRows.every((v: unknown) => Number.isInteger(v) && (v as number) > 0))
}

/** View filtering only; it never changes the review or matching status of a row. */
export function filterStatementReviewRows(rows: StatementReviewRow[], filter: StatementReviewFilter, query: string) {
  const needle = query.trim().toLocaleLowerCase()
  return rows.filter((row) => {
    if (filter === 'unresolved' && row.issues.length === 0) return false
    if (filter === 'duplicates' && row.possibleDuplicateRows.length === 0) return false
    if (filter === 'parsed' && row.issues.length > 0) return false
    if (!needle) return true
    return [String(row.rowNumber), row.date || '', row.description, row.reference || '', ...row.raw].some((value) => value.toLocaleLowerCase().includes(needle))
  })
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** Strict RFC-style CSV parsing; blank and malformed values are never converted to zero. */
export function parseStatementCsv(content: string): string[][] {
  if (content.length > 2_000_000) throw new Error('Statement file is too large.')
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false, closed = false
  const text = content.replace(/^\uFEFF/, '')
  const finishCell = () => { if (row.length >= 100) throw new Error('Statement has too many columns.'); row.push(cell); cell = ''; closed = false }
  const finishRow = () => { finishCell(); rows.push(row); row = []; if (rows.length > 5001) throw new Error('Statement has too many rows.') }
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1 }
      else if (char === '"') { quoted = false; closed = true }
      else cell += char
    } else if (char === '"') {
      if (cell || closed) throw new Error('Invalid quote in statement CSV.')
      quoted = true
    } else if (char === ',') finishCell()
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i += 1; finishRow() }
    else { if (closed) throw new Error('Unexpected text after a quoted field.'); cell += char }
  }
  if (quoted) throw new Error('Unclosed quoted field in statement CSV.')
  if (row.length || cell || closed) finishRow()
  return rows
}

function signedCents(value: string): number | null {
  const match = /^([+-]?)(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const cents = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'))
  return match[1] === '-' ? -cents : cents
}

/** Caller supplies header presence, selected columns and sign convention explicitly. */
export function prepareStatementReview(rows: string[][], columns: StatementColumnChoices, hasHeader: boolean): StatementReviewRow[] {
  const selected = [columns.date, columns.description, columns.amount, ...(columns.reference === undefined ? [] : [columns.reference])]
  if (typeof hasHeader !== 'boolean' || columns.currency !== 'USD' || !['inflow', 'outflow'].includes(columns.positiveMeans)
    || selected.some((index) => !Number.isInteger(index) || index < 0 || index > 1000) || new Set(selected).size !== selected.length) throw new Error('Choose distinct statement columns, currency and sign convention.')
  if (rows.length > 5001) throw new Error('Statement has too many rows.')
  const result = rows.slice(hasHeader ? 1 : 0).map((raw, index): StatementReviewRow => {
    const issues: string[] = []
    const rawDate = (raw[columns.date] || '').trim()
    const date = validDate(rawDate) ? rawDate : null
    if (!date) issues.push('Date must use YYYY-MM-DD.')
    const description = (raw[columns.description] || '').trim()
    if (!description) issues.push('Description is missing.')
    const signed = signedCents(raw[columns.amount] || '')
    if (signed === null || signed === 0) issues.push('Amount or direction is missing or invalid.')
    const direction = signed === null || signed === 0 ? null : (signed > 0 ? columns.positiveMeans : columns.positiveMeans === 'inflow' ? 'outflow' : 'inflow')
    return { rowNumber: index + (hasHeader ? 2 : 1), raw: [...raw], date, description, reference: columns.reference === undefined ? null : (raw[columns.reference] || '').trim() || null, amountCents: signed === null || signed === 0 ? null : Math.abs(signed), direction, currency: columns.currency, issues, possibleDuplicateRows: [] }
  })
  const groups = new Map<string, StatementReviewRow[]>()
  for (const row of result) {
    if (!row.date || row.amountCents === null || !row.direction || !row.description) continue
    const key = JSON.stringify([row.date, row.amountCents, row.direction, row.description.toLocaleLowerCase()])
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  for (const group of groups.values()) if (group.length > 1) {
    // Do not allocate a quadratic list when a file contains many repeated rows.
    const examples = group.slice(0, 21).map((row) => row.rowNumber)
    for (const row of group) {
      row.possibleDuplicateRows = examples.filter((number) => number !== row.rowNumber).slice(0, 20)
      if (group.length > 21) row.issues.push('Additional possible duplicate rows are not listed.')
    }
  }
  return result
}

/** Suggestions are evidence for a person to review, never automatic links. */
export function suggestStatementMatches(row: StatementReviewRow, accountId: string | null, candidates: ExistingMatchCandidate[]): MatchSuggestion[] {
  if (!accountId || row.issues.length || !row.date || row.amountCents === null || !row.direction) return []
  return candidates.filter((candidate) => candidate.actual && candidate.accountId === accountId
    && candidate.currency === row.currency && candidate.date === row.date
    && candidate.direction === row.direction && candidate.amountCents === row.amountCents
    && Boolean(candidate.sourceType && candidate.sourceId))
    .map((candidate) => ({ sourceType: candidate.sourceType, sourceId: candidate.sourceId, reason: 'Same account, date, direction and amount; verify the source and reference.', requiresConfirmation: true }))
}

/** A request for a server to review, not a saved match or reconciliation. */
export function buildStatementMatchIntent(input: {
  statementId: string
  row: StatementReviewRow
  accountId: string | null
  candidate: ExistingMatchCandidate
  explicitlyConfirmed: boolean
}) {
  if (input.explicitlyConfirmed !== true || !input.statementId.trim() || !Number.isInteger(input.row.rowNumber) || input.row.rowNumber < 1) throw new Error('Review the transaction and explicitly confirm the match.')
  if (!suggestStatementMatches(input.row, input.accountId, [input.candidate]).length) throw new Error('The selected source is no longer an eligible exact suggestion.')
  return { statementId: input.statementId, rowNumber: input.row.rowNumber, accountId: input.accountId as string, sourceType: input.candidate.sourceType, sourceId: input.candidate.sourceId, requiresServerVerification: true as const }
}
