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

const { blocksFromTipTapJson, inlinesToPlainText, verbatimPlainTextFromTipTap } = compile(
  'src/lib/luxorDocumentCreatorVerbatim.ts',
  path.join(root, 'luxor-document-creator-verbatim.synthetic.cjs'),
)

const sampleClause = '§ 4.2 — Client acknowledges "as-is" condition; venue provides no warranty—express or implied.'

const unicodeSample = 'Teen Night: “curfew” applies after 10 PM — parents’ consent required. Items: • snacks … © Luxor.'

const lineBreakDoc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Line one' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Line two' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Line three' }] },
  ],
}

const boldDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Bold ', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'normal' },
      ],
    },
  ],
}

const bulletDoc = {
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Beta' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gamma' }] }] },
      ],
    },
  ],
}

const sampleDoc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Venue Use Agreement' }] },
    { type: 'paragraph', content: [{ type: 'text', text: sampleClause }] },
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
  const blocks = blocksFromTipTapJson(sampleDoc)
  const paragraph = blocks.find((block) => block.type === 'paragraph')
  assert.ok(paragraph)
  assert.equal(inlinesToPlainText(paragraph.inlines), sampleClause)
})

test('plain-text paste uses one paragraph per line', () => {
  const { normalizePastedPlainText } = compile('src/lib/luxorDocumentCreatorSanitize.ts', path.join(root, 'luxor-document-creator-sanitize.synthetic.cjs'))
  const { plainTextToTipTapDocument } = compile(
    'src/lib/luxorDocumentCreatorPaste.ts',
    path.join(root, 'luxor-document-creator-paste.synthetic.cjs'),
    {
      '@/lib/luxorDocumentCreatorSanitize': { normalizePastedPlainText },
      './luxorDocumentCreatorSanitize': { normalizePastedPlainText },
    },
  )
  const doc = plainTextToTipTapDocument('Alpha\nBeta\nGamma')
  assert.equal(doc.content.length, 3)
  assert.equal(doc.content[0].content[0].text, 'Alpha')
  assert.equal(doc.content[1].content[0].text, 'Beta')
  assert.equal(doc.content[2].content[0].text, 'Gamma')
  const formFeedDoc = plainTextToTipTapDocument('Before\fAfter')
  assert.equal(formFeedDoc.content.length, 2)
})

test('three-line document yields three bullet items', () => {
  const blocks = blocksFromTipTapJson(bulletDoc)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].type, 'bullet')
  assert.equal(blocks[0].items.length, 3)
})

test('wrap preserves logical newlines', async () => {
  const { wrapLuxorPdfPreservingBreaks } = compile(
    'src/lib/luxorCreatedDocumentPdfLayout.ts',
    path.join(root, 'luxor-created-document-pdf-layout.synthetic.cjs'),
    { 'server-only': {} },
  )
  const { PDFDocument, StandardFonts } = require('pdf-lib')
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const lines = wrapLuxorPdfPreservingBreaks('Line one\nLine two', font, 12, 400)
  assert.ok(lines.length >= 2)
  assert.equal(lines[0].includes('Line one'), true)
  assert.equal(lines.some((line) => line.includes('Line two')), true)
})

