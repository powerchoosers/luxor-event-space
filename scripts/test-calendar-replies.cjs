/* Offline only: generated signing keys and DNS fixtures; no network or mail. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const nodemailer = require('nodemailer')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const { parseLuxorCalendarReply: parse } = load('src/lib/luxorCalendarReply.ts')
  const { inspectLuxorCalendarReply: inspect } = load('src/lib/luxorCalendarReplyServer.ts', {
    './supabaseRestServer': { supabaseRest() { throw new Error('No database calls permitted in offline tests') } },
  })
  const reply = ['BEGIN:VCALENDAR','VERSION:2.0','METHOD:REPLY','BEGIN:VEVENT',
    'UID:tour-test@luxoratlaspalmas.com','SEQUENCE:2','DTSTAMP:20260828T030000Z',
    'ORGANIZER:mailto:booking@luxoratlaspalmas.com',
    'ATTENDEE;PARTSTAT=ACCEPTED:mailto:guest@example.com','END:VEVENT','END:VCALENDAR',''].join('\r\n')
  assert.deepEqual(parse(reply), { uid: 'tour-test@luxoratlaspalmas.com', sequence: 2,
    attendeeEmail: 'guest@example.com', partstat: 'ACCEPTED', stamp: '2026-08-28T03:00:00.000Z' })
  assert.equal(parse(reply.replace('PARTSTAT=ACCEPTED', 'PARTSTAT=\r\n ACCEPTED')).partstat, 'ACCEPTED')
  for (const invalid of [
    reply.replace('METHOD:REPLY', 'METHOD:REQUEST'),
    reply.replace('SEQUENCE:2', 'SEQUENCE:2\r\nSEQUENCE:3'),
    reply.replace('SEQUENCE:2', 'SEQUENCE:-1'),
    reply.replace('UID:tour-test@luxoratlaspalmas.com', 'UID:a\r\nUID:b'),
    reply.replace('booking@luxoratlaspalmas.com', 'attacker@example.com'),
    reply.replace('PARTSTAT=ACCEPTED', 'PARTSTAT=DELEGATED'),
    reply.replace('PARTSTAT=ACCEPTED', 'PARTSTAT=ACCEPTED;SENT-BY="mailto:proxy@example.com"'),
    reply.replace('END:VEVENT', 'RRULE:FREQ=DAILY\r\nEND:VEVENT'),
    reply.replace('END:VCALENDAR', 'BEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR'),
    reply.replace('20260828T030000Z', '20260828T030000'),
  ]) assert.equal(parse(invalid), null, invalid)
  console.log('PASS RSVP parsing, folded lines, duplicate fields, organizer/attendee, recurrence and timestamp restrictions')

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } })
  const dnsKey = publicKey.replace(/-----[^-]+-----|\s/g, '')
  const resolver = async (name, type) => {
    assert.equal(type, 'TXT'); assert.equal(name, 'test._domainkey.example.com')
    return [[`v=DKIM1; k=rsa; p=${dnsKey}`]]
  }
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' })
  const message = { from: 'guest@example.com', to: 'booking@luxoratlaspalmas.com', subject: 'Accepted: tour',
    text: 'Accepted', icalEvent: { method: 'REPLY', content: reply },
    dkim: { domainName: 'example.com', keySelector: 'test', privateKey } }
  const raw = (await transport.sendMail(message)).message
  assert.equal((await inspect(raw, 'guest@example.com', resolver)).verified, true, 'Actual aligned DKIM signature')
  assert.equal((await inspect(raw, 'other@example.com', resolver)).replies.length, 0)
  const unsigned = (await transport.sendMail({ ...message, dkim: undefined,
    headers: { 'Authentication-Results': 'attacker; dkim=pass header.d=example.com' } })).message
  const unverified = await inspect(unsigned, 'guest@example.com', resolver)
  assert.equal(unverified.verified, false, 'Never trust supplied Authentication-Results')
  assert.equal(unverified.replies.length, 1, 'Unsigned matching reply can be reviewed by the owner')
  const tampered = Buffer.from(raw.toString().replace('Accepted\r\n', 'Tampered\r\n'))
  assert.notDeepEqual(tampered, raw)
  assert.equal((await inspect(tampered, 'guest@example.com', resolver)).verified, false)
  const noContentSignature = (await transport.sendMail({ ...message,
    dkim: { ...message.dkim, headerFieldNames: 'from:to:subject:date:message-id' } })).message
  assert.equal((await inspect(noContentSignature, 'guest@example.com', resolver)).verified, false, 'MIME interpretation must be signed')
  const duplicateFrom = Buffer.concat([Buffer.from('From: attacker@example.com\r\n'), raw])
  assert.equal((await inspect(duplicateFrom, 'guest@example.com', resolver)).replies.length, 0)
  console.log('PASS real DKIM signatures, spoofed auth headers, tampered bodies, unsigned MIME headers and duplicate From')

  const { buildLuxorCalendarMessage: build } = load('src/lib/luxorCalendarInviteServer.ts')
  const common = { attendeeEmail: 'guest@example.com', title: 'Private tour', description: 'Tour', location: 'Luxor',
    uid: 'tour-test@luxoratlaspalmas.com', start: new Date('2026-09-10T15:00:00Z'),
    end: new Date('2026-09-10T15:30:00Z'), stamp: new Date('2026-08-28T03:00:00Z'), created: new Date('2026-08-27T03:00:00Z') }
  const cancel = build({ ...common, method: 'CANCEL', sequence: 3 })
  assert.match(cancel.icalEvent.content, /METHOD:CANCEL/)
  assert.match(cancel.icalEvent.content, /STATUS:CANCELLED/)
  assert.match(cancel.icalEvent.content, /SEQUENCE:3/)
  assert.match(cancel.icalEvent.content, /CREATED:20260827T030000Z/)
  assert.match(cancel.icalEvent.content, /UID:tour-test@luxoratlaspalmas.com/)
  assert.match(cancel.icalEvent.content.replace(/\r\n /g, ''), /RSVP=FALSE/)
  assert.match((await transport.sendMail({ ...cancel, from: 'booking@luxoratlaspalmas.com', to: common.attendeeEmail })).message.toString(),
    /Content-Type: text\/calendar; charset=utf-8; method=CANCEL/)
  console.log('PASS cancellation MIME, stable UID, increasing sequence, original creation timestamp and RSVP disabled')

  let sends = 0
  let current = { uid: common.uid, sequence: 3, status: 'confirmed', state: { attendeeEmails: [common.attendeeEmail] } }
  const { deliverLuxorCalendarJob: deliver } = load('src/lib/luxorCalendarServer.ts', {
    './supabaseRestServer': { supabaseRest: async () => current ? [current] : [] },
    './luxorResendMailServer': { sendLuxorResendEmail: async (message) => {
      sends++
      assert.equal(message.idempotencyKey, 'email-job/fixture')
      assert.equal(message.to, common.attendeeEmail)
      return { messageId: 'offline' }
    } },
  })
  const snapshot = { ...common, sequence: 2, method: 'REQUEST', attendeeEmail: common.attendeeEmail,
    startUtc: common.start.toISOString(), endUtc: common.end.toISOString(), stamp: common.stamp.toISOString(), createdAt: common.created.toISOString() }
  const job = { id: 'fixture', inquiry_id: 'inquiry', calendar_revision_id: 'revision', calendar_method: 'REQUEST',
    recipient_email: common.attendeeEmail, metadata: { calendar_snapshot: snapshot } }
  assert.equal((await deliver(job)).status, 'skipped', 'Old invitation must not overwrite a reschedule')
  job.calendar_method = snapshot.method = 'CANCEL'
  assert.equal((await deliver(job)).status, 'skipped', 'Old cancellation must not cancel an attendee added back later')
  current.state.attendeeEmails = []
  assert.equal((await deliver(job)).status, 'sent', 'Removed attendee still needs the cancellation')
  current = { ...current, sequence: 2, status: 'cancelled' }
  job.calendar_method = snapshot.method = 'REQUEST'
  assert.equal((await deliver(job)).status, 'skipped', 'Cancelled event must not send its old request')
  current.status = 'confirmed'
  assert.equal((await deliver(job)).status, 'sent')
  job.recipient_email = 'attacker@example.com'
  await assert.rejects(() => deliver(job), /snapshot does not match/)
  assert.equal(sends, 2)
  console.log('PASS queued revision supersession, removed/re-added attendees, cancelled events and recipient snapshot validation')
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
