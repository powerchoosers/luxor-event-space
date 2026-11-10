'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(name, mocks = {}) {
  const file = path.resolve(__dirname, '../src/lib', name), mod = new Module(file, module)
  mod.filename = file; mod.require = (key) => Object.hasOwn(mocks, key) ? mocks[key] : require(key)
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
  return mod.exports
}
const { PLANNER_VERIFICATION_DEFAULT } = load('luxorPlannerVerificationCopy.ts')
test('planner verification rejects merge fields', () => {
  const { validatePlannerVerificationCopy } = load('luxorPlannerVerificationCopy.ts')
  assert.throws(() => validatePlannerVerificationCopy({ ...PLANNER_VERIFICATION_DEFAULT, greeting: 'Hi {{name}}' }), /merge fields/)
})
