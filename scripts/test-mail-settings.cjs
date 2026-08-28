/* Offline status checks: never send mail, verify DNS or expose secret values. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  let failRead = false; let events = []; let reads = 0
  const keys = ['RESEND_API_KEY', 'RESEND_WEBHOOK_SECRET', 'ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_ACCOUNT_ID']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  const config = load('src/lib/luxorMailSettingsServer.ts', {
    './luxorCalendarInviteServer': { luxorCalendarInviteConfig: () => ({ configured: false }) },
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      assert.equal(init, undefined, 'Settings must be read only')
      assert.equal(url, 'luxor_resend_events?select=received_at,processed_at&order=received_at.desc&limit=1')
      reads++; if (failRead) throw new Error('Sensitive database error'); return events
    } },
  })
  process.env.LUXOR_MAIL_PROVIDER = 'zoho'; process.env.LUXOR_MAIL_FROM = 'booking@luxoratlaspalmas.com'
  try {
    for (const key of keys) delete process.env[key]
    let result = await config.getLuxorMailSettings()
    assert.equal(result.activeProvider, 'zoho'); assert.equal(result.resend.apiKeyPresent, false)
    assert.equal(result.resend.lastWebhookAt, null); assert.equal(result.resend.activityAvailable, true)
    for (const key of keys) process.env[key] = 'private-fixture-value'
    process.env.LUXOR_MAIL_PROVIDER = 'resend'
    events = [{ received_at: '2026-08-28T12:00:00Z', processed_at: '2026-08-28T12:01:00Z', payload: 'private-body' }]
    result = await config.getLuxorMailSettings()
    assert.equal(result.activeProvider, 'resend'); assert.equal(result.resend.apiKeyPresent, true)
    assert.equal(result.resend.webhookSecretPresent, true); assert.equal(result.zoho.credentialsPresent, true)
    assert.equal(result.resend.lastWebhookAt, '2026-08-28T12:00:00.000Z')
    assert.equal(result.resend.webhookUrl, 'https://www.luxoratlaspalmas.com/api/webhooks/resend')
    assert.ok(!JSON.stringify(result).includes('private-'))
    failRead = true
    result = await config.getLuxorMailSettings()
    assert.equal(result.resend.activityAvailable, false); assert.equal(result.resend.lastWebhookAt, null)
    assert.equal(result.activeProvider, 'resend')
    process.env.LUXOR_MAIL_PROVIDER = 'invalid'
    const previousReads = reads
    await assert.rejects(() => config.getLuxorMailSettings())
    assert.equal(reads, previousReads, 'Invalid provider must not silently fall back')
  } finally {
    for (const key of keys) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key] }
  }
  let session = null; let settingsReads = 0; let fails = false
  const route = load('src/app/api/portal/mail-settings/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
    '@/lib/luxorMailSettingsServer': { getLuxorMailSettings: async () => { settingsReads++; if (fails) throw new Error('private fixture diagnostic'); return { activeProvider: 'zoho' } } },
  })
  const denied = await route.GET()
  assert.equal(denied.status, 401); assert.equal(settingsReads, 0); assert.match(denied.headers.get('cache-control'), /no-store/)
  session = { email: 'owner@example.invalid' }
  const accepted = await route.GET()
  assert.equal(accepted.status, 200); assert.match(accepted.headers.get('cache-control'), /private, no-store/)
  fails = true
  const failed = await route.GET()
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes('private fixture'))
  console.log('PASS read-only provider status, secret redaction, missing versus unavailable activity, no silent provider fallback, authentication and private no-store responses')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
