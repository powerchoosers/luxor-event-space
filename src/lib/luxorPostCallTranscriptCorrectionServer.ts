import 'server-only'

import { decodeStereoMp3, sliceChannelToWav } from './luxorDualChannelAudio'
import { luxorDualChannelIndexForStorageTrack, type LuxorCall } from './luxorCallTypes'
import { getLuxorCallBySid, getLuxorTranscriptSegments } from './luxorCallsServer'
import { supabaseRest } from './supabaseRestServer'

export const LUXOR_POST_CALL_TRANSCRIBE_MODEL_DEFAULT = 'gpt-transcribe'

export const LUXOR_POST_CALL_TRANSCRIPT_KEYWORDS = [
  'Luxor',
  'Las Palmas',
  'Luxor at Las Palmas',
  'quinceañera',
  'quince',
  'Signature Package',
  'Luxor Package',
  'Essentials Package',
  'luxoratlaspalmas.com',
] as const

export function postCallTranscriptCorrectionEnabled() {
  return process.env.LUXOR_POST_CALL_TRANSCRIPT_CORRECTION === '1'
}

export function luxorPostCallTranscriptionPrompt() {
  return 'Luxor at Las Palmas event venue phone call. Vocabulary: Luxor, Las Palmas, Luxor at Las Palmas, quinceañera, quince, Signature Package, Luxor Package, Essentials Package, luxoratlaspalmas.com. Multilingual English and Spanish.'
}

