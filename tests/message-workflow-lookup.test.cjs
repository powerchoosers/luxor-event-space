'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/luxorMessageWorkflowLookupServer.ts')
let rows = []
let subjectRows = []
let calls = []
let directMessages = []
let directEvents = []
let breakdownRows = []
let breakdownBodyRows = []
const mocks = { 'server-only': {}, './supabaseRestServer': { supabaseRestStrict: async (query) => { calls.push(query); if (query.startsWith('luxor_text_jobs?') || query.startsWith('luxor_email_jobs?')) return query.includes('&subject=ilike.') ? subjectRows : rows; if (query.startsWith('luxor_proposal_breakdowns?')) return query.includes('&html=ilike.') ? breakdownBodyRows : breakdownRows; if (query.startsWith('luxor_messages?')) return directMessages; if (query.startsWith('luxor_text_automation_events?')) return directEvents; if (query.startsWith('luxor_custom_workflow_step_runs?') || query.startsWith('luxor_custom_workflow_enrollments?') || query.startsWith('luxor_custom_workflows?') || query.startsWith('luxor_follow_up_enrollments?')) return []; throw new Error('Unexpected query') } } }
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
const actual = loaded.require.bind(loaded); loaded.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
assert.deepEqual(compiled.diagnostics || [], [])
loaded._compile(compiled.outputText, file)
const { findMessageWorkflows } = loaded.exports
test('maps recorded inquiry texts to the inquiry workflow and deduplicates results', async () => {
  rows = [{ job_type: 'inquiry_confirmation', custom_workflow_step_run_id: null }, { job_type: 'inquiry_confirmation', custom_workflow_step_run_id: null }]; calls = []
  const result = await findMessageWorkflows('we received your Wedding Reception inquiry', 'text')
  assert.equal(result.matches.length, 1)
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-inquiry-confirmation')
  assert.equal(result.unresolved, false)
  assert.match(calls[0], /^luxor_text_jobs\?/)
})
test('unknown origins remain unresolved and capped results are disclosed', async () => {
  rows = Array.from({ length: 51 }, () => ({ job_type: 'unknown', custom_workflow_step_run_id: null }))
  const result = await findMessageWorkflows('distinct message wording', 'email')
  assert.equal(result.capped, true)
  assert.equal(result.unresolved, true)
  assert.deepEqual(result.matches, [])
})
test('rejects short and wildcard searches before reading data', async () => {
  calls = []
  await assert.rejects(findMessageWorkflows('short', 'text'))
  await assert.rejects(findMessageWorkflows('this has a * wildcard', 'text'))
  assert.deepEqual(calls, [])
})
test('identifies direct missed-call and incoming-text replies only from linked events', async () => {
  rows = []
  const sid1 = 'SM' + 'a'.repeat(32), sid2 = 'SM' + 'b'.repeat(32)
  directMessages = [{ twilio_message_sid: sid1 }, { twilio_message_sid: sid2 }]
  directEvents = [{ twilio_message_sid: sid1, automation_type: 'missed_call' }, { twilio_message_sid: sid2, automation_type: 'inbound_acknowledgment' }]
  const result = await findMessageWorkflows('we will get back to you', 'text')
  assert.deepEqual(result.matches.map((match) => match.name), ['Missed-call reply', 'Incoming-text acknowledgment'])
  assert.equal(result.unresolved, false)
  assert.deepEqual(result.matches.map((match) => match.href), ['/portal/marketing/custom-workflows/system-phone-missed_call', '/portal/marketing/custom-workflows/system-phone-inbound_acknowledgment'])
  assert.match(calls.at(-1), /^luxor_text_automation_events\?/)
})
test('reports direct messages with missing event evidence as unresolved', async () => {
  rows = []
  directMessages = [{ twilio_message_sid: 'SM' + 'a'.repeat(32) }]
  directEvents = []
  const result = await findMessageWorkflows('we will get back to you', 'text')
  assert.equal(result.unresolved, true)
  assert.deepEqual(result.matches, [])
})
test('distinguishes invoice scheduler messages from payment-request follow-ups', async () => {
  directMessages = []; directEvents = []
  rows = [
    { job_type: 'invoice_due_reminder', custom_workflow_step_run_id: null, automation_key: 'invoice_due:invoice:2026-12-01' },
    { job_type: 'invoice_due_reminder', custom_workflow_step_run_id: null, automation_key: 'invoice_payment_request:invoice:request' },
    { job_type: 'invoice_due_reminder', custom_workflow_step_run_id: null, automation_key: null },
  ]
  const result = await findMessageWorkflows('payment request is still open', 'text')
  assert.deepEqual(result.matches.map((match) => match.name), ['Invoice due reminder text', 'Payment request follow-up text'])
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-invoice-reminders?step=due')
  assert.equal(result.matches[1].href, '/portal/marketing/custom-workflows/system-invoice-reminders?step=payment-request')
  assert.equal(result.unresolved, true)
})
test('tour text and email wording link to their respective origins', async () => {
  rows = [{ job_type: 'tour_reminder', custom_workflow_step_run_id: null }]; directMessages = []
  assert.equal((await findMessageWorkflows('private venue tour tomorrow', 'text')).matches[0].href, '/portal/marketing/custom-workflows/system-tour-texts?step=reminder')
  rows = [{ job_type: 'tour_reminder', custom_workflow_step_run_id: null, tour_revision_id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725', tour_notice: 'reminder_24' }]
  assert.equal((await findMessageWorkflows('private venue tour tomorrow', 'email')).matches[0].href, '/portal/marketing/custom-workflows/system-tour-emails?step=reminder_24')
  rows = [{ job_type: 'tour_reminder', custom_workflow_step_run_id: null, tour_revision_id: null, tour_notice: null }]
  const unknown = await findMessageWorkflows('private venue tour tomorrow', 'email')
  assert.equal(unknown.unresolved, true)
  assert.deepEqual(unknown.matches, [])
})
test('only identifies scheduled payment reminders with milestone evidence', async () => {
  rows = [
    { job_type: 'final_payment_reminder', custom_workflow_step_run_id: null, metadata: { milestone: 'due_date' } },
    { job_type: 'final_payment_reminder', custom_workflow_step_run_id: null, metadata: { milestone: 'installment_7_days_before' } },
    { job_type: 'installment_payment_reminder', custom_workflow_step_run_id: null, metadata: { milestone: 'installment_1_day_overdue' } },
    { job_type: 'final_payment_reminder', custom_workflow_step_run_id: null, metadata: {} },
    { job_type: 'inquiry_confirmation', custom_workflow_step_run_id: null },
  ]
  const result = await findMessageWorkflows('a distinctive payment reminder', 'email')
  assert.deepEqual(result.matches.map((match) => match.href), ['/portal/marketing/custom-workflows/system-final-payment-emails?step=due_date', '/portal/marketing/custom-workflows/system-installment-emails?step=overdue'])
  assert.equal(result.unresolved, true)
})
test('identifies inquiry receipts using their recorded source', async () => {
  rows = [{ job_type: 'marketing_campaign', custom_workflow_step_run_id: null, metadata: { source: 'inquiry_acknowledgment' } }, { job_type: 'marketing_campaign', custom_workflow_step_run_id: null, metadata: { source: 'newsletter_confirmation' } }]
  const result = await findMessageWorkflows('received your Luxor inquiry', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-inquiry-email')
  assert.equal(result.matches[1].href, '/portal/marketing/custom-workflows/system-newsletter-email')
  assert.equal(result.unresolved, false)
})
test('only identifies an unscheduled tour receipt with recorded source evidence', async () => {
  rows = [{ job_type: 'tour_confirmation', custom_workflow_step_run_id: null, tour_revision_id: null, metadata: { source: 'tour_request_received' } }, { job_type: 'tour_confirmation', custom_workflow_step_run_id: null, tour_revision_id: null, metadata: {} }]
  const result = await findMessageWorkflows('tour request is received', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-tour-request-email')
  assert.equal(result.unresolved, true)
})
test('recognizes brochure delivery without confusing other booking packages', async () => {
  rows = [{ job_type: 'booking_package', custom_workflow_step_run_id: null, metadata: { flow_stage: 'brochure_delivery' } }, { job_type: 'booking_package', custom_workflow_step_run_id: null, metadata: { flow_stage: 'contract_package' } }]
  const result = await findMessageWorkflows('official venue brochure', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-brochure')
  assert.equal(result.unresolved, true)
})
test('identifies recorded event emails by their separate job types', async () => {
  rows = [{ job_type: 'event_details_reminder', custom_workflow_step_run_id: null }, { job_type: 'event_day_reminder', custom_workflow_step_run_id: null }, { job_type: 'post_event_follow_up', custom_workflow_step_run_id: null }]
  const result = await findMessageWorkflows('your Luxor event', 'email')
  assert.deepEqual(result.matches.map((item) => item.href), ['/portal/marketing/custom-workflows/system-event-emails?step=details', '/portal/marketing/custom-workflows/system-event-emails?step=day', '/portal/marketing/custom-workflows/system-event-emails?step=thanks'])
  assert.equal(result.unresolved, false)
})
test('agreement reminders require a recorded signature request', async () => {
  rows = [{ job_type: 'contract_view_reminder', custom_workflow_step_run_id: null, signature_request_id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725' }, { job_type: 'contract_signature_reminder', custom_workflow_step_run_id: null, signature_request_id: null }]
  const result = await findMessageWorkflows('agreement is ready to review', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-agreement-emails?step=view'); assert.equal(result.unresolved, true)
})
test('offer reminders require origin metadata and do not capture payment requests', async () => {
  rows = [{ job_type: 'proposal_view_reminder', custom_workflow_step_run_id: null, metadata: { offer_reminder: true, invoice_id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725' } }, { job_type: 'proposal_payment_reminder', custom_workflow_step_run_id: null, metadata: { flow_stage: 'post_signature_payment' } }]
  const result = await findMessageWorkflows('proposal reminder wording', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-offer-email'); assert.equal(result.unresolved, true)
})
test('payment-request reminders require their own recorded origin', async () => {
  rows = [{ job_type: 'proposal_payment_reminder', custom_workflow_step_run_id: null, metadata: { payment_request_reminder: true, invoice_id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725' } }, { job_type: 'proposal_payment_reminder', custom_workflow_step_run_id: null, metadata: {} }]
  const result = await findMessageWorkflows('payment reminder wording', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-payment-request-email'); assert.equal(result.unresolved, true)
})
test('no-show email attribution requires the staff-requested origin', async () => {
  rows = [{ job_type: 'tour_no_show_reschedule', custom_workflow_step_run_id: null, metadata: { manual: true } }, { job_type: 'tour_no_show_reschedule', custom_workflow_step_run_id: null, metadata: {} }]
  const result = await findMessageWorkflows('missed your venue tour', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-tour-no-show-email'); assert.equal(result.unresolved, true)
})
test('private layout invitations are distinguished from planner presentation emails', async () => {
  rows = [{ job_type: 'layout_review', custom_workflow_step_run_id: null, metadata: { layout_review_id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725' } }, { job_type: 'layout_review', custom_workflow_step_run_id: null, metadata: { kind: 'planner_presentation_invitation' } }]
  const result = await findMessageWorkflows('layout is ready to review', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-layout-review-email'); assert.equal(result.unresolved, true)
})
test('planner invitation requires a recorded presentation and does not identify verification codes', async () => {
  rows = [{ job_type: 'layout_review', custom_workflow_step_run_id: null, metadata: { kind: 'planner_presentation_invitation', planner_presentation_id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725' } }]
  const result = await findMessageWorkflows('private presentation wording', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-planner-invitation'); assert.equal(result.unresolved, false)
})
test('verification emails are attributed separately from planner invitations', async () => {
  rows = []; subjectRows = [{ id: 'job-2', job_type: 'layout_review', custom_workflow_step_run_id: null, metadata: { kind: 'planner_presentation_verification', planner_presentation_id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725' } }]
  try {
    const result = await findMessageWorkflows('Your Luxor design verification code', 'email')
    assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-planner-verification')
    assert.equal(result.unresolved, false)
  } finally { subjectRows = [] }
})
test('a retained email subject identifies the recorded planner invitation without retaining its private body', async () => {
  rows = []; calls = []; subjectRows = [{ id: 'job-1', job_type: 'layout_review', custom_workflow_step_run_id: null, metadata: { kind: 'planner_presentation_invitation', planner_presentation_id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725' } }]
  try {
    const result = await findMessageWorkflows('Your Luxor event design is ready', 'email')
    assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-planner-invitation')
    assert.equal(result.searched, 1); assert.equal(result.unresolved, false)
    assert.ok(calls.some(query => query.includes('&subject=ilike.')))
    rows = [...subjectRows]
    assert.equal((await findMessageWorkflows('Your Luxor event design is ready', 'email')).searched, 1)
  } finally { subjectRows = []; rows = [] }
})
test('Zelle instructions require their recorded payment origin', async () => {
  rows = [{ job_type:'final_payment_request', custom_workflow_step_run_id:null, metadata:{ payment_method:'zelle', payment_amount_kind:'deposit', automation_key:'zelle-instructions:a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725:deposit' } }, { job_type:'final_payment_request', custom_workflow_step_run_id:null, metadata:{ payment_method:'zelle', automation_key:'zelle-instructions:missing:deposit' } }]
  const result=await findMessageWorkflows('Zelle payment instructions','email')
  assert.equal(result.matches[0].href,'/portal/marketing/custom-workflows/system-zelle-instructions'); assert.equal(result.unresolved,true)
})
test('paid invoice notices require the distinct transactional snapshot kind and key', async () => {
  rows=[{job_type:'transactional_notice',custom_workflow_step_run_id:null,metadata:{transactionalNotice:{kind:'paid_invoice',key:'paid_invoice/cs_test_synthetic'}}},{job_type:'transactional_notice',custom_workflow_step_run_id:null,metadata:{transactionalNotice:{kind:'payment_receipt',key:'payment_receipt/one'}}}]
  const result=await findMessageWorkflows('Your Luxor payment receipt','email')
  assert.equal(result.matches[0].href,'/portal/marketing/custom-workflows/system-paid-invoice-email'); assert.equal(result.unresolved,true)
})
test('staff receipts are attributed only by their recorded receipt origin', async () => {
  rows=[{job_type:'transactional_notice',custom_workflow_step_run_id:null,metadata:{transactionalNotice:{kind:'payment_receipt',key:'payment_receipt/a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725'}}}]
  const result=await findMessageWorkflows('Your Luxor payment receipt','email')
  assert.equal(result.matches[0].href,'/portal/marketing/custom-workflows/system-payment-receipt'); assert.equal(result.unresolved,false)
})
test('executed client agreements use their distinct recorded origin', async () => {
  rows=[{job_type:'transactional_notice',custom_workflow_step_run_id:null,metadata:{transactionalNotice:{kind:'agreement_client',key:'agreement_client/a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725'}}},{job_type:'transactional_notice',custom_workflow_step_run_id:null,metadata:{transactionalNotice:{kind:'agreement_owner',key:'agreement_owner/a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725'}}}]
  const result=await findMessageWorkflows('Your agreement is complete','email')
  assert.equal(result.matches[0].href,'/portal/marketing/custom-workflows/system-agreement-client'); assert.equal(result.unresolved,false)
})
test('owner audit notices use their distinct recorded origin', async () => {
  rows=[{job_type:'transactional_notice',custom_workflow_step_run_id:null,metadata:{transactionalNotice:{kind:'agreement_owner',key:'agreement_owner/a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725'}}}]
  const result=await findMessageWorkflows('Executed agreement archived','email')
  assert.equal(result.matches[0].href,'/portal/marketing/custom-workflows/system-agreement-owner'); assert.equal(result.unresolved,false)
})
test('proposal breakdown subjects link to the breakdown workflow', async () => {
  rows = []
  subjectRows = []
  breakdownRows = [{ id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725' }]
  const result = await findMessageWorkflows('Proposal Breakdown: Wedding Reception', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-proposal-breakdown')
  assert.equal(result.unresolved, false)
  breakdownRows = []
})
test('proposal breakdown body wording links to its workflow', async () => {
  rows = []; subjectRows = []; breakdownRows = []
  breakdownBodyRows = [{ id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725' }]
  try {
    const result = await findMessageWorkflows('Your selected package includes', 'email')
    assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-proposal-breakdown')
    assert.equal(result.unresolved, false)
  } finally { breakdownBodyRows = [] }
})
test('agreement package delivery links to its dedicated workflow', async () => {
  rows = [{ job_type: 'contract_signature', custom_workflow_step_run_id: null, signature_request_id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725', metadata: { agreement_delivery: true } }]
  const result = await findMessageWorkflows('Event Agreement is ready to sign', 'email')
  assert.equal(result.matches[0].href, '/portal/marketing/custom-workflows/system-agreement-package')
  assert.equal(result.unresolved, false)
})
test('calendar cancellations and unbranded updates link to the calendar workflow; branded confirmations do not', async () => {
  rows = [{ job_type: 'calendar_invitation', custom_workflow_step_run_id: null, calendar_method: 'CANCEL' }]
  assert.equal((await findMessageWorkflows('appointment has been cancelled', 'email')).matches[0].href, '/portal/marketing/custom-workflows/system-calendar-messages?step=cancellation')
  rows = [{ job_type: 'calendar_invitation', custom_workflow_step_run_id: null, calendar_method: 'REQUEST', metadata: {} }]
  assert.equal((await findMessageWorkflows('calendar controls in this message', 'email')).matches[0].href, '/portal/marketing/custom-workflows/system-calendar-messages?step=update')
  rows = [{ job_type: 'calendar_invitation', custom_workflow_step_run_id: null, calendar_method: 'REQUEST', metadata: { delivery: 'branded_confirmation' }, tour_revision_id: 'a7ca9a8b-7cba-4f62-8c76-c7e4ed76d725', tour_notice: 'confirmation' }]
  const branded = await findMessageWorkflows('calendar controls in this message', 'email')
  assert.ok(!branded.matches.some((match) => match.href === '/portal/marketing/custom-workflows/system-calendar-messages?step=update'))
})
test('manual invoice reminders require metadata.manual and stay separate from scheduled final payment', async () => {
  rows = [{ job_type: 'unpaid_invoice_reminder', custom_workflow_step_run_id: null, metadata: { manual: true } }]
  assert.equal((await findMessageWorkflows('payment reminder for your Luxor event', 'email')).matches[0].href, '/portal/marketing/custom-workflows/system-manual-invoice-reminder?step=unpaid_invoice')
  rows = [{ job_type: 'final_payment_reminder', custom_workflow_step_run_id: null, metadata: { manual: true } }]
  assert.equal((await findMessageWorkflows('final payment reminder staff', 'email')).matches[0].href, '/portal/marketing/custom-workflows/system-manual-invoice-reminder?step=final_payment')
  rows = [{ job_type: 'final_payment_reminder', custom_workflow_step_run_id: null, metadata: { manual: true, milestone: '7_days' } }]
  assert.equal((await findMessageWorkflows('milestone manual final payment', 'email')).matches[0].href, '/portal/marketing/custom-workflows/system-final-payment-emails?step=7_days')
  rows = [{ job_type: 'final_payment_reminder', custom_workflow_step_run_id: null, metadata: { milestone: '7_days' } }]
  const scheduled = await findMessageWorkflows('scheduled final balance wording', 'email')
  assert.equal(scheduled.matches[0].href, '/portal/marketing/custom-workflows/system-final-payment-emails?step=7_days')
  assert.equal(scheduled.unresolved, false)
})
test('internal inquiry_notification jobs do not map to customer workflows', async () => {
  rows = [{ job_type: 'inquiry_notification', custom_workflow_step_run_id: null, metadata: { notificationKind: 'staff_reminder', notificationRendered: true } }]
  const result = await findMessageWorkflows('staff reminder for tour calendar', 'email')
  assert.deepEqual(result.matches, [])
  assert.equal(result.unresolved, true)
})
