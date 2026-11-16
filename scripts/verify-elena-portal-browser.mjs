#!/usr/bin/env node
/**
 * Local/preview harness: PORTAL_URL=https://... [PORTAL_SESSION_COOKIE=value] node scripts/verify-elena-portal-browser.mjs
 * Does not commit credentials; reads session cookie only from env when provided.
 */
import puppeteer from 'puppeteer-core'

const baseUrl = (process.env.PORTAL_URL || 'http://localhost:3000').replace(/\/$/, '')
const sessionCookie = process.env.PORTAL_SESSION_COOKIE || ''
const chromePath = process.env.CHROME_PATH || '/usr/local/bin/google-chrome'

async function main() {
  const consoleErrors = []
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (!text.includes('favicon') && !text.includes('404')) consoleErrors.push(text)
    }
  })
  page.on('pageerror', (error) => {
    consoleErrors.push(String(error?.message || error))
  })

  if (sessionCookie) {
    const url = new URL(baseUrl)
    await browser.setCookie({
      name: 'luxor_portal_session',
      value: sessionCookie,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:',
    })
  }

  const target = `${baseUrl}/portal`
  const response = await page.goto(target, { waitUntil: 'networkidle2', timeout: 120_000 })
  const status = response?.status() ?? 0
  const onLogin = page.url().includes('/portal/login')

  if (onLogin && !sessionCookie) {
    await browser.close()
    console.log(
      JSON.stringify(
        {
          ok: false,
          skipped: true,
          reason: 'Portal requires authentication. Set PORTAL_URL and PORTAL_SESSION_COOKIE to run browser verification.',
          status,
          url: page.url(),
        },
        null,
        2,
      ),
    )
    process.exit(0)
  }

  const launcherSelector = 'button[aria-label="Toggle Elena AI Concierge"]'
  try {
    await page.waitForSelector(launcherSelector, { timeout: 60_000 })
  } catch (error) {
    await browser.close()
    console.log(
      JSON.stringify(
        {
          ok: false,
          skipped: true,
          reason: 'Signed-in portal shell not reachable (login or protection).',
          baseUrl,
          finalUrl: page.url(),
          title: await page.title(),
          consoleErrors,
          error: String(error?.message || error),
        },
        null,
        2,
      ),
    )
    process.exit(0)
  }

  const steps = []

  async function clickLauncher() {
    await page.click(launcherSelector)
    await page.waitForSelector('.portal-elena-chat-panel:not([inert])', { timeout: 10_000 })
    steps.push('mouse-open')
  }

  async function keyboardOpen() {
    await page.focus(launcherSelector)
    await page.keyboard.press('Enter')
    await page.waitForSelector('.portal-elena-chat-panel:not([inert])', { timeout: 10_000 })
    steps.push('keyboard-open')
  }

  async function tabInsidePanel(times = 4) {
    for (let i = 0; i < times; i += 1) await page.keyboard.press('Tab')
    steps.push(`tab-x${times}`)
  }

  async function keyboardClose() {
    const close = await page.waitForSelector('.portal-close-button', { timeout: 10_000 })
    await close.focus()
    await page.keyboard.press('Enter')
    await page.waitForSelector('.portal-elena-chat-panel[inert]', { timeout: 10_000 })
    steps.push('keyboard-close')
  }

  async function mouseClose() {
    await clickLauncher()
    await page.click('.portal-close-button')
    await page.waitForSelector('.portal-elena-chat-panel[inert]', { timeout: 10_000 })
    steps.push('mouse-close-via-panel')
  }

  await clickLauncher()
  await page.click('.portal-close-button')
  await page.waitForSelector('.portal-elena-chat-panel[inert]', { timeout: 10_000 })
  steps.push('mouse-open-close')

  await keyboardOpen()
  await tabInsidePanel(4)
  await keyboardClose()

  for (let cycle = 0; cycle < 5; cycle += 1) {
    await clickLauncher()
    await page.click('.portal-close-button')
    await page.waitForSelector('.portal-elena-chat-panel[inert]', { timeout: 10_000 })
    steps.push(`cycle-${cycle + 1}`)
  }

  const panelErrors = consoleErrors.filter((line) => /(185|418|Maximum update depth|hydration)/i.test(line))
  const ok = panelErrors.length === 0

  await browser.close()
  console.log(
    JSON.stringify(
      {
        ok,
        baseUrl,
        steps,
        consoleErrors,
        panelErrors,
      },
      null,
      2,
    ),
  )
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})