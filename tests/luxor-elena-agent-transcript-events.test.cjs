/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const events = (() => {
  const filename = path.resolve(__dirname, '../src/lib/luxorElenaInboundAgentTranscriptEvents.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
  return mod.exports
})()

test('detects output audio buffer stopped event names', () => {
  assert.equal(events.isSessionOutputAudioBufferStopped('session.output_audio_buffer.stopped'), true)
  assert.equal(events.isSessionOutputAudioBufferStopped('session.output_audio.buffer.stopped'), true)
  assert.equal(events.isSessionOutputAudioBufferStopped('session.output_transcript.delta'), false)
})

test('response turn key prefers response_id', () => {
  assert.equal(events.responseTurnKey({ response_id: 'resp_1' }, { item_id: 'item_2' }), 'resp_1')
  assert.equal(events.responseTurnKey({}, { item_id: 'item_2' }), 'item_2')
})