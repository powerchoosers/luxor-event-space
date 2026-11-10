'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
function load(name) {
  const file = path.resolve(__dirname, '../src/lib', name), mod = new Module(file, module)
  mod.filename = file; mod.require = (key) => require(key)
  mod._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file)
  return mod.exports
}
const { CALENDAR_CANCELLATION_DEFAULT, CALENDAR_UPDATE_DEFAULT, validateCalendarCancellationCopy, validateCalendarUpdateCopy } = load('luxorCalendarMessageCopy.ts')

test('default calendar copy validates', () => {
  assert.deepEqual(validateCalendarCancellationCopy(CALENDAR_CANCELLATION_DEFAULT), { ...CALENDAR_CANCELLATION_DEFAULT, subjectPrefix: 'Cancelled:' })
  assert.deepEqual(validateCalendarUpdateCopy(CALENDAR_UPDATE_DEFAULT), CALENDAR_UPDATE_DEFAULT)
})

test('rejects multiline subjectPrefix', () => {
  assert.throws(() => validateCalendarCancellationCopy({ ...CALENDAR_CANCELLATION_DEFAULT, subjectPrefix: 'line one\nline two' }))
})

test('rejects empty footer', () => {
  assert.throws(() => validateCalendarUpdateCopy({ footer: '   ' }))
})
