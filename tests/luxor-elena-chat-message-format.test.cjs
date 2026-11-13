/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const Module = require('node:module')

function load(file) {
  const m = new Module(path.resolve(file), module)
  m.filename = path.resolve(file)
  m.paths = module.paths
  const old = Module._load
  Module._load = function (name, parent, isMain) {
    return old.call(this, name, parent, isMain)
  }
  try {
    m._compile(
      ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText,
      m.filename,
    )
  } finally {
    Module._load = old
  }
  return m.exports
}

const { stripOwnerFacingIds, isEmailToken } = load('src/lib/luxorElenaChatMessageFormat.ts')

test('stripOwnerFacingIds removes inquiryId parentheses', () => {
  const raw =
    'Ibukun Oyelade (inquiryId: a335737c-91bd-4e9b-b2ce-dc2d94e37799) - phone +16823339399'
  const cleaned = stripOwnerFacingIds(raw)
  assert.match(cleaned, /^Ibukun Oyelade - phone \+16823339399/)
  assert.doesNotMatch(cleaned, /inquiryId/)
})

test('isEmailToken recognizes email addresses', () => {
  assert.equal(isEmailToken('ksharkey.sands@gmail.com'), true)
  assert.equal(isEmailToken('+16823339399'), false)
})
