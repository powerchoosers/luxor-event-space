/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const admissionSql = path.join(__dirname, '../docs/reconciliation/adopted-preview-admission-draft.sql')
let PGlite = null
try {
  PGlite = require('@electric-sql/pglite').PGlite
} catch {
  // Optional harness; install @electric-sql/pglite and add the draft SQL to run this check.
}

const admissionSkip = !PGlite
  ? '@electric-sql/pglite is not installed'
  : !fs.existsSync(admissionSql)
    ? 'docs/reconciliation/adopted-preview-admission-draft.sql is not in the repo yet'
    : false

test('preview admission uses current generation and reviewed producer, and fails closed', { skip: admissionSkip }, async () => {
  const db = new PGlite()
  const task='11111111-1111-4111-8111-111111111111', inquiry='22222222-2222-4222-8222-222222222222'
  const run='33333333-3333-4333-8333-333333333333', review='44444444-4444-4444-8444-444444444444'
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.luxor_adoption_actions(record_table text,record_id uuid,inquiry_id uuid,designation text,channel text,run_id uuid,enrollment_id uuid,step_key text);
      create table public.luxor_adoption_runs(id uuid,inquiry_id uuid,state text,prepared_generation bigint,producer_review_id uuid,invalidation_floor bigint);
      create table public.luxor_adoption_gates(inquiry_id uuid,run_id uuid,held boolean);
      create table public.luxor_adoption_invalidations(inquiry_id uuid,id bigint);
      create table public.luxor_tasks(id uuid,inquiry_id uuid,status text);
      create table public.luxor_inquiries(id uuid,email text,phone text);
      create table public.luxor_ordered_workflow_controls(singleton boolean,enabled boolean);
      create table public.luxor_workflow_contact_slots(inquiry_id uuid,workflow_kind text,enrollment_id uuid,step_key text,action_kind text,action_id uuid,status text);
      create function public.luxor_workflow_identity_phone(p_phone text) returns text language sql immutable as $$
        select nullif(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'')
      $$;
      create table public.fake_admission(generation bigint,running boolean,review_id uuid,review_valid boolean);
      create function public.luxor_adoption_running(p_generation bigint,p_review uuid) returns boolean language sql as $$
        select exists(select 1 from public.fake_admission where generation=p_generation and running and review_id=p_review and review_valid)
      $$;
    `)
    await db.exec(fs.readFileSync(admissionSql, 'utf8'))
    const permissions=(await db.query(`select
      has_function_privilege('anon','public.luxor_adoption_preview_admitted(uuid,uuid)','execute') as anon_execute,
      has_function_privilege('authenticated','public.luxor_adoption_preview_admitted(uuid,uuid)','execute') as authenticated_execute,
      has_function_privilege('service_role','public.luxor_adoption_preview_admitted(uuid,uuid)','execute') as service_execute`)).rows[0]
    assert.deepEqual(permissions,{anon_execute:false,authenticated_execute:false,service_execute:true})
    await db.query("insert into public.luxor_adoption_actions values('luxor_tasks',$1,$2,'current','call',$3,$4,'phone_2')",[task,inquiry,run,review])
    await db.query("insert into public.luxor_adoption_runs values($1,$2,'applied',5,$3,7)",[run,inquiry,review])
    await db.query("insert into public.luxor_adoption_gates values($1,$2,true)",[inquiry,run])
    await db.query("insert into public.luxor_tasks values($1,$2,'pending')",[task,inquiry])
    await db.query("insert into public.luxor_inquiries values($1,'synthetic@example.invalid','+15551234567')",[inquiry])
    await db.exec('insert into public.luxor_ordered_workflow_controls values(true,true)')
    await db.query("insert into public.luxor_workflow_contact_slots values($1,'system',$2,'phone_2','call',$3,'held')",[inquiry,review,task])
    await db.query("insert into public.fake_admission values(5,true,$1,true)",[review])
    const admitted=async()=> (await db.query('select public.luxor_adoption_preview_admitted($1,$2) ok',[task,inquiry])).rows[0].ok
    assert.equal(await admitted(),true)
    assert.equal((await db.query('select status from public.luxor_workflow_contact_slots')).rows[0].status,'held')
    await db.exec("update public.luxor_workflow_contact_slots set status='open'")
    assert.equal(await admitted(),false)
    await db.exec("update public.luxor_workflow_contact_slots set status='held'")
    await db.query("insert into public.luxor_workflow_contact_slots values($1,'system',$2,'phone_2','call',$3,'held')",[inquiry,review,task])
    assert.equal(await admitted(),false)
    await db.exec('delete from public.luxor_workflow_contact_slots where ctid=(select max(ctid) from public.luxor_workflow_contact_slots)')
    await db.exec("update public.luxor_workflow_contact_slots set step_key='wrong'")
    assert.equal(await admitted(),false)
    await db.exec("update public.luxor_workflow_contact_slots set step_key='phone_2'")
    await db.query("insert into public.luxor_inquiries values($1,'other@example.invalid','+15551234567')",[review])
    assert.equal(await admitted(),false)
    await db.query("delete from public.luxor_inquiries where id=$1",[review])
    await db.query("insert into public.luxor_inquiries values($1,'synthetic@example.invalid','+15550000000')",[review])
    assert.equal(await admitted(),false)
    await db.query("delete from public.luxor_inquiries where id=$1",[review])
    await db.exec("update public.luxor_inquiries set phone=null")
    assert.equal(await admitted(),false)
    await db.exec("update public.luxor_inquiries set phone='+15551234567'")
    await db.exec('update public.luxor_ordered_workflow_controls set enabled=false')
    assert.equal(await admitted(),false)
    await db.exec('update public.luxor_ordered_workflow_controls set enabled=true')
    await db.exec('update public.luxor_adoption_runs set invalidation_floor=null')
    assert.equal(await admitted(),false)
    await db.exec('update public.luxor_adoption_runs set invalidation_floor=7')
    await db.exec('update public.luxor_adoption_actions set designation=null')
    assert.equal(await admitted(),false)
    await db.exec("update public.luxor_adoption_actions set designation='current',channel=null")
    assert.equal(await admitted(),false)
    await db.exec("update public.luxor_adoption_actions set channel='call'")
    await db.exec('update public.luxor_adoption_runs set state=null')
    assert.equal(await admitted(),false)
    await db.exec("update public.luxor_adoption_runs set state='applied'")
    await db.exec('update public.fake_admission set generation=6')
    assert.equal(await admitted(),false)
    await db.exec('update public.fake_admission set generation=5,review_valid=false')
    assert.equal(await admitted(),false)
    await db.exec('update public.fake_admission set review_valid=true,running=false')
    assert.equal(await admitted(),false)
    await db.exec('update public.fake_admission set running=true')
    await db.query('insert into public.luxor_adoption_invalidations values($1,8)',[inquiry])
    assert.equal(await admitted(),false)
    await db.exec('truncate public.luxor_adoption_invalidations; update public.luxor_tasks set status=\'completed\'')
    assert.equal(await admitted(),false)
  } finally { await db.close() }
})
