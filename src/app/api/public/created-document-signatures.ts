import { NextRequest, NextResponse } from 'next/server'
import {
  completeLuxorCreatedDocumentSigner,
  declineLuxorCreatedDocumentSigner,
  luxorCreatedDocumentSignerGateResponse,
  markLuxorCreatedDocumentSignerViewed,
  publicCreatedDocumentSignaturePayload,
  resolveLuxorCreatedDocumentSignerFromToken,
} from '@/lib/luxorCreatedDocumentSigningServer'
import { createdDocumentSignClientStatus } from '@/lib/luxorCreatedDocumentFieldLayout'

export async function tryCreatedDocumentSignGet(request: NextRequest, token: string) {
  const signer = await resolveLuxorCreatedDocumentSignerFromToken(token)
  if (!signer) return null
  const denied = await luxorCreatedDocumentSignerGateResponse(signer)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })
  const viewed = await markLuxorCreatedDocumentSignerViewed(signer, {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  })
  const payload = await publicCreatedDocumentSignaturePayload(viewed, token)
  if (!payload) return NextResponse.json({ error: 'Signing link not found.' }, { status: 404 })
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } })
}

export async function tryCreatedDocumentSignPost(request: NextRequest, token: string, body: Record<string, unknown>) {
  const signer = await resolveLuxorCreatedDocumentSignerFromToken(token)
  if (!signer) return null
  const denied = await luxorCreatedDocumentSignerGateResponse(signer)
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status })
  const meta = {
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
    userAgent: request.headers.get('user-agent'),
  }
  try {
    if (body.decline === true) {
      const declined = await declineLuxorCreatedDocumentSigner({
        token,
        reason: String(body.reason || ''),
        ...meta,
      })
      const payload = await publicCreatedDocumentSignaturePayload(declined, token)
      return NextResponse.json(payload)
    }
    const completed = await completeLuxorCreatedDocumentSigner({
      token,
      signedName: String(body.signedName || ''),
      accepted: Boolean(body.accepted),
      signatureDataUrl: String(body.signatureDataUrl || ''),
      initialsDataUrl: typeof body.initialsDataUrl === 'string' ? body.initialsDataUrl : undefined,
      fieldValues: body.fieldValues && typeof body.fieldValues === 'object' && !Array.isArray(body.fieldValues)
        ? body.fieldValues as Record<string, unknown>
        : {},
      ...meta,
    })
    const payload = await publicCreatedDocumentSignaturePayload(completed, token)
    if (!payload) return NextResponse.json({ error: 'Signing link not found.' }, { status: 404 })
    return NextResponse.json({
      ...payload,
      agreement_execution_ready: completed.status === 'signed' && Boolean(completed.signed_pdf_path),
      status: completed.status,
    })
  } catch (error) {
    console.error('Created document signing POST failed', error)
    const message = error instanceof Error ? error.message : 'Unable to submit signature.'
    return NextResponse.json({ error: message }, { status: createdDocumentSignClientStatus(message) })
  }
}