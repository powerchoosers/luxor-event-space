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
const model = load('src/lib/luxorEventEmailCopy.ts')
test('validates event email fields and prevents unsupported variables and header injection', () => {
  const copy = model.EVENT_EMAIL_DEFAULTS.details
  assert.throws(() => model.validateEventEmailCopy({ ...copy, body: '{{unknown}}' }), /variables/)
  assert.throws(() => model.validateEventEmailCopy({ ...copy, subject: 'Hello\nBcc: test' }), /single line/)
  assert.equal(model.renderEventEmailCopy({ ...copy, subject: 'Hello {{first_name}}' }, { first_name: 'Sample\nBcc: test', event_type: 'Wedding' }).subject, 'Hello Sample Bcc: test')
})
test('custom event copy retains the system event date and escapes text', () => {
  const design = load('src/lib/luxorEmailDesignSystem.ts')
  const email = load('src/lib/luxorLifecycleEmailsServer.ts', { './luxorEventEmailCopy': model, './luxorEmailDesignSystem': design })
  const copy = { ...model.EVENT_EMAIL_DEFAULTS.details, body: 'Hello <script>bad</script> {{first_name}}' }
  const result = email.buildEventEmail({ inquiry: { full_name: 'Sample Guest', event_type: 'Wedding' }, booking: { event_date: '2099-12-10' }, kind: 'details', copyOverride: copy })
  assert.match(result.body, /2099-12-10/); assert.match(result.body, /Hello &lt;script&gt;bad&lt;\/script&gt; Sample/); assert.doesNotMatch(result.body, /<script>bad<\/script>/)
})
test('missing settings use original copy and restore uses a revision check', async () => {
  class RestError extends Error { constructor(status, code) { super('synthetic'); this.status = status; this.code = code } }
  let failure = new RestError(404, 'PGRST205'), query
  const service = load('src/lib/luxorEventEmailCopyServer.ts', { './luxorEventEmailCopy': model, './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (...args) => { query = args; if (failure) throw failure; return [] } } })
  const fallback = await service.readEventEmailSettings(); assert.equal(fallback.installed, false); assert.equal(fallback.settings.length, 3); assert.ok(fallback.settings.every((row) => row.copy_override === null))
  failure = new RestError(503, 'unavailable'); await assert.rejects(service.readEventEmailSettings(), /synthetic/)
  failure = null; await assert.rejects(service.saveEventEmailSetting('details', null, 2, 'OWNER@example.invalid'), /changed/)
  assert.match(query[0], /key=eq\.details&revision=eq\.2/); assert.equal(JSON.parse(query[1].body).copy_override, null)
})
