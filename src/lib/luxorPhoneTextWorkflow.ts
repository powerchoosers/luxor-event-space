export const PHONE_TEXT_DEFAULTS = {
  missed_call: 'Luxor Event Space: Sorry we missed your call. Reply with your name, event date, and event type, and we will get back to you. Reply STOP to opt out.',
  inbound_acknowledgment: 'Luxor Event Space: Thanks for your message. We received it and will respond as soon as possible. Reply STOP to opt out.',
} as const

export type PhoneTextWorkflow = keyof typeof PHONE_TEXT_DEFAULTS

export function isPhoneTextWorkflow(value: string): value is PhoneTextWorkflow {
  return value === 'missed_call' || value === 'inbound_acknowledgment'
}

export function validatePhoneTextBody(value: unknown) {
  if (typeof value !== 'string') throw new Error('Enter a message.')
  const body = value.trim()
  if (body.length > 480 || !/^Luxor Event Space:/i.test(body) || !/Reply STOP to opt out\.$/i.test(body)) throw new Error('Use a message of at most 480 characters that starts with Luxor Event Space: and ends with Reply STOP to opt out.')
  return body
}
