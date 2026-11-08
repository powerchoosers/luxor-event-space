import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { assertLuxorProductionSideEffectsAllowed } from '@/lib/luxorTestLeadServer'
import { supabaseRestStrict, SupabaseRestError } from '@/lib/supabaseRestServer'
import {
  authorizeLuxorExpenseRequest,
  findExpenseBySourceBill,
  getLuxorExpenseCategoryByName,
  getExpenseRecordWithHistory,
  isDateKey,
  isExpenseUuid,
  LUXOR_EXPENSE_PAYMENT_METHODS,
  loadLuxorExpenseManagementData,
  LuxorExpenseRequestError,
  toExpenseErrorResponse,
  validateExpenseBill,
  validateExpenseBooking,
} from '@/lib/luxorExpensesServer'
import type { LuxorExpenseRecordRow } from '@/lib/luxorExpensesServer'
import type { LuxorBill } from '@/lib/luxorInquiryTypes'
import type { LuxorExpensePaymentMethod, LuxorExpenseRecordStatus } from '@/lib/luxorExpenseTypes'

type LuxorExpenseCreateRequestRow = LuxorExpenseRecordRow & {
  client_request_id: string | null
  client_request_fingerprint: string | null
}

export const dynamic = 'force-dynamic'

function objectBody(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function cleanText(value: unknown, max = 500) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

function parsedAmount(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const amount = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(amount) && amount > 0 && Math.round(amount * 100) === amount * 100 ? amount : null
}

export async function GET() {
  try {
    const { member } = await authorizeLuxorExpenseRequest()
    // Keep read-only page loads safe for production visual QA; the protected
    // scheduler and template writes own occurrence generation.
    const data = await loadLuxorExpenseManagementData({ generate: false })
    return NextResponse.json({
      ...data,
      can_manage_categories: member.role === 'owner' || member.role === 'admin',
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Expense management could not be loaded:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}

export async function POST(request: NextRequest) {
  let requestId: string | null = null
  let requestFingerprint: string | null = null
  try {
    const { session } = await authorizeLuxorExpenseRequest()
    const body = objectBody(await request.json())
    if (!body) throw new LuxorExpenseRequestError('Invalid expense entry.')

    const description = cleanText(body.description, 300)
    const vendorName = cleanText(body.vendor_name, 200)
    const categoryName = cleanText(body.category, 100)
    const amount = parsedAmount(body.amount)
    const incurredOn = body.incurred_on
    const dueDate = body.due_date == null || body.due_date === '' ? null : body.due_date
    const bookingId = body.booking_id == null || body.booking_id === '' ? null : body.booking_id
    const sourceBillId = body.source_bill_id == null || body.source_bill_id === '' ? null : body.source_bill_id
    const initialStatusValue = body.status ?? 'incurred'
    const paymentMethod = cleanText(body.payment_method, 40)
    requestId = typeof body.client_request_id === 'string' ? body.client_request_id : null

    if (!description) throw new LuxorExpenseRequestError('Enter an expense description.')
    if (!vendorName) throw new LuxorExpenseRequestError('Enter the vendor or merchant.')
    if (!categoryName) throw new LuxorExpenseRequestError('Choose an expense category.')
    if (amount === null) throw new LuxorExpenseRequestError('Enter a positive amount to the nearest cent.')
    if (!isDateKey(incurredOn)) throw new LuxorExpenseRequestError('Choose a valid expense date.')
    if (dueDate !== null && !isDateKey(dueDate)) throw new LuxorExpenseRequestError('Choose a valid due date.')
    if (bookingId !== null && !isExpenseUuid(bookingId)) throw new LuxorExpenseRequestError('Choose a valid booking.')
    if (sourceBillId !== null && !isExpenseUuid(sourceBillId)) throw new LuxorExpenseRequestError('Choose a valid source bill.')
    if (!LUXOR_EXPENSE_PAYMENT_METHODS.includes(paymentMethod as typeof LUXOR_EXPENSE_PAYMENT_METHODS[number])) {
      throw new LuxorExpenseRequestError('Choose a valid payment method.')
    }
    if (!['planned', 'incurred'].includes(String(initialStatusValue))) {
      throw new LuxorExpenseRequestError('Record the expense first, then use Record payment to mark it paid.')
    }
    const initialStatus = initialStatusValue as Extract<LuxorExpenseRecordStatus, 'planned' | 'incurred'>
    if (!isExpenseUuid(requestId)) throw new LuxorExpenseRequestError('Refresh the expense form and submit again with its request key.')

    requestFingerprint = createHash('sha256').update(JSON.stringify({
      description, vendor_name: vendorName, category: categoryName.toLocaleLowerCase(), amount,
      incurred_on: incurredOn, due_date: dueDate, booking_id: bookingId,
      source_bill_id: sourceBillId, status: initialStatus, payment_method: paymentMethod,
      reference_number: cleanText(body.reference_number, 100) || null,
      notes: cleanText(body.notes, 4000) || null,
    })).digest('hex')

    const prior = await supabaseRestStrict<LuxorExpenseCreateRequestRow[]>(`luxor_booking_expenses?select=*&client_request_id=eq.${encodeURIComponent(requestId)}&limit=1`)
    if (prior[0]) {
      if (prior[0].client_request_fingerprint !== requestFingerprint) throw new LuxorExpenseRequestError('This expense request key was already used for different details. Refresh the form to create a separate expense.', 409)
      const replayed = await getExpenseRecordWithHistory(prior[0].id)
      if (!replayed) throw new Error('The original expense request exists but could not be reloaded.')
      return NextResponse.json({ ...replayed, replayed: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
    }

    const category = await getLuxorExpenseCategoryByName(categoryName)
    if (!category) throw new LuxorExpenseRequestError('That category is inactive or unavailable. Refresh the category list.')

    if (bookingId) {
      const booking = await validateExpenseBooking(bookingId)
      if (!booking) throw new LuxorExpenseRequestError('Booking not found.', 404)
      if (booking.inquiry_id) await assertLuxorProductionSideEffectsAllowed(booking.inquiry_id)
    }

    let sourceBill: LuxorBill | null = null
    if (sourceBillId) {
      if (body.confirm_source_bill !== true) throw new LuxorExpenseRequestError('Review and confirm the extracted bill facts before linking it.')
      sourceBill = await validateExpenseBill(sourceBillId)
      if (!sourceBill) throw new LuxorExpenseRequestError('Source bill not found.', 404)
      if (sourceBill.extraction_status !== 'ready' || !sourceBill.payment_ready_at || sourceBill.status === 'paid'
        || sourceBill.amount_state !== 'known' || sourceBill.currency?.toUpperCase() !== 'USD') {
        throw new LuxorExpenseRequestError('Only a reviewed, payment-ready USD bill with a confirmed amount can be linked.')
      }
      if (Math.abs(Number(sourceBill.amount) - amount) > 0.001) {
        throw new LuxorExpenseRequestError('The confirmed expense amount must match the reviewed bill amount.')
      }
      if (await findExpenseBySourceBill(sourceBillId)) {
        throw new LuxorExpenseRequestError('This bill is already linked to an expense.', 409)
      }
    }

    const expenseInput: Partial<LuxorExpenseRecordRow> & Record<string, unknown> = {
      booking_id: bookingId,
      expense_type: bookingId ? 'event' : 'business',
      category: category.name,
      category_id: category.id,
      description,
      vendor_name: vendorName,
      amount,
      incurred_on: incurredOn,
      due_date: dueDate || sourceBill?.due_date || null,
      status: initialStatus,
      payment_method: paymentMethod as LuxorExpensePaymentMethod,
      reference_number: cleanText(body.reference_number, 100) || null,
      notes: cleanText(body.notes, 4000) || null,
      recurring_template_id: null,
      billing_period_start: null,
      billing_period_end: null,
      source_bill_id: sourceBillId,
      client_request_id: requestId,
      client_request_fingerprint: requestFingerprint,
      created_by: session.email,
      updated_by: session.email,
      metadata: sourceBill ? {
        source_bill_confirmed_by: session.email,
        source_bill_confirmed_at: new Date().toISOString(),
      } : {},
    }
    const [created] = await supabaseRestStrict<LuxorExpenseRecordRow[]>('luxor_booking_expenses?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(expenseInput),
    })
    if (!created) throw new Error('Expense was not saved.')
    const hydrated = await getExpenseRecordWithHistory(created.id)
    if (!hydrated) throw new Error('Saved expense could not be reloaded.')
    return NextResponse.json(hydrated, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof SupabaseRestError && error.code === '23505') {
      if (requestId && requestFingerprint) {
        const [prior] = await supabaseRestStrict<LuxorExpenseCreateRequestRow[]>(`luxor_booking_expenses?select=*&client_request_id=eq.${encodeURIComponent(requestId)}&limit=1`)
        if (prior) {
          if (prior.client_request_fingerprint !== requestFingerprint) {
            return NextResponse.json({ error: 'This expense request key was already used for different details. Refresh the form to create a separate expense.' }, { status: 409 })
          }
          const replayed = await getExpenseRecordWithHistory(prior.id)
          if (replayed) return NextResponse.json({ ...replayed, replayed: true }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
        }
      }
      return NextResponse.json({ error: 'This source bill or recurring period is already linked to an expense.' }, { status: 409 })
    }
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Expense could not be saved:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
