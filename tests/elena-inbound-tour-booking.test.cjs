'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const migration = 'supabase/migrations/20261111202609_elena_tour_invitation.sql'
function functionSql(file, name) {
  const source = read(file)
  const start = source.search(new RegExp(`create(?:\\s+or\\s+replace)?\\s+function\\s+public\\.${name}\\s*\\(`, 'i'))
  assert(start >= 0, `Missing real function ${name}`)
  const tail = source.slice(start)
  const quote = tail.match(/\bas\s+(\$[a-z_]*\$)/i)[1]
  const end = tail.indexOf(quote + ';', tail.indexOf(quote) + quote.length)
  return tail.slice(0, end + quote.length + 1)
}

function helperService(state) {
  const filename = path.join(root,'src/lib/luxorElenaInboundToursServer.ts')
  const compiled = ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText
  const loaded = new Module(filename,module)
  loaded.filename=filename
  loaded.paths=Module._nodeModulePaths(path.dirname(filename))
  const original=loaded.require.bind(loaded)
  const stubs={
    'server-only':{},
    './luxorVenue':{LUXOR_VENUE_ADDRESS:'Synthetic authoritative location'},
    './luxorTourSlotsServer':{listAvailableLuxorTourSlots:async()=>state.slots},
    './supabaseRestServer':{supabaseRestStrict:async(query,init={})=>{
      state.operations.push({query,init})
      if(query.startsWith('rpc/')) return {booked:true,replayed:false,slot:{date:'2099-11-11',time:'4:00 PM'},message:'Tour booked.'}
      if(query.startsWith('luxor_calls?')&&init.method==='PATCH') {
        if(state.stale) return []
        state.call={...state.call,...JSON.parse(init.body)}
        return [structuredClone(state.call)]
      }
      if(query.startsWith('luxor_calls?')) return [structuredClone(state.call)]
      if(query.startsWith('luxor_inquiries?')) return [structuredClone(state.inquiry)]
      if(query.startsWith('luxor_calendar_events?')) return state.calendars
      throw new Error('Unexpected operation')
    }},
  }
  loaded.require=(name)=>Object.hasOwn(stubs,name)?stubs[name]:original(name)
  loaded._compile(compiled,filename)
  return loaded.exports
}

function helperFixture() {
  const inquiryId=randomUUID(),slotId=randomUUID(),callSid='CA'+'1'.repeat(32),sessionId='live_synthetic'
  const stamp=new Date().toISOString()
  return {operations:[],calendars:[],slots:[{id:slotId,date:'2099-11-11',time:'4:00 PM',dateLabel:'Wednesday, November 11, 2099',label:'Wednesday, November 11, 2099, 4:00 PM'}],
    call:{twilio_call_sid:callSid,direction:'inbound',to_number:'+19563652037',status:'in-progress',inquiry_id:inquiryId,updated_at:stamp,metadata:{scope:'elena_live_inbound',ingress_mode:'programmable_sip',accepted:true,sip_answered:true,rehearsal_only:false,openai_session_id:sessionId,inbound_capture:{confirmed:true,matching_review_needed:false,nonce:randomUUID(),inquiry_id:inquiryId,full_name:'Synthetic Caller',phone:'+12105550111',email:'caller@example.invalid'}}},
    inquiry:{id:inquiryId,full_name:'Synthetic Caller',email:'caller@example.invalid',phone:'+12105550111',status:'new',archived_at:null,is_test:false,preferred_tour_date:null,preferred_tour_time:null,current_tour_visit_id:null,updated_at:stamp},
  }
}

test('booking helper freezes a server readback, retries the same nonce and performs no scheduling while preparing',async()=>{
  const state=helperFixture(),service=helperService(state)
  const input={callSid:state.call.twilio_call_sid,sessionId:'live_synthetic',slotId:state.slots[0].id,sendInvite:false}
  const result=await service.prepareElenaLiveTourBooking(input)
  assert.match(result.question,/San Antonio time/)
  assert.match(result.question,/without sending an email/)
  assert.equal(state.call.metadata.booking_pending.venue_location,'Luxor at Las Palmas Events, Synthetic authoritative location')
  assert.equal((await service.prepareElenaLiveTourBooking(input)).nonce,result.nonce)
  assert.equal(state.operations.filter(({init})=>init.method==='PATCH').length,1)
  assert.equal(state.operations.some(({query})=>query.startsWith('rpc/')),false)
  await service.confirmElenaLiveTourBooking({...input,nonce:result.nonce})
  const operation=state.operations.at(-1)
  assert.equal(operation.query,'rpc/luxor_confirm_elena_inbound_tour')
  assert.deepEqual(JSON.parse(operation.init.body),{p_call_sid:input.callSid,p_session_id:input.sessionId,p_nonce:result.nonce})
})

