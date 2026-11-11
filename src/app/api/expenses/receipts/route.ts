import { NextRequest, NextResponse } from 'next/server'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import {
  authorizeLuxorExpenseRequest,
  getExpenseRecordWithHistory,
  getLuxorExpenseCategoryByName,
  findExpenseDuplicatesForReceipt,
  isDateKey,
  isExpenseUuid,
  loadAllExpenseReceipts,
  LuxorExpenseRequestError,
  toExpenseErrorResponse,
  validateExpenseBooking,
} from '@/lib/luxorExpensesServer'
import { extractLuxorExpenseReceiptCandidateFacts } from '@/lib/luxorBillIntakeServer'
import { inspectLuxorExpenseReceipt, uploadLuxorExpenseReceipt } from '@/lib/luxorExpenseReceiptsServer'
import type { LuxorExpenseReceipt } from '@/lib/luxorExpenseTypes'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

function optionalMoney(value: string, allowZero = false) {
  if (!value.trim()) return null
  const amount = Number(value)
  const cents = Math.round(amount * 100)
  return Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && Number.isSafeInteger(cents) && Math.abs(amount * 100 - cents) <= 1e-6 ? amount : Number.NaN
}

async function readReceiptForm(request: NextRequest) {
  const form = await request.formData()
  const file = form.get('file')
  return {
    form,
    file: file instanceof File && file.size > 0 ? file : null,
    vendorName: clean(form.get('vendor_name'), 200),
    transactionDate: clean(form.get('transaction_date'), 10),
    totalAmount: optionalMoney(clean(form.get('total_amount'), 50)),
    subtotalAmount: optionalMoney(clean(form.get('subtotal_amount'), 50), true),
    taxAmount: optionalMoney(clean(form.get('tax_amount'), 50), true),
    categoryName: clean(form.get('category'), 100),
    expenseId: clean(form.get('expense_id'), 50),
    bookingId: clean(form.get('booking_id'), 50),
    notes: clean(form.get('notes'), 4000),
  }
}

function duplicateMatches(receipts: LuxorExpenseReceipt[], input: {
  sha256: string
  vendorName: string
  transactionDate: string
  totalAmount: number | null
}) {
  const normalizedVendor = input.vendorName.trim().toLocaleLowerCase()
  return receipts.filter((receipt) => {
    const metadata = receipt.metadata || {}
    if (metadata.sha256 === input.sha256) return true
    return Boolean(normalizedVendor && input.transactionDate && input.totalAmount !== null
      && typeof metadata.vendor_name === 'string'
      && metadata.vendor_name.trim().toLocaleLowerCase() === normalizedVendor
      && metadata.transaction_date === input.transactionDate
      && Number(metadata.total_amount) === input.totalAmount)
  }).slice(0, 8)
}

