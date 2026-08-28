import ICAL from 'ical.js'
import { luxorMailAddress } from './luxorMailConfig'

export type LuxorCalendarReply = { uid: string; sequence: number; attendeeEmail: string; partstat: 'ACCEPTED' | 'TENTATIVE' | 'DECLINED'; stamp: string }

/** Parse only a single, non-recurring attendee REPLY, never an organizer update. */
export function parseLuxorCalendarReply(content: string): LuxorCalendarReply | null {
  if (Buffer.byteLength(content) > 256_000) return null
  try {
    const calendar = new ICAL.Component(ICAL.parse(content))
    if (calendar.name !== 'vcalendar' || calendar.getAllProperties('method').length !== 1
      || String(calendar.getFirstPropertyValue('method')).toUpperCase() !== 'REPLY') return null
    const events = calendar.getAllSubcomponents('vevent')
    if (events.length !== 1) return null
    const event = events[0]
    if (event.hasProperty('recurrence-id') || event.hasProperty('rrule')) return null
    if (['uid','organizer','dtstamp'].some((key) => event.getAllProperties(key).length !== 1)
      || event.getAllProperties('sequence').length > 1) return null
    if (String(event.getFirstPropertyValue('organizer')).toLowerCase() !== 'mailto:booking@luxoratlaspalmas.com') return null
    const attendees = event.getAllProperties('attendee')
    if (attendees.length !== 1) return null
    const attendee = attendees[0]
    if (attendee.getParameter('sent-by') || attendee.getParameter('delegated-from') || attendee.getParameter('delegated-to')) return null
    const address = String(attendee.getFirstValue())
    if (!/^mailto:/i.test(address)) return null
    const attendeeEmail = luxorMailAddress(address.slice(7))
    const partstat = String(attendee.getParameter('partstat')).toUpperCase()
    const sequence = Number(event.getFirstPropertyValue('sequence') ?? 0)
    const uid = String(event.getFirstPropertyValue('uid') || '')
    const stamp = event.getFirstPropertyValue('dtstamp')
    if (!attendeeEmail || !['ACCEPTED','TENTATIVE','DECLINED'].includes(partstat)
      || !Number.isSafeInteger(sequence) || sequence < 0 || !uid || uid.length > 255
      || !(stamp instanceof ICAL.Time) || stamp.isDate || stamp.zone.tzid !== 'UTC') return null
    return { uid, sequence, attendeeEmail, partstat: partstat as LuxorCalendarReply['partstat'], stamp: stamp.toJSDate().toISOString() }
  } catch { return null }
}
