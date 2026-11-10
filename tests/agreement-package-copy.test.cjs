'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(name) {
  const file = path.resolve(__dirname, '../src/lib', name), mod = new Module(file, module)
  mod.filename = file; mod.require = (key) => require(key)
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
  return mod.exports
}
const { AGREEMENT_PACKAGE_DEFAULT, validateAgreementPackageCopy, renderAgreementPackageCopy } = load('luxorAgreementPackageCopy.ts')

test('default agreement package copy validates and renders variables', () => {
  assert.doesNotThrow(() => validateAgreementPackageCopy(AGREEMENT_PACKAGE_DEFAULT))
  const rendered = renderAgreementPackageCopy(AGREEMENT_PACKAGE_DEFAULT, { first_name: 'Sarah', final_balance_schedule: ', with the final event balance due October 24, 2026' })
  assert.match(rendered.greeting, /Sarah/)
  assert.match(rendered.nextSteps, /October 24, 2026/)
})

test('requires first_name in greeting', () => {
  assert.throws(() => validateAgreementPackageCopy({ ...AGREEMENT_PACKAGE_DEFAULT, greeting: 'Hello there,' }))
})
