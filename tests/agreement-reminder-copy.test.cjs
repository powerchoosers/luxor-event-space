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
const model = load('src/lib/luxorAgreementReminderCopy.ts', { './luxorFinalPaymentReminderCopy': base })
const design = load('src/lib/luxorEmailDesignSystem.ts')
const lifecycle = load('src/lib/luxorLifecycleEmailsServer.ts', { './luxorAgreementReminderCopy': model, './luxorEmailDesignSystem': design })
const signature = { client_name: 'Sample Guest', token: 'synthetic-token' }
test('custom agreement copy escapes content and retains the secure signing action', () => {
  const copy = { ...model.AGREEMENT_REMINDER_DEFAULTS.view, body: 'Hello <script>bad</script> {{first_name}}' }
  const result = lifecycle.buildContractReminderEmail({ signature, kind: 'view', copyOverride: copy })
  assert.match(result.body, /Hello &lt;script&gt;bad&lt;\/script&gt; Sample/)
  assert.match(result.body, /\/secure-portal\/sign\/synthetic-token/); assert.doesNotMatch(result.body, /<script>bad<\/script>/)
})
test('each reminder uses its own setting and an outage falls back to originals', async () => {
  let fail = false
  const view = { ...model.AGREEMENT_REMINDER_DEFAULTS.view, subject: 'Review for {{first_name}}' }
  const queue = load('src/lib/luxorAgreementReminderQueue.ts', { './luxorLifecycleEmailsServer': lifecycle, './luxorAgreementReminderCopyServer': { readAgreementReminderSettings: async () => { if (fail) throw new Error('synthetic'); return { settings: [{ key: 'view', copy_override: view }, { key: 'sign', copy_override: null }] } } } })
  const custom = await queue.buildAgreementReminderPair(signature)
  assert.equal(custom.view.subject, 'Review for Sample'); assert.equal(custom.sign.subject, model.AGREEMENT_REMINDER_DEFAULTS.sign.subject); assert.equal(custom.copySettingsUnavailable, false)
  fail = true; const previous = console.error; console.error = () => {}
  try { const fallback = await queue.buildAgreementReminderPair(signature); assert.equal(fallback.view.subject, model.AGREEMENT_REMINDER_DEFAULTS.view.subject); assert.equal(fallback.copySettingsUnavailable, true) } finally { console.error = previous }
})