export function countWords(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

export function isFillerTranscript(text: string) {
  const trimmed = text.trim().toLowerCase()
  if (!trimmed) return true
  return /^(um+|uh+|hmm+|m+h*m*|\.{1,3}|,+|\[inaudible\]|\(inaudible\))$/.test(trimmed)
}

export function shouldKeepTwilioTranscript(input: {
  clipDurationSeconds: number
  twilioText: string
  candidateText: string | null
  hadApiError: boolean
}) {
  if (input.hadApiError) return true
  if (input.clipDurationSeconds < 1) return true
  if (!input.candidateText || isFillerTranscript(input.candidateText)) return true
  const twilioWords = countWords(input.twilioText)
  const candidateWords = countWords(input.candidateText)
  if (twilioWords === 0) return candidateWords === 0
  const ratio = candidateWords / twilioWords
  if (ratio < 0.4 || ratio > 2.5) return true
  return false
}

type OrderedSegment = {
  id: string
  track: string
  segment_text: string
  english_text: string | null
  spoken_languages: string[]
  translation_status: string
  event_timestamp: string | null
  segment_start_seconds: number | null
}

export function segmentClipWindow(
  ordered: OrderedSegment[],
  index: number,
  recordingDurationSeconds: number | null,
  padSeconds = 0.3,
) {
  const startBase = ordered[index].segment_start_seconds
  if (startBase == null || !Number.isFinite(startBase)) return null
  let endBase = recordingDurationSeconds ?? startBase + 6
  for (let j = index + 1; j < ordered.length; j += 1) {
    const next = ordered[j].segment_start_seconds
    if (next != null && Number.isFinite(next) && next > startBase) {
      endBase = next
      break
    }
  }
  const start = Math.max(0, startBase - padSeconds)
  const end = Math.max(start + 0.05, endBase + padSeconds)
  return { start, end, duration: end - start }
}

export function buildCorrectedSnapshotSegments(
  ordered: OrderedSegment[],
  corrections: Map<string, string>,
) {
  return ordered.map((row) => {
    const twilioText = row.segment_text
    const corrected = corrections.get(row.id)
    const display = row.english_text || twilioText
    return {
      id: row.id,
      text: corrected ?? display,
      originalText: twilioText,
      spokenLanguages: row.spoken_languages || [],
      translationStatus: row.translation_status,
      track: row.track,
      timestamp: row.event_timestamp || '',
      final: true as const,
      startSeconds: row.segment_start_seconds,
    }
  })
}

async function downloadLuxorCallRecording(path: string): Promise<ArrayBuffer> {
  const configUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!configUrl || !serviceKey) throw new Error('Recording storage is not configured.')
  const encodedPath = path.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${configUrl.replace(/\/$/, '')}/storage/v1/object/luxor-call-recordings/${encodedPath}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Recording download failed (${response.status}).`)
  return response.arrayBuffer()
}

async function transcribeOpenAiClip(wav: Buffer, model: string): Promise<{ text: string | null; error: boolean }> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return { text: null, error: true }
  const form = new FormData()
  form.append('file', new Blob([Uint8Array.from(wav)], { type: 'audio/wav' }), 'clip.wav')
  form.append('model', model)
  form.append('response_format', 'json')
  // Documented on POST /v1/audio/transcriptions for gpt-transcribe:
  // https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create
  form.append('prompt', luxorPostCallTranscriptionPrompt())
  for (const keyword of LUXOR_POST_CALL_TRANSCRIPT_KEYWORDS) form.append('keywords[]', keyword)
  form.append('languages[]', 'en')
  form.append('languages[]', 'es')
  try {
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
      cache: 'no-store',
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      console.warn('[Luxor] Post-call clip transcription failed', {
        status: response.status,
        body: body.slice(0, 500),
      })
      return { text: null, error: true }
    }
    const payload = await response.json() as { text?: unknown }
    const text = typeof payload.text === 'string' ? payload.text.trim().slice(0, 4000) : ''
    return { text: text || null, error: false }
  } catch (error) {
    console.warn('[Luxor] Post-call clip transcription failed', {
      status: 'network',
      body: error instanceof Error ? error.message.slice(0, 500) : 'request_failed',
    })
    return { text: null, error: true }
  }
}

async function runPool<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) break
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

type PostCallMeta = {
  status: 'processing' | 'completed' | 'failed' | 'skipped'
  model?: string
  at?: string
  corrected_count?: number
  kept_count?: number
  error_count?: number
  error?: string
}

function readPostCallMeta(call: LuxorCall): PostCallMeta | undefined {
  const raw = call.metadata?.post_call_transcript
  return raw && typeof raw === 'object' ? raw as PostCallMeta : undefined
}

async function claimPostCallCorrection(call: LuxorCall, model: string) {
  const existing = readPostCallMeta(call)
  if (existing?.status === 'completed') return null
  if (existing?.status === 'processing') {
    const at = Date.parse(String(existing.at || ''))
    if (Number.isFinite(at) && Date.now() - at < 15 * 60_000) return null
  }
  const at = new Date().toISOString()
  const [claimed] = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(call.id)}&updated_at=eq.${encodeURIComponent(call.updated_at)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      updated_at: new Date().toISOString(),
      metadata: {
        ...call.metadata,
        post_call_transcript: { status: 'processing', model, at },
      },
    }),
  })
  return claimed ?? null
}

export async function runLuxorPostCallTranscriptCorrection(callSid: string) {
  if (!postCallTranscriptCorrectionEnabled()) return { status: 'skipped' as const, reason: 'disabled' }

  let call = await getLuxorCallBySid(callSid)
  if (!call?.recording_storage_path) return { status: 'skipped' as const, reason: 'no_recording' }
  if (call.metadata?.transcript_manually_corrected === true) return { status: 'skipped' as const, reason: 'manual_correction' }
  if (call.metadata?.transcript_source === 'post_call') return { status: 'skipped' as const, reason: 'already_applied' }

  const model = (process.env.LUXOR_POST_CALL_TRANSCRIBE_MODEL || LUXOR_POST_CALL_TRANSCRIBE_MODEL_DEFAULT).trim()
  const maxSegments = Math.min(200, Math.max(1, Number.parseInt(process.env.LUXOR_POST_CALL_TRANSCRIPT_MAX_SEGMENTS || '96', 10) || 96))
  const concurrency = 4

  const claimed = await claimPostCallCorrection(call, model)
  if (!claimed) return { status: 'skipped' as const, reason: 'not_claimed' }
  call = claimed

  try {
    const ordered = await getLuxorTranscriptSegments(call.id)
    if (!ordered.length) {
      await patchPostCallMeta(callSid, { status: 'skipped', model, at: new Date().toISOString(), corrected_count: 0, kept_count: 0, error_count: 0 })
      return { status: 'skipped' as const, reason: 'no_segments' }
    }
    const work = ordered.slice(0, maxSegments)
    const storagePath = call.recording_storage_path
    if (!storagePath) {
      await patchPostCallMeta(callSid, { status: 'skipped', model, at: new Date().toISOString(), corrected_count: 0, kept_count: 0, error_count: 0, error: 'no_storage_path' })
      return { status: 'skipped' as const, reason: 'no_recording' }
    }
    const audioBuffer = await downloadLuxorCallRecording(storagePath)
    const decoded = await decodeStereoMp3(audioBuffer)
    const recordingDuration = call.recording_duration_seconds ?? decoded.durationSeconds
    const corrections = new Map<string, string>()
    let correctedCount = 0
    let keptCount = 0
    let errorCount = 0

    await runPool(work, concurrency, async (row, workIndex) => {
      const window = segmentClipWindow(ordered, workIndex, recordingDuration)
      const twilioText = row.segment_text
      if (!window) {
        keptCount += 1
        return
      }
      const channel = luxorDualChannelIndexForStorageTrack(row.track, call!.metadata)
      const wav = sliceChannelToWav(decoded, channel, window.start, window.end)
      const { text, error } = await transcribeOpenAiClip(wav, model)
      if (error) errorCount += 1
      const keep = shouldKeepTwilioTranscript({
        clipDurationSeconds: window.duration,
        twilioText,
        candidateText: text,
        hadApiError: error,
      })
      if (keep) {
        keptCount += 1
        return
      }
      corrections.set(row.id, text!)
      correctedCount += 1
    })

    const transcript_segments = buildCorrectedSnapshotSegments(ordered, corrections)

    const refreshed = await getLuxorCallBySid(callSid)
    if (!refreshed || refreshed.metadata?.transcript_manually_corrected === true) {
      return { status: 'skipped' as const, reason: 'manual_correction' }
    }

    const [saved] = await supabaseRest<LuxorCall[]>(`luxor_calls?select=*&id=eq.${encodeURIComponent(refreshed.id)}&metadata->post_call_transcript->>status=eq.processing`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        transcript_segments,
        updated_at: new Date().toISOString(),
        metadata: {
          ...refreshed.metadata,
          transcript_source: 'post_call',
          post_call_transcript: {
            status: 'completed',
            model,
            at: new Date().toISOString(),
            corrected_count: correctedCount,
            kept_count: keptCount,
            error_count: errorCount,
          },
        },
        ...(correctedCount > 0 && refreshed.summary_status === 'completed'
          ? { summary_status: 'not_generated', summary_text: null, summary_generated_at: null }
          : {}),
      }),
    })
    if (!saved) throw new Error('Post-call transcript snapshot could not be saved.')
    return { status: 'completed' as const, correctedCount, keptCount, errorCount }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'post_call_transcript_failed'
    console.error('[Luxor] Post-call transcript correction failed:', message)
    await patchPostCallMeta(callSid, {
      status: 'failed',
      model,
      at: new Date().toISOString(),
      error: message.slice(0, 500),
    })
    return { status: 'failed' as const, error: message }
  }
}

async function patchPostCallMeta(callSid: string, meta: PostCallMeta) {
  const latest = await getLuxorCallBySid(callSid)
  if (!latest) return
  await supabaseRest(`luxor_calls?id=eq.${encodeURIComponent(latest.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      updated_at: new Date().toISOString(),
      metadata: {
        ...latest.metadata,
        post_call_transcript: meta,
      },
    }),
  })
}