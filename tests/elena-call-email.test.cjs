'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {randomUUID} = require('node:crypto')
const Module = require('node:module')
const ts = require('typescript')
const root=path.resolve(__dirname,'..')
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')

function service(stubs) {
  const filename=path.join(root,'src/lib/luxorElenaCallEmailServer.ts')
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText
  const loaded=new Module(filename,module); loaded.filename=filename; loaded.paths=Module._nodeModulePaths(path.dirname(filename))
  const original=loaded.require.bind(loaded)
  loaded.require=(name)=>Object.hasOwn(stubs,name)?stubs[name]:original(name)
  loaded._compile(code,filename)
  return loaded.exports
}

test('delivery requires the exact approved snapshot and preserves the queue idempotency key',async()=>{
  const id=randomUUID(),nonce=randomUUID(),sid='CA'+randomUUID().replaceAll('-',''),inquiry=randomUUID()
  const job={id,inquiry_id:inquiry,job_type:'elena_call_email',recipient_email:'caller@example.invalid',subject:'Venue details',body:'Thanks for asking <today>.',metadata:{elena_call_sid:sid,elena_email_nonce:nonce,caller_approved:true}}
  const row={inquiry_id:inquiry,metadata:{scope:'elena_live_inbound',email_receipts:{[nonce]:{job_id:id,recipient:job.recipient_email,subject:job.subject,body:job.body}}}}
  const sent=[]
  const api=service({'server-only':{},'./supabaseRestServer':{supabaseRestStrict:async()=>[row]},'./luxorResendMailServer':{sendLuxorResendEmail:async(input)=>sent.push(input)}})
  await api.deliverElenaCallEmail(job)
  assert.equal(sent.length,1)
  assert.equal(sent[0].idempotencyKey,`email-job/${id}`)
  assert.match(sent[0].content,/&lt;today&gt;/)
  await assert.rejects(api.deliverElenaCallEmail({...job,recipient_email:'other@example.invalid'}),/does not match/)
  assert.equal(sent.length,1)
})

test('email status distinguishes queued, provider accepted, delivered and bounced',async()=>{
  const id=randomUUID(),nonce=randomUUID(),sid='CA'+randomUUID().replaceAll('-',''),inquiry=randomUUID(),session='live_synthetic'
  const row={direction:'inbound',to_number:'+19563652037',status:'in-progress',inquiry_id:inquiry,metadata:{scope:'elena_live_inbound',ingress_mode:'programmable_sip',rehearsal_only:false,accepted:true,sip_answered:true,openai_session_id:session,email_receipts:{[nonce]:{job_id:id}}}}
  let status='queued',mail=''
  const api=service({'server-only':{},'./supabaseRestServer':{supabaseRestStrict:async(query)=>query.startsWith('luxor_calls?')?[row]:query.startsWith('luxor_email_jobs?')?[{status}]:mail?[{status:mail}]:[]},'./luxorResendMailServer':{}})
  const input={callSid:sid,sessionId:session,nonce}
  assert.equal((await api.getElenaCallEmailStatus(input)).status,'pending')
  status='sent'; assert.equal((await api.getElenaCallEmailStatus(input)).status,'accepted')
  mail='delivered'; assert.equal((await api.getElenaCallEmailStatus(input)).status,'delivered')
  mail='bounced'; assert.equal((await api.getElenaCallEmailStatus(input)).status,'failed')
  await assert.rejects(api.getElenaCallEmailStatus({...input,sessionId:'forged'}))
})

