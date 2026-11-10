'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file), mod = new Module(filename, module)
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod); mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return mod.exports
}
const base = load('src/lib/luxorFinalPaymentReminderCopy.ts')
const model = load('src/lib/luxorOfferReminderCopy.ts', { './luxorFinalPaymentReminderCopy': base })
const design = load('src/lib/luxorEmailDesignSystem.ts')
const offer = { hasLuxorOffer: () => false, luxorOfferSnapshot: () => ({}), formatLuxorOfferExpiry: () => 'November 30' }
const lifecycle = load('src/lib/luxorLifecycleEmailsServer.ts', { './luxorOfferReminderCopy': model, './luxorEmailDesignSystem': design, './luxorOffer': offer })
const input = { inquiry: { full_name: 'Sample Guest', event_type: 'Wedding' }, invoice: { total: 1000 }, reviewUrl: 'https://example.test/proposal/synthetic', reminderNumber: 1 }
test('custom offer copy keeps approved pricing and the secure review action', async () => {
  const result = await lifecycle.buildAiOfferReminderEmail({ ...input, copyOverride: { ...model.OFFER_REMINDER_EDIT_STARTER, body: 'Hello <script>bad</script> {{first_name}}' } })
  assert.match(result.body, /Hello &lt;script&gt;bad&lt;\/script&gt; Sample/); assert.doesNotMatch(result.body, /<script>bad<\/script>/)
  assert.match(result.body, /\$1,000\.00/); assert.match(result.body, /https:\/\/example\.test\/proposal\/synthetic/); assert.equal(result.aiGenerated, false)
})
test('invalid variables are rejected before copy can be queued', () => {
  assert.throws(() => model.validateOfferReminderCopy({ ...model.OFFER_REMINDER_EDIT_STARTER, body: '{{unapproved}}' }), /listed reminder variables/)
})
