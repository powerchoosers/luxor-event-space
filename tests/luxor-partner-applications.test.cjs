const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')

test('market vendor route validates idempotency key requirement', async () => {
  const filename = path.resolve('src/app/api/public/partner-applications/market-vendor/route.ts')
  const source = fs.readFileSync(filename, 'utf8')
  assert.match(source, /idempotency-key/)
  assert.match(source, /partner_application_attempt/)
  assert.doesNotMatch(source, /luxorEmailJobs|sendLuxor|resend/i)
})

test('partner applications migration defines expected tables', () => {
  const filename = path.resolve('supabase/migrations/20261116120000_luxor_partner_applications.sql')
  const source = fs.readFileSync(filename, 'utf8')
  assert.match(source, /luxor_market_events/)
  assert.match(source, /luxor_partner_applications/)
  assert.match(source, /luxor_partner_application_files/)
  const photos = fs.readFileSync(path.resolve('src/lib/luxorPartnerApplicationPhotosServer.ts'), 'utf8')
  assert.match(photos, /partner-applications\//)
})