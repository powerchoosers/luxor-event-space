import 'server-only'

import { supabaseRest } from './supabaseRestServer'

const AUTOMATION_KEY = 'payment_reminders'

export async function areLuxorFinalPaymentRemindersEnabled() {
  const [automation] = await supabaseRest<Array<{ enabled: boolean }>>(
    `luxor_follow_up_automations?select=enabled&automation_key=eq.${AUTOMATION_KEY}&limit=1`,
  )
  // Preserve the existing due-date scheduler until its settings row is installed.
  return automation?.enabled !== false
}

export async function cancelQueuedLuxorFinalPaymentMilestones() {
  const now = new Date().toISOString()
  await supabaseRest('luxor_email_jobs?status=eq.queued&job_type=in.(final_payment_request,final_payment_reminder,installment_payment_reminder)&metadata->>milestone=not.is.null&test_run_id=is.null', {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'cancelled',
      last_error: 'Automated payment reminders were paused in Marketing settings.',
      updated_at: now,
    }),
  })
}
