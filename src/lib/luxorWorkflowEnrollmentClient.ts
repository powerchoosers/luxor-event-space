export type WorkflowEnrollmentRequest = { requestId: string; workflowId: string; inquiryIds: string[] }
const key = 'luxor:pending-workflow-enrollment'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function pendingWorkflowEnrollment(): WorkflowEnrollmentRequest | null {
  const raw = sessionStorage.getItem(key)
  if (!raw) return null
  const value = JSON.parse(raw) as WorkflowEnrollmentRequest
  if (!value || !uuid.test(value.requestId) || !uuid.test(value.workflowId) || !Array.isArray(value.inquiryIds)
    || !value.inquiryIds.length || value.inquiryIds.length > 100 || value.inquiryIds.some(id => typeof id !== 'string' || !uuid.test(id))) {
    throw new Error('The previous enrollment needs review before starting another. Do not clear it without checking the workflow history.')
  }
  return { requestId: value.requestId.toLowerCase(), workflowId: value.workflowId.toLowerCase(), inquiryIds: [...new Set(value.inquiryIds.map(id => id.toLowerCase()))].sort() }
}
export async function submitWorkflowEnrollment(workflowId: string, inquiryIds: string[], send: typeof fetch = fetch) {
  const prior = pendingWorkflowEnrollment()
  const input: WorkflowEnrollmentRequest = { requestId: prior?.requestId || crypto.randomUUID(), workflowId: workflowId.toLowerCase(), inquiryIds: [...new Set(inquiryIds.map(id => id.toLowerCase()))].sort() }
  if (prior && JSON.stringify(prior) !== JSON.stringify(input)) throw new Error('Retry the original unconfirmed enrollment before changing the selected workflow or leads.')
  if (!uuid.test(workflowId) || !input.inquiryIds.length || input.inquiryIds.length > 100 || input.inquiryIds.some(id => !uuid.test(id))) throw new Error('Choose valid leads and a saved workflow.')
  sessionStorage.setItem(key, JSON.stringify(input))
  const response = await send('/api/marketing/custom-workflows/enroll', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }).catch(() => { throw new Error('Enrollment could not be confirmed. Retry the original selection safely.') })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    // A failed retry does not prove that the earlier unconfirmed attempt rolled back.
    if (!prior && payload?.committed === false) sessionStorage.removeItem(key)
    throw new Error(payload?.error || 'Enrollment could not be confirmed. Retry the original request safely.')
  }
  if (payload?.success !== true || payload.requestId !== input.requestId
    || !Number.isInteger(payload.enrolledCount) || payload.enrolledCount < 0
    || !Number.isInteger(payload.alreadyEnrolledCount) || payload.alreadyEnrolledCount < 0
    || payload.skippedCount !== 0 || payload.enrolledCount + payload.alreadyEnrolledCount !== input.inquiryIds.length) {
    throw new Error('Enrollment could not be confirmed. Retry the original request safely.')
  }
  sessionStorage.removeItem(key)
  return payload as { success: true; requestId: string; enrolledCount: number; alreadyEnrolledCount: number; skippedCount: number; workflowName?: string }
}
