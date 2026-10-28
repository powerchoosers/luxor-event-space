import 'server-only'
import crypto from 'node:crypto'
import { supabaseRestStrict } from './supabaseRestServer'

/** Absent or false preserves normal operation. Unknown configured values fail closed. */
export function isLuxorBookingDepositPaused() {
  const value = process.env.LUXOR_BOOKING_DEPOSIT_PAUSED
  if (value === undefined || value.trim().toLowerCase() === 'false') return false
  return true
}

export class LuxorBookingDepositPausedError extends Error {
  constructor() {
    super('Booking deposit payments are temporarily unavailable. Please contact Luxor before attempting payment.')
    this.name = 'LuxorBookingDepositPausedError'
  }
}

export function assertLuxorBookingDepositAvailable() {
  if (isLuxorBookingDepositPaused()) throw new LuxorBookingDepositPausedError()
}

/** Keep a durable, idempotent owner follow-up when signing finishes during a pause. */
export async function queuePausedDepositFollowUp(inquiryId: string | null, signatureId: string) {
  if (!inquiryId || !/^[0-9a-f-]{36}$/i.test(inquiryId) || !/^[0-9a-f-]{36}$/i.test(signatureId)) {
    throw new Error('The signed agreement needs an owner follow-up but its lead could not be verified.')
  }
  const hash = crypto.createHash('sha256').update(`luxor-paused-deposit-follow-up/v1/${signatureId}`).digest('hex')
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
  const title = 'Send booking payment link after maintenance'
  const rows = await supabaseRestStrict<Array<{ id: string; inquiry_id: string; title: string }>>('luxor_tasks?on_conflict=id&select=id,inquiry_id,title', {
    method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ id, inquiry_id: inquiryId, title, status: 'pending', priority: 'high',
      description: 'The agreement was signed while booking payments were paused. Once payments resume, review the date and send the client a secure booking payment link.' }),
  })
  const task = rows[0] || (await supabaseRestStrict<Array<{ id: string; inquiry_id: string; title: string }>>(`luxor_tasks?select=id,inquiry_id,title&id=eq.${id}&limit=1`))[0]
  if (!task || task.inquiry_id !== inquiryId || task.title !== title) throw new Error('The signed agreement owner follow-up could not be verified.')
}
