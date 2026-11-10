import 'server-only'
import type { LuxorSignatureRequest } from './luxorInquiryTypes'
import { buildContractReminderEmail } from './luxorLifecycleEmailsServer'
import { readAgreementReminderSettings } from './luxorAgreementReminderCopyServer'

export async function buildAgreementReminderPair(signature: LuxorSignatureRequest) {
  let settings: Awaited<ReturnType<typeof readAgreementReminderSettings>>['settings'] = []
  let copySettingsUnavailable = false
  try { settings = (await readAgreementReminderSettings()).settings }
  catch (error) { copySettingsUnavailable = true; console.error('Agreement reminder settings unavailable; using the original wording:', error) }
  return {
    view: buildContractReminderEmail({ signature, kind: 'view', copyOverride: settings.find((item) => item.key === 'view')?.copy_override }),
    sign: buildContractReminderEmail({ signature, kind: 'sign', copyOverride: settings.find((item) => item.key === 'sign')?.copy_override }),
    copySettingsUnavailable,
  }
}
