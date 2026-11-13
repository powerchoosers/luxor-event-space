/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const routeDir = path.join(root, 'src/app/preferred-vendors-qa')
const routeFile = path.join(routeDir, 'page.tsx')
const port = Number(process.env.PREFERRED_VENDORS_QA_PORT || 3224)
const origin = `http://127.0.0.1:${port}`
const screenshotRoot = path.join('/opt/cursor/artifacts', 'preferred-vendors-qa')

const vendors = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    created_at: '2026-11-13T10:00:00Z',
    updated_at: '2026-11-13T10:00:00Z',
    archived_at: null,
    vendor_type: 'Security Crew',
    name: 'Copper Security Group',
    email: 'dispatch@csg.example',
    phone: '210-555-0100',
    rating: '4.8 ⭐',
    coi_active: false,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    created_at: '2026-11-13T10:05:00Z',
    updated_at: '2026-11-13T10:05:00Z',
    archived_at: null,
    vendor_type: 'Security Crew',
    name: 'Ibukun Oyelade (security)',
    email: null,
    phone: '682-555-0199',
    rating: null,
    coi_active: false,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    archived_at: null,
    vendor_type: 'DJs & Music',
    name: 'Fixture DJ Collective',
    email: 'bookings@dj.example',
    phone: '214-555-0111',
    rating: '5.0 ⭐',
    coi_active: true,
  },
]

async function waitForServer(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error(`Next dev server exited with ${child.exitCode}`)
    try {
      const response = await fetch(`${origin}/preferred-vendors-qa?tab=vendors`)
      if (response.ok || response.status < 500) return
    } catch {}
    await delay(500)
  }
  throw new Error('Timed out waiting for the temporary Next.js browser QA route.')
}

async function screenshot(page, name) {
  fs.mkdirSync(screenshotRoot, { recursive: true })
  const file = path.join(screenshotRoot, name)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

;(async () => {
  if (fs.existsSync(routeFile)) throw new Error(`Refusing to overwrite existing QA route: ${routeFile}`)
  fs.mkdirSync(routeDir, { recursive: true })
  fs.copyFileSync(path.join(__dirname, 'fixtures/preferred-vendors-browser-page.tsx'), routeFile)
  fs.copyFileSync(path.join(__dirname, 'fixtures/preferred-vendors-qa-layout.tsx'), path.join(routeDir, 'layout.tsx'))
  const server = spawn('npm', ['run', 'dev:webpack', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    stdio: 'ignore',
    detached: true,
  })
  let browser
  try {
    await waitForServer(server)
    browser = await chromium.launch({ args: ['--no-sandbox'] })
    const context = await browser.newContext()
    const page = await context.newPage()

    await page.route('**/api/operations', async (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            bills: [],
            billIntakes: [],
            invoiceAnalysisConfigured: false,
            resendReceivingConfigured: false,
            inventory: [],
            vendors,
            utilities: [],
            cleaning: [],
            tasks: [],
          }),
        })
      }
      if (method === 'POST') {
        const body = route.request().postDataJSON() || {}
        if (body.type === 'vendor') {
          const created = {
            id: '44444444-4444-4444-8444-444444444444',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            archived_at: null,
            vendor_type: body.vendor_type,
            name: body.name,
            email: body.email || null,
            phone: body.phone || null,
            rating: body.rating || null,
            coi_active: body.coi_active === true,
          }
          vendors.push(created)
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(created) })
        }
      }
      if (method === 'PATCH') {
        const body = route.request().postDataJSON() || {}
        const current = vendors.find((item) => item.id === body.id)
        if (current && body.type === 'vendor') {
          Object.assign(current, { ...body, updated_at: new Date().toISOString() })
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(current) })
        }
      }
      return route.fulfill({ status: 400, body: JSON.stringify({ error: 'Unsupported fixture request' }) })
    })

    await page.route('**/api/portal/realtime-config', async (route) => route.fulfill({ status: 200, body: '{}' }))
    await page.route('**/api/operations/archive', async (route) => route.fulfill({ status: 200, body: '{}' }))

    const themes = ['light', 'dark']
    const viewports = [
      { width: 1440, height: 1000, tag: 'desktop' },
      { width: 820, height: 1100, tag: 'ipad' },
      { width: 390, height: 900, tag: 'phone' },
    ]
    const shots = []

    for (const theme of themes) {
      for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto(`${origin}/preferred-vendors-qa?tab=vendors`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await page.evaluate((value) => {
          document.documentElement.setAttribute('data-portal-theme', value)
          document.body.setAttribute('data-portal-theme', value)
        }, theme)
        await page.getByRole('heading', { name: /preferred vendors/i }).waitFor({ timeout: 20000 })
        assert.ok(await page.getByRole('button', { name: /Copper Security Group/i }).isVisible())
        assert.ok(await page.getByRole('button', { name: /Ibukun Oyelade/i }).isVisible())
        assert.ok(await page.getByText('COI pending').first().isVisible())
        shots.push(await screenshot(page, `${viewport.tag}-${theme}.png`))
      }
    }

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${origin}/preferred-vendors-qa?tab=vendors`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.getByRole('heading', { name: /preferred vendors/i }).waitFor({ timeout: 20000 })
    await page.getByPlaceholder(/search name/i).fill('Copper')
    await page.waitForTimeout(200)
    assert.ok(await page.getByRole('button', { name: /Copper Security Group/i }).isVisible())
    assert.equal(await page.getByRole('button', { name: /Fixture DJ Collective/i }).count(), 0)

    await page.getByPlaceholder(/search name/i).fill('')
    const filterToggle = page.getByLabel(/filter options/i)
    await filterToggle.click()
    await page.getByRole('button', { name: 'Vendor type' }).click()
    await page.getByRole('option', { name: 'Security Crew' }).click()
    assert.ok(await page.getByRole('button', { name: /Copper Security Group/i }).isVisible())
    assert.equal(await page.getByRole('button', { name: /Fixture DJ Collective/i }).count(), 0)

    await page.getByRole('button', { name: 'Vendor type' }).click()
    await page.getByRole('option', { name: 'All vendor types' }).click()
    await page.getByRole('button', { name: /add vendor/i }).first().click()
    await page.getByRole('button', { name: /utilities/i }).last().click()
    await page.getByRole('option', { name: 'Photographers' }).click()
    await page.getByPlaceholder('e.g. Prestige Valet Co.').fill('Fixture Added Vendor')
    await page.getByRole('button', { name: 'Add vendor', exact: true }).click()
    await page.getByRole('button', { name: /Fixture Added Vendor/i }).waitFor({ timeout: 10000 })

    await page.getByRole('button', { name: /Fixture Added Vendor/i }).click()
    await page.getByRole('heading', { name: /edit preferred vendor/i }).waitFor({ timeout: 10000 })
    await page.getByRole('heading', { name: /edit preferred vendor/i }).locator('xpath=ancestor::*[@role="dialog"][1]//input[@type="text"][1]').fill('Fixture Updated Vendor')
    await page.getByRole('button', { name: 'Save Changes' }).click()
    await page.getByRole('button', { name: /Fixture Updated Vendor/i }).waitFor({ timeout: 10000 })

    console.log(JSON.stringify({ ok: true, screenshots: shots }, null, 2))
  } finally {
    if (browser) await browser.close()
    if (routeFile && fs.existsSync(routeFile)) fs.rmSync(routeDir, { recursive: true, force: true })
    if (server?.pid) {
      try {
        process.kill(-server.pid)
      } catch {}
    }
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
