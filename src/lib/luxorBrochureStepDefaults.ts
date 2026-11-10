// Original timing and call-task copy from the checked-in brochure sequence.
// Loading these values into the editor does not change the live workflow.
export const BROCHURE_STEP_DEFAULTS: Record<string, { days: number; name?: string; notes?: string }> = {
  phone_1: { days: 0, name: 'Phone Call #1 — Personal Introduction', notes: 'Introduce Luxor, answer questions, and invite the lead to tour.' },
  email_2: { days: 1 },
  phone_2: { days: 3, name: 'Phone Call #2 — Questions and Check-In', notes: 'Follow up and answer questions. Record reached, no answer, or voicemail left.' },
  email_3: { days: 5 },
  phone_3: { days: 10, name: 'Phone Call #3 — Check-In', notes: 'Check in and invite the lead to schedule a visit.' },
  email_4: { days: 14 },
  phone_4: { days: 21, name: 'Phone Call #4 — Final Personal Check-In', notes: 'A friendly, low-pressure final active-sequence call.' },
  email_5: { days: 30 },
}

// Initial email content seeded by 20261005010000_brochure_lead_follow_ups.sql.
// Loading these values only edits the current draft; saving is a separate action.
export const BROCHURE_EMAIL_DEFAULTS: Record<string, { name: string; subject: string; body: string; cta_text: string; cta_url: string; secondary_cta_text: string; secondary_cta_url: string }> = {
  email_2: { name: 'Email #2 — Venue Inclusions', subject: 'Take a Closer Look at Luxor at Las Palmas', body: 'Luxor at Las Palmas offers a beautiful setting for your event, with tables and chairs, linens, a kitchenette and bar area, a VIP room, the Luxor Lounge, and ample parking. We would love to show you the space in person.', cta_text: 'Schedule a Visit', cta_url: '/visit', secondary_cta_text: '', secondary_cta_url: '' },
  email_3: { name: 'Email #3 — Common Questions', subject: 'Your Venue Questions, Answered', body: 'We have answers to common questions about event types, guest capacity, decorating, included items, rental times, alcohol, parking, and availability. Reply to this email if you have a question we can answer.', cta_text: 'Schedule a Visit', cta_url: '/visit', secondary_cta_text: '', secondary_cta_url: '' },
  email_4: { name: 'Email #4 — Still Looking?', subject: 'Still Looking for the Perfect Venue?', body: 'If you are comparing venues, we would be glad to show you Luxor at Las Palmas. Our elegant design, flexible packages, VIP room, and lounge make a thoughtful setting for celebrations.', cta_text: 'Schedule a Visit', cta_url: '/visit', secondary_cta_text: '', secondary_cta_url: '' },
  email_5: { name: 'Email #5 — Final Touch', subject: "We'd Love to Host Your Celebration", body: 'Whenever you are ready, Luxor at Las Palmas would be honored to host your celebration. Reach out whenever it feels like the right time.', cta_text: 'Get in Touch', cta_url: '/contact', secondary_cta_text: 'Schedule a Visit', secondary_cta_url: '/visit' },
}
