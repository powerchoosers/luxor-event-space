/* eslint @typescript-eslint/no-require-imports: off */
/* Disposable localhost fixture only. Run after baseline + candidate + assertions. */
const {spawn,execFileSync}=require('node:child_process'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const exe='C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const args=['-X','-h','127.0.0.1','-p','55439','-U','postgres','-d',process.env.CALL_RESOLUTION_TEST_DB||'call_resolution_fixture_v3','-v','ON_ERROR_STOP=1','-At'];
function sql(q){return execFileSync(exe,[...args,'-c',q],{encoding:'utf8',timeout:15000}).trim()}
function session(q){const p=spawn(exe,args,{stdio:['pipe','pipe','pipe']});let out='',err='';const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',c=>c===0?resolve(out):reject(Error(err)))});const ready=new Promise((resolve,reject)=>{p.stdout.on('data',b=>{out+=b;if(out.includes('LOCK_READY'))resolve()});p.stderr.on('data',b=>err+=b);p.on('exit',c=>{if(!out.includes('LOCK_READY'))reject(Error(err||`exit ${c}`))})});p.stdin.end(q);return {ready,done}}
function resolve(lid){return `select public.luxor_resolve_call_outcome('${randomUUID()}','${lid}',null,'interested','stop','race',null,null,null,'tester@example.invalid');`}
function seed(){const lid=randomUUID();sql(`insert into public.luxor_inquiries(id,flow,email,marketing_opt_in) values('${lid}','contact_form','race@example.invalid',true);`);return lid}
(async()=>{
 const wid=sql("select id from public.luxor_custom_workflows where trigger_type='manual' and status='active' limit 1");assert.match(wid,/^[a-f0-9-]{36}$/);
 let lid=seed();let holder=session(`begin; ${resolve(lid)} select 'LOCK_READY'; select pg_sleep(2); commit;`);await holder.ready;
 assert.throws(()=>sql(`select * from public.luxor_custom_workflow_manual_enroll('${wid}',array['${lid}'::uuid],'tester@example.invalid')`),/stopped|replaced|restart/i);await holder.done;
 assert.equal(sql(`select count(*) from public.luxor_custom_workflow_enrollments where inquiry_id='${lid}'`),'0');
 console.log('PASS resolver-first race: real manual-enrollment producer waits then rejects committed stop fence');
 lid=seed();holder=session(`begin; select * from public.luxor_custom_workflow_manual_enroll('${wid}',array['${lid}'::uuid],'tester@example.invalid'); select 'LOCK_READY'; select pg_sleep(2); commit;`);await holder.ready;
 assert.throws(()=>sql(resolve(lid)),/busy|40001|retry/i);await holder.done;assert.equal(sql(`select count(*) from public.luxor_notes where inquiry_id='${lid}'`),'0');
 sql(resolve(lid));assert.equal(sql(`select status from public.luxor_custom_workflow_enrollments where inquiry_id='${lid}'`),'stopped');
 console.log('PASS producer-first race rejects resolver atomically; retry stops committed enrollment');
 lid=seed();sql(resolve(lid));assert.throws(()=>sql(`select * from public.luxor_custom_workflow_manual_enroll('${wid}',array['${lid}'::uuid],'tester@example.invalid')`),/stopped|replaced|restart/i);
 assert.equal(sql(`select count(*) from public.luxor_custom_workflow_enrollments where inquiry_id='${lid}'`),'0');console.log('PASS durable stop fence rejects real producer after commit');
})().catch(e=>{console.error(e);process.exitCode=1});
