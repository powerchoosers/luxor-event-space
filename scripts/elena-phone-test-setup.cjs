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
    if (snapshot.version !== 1 || snapshot.number?.sid !== TEST_SID || snapshot.number?.phoneNumber !== TEST_NUMBER || snapshot.number?.accountSid !== accountSid || !/^TK[0-9a-f]{32}$/i.test(snapshot.trunkSid || '')) throw new Error('Snapshot does not match the approved account and test number.')
    console.log(JSON.stringify({ action: 'restore_test_number', number: TEST_NUMBER, apply, snapshotPath: path.resolve(inputPath), publicNumberUntouched: true }, null, 2))
    if (!apply) return
    const currentlyAttached = await client.trunking.v1.trunks(snapshot.trunkSid).phoneNumbers.list({ limit: 100 })
    if (currentlyAttached.some((item) => item.sid !== TEST_SID)) throw new Error('The snapshot trunk is now shared. Refusing rollback of shared trunk settings.')
    // Restore number routing first, before restoring the dedicated trunk's settings.
    const { sid, phoneNumber, accountSid: ignoredAccountSid, ...restore } = snapshot.number
    void sid; void phoneNumber; void ignoredAccountSid
    await client.incomingPhoneNumbers(TEST_SID).update({ ...restore, trunkSid: restore.trunkSid || '', voiceApplicationSid: restore.voiceApplicationSid || '' })
    const trunk = client.trunking.v1.trunks(snapshot.trunkSid)
    if (snapshot.createdOriginationSid) await trunk.originationUrls(snapshot.createdOriginationSid).remove()
    await trunk.update({ secure: Boolean(snapshot.trunk.secure), transferMode: snapshot.trunk.transferMode })
    const restored = await client.incomingPhoneNumbers(TEST_SID).fetch()
    if ((restored.trunkSid || '') !== (snapshot.number.trunkSid || '') || restored.voiceUrl !== snapshot.number.voiceUrl || restored.smsUrl !== snapshot.number.smsUrl) throw new Error('Rollback verification failed. Inspect the saved snapshot before further changes.')
    console.log('The approved test number routing was restored. The public number was not changed.')
    return
  }

  const projectId = need('OPENAI_PROJECT_ID', /^proj_[A-Za-z0-9_-]+$/)
  const trunkSid = need('LUXOR_ELENA_TEST_TRUNK_SID', /^TK[0-9a-f]{32}$/i)
  if (number.trunkSid && number.trunkSid !== trunkSid) throw new Error('The selected number belongs to another trunk. Review its routing before proceeding.')
  const healthResponse = await fetch(`${BASE}/api/webhooks/openai-voice`, { redirect: 'error', signal: AbortSignal.timeout(10000), cache: 'no-store' })
  const health = await jsonResponse(healthResponse)
  if (health.service !== 'luxor-elena-phone-test' || health.ready !== true || health.bookingMode !== 'rehearsal') throw new Error('The deployed phone-test endpoint is not ready. No Twilio changes made.')
  const mcpResponse = await fetch(`${BASE}/api/elena-phone-test/mcp`, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }), signal: AbortSignal.timeout(10000) })
  if (mcpResponse.status !== 401) throw new Error('The deployed MCP endpoint did not reject an unauthenticated request. No Twilio changes made.')
  const trunk = await client.trunking.v1.trunks(trunkSid).fetch()
  const attached = await client.trunking.v1.trunks(trunkSid).phoneNumbers.list({ limit: 100 })
  if (attached.some((item) => item.sid !== TEST_SID)) throw new Error('The test trunk contains other numbers. A dedicated trunk is required.')
  const origins = await client.trunking.v1.trunks(trunkSid).originationUrls.list({ limit: 100 })
  const uri = `sip:${projectId}@sip.api.openai.com;transport=tls`
  if (origins.some((item) => item.sipUrl !== uri || !item.enabled)) throw new Error('The trunk has unexpected origination routes. Review it before continuing.')
  const snapshot = { version: 1, createdAt: new Date().toISOString(), number: snapshotNumber(number), trunkSid, trunk: { secure: trunk.secure, transferMode: trunk.transferMode }, origins: origins.map((item) => ({ sid: item.sid, sipUrl: item.sipUrl, enabled: item.enabled, priority: item.priority, weight: item.weight })), createdOriginationSid: null }
  console.log(JSON.stringify({ action: 'configure_elena_test_trunk', number: TEST_NUMBER, apply, publicNumberUntouched: true, smsUntouched: true, bookingMode: 'rehearsal', transferMode: 'real_saved_Arianna_phone' }, null, 2))
  if (!apply) return
  const snapshotDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Luxor', 'elena-phone-test')
  await fs.mkdir(snapshotDir, { recursive: true })
  const snapshotPath = path.join(snapshotDir, `routing-${Date.now()}.json`)
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), { flag: 'wx' })
  console.log(`Rollback snapshot: ${snapshotPath}`)
  await client.trunking.v1.trunks(trunkSid).update({ secure: true, transferMode: 'enable-all' })
  if (!origins.length) {
    const origin = await client.trunking.v1.trunks(trunkSid).originationUrls.create({ sipUrl: uri, friendlyName: 'Luxor Elena test only', priority: 10, weight: 10, enabled: true })
    snapshot.createdOriginationSid = origin.sid
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2))
  }
  if (number.trunkSid !== trunkSid) await client.trunking.v1.trunks(trunkSid).phoneNumbers.create({ phoneNumberSid: TEST_SID })
  await client.incomingPhoneNumbers(TEST_SID).update({ statusCallback: `${BASE}/api/elena-phone-test/status`, statusCallbackMethod: 'POST' })
  const configured = await client.incomingPhoneNumbers(TEST_SID).fetch()
  const configuredTrunk = await client.trunking.v1.trunks(trunkSid).fetch()
  if (configured.trunkSid !== trunkSid || !configuredTrunk.secure || configuredTrunk.transferMode !== 'enable-all' || configured.statusCallback !== `${BASE}/api/elena-phone-test/status` || configured.smsUrl !== number.smsUrl || configured.smsFallbackUrl !== number.smsFallbackUrl) throw new Error(`Routing verification failed. Restore from the snapshot: ${snapshotPath}`)
  console.log('Test trunk and approved number configuration verified. No test call was placed; call quality and transfer answer remain unverified.')
}

main().catch((error) => {
  // Never print provider response bodies or process.env; they may contain secrets or personal data.
  console.error(error?.status || error?.code ? 'Carrier/API operation failed. Inspect the saved routing snapshot before retrying.' : error.message)
  process.exitCode = 1
})
