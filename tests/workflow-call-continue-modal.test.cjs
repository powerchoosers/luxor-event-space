/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root=path.resolve(__dirname,'..')
async function run(mode, outcome='no_answer') {
  let closed=false, fallback=0, calls=[], notices=[], hook=0
  const oldFetch=global.fetch, oldCrypto=global.crypto, oldFlag=process.env.NEXT_PUBLIC_LUXOR_ATOMIC_CALL_CONTINUE_ENABLED
  process.env.NEXT_PUBLIC_LUXOR_ATOMIC_CALL_CONTINUE_ENABLED='true'
  global.crypto={randomUUID:()=> '11111111-1111-4111-8111-111111111111'}
  global.fetch=async (url,opts)=>{
    calls.push({url,body:JSON.parse(opts.body)})
    if(mode==='network') throw new Error('Connection lost after possible commit')
    if(mode==='error') return Response.json({error:'unconfirmed'},{status:503})
    if(mode==='malformed') return Response.json({status:'completed',workflowKind:'custom',taskId:'wrong',noteId:'note'})
    return Response.json({status:'completed',workflowKind:'custom',taskId:'task',noteId:'note'})
  }
  const values=[outcome,'Called','none','','10:00','phone',false,false]
  const node=(type,props)=>({type,props:props||{}})
  const stubs={
    react:{useState:init=>[hook<values.length?values[hook++]:init,()=>{}],useRef:init=>({current:init}),useEffect:()=>{}},
    'react/jsx-runtime':{jsx:node,jsxs:node,Fragment:'fragment'},
    '@/lib/icons/phosphor-compat':{CalendarClock:'icon',Check:'icon',Phone:'icon'},
    '@/components/portal/PortalUI':{PortalButton:'button',PortalDatePicker:'date',PortalModal:'modal',PortalSelect:'select'},
    '@/lib/luxorPhoneClient':{formatPhoneDisplay:v=>v}, '@/lib/luxorVoiceClient':{startLuxorBrowserCall:()=>{}},
    '@/components/portal/ToastProvider':{useToast:()=>({notify:n=>notices.push(n)})},
    '@/components/portal/WorkflowBadge':{WorkflowBadge:'badge'},
    '@/lib/luxorNextFollowUpDisplay':{selectNextFollowUpDisplay:()=>({summary:null,notice:null})},
    '@/lib/luxorCallStopIntent':{recordCallWithoutWorkflowAdvance:async()=>{fallback++;throw new Error('unexpected fallback')}},
    '@/lib/luxorCallResolutionClient':{},
    '@/lib/luxorFollowUpHelpers':{luxorToday:()=>'',luxorDate:()=>'',luxorTimeInput:()=>'',localLuxorIso:()=>'',manualFollowUpDescription:()=>''},
  }
  const file=path.join(root,'src/components/portal/LogCallOutcomeModal.tsx')
  const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  const mod=new Module(path.join(root,'modal-atomic.synthetic.cjs'),module)
  mod.filename=path.join(root,'modal-atomic.synthetic.cjs')
  const original=Module._load
  Module._load=function(name,parent,main){return Object.hasOwn(stubs,name)?stubs[name]:original.call(this,name,parent,main)}
  try{mod._compile(compiled,mod.filename)}finally{Module._load=original}
  const tree=mod.exports.LogCallOutcomeModal({isOpen:true,lead:{id:'lead'},task:{id:'task'},onClose:()=>{closed=true}})
  function find(el){if(!el||typeof el!=='object')return null;if(el.type==='form')return el;for(const x of [el.props?.children].flat(Infinity)){const f=find(x);if(f)return f}return null}
  try { await find(tree).props.onSubmit({preventDefault(){}}) }
  finally {
    global.fetch=oldFetch;global.crypto=oldCrypto
    if(oldFlag===undefined)delete process.env.NEXT_PUBLIC_LUXOR_ATOMIC_CALL_CONTINUE_ENABLED
    else process.env.NEXT_PUBLIC_LUXOR_ATOMIC_CALL_CONTINUE_ENABLED=oldFlag
  }
  return {closed,fallback,calls,notices}
}

test('all supported outcomes use atomic owner-aware request',async()=>{for(const outcome of ['no_answer','voicemail_left','interested']){const r=await run('success',outcome);assert.equal(r.closed,true);assert.equal(r.fallback,0);assert.deepEqual(r.calls.map(c=>c.url),['/api/workflow-call-continue']);assert.equal(r.calls[0].body.label,outcome);assert.equal(r.notices[0].variant,'success')}})
test('uncertain results cause no fallback or false success',async()=>{for(const mode of ['network','error','malformed']){const r=await run(mode,'interested');assert.equal(r.closed,false);assert.equal(r.fallback,0);assert.deepEqual(r.calls.map(c=>c.url),['/api/workflow-call-continue']);assert.equal(r.notices[0].variant,'error')}})
