'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(name) {
  const file = path.resolve(__dirname, '../src/lib', name), mod = new Module(file, module)
  mod.filename = file; mod.require = (key) => require(key)
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
  return mod.exports
}
const { buildAgreementOwnerNotice, AGREEMENT_OWNER_DEFAULT } = load('luxorAgreementOwnerCopy.ts')
test('default owner notice preserves audit wording and escapes unsafe names', () => {
  const result = buildAgreementOwnerNotice('<Alex>', null)
  assert.equal(result.subject, 'Executed Luxor agreement - <Alex>')
  assert.match(result.html, /&lt;Alex&gt; completed the agreement/)
  assert.match(result.html, /Executed agreement archived/)
})
test('custom owner copy substitutes client name and escapes inserted HTML', () => {
  const result = buildAgreementOwnerNotice('Pat <Lee>', { ...AGREEMENT_OWNER_DEFAULT, heading: '<Audit>', body: 'Signed by {{client_name}}.' })
  assert.equal(result.subject, 'Executed Luxor agreement - Pat <Lee>')
  assert.match(result.html, /&lt;Audit&gt;/)
  assert.match(result.html, /Signed by Pat &lt;Lee&gt;\./)
})
