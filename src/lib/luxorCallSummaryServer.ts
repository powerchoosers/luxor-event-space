import 'server-only'

import { createHash } from 'node:crypto'
import { canProcessLuxorRecording, getLuxorCallBySid, getLuxorTranscriptSegments } from './luxorCallsServer'
import { luxorTranscriptSpeaker, type LuxorCall } from './luxorCallTypes'
import { supabaseRest } from './supabaseRestServer'

function callContextLines(call: LuxorCall) {
  const capture = call.metadata?.inbound_capture as Record<string, unknown> | undefined
  const receipt = call.metadata?.lead_update_receipt as Record<string, unknown> | undefined
  const lines: string[] = []
  if (capture?.event_type) lines.push(`Event type (saved): ${capture.event_type}`)
  if (capture?.target_date) lines.push(`Target date (saved): ${capture.target_date}`)
  if (capture?.guest_count) lines.push(`Guests (saved): ${capture.guest_count}`)
  if (call.contact_name) lines.push(`Contact: ${call.contact_name}`)
  if (call.notes) lines.push(`Call notes: ${call.notes}`)
  if (receipt?.saved_at) lines.push('Lead update was saved during the call.')
  return lines
}

async function buildTranscriptBlock(call: LuxorCall) {
  const segments = await getLuxorTranscriptSegments(call.id)
  if (!segments.length) return { text: '', fingerprint: '', partial: true }
  const text = segments
    .map((segment) => {
      const speaker = luxorTranscriptSpeaker(segment.track)
      return `${speaker === 'caller' ? 'Caller' : speaker === 'luxor' ? 'Luxor' : 'Speaker'}: ${segment.segment_text}`
    })
    .join('\n')
    .slice(0, 60_000)
  const fingerprint = createHash('sha256').update(JSON.stringify(segments.map((segment) => segment.id))).digest('hex')
  const partial = call.transcription_status !== 'completed'
  return { text, fingerprint, partial }
}

/** Generate a summary at call end even when the transcript is still partial or short. */
export async function generateLuxorCallSummaryForCall(callSid: string, options: { allowPartialTranscript?: boolean } = {}) {
  const call = await getLuxorCallBySid(callSid)
  if (!call || !canProcessLuxorRecording(call)) return { status: 'skipped' as const, reason: 'recording_not_allowed' }
  if (call.summary_status === 'completed' && call.summary_text) return { status: 'duplicate' as const }

  const claimed = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(call.id)}&summary_status=in.(not_generated,failed)`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ summary_status: 'generating', summary_text: null, updated_at: new Date().toISOString() }),
  })
  if (!claimed.length) return { status: 'duplicate' as const }

  const active = claimed[0]
  const context = callContextLines(active)
  const transcript = await buildTranscriptBlock(active)
  if (!transcript.text.trim() && !context.length && !options.allowPartialTranscript) {
    await supabaseRest(`luxor_calls?id=eq.${encodeURIComponent(active.id)}&summary_status=eq.generating`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ summary_status: 'not_generated', updated_at: new Date().toISOString() }),
    })
    return { status: 'deferred' as const, reason: 'no_content' }
  }

  const apiKey = process.env.OPEN_ROUTER_API_KEY
  if (!apiKey) {
    await supabaseRest(`luxor_calls?id=eq.${encodeURIComponent(active.id)}&summary_status=eq.generating`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ summary_status: 'failed', updated_at: new Date().toISOString() }),
    })
    return { status: 'failed' as const, reason: 'openrouter_missing' }
  }

  const content = [
    context.length ? `Saved call context:\n${context.join('\n')}` : '',
    transcript.text.trim() ? `${transcript.partial ? 'Partial transcript' : 'Transcript'}:\n${transcript.text}` : '',
  ].filter(Boolean).join('\n\n').slice(0, 60_000)

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://www.luxoratlaspalmas.com',
        'X-Title': 'Luxor Call Summary',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4.1-mini',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: 'Summarize a Luxor Event Space phone call in concise factual bullets: who called, event type and date if known, guest count, what they wanted, what Elena committed to, and the next step. Prefer saved lead fields over transcript wording when they disagree. If the transcript is partial, say so briefly. Do not invent prices, availability, or facts.',
          },
          { role: 'user', content: content || 'No transcript yet. Summarize only from the saved call context.' },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    })
    const payload = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string } }
    if (!response.ok) throw new Error(payload.error?.message || 'Summary request failed.')
    const summary = String(payload.choices?.[0]?.message?.content || '').trim().slice(0, 6000)
    if (!summary) throw new Error('Empty summary response.')

    await supabaseRest<LuxorCall[]>(`luxor_calls?select=id&summary_status=eq.generating&id=eq.${encodeURIComponent(active.id)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        summary_status: 'completed',
        summary_text: summary,
        summary_generated_at: new Date().toISOString(),
        summary_model: 'openai/gpt-4.1-mini',
        updated_at: new Date().toISOString(),
      }),
    })
    return { status: 'completed' as const }
  } catch {
    await supabaseRest(`luxor_calls?id=eq.${encodeURIComponent(active.id)}&summary_status=eq.generating`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ summary_status: 'failed', updated_at: new Date().toISOString() }),
    }).catch(() => undefined)
    return { status: 'failed' as const }
  }
}