'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

test('live lead updates preserve concurrent owner edits and reject unsafe identity matches', { timeout: 120000 }, async t => {
  if (!process.env.PGLITE_MODULE) return t.skip('Set PGLITE_MODULE to a disposable local PGlite install.')
  const { PGlite } = require(process.env.PGLITE_MODULE)
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.luxor_phone_numbers(phone_number text,is_public boolean);
      insert into public.luxor_phone_numbers values ('+15559990000',true);
      create table public.luxor_test_settings(id int,enabled boolean,identification_phone text,identification_email text);
      create table public.luxor_inquiries(id uuid primary key,full_name text,phone text,email text,updated_at timestamptz,archived_at timestamptz,is_test boolean,metadata jsonb,event_type text,target_date text,guest_count int,budget text,package_interest text);
      create table public.luxor_calls(id uuid primary key,twilio_call_sid text,direction text,status text,to_number text,inquiry_id uuid,contact_name text,notes text,metadata jsonb,updated_at timestamptz);
      create function public.luxor_workflow_normalize_phone(v text) returns text language sql immutable as $$ select case when length(regexp_replace(coalesce(v,''),'[^0-9]','','g'))=10 then '+1'||regexp_replace(v,'[^0-9]','','g') when length(regexp_replace(coalesce(v,''),'[^0-9]','','g'))=11 then '+'||regexp_replace(v,'[^0-9]','','g') else null end $$;
    `)
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261111202558_elena_live_lead_updates.sql'),'utf8'))
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261113060033_elena_caller_language.sql'),'utf8'))
    const lead='10000000-0000-4000-8000-000000000001', call='20000000-0000-4000-8000-000000000001', nonce='30000000-0000-4000-8000-000000000001', captured='40000000-0000-4000-8000-000000000001', sid='CA'+'1'.repeat(32)
    const meta={scope:'elena_live_inbound',ingress_mode:'programmable_sip',rehearsal_only:false,accepted:true,openai_session_id:'live_test',inbound_capture:{confirmed:true,matching_review_needed:false,inquiry_id:lead,nonce:captured,full_name:'Synthetic Caller',phone:'+15550000001',email:null},lead_update_pending:{nonce,inquiry_id:lead,contact_nonce:captured,expires_at:new Date(Date.now()+120000).toISOString(),inquiry_updated_at:'2026-11-01T00:00:00.000Z',phone:'+15550000002',email:'caller@example.invalid',event_type:'Wedding',target_date:'2027-05-01',guest_count:100,notes:'Prefers a Saturday tour',spoken_language:'Spanish'}}
    await db.query(`insert into public.luxor_inquiries values ($1,'Synthetic Caller','+15550000001',null,'2026-11-01',null,false,'{"tourLanguagePreference":"en","ownerNote":"preserve"}',null,null,null,null,null)`,[lead])
    await db.query(`insert into public.luxor_calls values ($1,$2,'inbound','in-progress','+15559990000',$3,'Synthetic Caller','Existing owner note',$4,now())`,[call,sid,lead,JSON.stringify(meta)])
    const invoke=()=>db.query(`select public.luxor_confirm_elena_lead_update($1,'live_test',$2) as result`,[sid,nonce])
    await assert.rejects(db.query(`select public.luxor_confirm_elena_lead_update($1,'wrong_session',$2)`,[sid,nonce]))
    await db.query(`update public.luxor_inquiries set updated_at='2026-11-02' where id=$1`,[lead])
    await assert.rejects(invoke())
    await db.query(`update public.luxor_inquiries set updated_at='2026-11-01' where id=$1`,[lead])
    await db.query(`update public.luxor_inquiries set full_name='Different Person' where id=$1`,[lead])
    await assert.rejects(invoke())
    await db.query(`update public.luxor_inquiries set full_name='Synthetic Caller' where id=$1`,[lead])
    const other='50000000-0000-4000-8000-000000000001'
    await db.query(`insert into public.luxor_inquiries(id,full_name,phone,updated_at,is_test,metadata) values ($1,'Other lead','+15550000002',now(),false,'{}')`,[other])
    await assert.rejects(invoke())
    await db.query(`delete from public.luxor_inquiries where id=$1`,[other])
    assert.equal((await db.query(`select metadata->'spokenLanguage' as language from public.luxor_inquiries where id=$1`,[lead])).rows[0].language,null)
    await db.query(`update public.luxor_calls set metadata=jsonb_set(metadata,'{inbound_capture,matching_review_needed}','true') where id=$1`,[call])
    await assert.rejects(invoke())
    await db.query(`update public.luxor_calls set metadata=jsonb_set(metadata,'{inbound_capture,matching_review_needed}','false') where id=$1`,[call])
    await db.query(`update public.luxor_calls set metadata=jsonb_set(metadata,'{lead_update_pending,spoken_language}','false') where id=$1`,[call])
    await assert.rejects(invoke())
    await db.query(`update public.luxor_calls set metadata=jsonb_set(metadata,'{lead_update_pending,spoken_language}','"Spanish"') where id=$1`,[call])
    assert.equal((await invoke()).rows[0].result.saved,true)
    const savedMetadata=(await db.query(`select metadata from public.luxor_inquiries where id=$1`,[lead])).rows[0].metadata
    assert.equal(savedMetadata.spokenLanguage.language,'Spanish')
    assert.equal(savedMetadata.spokenLanguage.source,'caller_confirmed')
    assert.equal(savedMetadata.spokenLanguage.callSid,sid)
    assert.ok(savedMetadata.spokenLanguage.confirmedAt)
    assert.equal(savedMetadata.tourLanguagePreference,'en')
    assert.equal(savedMetadata.ownerNote,'preserve')
    assert.equal((await invoke()).rows[0].result.duplicate,true)
    const row=(await db.query(`select i.phone,i.email,i.event_type,i.target_date,i.guest_count,c.notes from public.luxor_inquiries i join public.luxor_calls c on c.inquiry_id=i.id where i.id=$1`,[lead])).rows[0]
    assert.deepEqual(row,{phone:'+15550000002',email:'caller@example.invalid',event_type:'Wedding',target_date:'2027-05-01',guest_count:100,notes:'Existing owner note\nElena call: Prefers a Saturday tour'})
    const capture=(await db.query(`select metadata->'inbound_capture' as capture from public.luxor_calls where id=$1`,[call])).rows[0].capture
    assert.equal(capture.email,'caller@example.invalid')
    assert.equal(capture.phone,'+15550000002')
    const languageNonce='30000000-0000-4000-8000-000000000002'
    const currentLead=(await db.query(`select updated_at from public.luxor_inquiries where id=$1`,[lead])).rows[0]
    const languagePending={nonce:languageNonce,inquiry_id:lead,contact_nonce:captured,expires_at:new Date(Date.now()+120000).toISOString(),inquiry_updated_at:currentLead.updated_at,spoken_language:'Español'}
    await db.query(`update public.luxor_calls set metadata=jsonb_set(metadata,'{lead_update_pending}',$2::jsonb) where id=$1`,[call,JSON.stringify(languagePending)])
    const languageInvoke=()=>db.query(`select public.luxor_confirm_elena_lead_update($1,'live_test',$2) as result`,[sid,languageNonce])
    for(const invalid of ['x'.repeat(61),'Spanish\nEnglish',{},42]) {
      await db.query(`update public.luxor_calls set metadata=jsonb_set(metadata,'{lead_update_pending,spoken_language}',$2::jsonb) where id=$1`,[call,JSON.stringify(invalid)])
      await assert.rejects(languageInvoke())
      assert.equal((await db.query(`select metadata->'spokenLanguage'->>'language' as language from public.luxor_inquiries where id=$1`,[lead])).rows[0].language,'Spanish')
    }
    await db.query(`update public.luxor_calls set metadata=jsonb_set(metadata,'{lead_update_pending,spoken_language}','"Español"') where id=$1`,[call])
    assert.equal((await languageInvoke()).rows[0].result.saved,true)
    assert.equal((await languageInvoke()).rows[0].result.duplicate,true)
    assert.equal((await db.query(`select metadata->'spokenLanguage'->>'language' as language from public.luxor_inquiries where id=$1`,[lead])).rows[0].language,'Español')
    assert.equal((await db.query(`select has_function_privilege('anon','public.luxor_confirm_elena_lead_update(text,text,uuid)','execute') as allowed`)).rows[0].allowed,false)
  } finally { await db.close() }
})
