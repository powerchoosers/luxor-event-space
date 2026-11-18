const ELENA_LIVE_AGENT_TRANSCRIPTION_SID = 'elena_live_model_output'

export type ElenaLiveTranscriptRow = {
  track: string
  transcription_sid: string
  segment_text: string
  segment_start_seconds?: number | null
  event_timestamp?: string | null
  segment_audio_timestamp?: string | null
  sequence_id?: number
}

export function isElenaModelAgentTranscriptRow(row: ElenaLiveTranscriptRow) {
  return row.track === 'luxor_agent' && row.transcription_sid === ELENA_LIVE_AGENT_TRANSCRIPTION_SID
}

/** Final Twilio ASR only; rows passed in should already be `is_final` from storage queries. */
export function shouldUseElenaAgentAsrFallback(modelAgentCount: number, finalAsrAgentCount: number, sideband: unknown) {
  if (finalAsrAgentCount === 0) return false
  if (modelAgentCount === 0) return true
  if (modelAgentCount < finalAsrAgentCount && sideband === 'completed') return true
  return false
}

export function pickElenaLiveAgentTranscriptRows(
  sideband: unknown,
  modelAgentRows: ElenaLiveTranscriptRow[],
  agentAsrRows: ElenaLiveTranscriptRow[],
) {
  if (shouldUseElenaAgentAsrFallback(modelAgentRows.length, agentAsrRows.length, sideband)) return agentAsrRows
  if (!modelAgentRows.length) return agentAsrRows
  if (sideband === 'completed') return modelAgentRows
  return modelAgentRows
}

export function mergeElenaLiveTranscriptRows(
  sideband: unknown,
  nonAgentRows: ElenaLiveTranscriptRow[],
  modelAgentRows: ElenaLiveTranscriptRow[],
  agentAsrRows: ElenaLiveTranscriptRow[],
  agentAsrAfterPartial: ElenaLiveTranscriptRow[],
) {
  if (!modelAgentRows.length && !agentAsrRows.length) return nonAgentRows
  if (shouldUseElenaAgentAsrFallback(modelAgentRows.length, agentAsrRows.length, sideband)) {
    return [...nonAgentRows, ...agentAsrRows]
  }
  if (!modelAgentRows.length) return [...nonAgentRows, ...agentAsrRows]
  if (sideband === 'completed') return [...nonAgentRows, ...modelAgentRows]
  if (sideband === 'partial') return [...nonAgentRows, ...modelAgentRows, ...agentAsrAfterPartial]
  return [...nonAgentRows, ...agentAsrRows]
}