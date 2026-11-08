// A task completion can advance its workflow immediately. Until there is an
// owner-aware atomic complete-and-stop operation, record the call without
// completing the task or claiming that any workflow was stopped.
type StopIntentResult = {
  declineConfirmed: boolean
  noteConfirmed: boolean
  failure: 'decline_unconfirmed' | 'note_unconfirmed' | null
}

export async function recordCallWithoutWorkflowAdvance(
  input: { inquiryId: string; taskId?: string; outcome: string; note: string; intent?: 'stop' | 'nurture' | 'review_reached' | 'review_manual'; requestedNext?: string },
  send: typeof fetch = fetch,
): Promise<StopIntentResult> {
  let declineConfirmed = false
  let declineUnconfirmed = false
  if (input.outcome === 'not_interested') {
    try {
      const response = await send('/api/follow-ups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryId: input.inquiryId, action: 'disposition', disposition: 'not_interested', reason: 'Manual call outcome' }),
      })
      const result: unknown = await response.json().catch(() => null)
      if (!response.ok || !result || typeof result !== 'object' || !('success' in result) || result.success !== true || !('disposition' in result) || result.disposition !== 'not_interested') {
        declineUnconfirmed = true
      } else {
        declineConfirmed = true
      }
    } catch {
      declineUnconfirmed = true
    }
  }
  try {
    const reviewDetail = input.intent === 'nurture'
      ? 'A move to nurture was requested; the stage and workflow require review.'
      : input.intent === 'review_manual'
        ? `A manual follow-up was requested${input.requestedNext ? `: ${input.requestedNext}` : ''}; scheduling and workflow completion require review.`
        : input.intent === 'review_reached'
          ? 'A response was reported; recording it against the correct workflow and completing the task require review.'
          : 'No further follow-up was requested; workflow stopping requires review.'
    const response = await send('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inquiryId: input.inquiryId,
        content: `Manual call outcome: ${input.outcome.replaceAll('_', ' ')}.${input.note.trim() ? ` ${input.note.trim()}` : ''} ${reviewDetail}`,
        noteType: 'status_change',
        taskId: input.taskId,
      }),
    })
    const result: unknown = await response.json().catch(() => null)
    const noteConfirmed = Boolean(response.ok && result && typeof result === 'object' && 'id' in result && typeof result.id === 'string' && result.id)
    return { declineConfirmed, noteConfirmed, failure: declineUnconfirmed ? 'decline_unconfirmed' : noteConfirmed ? null : 'note_unconfirmed' }
  } catch {
    return { declineConfirmed, noteConfirmed: false, failure: declineUnconfirmed ? 'decline_unconfirmed' : 'note_unconfirmed' }
  }
}
