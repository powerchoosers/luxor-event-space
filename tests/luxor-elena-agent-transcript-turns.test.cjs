/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

function compileExports(file, parent) {
  const filename = path.resolve(__dirname, file)
  const mod = new Module(filename, parent || module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  const transpile = (sourceFile) => ts.transpileModule(fs.readFileSync(sourceFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  mod.require = (name) => {
    if (name === './luxorElenaInboundAgentTranscriptEvents') {
      return compileExports('../src/lib/luxorElenaInboundAgentTranscriptEvents.ts', mod)
    }
    return Module.prototype.require.call(mod, name)
  }
  mod._compile(transpile(filename), filename)
  return mod.exports
}

const turns = compileExports('../src/lib/luxorElenaInboundAgentTranscriptTurns.ts')

function replay(events) {
  const collector = turns.createElenaInboundAgentTranscriptTurnCollector()
  const ready = []
  for (const event of events) ready.push(...collector.ingest(event))
  const partial = collector.drainPartial()
  if (partial) ready.push(partial)
  return ready
}

test('persists one turn per response.done with spoken transcript', () => {
  const events = [
    { type: 'response.event', event_id: 'evt1', event: { type: 'response.output_text.delta', response_id: 'resp_a', delta: 'ignored' } },
    { type: 'session.output_transcript.delta', event_id: 't1', delta: 'Hola, ', start_ms: 1000, end_ms: 1500 },
    { type: 'session.output_transcript.delta', event_id: 't2', delta: 'bienvenida.', start_ms: 1500, end_ms: 2400 },
    { type: 'response.event', event_id: 'evt2', event: { type: 'response.done', response_id: 'resp_a' } },
    { type: 'response.event', event_id: 'evt3', event: { type: 'response.done', response_id: 'resp_a' } },
  ]
  const ready = replay(events)
  assert.equal(ready.length, 1)
  assert.match(ready[0].text, /Hola, bienvenida\./)
  assert.equal(ready[0].turnKey, 'agent-turn:resp_a')
  assert.equal(ready[0].startMs, 1000)
  assert.equal(ready[0].endMs, 2400)
})

test('does not overwrite spoken text with response.output_text.done', () => {
  const events = [
    { type: 'session.output_transcript.delta', event_id: 't1', delta: 'Perfecto, Eric.', start_ms: 500, end_ms: 900 },
    { type: 'response.event', event_id: 'evt1', event: { type: 'response.output_text.done', response_id: 'resp_b', text: 'Perfecto, Erika.' } },
    { type: 'response.event', event_id: 'evt2', event: { type: 'response.done', response_id: 'resp_b' } },
  ]
  const ready = replay(events)
  assert.equal(ready.length, 1)
  assert.equal(ready[0].text, 'Perfecto, Eric.')
})

test('replays three second sideband events only once by event_id', () => {
  const event = { type: 'session.output_transcript.delta', event_id: 'dup', delta: 'Once.', start_ms: 10, end_ms: 50 }
  const ready = replay([event, event, {
    type: 'response.event', event_id: 'done1', event: { type: 'response.done', response_id: 'resp_dup' },
  }])
  assert.equal(ready.length, 1)
  assert.equal(ready[0].text, 'Once.')
})

test('counts multiple finals across a call', () => {
  const blocks = []
  for (let index = 0; index < 5; index += 1) {
    const id = `resp_${index}`
    blocks.push(
      { type: 'session.output_transcript.delta', event_id: `t-${index}`, delta: `Turn ${index}.`, start_ms: index * 1000, end_ms: index * 1000 + 800 },
      { type: 'response.event', event_id: `done-${index}`, event: { type: 'response.done', response_id: id } },
    )
  }
  const ready = replay(blocks)
  assert.equal(ready.length, 5)
  assert.deepEqual(ready.map((row) => row.turnKey), ['agent-turn:resp_0', 'agent-turn:resp_1', 'agent-turn:resp_2', 'agent-turn:resp_3', 'agent-turn:resp_4'])
})