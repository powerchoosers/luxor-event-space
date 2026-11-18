export function isSessionOutputAudioBufferStopped(eventType: string) {
  return eventType === 'session.output_audio_buffer.stopped' || eventType === 'session.output_audio.buffer.stopped'
}

export function isResponseOutputComplete(nestedType: string) {
  return nestedType === 'response.output_text.done'
    || nestedType === 'response.done'
    || nestedType === 'response.completed'
}

export function responseTurnKey(parent: Record<string, unknown>, nested?: Record<string, unknown> | null) {
  for (const key of ['response_id', 'item_id', 'event_id', 'id'] as const) {
    for (const source of [nested, parent]) {
      if (!source) continue
      const value = source[key]
      if (typeof value === 'string' && value) return value
    }
  }
  return null
}