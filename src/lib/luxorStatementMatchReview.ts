import type { StatementReviewRow } from '@/lib/luxorStatementReview'

/** A source candidate remains account- and currency-unverified until a person checks it. */
export type ExpenseMatchCandidate = {
  id: string
  expenseId: string
  date: string
  amountCents: number
  direction: 'inflow' | 'outflow'
  vendor: string | null
  method: string | null
  reference: string | null
}

/** A human-recorded review choice, not an accounting entry or verified settlement. */
export type DurableMatchReviewEvent = {
  sequence: number
  id: string
  statement_id: string
  row_number: number
  previous_id: string | null
  action: 'selected' | 'cleared'
  source_payment_id: string
  note: string
  explicitly_confirmed: boolean
  account_currency_attested: boolean
  duplicate_acknowledged: boolean
  created_by: string
  created_at: string
}

export function latestDurableReviews(events: DurableMatchReviewEvent[]) {
  const latest = new Map<number, DurableMatchReviewEvent>()
  for (const event of events) latest.set(event.row_number, event)
  return latest
}
export type MatchReviewEvent =
  | { kind: 'selected'; rowNumber: number; sourceId: string; note: string }
  | { kind: 'cleared'; rowNumber: number; sourceId: string; reason: string }

export function activeSessionChoices(events: MatchReviewEvent[]) {
  const active = new Map<number, Extract<MatchReviewEvent, { kind: 'selected' }>>()
  for (const event of events) {
    if (event.kind === 'selected') active.set(event.rowNumber, event)
    else if (active.get(event.rowNumber)?.sourceId === event.sourceId) active.delete(event.rowNumber)
  }
  return active
}

/** Returns a session-only review event; never saves a link or posts an entry. */
export function confirmSessionChoice(input: {
  row: StatementReviewRow
  source: ExpenseMatchCandidate
  events: MatchReviewEvent[]
  confirmed: boolean
  verifiedAccountAndCurrency: boolean
  acknowledgedDuplicate: boolean
  note: string
  otherStatementSourceIds?: string[]
}): MatchReviewEvent {
  const { row, source } = input
  if (input.confirmed !== true || input.verifiedAccountAndCurrency !== true) throw new Error('Review and confirm the account and currency evidence.')
  if (!Array.isArray(row.issues) || !Array.isArray(row.possibleDuplicateRows)) throw new Error('This statement row cannot be verified.')
  if (row.possibleDuplicateRows.length && input.acknowledgedDuplicate !== true) throw new Error('Compare the possible duplicate rows before confirming.')
  if (row.issues.length || row.currency !== 'USD' || !row.date || row.amountCents === null || !row.direction) throw new Error('Resolve the statement row before reviewing a match.')
  if (!source.id || row.date !== source.date || row.amountCents !== source.amountCents || row.direction !== source.direction) throw new Error('Only the exact date, direction, and amount can be reviewed. Partial and split matches are not supported.')
  const note = input.note.trim()
  if (!note || note.length > 500) throw new Error('Describe the account or statement evidence you checked.')
  const active = activeSessionChoices(input.events)
  if (active.has(row.rowNumber)) throw new Error('Clear the current choice before selecting a correction.')
  if ([...active.values()].some((choice) => choice.sourceId === source.id)) throw new Error('This source is already selected for another row in this session.')
  if (input.otherStatementSourceIds?.includes(source.id)) throw new Error('This source is already selected for another statement in this session.')
  return { kind: 'selected', rowNumber: row.rowNumber, sourceId: source.id, note }
}

export function clearSessionChoice(input: { rowNumber: number; events: MatchReviewEvent[]; confirmed: boolean; reason: string }): MatchReviewEvent {
  if (input.confirmed !== true) throw new Error('Confirm that you want to clear the choice.')
  const reason = input.reason.trim()
  if (!reason || reason.length > 500) throw new Error('Explain why the choice is being cleared.')
  const choice = activeSessionChoices(input.events).get(input.rowNumber)
  if (!choice) throw new Error('No active choice exists for this row.')
  return { kind: 'cleared', rowNumber: input.rowNumber, sourceId: choice.sourceId, reason }
}
