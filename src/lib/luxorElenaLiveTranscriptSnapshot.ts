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

export function elenaAgentLineCount(rows: Array<{ track: string }>) {
  return rows.filter((row) => row.track === 'luxor_agent').length
}

export function countElenaModelAndAsrAgentRows(rows: ElenaLiveTranscriptRow[]) {
  let model = 0
  let asr = 0
  for (const row of rows) {
    if (row.track !== 'luxor_agent') continue
    if (isElenaModelAgentTranscriptRow(row)) model += 1
    else asr += 1
  }
  return { model, asr }
}

/** Read-time repair for frozen post_call snapshots written before ASR fallback. */
export function shouldRepairThinPostCallTranscriptSnapshot(input: {
  transcriptSource?: unknown
  manuallyCorrected?: unknown
  sideband?: unknown
  snapshotAgentLineCount: number
  rawRows: ElenaLiveTranscriptRow[]
  usesSipBridge: boolean
}) {
  if (!input.usesSipBridge) return false
  if (input.transcriptSource !== 'post_call') return false
  if (input.manuallyCorrected === true) return false
  const { model, asr } = countElenaModelAndAsrAgentRows(input.rawRows)
  if (!shouldUseElenaAgentAsrFallback(model, asr, input.sideband)) return false
  return input.snapshotAgentLineCount < asr
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