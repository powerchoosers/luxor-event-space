'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(name, mocks = {}) {
  const file = path.resolve(__dirname, '../src/lib', name), mod = new Module(file, module)
  mod.filename = file; mod.require = key => Object.hasOwn(mocks, key) ? mocks[key] : require(key)
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
  return mod.exports
}
const copy = load('luxorPaidInvoiceEmailCopy.ts')
const { renderAgreementClientCopy } = load('luxorAgreementClientCopy.ts', { './luxorPaidInvoiceEmailCopy': copy })
test('agreement wording preserves the generated payment section and escapes inserted content', () => {
  const payment = '<a href="https://example.invalid/pay">Secure payment</a>'
  const original = `<p>Hi &lt;Alex&gt;,</p><p>Signed agreement attached.</p>${payment}<p>Document ID: 123</p>`
  assert.deepEqual(renderAgreementClientCopy(original, payment, '<Alex>', null), { html: original, subject: null })
  const result = renderAgreementClientCopy(original, payment, '<Alex>', { subject: 'Agreement for {{first_name}}', greeting: 'Hello {{first_name}},', closing: '<Thanks>\nSee you soon' })
  assert.equal(result.subject, 'Agreement for <Alex>')
  assert.match(result.html, /Hello &lt;Alex&gt;/); assert.match(result.html, /&lt;Thanks&gt;<br \/>See you soon/)
  assert.ok(result.html.includes(payment)); assert.ok(result.html.includes('Signed agreement attached.')); assert.ok(result.html.includes('Document ID: 123'))
  assert.throws(() => renderAgreementClientCopy(original, 'missing section', '<Alex>', { subject: 'Agreement', greeting: 'Hello', closing: 'Thanks' }), /safely/)
})
