import {
  createTwilioVoiceResponse,
  forbiddenTwimlResponse,
  readTwilioForm,
  twimlResponse,
  validateTwilioWebhook,
} from '@/lib/luxorTwilioServer'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const params = await readTwilioForm(request)
  if (!validateTwilioWebhook(request, params)) return forbiddenTwimlResponse()

  console.error('Twilio used the Luxor fallback URL:', {
    errorCode: params.ErrorCode || null,
    errorUrl: params.ErrorUrl || null,
    callSid: params.CallSid || null,
  })

  const response = createTwilioVoiceResponse()
  response.say({ voice: 'Polly.Joanna' }, 'The Luxor phone system is temporarily unavailable. Please try again shortly or visit luxor atlas palmas dot com.')
  response.hangup()
  return twimlResponse(response)
}

