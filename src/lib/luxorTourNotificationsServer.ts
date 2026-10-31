import 'server-only'

import { supabaseRest } from './supabaseRestServer'

export async function areLuxorTourNotificationsEnabled() {
  const [automation] = await supabaseRest<Array<{ enabled: boolean }>>(
    'luxor_follow_up_automations?select=enabled&automation_key=eq.tour_notifications&limit=1',
  )
  // Older databases keep the existing calendar behavior until the migration
  // adds the explicit control row.
  return automation?.enabled !== false
}

export async function cancelQueuedLuxorTourNotifications() {
  const now = new Date().toISOString()
  await Promise.all([
    supabaseRest('luxor_email_jobs?status=eq.queued&job_type=in.(tour_confirmation,tour_reminder)&tour_revision_id=not.is.null', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled', last_error: 'Tour notifications were turned off in Marketing settings.', updated_at: now }),
    }),
    supabaseRest('luxor_text_jobs?status=eq.queued&job_type=in.(tour_confirmation,tour_reminder)&custom_workflow_step_run_id=is.null', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled', last_error: 'Tour notifications were turned off in Marketing settings.', updated_at: now }),
    }),
  ])
}
