/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const routeDir = path.join(root, 'src/app/developer-support-card-qa')
const routeFile = path.join(routeDir, 'page.tsx')
const layoutFile = path.join(routeDir, 'layout.tsx')
const port = Number(process.env.DEVELOPER_SUPPORT_CARD_QA_PORT || 3225)
const origin = `http://127.0.0.1:${port}`
const artifactRoot = path.join('/opt/cursor/artifacts', 'developer-support-card-e2e')
const QA_SESSION_ID = '00000000-0000-4000-8000-000000000111'

const INITIAL_CARD = {
  title: 'Lead inbox refresh spinner never clears',
  description: 'On /portal/leads the header refresh spins for 30+ seconds. Expected completed tasks to update without a full page reload.',
  priority: 'high',
  pagePath: '/portal/leads',
}

function installRoute() {
  if (fs.existsSync(routeDir)) throw new Error(`Refusing to overwrite existing route: ${routeDir}`)
  fs.mkdirSync(routeDir, { recursive: true })
  fs.copyFileSync(path.join(__dirname, 'fixtures/developer-support-card-browser-page.tsx'), routeFile)
  fs.copyFileSync(path.join(__dirname, 'fixtures/developer-support-card-qa-layout.tsx'), layoutFile)
}

function removeRoute() {
  if (fs.existsSync(routeDir)) fs.rmSync(routeDir, { recursive: true, force: true })
}

async function waitForServer(child) {
  for (let i = 0; i < 240; i += 1) {
    if (child.exitCode !== null) throw new Error(`Next server exited with ${child.exitCode}`)
    try {
      const response = await fetch(`${origin}/developer-support-card-qa`)
      if (response.ok) return
    } catch {}
    await delay(1000)
  }
  throw new Error('Timed out waiting for local Next.js server.')
}

function redactPatchBody(body) {
  const clone = JSON.parse(JSON.stringify(body))
  for (const message of clone.messages || []) {
    if (message.confirmation) delete message.confirmation
    if (message.developerSupportCard?.savedAttachments) {
      message.developerSupportCard.savedAttachments = (message.developerSupportCard.savedAttachments || []).map((item) => ({
        name: item.name,
        type: item.type,
        kind: item.kind,
        storagePath: item.storagePath ? '(redacted)' : undefined,
        textContent: item.textContent ? '(redacted)' : undefined,
      }))
    }
  }
  return clone
}

function assertSubmittedPatchBody(body) {
  assert.equal(body.id, QA_SESSION_ID)
  assert.ok(Array.isArray(body.messages))
  const card = body.messages.find((message) => message.developerSupportCard)?.developerSupportCard
  assert.ok(card, 'PATCH body must include developerSupportCard')
  const submitted = card.submitted
  assert.ok(submitted?.submittedAt, 'submitted.submittedAt required')
  assert.equal(submitted.title, INITIAL_CARD.title)
  assert.equal(submitted.priority, INITIAL_CARD.priority)
  assert.equal(submitted.pagePath, INITIAL_CARD.pagePath)
  assert.equal(typeof submitted.attachmentCount, 'number')
}

