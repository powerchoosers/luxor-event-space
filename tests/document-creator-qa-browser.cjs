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
      await page.waitForTimeout(2500)
      await screenshot(page, scenario.name)
      await page.close()
    }
  } finally {
    await browser.close()
  }
})