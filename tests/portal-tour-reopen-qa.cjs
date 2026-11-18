/* eslint-disable @typescript-eslint/no-require-imports */
'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const artifactDir = '/opt/cursor/artifacts/portal-tour-reopen-qa'
const port = Number(process.env.PORTAL_TOUR_REOPEN_QA_PORT || 4534)
const mockSupabasePort = Number(process.env.PORTAL_TOUR_MOCK_SUPABASE_PORT || 4535)
const origin = `http://127.0.0.1:${port}`
const QA_SESSION_SECRET = process.env.PORTAL_TOUR_QA_SESSION_SECRET || 'luxor-portal-tour-reopen-qa-local-only'
const QA_EMAIL = process.env.PORTAL_TOUR_QA_EMAIL || 'qa-portal-owner@luxoratlaspalmas.com'

const MOBILE_VIEWPORT = { width: 390, height: 844 }
const DESKTOP_WIDTHS = [820, 1280]

function luxorTodayKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addDays(dateKey, offsetDays) {
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + offsetDays)
  return date.toISOString().slice(0, 10)
}

function createPortalSessionCookie(email) {
  const issuedAt = Date.now()
  const payload = {
    email: email.toLowerCase(),
    accountId: null,
    mailboxAddress: null,
    issuedAt,
    expiresAt: issuedAt + 7 * 24 * 60 * 60 * 1000,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', QA_SESSION_SECRET).update(encoded).digest('base64url')
  return { name: 'luxor_portal_session', value: `${encoded}.${signature}` }
}

function baseInquiry(overrides) {
  const today = luxorTodayKey()
  return {
    id: overrides.id,
    full_name: overrides.full_name,
    email: `${overrides.id.slice(0, 8)}@example.test`,
    phone: '+12105550199',
    status: 'tour_confirmed',
    source: 'homepage_brochure',
    flow: 'brochure_lead',
    campaign_key: null,
    rsvp_status: null,
    attendee_count: null,
    package_interest: null,
    page_path: null,
    referrer: null,
    user_agent: null,
    event_type: 'Quinceañera',
    target_date: addDays(today, 120),
    guest_count: 100,
    budget: '$15k',
    preferred_tour_date: overrides.preferred_tour_date || addDays(today, 3),
    preferred_tour_time: '11:00 AM',
    tour_attendance_status: overrides.tour_attendance_status,
    pipeline_stage: overrides.pipeline_stage || 'tour',
    current_tour_visit_id: overrides.current_tour_visit_id || 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    current_tour_visit_version: overrides.current_tour_visit_version ?? 2,
    created_at: '2026-11-01T12:00:00.000Z',
    updated_at: '2026-11-17T12:00:00.000Z',
    metadata: {},
    marketing_opt_in: true,
    message: 'Synthetic portal QA only.',
    is_test: false,
  }
}

function notificationSummaryPayload(state) {
  const emptySource = { ok: true, data: null }
  return {
    sources: {
      inquiries: { ok: true, data: state.inquiries },
      emails: emptySource,
      messages: { ok: true, data: [] },
      calls: { ok: true, data: [] },
      invoices: { ok: true, data: [] },
      expenses: { ok: true, data: [] },
      bookings: { ok: true, data: [] },
      payments: { ok: true, data: [] },
      signatures: { ok: true, data: [] },
      marketingEvents: emptySource,
      layoutReviews: emptySource,
      calendarResponses: emptySource,
    },
  }
}

function createFixtureState() {
  const upcomingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const completedId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const today = luxorTodayKey()
  const inquiries = [
    baseInquiry({
      id: upcomingId,
      full_name: 'Sample Guest',
      tour_attendance_status: 'pending',
      preferred_tour_date: addDays(today, 4),
    }),
    baseInquiry({
      id: completedId,
      full_name: 'Sample Host',
      tour_attendance_status: 'attended',
      pipeline_stage: 'proposal',
      preferred_tour_date: addDays(today, 5),
      current_tour_visit_version: 3,
    }),
  ]
  const leadEvents = [{
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    inquiry_id: completedId,
    is_primary: true,
    status: 'tour_confirmed',
    pipeline_stage: 'proposal',
    event_type: 'Quinceañera',
  }]
  return { inquiries, leadEvents, upcomingId, completedId, captureTheme: 'light' }
}

function resetFixtureState(state) {
  const fresh = createFixtureState()
  state.inquiries = fresh.inquiries
  state.leadEvents = fresh.leadEvents
  state.upcomingId = fresh.upcomingId
  state.completedId = fresh.completedId
}

function startMockSupabase() {
  const member = {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    email: QA_EMAIL,
    display_name: 'QA Portal Owner',
    role: 'owner',
    status: 'active',
    permissions: ['overview', 'leads', 'emails', 'calls', 'messages', 'calendar', 'planner', 'marketing', 'finances', 'operations', 'reports', 'settings', 'team_access', 'email_identity', 'phone_assignment'],
    sender_email: QA_EMAIL,
    assigned_phone_number_id: null,
    recovery_email: null,
    auth_user_id: null,
    password_set_at: null,
    password_reset_sent_at: null,
    sessions_revoked_at: null,
    invited_at: null,
    last_signed_in_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
  }
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || '/', `http://127.0.0.1:${mockSupabasePort}`)
    if (!requestUrl.pathname.startsWith('/rest/v1/')) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (requestUrl.pathname.includes('luxor_portal_members')) {
      res.end(JSON.stringify([member]))
      return
    }
    if (requestUrl.pathname.includes('luxor_user_preferences')) {
      res.end(JSON.stringify([{ email: QA_EMAIL, display_name: 'QA Portal Owner', role_title: 'Owner', avatar_url: null }]))
      return
    }
    if (requestUrl.pathname.includes('luxor_portal_fix_notices')) {
      res.end(JSON.stringify([]))
      return
    }
    if (requestUrl.pathname.includes('rpc/')) {
      res.end(JSON.stringify({}))
      return
    }
    res.end(JSON.stringify([]))
  })
  return new Promise((resolve) => {
    server.listen(mockSupabasePort, '127.0.0.1', () => resolve(server))
  })
}

