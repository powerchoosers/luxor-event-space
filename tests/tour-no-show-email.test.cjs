'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/luxorEmailJobsServer.ts'), mod = new Module(file, module)
mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
const actual = mod.require.bind(mod)
const copyFile = path.resolve(__dirname, '../src/lib/luxorTourNoShowEmailCopy.ts'), copyModule = new Module(copyFile, module)
copyModule.filename = copyFile; copyModule.paths = Module._nodeModulePaths(path.dirname(copyFile))
copyModule._compile(ts.transpileModule(fs.readFileSync(copyFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, copyFile)
mod.require = (name) => name === './luxorTourNoShowEmailCopy' ? copyModule.exports : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file)
test('a no-show email gives the client a usable next step without changing the recorded outcome', () => {
  const result = mod.exports.buildTourEmail('tour_no_show_reschedule', { full_name: 'Sample Guest', event_type: 'Wedding', guest_count: 100 }, 'synthetic')
  assert.match(result.body, /reply to this email/i)
  assert.doesNotMatch(result.body, /tour-response/)
  assert.match(result.body, /Wedding for 100 guests/)
})
test('the confirmation still retains its existing response links', () => {
  const result = mod.exports.buildTourEmail('tour_confirmation', { full_name: 'Sample Guest' }, 'synthetic')
  assert.match(result.body, /tour-response\/synthetic\?action=confirm/)
  assert.match(result.body, /tour-response\/synthetic\?action=reschedule/)
})
test('custom no-show wording substitutes supported fields and retains the reply action', () => {
  const custom = { subject: 'Following up with {{first_name}}', greeting: 'Hi {{full_name}},', body: 'We can revisit your {{event_details}} plans.' }
  const result = mod.exports.buildTourEmail('tour_no_show_reschedule', { full_name: 'Sample Guest', event_type: 'Wedding', guest_count: 100 }, 'synthetic', custom)
  assert.equal(result.subject, 'Following up with Sample'); assert.match(result.body, /revisit your Wedding for 100 guests/); assert.match(result.body, /reply to this email/i)
  assert.throws(() => copyModule.exports.validateTourNoShowEmailCopy({ ...custom, subject: '{{unapproved}}' }), /listed email variables/)
})
