export const LUXOR_SALES_BRIEFING_TIME_ZONE = 'America/Chicago'
export const LUXOR_SALES_BRIEFING_SEND_HOUR = 8

export type LuxorChicagoClock = {
  dateKey: string
  hour: number
  weekdayShort: string
}

export function readLuxorChicagoClock(now = new Date()): LuxorChicagoClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LUXOR_SALES_BRIEFING_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(now)
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || ''
  const year = pick('year')
  const month = pick('month')
  const day = pick('day')
  return {
    dateKey: `${year}-${month}-${day}`,
    hour: Number(pick('hour')),
    weekdayShort: pick('weekday'),
  }
}

export type LuxorSalesBriefingSendGateInput = {
  sendEnabled: boolean
  recipientConfigured: boolean
  chicagoHour: number
  chicagoWeekdayShort: string
  alreadySent: boolean
}

export type LuxorSalesBriefingSendGateResult = {
  shouldSend: boolean
  reason:
    | 'ready'
    | 'send_disabled'
    | 'missing_recipient'
    | 'wrong_hour'
    | 'sunday'
    | 'already_sent'
}

export function evaluateLuxorSalesBriefingSendGate(
  input: LuxorSalesBriefingSendGateInput,
): LuxorSalesBriefingSendGateResult {
  if (input.chicagoWeekdayShort === 'Sun') {
    return { shouldSend: false, reason: 'sunday' }
  }
  if (input.chicagoHour !== LUXOR_SALES_BRIEFING_SEND_HOUR) {
    return { shouldSend: false, reason: 'wrong_hour' }
  }
  if (!input.sendEnabled) {
    return { shouldSend: false, reason: 'send_disabled' }
  }
  if (!input.recipientConfigured) {
    return { shouldSend: false, reason: 'missing_recipient' }
  }
  if (input.alreadySent) {
    return { shouldSend: false, reason: 'already_sent' }
  }
  return { shouldSend: true, reason: 'ready' }
}

export function luxorSalesBriefingSendEnabled() {
  return process.env.LUXOR_SALES_BRIEFING_SEND_ENABLED === '1'
}

export function luxorSalesBriefingRecipient() {
  return process.env.LUXOR_SALES_BRIEFING_TO?.trim() || ''
}