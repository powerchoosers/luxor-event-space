import 'server-only'

import { luxorMailFrom, luxorMailProvider, luxorResendConfigured } from './luxorMailConfig'
import { luxorCalendarInviteConfig } from './luxorCalendarInviteServer'
import { supabaseRest } from './supabaseRestServer'
import type { LuxorMailSettings } from './luxorMailSettings'

function timestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
}

/** Presence and saved observations only; never verifies credentials or changes a provider. */
export async function getLuxorMailSettings(): Promise<LuxorMailSettings> {
  const activeProvider = luxorMailProvider()
  const fromAddress = luxorMailFrom()
  let activityAvailable = true
  const events = await supabaseRest<Array<{ received_at: string; processed_at: string | null }>>(
    'luxor_resend_events?select=received_at,processed_at&order=received_at.desc&limit=1',
  ).catch(() => { activityAvailable = false; return [] })
  return {
    activeProvider, fromAddress, checkedAt: new Date().toISOString(), loginProvider: 'zoho',
    zoho: {
      credentialsPresent: ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ACCOUNT_ID'].every(key => Boolean(process.env[key]?.trim())),
      calendarCredentialsPresent: luxorCalendarInviteConfig('zoho').configured,
    },
    resend: {
      apiKeyPresent: luxorResendConfigured(), webhookSecretPresent: Boolean(process.env.RESEND_WEBHOOK_SECRET?.trim()),
      webhookUrl: 'https://www.luxoratlaspalmas.com/api/webhooks/resend', activityAvailable,
      lastWebhookAt: timestamp(events[0]?.received_at), lastWebhookProcessedAt: timestamp(events[0]?.processed_at),
    },
  }
}