export async function GET(request: NextRequest) {
  try {
    await authorizeLuxorExpenseRequest()
    const search = request.nextUrl.searchParams
    const query = (search.get('q') || '').trim().toLocaleLowerCase()
    const from = search.get('from')
    const to = search.get('to')
    if ((from && !isDateKey(from)) || (to && !isDateKey(to))) throw new LuxorExpenseRequestError('Choose a valid date range.')
    let receipts = await loadAllExpenseReceipts()
    if (search.has('expense_id')) receipts = receipts.filter((item) => item.expense_id === search.get('expense_id'))
    if (search.has('booking_id')) receipts = receipts.filter((item) => item.metadata.booking_id === search.get('booking_id'))
    if (search.has('category')) receipts = receipts.filter((item) => item.metadata.category === search.get('category'))
    if (search.has('vendor')) receipts = receipts.filter((item) => String(item.metadata.vendor_name || '').toLocaleLowerCase().includes((search.get('vendor') || '').toLocaleLowerCase()))
    if (from) receipts = receipts.filter((item) => typeof item.metadata.transaction_date === 'string' && item.metadata.transaction_date >= from)
    if (to) receipts = receipts.filter((item) => typeof item.metadata.transaction_date === 'string' && item.metadata.transaction_date <= to)
    if (query) receipts = receipts.filter((item) => `${item.title} ${item.file_name} ${item.metadata.vendor_name || ''} ${item.metadata.category || ''}`.toLocaleLowerCase().includes(query))
    return NextResponse.json({ receipts }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Expense receipts could not be loaded:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}

export async function POST(request: NextRequest) {
  let uploadedPath: string | null = null
  try {
    const { session } = await authorizeLuxorExpenseRequest()
    const input = await readReceiptForm(request)
    if (!input.file) throw new LuxorExpenseRequestError('Choose a receipt file to upload.')
    if (Number.isNaN(input.totalAmount) || Number.isNaN(input.subtotalAmount) || Number.isNaN(input.taxAmount)) throw new LuxorExpenseRequestError('Enter valid receipt amounts to the nearest cent.')
    if (input.transactionDate && !isDateKey(input.transactionDate)) throw new LuxorExpenseRequestError('Choose a valid transaction date.')
    if (input.expenseId && !isExpenseUuid(input.expenseId)) throw new LuxorExpenseRequestError('Choose a valid expense.')
    if (input.bookingId && !isExpenseUuid(input.bookingId)) throw new LuxorExpenseRequestError('Choose a valid booking.')
    if (input.taxAmount !== null && input.totalAmount !== null && input.taxAmount > input.totalAmount) throw new LuxorExpenseRequestError('Tax cannot exceed the receipt total.')
    if (input.subtotalAmount !== null && input.taxAmount !== null && input.totalAmount !== null && input.subtotalAmount + input.taxAmount > input.totalAmount + 0.001) throw new LuxorExpenseRequestError('Subtotal plus tax cannot exceed the receipt total.')

    const category = input.categoryName ? await getLuxorExpenseCategoryByName(input.categoryName) : null
    if (input.categoryName && !category) throw new LuxorExpenseRequestError('That category is inactive or unavailable. Refresh the category list.')
    const expense = input.expenseId ? await getExpenseRecordWithHistory(input.expenseId) : null
    if (input.expenseId && !expense) throw new LuxorExpenseRequestError('Expense not found.', 404)
    let bookingId = input.bookingId || null
    if (expense?.booking_id) {
      if (bookingId && bookingId !== expense.booking_id) throw new LuxorExpenseRequestError('The selected booking does not match this expense.')
      bookingId = expense.booking_id
    } else if (bookingId && expense) {
      throw new LuxorExpenseRequestError('A business expense cannot be linked to an unrelated event receipt.')
    }
    const booking = bookingId ? await validateExpenseBooking(bookingId) : null
    if (bookingId && !booking) throw new LuxorExpenseRequestError('Booking not found.', 404)

    let inspected: Awaited<ReturnType<typeof inspectLuxorExpenseReceipt>>
    try { inspected = await inspectLuxorExpenseReceipt(input.file) }
    catch (error) { throw new LuxorExpenseRequestError(error instanceof Error ? error.message : 'Upload a valid JPG, PNG, or PDF receipt.') }
    const receipts = await loadAllExpenseReceipts()
    const duplicates = duplicateMatches(receipts, {
      sha256: inspected.sha256,
      vendorName: input.vendorName,
      transactionDate: input.transactionDate,
      totalAmount: input.totalAmount,
    })
    const duplicateExpenses = input.totalAmount !== null && input.transactionDate
      ? await findExpenseDuplicatesForReceipt({
        vendorName: input.vendorName,
        transactionDate: input.transactionDate,
        totalAmount: input.totalAmount,
        excludeExpenseId: expense?.id,
      })
      : []
    let extractedFields: Record<string, unknown> = { status: 'unavailable', confirmed: false }
    if (process.env.OPEN_ROUTER_API_KEY) {
      try {
        const candidateFacts = await extractLuxorExpenseReceiptCandidateFacts({
          bytes: inspected.bytes,
          filename: inspected.safeName,
          contentType: inspected.contentType,
        })
        extractedFields = { status: 'candidate', confirmed: false, facts: candidateFacts }
      } catch {
        // OCR is optional. Keep the user's upload and metadata path available
        // when extraction is unsupported or the model service is unavailable.
        extractedFields = { status: 'failed', confirmed: false }
      }
    }
    const fileName = inspected.safeName
    uploadedPath = await uploadLuxorExpenseReceipt(inspected.bytes, inspected.contentType, fileName)
    const candidateFacts = extractedFields.status === 'candidate' && extractedFields.facts
      ? (extractedFields.facts as Record<string, unknown>)
      : null
    const metadata: LuxorExpenseReceipt['metadata'] = {
      vendor_name: input.vendorName || (candidateFacts?.vendor_name ? String(candidateFacts.vendor_name) : null),
      transaction_date: input.transactionDate || (candidateFacts?.transaction_date ? String(candidateFacts.transaction_date) : null),
      total_amount: input.totalAmount !== null ? input.totalAmount : (typeof candidateFacts?.total_amount === 'number' ? candidateFacts.total_amount : null),
      subtotal_amount: input.subtotalAmount !== null ? input.subtotalAmount : (typeof candidateFacts?.subtotal_amount === 'number' ? candidateFacts.subtotal_amount : null),
      tax_amount: input.taxAmount !== null ? input.taxAmount : (typeof candidateFacts?.tax_amount === 'number' ? candidateFacts.tax_amount : null),
      category: category?.name || (candidateFacts?.category_suggestion ? String(candidateFacts.category_suggestion) : null),
      booking_id: bookingId,
      notes: input.notes || null,
      sha256: inspected.sha256,
      extracted_fields: extractedFields,
    }
    const [created] = await supabaseRestStrict<LuxorExpenseReceipt[]>('luxor_documents?select=*', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        expense_id: expense?.id || null,
        inquiry_id: booking?.inquiry_id || null,
        invoice_id: null,
        document_type: 'expense_receipt',
        title: `${input.vendorName || 'Expense'} receipt`,
        file_name: fileName,
        storage_path: uploadedPath,
        content_type: inspected.contentType,
        size_bytes: inspected.bytes.byteLength,
        created_by: session.email,
        metadata,
      }),
    })
    if (!created) throw new Error('Receipt was uploaded but its record was not saved.')
    return NextResponse.json({
      receipt: created,
      duplicate_warning: duplicates.length || duplicateExpenses.length ? 'This receipt may match an existing receipt or expense. Review the matches; the upload was saved.' : null,
      duplicate_receipts: duplicates.map(({ id, title, created_at }) => ({ id, title, created_at })),
      duplicate_expenses: duplicateExpenses,
    }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (uploadedPath) {
      const { removeLuxorExpenseReceiptObject } = await import('@/lib/luxorExpenseReceiptsServer')
      await removeLuxorExpenseReceiptObject(uploadedPath)
    }
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Expense receipt could not be uploaded:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