test('caller-confirmed email queues atomically, refuses forged or stale requests, and replays safely', {timeout:120000}, async(t)=>{
  let PGlite
  try { ({PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite')) } catch { return t.skip('Set PGLITE_MODULE to disposable local PGlite.') }
  const db=new PGlite()
  try {
    await db.exec(read('tests/postgres/elena-inbound-tour-booking.fixture.sql'))
    await db.exec("create function public.luxor_workflow_normalize_phone(text) returns text language sql immutable as $$ select case when length(regexp_replace($1,'[^0-9]','','g'))=10 then '+1'||regexp_replace($1,'[^0-9]','','g') when length(regexp_replace($1,'[^0-9]','','g'))=11 then '+'||regexp_replace($1,'[^0-9]','','g') else null end $$")
    await db.exec(read('supabase/migrations/20261111202727_elena_call_email.sql'))
    await db.query('insert into luxor_phone_numbers values($1,true)',['+19563652037'])
    const inquiry=randomUUID(),contactNonce=randomUUID(),nonce=randomUUID(),sid='CA'+randomUUID().replaceAll('-',''),session='live_synthetic'
    await db.query("insert into luxor_inquiries(id,full_name,email,phone) values($1,'Synthetic Caller','caller@example.invalid','2105550111')",[inquiry])
    const [lead]=(await db.query('select updated_at from luxor_inquiries where id=$1',[inquiry])).rows
    const pending={nonce,contact_nonce:contactNonce,recipient:'caller@example.invalid',subject:'Venue details',body:'Here are the venue details you requested.',inquiry_updated_at:lead.updated_at.toISOString(),expires_at:new Date(Date.now()+180000).toISOString()}
    const metadata={scope:'elena_live_inbound',ingress_mode:'programmable_sip',openai_session_id:session,accepted:true,sip_answered:true,rehearsal_only:false,inbound_capture:{confirmed:true,matching_review_needed:false,nonce:contactNonce,inquiry_id:inquiry,email:pending.recipient,full_name:'Synthetic Caller',phone:'+12105550111'},email_pending:pending}
    await db.query("insert into luxor_calls(twilio_call_sid,direction,to_number,status,inquiry_id,metadata) values($1,'inbound','+19563652037','in-progress',$2,$3)",[sid,inquiry,metadata])
    const q=async(sql,args=[]) => (await db.query(sql,args)).rows
    const run=async(s=session,n=nonce)=>(await q('select luxor_queue_elena_call_email($1,$2,$3) as result',[sid,s,n]))[0].result
    await assert.rejects(run('forged_session'),/not authorized/)
    await assert.rejects(run(session,randomUUID()),/readback/)
    await db.query("update luxor_inquiries set full_name='Different Person' where id=$1",[inquiry])
    await assert.rejects(run(),/recipient needs review/)
    await db.query("update luxor_inquiries set full_name='Synthetic Caller',phone='2105550199' where id=$1",[inquiry])
    await assert.rejects(run(),/recipient needs review/)
    await db.query("update luxor_inquiries set phone='2105550111' where id=$1",[inquiry])
    const result=await run()
    assert.equal(result.queued,true)
    assert.equal(result.duplicate,false)
    const again=await run()
    assert.equal(again.duplicate,true)
    assert.equal(again.job_id,result.job_id)
    const [job]=await q('select job_type,status,recipient_email,subject,body from luxor_email_jobs where id=$1',[result.job_id])
    assert.deepEqual(job,{job_type:'elena_call_email',status:'queued',recipient_email:pending.recipient,subject:pending.subject,body:pending.body})
    assert.equal((await q('select count(*)::int as n from luxor_email_jobs'))[0].n,1)
    const [row]=await q('select metadata from luxor_calls where twilio_call_sid=$1',[sid])
    assert.equal(row.metadata.email_receipts[nonce].job_id,result.job_id)
    assert.equal(row.metadata.email_receipts[nonce].body,pending.body)
    const next={...pending,nonce:randomUUID(),recipient:'other@example.invalid'}
    await db.query("update luxor_calls set metadata=jsonb_set(metadata,'{email_pending}',$1::jsonb) where twilio_call_sid=$2",[JSON.stringify(next),sid])
    await assert.rejects(run(session,next.nonce),/readback/)
    const grants=(await q("select has_function_privilege('anon','public.luxor_queue_elena_call_email(text,text,uuid)','execute') as anon,has_function_privilege('authenticated','public.luxor_queue_elena_call_email(text,text,uuid)','execute') as authenticated,has_function_privilege('service_role','public.luxor_queue_elena_call_email(text,text,uuid)','execute') as service"))[0]
    assert.deepEqual(grants,{anon:false,authenticated:false,service:true})
  } finally { await db.close() }
})
