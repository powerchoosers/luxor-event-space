/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const routeDir = path.join(root, 'src/app/portal-call-transcript-qa')
const routeFile = path.join(routeDir, 'page.tsx')
const port = Number(process.env.PORTAL_CALL_TRANSCRIPT_QA_PORT || 3227)
const origin = `http://127.0.0.1:${port}`
const artifactDir = '/opt/cursor/artifacts'

function installRoute() {
  if (fs.existsSync(routeDir)) fs.rmSync(routeDir, { recursive: true, force: true })
  fs.mkdirSync(routeDir, { recursive: true })
  fs.copyFileSync(path.join(__dirname, 'fixtures/portal-call-transcript-preview.tsx'), path.join(routeDir, 'TranscriptPreview.tsx'))
  fs.writeFileSync(routeFile, `import TranscriptPreview from './TranscriptPreview'

export default function Page({ searchParams }: { searchParams: { theme?: string } }) {
  const theme = searchParams.theme === 'dark' ? 'dark' : 'light'
  return <TranscriptPreview theme={theme} />
}
`, 'utf8')
}

function removeRoute() {
  if (fs.existsSync(routeDir)) fs.rmSync(routeDir, { recursive: true, force: true })
}

async function waitForServer(child) {
  for (let i = 0; i < 180; i += 1) {
    if (child.exitCode !== null) throw new Error(`Next server exited with ${child.exitCode}`)
    try {
      const response = await fetch(`${origin}/portal-call-transcript-qa?theme=light`)
      if (response.ok) return
    } catch {}
    await delay(1000)
  }
  throw new Error('Timed out waiting for Next.js.')
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true })
  installRoute()
  const child = spawn('npm', ['run', 'dev'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'pipe' })
  try {
    await waitForServer(child)
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined })
    const shots = [
      { theme: 'light', width: 390, name: 'portal-call-transcript-light-390' },
      { theme: 'light', width: 1280, name: 'portal-call-transcript-light-1280' },
      { theme: 'dark', width: 390, name: 'portal-call-transcript-dark-390' },
      { theme: 'dark', width: 1280, name: 'portal-call-transcript-dark-1280' },
    ]
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.width, height: 900 } })
      await page.goto(`${origin}/portal-call-transcript-qa?theme=${shot.theme}`, { waitUntil: 'networkidle' })
      await page.screenshot({ path: path.join(artifactDir, `${shot.name}.png`), fullPage: true })
      await page.close()
    }
    await browser.close()
    console.log('Saved transcript screenshots to', artifactDir)
  } finally {
    child.kill('SIGTERM')
    removeRoute()
  }
}

main().catch((error) => {
  removeRoute()
  console.error(error)
  process.exit(1)
})