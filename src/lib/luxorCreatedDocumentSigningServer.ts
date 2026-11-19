import 'server-only'

import { derivedSignerInitials, fieldValuesComplete, resolveEffectiveSignerFieldValues } from './luxorCreatedDocumentFieldTypes'
import {
  createLuxorCreatedDocumentSigningToken,
  hashLuxorCreatedDocumentSigningToken,
  luxorCreatedDocumentTokenExpired,
} from './luxorCreatedDocumentToken'
import { luxorChicagoDateString, signerNeedsAdoptedSignature } from './luxorCreatedDocumentFieldLayout'
import {
  getLuxorCreatedDocumentSignerById,
  getLuxorCreatedDocumentSignerByTokenHash,
  latestLuxorCreatedDocumentSignedEventPayload,
  listLuxorCreatedDocumentFieldsForRole,
  listLuxorCreatedDocumentSigners,
  recordLuxorCreatedDocumentEvent,
  updateLuxorCreatedDocumentSigner,
} from './luxorCreatedDocumentFieldsServer'
import { buildLuxorCreatedDocumentSignedPdf } from './luxorCreatedDocumentSignedPdfServer'
import { getLuxorCreatedDocument, signedPdfUrlForCreatedDocument } from './luxorDocumentCreatorServer'
import type { LuxorCreatedDocumentSignerRow } from './luxorCreatedDocumentFieldTypes'

export async function resolveLuxorCreatedDocumentSignerFromToken(token: string) {
  if (!token.trim()) return null
  const hash = hashLuxorCreatedDocumentSigningToken(token.trim())
  const signer = await getLuxorCreatedDocumentSignerByTokenHash(hash)
  if (!signer) return null
  if (luxorCreatedDocumentTokenExpired(signer.token_expires_at) && signer.status !== 'signed') {
    await updateLuxorCreatedDocumentSigner(signer.id, { status: 'expired' })
    return { ...signer, status: 'expired' as const }
  }
  return signer
}

export type LuxorCreatedDocumentSignerGateDenial = { error: string; status: 410 }

export async function luxorCreatedDocumentSignerGateResponse(
  signer: LuxorCreatedDocumentSignerRow,
  document?: Awaited<ReturnType<typeof getLuxorCreatedDocument>>,
): Promise<LuxorCreatedDocumentSignerGateDenial | null> {
  const record = document === undefined ? await getLuxorCreatedDocument(signer.document_id) : document
  if (record?.status === 'voided') {
    return { error: 'This signing link was cancelled.', status: 410 }
  }
  if (signer.status === 'declined') {
    return { error: 'This signing link is no longer active.', status: 410 }
  }
  if (
    signer.token_expires_at
    && new Date(signer.token_expires_at).getTime() < Date.now()
    && signer.status !== 'signed'
  ) {
    return { error: 'This signing link has expired.', status: 410 }
  }
  if (signer.status === 'expired') {
    return { error: 'This signing link has expired.', status: 410 }
  }
  return null
}

export async function publicCreatedDocumentSignaturePayload(signer: LuxorCreatedDocumentSignerRow, token: string) {
  const document = await getLuxorCreatedDocument(signer.document_id)
  if (!document) return null
  const fields = await listLuxorCreatedDocumentFieldsForRole(document.id, signer.role_key)
  const signedPayload = signer.status === 'signed'
    ? await latestLuxorCreatedDocumentSignedEventPayload(signer.id)
    : null
  const savedFieldValues = signedPayload?.field_values
    && typeof signedPayload.field_values === 'object'
    && !Array.isArray(signedPayload.field_values)
      ? signedPayload.field_values as Record<string, unknown>
      : undefined
  const adoptedSignatureDataUrl = typeof signedPayload?.signature_data_url === 'string'
    ? signedPayload.signature_data_url
    : undefined
  const adoptedInitialsDataUrl = typeof signedPayload?.initials_data_url === 'string'
    ? signedPayload.initials_data_url
    : undefined
  return {
    flow: 'created_document' as const,
    token,
    status: signer.status,
    document_title: document.title,
    document_type: document.document_type,
    role_key: signer.role_key,
    role_label: signer.role_label,
    signer_name: signer.name,
    signer_email: signer.email,
    decline_reason: signer.decline_reason,
    field_values: savedFieldValues,
    adopted_signature_data_url: adoptedSignatureDataUrl,
    adopted_initials_data_url: adoptedInitialsDataUrl,
    fields: fields.map((field) => ({
      id: field.id,
      field_type: field.field_type,
      label: field.label,
      required: field.required,
      page_index: field.page_index,
      x: field.x,
      y: field.y,
      w: field.w,
      h: field.h,
    })),
    signed_pdf_available: Boolean(signer.signed_pdf_path),
    agreement_execution_ready: signer.status === 'signed' && Boolean(signer.signed_pdf_path || document.final_pdf_path),
    final_pdf_ready: document.status === 'signed' && Boolean(document.final_pdf_path),
  }
}

