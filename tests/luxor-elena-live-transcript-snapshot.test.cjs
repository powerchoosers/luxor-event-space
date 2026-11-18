/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const snapshot = (() => {
  const filename = path.resolve(__dirname, '../src/lib/luxorElenaLiveTranscriptSnapshot.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
  return mod.exports
})()

const MODEL = 'elena_live_model_output'

test('uses ASR fallback when completed sideband has fewer model rows than final agent ASR', () => {
  assert.equal(snapshot.shouldUseElenaAgentAsrFallback(1, 4, 'completed'), true)
  const merged = snapshot.mergeElenaLiveTranscriptRows('completed', [
    { track: 'caller', transcription_sid: 'GT1', segment_text: 'hi', segment_start_seconds: 1, event_timestamp: 't1' },
  ], [
    { track: 'luxor_agent', transcription_sid: MODEL, segment_text: 'last reply only', segment_start_seconds: 90 },
  ], [
    { track: 'luxor_agent', transcription_sid: 'GT2', segment_text: 'greeting', segment_start_seconds: 2 },
    { track: 'luxor_agent', transcription_sid: 'GT2', segment_text: 'middle', segment_start_seconds: 40 },
    { track: 'luxor_agent', transcription_sid: 'GT2', segment_text: 'other', segment_start_seconds: 60 },
    { track: 'luxor_agent', transcription_sid: 'GT2', segment_text: 'almost done', segment_start_seconds: 80 },
  ], [])
  assert.deepEqual(merged.map((row) => row.segment_text), ['hi', 'greeting', 'middle', 'other', 'almost done'])
})

test('keeps model rows when model coverage matches ASR', () => {
  assert.equal(snapshot.shouldUseElenaAgentAsrFallback(3, 3, 'completed'), false)
  const merged = snapshot.mergeElenaLiveTranscriptRows('completed', [
    { track: 'caller', transcription_sid: 'GT1', segment_text: 'hi' },
  ], [
    { track: 'luxor_agent', transcription_sid: MODEL, segment_text: 'a' },
    { track: 'luxor_agent', transcription_sid: MODEL, segment_text: 'b' },
    { track: 'luxor_agent', transcription_sid: MODEL, segment_text: 'c' },
  ], [
    { track: 'luxor_agent', transcription_sid: 'GT2', segment_text: 'asr-a' },
    { track: 'luxor_agent', transcription_sid: 'GT2', segment_text: 'asr-b' },
    { track: 'luxor_agent', transcription_sid: 'GT2', segment_text: 'asr-c' },
  ], [])
  assert.deepEqual(merged.map((row) => row.segment_text), ['hi', 'a', 'b', 'c'])
})