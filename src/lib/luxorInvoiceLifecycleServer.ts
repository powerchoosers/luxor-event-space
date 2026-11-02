import 'server-only'

import { supabaseRest } from '@/lib/supabaseRestServer'

type LifecycleRpcResult = {
  deleted?: boolean
  voided?: boolean
  changed?: boolean
  invoice_id?: string
  payment_id?: string
  status?: string
  received_date?: string
  paid_at?: string
  created_at?: string
  storage_paths?: string[]
}

function storageConfig() {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.replace(/\/$/, '')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase storage configuration is missing on the server.')
  return { url, key }
}

export async function deleteUnissuedDraftInvoice(invoiceId: string, actorEmail: string) {
  return supabaseRest<LifecycleRpcResult>('rpc/luxor_delete_unissued_draft_invoice', {
    method: 'POST',
    body: JSON.stringify({ p_invoice_id: invoiceId, p_actor_email: actorEmail }),
  })
}

export async function voidUnpaidSentInvoice(invoiceId: string, actorEmail: string, reason: string) {
  return supabaseRest<LifecycleRpcResult>('rpc/luxor_void_unpaid_sent_invoice', {
    method: 'POST',
    body: JSON.stringify({ p_invoice_id: invoiceId, p_actor_email: actorEmail, p_reason: reason }),
  })
}

export async function correctManualPaymentReceivedDate(paymentId: string, receivedDate: string, expectedReceivedDate: string, actorEmail: string, reason: string) {
  return supabaseRest<LifecycleRpcResult>('rpc/luxor_correct_manual_payment_received_date', {
    method: 'POST',
    body: JSON.stringify({ p_payment_id: paymentId, p_new_received_date: receivedDate, p_expected_received_date: expectedReceivedDate, p_actor_email: actorEmail, p_reason: reason }),
  })
}

/** Remove only the private PDFs whose paths the successful invoice-delete RPC returned. */
export async function removeDeletedDraftInvoiceFiles(storagePaths: string[]) {
  if (!storagePaths.length) return [] as string[]
  const { url, key } = storageConfig()
  const failed: string[] = []
  for (const storagePath of storagePaths) {
    const encodedPath = storagePath.split('/').map(encodeURIComponent).join('/')
    const response = await fetch(`${url}/storage/v1/object/luxor-documents/${encodedPath}`, {
      method: 'DELETE',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!response.ok && response.status !== 404) failed.push(storagePath)
  }
  return failed
}
