export const TOUR_EMAIL_NOTICE_KEYS = ['confirmation', 'reminder_24', 'reminder_2'] as const
export type TourEmailNoticeKey = (typeof TOUR_EMAIL_NOTICE_KEYS)[number]
export type TourEmailCopy = { subject: string; greeting: string; introduction: string; preparation: string; closing: string }
export const TOUR_EMAIL_STARTERS: Record<TourEmailNoticeKey, TourEmailCopy> = {
  confirmation: { subject: 'You are confirmed for your Luxor tour on {{tour_date}}', greeting: 'Hi {{first_name}},', introduction: 'Your {{meeting_type}} is confirmed for {{tour_date}} at {{tour_time}}.', preparation: 'We look forward to discussing your {{event_type}} plans.', closing: 'If you need to reschedule, please use the button below.' },
  reminder_24: { subject: 'Tomorrow: your Luxor tour at {{tour_time}}', greeting: 'Hi {{first_name}},', introduction: 'Your private Luxor tour is tomorrow, {{tour_date}}, at {{tour_time}}.', preparation: 'We look forward to discussing your {{event_type}} plans.', closing: 'If your timing changes, reply to this email and our team will help.' },
  reminder_2: { subject: 'Your Luxor tour starts soon', greeting: 'Hi {{first_name}},', introduction: 'We look forward to seeing you at {{tour_time}} for your private Luxor tour.', preparation: 'We look forward to discussing your {{event_type}} plans.', closing: 'If your timing changes, reply to this email and our team will help.' },
}

const MAX_LENGTHS: Record<keyof TourEmailCopy, number> = { subject: 120, greeting: 80, introduction: 500, preparation: 500, closing: 300 }
const VARIABLES = /\{\{(first_name|event_type|guest_count|tour_date|tour_time|meeting_type|client_notes)\}\}/g

export function validateTourEmailCopy(value: unknown): TourEmailCopy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter all tour email copy fields.')
  const input = value as Record<string, unknown>
  const keys = Object.keys(MAX_LENGTHS) as Array<keyof TourEmailCopy>
  if (Object.keys(input).some((key) => !keys.includes(key as keyof TourEmailCopy))) throw new Error('Unknown tour email field.')
  const result = {} as TourEmailCopy
  for (const key of keys) {
    const field = input[key]
    if (typeof field !== 'string' || !field.trim() || field.trim().length > MAX_LENGTHS[key]) throw new Error(`Enter ${key} within its length limit.`)
    const clean = field.trim()
    const stripped = clean.replace(VARIABLES, '')
    if (stripped.includes('{{') || stripped.includes('}}')) throw new Error('Use only the listed tour email variables.')
    if ((key === 'subject' || key === 'greeting') && /[\r\n]/.test(clean)) throw new Error('Subject and greeting must each be a single line.')
    result[key] = clean
  }
  return result
}

export function renderTourEmailCopy(copy: TourEmailCopy, values: Record<string, string>): TourEmailCopy {
  const valid = validateTourEmailCopy(copy)
  return Object.fromEntries(Object.entries(valid).map(([key, field]) => {
    const rendered = field.replace(VARIABLES, (_, variable: string) => values[variable] || '')
    return [key, key === 'subject' || key === 'greeting' ? rendered.replace(/[\r\n]+/g, ' ') : rendered]
  })) as TourEmailCopy
}
