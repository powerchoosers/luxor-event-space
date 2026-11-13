/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const routeDir = path.join(root, 'src/app/preferred-vendors-qa')
const routeFile = path.join(routeDir, 'page.tsx')
const layoutFile = path.join(routeDir, 'layout.tsx')
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

function installRoute() {
  if (fs.existsSync(routeDir)) throw new Error(`Refusing to overwrite existing route: ${routeDir}`)
  fs.mkdirSync(routeDir, { recursive: true })
  fs.copyFileSync(path.join(__dirname, 'fixtures/preferred-vendors-browser-page.tsx'), routeFile)
  fs.copyFileSync(path.join(__dirname, 'fixtures/preferred-vendors-qa-layout.tsx'), layoutFile)
}

function removeRoute() {
  if (fs.existsSync(routeDir)) fs.rmSync(routeDir, { recursive: true, force: true })
}

async function waitForServer(child) {
  for (let i = 0; i < 180; i += 1) {
    if (child.exitCode !== null) throw new Error(`Production server exited with ${child.exitCode}`)
    try {
      const response = await fetch(`${origin}/preferred-vendors-qa?tab=vendors`)
      if (response.ok) return
    } catch {}
    await delay(1000)
  }
  throw new Error('Timed out waiting for production Next.js server.')
}

async function screenshot(page, name) {
  fs.mkdirSync(screenshotRoot, { recursive: true })
  const file = path.join(screenshotRoot, name)
  await page.screenshot({ path: file, fullPage: true })
  return file
}

async function assertStyledPortal(page) {
  const goldCount = await page.locator('.luxor-gold-raised').count()
  assert.ok(goldCount > 0, 'Expected styled portal surfaces (luxor-gold-raised)')
  const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily.toLowerCase())
  assert.match(fontFamily, /manrope/, 'Expected Manrope portal font')
}

;(async () => {
  installRoute()
  let server
  let browser
  let serverMode = 'production'
  try {
    const envFromFile = path.join('/tmp', 'luxor-build.env')
    if (fs.existsSync(envFromFile)) {
      for (const line of fs.readFileSync(envFromFile, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eq = trimmed.indexOf('=')
        if (eq <= 0) continue
        process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^"|"$/g, '')
      }
    }

  const canBuild = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
    if (canBuild) {
      const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'pipe', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
      if (build.status !== 0) {
        const output = `${build.stdout || ''}\n${build.stderr || ''}`
        throw new Error(`Production build failed:\n${output.slice(-4000)}`)
      }
      server = spawn('npm', ['run', 'start', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
        cwd: root,
        stdio: 'ignore',
        detached: true,
        env: { ...process.env, PORT: String(port), NODE_ENV: 'production' },
      })
    } else {
      serverMode = 'development'
      server = spawn('npm', ['run', 'dev:webpack', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
        cwd: root,
        stdio: 'ignore',
        detached: true,
        env: { ...process.env, PORT: String(port), NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
      })
    }

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
        await page.goto(`${origin}/preferred-vendors-qa?tab=vendors`, { waitUntil: 'load', timeout: 120000 })
        await page.evaluate((value) => {
          document.documentElement.setAttribute('data-portal-theme', value)
          document.body.setAttribute('data-portal-theme', value)
        }, theme)
        await page.getByRole('heading', { name: 'Preferred vendors', exact: true }).waitFor({ timeout: 30000 })
        await assertStyledPortal(page)
        const browseTriggers = await page.getByRole('button', { name: /Browse views/i }).count()
        if (viewport.tag === 'desktop') {
          assert.equal(browseTriggers, 0, 'Desktop should not show Browse views triggers')
        } else if (viewport.tag === 'ipad') {
          assert.equal(browseTriggers, 1, 'Tablet should show one Browse views trigger')
        } else {
          assert.equal(browseTriggers, 1, 'Phone should show one Browse views trigger')
        }
        assert.ok(await page.getByRole('button', { name: /Copper Security Group/i }).isVisible())
        shots.push(await screenshot(page, `${viewport.tag}-${theme}.png`))
      }
    }

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${origin}/preferred-vendors-qa?tab=vendors`, { waitUntil: 'load', timeout: 120000 })
    await page.getByPlaceholder(/search name/i).fill('Copper')
    await delay(250)
    assert.ok(await page.getByRole('button', { name: /Copper Security Group/i }).isVisible())
    assert.equal(await page.getByRole('button', { name: /Fixture DJ Collective/i }).count(), 0)

    await page.getByPlaceholder(/search name/i).fill('')
    await page.getByLabel(/filter options/i).click()
    await page.getByRole('button', { name: 'Vendor type' }).click()
    await page.getByRole('option', { name: 'Security Crew' }).click()
    assert.ok(await page.getByRole('button', { name: /Copper Security Group/i }).isVisible())

    await page.getByRole('button', { name: /add vendor/i }).first().click()
    await page.getByRole('dialog', { name: /add preferred vendor/i }).waitFor({ timeout: 10000 })
  await page.keyboard.press('Escape')

    await page.getByRole('button', { name: /Copper Security Group/i }).click()
    const editDialog = page.getByRole('dialog', { name: /edit preferred vendor/i })
    await editDialog.waitFor({ timeout: 10000 })
    await editDialog.locator('input[type="text"]').first().fill('Copper Security Group QA')
    await editDialog.getByRole('button', { name: 'Save Changes' }).click()
    await page.getByRole('button', { name: /Copper Security Group QA/i }).waitFor({ timeout: 10000 })
    vendors.find((item) => item.id === '11111111-1111-4111-8111-111111111111').name = 'Copper Security Group'

    console.log(JSON.stringify({ ok: true, serverMode, screenshots: shots }, null, 2))
  } finally {
    if (browser) await browser.close()
    removeRoute()
    if (server?.pid) {
      try { process.kill(-server.pid) } catch {}
    }
  }
})().catch((error) => {
  removeRoute()
  console.error(error)
  process.exit(1)
})
