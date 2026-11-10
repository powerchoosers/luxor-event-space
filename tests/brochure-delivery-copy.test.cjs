'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/luxorBrochureDeliveryCopy.ts')
const loaded = new Module(file, module); loaded.filename = file; loaded.paths = Module._nodeModulePaths(path.dirname(file))
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
const { BROCHURE_DELIVERY_DEFAULT, validateBrochureDeliveryCopy, renderBrochureDeliveryCopy } = loaded.exports
test('default brochure wording renders the guest name', () => {
  const copy = renderBrochureDeliveryCopy(BROCHURE_DELIVERY_DEFAULT, { first_name: 'Sample', event_type: 'Wedding', guest_count: '80' })
  assert.equal(copy.subject, 'Your Luxor at Las Palmas Venue Brochure')
  assert.equal(copy.greeting, 'Hi Sample,')
  assert.match(copy.body, /official venue brochure/)
})
test('rejects unsupported fields, variables and header injection', () => {
  assert.throws(() => validateBrochureDeliveryCopy({ ...BROCHURE_DELIVERY_DEFAULT, unknown: 'x' }), /Unknown/)
  assert.throws(() => validateBrochureDeliveryCopy({ ...BROCHURE_DELIVERY_DEFAULT, body: '{{unknown}}' }), /variables/)
  assert.throws(() => validateBrochureDeliveryCopy({ ...BROCHURE_DELIVERY_DEFAULT, subject: 'Hello\nBcc: test' }), /single line/)
  const copy = renderBrochureDeliveryCopy({ ...BROCHURE_DELIVERY_DEFAULT, subject: 'Hello {{first_name}}' }, { first_name: 'Sample\nBcc: test', event_type: '', guest_count: '' })
  assert.equal(copy.subject, 'Hello Sample Bcc: test')
})
test('missing settings preserve the original and edits require a current revision', async () => {
  class RestError extends Error { constructor(status, code) { super('synthetic'); this.status = status; this.code = code } }
  let failure = new RestError(404, 'PGRST205'), called
  const serverFile = path.resolve(__dirname, '../src/lib/luxorBrochureDeliveryCopyServer.ts')
  const server = new Module(serverFile, module); server.filename = serverFile; server.paths = Module._nodeModulePaths(path.dirname(serverFile))
  const actual = server.require.bind(server)
  server.require = (name) => name === 'server-only' ? {} : name === './luxorBrochureDeliveryCopy' ? loaded.exports : name === './supabaseRestServer' ? { SupabaseRestError: RestError, supabaseRestStrict: async (...args) => { called = args; if (failure) throw failure; return [] } } : actual(name)
  server._compile(ts.transpileModule(fs.readFileSync(serverFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, serverFile)
  const result = await server.exports.readBrochureDeliverySetting()
  assert.equal(result.installed, false); assert.equal(result.setting.copy_override, null)
  failure = new RestError(503, 'unavailable'); await assert.rejects(server.exports.readBrochureDeliverySetting(), /synthetic/)
  failure = null; await assert.rejects(server.exports.saveBrochureDeliverySetting(null, 3, 'OWNER@example.invalid'), /changed/)
  assert.match(called[0], /revision=eq\.3/); assert.equal(JSON.parse(called[1].body).copy_override, null)
})
