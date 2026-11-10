/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function load(stubs) {
  const filename = path.resolve('src/lib/luxorResendWebhookServer.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return loaded.exports
}

test('a copied invoice passes the event and received-mail gates into bill intake', async () => {
  const event = { type: 'email.received', created_at: '2026-11-09T12:00:00Z', data: { email_id: 'provider-id', to: ['other@example.invalid'], cc: ['invoices@luxoratlaspalmas.com'], received_for: ['invoices@luxoratlaspalmas.com'] } }
  const row = { id: 'saved-message', provider: 'resend', provider_id: 'provider-id', direction: 'incoming', thread_key: 'thread', from_address: 'supplier@example.invalid', to_addresses: ['other@example.invalid'], cc_addresses: ['invoices@luxoratlaspalmas.com'], subject: 'Water', occurred_at: event.created_at, metadata: { arrivalBroadcastAt: 'done', arrivalPushAt: 'done' } }
  const savedEvent = { event_id: 'event', payload: event, processed_at: null, attempts: 0, lease_until: null }
  const archived = [{ id: 'saved-attachment', message_id: row.id, source_key: 'part', filename: 'water.pdf', content_type: 'application/pdf', size_bytes: 100, content_id: null }]
  const enqueueCalls = []
  const stubs = {
    'server-only': {},
    './supabaseRestServer': { supabaseRest: async (url, options) => {
      if (url.startsWith('luxor_resend_events?select=')) return [savedEvent]
      if (url.startsWith('luxor_resend_events?') && options?.method === 'PATCH' && url.includes('processed_at=is.null')) return [savedEvent]
      if (url.startsWith('luxor_mail_messages?select=')) return [row]
      return []
    } },
    './luxorResendApiServer': { luxorResendApi: async () => ({ id: 'provider-id', from: row.from_address, to: row.to_addresses, cc: row.cc_addresses, reply_to: [], subject: row.subject, text: '', html: null, message_id: 'mail-id', created_at: event.created_at, headers: {}, attachments: [] }) },
    './luxorMailConfig': { luxorMailAddress: (value) => value.trim().toLowerCase(), luxorMailSenders: () => ['booking@luxoratlaspalmas.com'] },
    './luxorMailboxServer': { listLuxorMailAttachments: async () => archived, luxorMailMessage: () => ({ id: row.id }), updateLuxorMailRow: async () => {} },
    './luxorCalendarReplyServer': {},
    './luxorZohoWebhookServer': {},
    './luxorBillIntakeServer': { enqueueLuxorInvoiceAttachments: async (message, attachments) => { enqueueCalls.push({ message, attachments }); return message.id } },
    './luxorWebPushServer': {}, './luxorResendBounceHandler': {}, './luxorResendBouncePush': {}, './luxorInvoicesServer': {}, './luxorTestEmailDelivery': {},
  }
  const { storeLuxorResendEvent, processLuxorResendEvent } = load(stubs)
  assert.equal(await storeLuxorResendEvent('event', event), true)
  assert.equal(await storeLuxorResendEvent('envelope-event', { ...event, data: { ...event.data, cc: [] } }), true)
  assert.equal(await processLuxorResendEvent('event'), row.id)
  assert.equal(enqueueCalls.length, 1)
  assert.equal(enqueueCalls[0].attachments[0].id, 'saved-attachment')
  assert.deepEqual(enqueueCalls[0].message.cc_addresses, ['invoices@luxoratlaspalmas.com'])
  assert.equal(await storeLuxorResendEvent('other', { ...event, data: { to: ['other@example.invalid'], cc: [], received_for: [] } }), false)
})
