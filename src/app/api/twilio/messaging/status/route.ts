import { NextRequest, NextResponse } from 'next/server'
import { readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'
import { updateLuxorMessageStatus } from '@/lib/luxorMessagesServer'
import type { LuxorMessageStatus } from '@/lib/luxorMessageTypes'

export const runtime = 'nodejs'
export async function POST(request: NextRequest) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return NextResponse.json({ error: 'Invalid Twilio signature.' }, { status: 403 })
  const status = params.MessageStatus as LuxorMessageStatus
  if (params.MessageSid && ['accepted', 'queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed', 'received'].includes(status)) await updateLuxorMessageStatus(params.MessageSid, status, params.ErrorCode || null, params.ErrorMessage || null)
  return NextResponse.json({ ok: true })
}
