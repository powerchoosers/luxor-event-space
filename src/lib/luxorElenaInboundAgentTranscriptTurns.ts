import {
  isResponseTurnFinished,
  isSessionOutputAudioBufferStopped,
  responseTurnKey,
} from './luxorElenaInboundAgentTranscriptEvents'

export type ElenaAgentOutputBuffer = {
  text: string
  startMs: number | null
  endMs: number | null
  eventIds: Set<string>
}

export type ElenaAgentTurnReady = {
  text: string
  startMs: number | null
  endMs: number | null
  turnKey: string
}

function emptyBuffer(): ElenaAgentOutputBuffer {
  return { text: '', startMs: null, endMs: null, eventIds: new Set() }
}

function appendDelta(
  buffer: ElenaAgentOutputBuffer,
  delta: string,
  startMs?: unknown,
  endMs?: unknown,
  eventId?: unknown,
) {
  if (!delta) return
  if (typeof eventId === 'string' && eventId) {
    if (buffer.eventIds.has(eventId)) return
    buffer.eventIds.add(eventId)
  }
  buffer.text += delta
  if (typeof startMs === 'number' && Number.isFinite(startMs)) {
    buffer.startMs = buffer.startMs == null ? startMs : Math.min(buffer.startMs, startMs)
  }
  if (typeof endMs === 'number' && Number.isFinite(endMs)) {
    buffer.endMs = Math.max(buffer.endMs ?? endMs, endMs)
  }
}

function nestedResponseEvent(event: Record<string, unknown>) {
  if (event.type !== 'response.event') return null
  const nested = event.event
  return nested && typeof nested === 'object' && !Array.isArray(nested) ? nested as Record<string, unknown> : null
}

function agentTurnKey(responseId: string | null, buffer: ElenaAgentOutputBuffer) {
  if (responseId) return `agent-turn:${responseId}`
  const start = buffer.startMs == null ? 'x' : String(Math.round(buffer.startMs))
  const end = buffer.endMs == null ? 'x' : String(Math.round(buffer.endMs))
  const digest = buffer.text.trim().slice(0, 64)
  return `agent-turn:spoken:${start}:${end}:${digest}`
}

function resolveResponseId(parent: Record<string, unknown>, nested: Record<string, unknown> | null) {
  return responseTurnKey(parent, nested)
}

export type ElenaInboundAgentTranscriptTurnCollector = {
  ingest: (event: Record<string, unknown>) => ElenaAgentTurnReady[]
  drainPartial: () => ElenaAgentTurnReady | null
}

export function createElenaInboundAgentTranscriptTurnCollector(): ElenaInboundAgentTranscriptTurnCollector {
  const spoken = emptyBuffer()
  const responseText = emptyBuffer()
  let activeResponseId: string | null = null
  const persistedTurns = new Set<string>()
  const seenLiveEventIds = new Set<string>()

  const markTurn = (turnKey: string, buffer: ElenaAgentOutputBuffer): ElenaAgentTurnReady | null => {
    const text = buffer.text.trim()
    if (!text || persistedTurns.has(turnKey)) return null
    persistedTurns.add(turnKey)
    const turn: ElenaAgentTurnReady = {
      text,
      startMs: buffer.startMs,
      endMs: buffer.endMs,
      turnKey,
    }
    buffer.text = ''
    buffer.startMs = null
    buffer.endMs = null
    buffer.eventIds.clear()
    return turn
  }

  const finishAgentTurn = (
    parent: Record<string, unknown>,
    nested: Record<string, unknown>,
    ready: ElenaAgentTurnReady[],
  ) => {
    const responseId = resolveResponseId(parent, nested) || activeResponseId
    if (responseId) activeResponseId = responseId
    const turnKey = agentTurnKey(responseId, spoken.text.trim() ? spoken : responseText)
    if (spoken.text.trim()) {
      const turn = markTurn(turnKey, spoken)
      if (turn) ready.push(turn)
      return
    }
    if (responseText.text.trim()) {
      const turn = markTurn(turnKey, responseText)
      if (turn) ready.push(turn)
    }
  }

  const ingest = (event: Record<string, unknown>): ElenaAgentTurnReady[] => {
    const liveEventId = typeof event.event_id === 'string' ? event.event_id : ''
    if (liveEventId && seenLiveEventIds.has(liveEventId)) return []
    if (liveEventId) seenLiveEventIds.add(liveEventId)

    const ready: ElenaAgentTurnReady[] = []
    const type = String(event.type || '')

    if (type === 'session.output_transcript.delta' && typeof event.delta === 'string') {
      appendDelta(spoken, event.delta, event.start_ms, event.end_ms, event.event_id)
    }

    const nested = nestedResponseEvent(event)
    if (nested) {
      const nestedType = String(nested.type || '')
      const responseId = resolveResponseId(event, nested)
      if (responseId) activeResponseId = responseId
      if (nestedType === 'response.output_text.delta' && typeof nested.delta === 'string') {
        appendDelta(responseText, nested.delta, nested.start_ms, nested.end_ms, nested.event_id)
      }
      if (nestedType === 'response.output_text.done' && typeof nested.text === 'string' && nested.text.trim()) {
        responseText.text = nested.text.trim()
        if (typeof nested.start_ms === 'number' && Number.isFinite(nested.start_ms)) {
          responseText.startMs = responseText.startMs == null ? nested.start_ms : Math.min(responseText.startMs, nested.start_ms)
        }
        if (typeof nested.end_ms === 'number' && Number.isFinite(nested.end_ms)) {
          responseText.endMs = Math.max(responseText.endMs ?? nested.end_ms, nested.end_ms)
        }
      }
      if (isResponseTurnFinished(nestedType)) {
        finishAgentTurn(event, nested, ready)
        activeResponseId = null
      }
    }

    if (isSessionOutputAudioBufferStopped(type) && spoken.text.trim() && !activeResponseId) {
      const turnKey = agentTurnKey(null, spoken)
      const turn = markTurn(turnKey, spoken)
      if (turn) ready.push(turn)
    }

    return ready
  }

  const drainPartial = (): ElenaAgentTurnReady | null => {
    if (!spoken.text.trim()) return null
    const turnKey = agentTurnKey(activeResponseId, spoken)
    return markTurn(turnKey, spoken)
  }

  return { ingest, drainPartial }
}