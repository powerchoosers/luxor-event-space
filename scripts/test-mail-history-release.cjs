/* Offline release authorization and orchestration. Never contacts a provider. */
/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const { load } = require('./test-resend-mail.cjs')

async function main() {
  const passId = 'f1234567-1234-1234-1234-123456789012'
  const calls = []
  let verifyFails = false
  let wrongMailbox = false
  let noRun = false
  const helper = load('src/lib/luxorMailReleaseServer.ts', {
    './zohoMailServer': {
      getLuxorZohoImportAccount: () => ({ accountId: '10001', mailbox: 'booking@luxoratlaspalmas.com' }),
      verifyLuxorZohoImportAccount: async () => { calls.push('verify'); if (verifyFails) throw new Error('private token diagnostic') },
    },
    './supabaseRestServer': { supabaseRest: async (url, init) => {
      calls.push({ url, body: init?.body && JSON.parse(init.body) })
      if (url.startsWith('luxor_mail_import_runs?')) return noRun ? [] : [{ id: 'run-id', mailbox: wrongMailbox ? 'other@example.invalid' : 'booking@luxoratlaspalmas.com' }]
      if (url === 'rpc/luxor_mail_history_release_review') return { ready: false, blockers: ['Needs review'] }
      if (url === 'rpc/luxor_release_mail_history') return { id: 'release-id' }
      throw new Error(`Unexpected RPC ${url}`)
    } },
  })
  assert.equal((await helper.getLuxorMailReleaseReview('run-id')).ready, false)
  calls.length = 0
  await helper.releaseLuxorMailHistory({ passId, retainMissing: true }, 'owner@example.invalid')
  assert.equal(calls[1], 'verify')
  assert.deepEqual(calls[2], { url: 'rpc/luxor_release_mail_history', body: {
    p_run_id: 'run-id', p_pass_id: passId, p_reviewed_by: 'owner@example.invalid', p_retain_missing: true,
  } })
  for (const mode of ['noRun', 'wrongMailbox', 'verifyFails']) {
    calls.length = 0
    noRun = mode === 'noRun'; wrongMailbox = mode === 'wrongMailbox'; verifyFails = mode === 'verifyFails'
    await assert.rejects(() => helper.releaseLuxorMailHistory({ passId, retainMissing: true }, 'owner@example.invalid'))
    assert.ok(!calls.some(c => c.url === 'rpc/luxor_release_mail_history'), 'Account checks precede any mutation')
  }

  let session = null
  let fail = false
  const released = []
  const route = load('src/app/api/portal/mail-import/route.ts', {
    'next/server': { NextResponse: Response },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
    '@/lib/luxorMailImportServer': { getLuxorMailImportStatus: async () => ({ run: { released: true, readyForCutover: false } }) },
    '@/lib/luxorMailReleaseServer': { releaseLuxorMailHistory: async (...args) => {
      if (fail) throw new Error('private database detail')
      released.push(args)
    } },
  })
  const origin = 'https://luxor.example.invalid'
  const valid = { action: 'release_history', confirm: 'release-verified-history', passId, retainMissing: true }
  const post = (body = valid, headers = {}, raw) => route.POST(new Request(`${origin}/api/portal/mail-import`, {
    method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: raw ?? JSON.stringify(body),
  }))
  assert.equal((await post()).status, 401)
  session = { email: 'owner@example.invalid' }
  assert.equal((await post(valid, { origin: 'https://attacker.example.invalid' })).status, 403)
  assert.equal((await post(valid, { 'content-type': 'text/plain' })).status, 415)
  for (const body of [null, [], { ...valid, confirm: '' }, { ...valid, passId: 'bad' }, { ...valid, retainMissing: 'true' }]) {
    assert.equal((await post(body)).status, 400)
  }
  assert.equal((await post(valid, {}, '{')).status, 400)
  assert.equal((await post({ ...valid, extra: 'ñ'.repeat(600) })).status, 413, 'Body bound counts UTF-8 bytes')
  assert.equal(released.length, 0)
  const response = await post({ ...valid, reviewedBy: 'spoof@example.invalid' })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(released[0], [{ passId, retainMissing: true }, 'owner@example.invalid'])
  assert.equal((await response.json()).run.readyForCutover, false)
  fail = true
  const failure = await post()
  assert.equal(failure.status, 409)
  assert.doesNotMatch(await failure.text(), /private database/)
  console.log('PASS source account checks, explicit release confirmation, session-derived reviewer, same-origin JSON, byte bounds and sanitized conflicts')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
