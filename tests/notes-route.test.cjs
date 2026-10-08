/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const inquiryId = '11111111-1111-4111-8111-111111111111'
const otherInquiryId = '22222222-2222-4222-8222-222222222222'
const taskId = '33333333-3333-4333-8333-333333333333'
let requests = []

function compile(relativePath, filename, stubs) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    return Object.hasOwn(stubs, request) ? stubs[request] : originalLoad.call(this, request, parent, isMain)
  }
  try { loaded._compile(js, filename) } finally { Module._load = originalLoad }
  return loaded.exports
}

const service = compile('src/lib/luxorNotesServer.ts', path.join(root, 'notes-service.synthetic.cjs'), {
  'server-only': {},
})
const route = compile('src/app/api/notes/route.ts', path.join(root, 'notes-route.synthetic.cjs'), {
  'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
  '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => ({ email: 'synthetic@example.invalid' }) },
  '@/lib/luxorNotesServer': service,
})

function reset() {
  requests = []
  global.fetch = async (url, init = {}) => {
    const pathAndQuery = String(url).replace('https://synthetic.invalid/rest/v1/', '')
    requests.push({ path: pathAndQuery, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null })
    if (pathAndQuery.startsWith('luxor_tasks?')) {
      const belongs = pathAndQuery.includes(`id=eq.${taskId}`) && pathAndQuery.includes(`inquiry_id=eq.${inquiryId}`)
      return Response.json(belongs ? [{ id: taskId }] : [])
    }
    if (pathAndQuery === 'luxor_notes?select=*') return Response.json([{ id: 'synthetic-note', ...JSON.parse(init.body) }], { status: 201 })
    return Response.json([])
  }
}

function request(body) { return { json: async () => body } }

test('notes accept only database-supported types and associate task with the same lead', async () => {
  const priorUrl = process.env.SUPABASE_URL
  const priorKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const priorFetch = global.fetch
  process.env.SUPABASE_URL = 'https://synthetic.invalid'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-test-key'
  try {
    reset()
    const response = await route.POST(request({ inquiryId, content: 'Synthetic call outcome', noteType: 'call_log', author: 'Synthetic staff', taskId }))
    assert.equal(response.status, 201)
    assert.deepEqual(requests.map(({ path, method }) => ({ path, method })), [
      { path: `luxor_tasks?select=id&id=eq.${taskId}&inquiry_id=eq.${inquiryId}&limit=1`, method: 'GET' },
      { path: 'luxor_notes?select=*', method: 'POST' },
    ])
    assert.equal(requests[1].body.inquiry_id, inquiryId)
    assert.equal(requests[1].body.task_id, taskId)
    assert.equal(requests[1].body.note_type, 'call_log')

    reset()
    const invalidType = await route.POST(request({ inquiryId, content: 'Synthetic note', noteType: 'general' }))
    assert.equal(invalidType.status, 400)
    assert.equal(requests.length, 0)

    reset()
    const unlinkedTask = await route.POST(request({ inquiryId: otherInquiryId, content: 'Synthetic call outcome', noteType: 'call_log', taskId }))
    assert.equal(unlinkedTask.status, 400)
    assert.equal(requests.length, 1)
    assert.match(requests[0].path, new RegExp(`inquiry_id=eq\\.${otherInquiryId}`))
  } finally {
    global.fetch = priorFetch
    if (priorUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = priorUrl
    if (priorKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = priorKey
  }
})

test('notes use the existing database default and allowed type constraint', () => {
  const schema = fs.readFileSync(path.join(root, 'supabase/luxor_owner_workspace_financials.sql'), 'utf8')
  assert.match(schema, /note_type text not null default 'note' check \(note_type in \('note', 'call_log', 'email_log', 'status_change'\)\)/i)
  assert.match(fs.readFileSync(path.join(root, 'src/lib/luxorNotesServer.ts'), 'utf8'), /noteType: LuxorNoteType = 'note'/)
})
