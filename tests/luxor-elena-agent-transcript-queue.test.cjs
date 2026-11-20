/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const { EventEmitter } = require('node:events')
const ts = require('typescript')

test('a failed sequence lookup does not block the next queued agent turn', async (t) => {
  const callSid = `CA${'0'.repeat(32)}`
  const sessionId = 'session_fixture'
  const saved = []
  const warnings = []
  let lookups = 0
  t.mock.method(console, 'warn', (...args) => warnings.push(args))
  class FakeSocket extends EventEmitter {
    static OPEN = 1
    readyState = 1
    constructor() {
      super()
      queueMicrotask(() => {
        for (const event of [{ turnKey: 'failed_turn' }, { turnKey: 'next_turn' }, { type: 'session.closed' }]) {
          this.emit('message', Buffer.from(JSON.stringify(event)))
        }
      })
    }
    close() {}
    terminate() {}
  }
  const row = { id: 'fixture', twilio_call_sid: callSid, status: 'in-progress', updated_at: '2026-01-01T00:00:00Z', metadata: { openai_session_id: sessionId, rehearsal_only: false } }
  const mocks = {
    'server-only': {},
    ws: FakeSocket,
    './luxorElenaInboundServer': { getElenaLiveConfig: () => ({ apiKey: 'fixture', projectId: 'fixture' }) },
    './luxorElenaInboundAgentTranscriptTurns': {
      createElenaInboundAgentTranscriptTurnCollector: () => ({
        ingest: (event) => event.turnKey ? [{ text: 'Synthetic output', startMs: 0, endMs: 1, turnKey: event.turnKey }] : [],
        drainPartial: () => null,
      }),
    },
    './luxorCallsServer': {
      ELENA_LIVE_AGENT_TRANSCRIPTION_SID: 'fixture',
      maxElenaModelTranscriptSequenceForCallSid: async () => {
        lookups += 1
        if (lookups === 2) throw new Error('Transient sequence lookup failure')
        return 4
      },
      saveLuxorElenaAgentTranscriptSegment: async (input) => { saved.push(input); return row },
    },
    './supabaseRestServer': { SupabaseRestError: class extends Error {}, supabaseRestStrict: async () => [row] },
  }
  const filename = path.resolve(__dirname, '../src/lib/luxorElenaInboundAgentTranscriptServer.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod.require = (id) => {
    if (Object.hasOwn(mocks, id)) return mocks[id]
    if (id === './luxorElenaInboundAgentTranscriptClaim') {
      const claimFilename = path.resolve(path.dirname(filename), `${id}.ts`)
      const claim = new Module(claimFilename, module)
      claim._compile(ts.transpileModule(fs.readFileSync(claimFilename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, claimFilename)
      return claim.exports
    }
    throw new Error(`Unexpected integration: ${id}`)
  }
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
  const result = await mod.exports.runElenaInboundAgentTranscriptSideband(callSid, sessionId)
  assert.equal(result.started, true)
  assert.equal(lookups, 3)
  assert.deepEqual(saved.map(({ turnKey, sequenceId }) => ({ turnKey, sequenceId })), [{ turnKey: 'next_turn', sequenceId: 5 }])
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0][1].turnKey, 'failed_turn')
  assert.equal(warnings[0][1].message, 'Transient sequence lookup failure')
})
