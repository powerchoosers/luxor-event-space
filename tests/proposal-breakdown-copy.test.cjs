'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(name) {
  const file = path.resolve(__dirname, '../src/lib', name), mod = new Module(file, module)
  mod.filename = file; mod.require = (key) => require(key)
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
  return mod.exports
}
const { PROPOSAL_BREAKDOWN_DEFAULT, validateProposalBreakdownCopy, renderProposalBreakdownCopy } = load('luxorProposalBreakdownCopy.ts')

test('default copy validates and renders variables', () => {
  assert.doesNotThrow(() => validateProposalBreakdownCopy(PROPOSAL_BREAKDOWN_DEFAULT))
  const rendered = renderProposalBreakdownCopy(PROPOSAL_BREAKDOWN_DEFAULT, { first_name: 'Sarah', event_type: 'Wedding Reception' })
  assert.match(rendered.subject, /Wedding Reception/)
  assert.match(rendered.intro, /Sarah/)
})

test('rejects unknown variables', () => {
  assert.throws(() => validateProposalBreakdownCopy({ ...PROPOSAL_BREAKDOWN_DEFAULT, intro: 'Hi {{amount}}' }))
})
