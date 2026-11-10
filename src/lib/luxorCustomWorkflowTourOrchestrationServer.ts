import 'server-only'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'

export type AttendedTourConsumption = {
  status: 'ready' | 'not_installed' | 'error'
  consumed: number
  ignored: number
  enrolled: number
}

/** Missing optional migration must not stop the existing inquiry workflow lane. */
export async function consumeAttendedTourEvents(limit: number): Promise<AttendedTourConsumption> {
  const empty = { consumed: 0, ignored: 0, enrolled: 0 }
  try {
    const rows = await supabaseRestStrict<Array<{ events_consumed: number; events_ignored: number; enrollments_created: number }>>(
      'rpc/luxor_custom_workflow_consume_attended_tours',
      { method: 'POST', body: JSON.stringify({ p_limit: limit }) },
    )
    const row = rows?.[0]
    if (!row || ![row.events_consumed, row.events_ignored, row.enrollments_created].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error('Tour workflow consumer returned an invalid result.')
    return { status: 'ready', consumed: row.events_consumed, ignored: row.events_ignored, enrolled: row.enrollments_created }
  } catch (error) {
    if (error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST202') return { status: 'not_installed', ...empty }
    console.error('Tour workflow enrollment could not be processed:', error instanceof Error ? error.message : error)
    return { status: 'error', ...empty }
  }
}
