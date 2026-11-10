'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const file = path.resolve(__dirname, '../src/lib/luxorCustomWorkflowTourOrchestrationServer.ts')
let result, failure, request
class SupabaseRestError extends Error { constructor(status, code) { super('database failure'); this.status=status; this.code=code } }
const mod = new Module(file, module); mod.filename=file; mod.paths=Module._nodeModulePaths(path.dirname(file))
const actual=mod.require.bind(mod)
mod.require = name => name === 'server-only' ? {} : name === './supabaseRestServer' ? { SupabaseRestError, supabaseRestStrict: async (url, options) => { request = { url, options }; if (failure) throw failure; return result } } : actual(name)
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
test('consumes the bounded tour outbox and reports real counts', async () => {
  failure=null; result=[{ events_consumed:2, events_ignored:1, enrollments_created:2 }]
  assert.deepEqual(await mod.exports.consumeAttendedTourEvents(20), { status:'ready', consumed:2, ignored:1, enrolled:2 })
  assert.equal(request.url, 'rpc/luxor_custom_workflow_consume_attended_tours'); assert.deepEqual(JSON.parse(request.options.body), { p_limit:20 })
})
test('missing migration is distinguished from errors and invalid results', async () => {
  failure=new SupabaseRestError(404,'PGRST202'); assert.equal((await mod.exports.consumeAttendedTourEvents(20)).status,'not_installed')
  const previous=console.error; console.error=()=>{}
  try {
    failure=new SupabaseRestError(500,'XX000'); assert.equal((await mod.exports.consumeAttendedTourEvents(20)).status,'error')
    failure=null; result=[]; assert.equal((await mod.exports.consumeAttendedTourEvents(20)).status,'error')
  } finally { console.error=previous }
})
