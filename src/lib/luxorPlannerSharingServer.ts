import 'server-only'

import crypto from 'node:crypto'
import { renderLuxorSystemEmail } from '@/lib/luxorEmailDesignSystem'
import { normalizePlannerEventLayout } from '@/lib/luxorPlannerLayout'
import { supabaseRestStrict } from '@/lib/supabaseRestServer'
import { renderPlannerInvitationCopy, type PlannerInvitationCopy } from '@/lib/luxorPlannerInvitationCopy'
import { PLANNER_VERIFICATION_DEFAULT, renderPlannerVerificationCopy, type PlannerVerificationCopy } from '@/lib/luxorPlannerVerificationCopy'

export type PlannerPresentation = Record<string, unknown> & {
  id: string
  booking_id: string | null
  design_id: string | null
  design_revision: number
  design_snapshot: Record<string, unknown>
  recipient_email: string
  token_hash: string
  token_ciphertext: string
  lifecycle_status: 'preparing' | 'ready' | 'queued'
  expires_at: string
  revoked_at: string | null
  client_action: 'feedback' | 'approved' | null
  client_note: string | null
  responded_at: string | null
}

export type PlannerPresentationFile = {
  id: string
  presentation_id: string
  file_name: string
  content_type: 'image/jpeg' | 'image/png' | 'image/webp'
  size_bytes: number
  storage_path: string
}

export function sanitizePlannerPresentationSnapshot(snapshot: Record<string, unknown>, revision: number) {
  const content = snapshot.content && typeof snapshot.content === 'object' && !Array.isArray(snapshot.content)
    ? snapshot.content as Record<string, unknown>
    : {}
  const allowedContent: Record<string, unknown> = {}
  const eventLayout = normalizePlannerEventLayout(content.event_layout)
  if (eventLayout) allowedContent.event_layout = eventLayout
  return {
    revision,
    name: String(snapshot.name || 'Event design').slice(0, 160),
    eventType: String(snapshot.event_type || 'Private event').slice(0, 100),
    style: String(snapshot.design_style || '').slice(0, 100),
    palette: Array.isArray(snapshot.palette) ? snapshot.palette.slice(0, 12).map((value) => String(value).slice(0, 80)) : [],
    description: String(snapshot.description || '').slice(0, 2000),
    content: allowedContent,
  }
}

function secret() {
  const value = process.env.LUXOR_PORTAL_SESSION_SECRET || process.env.ZOHO_CLIENT_SECRET
  if (!value) throw new Error('Portal session signing is not configured.')
  return value
}

function deriveKey(purpose: string) {
  return crypto.createHmac('sha256', secret()).update(`luxor-planner-presentation:${purpose}:v1`).digest()
}

function hmac(purpose: string, value: string) {
  return crypto.createHmac('sha256', deriveKey(purpose)).update(value).digest('hex')
}

export function createPresentationToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashPresentationToken(token: string) {
  return hmac('token-lookup', token)
}

export function hashPresentationCode(presentationId: string, code: string) {
  return hmac('verification-code', `${presentationId}:${code}`)
}

export function createPresentationCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
}

export function encryptPresentationSecret(value: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('secret-encryption'), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.')
}

export function decryptPresentationSecret(value: string) {
  const [version, iv, tag, body] = value.split('.')
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Invalid Planner presentation secret.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('secret-encryption'), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8')
}

export async function findPresentationByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const [presentation] = await supabaseRestStrict<PlannerPresentation[]>(
    `luxor_planner_presentations?select=*&token_hash=eq.${encodeURIComponent(hashPresentationToken(token))}&limit=1`,
  )
  return presentation || null
}

export function presentationIsActive(presentation: PlannerPresentation) {
  return Boolean(presentation.lifecycle_status !== 'preparing' && presentation.booking_id && !presentation.revoked_at && Date.parse(presentation.expires_at) > Date.now())
}

export async function listPresentationFiles(presentationId: string) {
  return supabaseRestStrict<PlannerPresentationFile[]>(
    `luxor_planner_presentation_files?select=id,presentation_id,file_name,content_type,size_bytes,storage_path&presentation_id=eq.${encodeURIComponent(presentationId)}&order=created_at.asc`,
  )
}

