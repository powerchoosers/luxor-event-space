/** Setup proposals only. These records are not journal entries or account balances. */
export type AccountingSetupKind = 'basis' | 'account' | 'mapping' | 'opening_balance'
export type AccountingSetupRecord = {
  id: string
  kind: AccountingSetupKind
  status: 'draft' | 'confirmed'
  draft_id: string | null
  details: Record<string, string>
  created_at: string
  created_by: string
}

export function isAccountingSetupRecord(value: unknown): value is AccountingSetupRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && ['basis', 'account', 'mapping', 'opening_balance'].includes(String(record.kind))
    && (record.status === 'draft' || record.status === 'confirmed') && (record.draft_id === null || typeof record.draft_id === 'string')
    && !!record.details && typeof record.details === 'object' && !Array.isArray(record.details)
    && Object.values(record.details).every((v) => typeof v === 'string')
    && typeof record.created_at === 'string' && typeof record.created_by === 'string'
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const required = (value: unknown, max: number) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error('Complete all required fields.')
  return value.trim()
}
const optional = (value: unknown, max: number) => {
  if (value == null || value === '') return ''
  if (typeof value !== 'string' || value.trim().length > max) throw new Error('A field is too long.')
  return value.trim()
}
const dateKey = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

export function validateAccountingSetup(kind: unknown, input: unknown): { kind: AccountingSetupKind; details: Record<string, string> } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provide setup details.')
  const d = input as Record<string, unknown>
  if (kind === 'basis') {
    if (d.basis !== 'cash') throw new Error('Select cash-basis intent explicitly.')
    return { kind, details: { basis: 'cash', notes: optional(d.notes, 500) } }
  }
  if (kind === 'account') {
    const classification = required(d.classification, 30)
    if (!['asset', 'liability', 'equity', 'income', 'expense'].includes(classification)) throw new Error('Choose an account classification.')
    return { kind, details: { name: required(d.name, 120), classification, number: optional(d.number, 30), description: optional(d.description, 500) } }
  }
  if (kind === 'mapping') {
    const accountId = required(d.account_id, 36)
    const sourceId = required(d.source_id, 36)
    if (!uuid.test(accountId)) throw new Error('Choose a confirmed account.')
    if (d.source_type !== 'expense_category' || !uuid.test(sourceId)) throw new Error('Choose an existing expense category.')
    return { kind, details: { source_type: 'expense_category', source_id: sourceId, source_name: required(d.source_name, 100), account_id: accountId, notes: optional(d.notes, 500) } }
  }
  if (kind === 'opening_balance') {
    const accountId = required(d.account_id, 36)
    const date = required(d.as_of, 10)
    const amount = required(d.amount, 15)
    const side = required(d.side, 6)
    if (!uuid.test(accountId)) throw new Error('Choose a confirmed account.')
    if (!dateKey(date)) throw new Error('Choose a valid opening date.')
    if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amount)) throw new Error('Enter a nonnegative amount to the nearest cent.')
    if (side !== 'debit' && side !== 'credit') throw new Error('Choose debit or credit.')
    if (d.currency !== 'USD') throw new Error('Choose the balance currency.')
    return { kind, details: { account_id: accountId, as_of: date, amount, currency: 'USD', side, source: required(d.source, 500) } }
  }
  throw new Error('Choose a setup item.')
}

export function isAccountingSetupId(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value)
}

/** Resolve an uncertain request from immutable history without treating an absent row as failure. */
export function resolvePendingAccountingSetup(records: AccountingSetupRecord[], request: { id: string; draftId: string | null }): 'own' | 'other_confirmation' | null {
  const own = records.find((record) => record.id === request.id)
  if (own && (request.draftId ? own.status === 'confirmed' && own.draft_id === request.draftId : own.status === 'draft' && own.draft_id === null)) return 'own'
  if (request.draftId && records.some((record) => record.status === 'confirmed' && record.draft_id === request.draftId)) return 'other_confirmation'
  return null
}
