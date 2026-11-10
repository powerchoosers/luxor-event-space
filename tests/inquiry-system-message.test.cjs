'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
function load(file, mocks = {}) {
  const filename = path.join(root, file)
  const mod = new Module(filename, module)
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod)
  mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return mod.exports
}
const model = load('src/lib/luxorSystemMessageTemplates.ts')
test('original template renders the existing inquiry text and safe fallbacks', () => {
  assert.equal(model.renderInquiryConfirmation(model.INQUIRY_CONFIRMATION_DEFAULT, { fullName: 'Alessandra Smith', eventType: 'Wedding Reception' }), 'Luxor Event Space: Hi Alessandra, we received your Wedding Reception inquiry and will follow up with availability and next steps. Reply STOP to opt out.')
  assert.match(model.renderInquiryConfirmation(model.INQUIRY_CONFIRMATION_DEFAULT, { fullName: '', eventType: null }), /Hi there, we received your event inquiry/)
})
test('rejects unsupported variables and empty or oversized content', () => {
  assert.throws(() => model.validateInquiryConfirmationTemplate('Hi {{unknown}}'))
  assert.throws(() => model.validateInquiryConfirmationTemplate('Hi {{first_name'))
  assert.throws(() => model.validateInquiryConfirmationTemplate(' '))
  assert.throws(() => model.validateInquiryConfirmationTemplate('x'.repeat(301)))
  assert.match(model.renderInquiryConfirmation('Hello {{first_name}}', { fullName: 'Guest', eventType: null }), /^Luxor Event Space: Hello Guest Reply STOP to opt out\.$/)
})
test('inquiry confirmation supports guest count, target date, and full name', () => {
  const body = 'Hi {{full_name}}, thanks for your {{event_type}} inquiry for {{guest_count}} on {{target_date}}.'
  assert.match(
    model.renderInquiryConfirmation(body, {
      fullName: 'Sarah Jenkins',
      eventType: 'Quinceañera',
      guestCount: 120,
      targetDate: '2026-10-24',
    }),
    /Sarah Jenkins.*Quinceañera.*120.*Oct 24, 2026/,
  )
  assert.match(
    model.renderInquiryConfirmation(body, { fullName: 'Guest', eventType: null, guestCount: null, targetDate: null }),
    /your group.*your requested date/,
  )
})
test('payment confirmation preserves the existing copy and requires the amount', () => {
  assert.equal(model.renderPaymentConfirmation(model.PAYMENT_CONFIRMATION_DEFAULT, { name: 'Sarah Jenkins', amount: '$125.00' }), 'Luxor Event Space: Hi Sarah, we received your payment of $125.00. Thank you. Reply with any questions. Reply STOP to opt out.')
  assert.throws(() => model.validatePaymentConfirmationTemplate('Thank you {{first_name}}'), /amount/)
  assert.throws(() => model.validatePaymentConfirmationTemplate('Payment {{amount}} {{unknown}}'), /Use only/)
})
test('event reminder preserves existing scheduled wording and requires the event date', () => {
  assert.equal(model.renderEventReminder(model.EVENT_REMINDER_DEFAULT, { name: 'Sarah Jenkins', eventType: 'Wedding Reception', timeUntil: 'one week', eventDate: 'October 24, 2026' }), 'Luxor Event Space: Hi Sarah, your Wedding Reception is one week away on October 24, 2026. Reply with any final questions or updates. Reply STOP to opt out.')
  assert.throws(() => model.validateEventReminderTemplate('Hello {{first_name}}'), /event_date/)
  assert.throws(() => model.validateEventReminderTemplate('Your event {{event_date}} {{unknown}}'), /listed event variables/)
})
test('invoice reminders preserve original copy and require the amount and due date', () => {
  const sample = { name: 'Sarah Jenkins', amount: '$125.00', dueDate: 'October 24, 2026' }
  assert.equal(model.renderInvoiceReminder(model.INVOICE_REMINDER_DEFAULTS.invoice_due_reminder, sample), 'Luxor Event Space: Hi Sarah, a friendly reminder that your $125.00 invoice is due October 24, 2026. Please use your secure invoice link or contact us with questions. Reply STOP to opt out.')
  assert.equal(model.renderInvoiceReminder(model.INVOICE_REMINDER_DEFAULTS.invoice_overdue_reminder, sample), 'Luxor Event Space: Hi Sarah, our records show your $125.00 invoice due October 24, 2026 is still unpaid. Please use your secure invoice link or contact us for help. Reply STOP to opt out.')
  assert.throws(() => model.validateInvoiceReminderTemplate('Payment of {{amount}} is due.'), /due_date/)
  assert.throws(() => model.validateInvoiceReminderTemplate('{{amount}} {{due_date}} {{unknown}}'), /listed invoice variables/)
})
test('payment request preserves the original copy and the generated secure link', () => {
  const sample = { name: 'Sarah Jenkins', amount: '$125.00', paymentUrl: 'https://example.invalid/pay' }
  assert.equal(model.renderInvoiceReminder(model.INVOICE_REMINDER_DEFAULTS.invoice_payment_request, sample, 'invoice_payment_request'), 'Luxor Event Space: Hi Sarah, this is a reminder that your $125.00 payment request is still open. Pay securely here: https://example.invalid/pay Reply STOP to opt out.')
  assert.throws(() => model.validateInvoiceReminderTemplate('{{amount}} due', 'invoice_payment_request'), /payment_url/)
  assert.throws(() => model.validateInvoiceReminderTemplate('{{amount}} {{payment_url}} https://example.invalid', 'invoice_payment_request'), /secure payment link/)
  assert.throws(() => model.validateInvoiceReminderTemplate('{{amount}} {{payment_url}} {{payment_url}}', 'invoice_payment_request'), /exactly one/)
})
test('tour templates preserve existing wording with and without a tour time', () => {
  const input = { name: 'Sarah Jenkins', date: 'October 24, 2026', time: '11:00 AM' }
  assert.equal(model.renderTourText(model.TOUR_TEXT_DEFAULTS.tour_confirmation, 'tour_confirmation', input), 'Luxor Event Space: Hi Sarah, your private venue tour is confirmed for October 24, 2026 at 11:00 AM. Reply with any questions. Reply STOP to opt out.')
  assert.equal(model.renderTourText(model.TOUR_TEXT_DEFAULTS.tour_reminder, 'tour_reminder', { ...input, time: null }), 'Luxor Event Space: Reminder for your private venue tour tomorrow. We look forward to meeting you. Reply STOP to opt out.')
  assert.throws(() => model.validateTourTextTemplate('Hello {{first_name}}', 'tour_confirmation'), /tour_date/)
})
test('payment template falls back only when storage or its seeded row is missing', async () => {
  class RestError extends Error { constructor(status, code) { super('synthetic'); this.status = status; this.code = code } }
  let rows = []
  const service = load('src/lib/luxorSystemMessageTemplatesServer.ts', { 'server-only': {}, './luxorSystemMessageTemplates': model, './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async () => rows } })
  const fallback = await service.readPaymentConfirmationTemplate()
  assert.equal(fallback.installed, false); assert.equal(fallback.template.body_template, model.PAYMENT_CONFIRMATION_DEFAULT)
  rows = [{ body_template: 'Payment {{amount}} received.', revision: 2 }]
  assert.equal((await service.readPaymentConfirmationTemplate()).installed, true)
  rows = [{ body_template: 'Invalid', revision: 2 }]
  await assert.rejects(service.readPaymentConfirmationTemplate(), /amount/)
})
test('event template falls back to the original when its seeded row is absent', async () => {
  class RestError extends Error { constructor(status, code) { super('synthetic'); this.status = status; this.code = code } }
  const service = load('src/lib/luxorSystemMessageTemplatesServer.ts', { 'server-only': {}, './luxorSystemMessageTemplates': model, './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async () => [] } })
  const fallback = await service.readEventReminderTemplate()
  assert.equal(fallback.installed, false)
  assert.equal(fallback.template.body_template, model.EVENT_REMINDER_DEFAULT)
})
test('queue path retains its consent gate and idempotency key', () => {
  const source = fs.readFileSync(path.join(root, 'src/lib/luxorTextCampaignsServer.ts'), 'utf8')
  assert.match(source, /automationKey: `inquiry_confirmation:\$\{inquiry\.id\}`/)
  assert.match(source, /assertLuxorAutomatedSmsAllowed\(data\.phone, data\.requiredScope \|\| 'customer_care'\)/)
  assert.match(source, /body: renderInquiryConfirmation\(template\.body/)
  assert.match(source, /assertLuxorAutomatedSmsAllowed\(job\.recipient_phone, requiredScope\)/)
  assert.match(source, /automationKey: `payment_confirmation:\$\{payment\.id\}`/)
  assert.match(source, /body: renderPaymentConfirmation\(template\.body/)
  assert.match(source, /requiredScope: 'payment'/)
  assert.match(source, /automationKey: `event_reminder:\$\{booking\.id\}:\$\{schedule\.key\}:\$\{booking\.event_date\}`/)
  assert.match(source, /body: renderEventReminder\(template\.body/)
  assert.match(source, /requiredScope: 'event'/)
  assert.match(source, /automationKey: `invoice_due:\$\{invoice\.id\}:\$\{invoiceDueDate\}`/)
  assert.match(source, /automationKey: `invoice_overdue:\$\{invoice\.id\}:\$\{invoiceDueDate\}`/)
  assert.match(source, /requiredScope: 'invoice'/)
})
test('missing template table falls back to the original and other read errors fail closed', async () => {
  class RestError extends Error { constructor(status, code) { super('synthetic'); this.status = status; this.code = code } }
  let failure = new RestError(404, 'PGRST205')
  const service = load('src/lib/luxorSystemMessageTemplatesServer.ts', {
    'server-only': {}, './luxorSystemMessageTemplates': model,
    './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async () => { throw failure } },
  })
  const result = await service.readInquiryConfirmationTemplate()
  assert.equal(result.installed, false)
  assert.equal(result.template.body_template, model.INQUIRY_CONFIRMATION_DEFAULT)
  failure = new RestError(503, 'unavailable')
  await assert.rejects(service.readInquiryConfirmationTemplate(), /synthetic/)
})
test('saved edits use an expected revision and do not overwrite a concurrent edit', async () => {
  class RestError extends Error {}
  let args
  const service = load('src/lib/luxorSystemMessageTemplatesServer.ts', {
    'server-only': {}, './luxorSystemMessageTemplates': model,
    './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (...input) => { args = input; return [] } },
  })
  await assert.rejects(service.saveInquiryConfirmationTemplate('Hi {{first_name}}', 3, 'owner@example.invalid'), /changed/)
  assert.match(args[0], /revision=eq\.3/)
  assert.equal(JSON.parse(args[1].body).revision, 4)
})
