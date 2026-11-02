'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const { spawn, spawnSync, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repo = path.resolve(__dirname, '..')
const migrationPath = path.join(repo, 'supabase/migrations/20261102093000_luxor_payment_installment_allocations.sql')
const container = `luxor-ledger-postgres-test-${process.pid}-${Date.now()}`

function runDocker(args, input) {
  return execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 90000 })
}

function psqlSpawn(input) {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'review'])
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk })
  child.stdin.end(input)
  const closed = new Promise((resolve) => child.on('close', (code) => resolve({ code, stdout, stderr })))
  return { child, closed, get output() { return stdout + stderr } }
}

async function waitForText(process, text, timeoutMs = 5000) {
  const start = Date.now()
  while (!process.output.includes(text)) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for Postgres output: ${text}\n${process.output}`)
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

test('proposed payment migrations and RPC preserve safe retries and serialize final-balance writes', { timeout: 120000 }, async (t) => {
  const available = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' })
  if (available.status !== 0) return t.skip('Docker is unavailable; this test requires an isolated local Postgres container.')

  try {
    runDocker(['run', '--rm', '--name', container, '-e', 'POSTGRES_PASSWORD=review-only', '-e', 'POSTGRES_DB=review', '-d', 'postgres:16-alpine'])
    let ready = false
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const probe = spawnSync('docker', ['exec', container, 'psql', '-U', 'postgres', '-d', 'review', '-At', '-c', 'select 1'], { encoding: 'utf8' })
      if (probe.status === 0) { ready = true; break }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    assert.equal(ready, true, 'isolated PostgreSQL review database did not become ready')

    runDocker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'review'], `
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.luxor_invoices (
        id uuid primary key, booking_id uuid, inquiry_id uuid, invoice_kind text not null,
        parent_invoice_id uuid, total numeric(12,2) not null, status text not null default 'sent',
        paid_at timestamptz, stripe_checkout_session_id text, updated_at timestamptz default now()
      );
      create table public.luxor_bookings (
        id uuid primary key, inquiry_id uuid, invoice_id uuid, status text not null,
        contract_status text not null, metadata jsonb not null default '{}'::jsonb
      );
      create table public.luxor_inquiries (id uuid primary key, status text not null);
      create table public.luxor_payment_installments (
        id uuid primary key, booking_id uuid not null, invoice_id uuid, installment_order integer not null,
        label text not null, amount numeric(12,2) not null, status text not null,
        metadata jsonb not null default '{}'::jsonb, payment_method text, reference text,
        paid_at timestamptz, updated_at timestamptz default now()
      );
      create table public.luxor_payments (
        id uuid primary key default gen_random_uuid(),
        booking_id uuid, invoice_id uuid references public.luxor_invoices(id),
        amount numeric(12,2) not null, status text not null, payment_method text,
        processor text, processor_reference text, paid_at timestamptz, inquiry_id uuid,
        notes text, metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        unique (processor, processor_reference)
      );
      create table public.luxor_follow_up_automations (
        automation_key text primary key, name text not null, enabled boolean not null,
        send_approved boolean not null, timing_configured boolean not null, timezone text not null
      );
      create table public.luxor_email_jobs (
        id uuid primary key default gen_random_uuid(), job_type text not null,
        test_run_id uuid, metadata jsonb not null default '{}'::jsonb
      );
    `)

    runDocker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'review'], fs.readFileSync(migrationPath, 'utf8'))
    runDocker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'review'], fs.readFileSync(path.join(repo, 'supabase/migrations/20261102120000_payment_reminder_automation_control.sql'), 'utf8'))

    const upserts = psqlSpawn(`
      insert into public.luxor_invoices(id, invoice_kind, total) values ('00000000-0000-4000-8000-000000000001', 'final_balance', 750);
      insert into public.luxor_payments(booking_id, invoice_id, amount, status, payment_method, processor, processor_reference, paid_at, notes, metadata)
      values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 750, 'paid', 'Cash', 'manual', 'manual:invoice:full-balance', '2026-11-02T10:00:00Z', 'canonical note', '{"currency":"usd","canonical":"original"}')
      on conflict (processor, processor_reference) do update set booking_id=excluded.booking_id, invoice_id=excluded.invoice_id,
        amount=excluded.amount, status=excluded.status, payment_method=excluded.payment_method, paid_at=excluded.paid_at,
        notes=excluded.notes, metadata=excluded.metadata;
      insert into public.luxor_payments(booking_id, invoice_id, amount, status, payment_method, processor, processor_reference, paid_at, notes, metadata)
      values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 750, 'paid', 'ACH', 'manual', 'manual:invoice:full-balance', '2026-11-02T11:30:00Z', 'retry note', '{"currency":"USD","canonical":"retry"}')
      on conflict (processor, processor_reference) do update set booking_id=excluded.booking_id, invoice_id=excluded.invoice_id,
        amount=excluded.amount, status=excluded.status, payment_method=excluded.payment_method, paid_at=excluded.paid_at,
        notes=excluded.notes, metadata=excluded.metadata;
      do $$ begin
        if (select count(*) from public.luxor_payments where invoice_id='00000000-0000-4000-8000-000000000001') <> 1
          or (select sum(amount) from public.luxor_payments where invoice_id='00000000-0000-4000-8000-000000000001') <> 750
        then raise exception 'exact transaction retry changed the payment ledger'; end if;
        if (select payment_method from public.luxor_payments where invoice_id='00000000-0000-4000-8000-000000000001') <> 'Cash'
          or (select paid_at from public.luxor_payments where invoice_id='00000000-0000-4000-8000-000000000001') <> '2026-11-02T10:00:00Z'::timestamptz
          or (select notes from public.luxor_payments where invoice_id='00000000-0000-4000-8000-000000000001') <> 'canonical note'
          or (select metadata->>'canonical' from public.luxor_payments where invoice_id='00000000-0000-4000-8000-000000000001') <> 'original'
        then raise exception 'upsert retry did not preserve canonical receipt details'; end if;
      end $$;
      do $$ begin
        insert into public.luxor_payments(booking_id, invoice_id, amount, status, payment_method, processor, processor_reference, paid_at)
        values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 751, 'paid', 'Cash', 'manual', 'manual:invoice:full-balance', '2026-11-02T10:00:00Z')
        on conflict (processor, processor_reference) do update set amount=excluded.amount;
        raise exception using errcode='P0001', message='changed stable-reference payload unexpectedly succeeded';
      exception when unique_violation then null; end $$;
      do $$ begin
        insert into public.luxor_payments(booking_id, invoice_id, amount, status, payment_method, processor, processor_reference, paid_at, metadata)
        values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 750, 'paid', 'Cash', 'manual', 'manual:invoice:full-balance', '2026-11-02T10:00:00Z', '{"currency":"mxn"}')
        on conflict (processor, processor_reference) do nothing;
        raise exception using errcode='P0001', message='changed currency unexpectedly succeeded';
      exception when unique_violation then null; end $$;
      do $$ begin
        insert into public.luxor_payments(booking_id, invoice_id, amount, status, payment_method, processor, processor_reference, paid_at)
        values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 1, 'paid', 'Cash', 'manual', 'manual:invoice:extra', '2026-11-02T10:00:00Z');
        raise exception using errcode='P0001', message='new overpayment unexpectedly succeeded';
      exception when check_violation then null; end $$;
    `)
    const upsertResult = await upserts.closed
    assert.equal(upsertResult.code, 0, upsertResult.stderr)

    runDocker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'review'], `
      insert into public.luxor_invoices(id, invoice_kind, total) values ('00000000-0000-4000-8000-000000000002', 'final_balance', 1000);
    `)
    const first = psqlSpawn(`
      begin;
      insert into public.luxor_payments(booking_id, invoice_id, amount, status, payment_method, processor, processor_reference, paid_at)
      values ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 600, 'paid', 'Cash', 'manual', 'race:a', '2026-11-02T10:00:00Z');
      select pg_sleep(2);
      commit;
    `)
    await waitForText(first, 'INSERT 0 1')
    const second = psqlSpawn(`
      insert into public.luxor_payments(booking_id, invoice_id, amount, status, payment_method, processor, processor_reference, paid_at)
      values ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 600, 'paid', 'Cash', 'manual', 'race:b', '2026-11-02T10:00:00Z');
    `)
    const [firstResult, secondResult] = await Promise.all([first.closed, second.closed])
    assert.equal(firstResult.code, 0, firstResult.stderr)
    assert.notEqual(secondResult.code, 0, 'second concurrent payment should be rejected')
    assert.match(secondResult.stderr, /exceeds the remaining final-balance invoice/)
    const finalRows = runDocker(['exec', '-i', container, 'psql', '-At', '-U', 'postgres', '-d', 'review', '-c', "select count(*) || ':' || sum(amount) from public.luxor_payments where invoice_id='00000000-0000-4000-8000-000000000002'"])
    assert.equal(finalRows.trim(), '1:600.00')

    runDocker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'review'], `
      insert into public.luxor_invoices(id, invoice_kind, total)
        values ('00000000-0000-4000-8000-000000000003', 'event', 1000);
      insert into public.luxor_payments(invoice_id, amount, status, payment_method, processor, processor_reference, paid_at)
        values ('00000000-0000-4000-8000-000000000003', 100, 'paid', 'stripe_checkout', 'stripe', 'event:existing', '2026-11-02T10:00:00Z')
        on conflict (processor, processor_reference) do nothing;
      insert into public.luxor_payments(invoice_id, amount, status, payment_method, processor, processor_reference, paid_at)
        values ('00000000-0000-4000-8000-000000000003', 900, 'paid', 'changed-kind', 'stripe', 'event:existing', '2026-11-02T12:30:00Z')
        on conflict (processor, processor_reference) do nothing;
      do $$ begin
        if (select count(*) from public.luxor_payments where processor_reference='event:existing') <> 1
          or (select amount from public.luxor_payments where processor_reference='event:existing') <> 100
        then raise exception 'non-final invoice behavior changed'; end if;
      end $$;

      insert into public.luxor_invoices(id, invoice_kind, total)
        values ('00000000-0000-4000-8000-000000000004', 'final_balance', 1000);
      insert into public.luxor_payments(invoice_id, amount, status, payment_method, processor, processor_reference, paid_at, metadata)
        values ('00000000-0000-4000-8000-000000000004', 400, 'paid', 'stripe_checkout', 'stripe', 'cs_async_replay', '2026-11-02T10:00:00Z', '{"currency":"usd","payment_kind":"final"}')
        on conflict (processor, processor_reference) do nothing;
      insert into public.luxor_payments(invoice_id, amount, status, payment_method, processor, processor_reference, paid_at, metadata)
        values ('00000000-0000-4000-8000-000000000004', 400, 'paid', 'stripe_checkout', 'stripe', 'cs_async_replay', '2026-11-02T12:30:00Z', '{"currency":"USD","payment_kind":"final","delivery":"retry"}')
        on conflict (processor, processor_reference) do nothing;
      do $$ begin
        if (select count(*) from public.luxor_payments where processor_reference='cs_async_replay') <> 1
          or (select paid_at from public.luxor_payments where processor_reference='cs_async_replay') <> '2026-11-02T10:00:00Z'::timestamptz
          or (select metadata->>'payment_kind' from public.luxor_payments where processor_reference='cs_async_replay') <> 'final'
        then raise exception 'Stripe DO NOTHING replay did not preserve original receipt'; end if;
      end $$;
    `)

    runDocker(['exec', '-i', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'review'], `
      insert into public.luxor_inquiries(id, status) values ('20000000-0000-4000-8000-000000000001', 'booked');
      insert into public.luxor_invoices(id, invoice_kind, total, status)
        values ('00000000-0000-4000-8000-000000000010', 'event', 4000, 'sent');
      insert into public.luxor_invoices(id, booking_id, invoice_kind, parent_invoice_id, total, status)
        values ('00000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000010', 'final_balance', '00000000-0000-4000-8000-000000000010', 3000, 'sent');
      insert into public.luxor_bookings(id, inquiry_id, invoice_id, status, contract_status, metadata)
        values ('10000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'confirmed', 'signed', '{"deposit_paid_at":"2026-11-01T10:00:00Z"}');
      insert into public.luxor_payment_installments(id, booking_id, invoice_id, installment_order, label, amount, status, metadata)
        values ('30000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000010', 2, 'Payment 2', 750, 'partial', '{"paid_amount":250}');
      select public.luxor_record_manual_installment_payment(
        '40000000-0000-4000-8000-000000000010', repeat('a',64),
        '10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011',
        250, '2026-11-01T10:00:00Z', 'Zelle', 'manual installment ref', 'test receipt', 'owner@example.invalid',
        '[{"installment_id":"30000000-0000-4000-8000-000000000010","amount":250}]'::jsonb
      );
      do $$ begin
        if (select count(*) from public.luxor_payments where metadata->>'installment_entry_key'='40000000-0000-4000-8000-000000000010') <> 1
          or (select sum(amount) from public.luxor_payment_installment_allocations where installment_id='30000000-0000-4000-8000-000000000010') <> 250
          or (select (metadata->>'installment_allocation_legacy_baseline')::numeric from public.luxor_payment_installments where id='30000000-0000-4000-8000-000000000010') <> 250
        then raise exception 'full migration RPC failed to reconcile and allocate a legacy partial: payments %, allocations %, baseline %',
          (select count(*) from public.luxor_payments where metadata->>'installment_entry_key'='40000000-0000-4000-8000-000000000010'),
          (select coalesce(sum(amount),0) from public.luxor_payment_installment_allocations where installment_id='30000000-0000-4000-8000-000000000010'),
          (select metadata->>'installment_allocation_legacy_baseline' from public.luxor_payment_installments where id='30000000-0000-4000-8000-000000000010'); end if;
      end $$;
      select public.luxor_record_manual_installment_payment(
        '40000000-0000-4000-8000-000000000010', repeat('a',64),
        '10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011',
        250, '2026-11-01T10:00:00Z', 'Zelle', 'manual installment ref', 'test receipt', 'owner@example.invalid',
        '[{"installment_id":"30000000-0000-4000-8000-000000000010","amount":250}]'::jsonb
      );
      do $$ begin
        if (select count(*) from public.luxor_payments where metadata->>'installment_entry_key'='40000000-0000-4000-8000-000000000010') <> 1
        then raise exception 'manual installment RPC replay created another payment'; end if;
      end $$;
    `)
  } finally {
    spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
  }
})
