import 'server-only'

import { LuxorDocument, LuxorDocumentType, LuxorInvoice } from './luxorInquiryTypes'
import { supabaseRest } from './supabaseRestServer'

const DOCUMENT_BUCKET = 'luxor-documents'

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Supabase configuration is missing on the server.')
  return { url: url.replace(/\/$/, ''), serviceRoleKey }
}

function safeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_')
}

async function ensureDocumentBucket() {
  const { url, serviceRoleKey } = getSupabaseConfig()
  const response = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: DOCUMENT_BUCKET,
      name: DOCUMENT_BUCKET,
      public: false,
      file_size_limit: 10 * 1024 * 1024,
      allowed_mime_types: ['application/pdf'],
    }),
    cache: 'no-store',
  })

  // Storage returns a conflict when the private bucket is already present.
  if (!response.ok && response.status !== 409) {
    throw new Error(`Could not prepare private PDF storage: ${await response.text()}`)
  }
}

export async function getLuxorDocumentByInvoice(invoiceId: string, documentType: LuxorDocumentType = 'proposal') {
  const documents = await supabaseRest<LuxorDocument[]>(
    `luxor_documents?select=*&invoice_id=eq.${encodeURIComponent(invoiceId)}&document_type=eq.${documentType}&limit=1`,
  )
  return documents[0] ?? null
}

export async function listLuxorDocumentsByInquiry(inquiryId: string) {
  return supabaseRest<LuxorDocument[]>(
    `luxor_documents?select=*&inquiry_id=eq.${encodeURIComponent(inquiryId)}&order=created_at.desc`,
  )
}

export async function saveLuxorProposalPdf(input: {
  invoice: LuxorInvoice
  inquiryId: string | null
  pdf: Uint8Array
  createdBy: string
}) {
  const { invoice, inquiryId, pdf, createdBy } = input
  // This is the exact proposal that is emailed to the client. The invoice
  // status becomes "sent" afterward, so its document type must not change.
  const documentType: LuxorDocumentType = 'proposal'
  const label = 'Proposal'
  const fileName = `Luxor-${label}-${invoice.id.slice(0, 8)}.pdf`
  const storagePath = `invoices/${safeFilePart(invoice.id)}/${fileName}`
  const { url, serviceRoleKey } = getSupabaseConfig()
  await ensureDocumentBucket()
  const upload = await fetch(`${url}/storage/v1/object/${DOCUMENT_BUCKET}/${storagePath}`, {
    method: 'PUT',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/pdf',
      'x-upsert': 'true',
    },
    body: Buffer.from(pdf),
    cache: 'no-store',
  })
  if (!upload.ok) throw new Error(`Could not save the PDF: ${await upload.text()}`)

  const documentInput = {
    inquiry_id: inquiryId,
    invoice_id: invoice.id,
    document_type: documentType,
    title: `${label} for ${invoice.client_name}`,
    file_name: fileName,
    storage_path: storagePath,
    content_type: 'application/pdf',
    size_bytes: pdf.byteLength,
    created_by: createdBy,
    updated_at: new Date().toISOString(),
  }
  const existing = await getLuxorDocumentByInvoice(invoice.id, documentType)
  const path = existing
    ? `luxor_documents?select=*&id=eq.${encodeURIComponent(existing.id)}`
    : 'luxor_documents?select=*'
  const documents = await supabaseRest<LuxorDocument[]>(path, {
    method: existing ? 'PATCH' : 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(documentInput),
  })
  const document = documents[0]
  if (!document) throw new Error('The PDF was uploaded but its document record could not be saved.')
  return document
}

export async function downloadLuxorDocument(document: LuxorDocument) {
  const { url, serviceRoleKey } = getSupabaseConfig()
  const response = await fetch(`${url}/storage/v1/object/${DOCUMENT_BUCKET}/${document.storage_path}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Could not open the saved PDF: ${await response.text()}`)
  return new Uint8Array(await response.arrayBuffer())
}
