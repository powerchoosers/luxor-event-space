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

  const response = createTwilioVoiceResponse()
  response.say({ voice: 'Polly.Joanna' }, 'Thank you. Your message has been received. The Luxor team will call you back soon.')
  response.hangup()
  return twimlResponse(response)
}

