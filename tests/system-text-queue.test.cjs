'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file)
  const mod = new Module(filename, module); mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod); mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  assert.deepEqual(compiled.diagnostics || [], []); mod._compile(compiled.outputText, filename); return mod.exports
}
const templates = load('src/lib/luxorSystemMessageTemplates.ts')
let stored = new Map(), scopes = [], templateBodies = {}, consentAllowed = true, templateFailures = new Set()
const template = (key) => { if (templateFailures.has(key)) throw new Error('Settings unavailable'); return { template: { body_template: templateBodies[key] } } }
const server = load('src/lib/luxorTextCampaignsServer.ts', {
  'server-only': {}, twilio: {}, './luxorTestLeadPolicy': {}, './luxorCallsServer': {}, './luxorMessagesServer': {}, './luxorPhoneNumbersServer': {},
  './supabaseRestServer': { supabaseRest: async (query, options) => {
    if (options?.method === 'POST') { const job = JSON.parse(options.body); stored.set(job.automation_key, job); return [job] }
    const key = decodeURIComponent(query.match(/automation_key=eq\.([^&]+)/)?.[1] || '')
    return stored.has(key) ? [stored.get(key)] : []
  } },
  './luxorTourNotificationsServer': { areLuxorTourNotificationsEnabled: async () => true }, './luxorTextAutomationsServer': { assertLuxorAutomatedSmsAllowed: async (phone, scope) => { scopes.push(scope); if (!consentAllowed) throw new Error('No consent'); return phone } },
  './luxorTwilioServer': {}, './luxorPaymentReminderDueDate': { getLuxorPaymentReminderDueDate: (invoice) => invoice.due_date }, './luxorInquiriesServer': {}, './luxorTestLeadServer': {}, './luxorCustomWorkflowFeatureGates': {},
  './luxorSystemMessageTemplates': templates,
  './luxorSystemMessageTemplatesServer': { readInvoiceReminderTemplate: async (key) => template(key), readPaymentConfirmationTemplate: async () => template('payment_confirmation'), readEventReminderTemplate: async () => template('event_reminder'), readTourTextTemplate: async (key) => template(key), readInquiryConfirmationTemplate: async () => template('inquiry_confirmation') },
})
function reset() { stored = new Map(); scopes = []; consentAllowed = true; templateFailures = new Set(); templateBodies = { ...templates.INVOICE_REMINDER_DEFAULTS, ...templates.TOUR_TEXT_DEFAULTS, payment_confirmation: templates.PAYMENT_CONFIRMATION_DEFAULT, event_reminder: templates.EVENT_REMINDER_DEFAULT, inquiry_confirmation: templates.INQUIRY_CONFIRMATION_DEFAULT } }
test('invoice jobs retain separate schedule, scope, deduplication and saved copy', async () => {
  reset()
  const invoice = { id: 'synthetic-invoice', inquiry_id: 'synthetic-lead', due_date: '2099-12-10', status: 'sent', total: 125 }
  const contact = { phone: '+13125550100', name: 'Sarah Jenkins' }
  const jobs = await server.queueInvoiceReminderTexts(invoice, contact)
  assert.deepEqual(jobs.map((job) => job.scheduled_for), ['2099-12-07T15:00:00.000Z', '2099-12-11T15:00:00.000Z'])
  assert.deepEqual(scopes, ['invoice', 'invoice'])
  assert.deepEqual(jobs.map((job) => job.automation_key), ['invoice_due:synthetic-invoice:2099-12-10', 'invoice_overdue:synthetic-invoice:2099-12-10'])
  const original = jobs[0].body
  templateBodies.invoice_due_reminder = 'Updated {{amount}} due {{due_date}}.'
  const again = await server.queueInvoiceReminderTexts(invoice, contact)
  assert.equal(stored.size, 2); assert.equal(again[0].body, original)
  consentAllowed = false
  await assert.rejects(server.queueInvoiceReminderTexts(invoice, contact), /No consent/)
  assert.equal(stored.size, 2)
})
test('paid invoice and unpaid payment cannot create jobs', async () => {
  reset()
  assert.deepEqual(await server.queueInvoiceReminderTexts({ id: 'invoice', due_date: '2099-12-10', status: 'paid' }, { phone: '+13125550100', name: 'Sarah' }), [])
  assert.equal(await server.queuePaymentConfirmationText({ id: 'payment', status: 'pending' }, { phone: '+13125550100', name: 'Sarah' }), null)
  assert.equal(stored.size, 0)
})
test('paid payment and event jobs keep their own consent scopes and queued snapshots', async () => {
  reset()
  const payment = { id: 'payment', status: 'paid', amount: 125, inquiry_id: 'lead' }
  const contact = { phone: '+13125550100', name: 'Sarah Jenkins' }
  const job = await server.queuePaymentConfirmationText(payment, contact)
  assert.equal(job.automation_key, 'payment_confirmation:payment')
  assert.match(job.body, /payment of \$125\.00/)
  templateBodies.payment_confirmation = 'We received {{amount}}.'
  assert.equal((await server.queuePaymentConfirmationText(payment, contact)).body, job.body)
  const event = { id: 'event', status: 'confirmed', event_date: '2099-12-10', phone: contact.phone, client_name: contact.name, event_type: 'Wedding' }
  const jobs = await server.queueBookingTextJobs(event)
  assert.deepEqual(jobs.map((item) => item.scheduled_for), ['2099-12-03T15:00:00.000Z', '2099-12-09T15:00:00.000Z'])
  assert.deepEqual(scopes, ['payment', 'payment', 'event', 'event'])
  assert.deepEqual(jobs.map((item) => item.automation_key), ['event_reminder:event:7d:2099-12-10', 'event_reminder:event:1d:2099-12-10'])
})
test('tour jobs preserve tour consent, schedule, identity and queued copy', async () => {
  reset()
  const inquiry = { id: 'tour-lead', full_name: 'Sarah Jenkins', phone: '+13125550100', preferred_tour_date: '2099-12-10', preferred_tour_time: '11:00 AM' }
  const jobs = await server.queueInquiryTextJobs(inquiry)
  assert.deepEqual(jobs.map((item) => item.automation_key), ['tour_confirmation:tour-lead:2099-12-10:11:00 AM', 'tour_reminder:tour-lead:2099-12-10:11:00 AM'])
  assert.equal(jobs[1].scheduled_for, '2099-12-09T15:00:00.000Z')
  assert.deepEqual(scopes, ['tour', 'tour'])
  templateBodies.tour_confirmation = 'Your tour is confirmed for {{tour_date}}.'
  assert.equal((await server.queueInquiryTextJobs(inquiry))[0].body, jobs[0].body)
})
test('settings outages use marked defaults without bypassing consent or rewriting queued messages', async () => {
  reset()
  const inquiry = { id: 'lead', full_name: 'Sarah Jenkins', phone: '+13125550100', event_type: 'Wedding' }
  templateFailures.add('inquiry_confirmation')
  const [job] = await server.queueInquiryTextJobs(inquiry)
  assert.match(job.body, /received your Wedding inquiry/)
  assert.equal(job.metadata.copy_settings_unavailable, true)
  assert.equal(job.metadata.compliance_scope, 'customer_care')
  templateFailures.clear()
  templateBodies.inquiry_confirmation = 'New wording for {{first_name}}.'
  assert.equal((await server.queueInquiryTextJobs(inquiry))[0].body, job.body)
  consentAllowed = false
  templateFailures.add('inquiry_confirmation')
  await assert.rejects(server.queueInquiryTextJobs({ ...inquiry, id: 'other' }), /No consent/)
  assert.equal(stored.size, 1)
})
test('settings outages preserve scheduled tour, event, payment and invoice jobs', async () => {
  reset()
  templateFailures = new Set(['tour_confirmation', 'tour_reminder', 'event_reminder', 'payment_confirmation', 'invoice_due_reminder', 'invoice_overdue_reminder'])
  const contact = { phone: '+13125550100', name: 'Sarah Jenkins' }
  const tour = await server.queueInquiryTextJobs({ id: 'lead', full_name: contact.name, phone: contact.phone, preferred_tour_date: '2099-12-10', preferred_tour_time: '11:00 AM' })
  const event = await server.queueBookingTextJobs({ id: 'event', status: 'confirmed', event_date: '2099-12-10', phone: contact.phone, client_name: contact.name, event_type: 'Wedding' })
  const payment = await server.queuePaymentConfirmationText({ id: 'payment', status: 'paid', amount: 125, inquiry_id: 'lead' }, contact)
  const invoice = await server.queueInvoiceReminderTexts({ id: 'invoice', inquiry_id: 'lead', due_date: '2099-12-10', status: 'sent', total: 125 }, contact)
  assert.equal(tour[1].scheduled_for, '2099-12-09T15:00:00.000Z')
  assert.equal(event[0].scheduled_for, '2099-12-03T15:00:00.000Z')
  assert.equal(invoice[1].scheduled_for, '2099-12-11T15:00:00.000Z')
  for (const job of [...tour, ...event, payment, ...invoice]) assert.equal(job.metadata.copy_settings_unavailable, true)
  assert.deepEqual(scopes, ['tour', 'tour', 'event', 'event', 'payment', 'invoice', 'invoice'])
})
