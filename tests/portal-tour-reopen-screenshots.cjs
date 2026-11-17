/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const routeDir = path.join(root, 'src/app/portal-tour-reopen-qa')
const port = Number(process.env.PORTAL_TOUR_REOPEN_QA_PORT || 3231)
const origin = `http://127.0.0.1:${port}`
const artifactDir = '/opt/cursor/artifacts'
const widths = [390, 820, 1280]

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
  fs.mkdirSync(routeDir, { recursive: true })
  fs.copyFileSync(path.join(__dirname, 'fixtures/tour-reopen-qa-preview.tsx'), path.join(routeDir, 'TourReopenQaPreview.tsx'))
  for (const theme of ['light', 'dark']) {
    for (const variant of ['card', 'confirm']) {
      const dir = path.join(routeDir, theme, variant)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(routeDir, theme, 'layout.tsx'), themeLayout(theme), 'utf8')
      fs.writeFileSync(path.join(dir, 'page.tsx'), `import TourReopenQaPreview from '../../TourReopenQaPreview'

export const dynamic = 'force-dynamic'

export default function Page() {
  return <TourReopenQaPreview showConfirm={${variant === 'confirm'}} />
}
`, 'utf8')
    }
  }
  fs.writeFileSync(path.join(routeDir, 'layout.tsx'), `import type { ReactNode } from 'react'
import { Manrope } from 'next/font/google'
import '../globals.css'

const manrope = Manrope({ variable: '--font-manrope', subsets: ['latin'], display: 'swap' })

export const dynamic = 'force-dynamic'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={\`\${manrope.variable} h-full antialiased\`}>
      <body suppressHydrationWarning data-portal-theme="light" className="min-h-full bg-[color:var(--portal-bg)] font-sans text-[color:var(--portal-text)] antialiased">
        {children}
      </body>
    </html>
  )
}
`, 'utf8')
}

function removeRoute() {
  if (fs.existsSync(routeDir)) fs.rmSync(routeDir, { recursive: true, force: true })
}

async function waitForServer() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const response = await fetch(`${origin}/portal-tour-reopen-qa/light/card`)
      if (response.ok) return
    } catch {}
    await delay(1000)
  }
  throw new Error('Production server did not become ready.')
}

async function run() {
  fs.mkdirSync(artifactDir, { recursive: true })
  installRoute()
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'inherit' })
  if (build.status !== 0) {
    removeRoute()
    process.exit(build.status || 1)
  }
  const server = spawn('npm', ['run', 'start', '--', '-p', String(port)], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'pipe' })
  try {
    await waitForServer()
    const browser = await chromium.launch()
    for (const theme of ['light', 'dark']) {
      for (const variant of ['card', 'confirm']) {
        const page = await browser.newPage()
        await page.setViewportSize({ width: 1280, height: 900 })
        await page.goto(`${origin}/portal-tour-reopen-qa/${theme}/${variant}`, { waitUntil: 'networkidle' })
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 })
          await delay(200)
          const suffix = variant === 'confirm' ? '-confirm-dialog' : '-reopen-control'
          await page.screenshot({
            path: path.join(artifactDir, `portal-tour-reopen-${theme}-${width}${suffix}.png`),
            fullPage: true,
          })
        }
        await page.close()
      }
    }
    await browser.close()
  } finally {
    server.kill('SIGTERM')
    removeRoute()
  }
}

run().catch((error) => {
  console.error(error)
  removeRoute()
  process.exit(1)
})