function json(route, data, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
}

function freePort(portNumber) {
  spawnSync('pkill', ['-f', `next start -H 127.0.0.1 -p ${portNumber}`], { encoding: 'utf8' })
  spawnSync('fuser', ['-k', `${portNumber}/tcp`], { encoding: 'utf8' })
  const result = spawnSync('lsof', ['-ti', `:${portNumber}`], { encoding: 'utf8' })
  const pids = result.stdout.trim().split('\n').filter(Boolean)
  for (const pid of pids) {
    if (pid === String(process.pid)) continue
    try {
      process.kill(Number(pid), 'SIGKILL')
    } catch {}
  }
}

function hasFfmpeg() {
  return spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0
}

async function waitForServer() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      const response = await fetch(`${origin}/portal/login`)
      if (response.status < 500) return
    } catch {}
    await delay(1000)
  }
  throw new Error('Timed out waiting for production Next.js server.')
}

function installApiMocks(context, state) {
  context.route(`${origin}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const method = request.method()
    let body = {}
    try { body = request.postDataJSON() || {} } catch {}

    if (url.pathname === '/api/inquiries' && method === 'GET') {
      const id = url.searchParams.get('id')
      if (id) {
        const inquiry = state.inquiries.find((item) => item.id === id)
        return inquiry ? json(route, inquiry) : json(route, { error: 'Not found' }, 404)
      }
      return json(route, state.inquiries)
    }

    if (url.pathname === '/api/tour-actions' && method === 'GET') {
      return json(route, { jobs: [], calendar: { status: 'none' } })
    }

    if (url.pathname === '/api/tour-actions' && method === 'POST') {
      const inquiry = state.inquiries.find((item) => item.id === body.inquiryId)
      if (!inquiry) return json(route, { error: 'Inquiry not found' }, 404)
      if (body.action === 'attendance' && body.attendance === 'attended') {
        inquiry.tour_attendance_status = 'attended'
        inquiry.pipeline_stage = 'proposal'
        inquiry.current_tour_visit_version += 1
        return json(route, { inquiry, warnings: [], idempotent: false })
      }
      if (body.action === 'reopen-tour') {
        inquiry.tour_attendance_status = 'pending'
        inquiry.pipeline_stage = 'tour'
        inquiry.current_tour_visit_version += 1
        const leadEvent = state.leadEvents.find((event) => event.inquiry_id === inquiry.id && event.is_primary)
        if (leadEvent) leadEvent.pipeline_stage = 'tour'
        return json(route, { inquiry, warnings: [], idempotent: false })
      }
      return json(route, { error: 'Unsupported action in QA harness' }, 400)
    }

    if (url.pathname === '/api/lead-events' && method === 'GET') {
      const inquiryId = url.searchParams.get('inquiryId')
      return json(route, state.leadEvents.filter((event) => !inquiryId || event.inquiry_id === inquiryId))
    }

    if (url.pathname === '/api/portal/user-preferences' && method === 'GET') {
      return json(route, {
        theme: state.captureTheme || 'light',
        sidebar: 'expanded',
        email: QA_EMAIL,
        display_name: 'QA Portal Owner',
        avatar_url: null,
      })
    }

    if (url.pathname === '/api/portal/notifications/summary') {
      return json(route, notificationSummaryPayload(state))
    }

    if (url.pathname === '/api/twilio/phone-settings') {
      return json(route, { outbound_mode: 'browser', ring_to_number: null, ring_browser: true, ring_phone: false })
    }
    if (url.pathname === '/api/notes') return json(route, method === 'GET' ? [] : { success: true })
    if (url.pathname === '/api/tasks' && method === 'GET') {
      if (url.searchParams.get('inquiryId')) return json(route, [])
      return json(route, { tasks: [], assignees: [] })
    }
    if (url.pathname === '/api/tasks') return json(route, { success: true })
    if (url.pathname === '/api/invoices') return json(route, [])
    if (url.pathname === '/api/bookings') return json(route, [])
    if (url.pathname === '/api/payments') return json(route, [])
    if (url.pathname === '/api/documents') return json(route, [])
    if (url.pathname === '/api/signatures') return json(route, [])
    if (url.pathname === '/api/vendors') return json(route, [])
    if (url.pathname === '/api/twilio/calls' && method === 'GET') return json(route, [])
    if (url.pathname.startsWith('/api/twilio/consent')) return json(route, { status: 'unknown' })
    if (url.pathname === '/api/marketing/members') return json(route, { members: [] })
    if (url.pathname === '/api/marketing/lead') return json(route, { lead: null })
    if (url.pathname === '/api/portal/lead-event-preference') return json(route, { preferred_event_id: null })
    if (url.pathname.startsWith('/api/portal/leads/')) return json(route, { clicks: [] })
    if (url.pathname.startsWith('/api/leads/') && url.pathname.endsWith('/correct-email-resend')) {
      return json(route, { options: [], suggestedId: null })
    }
    if (url.pathname === '/api/portal/realtime-config') return json(route, { enabled: false })
    if (url.pathname === '/api/inquiries' && method === 'PATCH') {
      const inquiry = state.inquiries.find((item) => item.id === body.id)
      return inquiry ? json(route, inquiry) : json(route, { error: 'Not found' }, 404)
    }
    if (method === 'GET') return json(route, [])
    return json(route, { success: true })
  })
}

function attachPageDiagnostics(page, consoleLog) {
  page.on('response', (response) => {
    if (response.status() >= 500) consoleLog.push(`response: ${response.status()} ${response.url()}`)
  })
  page.on('pageerror', (err) => consoleLog.push(`pageerror: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleLog.push(`console: ${msg.text()}`)
  })
}

