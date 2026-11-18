import 'server-only'

import { supabaseRest } from './supabaseRestServer'
import { luxorMailAddress } from './luxorMailConfig'

/**
 * Owner alert recipients come from portal Settings → Notifications
 * (`luxor_user_preferences.notification_emails`), matching
 * `luxor_enqueue_inquiry_notifications`. Fallback: booking@luxoratlaspalmas.com.
 */
export async function listLuxorOwnerNotificationRecipients(): Promise<string[]> {
  const rows = await supabaseRest<Array<{ notification_emails: string | null }>>(
    'luxor_user_preferences?select=notification_emails',
  )
  const recipients = new Set<string>()
  for (const row of rows) {
    const raw = String(row.notification_emails || '')
    for (const part of raw.split(',')) {
      const address = luxorMailAddress(part)
      if (address) recipients.add(address)
    }
  }
  if (!recipients.size) recipients.add('booking@luxoratlaspalmas.com')
  return Array.from(recipients).sort()
}