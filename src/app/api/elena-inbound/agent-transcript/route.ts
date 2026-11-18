import { after } from 'next/server'
import {
  authorizeElenaInboundAgentTranscriptRequest,
  runElenaInboundAgentTranscriptSideband,
} from '@/lib/luxorElenaInboundAgentTranscriptServer'
import { elenaLiveInboundReadyDetail } from '@/lib/luxorElenaInboundServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** 660s worker socket (ELENA_INBOUND_AGENT_TRANSCRIPT_WORKER_MAX_MS) + flush margin; Pro Fluid max 800. */
export const maxDuration = 800

const CALL_SID = /^CA[0-9a-f]{32}$/i
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,180}$/

export async function POST(request: Request) {
  const readiness = elenaLiveInboundReadyDetail()
  if (!readiness.ready) {
    console.warn('[Elena Inbound] Agent transcript worker rejected: live inbound not ready.', { reason: readiness.reason })
    return Response.json({ error: 'Live inbound is disabled or incomplete.' }, { status: 503 })
  }
  const claim = authorizeElenaInboundAgentTranscriptRequest(request)
  if (!claim) {
    console.warn('[Elena Inbound] Agent transcript worker rejected: unauthorized.')
    return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  }
  const raw = await request.text()
  if (raw.length > 2_000) {
    console.warn('[Elena Inbound] Agent transcript worker rejected: payload too large.', { callSid: claim.callSid })
    return Response.json({ error: 'Request too large.' }, { status: 413 })
  }
  let body: { callSid?: unknown; sessionId?: unknown }
  try { body = JSON.parse(raw) } catch {
    console.warn('[Elena Inbound] Agent transcript worker rejected: invalid JSON.', { callSid: claim.callSid })
    return Response.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const callSid = typeof body.callSid === 'string' ? body.callSid : claim.callSid
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : claim.sessionId
  if (callSid !== claim.callSid || sessionId !== claim.sessionId || !CALL_SID.test(callSid) || !SESSION_ID.test(sessionId)) {
    console.warn('[Elena Inbound] Agent transcript worker rejected: call binding mismatch.', { callSid, sessionId })
    return Response.json({ error: 'Call binding mismatch.' }, { status: 403 })
  }
  after(async () => {
    try {
      const result = await runElenaInboundAgentTranscriptSideband(callSid, sessionId)
      if (!result.started) {
        const payload = { callSid, reason: result.reason }
        if (result.reason === 'already_running') {
          console.info('[Elena Inbound] Agent transcript sideband already running.', payload)
        } else {
          console.warn('[Elena Inbound] Agent transcript sideband did not start.', payload)
        }
      }
    } catch (error) {
      console.warn('[Elena Inbound] Agent transcript sideband worker failed.', {
        callSid,
        message: error instanceof Error ? error.message : 'unknown',
      })
    }
  })
  return Response.json({ queued: true, callSid, sessionId }, { status: 202, headers: { 'Cache-Control': 'no-store' } })
}