import {
  ELENA_INBOUND_AGENT_TRANSCRIPT_WORKER_MAX_MS,
  authorizeElenaInboundAgentTranscriptRequest,
  runElenaInboundAgentTranscriptSideband,
} from '@/lib/luxorElenaInboundAgentTranscriptServer'
import { elenaLiveInboundReady } from '@/lib/luxorElenaInboundServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = Math.ceil(ELENA_INBOUND_AGENT_TRANSCRIPT_WORKER_MAX_MS / 1000) + 90

const CALL_SID = /^CA[0-9a-f]{32}$/i
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{1,180}$/

export async function POST(request: Request) {
  if (!elenaLiveInboundReady()) return Response.json({ error: 'Live inbound is disabled or incomplete.' }, { status: 503 })
  const claim = authorizeElenaInboundAgentTranscriptRequest(request)
  if (!claim) return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  const raw = await request.text()
  if (raw.length > 2_000) return Response.json({ error: 'Request too large.' }, { status: 413 })
  let body: { callSid?: unknown; sessionId?: unknown }
  try { body = JSON.parse(raw) } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }) }
  const callSid = typeof body.callSid === 'string' ? body.callSid : claim.callSid
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : claim.sessionId
  if (callSid !== claim.callSid || sessionId !== claim.sessionId || !CALL_SID.test(callSid) || !SESSION_ID.test(sessionId)) return Response.json({ error: 'Call binding mismatch.' }, { status: 403 })
  try {
    const result = await runElenaInboundAgentTranscriptSideband(callSid, sessionId)
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Agent transcript capture failed.' }, { status: 503 })
  }
}