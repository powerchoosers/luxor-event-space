import { createHash } from 'crypto'
import { isLuxorBillCategory, type LuxorBillCategory } from '@/lib/luxorBillCategories'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const dateKey = /^\d{4}-\d{2}-\d{2}$/

export type ManualBillAmountState = 'known' | 'unknown' | 'variable'
export type ManualBillDraft = {
  service: string
  provider: string
  frequency: string
  dueDate: string | null
  amountState: ManualBillAmountState
  amountCents: number | null
  billCategory: LuxorBillCategory
  vendorId: string | null
  invoiceNumber: string | null
  issueDate: string | null
}

export function isManualBillRequestId(value: unknown): value is string {
  return typeof value === 'string' && uuid.test(value)
}

/** Stable identity for one manual save. Same details replay; different details conflict. */
export function manualBillFingerprint(draft: ManualBillDraft) {
  return createHash('sha256').update(JSON.stringify({
    service: draft.service,
    provider: draft.provider,
    frequency: draft.frequency,
    dueDate: draft.dueDate,
    amountState: draft.amountState,
    amountCents: draft.amountCents,
    billCategory: draft.billCategory,
    vendorId: draft.vendorId,
    invoiceNumber: draft.invoiceNumber,
    issueDate: draft.issueDate,
  })).digest('hex')
}

export function parseManualBillCreate(input: Record<string, unknown>): { requestId: string; draft: ManualBillDraft; fingerprint: string } {
  if (!isManualBillRequestId(input.client_request_id)) throw new Error('Save the bill again so Luxor can keep this attempt unique.')
  const service = typeof input.service === 'string' ? input.service.trim() : ''
  const provider = typeof input.provider === 'string' ? input.provider.trim() : ''
  const frequency = typeof input.frequency === 'string' && input.frequency.trim() ? input.frequency.trim() : 'One-time'
  if (!['One-time', 'Weekly', 'Biweekly', 'Monthly', 'Quarterly', 'Annually'].includes(frequency)) throw new Error('Choose a bill frequency.')
  if (!service || service.length > 200 || !provider || provider.length > 200 || frequency.length > 40) throw new Error('Enter the service and provider.')
  const rawState = input.amount_state === undefined ? 'known' : input.amount_state
  if (rawState !== 'known' && rawState !== 'unknown' && rawState !== 'variable') throw new Error('Choose whether the amount is known.')
  const amountState: ManualBillAmountState = rawState
  if (input.status && input.status !== 'unpaid') throw new Error('New bills must start unpaid.')
  let dueDate: string | null = null
  if (input.due_date) {
    if (typeof input.due_date !== 'string' || !dateKey.test(input.due_date)) throw new Error('Choose a valid due date.')
    const [year, month, day] = input.due_date.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Choose a valid due date.')
    dueDate = input.due_date
  }
  let amountCents: number | null = null
  if (amountState === 'known') {
    const amount = typeof input.amount === 'number' ? input.amount : typeof input.amount === 'string' ? Number(input.amount) : NaN
    const cents = Math.round(amount * 100)
    if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 1e-6) throw new Error('Enter a valid amount.')
    amountCents = cents
  }
  if (!isLuxorBillCategory(input.bill_category)) throw new Error('Choose a bill category.')
  let vendorId: string | null = null
  if (input.vendor_id) {
    if (!isManualBillRequestId(input.vendor_id)) throw new Error('Choose a valid vendor.')
    vendorId = input.vendor_id
  }
  const invoiceNumber = typeof input.invoice_number === 'string' && input.invoice_number.trim() ? input.invoice_number.trim() : null
  if (invoiceNumber && invoiceNumber.length > 80) throw new Error('Shorten the invoice number.')
  let issueDate: string | null = null
  if (input.issue_date) {
    if (typeof input.issue_date !== 'string' || !dateKey.test(input.issue_date)) throw new Error('Choose a valid issue date.')
    const [year, month, day] = input.issue_date.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Choose a valid issue date.')
    issueDate = input.issue_date
  }
  const draft = { service, provider, frequency, dueDate, amountState, amountCents, billCategory: input.bill_category, vendorId, invoiceNumber, issueDate }
  return { requestId: input.client_request_id, draft, fingerprint: manualBillFingerprint(draft) }
}
