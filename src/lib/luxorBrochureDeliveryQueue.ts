import 'server-only'
import type { LuxorInquiry } from './luxorInquiryTypes'
import { buildBrochureDeliveryEmailHtml, createLuxorEmailJob } from './luxorEmailJobsServer'
import { renderBrochureDeliveryCopy } from './luxorBrochureDeliveryCopy'
import { readBrochureDeliverySetting } from './luxorBrochureDeliveryCopyServer'

/** Render and snapshot one brochure delivery before the existing dispatch and enrollment paths. */
export async function queueBrochureDelivery(inquiry: LuxorInquiry, options?: { elena?: boolean }) {
  if (!inquiry.email) throw new Error('An email address is required for brochure delivery.')
  let copySettingsUnavailable = false
  let override = null
  try { override = (await readBrochureDeliverySetting()).setting.copy_override }
  catch (error) { copySettingsUnavailable = true; console.error('Brochure email settings unavailable; using the original delivery:', error) }
  const subject = override ? renderBrochureDeliveryCopy(override, { first_name: inquiry.full_name?.split(' ')[0] || 'there', event_type: inquiry.event_type || 'event', guest_count: inquiry.guest_count ? String(inquiry.guest_count) : '' }).subject : 'Your Luxor at Las Palmas Venue Brochure'
  if (options?.elena) {
    const { buildElenaBrochureDeliveryEmail, elenaBrochureDeliveryMetadata } = await import('./luxorElenaEmailServer')
    const outbound = await buildElenaBrochureDeliveryEmail(inquiry, override)
    return createLuxorEmailJob({
      inquiryId: inquiry.id,
      jobType: 'booking_package',
      recipientEmail: inquiry.email,
      subject,
      body: outbound.html,
      scheduledFor: new Date().toISOString(),
      metadata: {
        automated: true,
        flow_stage: 'brochure_delivery',
        lead_source: inquiry.source,
        ...elenaBrochureDeliveryMetadata(),
        ...(copySettingsUnavailable ? { copy_settings_unavailable: true } : {}),
      },
    })
  }
  return createLuxorEmailJob({ inquiryId: inquiry.id, jobType: 'booking_package', recipientEmail: inquiry.email, subject, body: buildBrochureDeliveryEmailHtml(inquiry, override), scheduledFor: new Date().toISOString(), metadata: { automated: true, flow_stage: 'brochure_delivery', lead_source: inquiry.source, ...(copySettingsUnavailable ? { copy_settings_unavailable: true } : {}) } })
}
