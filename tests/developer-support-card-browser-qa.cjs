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

async function screenshotCard(page, name) {
  fs.mkdirSync(artifactRoot, { recursive: true })
  const file = path.join(artifactRoot, name)
  await page.locator('[data-qa-card-host]').screenshot({ path: file })
  return file
}

async function sendTicket(page, { reducedMotion }) {
  await page.getByRole('button', { name: 'Reset card' }).click()
  await page.getByText('Sends a fix to Braxton in the cloud').waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'Review ticket' }).click()
  await page.getByRole('button', { name: 'Send to developer' }).waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Send to developer' }).click()
  await page.getByText('Ticket sent — view only').waitFor({ timeout: 20000 })
  await page.getByText('With the team').waitFor({ timeout: 20000 })
  await delay(reducedMotion ? 120 : 650)
}

async function runScenario(page, { theme, width, suffix, reducedMotion = false }) {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
  await page.goto(`${origin}/developer-support-card-qa`, { waitUntil: 'networkidle', timeout: 120000 })
  await page.locator(`[data-qa-theme="${theme}"]`).click()
  await page.evaluate((value) => {
    document.body.setAttribute('data-portal-theme', value)
  }, theme)
  await page.getByRole('button', { name: 'Reset card' }).click()
  await page.getByText('Sends a fix to Braxton in the cloud').waitFor({ timeout: 30000 })

  const shots = []
  shots.push(await screenshotCard(page, `editable-${theme}-${width}${suffix}.png`))
  await sendTicket(page, { reducedMotion })
  shots.push(await screenshotCard(page, `submitted-${theme}-${width}${suffix}.png`))
  await page.locator('[data-qa-reload]').click()
  await page.getByText('Ticket sent — view only').waitFor({ timeout: 20000 })
  shots.push(await screenshotCard(page, `reloaded-${theme}-${width}${suffix}.png`))
  assert.equal(await page.getByRole('button', { name: 'Review ticket' }).count(), 0)
  return shots
}

async function recordFlowVideo(browser, { theme, width, reducedMotion, fileName }) {
  fs.mkdirSync(artifactRoot, { recursive: true })
  const context = await browser.newContext({
    recordVideo: { dir: artifactRoot, size: { width, height: 720 } },
    viewport: { width, height: 720 },
  })
  const page = await context.newPage()
  try {
    await runScenario(page, { theme, width, suffix: reducedMotion ? '-reduced-motion' : '-motion', reducedMotion })
  } finally {
    await context.close()
    const videoPath = await page.video()?.path()
    if (videoPath && fs.existsSync(videoPath)) {
      const target = path.join(artifactRoot, fileName)
      fs.copyFileSync(videoPath, target)
      return target
    }
  }
  return null
}

;(async () => {
  installRoute()
  let server
  let browser
  const artifacts = { screenshots: [], videos: [] }
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

    for (const theme of ['light', 'dark']) {
      for (const width of [390, 1280]) {
        const shots = await runScenario(page, { theme, width, suffix: '' })
        artifacts.screenshots.push(...shots)
      }
    }

    artifacts.videos.push(await recordFlowVideo(browser, {
      theme: 'light',
      width: 1280,
      reducedMotion: false,
      fileName: 'developer-support-send-flow-light-1280.mp4',
    }))
    artifacts.videos.push(await recordFlowVideo(browser, {
      theme: 'dark',
      width: 390,
      reducedMotion: true,
      fileName: 'developer-support-send-flow-dark-390-reduced-motion.mp4',
    }))

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