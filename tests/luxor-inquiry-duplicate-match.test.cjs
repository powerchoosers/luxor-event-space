/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadDuplicateMatch() {
  const source = fs.readFileSync(path.join(root, 'src/lib/luxorInquiryDuplicateMatch.ts'), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
  const absolutePath = path.join(root, 'src/lib/luxorInquiryDuplicateMatch.ts')
  const loaded = new Module(absolutePath, module)
  loaded.filename = absolutePath
  loaded.paths = module.paths
  loaded._compile(js, loaded.filename)
  return loaded.exports
}

const { findRecentLuxorInquiryMatch } = loadDuplicateMatch()

test('tour request followed by packages inquiry does not dedupe', () => {
  const tour = {
    id: 'tour-1',
    flow: 'tour_request',
    source: 'visit_page',
    message: 'Tour please',
  }
  const match = findRecentLuxorInquiryMatch(
    {
      flow: 'packages_event_inquiry',
      source: 'website_packages',
      metadata: { packagesConfigurator: { draft_id: 'draft-a' } },
    },
    [tour],
  )
  assert.equal(match, null)
})

test('repeat packages submit with the same draft id dedupes', () => {
  const prior = {
    id: 'pkg-1',
    flow: 'packages_event_inquiry',
    source: 'website_packages',
    metadata: { packagesConfigurator: { draft_id: 'draft-a' } },
  }
  const match = findRecentLuxorInquiryMatch(
    {
      flow: 'packages_event_inquiry',
      source: 'website_packages',
      metadata: { packagesConfigurator: { draft_id: 'draft-a' } },
    },
    [prior],
  )
  assert.equal(match?.id, 'pkg-1')
})

test('packages inquiries with different draft ids do not dedupe', () => {
  const prior = {
    id: 'pkg-1',
    flow: 'packages_event_inquiry',
    source: 'website_packages',
    metadata: { packagesConfigurator: { draft_id: 'draft-a' } },
  }
  const match = findRecentLuxorInquiryMatch(
    {
      flow: 'packages_event_inquiry',
      source: 'website_packages',
      metadata: { packagesConfigurator: { draft_id: 'draft-b' } },
    },
    [prior],
  )
  assert.equal(match, null)
})

test('contact dedupe still requires the same message body', () => {
  const prior = {
    id: 'contact-1',
    flow: 'contact_form',
    source: 'contact_page',
    message: 'Need pricing for June.',
  }
  assert.equal(
    findRecentLuxorInquiryMatch(
      { flow: 'contact_form', source: 'contact_page', message: 'Need pricing for June.' },
      [prior],
    )?.id,
    'contact-1',
  )
  assert.equal(
    findRecentLuxorInquiryMatch(
      { flow: 'contact_form', source: 'contact_page', message: 'Different question.' },
      [prior],
    ),
    null,
  )
})

test('brochure still dedupes against another non-contact inquiry with same contact', () => {
  const tour = {
    id: 'tour-1',
    flow: 'tour_request',
    source: 'visit_page',
  }
  const match = findRecentLuxorInquiryMatch(
    { flow: 'brochure_request', source: 'brochure' },
    [tour],
  )
  assert.equal(match?.id, 'tour-1')
})