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
const model = load('src/lib/luxorInquiryEmailCopy.ts')
const design = load('src/lib/luxorEmailDesignSystem.ts')
const emails = load('src/lib/luxorEmailJobsServer.ts', { './luxorInquiryEmailCopy': model, './luxorEmailDesignSystem': design })
const inquiry = { full_name: 'Sample Guest', event_type: 'Wedding', guest_count: 80, preferred_tour_date: '2099-12-10', preferred_tour_time: '11:00 AM' }
test('receipt overrides escape copy and retain tour details, links, reference and newsletter notice', () => {
  const copy = { ...model.INQUIRY_EMAIL_DEFAULT, body: 'Hello <script>bad</script> {{first_name}}' }
  const tour = emails.buildTourRequestReceivedEmailHtml(inquiry, '12345678token', copy)
  assert.match(tour, /Hello &lt;script&gt;bad&lt;\/script&gt; Sample/)
  assert.match(tour, /12345678/); assert.match(tour, /2099-12-10/); assert.match(tour, /\/spaces/); assert.match(tour, /\/visit/)
  const newsletter = emails.buildNewsletterConfirmationEmailHtml(inquiry, copy)
  assert.match(newsletter, /You can unsubscribe from any marketing email/); assert.match(newsletter, /\/visit/)
  assert.doesNotMatch(newsletter, /<script>bad<\/script>/)
})
test('missing receipt table preserves defaults and restoration uses optimistic revision', async () => {
  class RestError extends Error { constructor(status, code) { super('synthetic'); this.status = status; this.code = code } }
  let failure = new RestError(404, 'PGRST205'), query
  const service = load('src/lib/luxorReceiptEmailCopyServer.ts', { './luxorInquiryEmailCopy': model, './supabaseRestServer': { SupabaseRestError: RestError, supabaseRestStrict: async (...args) => { query = args; if (failure) throw failure; return [] } } })
  assert.equal((await service.readReceiptEmailCopy('tour_request_received')).setting.copy_override, null)
  failure = new RestError(503, 'unavailable'); await assert.rejects(service.readReceiptEmailCopy('newsletter_confirmation'), /synthetic/)
  failure = null; await assert.rejects(service.saveReceiptEmailCopy('tour_request_received', null, 3, 'OWNER@example.invalid'), /changed/)
  assert.match(query[0], /key=eq\.tour_request_received&revision=eq\.3/); assert.equal(JSON.parse(query[1].body).copy_override, null)
})
