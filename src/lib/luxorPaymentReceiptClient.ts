import type { LuxorEmailJob } from './luxorInquiryTypes'

type ReceiptPreview = { fingerprint: string; pdfSha256: string }
type ReceiptQueueResult = { job?: LuxorEmailJob; state?: string }

export async function queueLuxorPaymentReceiptAfterSave(paymentId: string, request: typeof fetch = fetch): Promise<ReceiptQueueResult> {
  const url = `/api/payments/${encodeURIComponent(paymentId)}/receipt/email`
  const previewResponse = await request(url, { cache: 'no-store' })
  const preview = await previewResponse.json().catch(() => ({})) as ReceiptPreview & { error?: string }
  if (!previewResponse.ok || !preview.fingerprint || !preview.pdfSha256) {
    throw new Error(preview.error || 'Receipt preview could not be prepared.')
  }
  const response = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint: preview.fingerprint, pdfSha256: preview.pdfSha256 }),
  })
  const result = await response.json().catch(() => ({})) as ReceiptQueueResult & { error?: string }
  if (!response.ok) throw new Error(result.error || 'Receipt email could not be queued.')
  return result
}
