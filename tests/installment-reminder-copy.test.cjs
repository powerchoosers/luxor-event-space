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
const model = load('src/lib/luxorInstallmentReminderCopy.ts')
test('validates wording and prevents header injection', () => {
  const copy = model.INSTALLMENT_REMINDER_DEFAULTS.installment_7_days_before
  assert.throws(() => model.validateInstallmentReminderCopy({ ...copy, subject: 'Hello\nBcc: other' }), /single line/)
  assert.throws(() => model.validateInstallmentReminderCopy({ ...copy, body: '{{unknown}}' }), /variables/)
  assert.equal(model.renderInstallmentReminderCopy(copy, { first_name: 'A', payment_label: 'Second\nBcc: x' }).subject, 'Upcoming payment reminder: Second Bcc: x')
})
test('custom copy keeps live amount and due date and escapes inserted wording', () => {
  const design = load('src/lib/luxorEmailDesignSystem.ts')
  const emails = load('src/lib/luxorEmailJobsServer.ts', { './luxorInstallmentReminderCopy': model, './luxorEmailDesignSystem': design })
  const copy = { ...model.INSTALLMENT_REMINDER_DEFAULTS.installment_7_days_before, body: 'Hello <script>bad</script> {{first_name}}' }
  const inquiry = { full_name: 'Sample Guest' }, installment = { label: 'Second payment', amount: 100, due_at: '2099-12-10' }
  const first = emails.installmentReminderContent(inquiry, installment, 100, false, copy)
  const refreshed = emails.installmentReminderContent(inquiry, installment, 45, false, copy)
  assert.match(first.body, /\$100\.00/); assert.match(refreshed.body, /\$45\.00/); assert.match(refreshed.body, /2099-12-10/)
  assert.match(refreshed.body, /Hello &lt;script&gt;bad&lt;\/script&gt; Sample/); assert.doesNotMatch(refreshed.body, /<script>bad<\/script>/)
})
test('missing storage preserves defaults and restore is revision checked', async () => {
  class RestError extends Error { constructor(status, code) { super('synthetic'); this.status = status; this.code = code } }
  let failure = new RestError(404, 'PGRST205'), query
  const service = load('src/lib/luxorInstallmentReminderCopyServer.ts', { './luxorInstallmentReminderCopy': model, './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (...args) => { query = args; if (failure) throw failure; return [] } } })
  const fallback = await service.readInstallmentReminderSettings(); assert.equal(fallback.installed, false); assert.ok(fallback.settings.every((item) => item.copy_override === null))
  failure = new RestError(503, 'unavailable'); await assert.rejects(service.readInstallmentReminderSettings(), /synthetic/)
  failure = null; await assert.rejects(service.saveInstallmentReminderSetting('installment_7_days_before', null, 3, 'OWNER@example.invalid'), /changed/)
  assert.match(query[0], /revision=eq\.3/); assert.equal(JSON.parse(query[1].body).copy_override, null)
})
