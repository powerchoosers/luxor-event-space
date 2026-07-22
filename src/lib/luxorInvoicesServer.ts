import 'server-only'

import { LuxorInvoice, LuxorInvoiceLineItem, LuxorInvoiceStatus, LuxorBill, LuxorPayment } from './luxorInquiryTypes'

type SupabaseError = {
  message?: string
  error?: string
  details?: string
  hint?: string
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.')
  }

  return { url: url.replace(/\/$/, ''), serviceRoleKey }
}

async function supabaseRest<T>(path: string, init: RequestInit = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig()
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as SupabaseError
    throw new Error(payload.message ?? payload.error ?? `Supabase request failed with ${response.status}`)
  }

  const text = await response.text()
  return (text ? JSON.parse(text) : null) as T
}

export async function listInvoices(limit = 1000) {
  return supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&order=created_at.desc&limit=${encodeURIComponent(limit)}`
  )
}

export async function listInvoicesByInquiry(inquiryId: string) {
  return supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc`
  )
}

export async function getInvoice(id: string) {
  const [invoice] = await supabaseRest<LuxorInvoice[]>(
    `luxor_invoices?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  )
  return invoice ?? null
}

export async function listPaidPaymentsByInvoice(invoiceId: string) {
  return supabaseRest<LuxorPayment[]>(
    `luxor_payments?select=*&invoice_id=eq.${encodeURIComponent(invoiceId)}&status=eq.paid&order=created_at.desc`,
  )
}

export async function createInvoice(data: {
  client_name: string
  event_type?: string | null
  description?: string | null
  line_items: LuxorInvoiceLineItem[]
  subtotal: number
  tax_rate: number
  total: number
  due_date?: string | null
  inquiry_id?: string | null
  notes?: string | null
}) {
  const [created] = await supabaseRest<LuxorInvoice[]>('luxor_invoices?select=*', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      client_name: data.client_name,
      event_type: data.event_type || null,
      description: data.description || null,
      line_items: data.line_items,
      subtotal: data.subtotal,
      tax_rate: data.tax_rate,
      total: data.total,
      due_date: data.due_date || null,
      inquiry_id: data.inquiry_id || null,
      notes: data.notes || null,
      status: 'draft',
    }),
  })

  return created
}

export async function updateInvoice(
  id: string,
  updates: Partial<Pick<LuxorInvoice, 'status' | 'due_date' | 'paid_at' | 'notes' | 'line_items' | 'subtotal' | 'tax_rate' | 'total'>>
) {
  const [updated] = await supabaseRest<LuxorInvoice[]>(`luxor_invoices?select=*&id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      ...updates,
      updated_at: new Date().toISOString(),
    }),
  })

  return updated ?? null
}

export async function deleteInvoice(id: string) {
  await supabaseRest<null>(`luxor_payments?invoice_id=eq.${encodeURIComponent(id)}&status=neq.paid`, {
    method: 'DELETE',
  })
  await supabaseRest<null>(`luxor_invoices?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export async function listAllBills() {
  return supabaseRest<LuxorBill[]>('luxor_bills?select=*&order=due_date.asc')
}