function transcodeToH264(webmPath, mp4Path) {
  const result = spawnSync('ffmpeg', [
    '-y',
    '-i',
    webmPath,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    mp4Path,
  ], { stdio: 'pipe' })
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed:\n${result.stderr?.toString() || ''}`)
  }
}

function attachIssueCollectors(page, bucket) {
  const push = (phase, kind, text) => {
    bucket.push({ phase, kind, text: String(text) })
  }
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      push('console', msg.type(), msg.text())
    }
  })
  page.on('pageerror', (error) => {
    push('runtime', 'pageerror', error.message)
  })
}

async function captureNextDevOverlay(page, phase, bucket) {
  const issueButton = page.locator('button[aria-label*="Issue"], button[data-issues-count]').first()
  const hasButton = await issueButton.isVisible().catch(() => false)
  if (!hasButton) return
  const label = await issueButton.getAttribute('aria-label').catch(() => null)
  if (label) bucket.push({ phase, kind: 'next-devtools', text: label })
  await issueButton.click({ timeout: 5000 }).catch(() => undefined)
  await delay(400)
  const overlayText = await page.evaluate(() => {
    const portal = document.querySelector('nextjs-portal')
    if (!portal?.shadowRoot) return null
    return portal.shadowRoot.textContent?.trim() || null
  }).catch(() => null)
  if (overlayText) {
    const condensed = overlayText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 40)
      .join('\n')
    bucket.push({ phase, kind: 'next-overlay', text: condensed.slice(0, 4000) })
  }
  const shot = path.join(artifactRoot, `next-dev-overlay-${phase}.png`)
  await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined)
}

function writeIssueReport(issues) {
  fs.mkdirSync(artifactRoot, { recursive: true })
  const seen = new Set()
  const unique = []
  for (const item of issues) {
    const line = `[${item.phase}] ${item.kind}: ${item.text}`
    if (seen.has(line)) continue
    seen.add(line)
    unique.push(line)
  }
  const file = path.join(artifactRoot, 'next-dev-overlay-errors.txt')
  fs.writeFileSync(file, `${unique.join('\n')}\n`)
  return file
}

async function screenshotCard(page, name) {
  fs.mkdirSync(artifactRoot, { recursive: true })
  const file = path.join(artifactRoot, name)
  await page.locator('[data-qa-card-host]').screenshot({ path: file })
  return file
}

async function installApiMocks(page, state) {
  await page.route('**/api/portal/elena-chat/actions', async (route) => {
    const request = route.request()
    if (request.method() !== 'POST') return route.continue()
    const body = request.postDataJSON() || {}
    if (body.action === 'PREPARE_DEVELOPER_SUPPORT') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          confirmation: {
            token: 'qa.developer-support.confirmation',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            summary: 'Send developer support ticket as Arianna Patterson',
            reporterName: 'Arianna Patterson',
          },
        }),
      })
    }
    if (body.action === 'CONFIRM_DEVELOPER_SUPPORT') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          result: {
            confirmation_id: '11111111-1111-4111-8111-111111111111',
            dispatch: { runUuid: 'qa-run-uuid', backgroundComposerId: null },
          },
        }),
      })
    }
    return route.fulfill({ status: 400, body: JSON.stringify({ error: 'Unexpected QA action' }) })
  })

  await page.route('**/api/portal/elena-chat/sessions**', async (route) => {
    const request = route.request()
  const method = request.method()
    const url = new URL(request.url())
    if (method === 'PATCH') {
      const body = request.postDataJSON() || {}
      state.session = {
        id: body.id || QA_SESSION_ID,
        messages: body.messages || [],
      }
      const card = body.messages?.find((message) => message.developerSupportCard)?.developerSupportCard
      if (card?.submitted) {
        assertSubmittedPatchBody(body)
        const redacted = redactPatchBody(body)
        fs.mkdirSync(artifactRoot, { recursive: true })
        fs.writeFileSync(path.join(artifactRoot, 'persisted-patch-redacted.json'), `${JSON.stringify(redacted, null, 2)}\n`)
        state.lastPatch = body
      }
      fs.mkdirSync(artifactRoot, { recursive: true })
      fs.writeFileSync(path.join(artifactRoot, 'mock-session-store.json'), `${JSON.stringify(state.session, null, 2)}\n`)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    }
    if (method === 'GET' && url.searchParams.get('id') === QA_SESSION_ID) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: QA_SESSION_ID,
          messages: state.session.messages,
        }),
      })
    }
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    }
    return route.continue()
  })
}

function resetSessionState() {
  return {
    session: {
      id: QA_SESSION_ID,
      messages: [{ role: 'assistant', content: 'QA fixture', developerSupportCard: { ...INITIAL_CARD } }],
    },
    lastPatch: null,
  }
}

async function waitHydrated(page) {
  await page.locator('[data-qa-hydrated="true"]').waitFor({ timeout: 30000 })
}

async function sendTicket(page, { reducedMotion }) {
  await page.getByRole('button', { name: 'Reset card' }).click()
  await waitHydrated(page)
  await page.getByText('Sends a fix to Braxton in the cloud').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Review ticket' }).click()
  await page.getByRole('button', { name: 'Send to developer' }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Send to developer' }).click()
  await page.getByText('Ticket sent — view only').waitFor({ timeout: 20000 })
  await page.getByText('With the team').waitFor({ timeout: 20000 })
  await delay(reducedMotion ? 120 : 650)
}

async function runScenario(page, state, issues, { theme, width, suffix, reducedMotion = false }) {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  state.session = resetSessionState().session
  await page.goto(`${origin}/developer-support-card-qa`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.locator(`[data-qa-theme="${theme}"]`).click()
  await page.evaluate((value) => {
    document.body.setAttribute('data-portal-theme', value)
  }, theme)
  await waitHydrated(page)
  await captureNextDevOverlay(page, `initial-${theme}-${width}${suffix}`, issues)

  const shots = []
  await page.getByRole('button', { name: 'Reset card' }).click()
  await waitHydrated(page)
  await page.getByText('Sends a fix to Braxton in the cloud').waitFor({ timeout: 30000 })
  shots.push(await screenshotCard(page, `editable-${theme}-${width}${suffix}.png`))
  await sendTicket(page, { reducedMotion })
  await captureNextDevOverlay(page, `after-send-${theme}-${width}${suffix}`, issues)
  assert.ok(state.lastPatch, 'Expected sessions PATCH after send')
  shots.push(await screenshotCard(page, `submitted-${theme}-${width}${suffix}.png`))
  await page.reload({ waitUntil: 'networkidle', timeout: 120000 })
  await waitHydrated(page)
  await page.locator(`[data-qa-theme="${theme}"]`).click()
  await page.evaluate((value) => {
    document.body.setAttribute('data-portal-theme', value)
  }, theme)
  await page.getByText('Ticket sent — view only').waitFor({ timeout: 20000 })
  shots.push(await screenshotCard(page, `reloaded-${theme}-${width}${suffix}.png`))
  assert.equal(await page.getByRole('button', { name: 'Review ticket' }).count(), 0)
  return shots
}

async function recordFlowVideo(browser, state, issues, { theme, width, reducedMotion, fileName }) {
  fs.mkdirSync(artifactRoot, { recursive: true })
  const context = await browser.newContext({
    recordVideo: { dir: artifactRoot, size: { width, height: 720 } },
    viewport: { width, height: 720 },
  })
  const page = await context.newPage()
  attachIssueCollectors(page, issues)
  await installApiMocks(page, state)
  let webmPath = null
  try {
    await runScenario(page, state, issues, { theme, width, suffix: reducedMotion ? '-reduced-motion' : '-motion', reducedMotion })
  } finally {
    const video = page.video()
    if (video) webmPath = await video.path().catch(() => null)
    await context.close()
  }
  if (webmPath && fs.existsSync(webmPath)) {
    const mp4Path = path.join(artifactRoot, fileName)
    transcodeToH264(webmPath, mp4Path)
    try {
      fs.unlinkSync(webmPath)
    } catch {}
    return mp4Path
  }
  return null
}

;(async () => {
  installRoute()
  let server
  let browser
  const artifacts = { screenshots: [], videos: [], issuesReport: null, persistedPatch: null }
  const issues = []
  const state = resetSessionState()
  try {
    server = spawn('npm', ['run', 'dev:webpack', '--', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: root,
      stdio: 'ignore',
      detached: true,
      env: { ...process.env, PORT: String(port), NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
    })
    await waitForServer(server)

    browser = await chromium.launch({ args: ['--no-sandbox'] })
    const page = await browser.newPage()
    attachIssueCollectors(page, issues)
    await installApiMocks(page, state)

    for (const theme of ['light', 'dark']) {
      for (const width of [390, 820, 1280]) {
        const shots = await runScenario(page, state, issues, { theme, width, suffix: '' })
        artifacts.screenshots.push(...shots)
      }
    }

    artifacts.videos.push(await recordFlowVideo(browser, resetSessionState(), issues, {
      theme: 'light',
      width: 1280,
      reducedMotion: false,
      fileName: 'developer-support-send-flow-light-1280.mp4',
    }))
    artifacts.videos.push(await recordFlowVideo(browser, resetSessionState(), issues, {
      theme: 'dark',
      width: 390,
      reducedMotion: true,
      fileName: 'developer-support-send-flow-dark-390-reduced-motion.mp4',
    }))

    artifacts.issuesReport = writeIssueReport(issues)
    artifacts.persistedPatch = path.join(artifactRoot, 'persisted-patch-redacted.json')
    fs.writeFileSync(path.join(artifactRoot, 'manifest.json'), JSON.stringify(artifacts, null, 2))
    process.stdout.write(`${JSON.stringify(artifacts, null, 2)}\n`)
  } finally {
    if (browser) await browser.close()
    if (server && server.pid) {
      try {
        process.kill(-server.pid, 'SIGTERM')
      } catch {}
    }
    removeRoute()
  }
})().catch((error) => {
  removeRoute()
  console.error(error)
  process.exit(1)
})