test('booking helper rejects stale, mismatched, ended and rehearsal calls before any scheduling',async()=>{
  for(const change of [state=>{state.stale=true},state=>{state.inquiry.email='different@example.invalid'},state=>{state.call.status='completed'},state=>{state.call.metadata.rehearsal_only=true},state=>{state.call.metadata.sip_answered=false},state=>{state.calendars=[{id:randomUUID()}]},state=>{state.call.metadata.inbound_capture.matching_review_needed=true}]) {
    const state=helperFixture();change(state)
    const service=helperService(state)
    await assert.rejects(service.prepareElenaLiveTourBooking({callSid:state.call.twilio_call_sid,sessionId:'live_synthetic',slotId:state.slots[0].id,sendInvite:false}))
    assert.equal(state.operations.some(({query})=>query.startsWith('rpc/')),false)
    assert.equal(state.call.metadata.booking_pending,undefined)
  }
})

test('real tour scheduling commits capacity, visit, receipt and no-send jobs atomically', { timeout: 120000 }, async (t) => {
  let PGlite
  try { ({ PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite')) } catch { return t.skip('Set PGLITE_MODULE to a disposable local @electric-sql/pglite install.') }
  const db = new PGlite()
  try {
    await db.exec(read('tests/postgres/elena-inbound-tour-booking.fixture.sql'))
    await db.exec(functionSql('supabase/migrations/20261109211054_luxor_workflow_normalize_sms_recipients.sql', 'luxor_workflow_normalize_phone'))
    await db.exec(functionSql('supabase/migrations/20260831194443_resend_tour_reschedule_and_team_invite_delivery.sql', 'luxor_save_calendar_revision'))
    await db.exec(functionSql('supabase/migrations/20260831194443_resend_tour_reschedule_and_team_invite_delivery.sql', 'luxor_save_tour_schedule'))
    await db.exec(functionSql('supabase/migrations/20261106181628_tour_capacity_two.sql', 'luxor_save_tour_visit_schedule'))
    await db.exec(read(migration))
    await db.exec(read(migration))
    await db.query('insert into luxor_phone_numbers values ($1,true)', ['+19563652037'])
    const query = async (sql, args = []) => (await db.query(sql, args)).rows
    async function fixture(options = {}) {
      const inquiryId = randomUUID(), nonce = randomUUID(), contactNonce = randomUUID(), slotId = options.slotId || randomUUID()
      const callSid = 'CA' + randomUUID().replaceAll('-', ''), sessionId = 'live_' + randomUUID()
      await db.query('insert into luxor_inquiries(id,full_name,email,phone) values($1,$2,$3,$4)', [inquiryId,'Synthetic Caller','caller@example.invalid','+12105550111'])
      const [inquiry] = await query('select updated_at from luxor_inquiries where id=$1', [inquiryId])
      if (!options.slotId) await db.query("insert into luxor_tour_slots(id,slot_date,start_time,end_time,status,capacity,booked_count,title) values($1,current_date+5,'16:00','16:30','available',2,0,'Private venue tour') on conflict(slot_date,start_time) do update set id=excluded.id", [slotId])
      const [slot] = await query("select slot_date::text,start_time::text from luxor_tour_slots where id=$1", [slotId])
      const capture = { confirmed:true,matching_review_needed:false,nonce:contactNonce,inquiry_id:inquiryId,full_name:'Synthetic Caller',phone:'+12105550111',email:'caller@example.invalid' }
      const pending = { nonce,slot_id:slotId,slot_date:slot.slot_date,slot_time:slot.start_time,expires_at:new Date(Date.now()+180000).toISOString(),inquiry_id:inquiryId,inquiry_updated_at:inquiry.updated_at.toISOString(),contact_nonce:contactNonce,request_id:randomUUID(),visit_id:randomUUID(),response_token:'a'.repeat(43),venue_location:'Synthetic Luxor location',send_invite:options.sendInvite === true }
      const metadata = { scope:'elena_live_inbound',ingress_mode:'programmable_sip',openai_session_id:sessionId,accepted:true,sip_answered:true,rehearsal_only:false,inbound_capture:capture,booking_pending:pending }
      await db.query("insert into luxor_calls(twilio_call_sid,direction,to_number,status,inquiry_id,metadata) values($1,'inbound','+19563652037','in-progress',$2,$3)", [callSid,inquiryId,metadata])
      return { inquiryId,nonce,slotId,callSid,sessionId,metadata }
    }
    const confirm = async (f) => (await query('select luxor_confirm_elena_inbound_tour($1,$2,$3) as result', [f.callSid,f.sessionId,f.nonce]))[0].result
    const first = await fixture()
    // A call may have prepared its readback on the previous deployment, which
    // did not include the invitation choice. It must remain a no-send booking.
    await db.query("update luxor_calls set metadata=jsonb_set(metadata,'{booking_pending}',(metadata->'booking_pending')-'send_invite') where twilio_call_sid=$1",[first.callSid])
    const saved = await confirm(first)
    assert.equal(saved.booked,true)
    assert.equal(saved.replayed,false)
    assert.equal(saved.invitation_queued,false)
    assert.equal((await query('select booked_count from luxor_tour_slots where id=$1',[first.slotId]))[0].booked_count,1)
    assert.equal((await query('select count(*)::int as n from luxor_tour_visits'))[0].n,1)
    assert.equal((await query("select count(*)::int as n from luxor_email_jobs where status='queued'"))[0].n,0)
    assert.equal((await query("select count(*)::int as n from luxor_email_jobs where status='cancelled' and metadata->>'elena_voice_no_send'='true'"))[0].n,3)
    assert.equal((await query('select status from luxor_inquiries where id=$1',[first.inquiryId]))[0].status,'tour_confirmed')
    assert.equal((await confirm(first)).replayed,true)
    assert((await Promise.all([confirm(first),confirm(first)])).every((result) => result.replayed === true))
    assert.equal((await query('select booked_count from luxor_tour_slots where id=$1',[first.slotId]))[0].booked_count,1)
    const second = await fixture({slotId:first.slotId,sendInvite:true})
    const sent = await confirm(second)
    assert.equal(sent.invitation_queued,true)
    assert.equal((await query("select count(*)::int as n from luxor_email_jobs where inquiry_id=$1 and status='queued' and job_type='calendar_invitation' and recipient_email='caller@example.invalid'",[second.inquiryId]))[0].n,1)
    assert.equal((await query("select count(*)::int as n from luxor_email_jobs where inquiry_id=$1 and status='queued' and job_type<>'calendar_invitation'",[second.inquiryId]))[0].n,0)
    const full = await fixture({slotId:first.slotId})
    await assert.rejects(confirm(full),/no longer available/)
    assert.equal((await query('select booked_count from luxor_tour_slots where id=$1',[first.slotId]))[0].booked_count,2)
    assert.equal((await query('select count(*)::int as n from luxor_tour_visits'))[0].n,2)
    const expired = await fixture({slotId:first.slotId})
    await db.query("update luxor_calls set metadata=jsonb_set(metadata,'{booking_pending,expires_at}',to_jsonb((now()-interval '1 minute')::text)) where twilio_call_sid=$1",[expired.callSid])
    await assert.rejects(confirm(expired),/readback first/)
    const wrongIdentity = await fixture({slotId:first.slotId})
    await db.query("update luxor_calls set metadata=jsonb_set(metadata,'{inbound_capture,email}','\"different@example.invalid\"') where twilio_call_sid=$1",[wrongIdentity.callSid])
    await assert.rejects(confirm(wrongIdentity),/identity or inquiry changed/)
    const priorTour = await fixture({slotId:first.slotId})
    await db.query("update luxor_inquiries set preferred_tour_date=current_date+4 where id=$1",[priorTour.inquiryId])
    await assert.rejects(confirm(priorTour),/Existing tour history/)
    const rollbackSlot = randomUUID()
    await db.query("insert into luxor_tour_slots(id,slot_date,start_time,end_time,status,capacity,booked_count,title) values($1,current_date+6,'16:00','16:30','available',2,0,'Private venue tour')",[rollbackSlot])
    const rollback = await fixture({slotId:rollbackSlot})
    const beforeRollback = (await query('select (select count(*)::int from luxor_calendar_events) as events,(select count(*)::int from luxor_email_jobs) as jobs,(select count(*)::int from luxor_tour_visits) as visits'))[0]
    await db.exec("create function block_test_note() returns trigger language plpgsql as $$ begin raise exception 'synthetic late failure'; end $$; create trigger block_test_note before insert on luxor_notes for each row execute function block_test_note();")
    await assert.rejects(confirm(rollback),/synthetic late failure/)
    await db.exec('drop trigger block_test_note on luxor_notes; drop function block_test_note();')
    assert.equal((await query('select booked_count from luxor_tour_slots where id=$1',[rollbackSlot]))[0].booked_count,0)
    assert.deepEqual((await query('select (select count(*)::int from luxor_calendar_events) as events,(select count(*)::int from luxor_email_jobs) as jobs,(select count(*)::int from luxor_tour_visits) as visits'))[0],beforeRollback)
    assert.equal((await confirm(rollback)).booked,true)
    const tooSoon = await fixture({slotId:first.slotId})
    await db.query("update luxor_tour_slots set status='available',booked_count=0,slot_date=current_date where id=$1",[first.slotId])
    await assert.rejects(confirm(tooSoon),/no longer available/)
    const wrongSession = await fixture({slotId:first.slotId})
    await assert.rejects(confirm({...wrongSession,sessionId:'live_forged'}),/not authorized/)
    const rehearsal = await fixture({slotId:first.slotId})
    await db.query("update luxor_calls set metadata=jsonb_set(metadata,'{rehearsal_only}','true') where twilio_call_sid=$1",[rehearsal.callSid])
    await assert.rejects(confirm(rehearsal),/not authorized/)
    const grants = (await query("select has_function_privilege('anon','public.luxor_confirm_elena_inbound_tour(text,text,uuid)','execute') as anon,has_function_privilege('authenticated','public.luxor_confirm_elena_inbound_tour(text,text,uuid)','execute') as authenticated,has_function_privilege('service_role','public.luxor_confirm_elena_inbound_tour(text,text,uuid)','execute') as service"))[0]
    assert.deepEqual(grants,{anon:false,authenticated:false,service:true})
  } finally { await db.close() }
})