async function createPortalContext(browser, state, options) {
  const {
    viewport,
    theme,
    reducedMotion = 'no-preference',
    recordVideo,
  } = options
  const context = await browser.newContext({
    viewport,
    reducedMotion,
    ...(recordVideo ? { recordVideo } : {}),
  })
  await context.addCookies([
    { ...createPortalSessionCookie(QA_EMAIL), url: origin },
    { name: 'luxor-portal-theme', value: theme, url: origin },
  ])
  await context.addInitScript((portalTheme) => {
    window.localStorage.setItem('luxor-portal-theme', portalTheme)
  }, theme)
  installApiMocks(context, state)
  return context
}

async function waitForPortalTheme(page, theme) {
  await page.waitForFunction((expected) => document.body.getAttribute('data-portal-theme') === expected, theme, { timeout: 30_000 })
}

async function verifyThemeBackground(page, theme) {
  const snapshot = await page.evaluate(() => {
    const style = window.getComputedStyle(document.body)
    const match = style.backgroundColor.match(/[\d.]+/g) || ['128', '128', '128']
    const [r, g, b] = match.map(Number)
    return {
      dataTheme: document.body.getAttribute('data-portal-theme'),
      luminance: 0.299 * r + 0.587 * g + 0.114 * b,
    }
  })
  if (snapshot.dataTheme !== theme) {
    throw new Error(`Expected data-portal-theme=${theme}, saw ${snapshot.dataTheme}`)
  }
  if (theme === 'dark' && snapshot.luminance > 95) {
    throw new Error(`Dark capture looks light (body luminance ${snapshot.luminance.toFixed(1)})`)
  }
}

