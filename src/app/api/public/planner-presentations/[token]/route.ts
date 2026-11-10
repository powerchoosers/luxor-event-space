/* eslint-disable @typescript-eslint/no-explicit-any -- public snapshots are explicitly sanitized at creation. */
import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createPresentationCode, createPresentationSession, encryptPresentationSecret, findPresentationByToken, hashPresentationCode, listPresentationFiles, presentationIsActive, sanitizePlannerPresentationSnapshot, verifyPresentationSession } from '@/lib/luxorPlannerSharingServer'
import { buildPlannerPresentationCodeEmail } from '@/lib/luxorPlannerSharingServer'
import { readPlannerVerificationSetting } from '@/lib/luxorPlannerVerificationCopyServer'
import { createUniqueLuxorEmailJob } from '@/lib/luxorEmailJobsServer'
import { getPublicRequestIp, hashPublicRequestIp } from '@/lib/luxorPublicEventsServer'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'

type Context = { params: Promise<{ token: string }> }
type Row = Record<string, any>
const noStore = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
const unavailable = () => NextResponse.json({ error: 'This private presentation is unavailable or has expired.' }, { status: 410, headers: noStore })
function cookieName(id: string) { return `luxor_planner_verified_${id.replace(/[^a-zA-Z0-9_-]/g, '')}` }
function masked(email: string) {
  const [name, domain] = email.split('@')
  return `${name.slice(0, 1)}•••@${domain}`
}

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { token } = await params
    const presentation = await findPresentationByToken(token)
    if (!presentation || !presentationIsActive(presentation)) return unavailable()
    const cookie = (await cookies()).get(cookieName(presentation.id))?.value
    if (!verifyPresentationSession(cookie, presentation.id, presentation.token_hash)) {
      return NextResponse.json({ requiresVerification: true, recipientHint: masked(presentation.recipient_email) }, { headers: noStore })
    }
    const files = await listPresentationFiles(presentation.id)
    return NextResponse.json({ requiresVerification: false, presentation: sanitizePlannerPresentationSnapshot(presentation.design_snapshot, presentation.design_revision), response: presentation.client_action ? { action: presentation.client_action, note: presentation.client_note, revision: presentation.response_revision, respondedAt: presentation.responded_at } : null,
      files: files.map(file => ({ id: file.id, name: file.file_name, contentType: file.content_type, url: `/api/public/planner-presentations/${token}/files/${file.id}` })) }, { headers: noStore })
  } catch (error) {
    console.error('Unable to load private Planner presentation:', error)
    return NextResponse.json({ error: 'Unable to load this presentation right now.' }, { status: 500, headers: noStore })
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    if (Number(request.headers.get('content-length') || 0) > 12_000) return NextResponse.json({ error: 'The request is too large.' }, { status: 413, headers: noStore })
    const { token } = await params
    const presentation = await findPresentationByToken(token)
    if (!presentation || !presentationIsActive(presentation)) return unavailable()
    const body = await request.json().catch(() => null) as Row | null
    if (!body || typeof body.action !== 'string') return NextResponse.json({ error: 'Choose a valid action.' }, { status: 400, headers: noStore })
    if (body.action === 'request_code') {
      const code = createPresentationCode()
      const generationId = crypto.randomUUID()
      const codeHash = hashPresentationCode(presentation.id, code)
      const ipHash = hashPublicRequestIp(getPublicRequestIp(request.headers))
      const rpc = await supabaseRestStrict<Row>('rpc/luxor_planner_issue_presentation_code', { method: 'POST', body: JSON.stringify({ p_presentation_id: presentation.id, p_generation_id: generationId, p_code_hash: codeHash, p_code_ciphertext: encryptPresentationSecret(code), p_ip_hash: ipHash || hashPublicRequestIp('unknown') }) })
      if (!rpc?.issued) {
        const tooMany = rpc?.reason === 'rate_limited' || rpc?.reason === 'too_soon'
        return NextResponse.json({ ok: false, error: tooMany ? 'Please wait before requesting another code.' : 'A verification code could not be issued.' }, { status: tooMany ? 429 : 410, headers: noStore })
      }
      let verificationCopy = null
      try { verificationCopy = (await readPlannerVerificationSetting()).setting.copy_override } catch (error) {
        console.error('Planner verification copy unavailable; using original wording:', error)
      }
      const email = buildPlannerPresentationCodeEmail('__PLANNER_CODE_AT_SEND__', verificationCopy)
      await createUniqueLuxorEmailJob({ inquiryId: null, bookingId: presentation.booking_id, jobType: 'layout_review', recipientEmail: presentation.recipient_email, subject: email.subject, body: 'Your private Luxor presentation verification code will be inserted by the secure email worker.', metadata: { kind: 'planner_presentation_verification', planner_presentation_id: presentation.id, generation_id: generationId, code_hash: codeHash }, automationKey: `planner-presentation-code:${presentation.id}:${generationId}` })
      return NextResponse.json({ ok: true, generationId }, { headers: noStore })
    }
    if (body.action === 'verify_code') {
      const code = typeof body.code === 'string' ? body.code.trim() : ''
      const generationId = typeof body.generationId === 'string' ? body.generationId : ''
      if (!/^\d{6}$/.test(code) || !/^[0-9a-f-]{36}$/i.test(generationId)) return NextResponse.json({ error: 'Enter the six-digit code from your latest email.' }, { status: 400, headers: noStore })
      const result = await supabaseRestStrict<Row>('rpc/luxor_planner_verify_presentation_code', { method: 'POST', body: JSON.stringify({ p_presentation_id: presentation.id, p_generation_id: generationId, p_code_hash: hashPresentationCode(presentation.id, code) }) })
      if (!result?.verified) return NextResponse.json({ error: result?.reason === 'rate_limited' ? 'Too many attempts. Request a new code later.' : 'That code is invalid or expired.' }, { status: result?.reason === 'rate_limited' ? 429 : 400, headers: noStore })
      const session = createPresentationSession(presentation.id, presentation.token_hash, presentation.expires_at)
      const response = NextResponse.json({ ok: true }, { headers: noStore })
      response.cookies.set(cookieName(presentation.id), session.value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: `/api/public/planner-presentations/${token}`, maxAge: session.maxAge })
      return response
    }
    if (body.action === 'respond') {
      const cookie = (await cookies()).get(cookieName(presentation.id))?.value
      if (!verifyPresentationSession(cookie, presentation.id, presentation.token_hash)) return NextResponse.json({ error: 'Verify your email before responding.' }, { status: 401, headers: noStore })
      if (body.response !== 'approved' && body.response !== 'feedback') return NextResponse.json({ error: 'Choose approval or feedback.' }, { status: 400, headers: noStore })
      const submissionKey = typeof body.submissionKey === 'string' ? body.submissionKey : ''
      const note = typeof body.note === 'string' ? body.note.slice(0, 4000) : ''
      const result = await supabaseRestStrict<Row>('rpc/luxor_planner_record_presentation_response', { method: 'POST', body: JSON.stringify({ p_presentation_id: presentation.id, p_action: body.response, p_note: note, p_submission_key: submissionKey, p_ip_hash: hashPublicRequestIp(getPublicRequestIp(request.headers)) || hashPublicRequestIp('unknown'), p_user_agent: request.headers.get('user-agent') || '' }) })
      if (!result?.saved) return NextResponse.json({ error: result?.reason === 'already_responded' ? 'A response was already submitted for this design.' : 'This presentation is unavailable.' }, { status: result?.reason === 'already_responded' ? 409 : 410, headers: noStore })
      return NextResponse.json({ ok: true, response: { action: body.response, revision: presentation.design_revision } }, { headers: noStore })
    }
    return NextResponse.json({ error: 'Choose a valid action.' }, { status: 400, headers: noStore })
  } catch (error) {
    console.error('Planner presentation action failed:', error)
    return NextResponse.json({ error: 'This request could not be completed.' }, { status: 500, headers: noStore })
  }
}
