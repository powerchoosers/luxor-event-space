import type { LuxorMailProvider } from './luxorMailConfig'

export type LuxorMailSettings = {
  activeProvider: LuxorMailProvider
  fromAddress: string
  checkedAt: string
  loginProvider: 'zoho'
  zoho: { credentialsPresent: boolean; calendarCredentialsPresent: boolean }
  resend: {
    apiKeyPresent: boolean
    webhookSecretPresent: boolean
    webhookUrl: string
    activityAvailable: boolean
    lastWebhookAt: string | null
    lastWebhookProcessedAt: string | null
  }
}
