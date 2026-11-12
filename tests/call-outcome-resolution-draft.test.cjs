/* eslint @typescript-eslint/no-require-imports: off */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const sql = fs.readFileSync(path.join(__dirname, '../docs/call-outcome-resolution-draft.sql'), 'utf8')
test('source-only candidate is blocked before any DDL', () => {
 assert.ok(sql.indexOf("raise exception 'CALL RESOLUTION DRAFT") < sql.indexOf('create table'))
})
test('candidate exposes exact result contract and durable replay', () => {
 for (const key of ['requestId','inquiryId','taskId','noteId','nextStep','nextTaskId','handoff','workflowStatus','nurtureEnrollmentId']) assert.ok(sql.includes("'"+key+"'"))
 assert.match(sql, /if prior.payload<>input/)
 assert.match(sql, /return prior.result/)
 assert.match(sql, /task_id uuid unique/)
})
test('candidate keeps provider sends and blanket locks out', () => {
 assert.doesNotMatch(sql, /\block table\b|\bhttp_post\b|\bnet\.http|\bpg_advisory_lock/i)
 assert.match(sql, /for update nowait/)
 assert.match(sql, /provider_outcome_unknown/)
 assert.match(sql, /status='sending'/)
})
test('stop happens before task completion and uses prospect-scoped jobs', () => {
 assert.ok(sql.indexOf("set status='stopped'") < sql.indexOf("set status='completed',completed_at=now(),call_outcome"))
 assert.match(sql, /automation_enrollment_id is not null or \(job_type='custom_workflow'/)
 assert.match(sql, /lead.marketing_opt_in is distinct from true/)
 assert.match(sql, /definition->>'trigger'<>'manual'/)
})
test('all prospect writer surfaces share the lead admission trigger', () => {
 for (const table of ['luxor_follow_up_enrollments','luxor_follow_up_actions','luxor_custom_workflow_enrollments','luxor_custom_workflow_step_runs','luxor_tasks','luxor_email_jobs','luxor_text_jobs']) assert.ok(sql.includes('before insert or update on public.'+table))
})

test('future time enforced only after durable receipt replay', () => {
 assert.ok(sql.indexOf('return prior.result;') < sql.indexOf("p_due_at<=clock_timestamp()"))
 assert.ok(sql.indexOf("p_due_at<=clock_timestamp()") < sql.indexOf('if p_task_id is not null then'))
})

test('authorized manual reminder can be edited without transaction-local bypass', () => {
 assert.match(sql, /allowed_task_id uuid/)
 assert.match(sql, /next_task_id:=gen_random_uuid/)
 assert.match(sql, /allowed_task_id=excluded.allowed_task_id/)
 assert.match(sql, /::uuid=ctl.allowed_task_id/)
 assert.match(sql, /oldj->>'status'='pending'/)
 assert.match(sql, /oldj->>'inquiry_id'=j->>'inquiry_id'/)
 assert.match(sql, /insert into public.luxor_tasks\(id,inquiry_id/)
 assert.doesNotMatch(sql, /set_config|current_setting/)
})

test('immutable step semantics classify prospect and preserve transactional work', () => {
 assert.match(sql, /create function public.luxor_resolution_version_purpose/)
 assert.match(sql, /existing_inquiry_acknowledgment/)
 assert.match(sql, /requiredConsentScope'='marketing'/)
 assert.match(sql, /if transactional and not prospect then return 'transactional'/)
 assert.match(sql, /if purpose='transactional' then return new/)
 assert.match(sql, /Custom workflow purpose needs review; no changes saved/)
 assert.match(sql, /public.luxor_resolution_run_purpose\(custom_workflow_step_run_id\)='prospect'/)
})

test('explicit restart is separate, atomic, permissioned and preserves version deduplication', () => {
 const restart = sql.slice(sql.indexOf('create function public.luxor_restart_prospect_workflow'))
 assert.match(restart, /permissions \? 'marketing'/)
 assert.match(restart, /return prior.result/)
 assert.match(restart, /ctl.mode not in \('stopped','manual'\)/)
 assert.match(restart, /This version already ran for this lead/)
 assert.match(restart, /SMS marketing consent required/)
 assert.match(restart, /Email consent required/)
 assert.match(restart, /follow_up_disposition,'no_response'\)<>'no_response'/)
 assert.match(restart, /insert into public.luxor_call_resolution_receipts/)
 assert.doesNotMatch(restart, /delete from public.luxor_prospect_resolution_controls/)
 assert.match(sql, /Flagged enrollment route\/UI integration uses the atomic batch wrapper/)
})

test('explicit enrollment batch has one transaction and durable batch replay', () => {
 const batch = sql.slice(sql.indexOf('create function public.luxor_enroll_workflow_with_resolution'))
 assert.match(batch, /order by id for update nowait/)
 assert.match(batch, /return prior.result/)
 assert.match(batch, /luxor_restart_prospect_workflow/)
 assert.match(batch, /luxor_custom_workflow_manual_enroll/)
 assert.match(batch, /no workflow enrollments saved/)
 assert.match(batch, /explicit_workflow_enroll_batch/)
 assert.doesNotMatch(batch, /exception when others/)
})

test('mixed workflow stop proves original receipt before preserving terminal prefix', () => {
 assert.match(sql, /prospect and transactional then return 'mixed'/)
 assert.match(sql, /step_index<>0/)
 assert.match(sql, /public.luxor_resolution_assert_ack_prefix\(id\)/)
 assert.match(sql, /r.status<>'completed' or r.completed_at is null or r.last_error is not null/)
 assert.doesNotMatch(sql, /j.status<>'sent' or j.sent_at is null/)
 assert.match(sql, /lower\(btrim\(j.recipient_email\)\) is distinct from lower\(btrim\(recipient\)\)/)
 assert.match(sql, /Owned acknowledgment message needs review/)
 assert.match(sql, /j.automation_enrollment_id is not null or j.custom_workflow_step_run_id is not null/)
 assert.match(sql, /manual_acknowledgment_marker_skipped/)
 assert.match(sql, /source.event_key<>'manual:'/); assert.match(sql, /source.event_key<>'contact_form_inquiry_created:'/); assert.match(sql, /source.payload->>'flow' is distinct from 'contact_form'/)
 assert.match(sql, /set status='cancelled',updated_at=now\(\) where public.luxor_resolution_run_purpose\(id\)='prospect'/)
})
test('SMS consent uses existing canonical runtime phone matching', () => {
 assert.equal((sql.match(/c.phone_number=public.luxor_workflow_normalize_phone\(lead.phone\)/g)||[]).length,2)
 assert.doesNotMatch(sql, /regexp_replace\(c.phone_number/)
})
