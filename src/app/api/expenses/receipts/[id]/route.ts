import { NextRequest, NextResponse } from 'next/server'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import {
  authorizeLuxorExpenseRequest,
  getExpenseDocument,
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
import {
  downloadLuxorExpenseReceipt,
  inspectLuxorExpenseReceipt,
  removeLuxorExpenseReceiptObject,
  uploadLuxorExpenseReceipt,
} from '@/lib/luxorExpenseReceiptsServer'
import type { LuxorExpenseReceipt } from '@/lib/luxorExpenseTypes'

export const dynamic = 'force-dynamic'

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
}

function optionalMoney(value: unknown, allowZero = false) {
  if (value === null || value === undefined || value === '') return null
  const amount = typeof value === 'number' || typeof value === 'string' ? Number(value) : Number.NaN
  const cents = Math.round(amount * 100)
  return Number.isFinite(amount) && (allowZero ? amount >= 0 : amount > 0) && Number.isSafeInteger(cents) && Math.abs(amount * 100 - cents) <= 1e-6 ? amount : Number.NaN
}

function attachmentName(value: string) {
  return value.replace(/[\r\n"\\]/g, '_').slice(0, 160) || 'receipt'
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await authorizeLuxorExpenseRequest()
    const { id } = await context.params
    if (!isExpenseUuid(id)) throw new LuxorExpenseRequestError('Choose a valid receipt.')
    const receipt = await getExpenseDocument(id)
    if (!receipt) throw new LuxorExpenseRequestError('Receipt not found.', 404)
    const file = await downloadLuxorExpenseReceipt(receipt.storage_path)
    const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'
    return new NextResponse(file.body, {
      headers: {
        'Content-Type': receipt.content_type,
        'Content-Length': String(receipt.size_bytes),
        'Content-Disposition': `${disposition}; filename="${attachmentName(receipt.file_name)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Expense receipt could not be opened:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let uploadedPath: string | null = null
  try {
    const { session } = await authorizeLuxorExpenseRequest()
    const { id } = await context.params
    if (!isExpenseUuid(id)) throw new LuxorExpenseRequestError('Choose a valid receipt.')
    const current = await getExpenseDocument(id)
    if (!current) throw new LuxorExpenseRequestError('Receipt not found.', 404)

    const contentType = request.headers.get('content-type') || ''
    let values: Record<string, unknown>
    let supplied: Set<string>
    let file: File | null = null
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      supplied = new Set(['vendor_name','transaction_date','total_amount','subtotal_amount','tax_amount','category','expense_id','booking_id','notes'])
      values = Object.fromEntries(Array.from(supplied, (key) => [key, form.get(key)]))
      const fileValue = form.get('file')
      if (fileValue instanceof File && fileValue.size > 0) file = fileValue
    } else {
      const payload = await request.json().catch(() => null)
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new LuxorExpenseRequestError('Invalid receipt update.')
      values = payload as Record<string, unknown>
      supplied = new Set(Object.keys(values))
    }

    const old = current.metadata || {}
    const getText = (key: string, max: number, previous: unknown) => supplied.has(key) ? clean(values[key], max) : (typeof previous === 'string' ? previous : '')
    const vendorName = getText('vendor_name', 200, old.vendor_name)
    const transactionDate = getText('transaction_date', 10, old.transaction_date)
    const totalAmount = optionalMoney(supplied.has('total_amount') ? values.total_amount : old.total_amount)
    const subtotalAmount = optionalMoney(supplied.has('subtotal_amount') ? values.subtotal_amount : old.subtotal_amount, true)
    const taxAmount = optionalMoney(supplied.has('tax_amount') ? values.tax_amount : old.tax_amount, true)
    const categoryName = getText('category', 100, old.category)
    const notes = getText('notes', 4000, old.notes)
    const expenseIdValue = supplied.has('expense_id') ? clean(values.expense_id, 50) : current.expense_id || ''
    const bookingIdValue = supplied.has('booking_id') ? clean(values.booking_id, 50) : clean(old.booking_id, 50)
    if ((totalAmount !== null && Number.isNaN(totalAmount)) || (subtotalAmount !== null && Number.isNaN(subtotalAmount)) || (taxAmount !== null && Number.isNaN(taxAmount))) throw new LuxorExpenseRequestError('Enter valid receipt amounts to the nearest cent.')
    if (transactionDate && !isDateKey(transactionDate)) throw new LuxorExpenseRequestError('Choose a valid transaction date.')
    if (expenseIdValue && !isExpenseUuid(expenseIdValue)) throw new LuxorExpenseRequestError('Choose a valid expense.')
    if (bookingIdValue && !isExpenseUuid(bookingIdValue)) throw new LuxorExpenseRequestError('Choose a valid booking.')
    if (taxAmount !== null && totalAmount !== null && taxAmount > totalAmount) throw new LuxorExpenseRequestError('Tax cannot exceed the receipt total.')
    if (subtotalAmount !== null && taxAmount !== null && totalAmount !== null && subtotalAmount + taxAmount > totalAmount + 0.001) throw new LuxorExpenseRequestError('Subtotal plus tax cannot exceed the receipt total.')
    const category = categoryName ? await getLuxorExpenseCategoryByName(categoryName, categoryName === old.category) : null
    if (categoryName && !category) throw new LuxorExpenseRequestError('That category is inactive or unavailable. Refresh the category list.')
    const expense = expenseIdValue ? await getExpenseRecordWithHistory(expenseIdValue) : null
    if (expenseIdValue && !expense) throw new LuxorExpenseRequestError('Expense not found.', 404)
    let bookingId = bookingIdValue || null
    if (expense?.booking_id) {
      if (bookingId && bookingId !== expense.booking_id) throw new LuxorExpenseRequestError('The selected booking does not match this expense.')
      bookingId = expense.booking_id
    } else if (bookingId && expense) {
      throw new LuxorExpenseRequestError('A business expense cannot be linked to an unrelated event receipt.')
    }
    const booking = bookingId ? await validateExpenseBooking(bookingId) : null
    if (bookingId && !booking) throw new LuxorExpenseRequestError('Booking not found.', 404)
    const duplicateExpenses = totalAmount !== null && transactionDate
      ? await findExpenseDuplicatesForReceipt({ vendorName, transactionDate, totalAmount, excludeExpenseId: expense?.id })
      : []

    let nextStoragePath = current.storage_path
    let nextFileName = current.file_name
    let nextContentType = current.content_type
    let nextSize = current.size_bytes
    let nextHash = typeof old.sha256 === 'string' ? old.sha256 : null
    let duplicateReceiptIds: string[] = []
    if (file) {
      let inspected: Awaited<ReturnType<typeof inspectLuxorExpenseReceipt>>
      try { inspected = await inspectLuxorExpenseReceipt(file) }
      catch (error) { throw new LuxorExpenseRequestError(error instanceof Error ? error.message : 'Upload a valid JPG, PNG, or PDF receipt.') }
      const receipts = (await loadAllExpenseReceipts()).filter((item) => item.id !== current.id)
      const normalizedVendor = vendorName.trim().toLocaleLowerCase()
      const duplicates = receipts.filter((receipt) => receipt.metadata.sha256 === inspected.sha256
        || Boolean(normalizedVendor && transactionDate && totalAmount !== null
          && String(receipt.metadata.vendor_name || '').trim().toLocaleLowerCase() === normalizedVendor
          && receipt.metadata.transaction_date === transactionDate
          && Number(receipt.metadata.total_amount) === totalAmount)).slice(0, 8)
      duplicateReceiptIds = duplicates.map((receipt) => receipt.id)
      nextStoragePath = await uploadLuxorExpenseReceipt(inspected.bytes, inspected.contentType, inspected.safeName)
      uploadedPath = nextStoragePath
      nextFileName = inspected.safeName
      nextContentType = inspected.contentType
      nextSize = inspected.bytes.byteLength
      nextHash = inspected.sha256
    }

    const metadataHistory = Array.isArray(old.metadata_history) ? [...old.metadata_history] : []
    metadataHistory.push({ recorded_at: new Date().toISOString(), updated_by: session.email, previous: old })
    const replacementHistory = Array.isArray(old.replacement_history) ? [...old.replacement_history] : []
    if (uploadedPath) replacementHistory.push({ storage_path: current.storage_path, file_name: current.file_name, content_type: current.content_type, size_bytes: current.size_bytes, replaced_at: new Date().toISOString(), replaced_by: session.email })
    const metadata: LuxorExpenseReceipt['metadata'] = {
      ...old,
      vendor_name: vendorName || null,
      transaction_date: transactionDate || null,
      total_amount: totalAmount,
      subtotal_amount: subtotalAmount,
      tax_amount: taxAmount,
      category: category?.name || null,
      booking_id: bookingId,
      notes: notes || null,
      sha256: nextHash,
      metadata_history: metadataHistory,
      replacement_history: replacementHistory,
    }
    if (values.confirm_extracted === true && old.extracted_fields && typeof old.extracted_fields === 'object' && !Array.isArray(old.extracted_fields)) {
      const extracted = old.extracted_fields as Record<string, unknown>
      metadata.extracted_fields = { ...extracted, confirmed: true, confirmed_at: new Date().toISOString(), confirmed_by: session.email }
    }
    const [saved] = await supabaseRestStrict<LuxorExpenseReceipt[]>(`luxor_documents?select=*&id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        expense_id: expense?.id || null,
        inquiry_id: booking?.inquiry_id || null,
        storage_path: nextStoragePath,
        file_name: nextFileName,
        content_type: nextContentType,
        size_bytes: nextSize,
        title: `${vendorName || 'Expense'} receipt`,
        metadata,
        updated_at: new Date().toISOString(),
      }),
    })
    if (!saved) throw new LuxorExpenseRequestError('Receipt not found.', 404)
    return NextResponse.json({
      receipt: saved,
      duplicate_warning: duplicateReceiptIds.length || duplicateExpenses.length ? 'This receipt may match an existing receipt or expense. The update was saved and remains available for review.' : null,
      duplicate_receipt_ids: duplicateReceiptIds,
      duplicate_expenses: duplicateExpenses,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (uploadedPath) await removeLuxorExpenseReceiptObject(uploadedPath)
    const result = toExpenseErrorResponse(error)
    if (result.status === 500) console.error('Expense receipt could not be updated:', error)
    return NextResponse.json({ error: result.message }, { status: result.status })
  }
}
