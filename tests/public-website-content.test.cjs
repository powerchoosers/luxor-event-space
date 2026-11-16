/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')

function loadTypeScript(filePath) {
  const source = fs.readFileSync(path.join(root, filePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = new Module(path.join(root, `${path.basename(filePath)}.synthetic.cjs`), module)
  loaded.filename = path.join(root, `${path.basename(filePath)}.synthetic.cjs`)
  loaded.paths = module.paths
  loaded._compile(js, loaded.filename)
  return loaded.exports
}

const {
  parseWebsiteContent,
  resolvePublicHeroButtonLabel,
  isValidPublicActionsPayload,
  HERO_BUTTON_TEXT_MAX,
} = loadTypeScript('src/lib/publicWebsiteContent.ts')

const validPayload = {
  hero: 'packages',
  other: 'brochure',
  headline: 'Headline',
  introduction: 'Introduction copy.',
}

test('resolvePublicHeroButtonLabel keeps legacy defaults when heroText is missing', () => {
  assert.equal(resolvePublicHeroButtonLabel('brochure'), 'Get your free venue brochure.')
  assert.equal(resolvePublicHeroButtonLabel('packages'), 'Explore packages')
  assert.equal(resolvePublicHeroButtonLabel('visit'), 'Schedule a visit')
})

test('resolvePublicHeroButtonLabel uses custom hero text when provided', () => {
  assert.equal(resolvePublicHeroButtonLabel('packages', 'BUILD YOUR LUXOR EXPERIENCE'), 'BUILD YOUR LUXOR EXPERIENCE')
  assert.equal(resolvePublicHeroButtonLabel('brochure', '   '), 'Get your free venue brochure.')
})

test('parseWebsiteContent keeps working without heroText', () => {
  const parsed = parseWebsiteContent({ hero: 'visit', other: 'packages', headline: 'Hi', introduction: 'There' })
  assert.equal(parsed.hero, 'visit')
  assert.equal(parsed.other, 'packages')
  assert.equal(parsed.heroText, undefined)
})

test('parseWebsiteContent reads heroText when valid', () => {
  const parsed = parseWebsiteContent({ ...validPayload, heroText: ' BUILD YOUR LUXOR EXPERIENCE ' })
  assert.equal(parsed.heroText, 'BUILD YOUR LUXOR EXPERIENCE')
})

test('isValidPublicActionsPayload accepts optional heroText and rejects unknown keys', () => {
  assert.equal(isValidPublicActionsPayload(validPayload), true)
  assert.equal(isValidPublicActionsPayload({ ...validPayload, heroText: '' }), true)
  assert.equal(
    isValidPublicActionsPayload({ ...validPayload, heroText: 'BUILD YOUR LUXOR EXPERIENCE' }),
    true,
  )
  assert.equal(
    isValidPublicActionsPayload({ ...validPayload, heroText: 'x'.repeat(HERO_BUTTON_TEXT_MAX) }),
    true,
  )
  assert.equal(
    isValidPublicActionsPayload({ ...validPayload, heroText: 'x'.repeat(HERO_BUTTON_TEXT_MAX + 1) }),
    false,
  )
  assert.equal(isValidPublicActionsPayload({ ...validPayload, extra: 'nope' }), false)
})