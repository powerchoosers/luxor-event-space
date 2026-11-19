import 'server-only'

import WebSocket from 'ws'
import { ELENA_LIVE_CLAIM_MAX_SECONDS, getElenaLiveConfig, signElenaLiveClaim, verifyElenaLiveClaim } from './luxorElenaInboundServer'
import { createElenaInboundAgentTranscriptTurnCollector } from './luxorElenaInboundAgentTranscriptTurns'
import {
  ELENA_LIVE_AGENT_TRANSCRIPTION_SID,
  maxElenaModelTranscriptSequenceForCallSid,
  saveLuxorElenaAgentTranscriptSegment,
} from './luxorCallsServer'
import { agentTranscriptSidebandClaimQuerySuffix, resolveElenaInboundAgentTranscriptWorkerOrigin } from './luxorElenaInboundAgentTranscriptClaim'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'

export const ELENA_INBOUND_AGENT_TRANSCRIPT_WORKER_ORIGIN =
  resolveElenaInboundAgentTranscriptWorkerOrigin(process.env.NEXT_PUBLIC_SITE_URL)
const CALL_SID = /^CA[0-9a-f]{32}$/i
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,180}$/
const TERMINAL = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled'])
/** Stay under the Vercel function wall (~13 min) while leaving time to flush the last turn. */
export const ELENA_INBOUND_AGENT_TRANSCRIPT_WORKER_MAX_MS = 11 * 60_000
export const ELENA_INBOUND_AGENT_TRANSCRIPT_STALE_RUNNING_MS = ELENA_INBOUND_AGENT_TRANSCRIPT_WORKER_MAX_MS + 2 * 60_000

type LiveCall = { id: string; twilio_call_sid: string; status: string; metadata: Record<string, unknown>; updated_at: string }

type SidebandFinishStatus = 'completed' | 'failed' | 'partial'

function parseLiveEvent(raw: string): Record<string, unknown> | null {
  try {
    const event = JSON.parse(raw) as Record<string, unknown>
    return event && typeof event === 'object' && !Array.isArray(event) ? event : null
  } catch {
    return null
  }
}

function sidebandStartedAt(metadata: Record<string, unknown>) {
  const value = metadata.agent_transcript_sideband_started_at
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : Number.NaN
}

function isStaleRunningSideband(metadata: Record<string, unknown>) {
  return metadata.agent_transcript_sideband === 'running'
    && Number.isFinite(sidebandStartedAt(metadata))
    && Date.now() - sidebandStartedAt(metadata) > ELENA_INBOUND_AGENT_TRANSCRIPT_STALE_RUNNING_MS
}

async function readBoundLiveCall(callSid: string, sessionId: string) {
  const [row] = await supabaseRestStrict<LiveCall[]>(`luxor_calls?select=id,twilio_call_sid,status,metadata,updated_at&twilio_call_sid=eq.${encodeURIComponent(callSid)}&metadata->>scope=eq.elena_live_inbound&limit=1`)
  if (!row || row.metadata.openai_session_id !== sessionId || row.metadata.rehearsal_only !== false) return null
  return row
}

async function claimAgentTranscriptSideband(row: LiveCall, sessionId: string) {
  const status = row.metadata.agent_transcript_sideband
  if (status === 'completed') return 'already_completed'
  if (status === 'running' && !isStaleRunningSideband(row.metadata)) return 'already_running'
  const startedAt = new Date().toISOString()
  const claimable = isStaleRunningSideband(row.metadata) ? '' : agentTranscriptSidebandClaimQuerySuffix()
  let claimed: LiveCall[] | undefined
  try {
    claimed = await supabaseRestStrict<LiveCall[]>(`luxor_calls?twilio_call_sid=eq.${encodeURIComponent(row.twilio_call_sid)}&metadata->>scope=eq.elena_live_inbound&updated_at=eq.${encodeURIComponent(row.updated_at)}${claimable}&select=id,twilio_call_sid,status,metadata,updated_at`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        metadata: {
          ...row.metadata,
          agent_transcript_sideband: 'running',
          agent_transcript_sideband_started_at: startedAt,
          agent_transcript_session_id: sessionId,
          agent_transcript_sid: ELENA_LIVE_AGENT_TRANSCRIPTION_SID,
        },
        updated_at: new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString(),
      }),
    })
  } catch (error) {
    const message = error instanceof SupabaseRestError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'unknown'
    console.warn('[Elena Inbound] Agent transcript sideband claim failed.', {
      callSid: row.twilio_call_sid,
      message,
      status: error instanceof SupabaseRestError ? error.status : undefined,
    })
    return 'claim_error'
  }
  return claimed?.[0] ? 'claimed' : 'lost_claim'
}

async function finishAgentTranscriptSideband(callSid: string, sessionId: string, status: SidebandFinishStatus) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = await readBoundLiveCall(callSid, sessionId)
    if (!row) return
    const updated = await supabaseRestStrict<LiveCall[]>(`luxor_calls?twilio_call_sid=eq.${encodeURIComponent(callSid)}&metadata->>scope=eq.elena_live_inbound&updated_at=eq.${encodeURIComponent(row.updated_at)}&select=twilio_call_sid`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ metadata: { ...row.metadata, agent_transcript_sideband: status }, updated_at: new Date(Math.max(Date.now(), Date.parse(row.updated_at) + 1)).toISOString() }),
    })
    if (updated.length) return
  }
}

