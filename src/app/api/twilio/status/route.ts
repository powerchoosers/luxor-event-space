import { NextResponse } from 'next/server'
import { updateLuxorCallStatus } from '@/lib/luxorCallsServer'
import {
  normalizeTwilioCallStatus,
  parseTwilioInteger,
  readTwilioForm,
  validateTwilioWebhook,
} from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) {
    return NextResponse.json({ error: 'Invalid Twilio signature.' }, { status: 403 })
  }

  const url = new URL(request.url)
  const recordCallSid = url.searchParams.get('recordCallSid') || params.ParentCallSid || params.CallSid

  try {
    await updateLuxorCallStatus(recordCallSid, {
      status: normalizeTwilioCallStatus(params.CallStatus),
      childCallSid: params.CallSid,
      durationSeconds: parseTwilioInteger(params.CallDuration),
      sequenceNumber: parseTwilioInteger(params.SequenceNumber),
      metadata: {
        callback_source: params.CallbackSource || null,
        sip_response_code: params.SipResponseCode || null,
        stir_status: params.StirStatus || null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Luxor Twilio status update failed:', error)
    return NextResponse.json({ error: 'Unable to update call status.' }, { status: 500 })
  }
}

