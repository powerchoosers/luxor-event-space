import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getLuxorCallById, getLuxorTranscriptSegments } from '@/lib/luxorCallsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import type { LuxorCall } from '@/lib/luxorCallTypes'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  const { id } = await context.params
  const inquiryId = new URL(request.url).searchParams.get('inquiryId') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Call not found.' }, { status: 404 })
  const call = await getLuxorCallById(id)
  if (!call || call.inquiry_id !== inquiryId) return NextResponse.json({ error: 'Call not found for this lead.' }, { status: 404 })
  return NextResponse.json({ status: call.summary_status, summary: call.summary_text }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getLuxorPortalSession()
  if (!session) return NextResponse.json({ error: 'Portal login required.' }, { status: 401 })
  const { id } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Call not found.' }, { status: 404 })

  try {
    const body = await request.json() as { inquiryId?: unknown }
    const inquiryId = String(body.inquiryId || '')
    const call = await getLuxorCallById(id)
    if (!call || !inquiryId || call.inquiry_id !== inquiryId) return NextResponse.json({ error: 'Call not found for this lead.' }, { status: 404 })
    if (call.recording_consent_status !== 'consented') return NextResponse.json({ error: 'A summary is available only for calls recorded with caller consent.' }, { status: 409 })
    if (call.summary_status === 'completed' && call.summary_text) return NextResponse.json({ status: 'completed', summary: call.summary_text, cached: true })
    const segments = await getLuxorTranscriptSegments(call.id)
    if (call.transcription_status !== 'completed' || !segments.length) {
      return NextResponse.json({ error: 'The transcript is still being finalized.' }, { status: 409 })
    }

    if (call.summary_status === 'generating' && Date.now() - new Date(call.updated_at).getTime() > 10 * 60 * 1000) {
      await supabaseRest(`luxor_calls?id=eq.${encodeURIComponent(call.id)}&summary_status=eq.generating&updated_at=lt.${encodeURIComponent(new Date(Date.now() - 10 * 60 * 1000).toISOString())}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ summary_status: 'failed', updated_at: new Date().toISOString() }),
      })
    }

    const claimed = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(call.id)}&inquiry_id=eq.${encodeURIComponent(inquiryId)}&summary_status=in.(not_generated,failed)`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ summary_status: 'generating', summary_text: null, updated_at: new Date().toISOString() }),
    })
    if (!claimed.length) {
      const latest = await getLuxorCallById(id)
      return NextResponse.json({ status: latest?.summary_status || 'generating', summary: latest?.summary_text || null, cached: true }, { status: 202 })
    }

    const apiKey = process.env.OPEN_ROUTER_API_KEY
    if (!apiKey) throw new Error('OpenRouter is not configured.')
    const transcript = segments
      .map((segment) => {
        const customerTrack = segment.track === 'caller' || segment.track === 'customer'
          || (call.direction === 'inbound' ? segment.track === 'outbound_track' : segment.track === 'inbound_track')
        return `${customerTrack ? 'Caller' : 'Luxor'}: ${segment.segment_text}`
      })
      .join('\n')
      .slice(0, 60000)
    if (!transcript.trim()) throw new Error('The completed transcript is empty.')
    const transcriptFingerprint = createHash('sha256').update(JSON.stringify(segments.map((segment) => segment.id))).digest('hex')
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://www.luxoratlaspalmas.com', 'X-Title': 'Luxor Call Summary' },
      body: JSON.stringify({ model: 'openai/gpt-4.1-mini', temperature: 0.2, messages: [
        { role: 'system', content: 'Summarize a Luxor Event Space sales call in concise, factual bullets: event needs, preferences or concerns, commitments made, and next step. Use only the transcript. If a detail is unclear, say it is unclear. Do not invent facts.' },
        { role: 'user', content: transcript },
      ] }),
    })
    const payload = await response.json().catch(() => ({})) as { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string } }
    if (!response.ok) throw new Error(payload.error?.message || 'OpenRouter could not summarize this call.')
    const summary = String(payload.choices?.[0]?.message?.content || '').trim().slice(0, 6000)
    if (!summary) throw new Error('OpenRouter returned an empty summary.')
    const latestSegments = await getLuxorTranscriptSegments(call.id)
    const latestFingerprint = createHash('sha256').update(JSON.stringify(latestSegments.map((segment) => segment.id))).digest('hex')
    if (transcriptFingerprint !== latestFingerprint) {
      await supabaseRest(`luxor_calls?id=eq.${encodeURIComponent(call.id)}&summary_status=eq.generating`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ summary_status: 'not_generated', summary_text: null, summary_generated_at: null, updated_at: new Date().toISOString() }),
      })
      return NextResponse.json({ error: 'The transcript changed while this summary was being prepared. Select Summary again to refresh it.' }, { status: 409 })
    }
    const saved = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(call.id)}&summary_status=eq.generating`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ summary_status: 'completed', summary_text: summary, summary_generated_at: new Date().toISOString(), summary_model: 'openai/gpt-4.1-mini', updated_at: new Date().toISOString() }),
    })
    if (!saved.length) return NextResponse.json({ error: 'The call summary state changed before it was saved. Select Summary again.' }, { status: 409 })
    return NextResponse.json({ status: 'completed', summary, cached: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to summarize this call.'
    await supabaseRest(`luxor_calls?id=eq.${encodeURIComponent(id)}&summary_status=eq.generating`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ summary_status: 'failed', updated_at: new Date().toISOString() }),
    }).catch(() => undefined)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
