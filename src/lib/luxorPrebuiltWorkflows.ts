import type { CustomWorkflowDefinition, CustomWorkflowTrigger } from './luxorCustomWorkflowDefinition'
import { LUXOR_VENUE_ADDRESS } from './luxorVenue'

export type PrebuiltWorkflow = {
  id: string
  name: string
  description: string
  trigger: CustomWorkflowTrigger
  triggerBadge: string
  recommendedFor: string
  stepsSummary: string
  definition: CustomWorkflowDefinition
}

export const PREBUILT_WORKFLOWS: PrebuiltWorkflow[] = [
  {
    id: 'prebuilt-sms-optin',
    name: 'SMS Opt-In VIP Welcome',
    description: 'Instantly welcomes new SMS opt-ins, shares direct photo tour links, and queues a high-priority call task for Arianna.',
    trigger: 'sms_opt_in',
    triggerBadge: 'SMS Opt-In',
    recommendedFor: 'New inquiries opting into text updates',
    stepsSummary: 'Instant SMS → 1h Delay → Operator Call Task',
    definition: {
      schemaVersion: 1,
      trigger: 'sms_opt_in',
      steps: [
        {
          id: 'welcome-sms',
          type: 'text',
          name: 'VIP Welcome Text',
          body: 'Luxor Events: Hi {{first_name}}! Thank you for connecting with Luxor at Las Palmas. We are delighted to assist with your {{event_type}}. Explore our photo gallery here: https://www.luxoratlaspalmas.com/gallery Reply STOP to opt out.',
          requiredConsentScope: 'marketing',
          generationMode: 'manual',
        },
        {
          id: 'wait-before-call',
          type: 'wait',
          name: 'Grace period before call',
          amount: 1,
          unit: 'hours',
        },
        {
          id: 'vip-call-task',
          type: 'call_task',
          name: 'Welcome call with date availability',
          scriptNotes: 'Introduce yourself by your name and role at Luxor. Discuss the requested {{target_date}} for {{guest_count}} guests. Check current availability before making a promise, and offer a venue tour.',
          dueWithinHours: 2,
          priority: 'urgent',
          assignee: 'Arianna Patterson',
        },
        {
          id: 'finished',
          type: 'end',
          name: 'End welcome sequence',
        },
      ],
    },
  },
  {
    id: 'prebuilt-speed-to-lead',
    name: 'Speed-to-Lead Inquiry Follow-up',
    description: 'Follows new website inquiries with the existing acknowledgment, a prompt call task, and an eligible follow-up text.',
    trigger: 'contact_form_inquiry_created',
    triggerBadge: 'New Inquiry',
    recommendedFor: 'Website contact submissions',
    stepsSummary: 'Email Receipt → 30m Delay → Call Task → Eligibility Check → SMS Check-in',
    definition: {
      schemaVersion: 1,
      trigger: 'contact_form_inquiry_created',
      steps: [
        {
          id: 'inquiry-acknowledgment',
          type: 'email',
          mode: 'existing_inquiry_acknowledgment',
          name: 'Existing inquiry acknowledgment',
          subject: 'We have received your Luxor inquiry',
          previewText: 'We received your Luxor inquiry and will connect with you shortly.',
          body: '',
          ctaText: '',
          ctaUrl: '',
        },
        {
          id: 'delay-30m',
          type: 'wait',
          name: 'Wait 30 minutes',
          amount: 30,
          unit: 'minutes',
        },
        {
          id: 'first-call-attempt',
          type: 'call_task',
          name: 'Speed-to-lead initial call',
          scriptNotes: 'Call {{first_name}} regarding {{event_type}} inquiry for {{target_date}}. If voicemail, mention you sent an email receipt.',
          dueWithinHours: 1,
          priority: 'urgent',
          assignee: 'Arianna Patterson',
        },
        {
          id: 'eligibility-check',
          type: 'condition',
          name: 'Verify prospect remains responsive',
          condition: 'follow_up_eligible',
          whenFalse: 'stop',
        },
        {
          id: 'follow-up-sms',
          type: 'text',
          name: 'Warm follow-up SMS',
          body: 'Luxor Events: Hi {{first_name}}, Arianna from Luxor here! I saw your inquiry for a {{event_type}} with {{guest_count}}. Would you like to schedule a private tour this week? Reply STOP to opt out.',
          requiredConsentScope: 'marketing',
          generationMode: 'manual',
        },
        {
          id: 'finished',
          type: 'end',
          name: 'End speed-to-lead',
        },
      ],
    },
  },
  {
    id: 'prebuilt-tour-reminder',
    name: 'Tour Directions',
    description: 'Shares the venue address and contact details for a booked tour. Tour reminders use the existing calendar reminder system.',
    trigger: 'tour_scheduled',
    triggerBadge: 'Tour Booked',
    recommendedFor: 'Prospects with booked venue tours',
    stepsSummary: 'Directions Email',
    definition: {
      schemaVersion: 1,
      trigger: 'tour_scheduled',
      steps: [
        {
          id: 'tour-details-email',
          type: 'email',
          mode: 'marketing',
          name: 'Tour details & directions',
          subject: 'Your upcoming Luxor tour on {{tour_date}}',
          previewText: 'We are thrilled to welcome you to Luxor Event Space. Here is your arrival guide.',
          body: `Dear {{first_name}},\n\nWe look forward to welcoming you for your Luxor tour. Your tour details: {{tour_date}} at {{tour_time}}.\n\nOur address is ${LUXOR_VENUE_ADDRESS}.\n\nIf you need to confirm or adjust your time, simply reply to this email or call us at {{venue_phone}}.`,
          ctaText: 'View Venue Map & Directions',
          ctaUrl: 'https://www.luxoratlaspalmas.com/visit',
          generationMode: 'manual',
        },
        {
          id: 'finished',
          type: 'end',
          name: 'End tour reminder flow',
        },
      ],
    },
  },
  {
    id: 'prebuilt-post-tour',
    name: 'Post-Tour Decision & Proposal Nurture',
    description: 'Follows a completed tour with a thank-you note, a planning call task, and a question about next steps.',
    trigger: 'tour_attended',
    triggerBadge: 'Tour Completed',
    recommendedFor: 'Prospects who completed their in-person tour',
    stepsSummary: 'Thank You Email → Wait 2 Days → Planning Call Task → SMS Check-in',
    definition: {
      schemaVersion: 1,
      trigger: 'tour_attended',
      steps: [
        {
          id: 'post-tour-email',
          type: 'email',
          mode: 'marketing',
          name: 'Thank you for visiting Luxor',
          subject: 'It was wonderful meeting you at Luxor, {{first_name}}!',
          previewText: 'Thank you for touring Luxor Event Space for your upcoming {{event_type}}.',
          body: 'Dear {{first_name}},\n\nThank you for touring Luxor and sharing your plans for your {{event_type}}.\n\nYou can review our pricing and package options below. Reply with any questions, and we can discuss the next step for your requested {{target_date}}.',
          ctaText: 'Review Venue Pricing & Packages',
          ctaUrl: 'https://www.luxoratlaspalmas.com/pricing',
          generationMode: 'manual',
        },
        {
          id: 'wait-2-days',
          type: 'wait',
          name: 'Wait 2 days',
          amount: 2,
          unit: 'days',
        },
        {
          id: 'date-hold-call',
          type: 'call_task',
          name: 'Post-tour planning check-in',
          scriptNotes: 'Check in with {{first_name}} regarding their {{event_type}}. Ask what questions remain and what next step would help. Verify current availability before discussing {{target_date}}; do not promise a date hold.',
          dueWithinHours: 6,
          priority: 'high',
          assignee: 'Arianna Patterson',
        },
        {
          id: 'check-in-sms',
          type: 'text',
          name: 'Gentle check-in text',
          body: 'Luxor Events: Hi {{first_name}}, Arianna from Luxor checking in! What questions can we help with after your tour as you plan your {{event_type}}? Reply STOP to opt out.',
          requiredConsentScope: 'marketing',
          generationMode: 'manual',
        },
        {
          id: 'finished',
          type: 'end',
          name: 'End post-tour sequence',
        },
      ],
    },
  },
  {
    id: 'prebuilt-no-show',
    name: 'Tour No-Show Recovery',
    description: 'Gently re-engages clients who missed their tour with a no-friction reschedule text and follow-up call task.',
    trigger: 'tour_no_show',
    triggerBadge: 'No Show',
    recommendedFor: 'Prospects who missed their appointment',
    stepsSummary: 'No-Stress SMS → Wait 24h → Reschedule Call Task',
    definition: {
      schemaVersion: 1,
      trigger: 'tour_no_show',
      steps: [
        {
          id: 'no-show-sms',
          type: 'text',
          name: 'No-stress reschedule text',
          body: 'Luxor Events: Hi {{first_name}}, we missed the chance to show you Luxor. We know things come up. When would be a good time to reschedule your private walkthrough? Reply STOP to opt out.',
          requiredConsentScope: 'marketing',
          generationMode: 'manual',
        },
        {
          id: 'wait-24h',
          type: 'wait',
          name: 'Wait 24 hours',
          amount: 24,
          unit: 'hours',
        },
        {
          id: 'reschedule-call',
          type: 'call_task',
          name: 'Reschedule missed tour call',
          scriptNotes: 'Use a warm tone. Ask whether {{first_name}} would like to reschedule their tour and what day is convenient. Check current tour openings before offering a time.',
          dueWithinHours: 12,
          priority: 'medium',
          assignee: 'Arianna Patterson',
        },
        {
          id: 'finished',
          type: 'end',
          name: 'End no-show recovery',
        },
      ],
    },
  },
]