test('generated creator PDF embeds unicode and bold body text', async () => {
  const branding = compile('src/lib/luxorPdfBrandingServer.ts', path.join(root, 'luxor-pdf-branding.synthetic.cjs'), {
    './luxorVenue': { LUXOR_VENUE_ADDRESS: '3100 Voss Ave, Dallas, TX' },
    'server-only': {},
    'node:fs/promises': fs.promises,
    'fs/promises': fs.promises,
    path,
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
    './luxorVenue': { LUXOR_VENUE_ADDRESS: '3100 Voss Ave, Dallas, TX' },
    '@/lib/luxorVenue': { LUXOR_VENUE_ADDRESS: '3100 Voss Ave, Dallas, TX' },
  }
  const pdfPaginator = compile('src/lib/luxorCreatedDocumentPdfPaginator.ts', path.join(root, 'luxor-created-document-pdf-paginator.synthetic.cjs'), {
    ...sharedNodeStubs,
    './luxorPdfBrandingServer': branding,
    '@/lib/luxorPdfBrandingServer': branding,
  })
  const pdfLayout = compile('src/lib/luxorCreatedDocumentPdfLayout.ts', path.join(root, 'luxor-created-document-pdf-layout.synthetic.cjs'), sharedNodeStubs)
  const pdfRender = compile('src/lib/luxorDocumentCreatorPdfRender.ts', path.join(root, 'luxor-document-creator-pdf-render.synthetic.cjs'), {
    ...sharedNodeStubs,
    './luxorPdfBrandingServer': branding,
    '@/lib/luxorPdfBrandingServer': branding,
    './luxorCreatedDocumentPdfPaginator': pdfPaginator,
    '@/lib/luxorCreatedDocumentPdfPaginator': pdfPaginator,
    './luxorCreatedDocumentPdfLayout': pdfLayout,
    '@/lib/luxorCreatedDocumentPdfLayout': pdfLayout,
    './luxorCreatedDocumentPdfFontsServer': fonts,
    '@/lib/luxorCreatedDocumentPdfFontsServer': fonts,
    './luxorDocumentCreatorRenderNormalize': compile('src/lib/luxorDocumentCreatorRenderNormalize.ts', path.join(root, 'luxor-document-creator-render-normalize.synthetic.cjs'), sharedNodeStubs),
    '@/lib/luxorDocumentCreatorRenderNormalize': compile('src/lib/luxorDocumentCreatorRenderNormalize.ts', path.join(root, 'luxor-document-creator-render-normalize.synthetic.cjs'), sharedNodeStubs),
    './luxorDocumentCreatorVerbatim': { blocksFromTipTapJson, inlinesToPlainText, verbatimPlainTextFromTipTap },
    '@/lib/luxorDocumentCreatorVerbatim': { blocksFromTipTapJson, inlinesToPlainText, verbatimPlainTextFromTipTap },
  })
  const { buildLuxorCreatedDocumentPdf, extractRenderableBlocks } = compile(
    'src/lib/luxorDocumentCreatorPdfServer.ts',
    path.join(root, 'luxor-document-creator-pdf.synthetic.cjs'),
    {
      ...sharedNodeStubs,
      './luxorPdfBrandingServer': branding,
      '@/lib/luxorPdfBrandingServer': branding,
      './luxorCreatedDocumentPdfFontsServer': fonts,
      '@/lib/luxorCreatedDocumentPdfFontsServer': fonts,
      './luxorDocumentCreatorPdfRender': pdfRender,
      '@/lib/luxorDocumentCreatorPdfRender': pdfRender,
      './luxorCreatedDocumentPdfPaginator': pdfPaginator,
      '@/lib/luxorCreatedDocumentPdfPaginator': pdfPaginator,
      './luxorDocumentCreatorVerbatim': { blocksFromTipTapJson, inlinesToPlainText, verbatimPlainTextFromTipTap },
      '@/lib/luxorDocumentCreatorVerbatim': { blocksFromTipTapJson, inlinesToPlainText, verbatimPlainTextFromTipTap },
      './luxorDocumentCreatorTypes': compile('src/lib/luxorDocumentCreatorTypes.ts', path.join(root, 'luxor-document-creator-types.synthetic.cjs')),
      '@/lib/luxorDocumentCreatorTypes': compile('src/lib/luxorDocumentCreatorTypes.ts', path.join(root, 'luxor-document-creator-types.synthetic.cjs')),
    },
  )
  assert.equal(extractRenderableBlocks(lineBreakDoc).length, 3)
  assert.equal(extractRenderableBlocks(boldDoc)[0].type, 'paragraph')
  assert.ok(extractRenderableBlocks(boldDoc)[0].inlines.some((part) => part.kind === 'text' && part.bold))
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
  assert.ok(renderedPlain.includes('©'))
})

test('long creator PDF paginates and keeps the final paragraph', async () => {
  const branding = compile('src/lib/luxorPdfBrandingServer.ts', path.join(root, 'luxor-pdf-branding.synthetic.cjs'), {
    './luxorVenue': { LUXOR_VENUE_ADDRESS: '3100 Voss Ave, Dallas, TX' },
    'server-only': {},
    'node:fs/promises': fs.promises,
    'fs/promises': fs.promises,
    path,
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
    './luxorVenue': { LUXOR_VENUE_ADDRESS: '3100 Voss Ave, Dallas, TX' },
    '@/lib/luxorVenue': { LUXOR_VENUE_ADDRESS: '3100 Voss Ave, Dallas, TX' },
  }
  const pdfPaginator = compile('src/lib/luxorCreatedDocumentPdfPaginator.ts', path.join(root, 'luxor-created-document-pdf-paginator.synthetic.cjs'), {
    ...sharedNodeStubs,
    './luxorPdfBrandingServer': branding,
    '@/lib/luxorPdfBrandingServer': branding,
  })
  const pdfLayout = compile('src/lib/luxorCreatedDocumentPdfLayout.ts', path.join(root, 'luxor-created-document-pdf-layout.synthetic.cjs'), sharedNodeStubs)
  const pdfRender = compile('src/lib/luxorDocumentCreatorPdfRender.ts', path.join(root, 'luxor-document-creator-pdf-render.synthetic.cjs'), {
    ...sharedNodeStubs,
    './luxorPdfBrandingServer': branding,
    '@/lib/luxorPdfBrandingServer': branding,
    './luxorCreatedDocumentPdfPaginator': pdfPaginator,
    '@/lib/luxorCreatedDocumentPdfPaginator': pdfPaginator,
    './luxorCreatedDocumentPdfLayout': pdfLayout,
    '@/lib/luxorCreatedDocumentPdfLayout': pdfLayout,
    './luxorCreatedDocumentPdfFontsServer': fonts,
    '@/lib/luxorCreatedDocumentPdfFontsServer': fonts,
    './luxorDocumentCreatorRenderNormalize': compile('src/lib/luxorDocumentCreatorRenderNormalize.ts', path.join(root, 'luxor-document-creator-render-normalize.synthetic.cjs'), sharedNodeStubs),
    '@/lib/luxorDocumentCreatorRenderNormalize': compile('src/lib/luxorDocumentCreatorRenderNormalize.ts', path.join(root, 'luxor-document-creator-render-normalize.synthetic.cjs'), sharedNodeStubs),
    './luxorDocumentCreatorVerbatim': { blocksFromTipTapJson, inlinesToPlainText, verbatimPlainTextFromTipTap },
    '@/lib/luxorDocumentCreatorVerbatim': { blocksFromTipTapJson, inlinesToPlainText, verbatimPlainTextFromTipTap },
  })
  const { buildLuxorCreatedDocumentPdf } = compile('src/lib/luxorDocumentCreatorPdfServer.ts', path.join(root, 'luxor-document-creator-pdf-long.synthetic.cjs'), {
    ...sharedNodeStubs,
    './luxorPdfBrandingServer': branding,
    '@/lib/luxorPdfBrandingServer': branding,
    './luxorCreatedDocumentPdfFontsServer': fonts,
    '@/lib/luxorCreatedDocumentPdfFontsServer': fonts,
    './luxorDocumentCreatorPdfRender': pdfRender,
    '@/lib/luxorDocumentCreatorPdfRender': pdfRender,
    './luxorCreatedDocumentPdfPaginator': pdfPaginator,
    '@/lib/luxorCreatedDocumentPdfPaginator': pdfPaginator,
    './luxorDocumentCreatorVerbatim': { blocksFromTipTapJson, inlinesToPlainText, verbatimPlainTextFromTipTap },
    '@/lib/luxorDocumentCreatorVerbatim': { blocksFromTipTapJson, inlinesToPlainText, verbatimPlainTextFromTipTap },
    './luxorDocumentCreatorTypes': compile('src/lib/luxorDocumentCreatorTypes.ts', path.join(root, 'luxor-document-creator-types.synthetic.cjs')),
    '@/lib/luxorDocumentCreatorTypes': compile('src/lib/luxorDocumentCreatorTypes.ts', path.join(root, 'luxor-document-creator-types.synthetic.cjs')),
  })

  const content = Array.from({ length: 40 }, (_, index) => {
    const number = index + 1
    return {
      type: 'paragraph',
      content: [{
        type: 'text',
        text: `${number}. This is paragraph number ${number} with extra length to force wrapping across several words when rendered in the PDF pipeline for pagination tests and contract body simulation.`,
      }],
    }
  })
  const bodyJson = { type: 'doc', content }
  const pdfBytes = await buildLuxorCreatedDocumentPdf({
    title: 'Long Venue Agreement',
    documentType: 'venue_use_agreement',
    bodyJson,
  })
  const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs')
  const loaded = await getDocument({ data: pdfBytes, useSystemFonts: true }).promise
  assert.ok(loaded.numPages >= 3)
  let extracted = ''
  for (let pageNumber = 1; pageNumber <= loaded.numPages; pageNumber += 1) {
    const page = await loaded.getPage(pageNumber)
    const textContent = await page.getTextContent()
    extracted += `${textContent.items.map((item) => item.str).join(' ')} `
  }
  const normalizedExtracted = extracted.replace(/\s+/g, ' ').trim()
  assert.ok(normalizedExtracted.includes('paragraph number 40'))
  assert.ok(extracted.includes(`Page 1 of ${loaded.numPages}`))
  assert.ok(extracted.includes(`Page ${loaded.numPages} of ${loaded.numPages}`))
})

test('save conflict retry only when server content still matches snapshot', () => {
  const { shouldRetrySaveAfterConflict } = compile(
    'src/lib/luxorDocumentCreatorSaveClient.ts',
    path.join(root, 'luxor-document-creator-save-client.synthetic.cjs'),
    {
      './luxorDocumentCreatorTypes': compile('src/lib/luxorDocumentCreatorTypes.ts', path.join(root, 'luxor-document-creator-types.synthetic.cjs')),
      '@/lib/luxorDocumentCreatorTypes': compile('src/lib/luxorDocumentCreatorTypes.ts', path.join(root, 'luxor-document-creator-types.synthetic.cjs')),
    },
  )
  const bodyJson = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] }
  const snapshot = {
    title: 'Sample doc',
    documentType: 'venue_use_agreement',
    bodyJson,
    bodyHtml: '<p>Hello</p>',
    version: 2,
  }
  const pdfRefreshServer = {
    title: 'Sample doc',
    document_type: 'venue_use_agreement',
    body_json: bodyJson,
    body_html: '<p>Hello</p>',
    version: 2,
    updated_at: '2026-01-02T00:00:00.000Z',
    pdf_storage_path: 'created-documents/abc.pdf',
  }
  const editedServer = { ...pdfRefreshServer, title: 'Edited title' }
  assert.equal(shouldRetrySaveAfterConflict(snapshot, pdfRefreshServer), true)
  assert.equal(shouldRetrySaveAfterConflict(snapshot, editedServer), false)
})