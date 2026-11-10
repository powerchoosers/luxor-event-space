'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/luxorWorkflowChatProgress.ts'), mod = new Module(file, module)
mod.filename=file
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const { workflowProgressForChat } = mod.exports
test('system history keeps job status separate from provider delivery and preserves zero counts', () => {
  const result=workflowProgressForChat('system',{counts:{queued:1,sent:0},pageSize:25,contacts:[{name:'Sample',status:'queued',stepName:'Inquiry confirmation',scheduled_for:'2026-11-10T12:00:00Z',deliveryStatus:null,privateField:'not exposed'}]})
  assert.deepEqual(result.counts,{queued:1,sent:0})
  assert.deepEqual(result.contacts,[{name:'Sample',status:'queued',deliveryStatus:null,message:'Inquiry confirmation',scheduledFor:'2026-11-10T12:00:00Z',sentAt:undefined}])
  assert.match(result.note,/not enrollments or unique contacts/); assert.match(result.note,/not confirmed delivery/)
})
test('direct phone attempts and custom enrollment stages retain their distinct meanings', () => {
  const direct=workflowProgressForChat('system',{counts:{sent:1},pageSize:25,direct:true,contacts:[{name:'Sample',status:'sent',deliveryStatus:'delivered',stepName:'Missed-call reply'}]})
  assert.equal(direct.contacts[0].deliveryStatus,'delivered'); assert.match(direct.note,/direct message attempts/)
  const custom=workflowProgressForChat('custom',{counts:{active:1},pageSize:25,contacts:[{name:'Sample',status:'active',stepName:'Wait two days',next_run_at:'2026-11-10'}]})
  assert.equal(custom.contacts[0].currentStep,'Wait two days'); assert.match(custom.note,/version each enrollment entered/)
})
