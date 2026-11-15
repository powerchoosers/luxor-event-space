/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const Module = require('node:module')
const path = require('node:path')

function load(file) {
  const m = new Module(path.resolve(file), module)
  m.filename = path.resolve(file)
  m.paths = module.paths
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    m.filename,
  )
  return m.exports
}

const {
  countLuxorVisitCtaClicks,
  isLuxorPagePerformanceCtaClickEvent,
  isLuxorVisitCtaClickEvent,
  LUXOR_VISIT_CTA_CLICK_EVENT,
  LUXOR_TOUR_CTA_CLICK_EVENT,
} = load('src/lib/luxorPublicConversionEvents.ts')

test('visit CTA helpers count current and legacy event names', () => {
  assert.equal(isLuxorVisitCtaClickEvent(LUXOR_VISIT_CTA_CLICK_EVENT), true)
  assert.equal(isLuxorVisitCtaClickEvent(LUXOR_TOUR_CTA_CLICK_EVENT), true)
  assert.equal(isLuxorVisitCtaClickEvent('cta_click'), false)
  assert.equal(isLuxorVisitCtaClickEvent('page_view'), false)

  const events = [
    { event_name: 'visit_cta_click' },
    { event_name: 'visit_cta_click' },
    { event_name: 'tour_cta_click' },
    { event_name: 'page_view' },
    { event_name: 'cta_click' },
  ]
  assert.equal(countLuxorVisitCtaClicks(events), 3)
})

test('page performance CTA clicks include visit, tour legacy, and generic cta_click', () => {
  assert.equal(isLuxorPagePerformanceCtaClickEvent('visit_cta_click'), true)
  assert.equal(isLuxorPagePerformanceCtaClickEvent('tour_cta_click'), true)
  assert.equal(isLuxorPagePerformanceCtaClickEvent('cta_click'), true)
  assert.equal(isLuxorPagePerformanceCtaClickEvent('brochure_submitted'), false)
})

test('marketing analytics server uses shared visit CTA counting helper', () => {
  const source = fs.readFileSync('src/lib/luxorAnalyticsServer.ts', 'utf8')
  assert.match(source, /countLuxorVisitCtaClicks/)
  assert.match(source, /isLuxorPagePerformanceCtaClickEvent/)
  assert.doesNotMatch(source, /event_name === 'tour_cta_click'/)
})