'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
// Dry run by default. The live feature gate is managed separately in Vercel.
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const twilio = require('twilio')

const PUBLIC_NUMBER = '+19563652037'
const BASE = 'https://www.luxoratlaspalmas.com'
const CALLBACK = `${BASE}/api/elena-inbound/status`
const fields = ['sid', 'phoneNumber', 'accountSid', 'trunkSid', 'voiceApplicationSid', 'voiceUrl', 'voiceMethod', 'voiceFallbackUrl', 'voiceFallbackMethod', 'statusCallback', 'statusCallbackMethod', 'smsUrl', 'smsMethod', 'smsFallbackUrl', 'smsFallbackMethod']
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const rollbackIndex = args.indexOf('--rollback')
function snapshot(number) { return Object.fromEntries(fields.map((key) => [key, number[key] || ''])) }
function required(name) { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}.`); return value }
function unchanged(before, after) { return fields.filter((key) => !['statusCallback', 'statusCallbackMethod'].includes(key)).every((key) => before[key] === after[key]) }

async function main() {
  const account = required('LUXOR_TWILIO_ACCOUNT_SID')
  const client = twilio(account, required('LUXOR_TWILIO_AUTH_TOKEN'), { timeout: 10000, autoRetry: false })
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
  const key = required('SUPABASE_SERVICE_ROLE_KEY')
  if (!/^https:\/\//.test(url)) throw new Error('Supabase URL is unavailable.')
  const res = await fetch(`${url}/rest/v1/luxor_phone_numbers?select=phone_number,twilio_number_sid,is_public&is_public=eq.true&limit=2`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error('Could not verify the selected number.')
  const selected = await res.json()
  if (!Array.isArray(selected) || selected.length !== 1 || selected[0].phone_number !== PUBLIC_NUMBER || !/^PN[0-9a-f]{32}$/i.test(selected[0].twilio_number_sid)) throw new Error('The selected public number could not be verified.')
  const sid = selected[0].twilio_number_sid
  const current = snapshot(await client.incomingPhoneNumbers(sid).fetch())
  if (current.phoneNumber !== PUBLIC_NUMBER || current.accountSid !== account || current.trunkSid || current.voiceApplicationSid || current.voiceUrl !== `${BASE}/api/twilio/incoming` || current.voiceMethod !== 'POST') throw new Error('Public routing is not in the expected state. No changes made.')

  if (rollbackIndex !== -1) {
    const input = args[rollbackIndex + 1]
    if (!input || input.startsWith('--')) throw new Error('A rollback snapshot path is required.')
    const saved = JSON.parse(await fs.readFile(path.resolve(input), 'utf8'))
    if (saved.version !== 1 || saved.number?.sid !== sid || saved.number?.phoneNumber !== PUBLIC_NUMBER || saved.number?.accountSid !== account || !unchanged(saved.number, current) || current.statusCallback !== CALLBACK) throw new Error('Rollback snapshot and current routing do not match. No changes made.')
    console.log(`Restore the prior public-line status callback (apply: ${apply}).`)
    if (!apply) return
    await client.incomingPhoneNumbers(sid).update({ statusCallback: saved.number.statusCallback, statusCallbackMethod: saved.number.statusCallbackMethod || 'POST' })
    const restored = snapshot(await client.incomingPhoneNumbers(sid).fetch())
    if (!unchanged(current, restored) || restored.statusCallback !== saved.number.statusCallback) throw new Error('Rollback verification failed; inspect carrier routing.')
    console.log('Prior status callback restored. Voice and SMS routing remain unchanged.')
    return
  }

  if (current.statusCallback && current.statusCallback !== CALLBACK) throw new Error('A different status callback is configured. No changes made.')
  const unsigned = await fetch(CALLBACK, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: '', redirect: 'error', signal: AbortSignal.timeout(10000) })
  if (unsigned.status !== 403) throw new Error('The deployed callback did not reject an unsigned request. No changes made.')
  console.log(`Configure the public-line status callback only (apply: ${apply}).`)
  if (!apply || current.statusCallback === CALLBACK) return
  const dir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Luxor', 'elena-live')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, `routing-${Date.now()}.json`)
  await fs.writeFile(file, JSON.stringify({ version: 1, createdAt: new Date().toISOString(), number: current }, null, 2), { flag: 'wx' })
  console.log(`Rollback snapshot: ${file}`)
  await client.incomingPhoneNumbers(sid).update({ statusCallback: CALLBACK, statusCallbackMethod: 'POST' })
  const updated = snapshot(await client.incomingPhoneNumbers(sid).fetch())
  if (!unchanged(current, updated) || updated.statusCallback !== CALLBACK || updated.statusCallbackMethod !== 'POST') throw new Error('Carrier verification failed; inspect the rollback snapshot.')
  console.log('Public status callback verified. Voice and SMS routing remain unchanged; no calls placed.')
}
main().catch((error) => { console.error(error?.status || error?.code ? 'Carrier or database request failed; inspect the rollback snapshot before retrying.' : error.message); process.exitCode = 1 })
