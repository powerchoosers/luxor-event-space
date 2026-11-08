/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const Module=require('node:module')
const ts=require('typescript')
const root=path.resolve(__dirname,'..')

function loadTs(file,stubs={}) {
  const filename=path.join(root,file)
  const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true})
  assert.deepEqual((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[])
  const mod=new Module(filename+'.synthetic.cjs',module);mod.filename=filename+'.synthetic.cjs';mod.paths=module.paths
  const original=Module._load
  Module._load=function(request,parent,isMain){return Object.hasOwn(stubs,request)?stubs[request]:original.call(this,request,parent,isMain)}
  try{mod._compile(compiled.outputText,mod.filename)}finally{Module._load=original}
  return mod.exports
}
const {recordCallWithoutWorkflowAdvance}=loadTs('src/lib/luxorCallStopIntent.ts')
for (const scenario of [
  {name:'reached custom call',outcome:'interested',next:'none',date:'',message:/did not record a workflow response/i,note:/recording it against the correct workflow/i},
  {name:'dated manual follow-up',outcome:'no_answer',next:'later',date:'2026-12-01',message:/did not schedule the requested follow-up/i,note:/manual follow-up was requested.*Call/i},
  {name:'reached and dated follow-up',outcome:'wants_tour',next:'later',date:'2026-12-01',message:/did not schedule the requested follow-up/i,note:/manual follow-up was requested/i},
  {name:'unconfirmed note',outcome:'interested',next:'none',date:'',failNote:true,message:/call note could not be confirmed/i,note:/correct workflow/i},
  {name:'no task reached',outcome:'interested',next:'none',date:'',noTask:true,message:/did not record a workflow response/i,note:/correct workflow/i},
  {name:'no task dated follow-up',outcome:'no_answer',next:'later',date:'2026-12-01',noTask:true,message:/did not schedule the requested follow-up/i,note:/manual follow-up was requested/i},
  {name:'adopted dated follow-up',outcome:'no_answer',next:'later',date:'2026-12-01',adopted:true,message:/did not schedule the requested follow-up/i,note:/manual follow-up was requested/i},
]) test(`${scenario.name} saves note but does not complete or advance`,async()=>{
  const requests=[],notices=[];let closed=false,idx=0
  const originalFetch=global.fetch
  global.fetch=async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});if(url==='/api/notes'){if(scenario.failNote)throw Error('Network outcome unknown');return Response.json({id:'synthetic-note'},{status:201})}throw Error('Unexpected task, response or provider operation')}
  const values=[scenario.outcome,'Synthetic call note',scenario.next,scenario.date,'10:00','phone',false,false]
  const node=(type,props)=>({type,props:props||{}})
  const stubs={
    react:{useState:init=>{const i=idx++;if(i>=values.length)values[i]=init;return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value}]},useRef:init=>({current:init}),useEffect:()=>{}},
    'react/jsx-runtime':{jsx:node,jsxs:node,Fragment:'fragment'},
    '@/lib/icons/phosphor-compat':{CalendarClock:'calendar-icon',Check:'check-icon',Phone:'phone-icon'},
    '@/components/portal/PortalUI':{PortalButton:'portal-button',PortalDatePicker:'date-picker',PortalModal:'portal-modal',PortalSelect:'portal-select'},
    '@/lib/luxorPhoneClient':{formatPhoneDisplay:value=>value},'@/lib/luxorVoiceClient':{startLuxorBrowserCall:()=>{}},
    '@/components/portal/ToastProvider':{useToast:()=>({notify:notice=>notices.push(notice)})},
    '@/components/portal/WorkflowBadge':{WorkflowBadge:'workflow-badge'},
    '@/lib/luxorNextFollowUpDisplay':{selectNextFollowUpDisplay:()=>({summary:null,notice:null})},
    '@/lib/luxorCallStopIntent':{recordCallWithoutWorkflowAdvance},
    '@/lib/luxorFollowUpHelpers':{luxorToday:()=> '2026-11-08',luxorDate:()=> 'December 1, 2026',luxorTimeInput:()=> '10:00',localLuxorIso:()=> '2026-12-01T16:00:00.000Z',manualFollowUpDescription:()=>''},
  }
  const modal=loadTs('src/components/portal/LogCallOutcomeModal.tsx',stubs)
  const props={isOpen:true,lead:{id:'synthetic-lead',full_name:'Synthetic'},task:scenario.noTask?undefined:{id:'custom-task',workflow_type:'custom',...(scenario.adopted?{adoption_designation:'current'}:{})},onClose:()=>{closed=true}}
  const tree=modal.LogCallOutcomeModal(props)
  function find(element){if(!element||typeof element!=='object')return null;if(element.type==='form')return element;for(const c of [element.props?.children].flat(Infinity)){const result=find(c);if(result)return result}return null}
  try{
    await find(tree).props.onSubmit({preventDefault(){}})
    assert.deepEqual(requests.map(x=>x.url),['/api/notes'])
    assert.match(requests[0].body.content,/Synthetic call note/)
    assert.match(requests[0].body.content,scenario.note)
    assert.equal(closed,false)
    assert.equal(notices.length,1);assert.equal(notices[0].variant,'error')
    assert.match(notices[0].description,scenario.message)
    assert.match(notices[0].description,scenario.noTask?/no task was completed/i:/task (remains|open|left|was)/i)
    if(scenario.outcome!=='no_answer'&&!scenario.failNote)assert.match(notices[0].description,/did not record a workflow response/i)
    if(scenario.failNote){
      idx=0
      await find(modal.LogCallOutcomeModal(props)).props.onSubmit({preventDefault(){}})
      assert.equal(requests.length,1,'unconfirmed note cannot be duplicated by another submit')
    }
  }finally{global.fetch=originalFetch}
})