async function waitForDialogSettled(page) {
  const dialog = page.locator('[data-portal-dialog="true"]')
  await dialog.waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-portal-dialog="true"]')
    if (!el) return false
    const opacity = Number.parseFloat(window.getComputedStyle(el).opacity)
    const backdrop = document.querySelector('[data-portal-backdrop="true"]')
    const backdropOpacity = backdrop ? Number.parseFloat(window.getComputedStyle(backdrop).opacity) : 1
    return opacity >= 0.99 && backdropOpacity >= 0.99
  }, { timeout: 10_000 })
  await delay(350)
}

async function gotoLeadsTours(page, theme, viewportWidth = 1280) {
  await page.addInitScript(() => {
    window.localStorage.setItem('luxor_leads_tours_view', 'all')
  })
  if (viewportWidth !== MOBILE_VIEWPORT.width) {
    await page.setViewportSize({ width: viewportWidth, height: 900 })
  }
  await page.goto(`${origin}/portal/leads?view=tours`, { waitUntil: 'domcontentloaded' })
  await waitForPortalTheme(page, theme)
  await delay(400)
  await page.getByRole('button', { name: 'Reopen tour' }).or(page.getByRole('button', { name: 'Mark Completed' })).first().waitFor({ timeout: 60_000 })
}

async function screenshot(page, name, theme) {
  fs.mkdirSync(artifactDir, { recursive: true })
  await verifyThemeBackground(page, theme)
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: true })
}

async function captureReopenScreensAtWidth(page, state, theme, width) {
  await page.getByRole('button', { name: 'Reopen tour' }).first().waitFor({ timeout: 60_000 })
  if (width !== MOBILE_VIEWPORT.width) {
    await page.setViewportSize({ width, height: 900 })
    await delay(150)
  }
  await screenshot(page, `tours-reopen-control-${theme}-${width}.png`, theme)
  await page.getByRole('button', { name: 'Reopen tour' }).first().click()
  await page.getByText('Reopen this tour?').waitFor({ timeout: 15_000 })
  await waitForDialogSettled(page)
  await screenshot(page, `tours-reopen-confirm-${theme}-${width}.png`, theme)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
  await page.locator('[data-portal-dialog="true"]').waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
  await delay(250)
}

