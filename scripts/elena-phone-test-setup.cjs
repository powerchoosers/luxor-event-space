'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
// Dry-run by default. Load ignored env with: node --env-file=.env.local scripts/elena-phone-test-setup.cjs
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const twilio = require('twilio')

const TEST_NUMBER = '+18176630380'
const TEST_SID = 'PN3339992846524f8140edc3dca201fbfe'
const PUBLIC_NUMBER = '+19563652037'
const BASE = 'https://www.luxoratlaspalmas.com'
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const rollbackIndex = args.indexOf('--rollback')

function need(name, pattern) {
  const value = process.env[name] || ''
  if (!value || (pattern && !pattern.test(value))) throw new Error(`Missing or invalid ${name}.`)
  return value
}
function snapshotNumber(number) {
  return Object.fromEntries(['sid', 'phoneNumber', 'accountSid', 'trunkSid', 'voiceUrl', 'voiceMethod', 'voiceFallbackUrl', 'voiceFallbackMethod', 'statusCallback', 'statusCallbackMethod', 'smsUrl', 'smsMethod', 'smsFallbackUrl', 'smsFallbackMethod', 'voiceApplicationSid'].map((key) => [key, number[key]]))
}
async function jsonResponse(response) {
  if (!response.ok) throw new Error(`Readiness check failed (${response.status}).`)
  return response.json()
}

