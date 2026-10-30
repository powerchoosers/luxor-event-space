import type { CustomWorkflowDefinition, CustomWorkflowTrigger } from './luxorCustomWorkflowDefinition'

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
          scriptNotes: 'Introduce yourself as Luxor owner/manager. Confirm {{target_date}} availability for {{guest_count}} guests. Offer to hold date for 48 hours.',
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
    description: 'Guarantees sub-15-minute response on fresh website inquiries with an instant acknowledgment email, call task, and warm SMS.',
    trigger: 'contact_form_inquiry_created',
    triggerBadge: 'New Inquiry',
    recommendedFor: 'Website contact submissions',
    stepsSummary: 'Email Receipt → 30m Delay → Call Task → 4h Delay → SMS Check-in',
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
    name: 'Tour Confirmation & 24h Reminder',
    description: 'Sends directions and parking instructions upon booking, followed by an automated 24-hour SMS reminder before their arrival.',
    trigger: 'tour_scheduled',
    triggerBadge: 'Tour Booked',
    recommendedFor: 'Prospects with booked venue tours',
    stepsSummary: 'Directions Email → Wait 24h Prior → Reminder SMS',
    definition: {
      schemaVersion: 1,
      trigger: 'tour_scheduled',
      steps: [
        {
          id: 'tour-details-email',
          type: 'email',
          mode: 'marketing',
          name: 'Tour confirmation & directions',
          subject: 'Your upcoming Luxor tour on {{tour_date}}',
          previewText: 'We are thrilled to welcome you to Luxor Event Space. Here is your arrival guide.',
          body: 'Dear {{first_name}},\n\nWe have your private tour reserved for {{tour_date}} at {{tour_time}}.\n\nOur address is 1000 Las Palmas Blvd, Mission, TX 78572. Dedicated parking is available directly in front of the grand foyer doors.\n\nIf you need to adjust your time or bring additional family members, simply reply to this email or call us at (956) 555-0199.',
          ctaText: 'View Venue Map & Directions',
          ctaUrl: 'https://www.luxoratlaspalmas.com/visit',
          generationMode: 'manual',
        },
        {
          id: 'wait-until-day-before',
          type: 'wait',
          name: 'Wait 1 day before tour',
          amount: 1,
          unit: 'days',
        },
        {
          id: 'tour-reminder-sms',
          type: 'text',
          name: '24h Tour Reminder SMS',
          body: 'Luxor Events: Hi {{first_name}}! Looking forward to meeting you tomorrow for your Luxor tour at {{tour_time}}. Call us at {{venue_phone}} if you are running late! Reply STOP to opt out.',
          requiredConsentScope: 'marketing',
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
    description: 'Nurtures prospects after attending a tour with a thank-you note, date-hold follow-up call task, and proposal link.',
    trigger: 'tour_attended',
    triggerBadge: 'Tour Completed',
    recommendedFor: 'Prospects who completed their in-person tour',
    stepsSummary: 'Thank You Email → Wait 2 Days → Date Hold Call Task → SMS Check-in',
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
          body: 'Dear {{first_name}},\n\nThank you so much for touring Luxor today! It was wonderful discussing your vision for your {{event_type}}.\n\nWe have your preferred date {{target_date}} temporarily noted. Take a moment to review our pricing tiers and custom package inclusions below.',
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
          name: 'Post-tour date hold check-in',
          scriptNotes: 'Check in with {{first_name}} regarding their {{event_type}}. Ask if they have questions on catering, security, or decor. Emphasize prime weekend demand for {{target_date}}.',
          dueWithinHours: 6,
          priority: 'high',
          assignee: 'Arianna Patterson',
        },
        {
          id: 'check-in-sms',
          type: 'text',
          name: 'Gentle check-in text',
          body: 'Luxor Events: Hi {{first_name}}, Arianna from Luxor checking in! Did you have any questions after your tour? We are happy to hold {{target_date}} for you. Reply STOP to opt out.',
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
          body: 'Luxor Events: Hi {{first_name}}, we missed you today at Luxor! We know things come up. When is a good time to reschedule your private walkthrough? Reply STOP to opt out.',
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
          scriptNotes: 'Warm and empathetic tone: "We missed you yesterday for your tour, wanted to see if we can reschedule for this weekend!"',
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
