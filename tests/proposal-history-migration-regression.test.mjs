import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const sql = fs.readFileSync(new URL('../supabase/migrations/20261013160425_luxor_proposal_family_history_v3.sql', import.meta.url), 'utf8')

test('failed preparation cannot release a sending or delivery-unconfirmed reservation', () => {
  const body = sql.match(/create or replace function public\.luxor_fail_proposal_send\([\s\S]*?\n\$\$;/)?.[0]
  assert.ok(body, 'fail RPC exists')
  assert.match(body, /attempt\.state in \('sending', 'delivery_unconfirmed'\)/)
  assert.match(body, /state = case when delivery_unconfirmed then 'delivery_unconfirmed' else 'failed' end/)
  assert.match(body, /failed_at = case when delivery_unconfirmed then null/)
})

test('proposal activity cannot be truncated through broad service-role grants', () => {
  assert.match(sql, /revoke all on public\.luxor_proposal_activity from service_role;\s*grant select, insert on public\.luxor_proposal_activity to service_role;/)
  assert.match(sql, /revoke all on sequence public\.luxor_proposal_activity_id_seq from public, anon, authenticated, service_role;/)
})

test('the proposal acceptance guard fails closed outside READ COMMITTED', () => {
  const body = sql.match(/create or replace function public\.luxor_guard_single_accepted_proposal_per_event\([\s\S]*?\n\$\$;/)?.[0]
  assert.ok(body, 'alternate acceptance guard exists')
  assert.match(body, /current_setting\('transaction_isolation'\) <> 'read committed'/)
})

test('proposal term edits and their append-only history event share one transaction', () => {
  const body = sql.match(/create or replace function public\.luxor_update_proposal_and_record_edit\([\s\S]*?\n\$\$;/)?.[0]
  assert.ok(body, 'atomic edit RPC exists')
  assert.match(body, /for update/)
  assert.match(body, /update public\.luxor_invoices[\s\S]*?perform public\.luxor_append_proposal_activity/)
  assert.match(body, /proposal_context = patched\.proposal_context/)
  assert.match(body, /price_locked_at is not null[\s\S]*?proposal_sent_at is not null[\s\S]*?proposal_accepted_at is not null[\s\S]*?booking_id is not null/)
  assert.match(sql, /grant execute on function public\.luxor_update_proposal_and_record_edit\(uuid, jsonb, text\) to service_role;/)
  const route = fs.readFileSync(new URL('../src/app/api/invoices/route.ts', import.meta.url), 'utf8')
  assert.match(route, /updateLuxorProposalAndRecordEditActivity\(id, updates, session\.email\)/)
  assert.doesNotMatch(route, /Proposal saved, but its edit activity could not be recorded/)
})

test('proposal send retries reserve before claiming and keep the original active attempt id', () => {
  const route = fs.readFileSync(new URL('../src/app/api/invoices/[id]/send/route.ts', import.meta.url), 'utf8')
  const reservation = route.indexOf('const sendReservation = await beginLuxorProposalSend')
  const claim = route.indexOf('claimLuxorProposalPublication(invoice, attemptId)')
  assert.ok(reservation >= 0 && claim > reservation, 'history reservation must be resolved before publication is claimed')
  assert.match(route.slice(reservation, claim), /attemptId = sendReservation\.attempt_id/)
  assert.match(route.slice(claim, claim + 500), /failLuxorProposalSend\(sendReservation\.attempt_id/)
})

test('V4 SQL validates rounded rates and every duplicated boundary and time alias', () => {
  const validator = sql.match(/create or replace function public\.luxor_validate_weekday_rental_context\([\s\S]*?\n\$\$;/)?.[0]
  assert.ok(validator, 'frozen rental validator exists')
  assert.match(validator, /round\(\(s ->> 'minimum_price'\)::numeric.*minimum_hours.*::numeric, 2\)/)
  assert.doesNotMatch(validator, /day_group.*friday.*saturday.*sunday[\s\S]*?minimum_hours.*<> 6(?![0-9])/)
  assert.match(validator, /array\['rental_start_at', 'rental_end_at', 'guest_arrival_at', 'event_end_at'\]/)
  assert.match(validator, /rentalStartTime[\s\S]*?rentalEndTime[\s\S]*?guestArrivalTime[\s\S]*?eventEndTime/)
})

test('separate proposal families receive independent first-send numbers and revisions inherit their family', () => {
  const assign = sql.match(/create or replace function public\.luxor_assign_proposal_family\([\s\S]*?\n\$\$;/)?.[0]
  const begin = sql.match(/create or replace function public\.luxor_begin_proposal_send\([\s\S]*?\n\$\$;/)?.[0]
  assert.ok(assign && begin, 'proposal family and first-send functions exist')
  assert.match(assign, /new\.supersedes_invoice_id is not null[\s\S]*?new\.proposal_family_id := parent_family_id/)
  assert.match(assign, /new\.proposal_family_id := new\.id[\s\S]*?insert into public\.luxor_proposal_families/)
  assert.match(begin, /coalesce\(family\.proposal_number,[\s\S]*?max\(f\.proposal_number\), 0\) \+ 1/)
})

test('resends keep the existing family number and acceptance is locked to one lead event', () => {
  const complete = sql.match(/create or replace function public\.luxor_complete_proposal_send\([\s\S]*?\n\$\$;/)?.[0]
  const accepted = sql.match(/create or replace function public\.luxor_guard_single_accepted_proposal_per_event\([\s\S]*?\n\$\$;/)?.[0]
  const claim = sql.match(/create or replace function public\.luxor_claim_weekday_proposal_acceptance\([\s\S]*?\n\$\$;/)?.[0]
  assert.ok(complete && accepted && claim, 'resend and acceptance guards exist')
  assert.match(complete, /elsif family\.proposal_number is distinct from attempt\.proposed_number/)
  assert.match(complete, /proposal_number = family\.proposal_number/)
  assert.match(accepted, /i\.inquiry_id = new\.inquiry_id/)
  assert.match(accepted, /i\.lead_event_id is not distinct from new\.lead_event_id/)
  assert.match(claim, /select i\.\* into invoice[\s\S]*?where i\.id = p_invoice_id for update/)
})

test('proposal number from a send reservation survives claim and invoice updates before rendering', () => {
  const route = fs.readFileSync(new URL('../src/app/api/invoices/[id]/send/route.ts', import.meta.url), 'utf8')
  assert.match(route, /invoice = sendReservation \? \{ \.\.\.claimed, proposal_number: sendReservation\.proposal_number \} : claimed/)
  assert.match(route, /const frozenInvoice = sendReservation \? \{ \.\.\.lockedInvoice, proposal_number: sendReservation\.proposal_number \} : lockedInvoice/)
})