async function captureToastScreensAtWidth(page, theme, width) {
  if (width !== MOBILE_VIEWPORT.width) {
    await page.setViewportSize({ width, height: 900 })
    await delay(200)
  }
  await page.getByText('Tour marked completed').waitFor({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Undo' }).waitFor({ timeout: 15_000 })
  await delay(500)
  await screenshot(page, `tours-complete-toast-undo-${theme}-${width}.png`, theme)
}

async function openLeadTourStage(page, mobileLayout) {
  if (mobileLayout) {
    const stagePicker = page.locator('button[aria-controls]').filter({ hasText: /Stage \d+ of/ }).first()
    await stagePicker.click()
    await page.locator('button').filter({ has: page.getByText('Tour', { exact: true }) }).first().click()
  } else {
    await page.locator('.lg\\:block button').filter({ has: page.getByText('Tour', { exact: true }) }).first().click()
  }
  await page.locator('#lead-tour-details').waitFor({ state: 'visible', timeout: 60_000 })
  await page.locator('#lead-tour-details').scrollIntoViewIfNeeded()
}

async function captureLeadDetailReopen(browser, state, theme, consoleLog) {
  resetFixtureState(state)
  state.captureTheme = theme

  for (const { width, height, mobile } of [
    { width: 1280, height: 900, mobile: false },
    { width: MOBILE_VIEWPORT.width, height: MOBILE_VIEWPORT.height, mobile: true },
  ]) {
    const context = await createPortalContext(browser, state, {
      viewport: { width, height },
      theme,
    })
    const page = await context.newPage()
    attachPageDiagnostics(page, consoleLog)
    await page.goto(`${origin}/portal/leads/${state.completedId}?tab=overview&stage=proposal`, { waitUntil: 'domcontentloaded' })
    await waitForPortalTheme(page, theme)
    await page.getByRole('main').getByText('Sample Host', { exact: true }).first().waitFor({ state: 'visible', timeout: 90_000 })
    await openLeadTourStage(page, mobile)
    await page.getByRole('button', { name: 'Reopen tour' }).waitFor({ timeout: 90_000 })
    await screenshot(page, `lead-detail-reopen-${theme}-${width}.png`, theme)
    await page.getByRole('button', { name: 'Reopen tour' }).click()
    await page.getByText('Reopen this tour?').waitFor({ timeout: 15_000 })
    await waitForDialogSettled(page)
    await screenshot(page, `lead-detail-reopen-confirm-${theme}-${width}.png`, theme)
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
    await context.close()
  }
}

async function captureStaticScreenshots(browser, state, consoleLog) {
  for (const theme of ['light', 'dark']) {
    resetFixtureState(state)
    state.captureTheme = theme

    const desktopContext = await createPortalContext(browser, state, {
      viewport: { width: 1280, height: 900 },
      theme,
    })
    const desktopPage = await desktopContext.newPage()
    attachPageDiagnostics(desktopPage, consoleLog)

    await gotoLeadsTours(desktopPage, theme, 1280)
    for (const width of DESKTOP_WIDTHS) {
      await captureReopenScreensAtWidth(desktopPage, state, theme, width)
    }

    await gotoLeadsTours(desktopPage, theme, 1280)
    await desktopPage.getByRole('button', { name: 'Mark Completed' }).first().click()
    for (const width of DESKTOP_WIDTHS) {
      await captureToastScreensAtWidth(desktopPage, theme, width)
    }
    await desktopContext.close()

    const mobileContext = await createPortalContext(browser, state, {
      viewport: MOBILE_VIEWPORT,
      theme,
    })
    const mobilePage = await mobileContext.newPage()
    attachPageDiagnostics(mobilePage, consoleLog)

    resetFixtureState(state)
  state.captureTheme = theme
    await gotoLeadsTours(mobilePage, theme, MOBILE_VIEWPORT.width)
    await captureReopenScreensAtWidth(mobilePage, state, theme, MOBILE_VIEWPORT.width)

    resetFixtureState(state)
    state.captureTheme = theme
    await gotoLeadsTours(mobilePage, theme, MOBILE_VIEWPORT.width)
    await mobilePage.getByRole('button', { name: 'Mark Completed' }).first().click()
    await captureToastScreensAtWidth(mobilePage, theme, MOBILE_VIEWPORT.width)
    await mobileContext.close()

    await captureLeadDetailReopen(browser, state, theme, consoleLog)
  }

  resetFixtureState(state)
  state.captureTheme = 'light'
  const reducedContext = await createPortalContext(browser, state, {
    viewport: MOBILE_VIEWPORT,
    theme: 'light',
    reducedMotion: 'reduce',
  })
  const reducedPage = await reducedContext.newPage()
  attachPageDiagnostics(reducedPage, consoleLog)
  await gotoLeadsTours(reducedPage, 'light', MOBILE_VIEWPORT.width)
  await reducedPage.getByRole('button', { name: 'Mark Completed' }).first().click()
  await reducedPage.getByText('Tour marked completed').waitFor()
  await delay(400)
  await screenshot(reducedPage, 'tours-toast-reduced-motion-390.png', 'light')

  resetFixtureState(state)
  await gotoLeadsTours(reducedPage, 'light', MOBILE_VIEWPORT.width)
  await reducedPage.getByRole('button', { name: 'Reopen tour' }).first().click()
  await reducedPage.getByText('Reopen this tour?').waitFor()
  await waitForDialogSettled(reducedPage)
  await screenshot(reducedPage, 'tours-confirm-reduced-motion-390.png', 'light')
  await reducedContext.close()
}

async function recordContinuousFlow(browser, state) {
  resetFixtureState(state)
  state.captureTheme = 'light'
  const context = await createPortalContext(browser, state, {
    viewport: { width: 1280, height: 900 },
    theme: 'light',
    recordVideo: { dir: artifactDir, size: { width: 1280, height: 900 } },
  })
  const page = await context.newPage()
  await gotoLeadsTours(page, 'light', 1280)
  await delay(2000)

  await page.getByRole('button', { name: 'Mark Completed' }).first().click()
  await page.getByText('Tour marked completed').waitFor({ timeout: 15_000 })
  await delay(3000)

  await page.getByRole('button', { name: 'Undo' }).click()
  await page.getByText('Tour reopened').waitFor({ timeout: 15_000 })
  await delay(3500)

  await gotoLeadsTours(page, 'light', 1280)
  await page.getByRole('button', { name: 'Mark Completed' }).first().waitFor({ timeout: 30_000 })
  await delay(3000)

  await page.getByRole('button', { name: 'Reopen tour' }).first().click()
  await waitForDialogSettled(page)
  await delay(2000)
  await page.getByRole('dialog').getByRole('button', { name: 'Reopen tour' }).click()
  await page.getByText('Tour reopened').waitFor({ timeout: 15_000 })
  await delay(4500)

  const video = page.video()
  await page.close()
  await context.close()
  if (!video) throw new Error('Video recording was not started.')
  const webmPath = await video.path()
  const webmTarget = path.join(artifactDir, 'tour-reopen-flow-1280-light.webm')
  fs.copyFileSync(webmPath, webmTarget)
  if (hasFfmpeg()) {
    const mp4Target = path.join(artifactDir, 'tour-reopen-flow-1280-light.mp4')
    const convert = spawnSync('ffmpeg', ['-y', '-i', webmTarget, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Target], {
      encoding: 'utf8',
    })
    if (convert.status !== 0) {
      throw new Error(`ffmpeg failed: ${convert.stderr || convert.stdout}`)
    }
  }
}

function cleanArtifactDir() {
  fs.mkdirSync(artifactDir, { recursive: true })
  for (const entry of fs.readdirSync(artifactDir)) {
    if (entry.startsWith('page@') && entry.endsWith('.webm')) {
      fs.unlinkSync(path.join(artifactDir, entry))
    }
  }
}

async function main() {
  cleanArtifactDir()
  const state = createFixtureState()
  const consoleLog = []
  freePort(port)
  freePort(mockSupabasePort)
  await delay(300)
  const mockSupabase = await startMockSupabase()

  if (!fs.existsSync(path.join(root, '.next/BUILD_ID'))) {
    const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } })
    if (build.status !== 0) process.exit(build.status || 1)
  }

  const serverEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    LUXOR_PORTAL_SESSION_SECRET: QA_SESSION_SECRET,
    LUXOR_PORTAL_ALLOWED_EMAILS: QA_EMAIL,
    SUPABASE_URL: `http://127.0.0.1:${mockSupabasePort}`,
    SUPABASE_SERVICE_ROLE_KEY: 'portal-tour-reopen-qa-local',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mockSupabasePort}`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'portal-tour-reopen-qa-local',
  }

  const server = spawn('npm', ['run', 'start', '--', '-H', '127.0.0.1', '-p', String(port)], { cwd: root, env: serverEnv, stdio: 'ignore' })
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })

  try {
    await waitForServer()
    const buildId = fs.readFileSync(path.join(root, '.next/BUILD_ID'), 'utf8').trim()
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const buildMeta = await fetch(`${origin}/_next/static/${buildId}/_buildManifest.js`).then((r) => r.status).catch(() => 0)
      if (buildMeta === 200) break
      if (attempt === 59) throw new Error(`Next production server is not serving build ${buildId} (manifest status ${buildMeta}).`)
      await delay(500)
    }

    await captureStaticScreenshots(browser, state, consoleLog)
    await recordContinuousFlow(browser, state)

    fs.writeFileSync(path.join(artifactDir, 'qa-console-errors.txt'), consoleLog.length ? consoleLog.join('\n') : '(no page or console errors captured)')
    for (const entry of fs.readdirSync(artifactDir)) {
      if (entry.startsWith('page@') && entry.endsWith('.webm')) fs.unlinkSync(path.join(artifactDir, entry))
      if (entry === 'qa-failure-body.txt' || entry === 'tour-reopen-flow-390-light.webm') {
        fs.unlinkSync(path.join(artifactDir, entry))
      }
    }
    const screenshots = fs.readdirSync(artifactDir).sort()
    console.log(JSON.stringify({ pass: true, artifactDir, screenshots, ffmpeg: hasFfmpeg() }))
  } finally {
    await browser.close().catch(() => {})
    server.kill('SIGKILL')
    mockSupabase.close(() => {})
    freePort(port)
    freePort(mockSupabasePort)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})