/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { chromium } = require('playwright')
const path = require('node:path')
const fs = require('node:fs')

const root = path.resolve(__dirname, '..')
const artifacts = '/opt/cursor/artifacts'
const baseUrl = process.env.DOCUMENT_CREATOR_QA_URL || 'http://localhost:3000/layout-review/document-creator-qa'

async function screenshot(page, name) {
  const file = path.join(artifacts, `${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  assert.ok(fs.existsSync(file))
}

test('document creator QA harness screenshots', { timeout: 180_000 }, async () => {
  fs.mkdirSync(artifacts, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  try {
    const contexts = [
      { name: 'signer-390', view: 'signer', viewport: '390', width: 390, height: 900, theme: null },
      { name: 'signer-1440', view: 'signer', viewport: '1440', width: 1440, height: 900, theme: null },
      { name: 'fields-1440-light', view: 'fields', viewport: '1440', width: 1440, height: 900, theme: 'light' },
      { name: 'fields-1440-dark', view: 'fields', viewport: '1440', width: 1440, height: 900, theme: 'dark' },
    ]
    for (const scenario of contexts) {
      const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height } })
      await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 120_000 })
      if (scenario.view === 'fields') await page.getByRole('button', { name: 'Fields step' }).click()
      if (scenario.viewport === '390') await page.getByRole('button', { name: '390px' }).click()
      if (scenario.viewport === '1440') await page.getByRole('button', { name: '1440px' }).click()
      if (scenario.theme === 'dark' && scenario.view === 'fields') {
        const themeToggle = page.getByRole('button', { name: /Portal dark/i })
        if (await themeToggle.isVisible()) await themeToggle.click()
      }
      if (scenario.view === 'signer' && scenario.viewport === '390') {
        const name = page.getByRole('textbox', { name: 'Printed name' })
        const email = page.getByRole('textbox', { name: 'Email' })
        await name.waitFor({ timeout: 60_000 })
        await email.fill('qa.test@example.com')
        await name.fill('QA Test Signer')
        await email.blur()
        await page.waitForTimeout(300)
        for (const locator of [name, email]) {
          const fit = await locator.evaluate((node) => ({
            fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
            transform: getComputedStyle(node).transform,
            scrollWidth: node.scrollWidth,
            clientWidth: node.clientWidth,
          }))
          assert.ok(fit.fontSize >= 16, `expected overlay font at least 16px so iOS does not zoom, got ${fit.fontSize}`)
          assert.ok(fit.transform !== 'none', 'expected a scale transform to fit the overlay')
          assert.ok(fit.scrollWidth <= fit.clientWidth + 1, `text overflows ${fit.scrollWidth} > ${fit.clientWidth}`)
        }
        await screenshot(page, 'signer-390-field-fit')
      }
      if (scenario.view === 'fields' && scenario.viewport === '1440') {
        await page.waitForSelector('[data-pdf-page-canvas]', { timeout: 60_000 })
        const before = await page.locator('[data-layout-field-overlay]').count()
        const palette = page.getByTestId('palette-field-text')
        const canvas = page.locator('[data-pdf-page-canvas]').first()
        const paletteBox = await palette.boundingBox()
        const canvasBox = await canvas.boundingBox()
        assert.ok(paletteBox && canvasBox)
        await page.mouse.move(paletteBox.x + paletteBox.width / 2, paletteBox.y + paletteBox.height / 2)
        await page.mouse.down()
        await page.mouse.move(canvasBox.x + canvasBox.width * 0.35, canvasBox.y + canvasBox.height * 0.45, { steps: 12 })
        await page.mouse.up()
        await page.waitForTimeout(400)
        const after = await page.locator('[data-layout-field-overlay]').count()
        assert.equal(after, before + 1)
      }
      await page.waitForTimeout(2500)
      await screenshot(page, scenario.name)
      await page.close()
    }
  } finally {
    await browser.close()
  }
})

test('palette click and touch tap arm click-to-place', { timeout: 180_000 }, async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true })
    const page = await desktop.newPage()
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 120_000 })
    await page.getByRole('button', { name: 'Fields step' }).click()
    await page.getByRole('button', { name: '1440px' }).click()
    await page.waitForSelector('[data-pdf-page-canvas]', { timeout: 60_000 })
    const palette = page.getByTestId('palette-field-email')
    const canvas = page.locator('[data-pdf-page-canvas]').first()
    const before = await page.locator('[data-layout-field-overlay]').count()
    await palette.click()
    await page.getByText(/Click on the PDF to place/i).waitFor()
    const box = await canvas.boundingBox()
    assert.ok(box)
    await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.3)
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-layout-field-overlay]').count(), before + 1)

    const touchBefore = await page.locator('[data-layout-field-overlay]').count()
    const paletteBox = await page.getByTestId('palette-field-text').boundingBox()
    assert.ok(paletteBox)
    await page.touchscreen.tap(paletteBox.x + paletteBox.width / 2, paletteBox.y + paletteBox.height / 2)
    await page.getByText(/Click on the PDF to place a Text/i).waitFor()
    await page.touchscreen.tap(box.x + box.width * 0.55, box.y + box.height * 0.55)
    await page.waitForTimeout(300)
    assert.equal(await page.locator('[data-layout-field-overlay]').count(), touchBefore + 1)
    await desktop.close()
  } finally {
    await browser.close()
  }
})