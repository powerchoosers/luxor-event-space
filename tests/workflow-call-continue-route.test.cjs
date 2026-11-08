/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
let verified,session,authorized,calls,result,fail;
const source=fs.readFileSync(path.join(root,'src/app/api/workflow-call-continue/route.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m=new Module(path.join(root,'synthetic-continue.cjs'),module);m.filename=path.join(root,'synthetic-continue.cjs');m.paths=module.paths;
const stubs={'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},'@/lib/luxorPortalAuth':{getVerifiedLuxorPortalSession:async()=>verified,getLuxorPortalSession:async()=>session,isAuthorizedLuxorPortalEmail:()=>authorized},'@/lib/supabaseRestServer':{supabaseRestStrict:async(q,i)=>{calls.push({q,body:JSON.parse(i.body)});if(fail)throw Error('timeout');return result}}};
const old=Module._load;Module._load=function(r,p,i){return Object.hasOwn(stubs,r)?stubs[r]:old.call(this,r,p,i)};try{m._compile(js,m.filename)}finally{Module._load=old}
const route=m.exports;
const valid={requestId:ids[0],inquiryId:ids[1],taskId:ids[2],outcome:'reached',label:'interested',note:'synthetic'};
function reset(){verified=session={email:'staff@example.invalid'};authorized=true;calls=[];fail=false;result={status:'completed',taskId:ids[2],noteId:ids[3],enrollmentId:ids[1],workflowKind:'custom'};delete process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED;delete process.env.LUXOR_ATOMIC_CALL_CONTINUE_ENABLED}
function enabled(){process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED='true';process.env.LUXOR_ATOMIC_CALL_CONTINUE_ENABLED='true'}
function req(body=valid,origin='https://example.invalid'){return {nextUrl:new URL('https://example.invalid'),headers:new Headers({origin,'content-type':'application/json'}),json:async()=>body}}
test('disabled unless both gates are enabled',async()=>{reset();assert.equal((await route.POST(req())).status,409);enabled();assert.equal((await route.POST(req())).status,200);assert.equal(calls.length,1)})
test('authorization and origin fail closed',async()=>{reset();enabled();verified=null;assert.equal((await route.POST(req())).status,401);verified=session;authorized=false;assert.equal((await route.POST(req())).status,401);authorized=true;assert.equal((await route.POST(req(valid,'https://other.invalid'))).status,403);assert.equal(calls.length,0)})
test('mismatched label or invalid payload cannot reach RPC',async()=>{reset();enabled();for(const b of [{...valid,label:'no_answer'},{...valid,requestId:'bad'},{...valid,note:'x'.repeat(501)}])assert.equal((await route.POST(req(b))).status,400);assert.equal(calls.length,0)})
test('requires verified actor and validates owner result',async()=>{reset();enabled();assert.equal((await route.POST(req())).status,200);assert.equal(calls[0].body.p_actor,'staff@example.invalid');for(const v of [null,{...result,workflowKind:'other'},{...result,taskId:ids[1]}]){result=v;assert.equal((await route.POST(req())).status,503)}})
test('uncertain RPC never claims completion',async()=>{reset();enabled();fail=true;const r=await route.POST(req());assert.equal(r.status,503);assert.equal((await r.json()).code,'outcome_unconfirmed')})
