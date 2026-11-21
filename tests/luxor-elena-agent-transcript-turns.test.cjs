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

test('finalizes a top-level response.done without nested response.event', () => {
  const events = [
    { type: 'session.output_transcript.delta', event_id: 't1', delta: 'Welcome to Luxor.', start_ms: 2000, end_ms: 4500 },
    { type: 'response.done', event_id: 'done-top', response_id: 'resp_top' },
  ]
  const ready = replay(events)
  assert.equal(ready.length, 1)
  assert.equal(ready[0].turnKey, 'agent-turn:resp_top')
  assert.equal(ready[0].text, 'Welcome to Luxor.')
})

test('output audio buffer stopped flushes spoken text while a response is active', () => {
  const events = [
    { type: 'response.event', event_id: 'evt0', event: { type: 'response.output_text.delta', response_id: 'resp_audio', delta: 'ignored' } },
    { type: 'session.output_transcript.delta', event_id: 't1', delta: 'Hola.', start_ms: 3000, end_ms: 3800 },
    { type: 'session.output_audio_buffer.stopped', event_id: 'buf1' },
  ]
  const ready = replay(events)
  assert.equal(ready.length, 1)
  assert.equal(ready[0].turnKey, 'agent-turn:resp_audio')
  assert.equal(ready[0].text, 'Hola.')
})

test('sequential responses each produce a separate persisted row', () => {
  const events = [
    { type: 'session.output_transcript.delta', event_id: 'a1', delta: 'First.', start_ms: 1000, end_ms: 2000 },
    { type: 'response.done', event_id: 'done-a', response_id: 'resp_a' },
    { type: 'session.output_transcript.delta', event_id: 'b1', delta: 'Second.', start_ms: 5000, end_ms: 6200 },
    { type: 'response.event', event_id: 'done-b', event: { type: 'response.completed', response_id: 'resp_b' } },
    { type: 'session.output_transcript.delta', event_id: 'c1', delta: 'Third.', start_ms: 9000, end_ms: 10100 },
    { type: 'response.done', event_id: 'done-c', response_id: 'resp_c' },
  ]
  const ready = replay(events)
  assert.equal(ready.length, 3)
  assert.deepEqual(ready.map((row) => row.turnKey), ['agent-turn:resp_a', 'agent-turn:resp_b', 'agent-turn:resp_c'])
})

test('nested and top-level response.done do not duplicate one turn', () => {
  const events = [
    { type: 'session.output_transcript.delta', event_id: 't1', delta: 'Once only.', start_ms: 400, end_ms: 900 },
    { type: 'response.event', event_id: 'nested-done', event: { type: 'response.done', response_id: 'resp_once' } },
    { type: 'response.done', event_id: 'top-done', response_id: 'resp_once' },
  ]
  const ready = replay(events)
  assert.equal(ready.length, 1)
  assert.equal(ready[0].turnKey, 'agent-turn:resp_once')
})