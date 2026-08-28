/* Read-only migration diagnostic. Supply saved event UIDs as command arguments.
 * Run using the approved Vercel project's environment; never print credentials.
 * This does not load/overwrite .env.local, send invitations, or write to Zoho/DB.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const uids = process.argv.slice(2)
  if (!uids.length || uids.length > 50 || uids.some(uid => !/^[A-Za-z0-9._@-]{8,255}$/.test(uid))) {
    throw new Error('Provide between 1 and 50 saved event UIDs.')
  }
  const source = load('src/lib/zohoMailServer.ts')
  for (const [index, uid] of uids.entries()) {
    const { event, observedAt } = await source.readLuxorZohoCalendarEvent(uid)
    console.log(JSON.stringify({ item: index + 1, observedAt, dateandtime: event.dateandtime,
      status: event.estatus, hasEtag: Boolean(event.etag), hasSequence: event.sequence !== undefined,
      sequence: event.sequence, lastModified: event.lastmodifiedtime }))
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
