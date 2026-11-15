'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const moduleCache = new Map()

function resolveLuxorModuleFile(fromFile, request) {
  if (!request.startsWith('.')) return null
  const base = path.resolve(path.dirname(fromFile), request)
  for (const suffix of ['', '.ts', '.tsx', '.js']) {
    const candidate = base.endsWith('.ts') || base.endsWith('.js') ? base : `${base}${suffix}`
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

function loadLuxorTsModule(absoluteFilename) {
  if (moduleCache.has(absoluteFilename)) return moduleCache.get(absoluteFilename)

  const source = fs.readFileSync(absoluteFilename, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = new Module(absoluteFilename, module)
  loaded.filename = absoluteFilename
  loaded.paths = Module._nodeModulePaths(path.dirname(absoluteFilename))
  const original = loaded.require.bind(loaded)
  loaded.require = (name) => {
    const resolved = resolveLuxorModuleFile(absoluteFilename, name)
    if (resolved) return loadLuxorTsModule(resolved)
    return original(name)
  }
  loaded._compile(compiled, absoluteFilename)
  moduleCache.set(absoluteFilename, loaded.exports)
  return loaded.exports
}

function loadLuxorSalesBriefingHelpers() {
  return loadLuxorTsModule(path.join(root, 'src/lib/luxorSalesBriefingPipelineModel.ts'))
}

function loadCoachingMarkdown() {
  return loadLuxorTsModule(path.join(root, 'src/lib/luxorSalesBriefingCoachingMarkdown.ts'))
}

const {
  bookingAwaitingInitialPayment,
  formatLuxorLeadWaitingLabel,
  buildLuxorSalesBriefingSubject,
  sanitizeLuxorSalesBriefingCopy,
} = loadLuxorSalesBriefingHelpers()

const { coachingMarkdownToHtml } = loadCoachingMarkdown()

test('booking payment gate uses paid luxor_payments against the deposit invoice', () => {
  const depositByBookingId = new Map([
    [
      'booking-1',
      { id: 'inv-deposit', booking_id: 'booking-1', invoice_kind: 'deposit', total: 500 },
    ],
  ])
  assert.equal(bookingAwaitingInitialPayment('booking-1', depositByBookingId, []), true)
  assert.equal(
    bookingAwaitingInitialPayment('booking-1', depositByBookingId, [
      { status: 'paid', invoice_id: 'inv-deposit', amount: 500 },
    ]),
    false,
  )
  assert.equal(
    bookingAwaitingInitialPayment('booking-1', depositByBookingId, [
      { status: 'paid', invoice_id: 'inv-deposit', amount: 250 },
    ]),
    true,
  )
})

test('waiting label formats short and day-long lead waits', () => {
  const now = Date.parse('2026-11-15T14:00:00.000Z')
  assert.equal(formatLuxorLeadWaitingLabel('2026-11-15T13:30:00.000Z', now), 'waiting <1h')
  assert.equal(formatLuxorLeadWaitingLabel('2026-11-15T08:00:00.000Z', now), 'waiting 6h')
  assert.equal(formatLuxorLeadWaitingLabel('2026-11-12T14:00:00.000Z', now), 'waiting 3d')
})

test('briefing subject uses Marcus headline when ready', () => {
  assert.equal(
    buildLuxorSalesBriefingSubject({
      briefingDateKey: '2026-11-16',
      marcusBriefingReady: true,
      headline: 'Lead with follow-ups before noon.',
    }),
    'Luxor sales briefing: Lead with follow-ups before noon',
  )
})

test('briefing subject strips a trailing period from the Marcus headline', () => {
  assert.equal(
    buildLuxorSalesBriefingSubject({
      briefingDateKey: '2026-11-16',
      marcusBriefingReady: true,
      headline: 'Chase deposits today...',
    }),
    'Luxor sales briefing: Chase deposits today...',
  )
})

test('briefing subject falls back to Chicago date label when Marcus is not ready', () => {
  assert.equal(
    buildLuxorSalesBriefingSubject({
      briefingDateKey: '2026-11-16',
      marcusBriefingReady: false,
      headline: 'Lead with follow-ups before noon.',
    }),
    'Luxor sales briefing: Monday, November 16',
  )
})

test('coaching markdown renders intro paragraph before bullet list', () => {
  const html = coachingMarkdownToHtml(
    '**On the phone today**\n- Ask for the date first...\n- After a price question...',
  )
  assert.match(html, /<p[^>]*><strong>On the phone today<\/strong><\/p>/)
  assert.match(html, /<ul[^>]*>/)
  assert.match(html, /<li[^>]*>Ask for the date first\.\.\.<\/li>/)
  assert.match(html, /<li[^>]*>After a price question\.\.\.<\/li>/)
  assert.doesNotMatch(html, /\*\*On the phone today\*\*/)
})

test('briefing subject replaces em dashes in Marcus headlines', () => {
  assert.equal(
    sanitizeLuxorSalesBriefingCopy('Tours first — proposals second'),
    'Tours first: proposals second',
  )
  assert.equal(
    buildLuxorSalesBriefingSubject({
      briefingDateKey: '2026-11-16',
      marcusBriefingReady: true,
      headline: 'Tours first — proposals second',
    }),
    'Luxor sales briefing: Tours first: proposals second',
  )
})