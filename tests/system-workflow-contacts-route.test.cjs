'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/app/api/marketing/system-messages/contacts/route.ts')
let session, permissions, queries, jobs, messages, role
class ServiceError extends Error { constructor(message, status) { super(message); this.status = status } }
const mocks = {
  'next/server': { NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200 }) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => session },
  '@/lib/luxorPortalAccess': { getLuxorPortalMember: async () => ({ status: 'active', role }), memberCan: (_, permission) => permissions.includes(permission) },
  '@/lib/luxorCustomWorkflowsServer': { CustomWorkflowServiceError: ServiceError, requireCustomWorkflowOperator: async () => { if (!permissions.includes('marketing')) throw new ServiceError('Forbidden', 403) } },
  '@/lib/supabaseRestServer': { supabaseRestCount: async (query) => { queries.push(query); return 0 }, supabaseRestStrict: async (query) => { queries.push(query); return query.startsWith('luxor_inquiries?') ? [] : query.startsWith('luxor_messages?') ? messages : jobs } },
}
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const request = (query) => ({ nextUrl: new URL(`http://localhost/?${query}`) })
function reset() { session = { email: 'owner@example.invalid' }; permissions = ['marketing', 'leads', 'messages', 'emails', 'calendar', 'calls', 'finances']; role = 'owner'; queries = []; jobs = []; messages = [] }
test('requires workflow and channel permissions before reading history', async () => {
  reset(); session = null; assert.equal((await loaded.exports.GET(request('workflow=system-inquiry-email'))).status, 401)
  reset(); permissions = ['marketing']; assert.equal((await loaded.exports.GET(request('workflow=system-inquiry-email'))).status, 403); assert.deepEqual(queries, [])
  reset(); permissions = ['marketing', 'emails']; assert.equal((await loaded.exports.GET(request('workflow=system-inquiry-email'))).status, 403); assert.deepEqual(queries, [])
  reset(); assert.equal((await loaded.exports.GET(request('workflow=unrecognized'))).status, 400); assert.deepEqual(queries, [])
})
test('tour history identifies the recorded notice and requires calendar access', async () => {
  reset(); permissions = ['marketing', 'leads', 'emails']; assert.equal((await loaded.exports.GET(request('workflow=system-tour-emails'))).status, 403)
  reset(); jobs = [{ id: 'job', inquiry_id: 'sample', job_type: 'tour_reminder', tour_notice: 'reminder_24', status: 'queued' }]
  const result = await loaded.exports.GET(request('workflow=system-tour-emails'))
  assert.equal(result.status, 200); assert.equal(result.body.contacts[0].stepName, '24-hour reminder')
  assert.match(queries[0], /tour_revision_id=not\.is\.null/)
})
test('invoice history includes only known system automation keys', async () => {
  reset(); const result = await loaded.exports.GET(request('workflow=system-invoice-reminders'))
  assert.equal(result.status, 200); assert.match(queries[0], /automation_key\.like\.invoice_payment_request/)
})
test('direct phone replies require calls permission and use provider IDs for recorded links', async () => {
  reset(); permissions = ['marketing', 'leads', 'messages']; assert.equal((await loaded.exports.GET(request('workflow=system-phone-missed_call'))).status, 403)
  reset(); const sid = 'SM' + 'a'.repeat(32)
  jobs = [{ id: 'event', recipient_number: '+12105550100', status: 'sent', twilio_message_sid: sid, created_at: '2026-01-01' }, { id: 'unknown', recipient_number: '+12105550101', status: 'failed', twilio_message_sid: null, created_at: '2026-01-01' }]
  messages = [{ twilio_message_sid: sid, inquiry_id: 'linked-inquiry', contact_name: 'Guest', status: 'delivered' }]
  const result = await loaded.exports.GET(request('workflow=system-phone-missed_call'))
  assert.equal(result.body.direct, true); assert.equal(result.body.contacts[0].deliveryStatus, 'delivered'); assert.equal(result.body.contacts[0].inquiry_id, 'linked-inquiry')
  assert.equal(result.body.contacts[1].inquiry_id, null); assert.equal(result.body.contacts[1].name, '+12105550101')
})
test('filters inquiry receipts by channel and real inquiry records', async () => {
  reset(); const email = await loaded.exports.GET(request('workflow=system-inquiry-email&page=2'))
  assert.equal(email.status, 200); assert.match(queries[0], /metadata->>source=eq\.inquiry_acknowledgment/); assert.match(queries[0], /test_run_id=is\.null/); assert.match(queries[0], /offset=25/)
  assert.ok(queries.every((query) => query.includes('luxor_inquiries.is_test=eq.false')))
  reset(); assert.equal((await loaded.exports.GET(request('workflow=system-inquiry-confirmation'))).status, 200)
  assert.match(queries[0], /^luxor_text_jobs\?job_type=eq\.inquiry_confirmation/)
})
test('tour request and newsletter histories use distinct recorded origins', async () => {
  reset(); jobs = [{ id: 'job', inquiry_id: 'sample', job_type: 'tour_confirmation', status: 'sent' }]
  const tour = await loaded.exports.GET(request('workflow=system-tour-request-email'))
  assert.equal(tour.body.contacts[0].stepName, 'Tour request receipt')
  assert.match(queries[0], /metadata->>source=eq\.tour_request_received/)
  assert.match(queries[0], /tour_revision_id=is\.null/)
  reset(); jobs = [{ id: 'job', inquiry_id: 'sample', job_type: 'marketing_campaign', status: 'sent' }]
  const newsletter = await loaded.exports.GET(request('workflow=system-newsletter-email'))
  assert.equal(newsletter.body.contacts[0].stepName, 'Newsletter confirmation')
  assert.match(queries[0], /metadata->>source=eq\.newsletter_confirmation/)
})
test('final payment history requires finance access and labels the recorded milestone', async () => {
  reset(); permissions = ['marketing', 'leads', 'emails']; assert.equal((await loaded.exports.GET(request('workflow=system-final-payment-emails'))).status, 403); assert.deepEqual(queries, [])
  reset(); jobs = [{ id: 'job', inquiry_id: 'sample', job_type: 'final_payment_reminder', status: 'queued', metadata: { milestone: '14_days' } }]
  const result = await loaded.exports.GET(request('workflow=system-final-payment-emails'))
  assert.equal(result.body.contacts[0].stepName, 'Two-week reminder window')
  assert.match(queries[0], /metadata->>milestone=in\.\(payment_request,14_days,7_days,due_date\)/)
})
test('offer history requires finance and planner access and only includes recorded offers', async () => {
  reset(); permissions = ['marketing', 'leads', 'emails', 'planner']; assert.equal((await loaded.exports.GET(request('workflow=system-offer-email'))).status, 403)
  reset(); permissions = ['marketing', 'leads', 'emails', 'finances']; assert.equal((await loaded.exports.GET(request('workflow=system-offer-email'))).status, 403)
  reset(); permissions.push('planner'); jobs = [{ id: 'job', inquiry_id: 'sample', job_type: 'proposal_view_reminder', status: 'queued' }]
  const result = await loaded.exports.GET(request('workflow=system-offer-email'))
  assert.equal(result.body.contacts[0].stepName, 'Proposal offer reminder'); assert.match(queries[0], /metadata->>offer_reminder=eq\.true/)
})
test('payment request history is limited to the recorded origin and protected domains', async () => {
  reset(); permissions = ['marketing', 'leads', 'emails', 'planner']; assert.equal((await loaded.exports.GET(request('workflow=system-payment-request-email'))).status, 403)
  reset(); permissions = ['marketing', 'leads', 'emails', 'finances']; assert.equal((await loaded.exports.GET(request('workflow=system-payment-request-email'))).status, 403)
  reset(); permissions.push('planner'); jobs = [{ id: 'job', inquiry_id: 'sample', job_type: 'proposal_payment_reminder', status: 'queued' }]
  const result = await loaded.exports.GET(request('workflow=system-payment-request-email'))
  assert.equal(result.body.contacts[0].stepName, 'Payment request reminder'); assert.match(queries[0], /metadata->>payment_request_reminder=eq\.true/)
})
test('tour no-show history is staff-requested and requires calendar access', async () => {
  reset(); permissions = ['marketing', 'leads', 'emails']; assert.equal((await loaded.exports.GET(request('workflow=system-tour-no-show-email'))).status, 403)
  reset(); jobs = [{ id: 'job', inquiry_id: 'sample', job_type: 'tour_no_show_reschedule', status: 'queued' }]
  const result = await loaded.exports.GET(request('workflow=system-tour-no-show-email'))
  assert.equal(result.body.contacts[0].stepName, 'Reschedule email'); assert.match(queries[0], /metadata->>manual=eq\.true/)
})
test('layout invitation history requires planner access and a recorded review', async () => {
  reset(); permissions = ['marketing', 'leads', 'emails']; assert.equal((await loaded.exports.GET(request('workflow=system-layout-review-email'))).status, 403)
  reset(); permissions.push('planner'); jobs = [{ id: 'job', inquiry_id: 'sample', job_type: 'layout_review', status: 'queued' }]
  const result = await loaded.exports.GET(request('workflow=system-layout-review-email'))
  assert.equal(result.body.contacts[0].stepName, 'Layout review invitation'); assert.match(queries[0], /metadata->>layout_review_id=not\.is\.null/)
})
test('planner invitation history requires owner access and uses its own recorded origin', async () => {
  reset(); permissions.push('planner'); role = 'staff'; assert.equal((await loaded.exports.GET(request('workflow=system-planner-invitation'))).status, 403)
  reset(); permissions.push('planner'); jobs = [{ id: 'job', inquiry_id: 'sample', job_type: 'layout_review', status: 'queued' }]
  const result = await loaded.exports.GET(request('workflow=system-planner-invitation'))
  assert.equal(result.body.contacts[0].stepName, 'Planner presentation invitation'); assert.match(queries[0], /metadata->>kind=eq\.planner_presentation_invitation/)
})
test('Zelle history requires finance access and identifies its own payment origin', async () => {
  reset(); permissions=['marketing','leads','emails']; assert.equal((await loaded.exports.GET(request('workflow=system-zelle-instructions'))).status,403)
  reset(); jobs=[{ id:'job',inquiry_id:'sample',job_type:'final_payment_request',status:'queued' }]
  const result=await loaded.exports.GET(request('workflow=system-zelle-instructions'))
  assert.equal(result.body.contacts[0].stepName,'Zelle payment instructions'); assert.match(queries[0],/metadata->>payment_method=eq\.zelle/); assert.match(queries[0],/zelle-instructions/)
})
test('paid-invoice history requires finance access and selects only its notice kind', async () => {
  reset(); permissions=['marketing','leads','emails']; assert.equal((await loaded.exports.GET(request('workflow=system-paid-invoice-email'))).status,403)
  reset(); jobs=[{id:'job',inquiry_id:'sample',job_type:'transactional_notice',status:'queued'}]
  const result=await loaded.exports.GET(request('workflow=system-paid-invoice-email'))
  assert.equal(result.body.contacts[0].stepName,'Paid-invoice confirmation'); assert.match(queries[0],/metadata->transactionalNotice->>kind=eq\.paid_invoice/)
})
test('staff receipt history requires finance access and selects its own notice kind', async () => {
  reset(); permissions=['marketing','leads','emails']; assert.equal((await loaded.exports.GET(request('workflow=system-payment-receipt'))).status,403)
  reset(); jobs=[{id:'job',inquiry_id:'sample',job_type:'transactional_notice',status:'queued'}]
  const result=await loaded.exports.GET(request('workflow=system-payment-receipt'))
  assert.equal(result.body.contacts[0].stepName,'Payment receipt'); assert.match(queries[0],/metadata->transactionalNotice->>kind=eq\.payment_receipt/)
})
test('executed client agreement history requires planner and finance access', async () => {
  reset(); permissions=['marketing','leads','emails','finances']; assert.equal((await loaded.exports.GET(request('workflow=system-agreement-client'))).status,403)
  reset(); permissions=['marketing','leads','emails','planner']; assert.equal((await loaded.exports.GET(request('workflow=system-agreement-client'))).status,403)
  reset(); permissions.push('planner'); jobs=[{id:'job',inquiry_id:'sample',job_type:'transactional_notice',status:'queued'}]
  const result=await loaded.exports.GET(request('workflow=system-agreement-client'))
  assert.equal(result.body.contacts[0].stepName,'Executed agreement email'); assert.match(queries[0],/metadata->transactionalNotice->>kind=eq\.agreement_client/)
})
test('planner verification history uses its own recorded origin', async () => {
  reset(); permissions=['marketing','leads','emails','planner','finances']; jobs=[{ id:'job', booking_id:'booking', inquiry_id:'sample', status:'sent' }]
  const result=await loaded.exports.GET(request('workflow=system-planner-verification'))
  assert.equal(result.status,200); assert.match(queries[0],/planner_presentation_verification/)
})
test('owner audit history requires owner planner and finance access', async () => {
  reset(); permissions=['marketing','leads','emails','planner','finances']; role='staff'; assert.equal((await loaded.exports.GET(request('workflow=system-agreement-owner'))).status,403)
  reset(); permissions.push('planner'); jobs=[{ id:'job', booking_id:'booking', inquiry_id:'sample', status:'sent' }]
  const result=await loaded.exports.GET(request('workflow=system-agreement-owner'))
  assert.equal(result.status,200); assert.match(queries[0],/agreement_owner/)
})