export async function markLuxorCreatedDocumentSignerViewed(signer: LuxorCreatedDocumentSignerRow, meta: { ip?: string | null; userAgent?: string | null }) {
  if (signer.status === 'signed' || signer.status === 'declined' || signer.status === 'expired') return signer
  const now = new Date().toISOString()
  const nextStatus = signer.status === 'pending' ? 'viewed' : signer.status
  const updated = await updateLuxorCreatedDocumentSigner(signer.id, {
    status: nextStatus,
    viewed_at: signer.viewed_at || now,
    last_ip: meta.ip || signer.last_ip,
    last_user_agent: meta.userAgent || signer.last_user_agent,
  })
  if (updated && !signer.viewed_at) {
    await recordLuxorCreatedDocumentEvent({
      documentId: signer.document_id,
      signerId: signer.id,
      eventType: 'viewed',
      payload: { at: now },
    })
  }
  await syncCreatedDocumentDelivery(signer.document_id)
  return updated || signer
}

async function syncCreatedDocumentDelivery(documentId: string) {
  try {
    const { syncLuxorCreatedDocumentDeliveryStatus } = await import('./luxorCreatedDocumentDeliveryServer')
    await syncLuxorCreatedDocumentDeliveryStatus(documentId)
  } catch (error) {
    console.error('Created document delivery status sync failed', error)
  }
}

export async function declineLuxorCreatedDocumentSigner(input: {
  token: string
  reason: string
  ip?: string | null
  userAgent?: string | null
}) {
  const signer = await resolveLuxorCreatedDocumentSignerFromToken(input.token)
  if (!signer) throw new Error('Signing link not found.')
  if (signer.status === 'signed' || signer.status === 'declined') return signer
  if (luxorCreatedDocumentTokenExpired(signer.token_expires_at)) throw new Error('This signing link has expired.')
  const reason = input.reason.trim().slice(0, 500)
  if (!reason) throw new Error('Please share a short reason for declining.')
  const now = new Date().toISOString()
  const updated = await updateLuxorCreatedDocumentSigner(signer.id, {
    status: 'declined',
    declined_at: now,
    decline_reason: reason,
    last_ip: input.ip || null,
    last_user_agent: input.userAgent || null,
  })
  await recordLuxorCreatedDocumentEvent({
    documentId: signer.document_id,
    signerId: signer.id,
    eventType: 'declined',
    payload: { reason, at: now },
  })
  await syncCreatedDocumentDelivery(signer.document_id)
  return updated || signer
}

export async function completeLuxorCreatedDocumentSigner(input: {
  token: string
  signedName: string
  accepted: boolean
  signatureDataUrl: string
  initialsDataUrl?: string
  fieldValues: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}) {
  const signer = await resolveLuxorCreatedDocumentSignerFromToken(input.token)
  if (!signer) throw new Error('Signing link not found.')
  if (signer.status === 'signed') return signer
  if (signer.status === 'declined' || signer.status === 'expired') throw new Error('This signing link is no longer active.')
  if (luxorCreatedDocumentTokenExpired(signer.token_expires_at)) throw new Error('This signing link has expired.')
  if (!input.accepted) throw new Error('Please accept the signing acknowledgement.')

  const roleFields = await listLuxorCreatedDocumentFieldsForRole(signer.document_id, signer.role_key)
  const needsSignature = signerNeedsAdoptedSignature(roleFields.map((field) => field.field_type))
  const signedName = input.signedName.trim() || (needsSignature ? '' : signer.name.trim() || 'Signer')
  if (needsSignature && !signedName) throw new Error('Please type your legal name.')
  if (needsSignature && !/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(input.signatureDataUrl)) {
    throw new Error('Please add your signature before finishing.')
  }
  const mergedFieldValues = resolveEffectiveSignerFieldValues(roleFields, input.fieldValues, {
    signerName: signedName,
    signerEmail: signer.email,
    signatureAdopted: needsSignature && /^data:image\/png;base64,/i.test(input.signatureDataUrl),
    defaultDate: luxorChicagoDateString(),
  })
  for (const field of roleFields) {
    if (field.field_type === 'initials') {
      mergedFieldValues[field.id] = derivedSignerInitials(signedName) || 'IN'
    }
  }
  const completion = fieldValuesComplete(roleFields, mergedFieldValues)
  if (!completion.ok) throw new Error('Please complete all required fields.')

  const signedPath = await buildLuxorCreatedDocumentSignedPdf({
    documentId: signer.document_id,
    signerId: signer.id,
    roleKey: signer.role_key,
    fieldValues: {
      ...mergedFieldValues,
      ...Object.fromEntries(
        roleFields
          .filter((field) => field.field_type === 'name')
          .map((field) => [field.id, signedName]),
      ),
    },
    signatureDataUrl: input.signatureDataUrl,
    initialsDataUrl: input.initialsDataUrl,
  })

  const now = new Date().toISOString()
  const updated = await updateLuxorCreatedDocumentSigner(signer.id, {
    status: 'signed',
    signed_at: now,
    name: signedName,
    signed_pdf_path: signedPath,
    last_ip: input.ip || null,
    last_user_agent: input.userAgent || null,
  })
  await recordLuxorCreatedDocumentEvent({
    documentId: signer.document_id,
    signerId: signer.id,
    eventType: 'signed',
    payload: {
      signed_name: signedName,
      at: now,
      field_ids: roleFields.map((field) => field.id),
      field_values: mergedFieldValues,
      signature_data_url: needsSignature ? input.signatureDataUrl : null,
      initials_data_url: needsSignature ? input.initialsDataUrl || null : null,
    },
  })
  await syncCreatedDocumentDelivery(signer.document_id)
  return updated || signer
}

