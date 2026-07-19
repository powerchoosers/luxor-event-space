import { NextRequest } from 'next/server'
import { readTwilioForm, validateTwilioWebhook } from '@/lib/luxorTwilioServer'
import { saveInboundLuxorMessage } from '@/lib/luxorMessagesServer'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return new Response('<Response/>', { status: 403, headers: { 'Content-Type': 'text/xml' } })
  const mediaUrls = Array.from({ length: Number.parseInt(params.NumMedia || '0', 10) || 0 }, (_, index) => params[`MediaUrl${index}`]).filter((url): url is string => Boolean(url))
  await saveInboundLuxorMessage({ sid: params.MessageSid, from: params.From, to: params.To, body: params.Body || '', mediaUrls })
  return new Response('<Response/>', { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}
