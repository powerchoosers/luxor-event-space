import { isCallResolutionResult, parseCallResolutionInput, type CallResolutionInput } from '@/lib/luxorCallResolution'

function storageKey(inquiryId: string, taskId: string | null) {
  return `luxor:pending-call-resolution:${inquiryId.toLowerCase()}:${taskId?.toLowerCase() || 'manual'}`
}

export function pendingCallResolution(inquiryId: string, taskId: string | null): CallResolutionInput | null {
  const raw = sessionStorage.getItem(storageKey(inquiryId, taskId))
  if (!raw) return null
  const input = parseCallResolutionInput(JSON.parse(raw))
  if (!input || input.inquiryId !== inquiryId.toLowerCase() || input.taskId !== (taskId?.toLowerCase() || null)) {
    throw new Error('The previous call save needs review. Refresh the lead before recording another call.')
  }
  return input
}

export async function submitCallResolution(values: Omit<CallResolutionInput, 'requestId'>, send: typeof fetch = fetch) {
  const key = storageKey(values.inquiryId, values.taskId)
  // Keep the exact request through a lost response, modal dismissal, or reload.
  // Remove only after success or a known rollback of the first attempt. A later
  // permission/gate rejection cannot disprove an earlier uncertain commit.
  const prior = pendingCallResolution(values.inquiryId, values.taskId)
  const input = parseCallResolutionInput({ ...values, requestId: prior?.requestId || crypto.randomUUID() })
  if (!input) throw new Error('Choose a valid call outcome and next step.')
  if (prior && JSON.stringify(prior) !== JSON.stringify(input)) {
    throw new Error('A previous save is unconfirmed. Reopen this window and retry the original details before changing them.')
  }
  if (!prior && input.nextStep === 'later' && Date.parse(input.dueAt!) <= Date.now()) {
    throw new Error('Choose a future date and time for the follow-up.')
  }
  sessionStorage.setItem(key, JSON.stringify(input))
  const response = await send('/api/call-outcomes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  }).catch(() => { throw new Error('The saved result could not be confirmed. Reopen this window to retry the same request safely.') })
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (!prior && result && typeof result === 'object' && 'committed' in result && result.committed === false) sessionStorage.removeItem(key)
    throw new Error(result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
      ? result.error : 'The saved result could not be confirmed. Review the lead before retrying.')
  }
  if (!isCallResolutionResult(result, input)) throw new Error('The saved result could not be confirmed. Reopen this window to retry the same request safely.')
  sessionStorage.removeItem(key)
  return result
}
