/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function compile(relativePath, filename, stubs = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = module.paths
  const originalLoad = Module._load
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(stubs, request)) return stubs[request]
    const mapped = request.startsWith('@/') ? path.join(root, 'src', request.slice(2)) : null
    if (mapped) {
      const candidates = [mapped, `${mapped}.ts`, `${mapped}.tsx`]
      const hit = candidates.find((candidate) => fs.existsSync(candidate))
      if (hit) return compile(path.relative(root, hit), `${hit}.synthetic.cjs`, stubs)
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    loaded._compile(js, filename)
  } finally {
    Module._load = originalLoad
  }
  return loaded.exports
}

const { verbatimPlainTextFromTipTap, blocksFromTipTapJson } = compile(
  'src/lib/luxorDocumentCreatorVerbatim.ts',
  path.join(root, 'luxor-document-creator-verbatim.synthetic.cjs'),
)

const sampleClause = '§ 4.2 — Client acknowledges "as-is" condition; venue provides no warranty—express or implied.'

const unicodeSample = 'Teen Night: “curfew” applies after 10 PM — parents’ consent required. Items: • snacks … © Luxor.'

const sampleDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Venue Use Agreement' }] },
    { type: 'paragraph', content: [{ type: 'text', text: sampleClause }] },
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1.1 Payment shall be due net 10 days.' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1.2 Security deposit: $750 (refundable).' }] }] },
      ],
    },
  ],
}

const unicodeDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: unicodeSample }] },
    { type: 'paragraph', content: [{ type: 'text', text: '“ ” ‘ ’ — – § • … ©' }] },
  ],
}

test('TipTap blocks preserve legal characters verbatim', () => {
  const plain = verbatimPlainTextFromTipTap(sampleDoc)
  assert.ok(plain.includes('§ 4.2'))
  assert.ok(plain.includes('"as-is"'))
  assert.ok(plain.includes('warranty—express'))
  const blocks = blocksFromTipTapJson(sampleDoc)
  const paragraph = blocks.find((block) => block.type === 'paragraph')
  assert.equal(paragraph?.text, sampleClause)
})

test('plain-text paste splitter keeps smart punctuation', () => {
  const { plainTextToTipTapDocument } = compile(
    'src/lib/luxorDocumentCreatorPaste.ts',
    path.join(root, 'luxor-document-creator-paste.synthetic.cjs'),
  )
  const doc = plainTextToTipTapDocument(`Line one “quote”\nLine two\n\nSecond paragraph — dash`)
  assert.equal(doc.content.length, 2)
  const first = doc.content[0]
  assert.equal(first.type, 'paragraph')
  const joined = first.content.map((node) => (node.type === 'text' ? node.text : '\n')).join('')
  assert.ok(joined.includes('“quote”'))
})

test('generated creator PDF embeds unicode body text', async () => {
  const branding = compile('src/lib/luxorPdfBrandingServer.ts', path.join(root, 'luxor-pdf-branding.synthetic.cjs'), {
    './luxorVenue': { LUXOR_VENUE_ADDRESS: '3100 Voss Ave, Dallas, TX' },
    'server-only': {},
    'node:fs/promises': fs.promises,
    'node:path': path,
  })
  const fonts = compile('src/lib/luxorCreatedDocumentPdfFontsServer.ts', path.join(root, 'luxor-created-document-pdf-fonts.synthetic.cjs'), {
    './luxorPdfBrandingServer': branding,
    '@/lib/luxorPdfBrandingServer': branding,
    'server-only': {},
    'node:fs/promises': fs.promises,
    'fs/promises': fs.promises,
    path,
    'node:path': path,
    '@pdf-lib/fontkit': require('@pdf-lib/fontkit'),
  })
  const sharedNodeStubs = {
    'server-only': {},
    path,
    'node:path': path,
    'node:fs/promises': fs.promises,
    'fs/promises': fs.promises,
  }
  const { buildLuxorCreatedDocumentPdf, extractRenderableBlocks } = compile(
    'src/lib/luxorDocumentCreatorPdfServer.ts',
    path.join(root, 'luxor-document-creator-pdf.synthetic.cjs'),
    {
      ...sharedNodeStubs,
      './luxorPdfBrandingServer': branding,
      '@/lib/luxorPdfBrandingServer': branding,
      './luxorCreatedDocumentPdfFontsServer': fonts,
      '@/lib/luxorCreatedDocumentPdfFontsServer': fonts,
      './luxorDocumentCreatorVerbatim': { blocksFromTipTapJson, verbatimPlainTextFromTipTap },
      '@/lib/luxorDocumentCreatorVerbatim': { blocksFromTipTapJson, verbatimPlainTextFromTipTap },
      './luxorDocumentCreatorTypes': compile('src/lib/luxorDocumentCreatorTypes.ts', path.join(root, 'luxor-document-creator-types.synthetic.cjs')),
      '@/lib/luxorDocumentCreatorTypes': compile('src/lib/luxorDocumentCreatorTypes.ts', path.join(root, 'luxor-document-creator-types.synthetic.cjs')),
    },
  )
  assert.equal(extractRenderableBlocks(sampleDoc).length, 3)
  const pdfBytes = await buildLuxorCreatedDocumentPdf({
    title: 'Teen Night Agreement',
    documentType: 'venue_use_agreement',
    bodyJson: unicodeDoc,
  })
  assert.ok(pdfBytes.byteLength > 1500)
  const { PDFDocument } = require('pdf-lib')
  const loaded = await PDFDocument.load(pdfBytes)
  assert.ok(loaded.getPageCount() >= 1)
  const renderedPlain = verbatimPlainTextFromTipTap(unicodeDoc)
  assert.ok(renderedPlain.includes('“curfew”'))
  assert.ok(renderedPlain.includes('—'))
  assert.ok(renderedPlain.includes('©'))
  assert.ok(renderedPlain.includes('§'))
})