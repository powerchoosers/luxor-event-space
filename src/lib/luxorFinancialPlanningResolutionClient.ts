import { validatePlanningResolutionRequest } from './luxorFinancialPlanningResolution'

/** Missing receipts remain uncertain: a write may still be in flight. */
export async function checkPlanningReceipt(request: unknown, fetcher: typeof fetch = fetch): Promise<'saved' | 'conflict' | 'mismatch' | 'not_found'> {
  if (!validatePlanningResolutionRequest(request)) throw new Error('Saved request needs review')
  const response = await fetcher('/api/portal/financial-planning/resolve', { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok || !body || typeof body !== 'object' || !('status' in body) || !['saved', 'conflict', 'mismatch', 'not_found'].includes(String(body.status))) throw new Error('Save status could not be verified')
  return body.status as 'saved' | 'conflict' | 'mismatch' | 'not_found'
}
