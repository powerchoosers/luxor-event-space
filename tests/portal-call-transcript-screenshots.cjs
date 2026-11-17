/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const routeDir = path.join(root, 'src/app/portal-call-transcript-qa')
const port = Number(process.env.PORTAL_CALL_TRANSCRIPT_QA_PORT || 3227)
const origin = `http://127.0.0.1:${port}`
const artifactDir = '/opt/cursor/artifacts'

function themeLayout(theme) {
  return `'use client'

import { useEffect, type ReactNode } from 'react'

export default function ThemeLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.setAttribute('data-portal-theme', '${theme}')
  }, [])
  return children
}
`
}

function installRoute() {
  if (fs.existsSync(routeDir)) fs.rmSync(routeDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(routeDir, 'light'), { recursive: true })
  fs.mkdirSync(path.join(routeDir, 'dark'), { recursive: true })
  fs.copyFileSync(path.join(__dirname, 'fixtures/portal-call-transcript-preview.tsx'), path.join(routeDir, 'TranscriptPreview.tsx'))
  fs.writeFileSync(path.join(routeDir, 'layout.tsx'), `import type { ReactNode } from 'react'
import { Manrope } from 'next/font/google'
import '../globals.css'

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], display: 'swap' })

export const dynamic = 'force-dynamic'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={\`\${manrope.variable} h-full antialiased\`}>
      <body
        suppressHydrationWarning
        data-portal-theme="light"
        className="min-h-full bg-[color:var(--portal-bg)] font-sans text-[color:var(--portal-text)] antialiased"
      >
        {children}
      </body>
    </html>
  )
}
`, 'utf8')
  for (const theme of ['light', 'dark']) {
    fs.writeFileSync(path.join(routeDir, theme, 'layout.tsx'), themeLayout(theme), 'utf8')
    fs.writeFileSync(path.join(routeDir, theme, 'page.tsx'), `import PortalCallTranscriptPreview from '../TranscriptPreview'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <PortalCallTranscriptPreview />
}
`, 'utf8')
  }
}

function removeRoute() {
  if (fs.existsSync(routeDir)) fs.rmSync(routeDir, { recursive: true, force: true })
}

async function waitForServer() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const response = await fetch(`${origin}/portal-call-transcript-qa/light`)
      if (response.ok) return
    } catch {}
    await delay(1000)
  }
  throw new Error('Timed out waiting for production server.')
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true })
  installRoute()
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
  if (build.status !== 0) throw new Error('Production build failed.')
  const child = spawn('npm', ['run', 'start'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'pipe' })
  try {
    await waitForServer()
    const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined })
    const shots = [
      { theme: 'light', width: 390, name: 'portal-call-transcript-light-390' },
      { theme: 'light', width: 1280, name: 'portal-call-transcript-light-1280' },
      { theme: 'dark', width: 390, name: 'portal-call-transcript-dark-390' },
      { theme: 'dark', width: 1280, name: 'portal-call-transcript-dark-1280' },
    ]
    for (const shot of shots) {
      const page = await browser.newPage({ viewport: { width: shot.width, height: 720 } })
      await page.goto(`${origin}/portal-call-transcript-qa/${shot.theme}`, { waitUntil: 'networkidle' })
      await page.waitForFunction((theme) => document.body.getAttribute('data-portal-theme') === theme, shot.theme)
      await page.waitForSelector('text=0:07')
      await page.screenshot({ path: path.join(artifactDir, `${shot.name}.png`) })
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