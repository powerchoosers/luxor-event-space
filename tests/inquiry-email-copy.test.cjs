'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/luxorInquiryEmailCopy.ts')
const loaded = new Module(file, module)
loaded.filename = file
loaded.paths = Module._nodeModulePaths(path.dirname(file))
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
assert.deepEqual(compiled.diagnostics || [], [])
loaded._compile(compiled.outputText, file)
const { INQUIRY_EMAIL_DEFAULT, validateInquiryEmailCopy, renderInquiryEmailCopy } = loaded.exports

test('default receipt renders the original copy with guest information', () => {
  const copy = renderInquiryEmailCopy(INQUIRY_EMAIL_DEFAULT, { first_name: 'Alessandra', event_type: 'Wedding Reception', guest_count: '120' })
  assert.equal(copy.subject, 'We have received your Luxor inquiry')
  assert.equal(copy.greeting, 'Hi Alessandra,')
  assert.match(copy.body, /Our team is reviewing your event details/)
})

test('rejects unknown variables, extra fields, and newlines in headers', () => {
  assert.throws(() => validateInquiryEmailCopy({ ...INQUIRY_EMAIL_DEFAULT, body: 'Hello {{unknown}}' }), /listed/)
  assert.throws(() => validateInquiryEmailCopy({ ...INQUIRY_EMAIL_DEFAULT, extra: 'x' }), /Unknown/)
  assert.throws(() => validateInquiryEmailCopy({ ...INQUIRY_EMAIL_DEFAULT, subject: 'Hello\nBcc: someone' }), /single line/)
  const result = renderInquiryEmailCopy({ ...INQUIRY_EMAIL_DEFAULT, subject: 'Hello {{first_name}}' }, { first_name: 'A\nB', event_type: 'Party', guest_count: '20' })
  assert.equal(result.subject, 'Hello A B')
})

test('missing settings preserve defaults; other read failures do not discard a saved override', async () => {
  class RestError extends Error { constructor(status, code) { super('synthetic'); this.status = status; this.code = code } }
  let failure = new RestError(404, 'PGRST205')
  const serverFile = path.resolve(__dirname, '../src/lib/luxorInquiryEmailCopyServer.ts')
  const server = new Module(serverFile, module); server.filename = serverFile; server.paths = Module._nodeModulePaths(path.dirname(serverFile))
  const serverRequire = server.require.bind(server)
  server.require = (name) => name === 'server-only' ? {} : name === './luxorInquiryEmailCopy' ? loaded.exports : name === './supabaseRestServer' ? { SupabaseRestError: RestError, supabaseRestStrict: async () => { throw failure } } : serverRequire(name)
  server._compile(ts.transpileModule(fs.readFileSync(serverFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, serverFile)
  const result = await server.exports.readInquiryEmailCopySetting()
  assert.equal(result.installed, false); assert.equal(result.setting.copy_override, null)
  failure = new RestError(503, 'unavailable')
  await assert.rejects(server.exports.readInquiryEmailCopySetting(), /synthetic/)
})

test('restoring the default uses a revision check', async () => {
  class RestError extends Error {}
  let call
  const serverFile = path.resolve(__dirname, '../src/lib/luxorInquiryEmailCopyServer.ts')
  const server = new Module(serverFile, module); server.filename = serverFile; server.paths = Module._nodeModulePaths(path.dirname(serverFile))
  const serverRequire = server.require.bind(server)
  server.require = (name) => name === 'server-only' ? {} : name === './luxorInquiryEmailCopy' ? loaded.exports : name === './supabaseRestServer' ? { SupabaseRestError: RestError, supabaseRestStrict: async (...args) => { call = args; return [] } } : serverRequire(name)
  server._compile(ts.transpileModule(fs.readFileSync(serverFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, serverFile)
  await assert.rejects(server.exports.saveInquiryEmailCopySetting(null, 3, 'OWNER@example.invalid'), /changed/)
  assert.match(call[0], /revision=eq\.3/)
  assert.equal(JSON.parse(call[1].body).copy_override, null)
  assert.equal(JSON.parse(call[1].body).updated_by, 'owner@example.invalid')
})