export async function getPresentationFile(presentationId: string, fileId: string) {
  const [file] = await supabaseRestStrict<PlannerPresentationFile[]>(
    `luxor_planner_presentation_files?select=id,presentation_id,file_name,content_type,size_bytes,storage_path&presentation_id=eq.${encodeURIComponent(presentationId)}&id=eq.${encodeURIComponent(fileId)}&limit=1`,
  )
  return file || null
}

export function createPresentationSession(presentationId: string, tokenHash: string, expiresAt: string) {
  const expiry = Math.min(Date.now() + 30 * 60_000, Date.parse(expiresAt))
  const payload = Buffer.from(JSON.stringify({ presentationId, tokenHash, expiry })).toString('base64url')
  const signature = crypto.createHmac('sha256', deriveKey('verified-session')).update(payload).digest('base64url')
  return { value: `${payload}.${signature}`, maxAge: Math.max(0, Math.floor((expiry - Date.now()) / 1000)) }
}

export function verifyPresentationSession(value: string | undefined, presentationId: string, tokenHash: string) {
  if (!value) return false
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return false
  const expected = crypto.createHmac('sha256', deriveKey('verified-session')).update(payload).digest()
  let supplied: Buffer
  try { supplied = Buffer.from(signature, 'base64url') } catch { return false }
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) return false
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
    return decoded.presentationId === presentationId && decoded.tokenHash === tokenHash
      && typeof decoded.expiry === 'number' && decoded.expiry > Date.now()
  } catch { return false }
}

export function buildPlannerPresentationInvitation(input: { name: string; url: string; expiresAt: string; copyOverride?: PlannerInvitationCopy | null }) {
  const copy = input.copyOverride ? renderPlannerInvitationCopy(input.copyOverride, input.name.split(/\s+/)[0] || 'there') : null
  return {
    subject: copy?.subject ?? 'Your Luxor event design is ready to review',
    body: renderLuxorSystemEmail({
      previewText: 'A private event design is ready for your review.',
      eyebrow: 'Your event design',
      title: 'A design to review',
      greeting: copy ? escapeHtml(copy.greeting) : `Hello ${escapeHtml(input.name.split(/\s+/)[0] || 'there')},`,
      bodyHtml: copy ? `<p style="margin:0">${escapeHtml(copy.body).replace(/\n/g, '<br />')}</p><p>Verify the email address this invitation was sent to with a one-time code.</p>` : '<p style="margin:0">Luxor has prepared an event design for you. Open the private presentation to view the selected concept and images, then verify the email address this invitation was sent to with a one-time code.</p>',
      actions: [{ label: 'Review your event design', url: input.url }],
      note: `This private link expires ${escapeHtml(new Date(input.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }))}. The verification code is sent separately when you request access.`,
      theme: 'light',
    }),
  }
}

export function buildPlannerPresentationCodeEmail(code: string, copyOverride?: PlannerVerificationCopy | null) {
  const copy = copyOverride ? renderPlannerVerificationCopy(copyOverride) : null
  const safeCode = /^\d{6}$/.test(code) ? code : '123456'
  const codeHtml = escapeHtml(safeCode)
  return {
    subject: copy?.subject ?? PLANNER_VERIFICATION_DEFAULT.subject,
    body: renderLuxorSystemEmail({
      previewText: 'Use this one-time code to open your Luxor event design.',
      eyebrow: 'Private design access',
      title: copy?.title ?? PLANNER_VERIFICATION_DEFAULT.title,
      greeting: escapeHtml(copy?.greeting ?? PLANNER_VERIFICATION_DEFAULT.greeting),
      bodyHtml: `<p style="margin:0">${escapeHtml(copy?.intro ?? PLANNER_VERIFICATION_DEFAULT.intro).replace(/\n/g, '<br />')}</p><p style="margin:22px 0;text-align:center;font-size:30px;font-weight:700;letter-spacing:8px;color:#9a712e">${codeHtml}</p><p style="margin:0">${escapeHtml(copy?.closing ?? PLANNER_VERIFICATION_DEFAULT.closing).replace(/\n/g, '<br />')}</p>`,
      note: escapeHtml(copy?.note ?? PLANNER_VERIFICATION_DEFAULT.note).replace(/\n/g, '<br />'),
      theme: 'light',
    }),
  }
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
