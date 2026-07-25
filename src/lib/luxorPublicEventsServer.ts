import 'server-only'

import { createHash } from 'crypto'
import { supabaseRest } from './supabaseRestServer'

export type LuxorPublicEventInput = {
  eventName: string
  sessionId?: string
  pagePath?: string
  source?: string
  inquiryId?: string
  ipHash?: string
  metadata?: Record<string, unknown>
}

export function getPublicRequestIp(headers: Headers) {
  return (headers.get('x-forwarded-for')?.split(',')[0] || headers.get('x-real-ip') || '').trim()
}

export function hashPublicRequestIp(ip: string) {
  if (!ip) return ''
  const salt = process.env.LUXOR_PORTAL_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'luxor-public'
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

export async function recordLuxorPublicEvent(input: LuxorPublicEventInput) {
  const eventName = input.eventName.trim().slice(0, 80)
  if (!eventName) return null

  const [created] = await supabaseRest<Array<{ id: string }>>('luxor_public_events?select=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      event_name: eventName,
      session_id: input.sessionId?.trim().slice(0, 120) || null,
      page_path: input.pagePath?.trim().slice(0, 500) || null,
      source: input.source?.trim().slice(0, 160) || null,
      inquiry_id: input.inquiryId || null,
      ip_hash: input.ipHash || null,
      metadata: input.metadata || {},
    }),
  })

  return created ?? null
}

export async function countRecentInquiryAttempts(ipHash: string, minutes = 10) {
  if (!ipHash) return 0
  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  const rows = await supabaseRest<Array<{ id: string }>>(
    `luxor_public_events?select=id&event_name=eq.inquiry_attempt&ip_hash=eq.${encodeURIComponent(ipHash)}&created_at=gte.${encodeURIComponent(since)}&limit=20`,
  )
  return rows.length
}
