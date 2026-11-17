import 'server-only'
import { supabaseRest } from './supabaseRestServer'

export async function stopLuxorTourAttendedFollowups(inquiryId: string, visitId: string | null | undefined) {
  if (!visitId) return
  await supabaseRest('rpc/luxor_stop_tour_attended_followups', {
    method: 'POST',
    body: JSON.stringify({ p_inquiry_id: inquiryId, p_visit_id: visitId }),
  })
}