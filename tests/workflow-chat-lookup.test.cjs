'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/luxorWorkflowChatLookup.ts')
const loaded = new Module(file, module)
loaded.filename = file
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file)
const { matchWorkflowForChat } = loaded.exports
const custom = [{ id: 'one', name: 'Wedding follow-up', status: 'active' }, { id: 'two', name: 'Wedding follow-up', status: 'draft' }, { id: 'three', name: 'Tour nurture', status: 'active' }]

test('finds the brochure automation and custom workflows by name', () => {
  assert.equal(matchWorkflowForChat('brochure', custom)[0].id, 'brochure_lead')
  assert.equal(matchWorkflowForChat('tour nurture', custom)[0].id, 'three')
})
test('does not silently choose between duplicate or partial matches', () => {
  assert.deepEqual(matchWorkflowForChat('wedding follow-up', custom).map((item) => item.id), ['one', 'two'])
  assert.equal(matchWorkflowForChat('follow-up', custom).length, 3)
  assert.deepEqual(matchWorkflowForChat('', custom), [])
})
test('finds system message workflows and keeps ambiguous names distinct', () => {
  const system = [{ id:'system-tour-texts', name:'Tour confirmation and reminder texts' }, { id:'system-tour-emails', name:'Tour confirmation and reminder emails' }]
  assert.deepEqual(matchWorkflowForChat('tour confirmation',custom,system).map(item=>item.id),['system-tour-texts','system-tour-emails'])
  assert.equal(matchWorkflowForChat('Tour confirmation and reminder texts',custom,system)[0].kind,'system')
})
test('chat requires both lead and marketing permissions and uses scoped progress endpoints', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/app/api/portal/elena-chat/route.ts'), 'utf8')
  assert.match(source, /read_workflow_progress: \['marketing', 'leads'\]/)
  assert.match(source, /\/api\/marketing\/automation-contacts\?id=brochure_lead/)
  assert.match(source, /\/api\/marketing\/system-messages\/contacts\?workflow=/)
  assert.match(source, /systemWorkflowChannelPermission\(id\)/)
  assert.match(source, /workflowProgressForChat\(match\.kind/)
  assert.match(source, /\/contacts\?page=\$\{page\}/)
  assert.match(source, /requestTools\.some\(\(tool\) => tool\.function\.name === toolCall\.function\?\.name\)/)
})
