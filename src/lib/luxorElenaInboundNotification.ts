type CallNotificationFacts = {
  twilio_call_sid?: unknown
  direction?: unknown
  metadata?: unknown
}

export const ELENA_ANSWERED_NOTIFICATION_TITLE = 'Elena answered a call'
export const ELENA_ANSWERED_NOTIFICATION_BODY = 'Open the call to review caller details'

/** Acceptance alone is insufficient: signed carrier answer proof must also be persisted. */
export function isElenaLiveAnsweredCall(call: CallNotificationFacts): boolean {
  const metadata = call.metadata && typeof call.metadata === 'object' && !Array.isArray(call.metadata)
    ? call.metadata as Record<string, unknown> : null
  return Boolean(call.direction === 'inbound' && typeof call.twilio_call_sid === 'string' && /^CA[0-9a-f]{32}$/i.test(call.twilio_call_sid)
    && metadata?.scope === 'elena_live_inbound'
    && metadata.ingress_mode === 'programmable_sip' && metadata.accepted === true
    && typeof metadata.openai_session_id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{1,180}$/.test(metadata.openai_session_id)
    && metadata.sip_answered === true && typeof metadata.sip_child_call_sid === 'string' && /^CA[0-9a-f]{32}$/i.test(metadata.sip_child_call_sid)
    && metadata.sip_child_call_sid !== call.twilio_call_sid
    && typeof metadata.sip_answered_at === 'string' && Number.isFinite(Date.parse(metadata.sip_answered_at))
    && typeof metadata.elena_answered_at === 'string' && Number.isFinite(Date.parse(metadata.elena_answered_at)))
}