export async function createLuxorCreatedDocumentTestSigningLink(input: {
  documentId: string
  roleKey: string
  signerName?: string
  signerEmail?: string
  siteOrigin?: string
}) {
  const document = await getLuxorCreatedDocument(input.documentId)
  if (!document) throw new Error('Document not found.')
  if (document.is_template) throw new Error('Test signing links are only available for draft documents, not templates.')
  if (document.status !== 'draft') throw new Error('Test signing links are only available for draft documents.')

  const signers = await listLuxorCreatedDocumentSigners(input.documentId)
  const signer = signers.find((row) => row.role_key === input.roleKey)
  if (!signer) throw new Error('Signer role not found on this document.')

  const { token, tokenHash, expiresAt } = createLuxorCreatedDocumentSigningToken()
  const updated = await updateLuxorCreatedDocumentSigner(signer.id, {
    token_hash: tokenHash,
    token_expires_at: expiresAt,
    status: 'pending',
    signed_at: null,
    declined_at: null,
    decline_reason: null,
    signed_pdf_path: null,
    ...(input.signerName ? { name: input.signerName.trim() } : {}),
    ...(input.signerEmail ? { email: input.signerEmail.trim() } : {}),
  })
  await recordLuxorCreatedDocumentEvent({
    documentId: input.documentId,
    signerId: signer.id,
    eventType: 'test_link_created',
    payload: { expires_at: expiresAt, role_key: signer.role_key },
  })
  const origin = (input.siteOrigin || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.luxoratlaspalmas.com').replace(/\/$/, '')
  return {
    signer: updated || signer,
    token,
    signingUrl: `${origin}/secure-portal/sign/${encodeURIComponent(token)}`,
    expiresAt,
  }
}

export async function createdDocumentPdfDownloadPath(signer: LuxorCreatedDocumentSignerRow, kind: string) {
  const document = await getLuxorCreatedDocument(signer.document_id)
  if (!document) return null
  if (kind === 'executed' || kind === 'signed' || kind === 'final') {
    if (document.status === 'signed' && document.final_pdf_path) return document.final_pdf_path
    return signer.signed_pdf_path
  }
  return document.pdf_storage_path
}

export async function signedUrlForCreatedDocumentSigner(signer: LuxorCreatedDocumentSignerRow, kind: string) {
  const path = await createdDocumentPdfDownloadPath(signer, kind)
  if (!path) return null
  const document = await getLuxorCreatedDocument(signer.document_id)
  if (!document) return null
  if (path === document.pdf_storage_path) {
    return signedPdfUrlForCreatedDocument({ ...document, pdf_storage_path: path }, `${document.title}.pdf`)
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error('Supabase configuration is missing on the server.')
  const response = await fetch(`${url.replace(/\/$/, '')}/storage/v1/object/sign/luxor-documents/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 3600, download: `${document.title}-signed.pdf` }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Could not sign the PDF URL: ${await response.text()}`)
  const body = await response.json() as { signedURL?: string; signedUrl?: string }
  const signed = body.signedURL || body.signedUrl
  if (!signed) throw new Error('The PDF URL could not be prepared.')
  return signed.startsWith('http') ? signed : `${url.replace(/\/$/, '')}/storage/v1${signed}`
}