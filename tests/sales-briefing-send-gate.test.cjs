'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadLuxorSalesBriefingSendGate() {
  const filename = path.join(root, 'src/lib/luxorSalesBriefingSendGate.ts')
  const source = fs.readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(compiled, filename)
  return loaded.exports
}

const { evaluateLuxorSalesBriefingSendGate } = loadLuxorSalesBriefingSendGate()

const baseInput = {
  sendEnabled: true,
  recipientConfigured: true,
  chicagoHour: 8,
  chicagoWeekdayShort: 'Mon',
  alreadySent: false,
}

test('send gate stays off when delivery is disabled', () => {
  const result = evaluateLuxorSalesBriefingSendGate({ ...baseInput, sendEnabled: false })
  assert.equal(result.shouldSend, false)
  assert.equal(result.reason, 'send_disabled')
})

test('send gate blocks outside the 8 AM Chicago window', () => {
  const result = evaluateLuxorSalesBriefingSendGate({ ...baseInput, chicagoHour: 9 })
  assert.equal(result.shouldSend, false)
  assert.equal(result.reason, 'wrong_hour')
})

test('send gate does not send on Sunday', () => {
  const result = evaluateLuxorSalesBriefingSendGate({ ...baseInput, chicagoWeekdayShort: 'Sun' })
  assert.equal(result.shouldSend, false)
  assert.equal(result.reason, 'sunday')
})

test('send gate respects same-day delivery idempotency', () => {
  const result = evaluateLuxorSalesBriefingSendGate({ ...baseInput, alreadySent: true })
  assert.equal(result.shouldSend, false)
  assert.equal(result.reason, 'already_sent')
})

test('send gate allows Monday 8 AM when enabled and unsent', () => {
  const result = evaluateLuxorSalesBriefingSendGate(baseInput)
  assert.equal(result.shouldSend, true)
  assert.equal(result.reason, 'ready')
})