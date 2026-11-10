import 'server-only'
import type { LuxorBooking, LuxorInquiry } from './luxorInquiryTypes'
import { cancelQueuedLuxorEmailJobs, createUniqueLuxorEmailJob } from './luxorEmailJobsServer'
import { buildEventEmail, lifecycleAutomationKey } from './luxorLifecycleEmailsServer'
import { readEventEmailSettings } from './luxorEventEmailCopyServer'
import { SupabaseRestError, supabaseRestStrict } from './supabaseRestServer'

export async function syncBookingEmailAutomations(input: {
  inquiry: LuxorInquiry
  booking: LuxorBooking
  previous: LuxorBooking
  requireTransactional?: boolean
}) {
  if (!input.inquiry.email) return
  const metadata = input.booking.metadata || {}
  const previousMetadata = input.previous.metadata || {}

  if ((metadata.final_payment_recorded_manually_at || metadata.final_payment_paid_at) &&
      !(previousMetadata.final_payment_recorded_manually_at || previousMetadata.final_payment_paid_at)) {
    await cancelQueuedLuxorEmailJobs(input.inquiry.id, ['final_payment_reminder'])
  }

  const planningTransition = Boolean(metadata.planning_completed_at && !previousMetadata.planning_completed_at)
  const dateChanged = input.booking.event_date !== input.previous.event_date
  const scheduleEventReminders = Boolean(metadata.planning_completed_at && input.booking.event_date && (planningTransition || dateChanged) && !metadata.event_completed_at && !['cancelled', 'completed'].includes(input.booking.status))
  const needsEventCopy = Boolean(scheduleEventReminders || (metadata.event_completed_at && !previousMetadata.event_completed_at))
  let copySettingsUnavailable = false
  let copySettings: Awaited<ReturnType<typeof readEventEmailSettings>>['settings'] = []
  if (needsEventCopy) {
    try { copySettings = (await readEventEmailSettings()).settings }
    catch (error) { copySettingsUnavailable = true; console.error('Event email settings unavailable; using the original wording:', error) }
  }

  if (scheduleEventReminders && input.booking.event_date) {
    const details = buildEventEmail({ inquiry: input.inquiry, booking: input.booking, kind: 'details', copyOverride: copySettings.find((item) => item.key === 'details')?.copy_override })
    const day = buildEventEmail({ inquiry: input.inquiry, booking: input.booking, kind: 'day', copyOverride: copySettings.find((item) => item.key === 'day')?.copy_override })
    const eventTime = new Date(`${input.booking.event_date}T12:00:00-05:00`).getTime()
    const reminders = [
      { kind: 'event_details_reminder' as const, offset: 14, email: details },
      { kind: 'event_day_reminder' as const, offset: 2, email: day },
    ]
    try {
      const [result] = await supabaseRestStrict<Array<{ applied: boolean }>>('rpc/luxor_sync_event_email_reminders', { method: 'POST', body: JSON.stringify({
        p_booking_id: input.booking.id, p_inquiry_id: input.inquiry.id, p_expected_date: input.booking.event_date,
        p_recipient_email: input.inquiry.email, p_copy_settings_unavailable: copySettingsUnavailable,
        p_reminders: reminders.map((reminder) => ({ kind: reminder.kind, subject: reminder.email.subject, body: reminder.email.body })),
      }) })
      if (!result?.applied) return false
    } catch (error) {
      // Before this migration is installed, preserve the original first-time
      // scheduler. Never emulate a reschedule without the transactional RPC.
      if (!(error instanceof SupabaseRestError && error.status === 404 && error.code === 'PGRST202') || !planningTransition || input.requireTransactional) throw error
      for (const reminder of reminders) {
        const scheduledFor = new Date(eventTime - reminder.offset * 24 * 60 * 60_000)
        if (scheduledFor.getTime() <= Date.now()) continue
        await createUniqueLuxorEmailJob({
          inquiryId: input.inquiry.id, bookingId: input.booking.id, jobType: reminder.kind,
          recipientEmail: input.inquiry.email, subject: reminder.email.subject, body: reminder.email.body,
          scheduledFor: scheduledFor.toISOString(), automationKey: lifecycleAutomationKey(reminder.kind, input.booking.id),
          metadata: { event_date: input.booking.event_date, ...(copySettingsUnavailable ? { copy_settings_unavailable: true } : {}) },
        })
      }
    }
  }

  if (metadata.event_completed_at && !previousMetadata.event_completed_at) {
    const thanks = buildEventEmail({ inquiry: input.inquiry, booking: input.booking, kind: 'thanks', copyOverride: copySettings.find((item) => item.key === 'thanks')?.copy_override })
    await createUniqueLuxorEmailJob({
      inquiryId: input.inquiry.id,
      bookingId: input.booking.id,
      jobType: 'post_event_follow_up',
      recipientEmail: input.inquiry.email,
      subject: thanks.subject,
      body: thanks.body,
      scheduledFor: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
      automationKey: lifecycleAutomationKey('post_event_follow_up', input.booking.id),
      metadata: copySettingsUnavailable ? { copy_settings_unavailable: true } : undefined,
    })
  }
  return true
}

/** Retry committed booking changes without deleting a newer pending generation. */
export async function reconcileEventEmailReminders(limit = 10) {
  const now = new Date().toISOString()
  const pending = await supabaseRestStrict<Array<{ booking_id: string; generation: string }>>(`luxor_event_email_reconciliation?select=booking_id,generation&next_attempt_at=lte.${encodeURIComponent(now)}&order=next_attempt_at.asc,requested_at.asc&limit=${Math.max(1, Math.min(25, Math.trunc(limit) || 1))}`)
  let completed = 0
  for (const row of pending) {
    const rowPath = `luxor_event_email_reconciliation?booking_id=eq.${encodeURIComponent(row.booking_id)}&generation=eq.${encodeURIComponent(row.generation)}`
    const defer = () => supabaseRestStrict(rowPath, { method: 'PATCH', body: JSON.stringify({ next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() }) })
    try {
      const [booking] = await supabaseRestStrict<LuxorBooking[]>(`luxor_bookings?select=*&id=eq.${encodeURIComponent(row.booking_id)}&limit=1`)
      if (!booking) { await defer(); continue }
      const metadata = booking.metadata || {}
      if (!booking.event_date || !booking.inquiry_id || !metadata.planning_completed_at || metadata.event_completed_at || ['cancelled', 'completed'].includes(booking.status)) {
        await supabaseRestStrict(rowPath, { method: 'DELETE' })
        completed++
        continue
      }
      const [inquiry] = await supabaseRestStrict<LuxorInquiry[]>(`luxor_inquiries?select=*&id=eq.${encodeURIComponent(booking.inquiry_id)}&limit=1`)
      if (!inquiry?.email || inquiry.status === 'closed_lost') { await defer(); continue }
      const previous = { ...booking, event_date: null, metadata: { ...metadata, planning_completed_at: null } }
      const applied = await syncBookingEmailAutomations({ inquiry, booking, previous, requireTransactional: true })
      if (!applied) { await defer(); continue }
      await supabaseRestStrict(rowPath, { method: 'DELETE' })
      completed++
    } catch (error) {
      console.warn('Event reminder reconciliation retained for retry:', error instanceof Error ? error.message : error)
      await defer().catch(() => console.warn('Event reminder retry could not be deferred.'))
    }
  }
  return { checked: pending.length, completed }
}
