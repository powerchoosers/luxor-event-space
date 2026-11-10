import { NextResponse } from 'next/server'
import { ELENA_TEST_VOICES, requireElenaVoiceManager } from '@/lib/luxorElenaVoiceSandboxServer'
import { getPublicLuxorPhoneNumber, listOwnedLuxorNumbers } from '@/lib/luxorPhoneNumbersServer'
import { listAvailableLuxorTourSlots } from '@/lib/luxorTourSlotsServer'
import { getElenaPromptContext } from '@/lib/luxorElenaServer'
import { getLuxorAiPricingContext } from '@/lib/luxorAiPricingContextServer'
import { getElenaPhoneTestVoice, saveElenaPhoneTestVoice } from '@/lib/luxorElenaVoiceTestSettingsServer'
import { getElenaPhoneTestStatus } from '@/lib/luxorElenaPhoneTestServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireElenaVoiceManager()
  if (auth.error) return auth.error
  try {
    const [publicNumber, numbers, availability, knowledge, pricing, phoneVoice, phoneStatus] = await Promise.all([
      getPublicLuxorPhoneNumber(), listOwnedLuxorNumbers(),
      listAvailableLuxorTourSlots().then((slots) => ({ slots, available: true })).catch(() => ({ slots: [], available: false })),
      getElenaPromptContext('published').then((context) => context.knowledge.length > 0).catch(() => false),
      getLuxorAiPricingContext().then((context) => !context.includes('CONTEXT: unavailable')).catch(() => false),
      getElenaPhoneTestVoice().catch(() => null),
      getElenaPhoneTestStatus(),
    ])
    return NextResponse.json({
      voices: ELENA_TEST_VOICES, defaultVoice: 'marin', model: 'gpt-live-1', publicNumber,
      numbers: numbers.map(({ phoneNumber, friendlyName, isActive, isPublic, voiceUrl }) => ({ phoneNumber, friendlyName, isActive, isPublic, voiceUrl })),
      phoneTest: { ...phoneStatus, voice: phoneVoice, phoneNumber: '+18176630380' },
      context: { venue: true, pricing, knowledge, availability: availability.available }, slots: availability.slots,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Voice test settings could not load. Check the phone and venue connections.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function PATCH(request: Request) {
  const auth = await requireElenaVoiceManager()
  if (auth.error) return auth.error
  try {
    const raw = await request.text()
    if (raw.length > 1000) return NextResponse.json({ error: 'Voice setting request is too large.' }, { status: 413 })
    const body = JSON.parse(raw) as { voice?: unknown }
    if (typeof body.voice !== 'string' || !ELENA_TEST_VOICES.includes(body.voice)) return NextResponse.json({ error: 'Choose a supported voice.' }, { status: 400 })
    const voice = await saveElenaPhoneTestVoice(body.voice, auth.session.email)
    return NextResponse.json({ voice, appliesTo: 'next_phone_call' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof SyntaxError ? 'Invalid voice setting.' : 'The phone voice could not be saved. Try again.' }, { status: error instanceof SyntaxError ? 400 : 503 })
  }
}
