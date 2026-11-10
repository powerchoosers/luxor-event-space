/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const filename = path.resolve('src/lib/luxorProviderDocumentAnalysis.ts')
const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = module.paths
const originalLoad = Module._load
Module._load = function (request, parent, main) { return request === 'server-only' ? {} : originalLoad.call(this, request, parent, main) }
try { loaded._compile(code, filename) } finally { Module._load = originalLoad }
const { issueDocumentTicket, verifyDocumentTicket, classifyProviderDocument } = loaded.exports
const previousSecret = process.env.LUXOR_PORTAL_SESSION_SECRET
process.env.LUXOR_PORTAL_SESSION_SECRET = 'test-secret-not-for-production'
test.after(() => { if (previousSecret === undefined) delete process.env.LUXOR_PORTAL_SESSION_SECRET; else process.env.LUXOR_PORTAL_SESSION_SECRET = previousSecret })
const assessment = { kind: 'contract', sensitive: 'none', confidence: 0.96, contractEndDate: '2027-01-15' }
test('classification tickets are bound to content, provider, and actor and cannot be modified', () => {
  const token = issueDocumentTicket(assessment, 'hash', 'provider', 'owner@example.invalid')
  assert.deepEqual(verifyDocumentTicket(token, 'hash', 'provider', 'owner@example.invalid'), assessment)
  assert.equal(verifyDocumentTicket(token, 'other', 'provider', 'owner@example.invalid'), null)
  assert.equal(verifyDocumentTicket(token, 'hash', 'other', 'owner@example.invalid'), null)
  assert.equal(verifyDocumentTicket(token, 'hash', 'provider', 'other@example.invalid'), null)
  const [body, signature] = token.split('.')
  const modified = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url')), sensitive: 'none', kind: 'bill' })).toString('base64url')
  assert.equal(verifyDocumentTicket(`${modified}.${signature}`, 'hash', 'provider', 'owner@example.invalid'), null)
})
test('low confidence is routed to manual document type choice', async () => {
  const previousFetch = global.fetch, previousKey = process.env.OPEN_ROUTER_API_KEY
  process.env.OPEN_ROUTER_API_KEY = 'synthetic-test-key'
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ...assessment, confidence: 0.3 }) } }] }) })
  try { const result = await classifyProviderDocument({ bytes: Buffer.from('%PDF-test'), contentType: 'application/pdf', filename: 'test.pdf' }); assert.equal(result.kind, 'uncertain'); assert.equal(result.sensitive, 'none') }
  finally { global.fetch = previousFetch; if (previousKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = previousKey }
})
test('malformed analysis fails closed', async () => {
  const previousFetch = global.fetch, previousKey = process.env.OPEN_ROUTER_API_KEY
  process.env.OPEN_ROUTER_API_KEY = 'synthetic-test-key'
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ...assessment, sensitive: 'safe' }) } }] }) })
  try { await assert.rejects(classifyProviderDocument({ bytes: Buffer.from('%PDF-test'), contentType: 'application/pdf', filename: 'test.pdf' }), /could not be interpreted/) }
  finally { global.fetch = previousFetch; if (previousKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = previousKey }
})

test('invalid dates, missing fields, and non-object responses cannot authorize an upload', async () => {
  const previousFetch = global.fetch, previousKey = process.env.OPEN_ROUTER_API_KEY
  process.env.OPEN_ROUTER_API_KEY = 'synthetic-test-key'
  try {
    for (const value of [null, [], { ...assessment, kind: ['contract'] }, { ...assessment, sensitive: ['none'] }, { ...assessment, confidence: 1.1 }, { ...assessment, contractEndDate: '2027-02-30' }, { ...assessment, contractEndDate: undefined }]) {
      global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(value) } }] }) })
      await assert.rejects(classifyProviderDocument({ bytes: Buffer.from('%PDF-test'), contentType: 'application/pdf', filename: 'test.pdf' }), /could not be interpreted/)
    }
  } finally { global.fetch = previousFetch; if (previousKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = previousKey }
})

test('classification policy is separate from document content and only contracts retain end dates', async () => {
  const previousFetch = global.fetch, previousKey = process.env.OPEN_ROUTER_API_KEY
  process.env.OPEN_ROUTER_API_KEY = 'synthetic-test-key'
  let sent
  global.fetch = async (_url, init) => {
    sent = JSON.parse(init.body)
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ ...assessment, kind: 'bill' }) } }] }) }
  }
  try {
    const result = await classifyProviderDocument({ bytes: Buffer.from('%PDF-test'), contentType: 'application/pdf', filename: 'test.pdf' })
    assert.equal(sent.messages[0].role, 'system')
    assert.equal(sent.messages[1].role, 'user')
    assert.equal(sent.messages[1].content[0].type, 'file')
    assert.equal(result.contractEndDate, null)
  } finally { global.fetch = previousFetch; if (previousKey === undefined) delete process.env.OPEN_ROUTER_API_KEY; else process.env.OPEN_ROUTER_API_KEY = previousKey }
})

test('signed tickets still reject invalid assessments and expired authorization', () => {
  for (const value of [{ ...assessment, confidence: -1 }, { ...assessment, contractEndDate: '2027-02-30' }]) {
    assert.equal(verifyDocumentTicket(issueDocumentTicket(value, 'hash', 'provider', 'owner'), 'hash', 'provider', 'owner'), null)
  }
  const token = issueDocumentTicket(assessment, 'hash', 'provider', 'owner')
  const originalNow = Date.now
  Date.now = () => originalNow() + 16 * 60_000
  try { assert.equal(verifyDocumentTicket(token, 'hash', 'provider', 'owner'), null) }
  finally { Date.now = originalNow }
})