export async function runElenaInboundAgentTranscriptSideband(callSid: string, sessionId: string) {
  if (!CALL_SID.test(callSid) || !SESSION_ID.test(sessionId)) throw new Error('Invalid live transcript capture request.')
  const row = await readBoundLiveCall(callSid, sessionId)
  if (!row) return { started: false, reason: 'call_unavailable' }
  const claim = await claimAgentTranscriptSideband(row, sessionId)
  if (claim !== 'claimed') return { started: false, reason: claim }

  const config = getElenaLiveConfig()
  const startedAt = Date.now()
  let closed = false
  let finishStatus: SidebandFinishStatus = 'completed'
  let modelSequence = await maxElenaModelTranscriptSequenceForCallSid(callSid)
  const collector = createElenaInboundAgentTranscriptTurnCollector()
  let persistChain = Promise.resolve()

  const enqueueAgentTurn = (turn: { text: string; startMs: number | null; endMs: number | null; turnKey: string }) => {
    persistChain = persistChain.then(async () => {
      const maxSeq = await maxElenaModelTranscriptSequenceForCallSid(callSid)
      modelSequence = Math.max(modelSequence, maxSeq)
      const sequenceId = modelSequence + 1
      const saved = await saveLuxorElenaAgentTranscriptSegment({
        callSid,
        sessionId,
        text: turn.text,
        startMs: turn.startMs,
        endMs: turn.endMs,
        sequenceId,
        turnKey: turn.turnKey,
      })
      if (saved) modelSequence = sequenceId
    }).catch(() => console.warn('[Elena Inbound] Agent transcript turn could not be saved.'))
  }

  await new Promise<void>((resolve) => {
    const socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/attach`, {
      headers: { Authorization: `Bearer ${config.apiKey}`, 'OpenAI-Project': config.projectId },
      handshakeTimeout: 10_000,
    })
    const deadline = setTimeout(() => finish('partial'), ELENA_INBOUND_AGENT_TRANSCRIPT_WORKER_MAX_MS)

    const finish = (status: SidebandFinishStatus) => {
      if (closed) return
      closed = true
      finishStatus = status
      clearTimeout(deadline)
      const pending = collector.drainPartial()
      if (pending) enqueueAgentTurn(pending)
      void persistChain.finally(() => {
        socket.removeAllListeners()
        if (socket.readyState === WebSocket.OPEN) socket.close()
        else socket.terminate()
        void finishAgentTranscriptSideband(callSid, sessionId, finishStatus).finally(resolve)
      })
    }

    const pollTerminalCall = () => {
      readBoundLiveCall(callSid, sessionId).then((latest) => {
        if (latest && TERMINAL.has(latest.status)) finish('completed')
      }).catch(() => undefined)
    }

    socket.on('message', (bytes) => {
      const event = parseLiveEvent(bytes.toString())
      if (!event) return
      for (const turn of collector.ingest(event)) enqueueAgentTurn(turn)
      if (event.type === 'session.closed') finish('completed')
      if (Date.now() - startedAt > 5_000) pollTerminalCall()
    })
    socket.on('unexpected-response', (_req, response) => {
      console.warn('[Elena Inbound] Agent transcript sideband attach failed.', { callSid, statusCode: response.statusCode })
      response.resume()
      finish('failed')
    })
    socket.on('error', () => {
      console.warn('[Elena Inbound] Agent transcript sideband socket error.', { callSid })
      finish('failed')
    })
    socket.on('close', () => { if (!closed) finish(finishStatus) })
  })

  return { started: true, reason: finishStatus }
}

/** Starts a dedicated worker route that can outlive the signed OpenAI webhook. */
export function triggerElenaInboundAgentTranscriptSideband(callSid: string, sessionId: string) {
  if (!CALL_SID.test(callSid) || !SESSION_ID.test(sessionId)) return
  const secret = process.env.OPENAI_VOICE_WEBHOOK_SECRET || ''
  if (secret.length < 32) return
  const token = signElenaLiveClaim({ kind: 'call', callSid, sessionId, exp: Math.floor(Date.now() / 1000) + ELENA_LIVE_CLAIM_MAX_SECONDS }, secret)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
  const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()
  if (protectionBypass) headers['x-vercel-protection-bypass'] = protectionBypass
  void fetch(`${ELENA_INBOUND_AGENT_TRANSCRIPT_WORKER_ORIGIN}/api/elena-inbound/agent-transcript`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ callSid, sessionId }),
    cache: 'no-store',
  }).then(async (response) => {
    if (!response.ok) {
      const bodyPreview = (await response.text()).slice(0, 240)
      console.warn('[Elena Inbound] Agent transcript worker request failed.', {
        callSid,
        status: response.status,
        vercelError: response.headers.get('x-vercel-error'),
        bodyPreview,
      })
    }
  }).catch((error) => {
    console.warn('[Elena Inbound] Agent transcript worker could not be requested.', {
      callSid,
      message: error instanceof Error ? error.message : 'unknown',
    })
  })
}

export function authorizeElenaInboundAgentTranscriptRequest(request: Request) {
  const secret = process.env.OPENAI_VOICE_WEBHOOK_SECRET || ''
  const claim = verifyElenaLiveClaim((request.headers.get('authorization') || '').replace(/^Bearer /i, ''), secret)
  return claim?.kind === 'call' ? claim : null
}