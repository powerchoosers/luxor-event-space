'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '../src/lib', file)
  const m = new Module(filename, module)
  m.filename = filename; m.paths = module.paths
  const original = m.require.bind(m)
  m.require = (name) => (Object.hasOwn(mocks, name) ? mocks[name] : original(name))
  m._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return m.exports
}
const inquiryTypes = load('luxorInquiryTypes.ts')
const { resolveElenaCallerEventType, elenaEventTypeClarificationQuestion } = load('luxorElenaCallerEventType.ts', {
  './luxorInquiryTypes': inquiryTypes,
})

test('event type resolution prefers conversational quince over noisy transcript', () => {
  assert.equal(resolveElenaCallerEventType('Pizza', 'quinceañera for my daughter'), 'Quinceañera')
  assert.equal(resolveElenaCallerEventType('XV', ''), 'Quinceañera')
  assert.equal(resolveElenaCallerEventType('sweet sixteen', ''), 'Sweet 16')
})

test('clarification question appears for ambiguous quince language', () => {
  assert.match(elenaEventTypeClarificationQuestion('a quince party'), /quinceañera/i)
  assert.equal(elenaEventTypeClarificationQuestion('Quinceañera'), null)
})