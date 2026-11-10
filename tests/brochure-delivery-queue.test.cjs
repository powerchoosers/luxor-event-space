'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file), mod = new Module(filename, module)
  mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const actual = mod.require.bind(mod); mod.require = (name) => Object.hasOwn(mocks, name) ? mocks[name] : actual(name)
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename)
  return mod.exports
}
const model = load('src/lib/luxorBrochureDeliveryCopy.ts')
function harness(read) {
  let queued
  const service = load('src/lib/luxorBrochureDeliveryQueue.ts', {
    'server-only': {}, './luxorBrochureDeliveryCopy': model, './luxorBrochureDeliveryCopyServer': { readBrochureDeliverySetting: read },
    './luxorEmailJobsServer': { buildBrochureDeliveryEmailHtml: (_, copy) => copy ? 'custom snapshot' : 'original snapshot', createLuxorEmailJob: async (job) => { queued = job; return { id: 'job' } } },
  })
  return { service, queued: () => queued }
}
const inquiry = { id: 'inquiry', email: 'sample@example.invalid', full_name: 'Sample Guest', event_type: 'Wedding', guest_count: 80, source: 'homepage_brochure' }
test('queues saved brochure copy as a snapshot with the existing delivery identity', async () => {
  const copy = { ...model.BROCHURE_DELIVERY_DEFAULT, subject: 'Brochure for {{first_name}}' }
  const h = harness(async () => ({ setting: { copy_override: copy } }))
  assert.equal((await h.service.queueBrochureDelivery(inquiry)).id, 'job')
  assert.equal(h.queued().subject, 'Brochure for Sample'); assert.equal(h.queued().body, 'custom snapshot')
  assert.equal(h.queued().jobType, 'booking_package'); assert.equal(h.queued().metadata.flow_stage, 'brochure_delivery'); assert.equal(h.queued().metadata.lead_source, 'homepage_brochure')
})
test('settings outage queues the original and records the fallback', async () => {
  const h = harness(async () => { throw new Error('synthetic outage') })
  const previous = console.error; console.error = () => {}
  try { await h.service.queueBrochureDelivery(inquiry) } finally { console.error = previous }
  assert.equal(h.queued().body, 'original snapshot'); assert.equal(h.queued().subject, model.BROCHURE_DELIVERY_DEFAULT.subject)
  assert.equal(h.queued().metadata.copy_settings_unavailable, true)
})
test('does not queue without a recipient', async () => {
  const h = harness(async () => { throw new Error('unexpected read') })
  await assert.rejects(h.service.queueBrochureDelivery({ ...inquiry, email: null }), /email address/)
  assert.equal(h.queued(), undefined)
})
test('the actual email renderer escapes custom text and retains both protected actions', () => {
  const design = load('src/lib/luxorEmailDesignSystem.ts')
  const file = path.resolve(__dirname, '../src/lib/luxorEmailJobsServer.ts')
  const mod = new Module(file, module); mod.filename = file; mod.paths = Module._nodeModulePaths(path.dirname(file))
  const actual = mod.require.bind(mod)
  mod.require = (name) => name === './luxorBrochureDeliveryCopy' ? model : name === './luxorEmailDesignSystem' ? design : name === 'server-only' || name.startsWith('./') ? {} : actual(name)
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
  const copy = { ...model.BROCHURE_DELIVERY_DEFAULT, body: 'Welcome <script>alert(1)</script> {{first_name}}' }
  const html = mod.exports.buildBrochureDeliveryEmailHtml(inquiry, copy)
  assert.match(html, /Welcome &lt;script&gt;alert\(1\)&lt;\/script&gt; Sample/)
  assert.match(html, /\/api\/brochure\/download/); assert.match(html, /href="[^"]*\/visit"/)
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
})