for (const scenario of [
  {name:'reached',outcome:'interested',response:'success'},
  {name:'no answer',outcome:'no_answer',response:'success'},
  {name:'voicemail',outcome:'voicemail_left',response:'success'},
  {name:'held next action',outcome:'interested',response:'held'},
  {name:'invalid armed date',outcome:'interested',response:'bad_date'},
  {name:'unknown commit',outcome:'interested',response:'network'},
  {name:'missing atomic marker',outcome:'interested',response:'missing_marker'},
  {name:'unverified task hint',outcome:'interested',response:'conflict'},
]) test(`adopted ${scenario.name} never duplicates response or note`,async()=>{
  const requests=[],notices=[];let closed=false,idx=0
  const originalFetch=global.fetch
  global.fetch=async(url,init)=>{
    const body=JSON.parse(init.body);requests.push({url,body})
    if(url!=='/api/tasks')throw Error('Unexpected duplicate response, note or provider call')
    if(scenario.response==='network')throw Error('Unknown commit')
    if(scenario.response==='conflict')return Response.json({error:'owner not verified'},{status:409})
    return Response.json({id:'synthetic-task',status:'completed',...(['success','held','bad_date'].includes(scenario.response)?{
      workflow_outcome_recorded:true,
      workflow_activation:scenario.response==='success'?{status:'armed',effectiveDueAt:'2026-12-01T16:00:00.000Z'}
        : scenario.response==='bad_date'?{status:'armed',effectiveDueAt:'bad'}:{status:'requires_review'},
    }:{})})
  }
  const values=[scenario.outcome,'Synthetic call note','none','','10:00','phone',false,false]
  const node=(type,props)=>({type,props:props||{}})
  const stubs={
    react:{useState:init=>{const i=idx++;if(i>=values.length)values[i]=init;return [values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value}]},useRef:init=>({current:init}),useEffect:()=>{}},
    'react/jsx-runtime':{jsx:node,jsxs:node,Fragment:'fragment'},
    '@/lib/icons/phosphor-compat':{CalendarClock:'calendar-icon',Check:'check-icon',Phone:'phone-icon'},
    '@/components/portal/PortalUI':{PortalButton:'portal-button',PortalDatePicker:'date-picker',PortalModal:'portal-modal',PortalSelect:'portal-select'},
    '@/lib/luxorPhoneClient':{formatPhoneDisplay:value=>value},'@/lib/luxorVoiceClient':{startLuxorBrowserCall:()=>{}},
    '@/components/portal/ToastProvider':{useToast:()=>({notify:notice=>notices.push(notice)})},
    '@/components/portal/WorkflowBadge':{WorkflowBadge:'workflow-badge'},
    '@/lib/luxorNextFollowUpDisplay':{selectNextFollowUpDisplay:()=>({summary:null,notice:null})},
    '@/lib/luxorCallStopIntent':{recordCallWithoutWorkflowAdvance},
    '@/lib/luxorFollowUpHelpers':{luxorToday:()=> '2026-11-08',luxorDate:()=> 'December 1, 2026',luxorTimeInput:()=> '10:00',localLuxorIso:()=> '2026-12-01T16:00:00.000Z',manualFollowUpDescription:()=>''},
  }
  const modal=loadTs('src/components/portal/LogCallOutcomeModal.tsx',stubs)
  const props={isOpen:true,lead:{id:'synthetic-lead',full_name:'Synthetic'},task:{id:'synthetic-task',adoption_designation:'current'},onClose:()=>{closed=true}}
  function find(element){if(!element||typeof element!=='object')return null;if(element.type==='form')return element;for(const c of [element.props?.children].flat(Infinity)){const result=find(c);if(result)return result}return null}
  try{
    await find(modal.LogCallOutcomeModal(props)).props.onSubmit({preventDefault(){}})
    assert.deepEqual(requests.map(x=>x.url),['/api/tasks'])
    assert.equal(requests[0].body.atomicAdoptedOnly,true)
    assert.equal(requests[0].body.nextStep,'none')
    assert.equal(requests[0].body.callLabel,scenario.outcome)
    assert.equal(requests[0].body.callNote,'Synthetic call note')
    assert.equal(Object.hasOwn(requests[0].body,'completed_at'),false)
    assert.equal(closed,['success','held','bad_date'].includes(scenario.response))
    assert.equal(notices[0].variant,scenario.response==='success'?'success':'error')
    if(['held','bad_date'].includes(scenario.response))assert.match(notices[0].description,/follow-up scheduling could not be confirmed/i)
    if(!['success','held','bad_date'].includes(scenario.response)){
      assert.match(notices[0].description,/could not be confirmed/i)
      idx=0
      await find(modal.LogCallOutcomeModal(props)).props.onSubmit({preventDefault(){}})
      assert.equal(requests.length,1,'uncertain result cannot be resubmitted in the same modal')
    }
  }finally{global.fetch=originalFetch}
})