async function main() {
  const accountSid = need('LUXOR_TWILIO_ACCOUNT_SID', /^AC[0-9a-f]{32}$/i)
  const client = twilio(accountSid, need('LUXOR_TWILIO_AUTH_TOKEN'), { timeout: 10000, autoRetry: false })
  const number = await client.incomingPhoneNumbers(TEST_SID).fetch()
  if (number.phoneNumber !== TEST_NUMBER || number.phoneNumber === PUBLIC_NUMBER || number.accountSid !== accountSid) throw new Error('The approved owned test number did not match. No changes made.')
  const dbUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  if (!/^https:\/\//.test(dbUrl)) throw new Error('Supabase URL is required to protect the current public number.')
  const serviceKey = need('SUPABASE_SERVICE_ROLE_KEY')
  const managed = await jsonResponse(await fetch(`${dbUrl}/rest/v1/luxor_phone_numbers?select=phone_number,is_public,is_active,twilio_number_sid`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, signal: AbortSignal.timeout(10000) }))
  if (!Array.isArray(managed) || !managed.some((row) => row.is_public && row.phone_number === PUBLIC_NUMBER) || managed.some((row) => row.is_public && row.phone_number === TEST_NUMBER)) throw new Error('Luxor public-number protection could not be verified. No changes made.')

  if (rollbackIndex !== -1) {
    const inputPath = args[rollbackIndex + 1]
    if (!inputPath || inputPath.startsWith('--')) throw new Error('Supply the snapshot path after --rollback.')
    const snapshot = JSON.parse(await fs.readFile(path.resolve(inputPath), 'utf8'))
    if (![1, 2].includes(snapshot.version) || snapshot.number?.sid !== TEST_SID || snapshot.number?.phoneNumber !== TEST_NUMBER || snapshot.number?.accountSid !== accountSid || (snapshot.number.trunkSid && !/^TK[0-9a-f]{32}$/i.test(snapshot.number.trunkSid))) throw new Error('Snapshot does not match the approved account and test number.')
    console.log(JSON.stringify({ action: 'restore_test_number', number: TEST_NUMBER, apply, snapshotPath: path.resolve(inputPath), publicNumberUntouched: true }, null, 2))
    if (!apply) return
    // Restore only this number. Trunk configuration and other attached numbers are never modified.
    const { sid, phoneNumber, accountSid: ignoredAccountSid, trunkSid: savedTrunkSid, voiceApplicationSid: savedApplicationSid, ...restore } = snapshot.number
    void sid; void phoneNumber; void ignoredAccountSid
    // Do not submit competing non-empty application and trunk SIDs in the same update.
    await client.incomingPhoneNumbers(TEST_SID).update(savedTrunkSid
      ? { ...restore, trunkSid: savedTrunkSid }
      : { ...restore, trunkSid: '', voiceApplicationSid: savedApplicationSid || '' })
    const restored = await client.incomingPhoneNumbers(TEST_SID).fetch()
    if ((restored.trunkSid || '') !== (snapshot.number.trunkSid || '') || restored.voiceUrl !== snapshot.number.voiceUrl || restored.smsUrl !== snapshot.number.smsUrl) throw new Error('Rollback verification failed. Inspect the saved snapshot before further changes.')
    console.log('The approved test number routing was restored. The public number was not changed.')
    return
  }

  need('OPENAI_PROJECT_ID', /^proj_[A-Za-z0-9_-]+$/)
  const expectedFormerTrunk = process.env.LUXOR_ELENA_TEST_TRUNK_SID || ''
  if (number.trunkSid && number.trunkSid !== expectedFormerTrunk) throw new Error('The selected number belongs to an unexpected trunk. Review its routing before proceeding.')
  const healthResponse = await fetch(`${BASE}/api/webhooks/openai-voice`, { redirect: 'error', signal: AbortSignal.timeout(10000), cache: 'no-store' })
  const health = await jsonResponse(healthResponse)
  if (health.service !== 'luxor-elena-phone-test' || health.ready !== true || health.bookingMode !== 'rehearsal') throw new Error('The deployed phone-test endpoint is not ready. No Twilio changes made.')
  const mcpResponse = await fetch(`${BASE}/api/elena-phone-test/mcp`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }), signal: AbortSignal.timeout(10000) })
  if (mcpResponse.status !== 401) throw new Error('The deployed MCP endpoint did not reject an unauthenticated request. No Twilio changes made.')
  for (const route of ['incoming', 'fallback', 'status']) {
    const response = await fetch(`${BASE}/api/elena-phone-test/${route}`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '', signal: AbortSignal.timeout(10000) })
    if (response.status !== 403) throw new Error(`The deployed ${route} endpoint did not reject an unsigned request. No Twilio changes made.`)
  }
  const snapshot = { version: 2, createdAt: new Date().toISOString(), number: snapshotNumber(number) }
  console.log(JSON.stringify({ action: 'configure_elena_programmable_test_line', number: TEST_NUMBER, apply, detachSelectedNumberOnly: Boolean(number.trunkSid), publicNumberUntouched: true, smsUntouched: true, bookingMode: 'rehearsal', transferMode: 'real_saved_Arianna_phone' }, null, 2))
  if (!apply) return
  const snapshotDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Luxor', 'elena-phone-test')
  await fs.mkdir(snapshotDir, { recursive: true })
  const snapshotPath = path.join(snapshotDir, `routing-${Date.now()}.json`)
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), { flag: 'wx' })
  console.log(`Rollback snapshot: ${snapshotPath}`)
  // Install the working fallback and signed ingress before removing the old trunk association.
  await client.incomingPhoneNumbers(TEST_SID).update({ voiceUrl: `${BASE}/api/elena-phone-test/incoming`, voiceMethod: 'POST', voiceFallbackUrl: `${BASE}/api/elena-phone-test/fallback`, voiceFallbackMethod: 'POST', statusCallback: `${BASE}/api/elena-phone-test/status`, statusCallbackMethod: 'POST', voiceApplicationSid: '' })
  const routed = await client.incomingPhoneNumbers(TEST_SID).fetch()
  if (routed.trunkSid) {
    if (routed.trunkSid !== number.trunkSid) throw new Error(`The number's trunk changed concurrently. Review routing and snapshot: ${snapshotPath}`)
    // This removes the association, not the owned phone number or the SIP trunk.
    await client.trunking.v1.trunks(routed.trunkSid).phoneNumbers(TEST_SID).remove()
  }
  const configured = await client.incomingPhoneNumbers(TEST_SID).fetch()
  if (configured.trunkSid || configured.voiceApplicationSid || configured.voiceUrl !== `${BASE}/api/elena-phone-test/incoming` || configured.voiceFallbackUrl !== `${BASE}/api/elena-phone-test/fallback` || configured.statusCallback !== `${BASE}/api/elena-phone-test/status` || configured.smsUrl !== number.smsUrl || configured.smsFallbackUrl !== number.smsFallbackUrl) throw new Error(`Routing verification failed. Restore from the snapshot: ${snapshotPath}`)
  console.log('Approved test number Programmable Voice routing verified. No test call was placed; call quality and transfer answer remain unverified.')
}

main().catch((error) => {
  // Never print provider response bodies or process.env; they may contain secrets or personal data.
  console.error(error?.status || error?.code ? 'Carrier/API operation failed. Inspect the saved routing snapshot before retrying.' : error.message)
  process.exitCode = 1
})
