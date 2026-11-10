/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function fixture() {
  const filename = path.resolve('src/app/api/operations/bills/[id]/document/route.ts')
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
  const state = { authorized: true, bill: { source_message_id: 'message-a', source_attachment_id: 'attachment-a', source_filename: 'invoice.pdf' }, calls: [], failDownload: false }
  const stubs = {
    '@/lib/luxorOperationsAccess': { getOperationsSession: async () => state.authorized ? { email: 'owner@example.invalid' } : null },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async (url) => { state.calls.push({ url }); return state.bill ? [state.bill] : [] } },
    '@/lib/luxorMailboxServer': { downloadLuxorMailAttachment: async (message, attachment) => { state.calls.push({ message, attachment }); if (state.failDownload) throw new Error('storage unavailable'); return { bytes: new Uint8Array([37, 80, 68, 70]), contentType: 'application/pdf' } } },
  }
  const original = Module._load
  Module._load = function (request, parent, main) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, main) }
  try { loaded._compile(code, filename) } finally { Module._load = original }
  return { GET: loaded.exports.GET, state }
}
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const context = (value) => ({ params: Promise.resolve({ id: value }) })

test('invoice document requires operations access and reads only the bill attachment', async () => {
  const { GET, state } = fixture()
  state.authorized = false
  assert.equal((await GET(new Request('http://localhost'), context(id))).status, 403)
  assert.equal(state.calls.length, 0)
  state.authorized = true
  assert.equal((await GET(new Request('http://localhost'), context('invalid'))).status, 400)
  assert.equal(state.calls.length, 0)
  const response = await GET(new Request('http://localhost'), context(id))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/pdf')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(state.calls[1], { message: 'message-a', attachment: 'attachment-a' })
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [37, 80, 68, 70])
})

test('missing or unavailable source documents return an error', async () => {
  const { GET, state } = fixture()
  state.bill.source_attachment_id = null
  assert.equal((await GET(new Request('http://localhost'), context(id))).status, 404)
  state.bill.source_attachment_id = 'attachment-a'
  state.failDownload = true
  assert.equal((await GET(new Request('http://localhost'), context(id))).status, 500)
})
