'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/luxorWorkflowReadiness.ts'), mod = new Module(file, module)
mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
const actual = mod.require.bind(mod)
mod.require = (name) => name === './luxorCustomWorkflowDefinition' ? { CUSTOM_WORKFLOW_RUNTIME_TRIGGERS: ['manual', 'contact_form_inquiry_created'], CUSTOM_WORKFLOW_TRIGGER_LABELS: { tour_scheduled: { label: 'Tour scheduled' } } } : actual(name)
mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
test('unsupported automatic triggers receive a clear, non-truncated runtime warning', () => {
  const text = mod.exports.workflowArchitectExplanation('tour_scheduled', 'x'.repeat(5000))
  assert.match(text, /Tour scheduled is not connected to automatic enrollment yet/); assert.match(text, /cannot be activated/); assert.ok(text.length < 1000)
})
test('connected triggers retain the model explanation and a safe fallback', () => {
  assert.equal(mod.exports.workflowArchitectExplanation('manual', 'Draft to review.'), 'Draft to review.')
  assert.equal(mod.exports.workflowArchitectExplanation('contact_form_inquiry_created', null), 'Review this inactive draft before saving.')
})
test('tour readiness follows the verified environment capability', () => {
  assert.equal(mod.exports.workflowArchitectExplanation('tour_attended', 'Review the draft.', ['tour_attended']), 'Review the draft.')
  assert.match(mod.exports.workflowArchitectExplanation('tour_attended', 'Review the draft.', ['manual']), /not connected/)
})
