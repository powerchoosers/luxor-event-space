/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const display = (() => {
  const filename = path.resolve(__dirname, '../src/lib/luxorTranscriptDisplay.ts')
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename)
  return mod.exports
})()

test('line start seconds prefers segment_start_seconds', () => {
  assert.equal(display.luxorTranscriptLineStartSeconds({ startSeconds: 92, timestamp: '2026-11-16T02:09:00.000Z' }, '2026-11-16T02:07:28.000Z'), 92)
})

test('line start seconds falls back to event timestamp from recording start', () => {
  assert.equal(
    display.luxorTranscriptLineStartSeconds({ timestamp: '2026-11-16T02:08:45.000Z' }, '2026-11-16T02:07:28.000Z'),
    77,
  )
})

test('format elapsed renders mm:ss', () => {
  assert.equal(display.formatLuxorTranscriptElapsed(77), '1:17')
  assert.equal(display.formatLuxorTranscriptElapsed(null), '—')
})