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
const model = load('src/lib/luxorFinalPaymentReminderCopy.ts')
test('custom wording rejects unsupported variables and header injection', () => {
  const copy = model.FINAL_PAYMENT_REMINDER_DEFAULT
  assert.throws(() => model.validateFinalPaymentReminderCopy({ ...copy, subject: 'Hello\nBcc: test' }), /single line/)
  assert.throws(() => model.validateFinalPaymentReminderCopy({ ...copy, body: '{{amount}}' }), /variables/)
  assert.equal(model.renderFinalPaymentReminderCopy({ ...copy, subject: 'Hi {{first_name}}' }, 'Sample\nBcc: test').subject, 'Hi Sample Bcc: test')
})
test('custom wording preserves the fresh balance, due date and secure payment action', async () => {
  const design = load('src/lib/luxorEmailDesignSystem.ts')
  const email = load('src/lib/luxorLifecycleEmailsServer.ts', { './luxorFinalPaymentReminderCopy': model, './luxorEmailDesignSystem': design })
  const copy = { ...model.FINAL_PAYMENT_REMINDER_DEFAULT, body: 'Hello <script>bad</script> {{first_name}}' }
  const result = await email.buildAiTailoredInvoiceReminderEmail({ inquiry: { full_name: 'Sample Guest' }, invoice: { line_items: [], invoice_kind: 'final_balance' }, reviewUrl: 'https://example.invalid/pay/fresh', balanceDue: 45, dueDate: '2099-12-10', kind: 'final_payment', copyOverride: copy })
  assert.equal(result.aiGenerated, false); assert.match(result.body, /\$45\.00/); assert.match(result.body, /2099-12-10/)
  assert.match(result.body, /https:\/\/example\.invalid\/pay\/fresh/); assert.match(result.body, /&lt;script&gt;bad&lt;\/script&gt; Sample/)
  assert.doesNotMatch(result.body, /<script>bad<\/script>/)
})
test('missing storage preserves default behavior and restore checks revision', async () => {
  class RestError extends Error { constructor(status, code) { super('synthetic'); this.status = status; this.code = code } }
  let failure = new RestError(404, 'PGRST205'), query
  const service = load('src/lib/luxorFinalPaymentReminderCopyServer.ts', { './luxorFinalPaymentReminderCopy': model, './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (...args) => { query = args; if (failure) throw failure; return [] } } })
  const fallback = await service.readFinalPaymentReminderSettings(); assert.equal(fallback.installed, false); assert.equal(fallback.settings.length, 4); assert.ok(fallback.settings.every((row) => row.copy_override === null))
  failure = new RestError(503, 'unavailable'); await assert.rejects(service.readFinalPaymentReminderSettings(), /synthetic/)
  failure = null; await assert.rejects(service.saveFinalPaymentReminderSetting('14_days', null, 2, 'OWNER@example.invalid'), /changed/)
  assert.match(query[0], /key=eq\.14_days&revision=eq\.2/); assert.equal(JSON.parse(query[1].body).copy_override, null)
})
