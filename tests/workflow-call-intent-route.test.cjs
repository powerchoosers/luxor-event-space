/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')
const ids = ['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']
let verified, portal, allowed, rpcCalls, rpcResult, rpcThrows
function loadRoute() {
  const source = fs.readFileSync(path.join(root, 'src/app/api/workflow-call-intent/route.ts'), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const route = new Module(path.join(root, 'call-intent.synthetic.cjs'), module)
  route.filename = path.join(root, 'call-intent.synthetic.cjs'); route.paths = module.paths
  const stubs = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init) } },
    '@/lib/luxorPortalAuth': { getLuxorPortalSession: async () => portal, getVerifiedLuxorPortalSession: async () => verified, isAuthorizedLuxorPortalEmail: () => allowed },
    '@/lib/supabaseRestServer': { supabaseRestStrict: async (query, init) => {
      rpcCalls.push({query, body: JSON.parse(init.body)})
      if (rpcThrows) throw new Error('synthetic timeout')
      return rpcResult
    } },
  }
  const original = Module._load
  Module._load = function (request, parent, isMain) { return Object.hasOwn(stubs, request) ? stubs[request] : original.call(this, request, parent, isMain) }
  try { route._compile(js, route.filename) } finally { Module._load = original }
  return route.exports
}
const route = loadRoute()
function reset() {
  verified = portal = { email: 'staff@example.invalid' }; allowed = true; rpcCalls = []; rpcThrows = false
  rpcResult = { status: 'stopped', intent: 'stop', taskId: ids[2], noteId: ids[3] }
  delete process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED; delete process.env.LUXOR_ATOMIC_CALL_INTENT_ENABLED
}
function req(body = {}, origin = 'https://example.invalid') {
  return { nextUrl: new URL('https://example.invalid/api/workflow-call-intent'), headers: new Headers({ origin, 'content-type':'application/json' }), json: async () => body }
}
const valid = { requestId: ids[0], inquiryId: ids[1], taskId: ids[2], intent: 'stop', outcome: 'reached', note: 'synthetic' }
test('disabled by default and requires both flags', async () => {
  reset(); assert.equal((await route.POST(req(valid))).status, 409)
  process.env.LUXOR_ATOMIC_CALL_INTENT_ENABLED='true'
  assert.equal((await route.POST(req(valid))).status, 409)
  assert.equal(rpcCalls.length, 0)
})
test('requires verified matching authorized session and same origin', async () => {
  reset(); process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED='true'; process.env.LUXOR_ATOMIC_CALL_INTENT_ENABLED='true'
  verified=null; assert.equal((await route.POST(req(valid))).status, 401)
  verified={email:'different@example.invalid'}; assert.equal((await route.POST(req(valid))).status, 401)
  verified=portal; allowed=false; assert.equal((await route.POST(req(valid))).status, 401)
  allowed=true; assert.equal((await route.POST(req(valid,'https://other.invalid'))).status, 403)
  assert.equal(rpcCalls.length,0)
})
test('rejects invalid inputs and unsupported decline without calling SQL', async () => {
  reset(); process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED='true'; process.env.LUXOR_ATOMIC_CALL_INTENT_ENABLED='true'
  for (const bad of [{...valid,requestId:'bad'},{...valid,outcome:'not_interested'},{...valid,note:'x'.repeat(501)},{...valid,intent:'other'}])
    assert.equal((await route.POST(req(bad))).status,400)
  assert.equal(rpcCalls.length,0)
})
test('confirms exact committed result and passes verified actor', async () => {
  reset(); process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED='true'; process.env.LUXOR_ATOMIC_CALL_INTENT_ENABLED='true'
  const response=await route.POST(req(valid)); assert.equal(response.status,200)
  assert.equal((await response.json()).status,'stopped')
  assert.equal(rpcCalls[0].query,'rpc/luxor_complete_call_and_stop_draft')
  assert.equal(rpcCalls[0].body.p_actor,'staff@example.invalid')
})
test('malformed RPC or uncertain commit never claims success', async () => {
  reset(); process.env.LUXOR_ORDERED_WORKFLOWS_ENABLED='true'; process.env.LUXOR_ATOMIC_CALL_INTENT_ENABLED='true'
  for (const bad of [null,{status:'stopped',intent:'nurture',taskId:ids[2],noteId:ids[3]},{...rpcResult,taskId:ids[1]},{...rpcResult,noteId:'bad'}]) {
    rpcResult=bad; const response=await route.POST(req(valid)); assert.equal(response.status,503)
    assert.equal((await response.json()).code,'outcome_unconfirmed')
  }
  rpcThrows=true; const response=await route.POST(req(valid)); assert.equal(response.status,503)
  assert.equal((await response.json()).code,'outcome_unconfirmed')
})
