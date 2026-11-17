/** mm:ss from call/recording start for portal transcript lines. */
export function luxorTranscriptLineStartSeconds(
  segment: { startSeconds?: number | null; timestamp?: string },
  recordingStartedAt: string | null | undefined,
): number | null {
  if (segment.startSeconds != null && Number.isFinite(segment.startSeconds)) {
    return Math.max(0, Math.floor(segment.startSeconds))
  }
  const recordingStart = Date.parse(recordingStartedAt || '')
  const eventMs = Date.parse(segment.timestamp || '')
  if (Number.isFinite(recordingStart) && Number.isFinite(eventMs)) {
    return Math.max(0, Math.floor((eventMs - recordingStart) / 1000))
  }
  return null
}

export function formatLuxorTranscriptElapsed(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}