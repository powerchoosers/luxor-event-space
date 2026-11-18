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

const WIDTHS = [390, 820, 1280]

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
  return { inquiries, leadEvents, upcomingId, completedId }
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
  const result = spawnSync('lsof', ['-ti', `:${portNumber}`], { encoding: 'utf8' })
  const pids = result.stdout.trim().split('\n').filter(Boolean)
  for (const pid of pids) {
    if (pid === String(process.pid)) continue
    try {
      process.kill(Number(pid), 'SIGTERM')
    } catch {}
  }
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
        theme: 'light',
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
    if (url.pathname === '/api/tasks') return json(route, method === 'GET' ? { tasks: [], assignees: [] } : { success: true })
    if (url.pathname === '/api/invoices') return json(route, [])
    if (url.pathname === '/api/bookings') return json(route, [])
    if (url.pathname === '/api/payments') return json(route, [])
    if (url.pathname === '/api/documents') return json(route, [])
    if (url.pathname === '/api/signatures') return json(route, [])
    if (url.pathname === '/api/vendors') return json(route, [])
    if (url.pathname === '/api/twilio/calls') return json(route, { calls: [] })
    if (url.pathname.startsWith('/api/twilio/consent')) return json(route, { status: 'unknown' })
    if (url.pathname === '/api/marketing/members') return json(route, { members: [] })
    if (url.pathname === '/api/marketing/lead') return json(route, { lead: null })
    if (url.pathname === '/api/portal/lead-event-preference') return json(route, { preferred_event_id: null })
    if (url.pathname.startsWith('/api/portal/leads/')) return json(route, { clicks: [] })
    if (url.pathname === '/api/portal/realtime-config') return json(route, { enabled: false })
    if (url.pathname === '/api/inquiries' && method === 'PATCH') {
      const inquiry = state.inquiries.find((item) => item.id === body.id)
      return inquiry ? json(route, inquiry) : json(route, { error: 'Not found' }, 404)
    }
    if (method === 'GET') return json(route, [])
  return json(route, { success: true })
  })
}

async function setPortalTheme(page, theme) {
  await page.context().addCookies([{ name: 'luxor-portal-theme', value: theme, url: origin }])
  await page.evaluate((value) => {
    window.localStorage.setItem('luxor-portal-theme', value)
    document.body.setAttribute('data-portal-theme', value)
    window.dispatchEvent(new Event('luxor-portal-theme'))
  }, theme).catch(() => {})
}

async function gotoLeadsTours(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('luxor_leads_tours_view', 'all')
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${origin}/portal/leads?view=tours`, { waitUntil: 'domcontentloaded' })
  await delay(400)
  try {
    await page.getByText('Sample Guest').or(page.getByText('Sample Host')).first().waitFor({ timeout: 60_000 })
  } catch (error) {
    const snippet = await page.locator('body').innerText().catch(() => '')
    const diagnostics = await page.evaluate(async () => {
      const res = await fetch('/api/inquiries')
      const toursNav = document.querySelector('nav[aria-label="Leads & Clients views"]')
      return {
        inquiryStatus: res.status,
        inquiryPreview: (await res.text()).slice(0, 400),
        activeTab: window.localStorage.getItem('luxor_leads_active_tab'),
        toursNavFound: Boolean(toursNav),
        toursButtonLabels: toursNav
          ? [...toursNav.querySelectorAll('button')].map((button) => button.textContent?.trim())
          : [],
      }
    }).catch(() => ({}))
    fs.writeFileSync(path.join(artifactDir, 'qa-failure-body.txt'), `url=${page.url()}\n\n${JSON.stringify(diagnostics, null, 2)}\n\n${snippet}`)
    throw error
  }
}

async function screenshot(page, name) {
  fs.mkdirSync(artifactDir, { recursive: true })
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: true })
}

async function captureStaticScreenshots(page, state) {
  for (const theme of ['light', 'dark']) {
    const fresh = createFixtureState()
    state.inquiries = fresh.inquiries
    state.leadEvents = fresh.leadEvents
    state.upcomingId = fresh.upcomingId
    state.completedId = fresh.completedId
    await setPortalTheme(page, theme)
    await gotoLeadsTours(page)
    await page.getByRole('button', { name: 'Reopen tour' }).first().waitFor({ timeout: 60_000 })
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await delay(150)
      await screenshot(page, `tours-reopen-control-${theme}-${width}.png`)
      await page.getByRole('button', { name: 'Reopen tour' }).first().click()
      await page.getByText('Reopen this tour?').waitFor()
      await screenshot(page, `tours-reopen-confirm-${theme}-${width}.png`)
      await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
      await delay(200)
    }

    await gotoLeadsTours(page)
    const markButton = page.getByRole('button', { name: 'Mark Completed' }).first()
    await markButton.click()
    await page.getByText('Tour marked completed').waitFor()
    await page.getByRole('button', { name: 'Undo' }).waitFor()
    await delay(6_000)
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await delay(400)
      await screenshot(page, `tours-complete-toast-undo-${theme}-${width}.png`)
    }

    if (theme === 'light') {
      try {
        await setPortalTheme(page, 'light')
        await page.goto(`${origin}/portal/leads/${state.completedId}?tab=overview&stage=proposal`, { waitUntil: 'networkidle' })
        await page.getByText('Sample Host').waitFor({ timeout: 90_000 })
        const viewTourDetails = page.getByRole('button', { name: 'View Tour Details' })
        if (await viewTourDetails.isVisible().catch(() => false)) await viewTourDetails.click()
        await page.locator('#lead-tour-details').scrollIntoViewIfNeeded()
        await page.getByRole('button', { name: 'Reopen tour' }).waitFor({ timeout: 90_000 })
        for (const width of [1280, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await delay(150)
          await screenshot(page, `lead-detail-reopen-light-${width}.png`)
          if (width === 390) {
            await page.getByRole('button', { name: 'Reopen tour' }).click()
            await page.getByText('Reopen this tour?').waitFor()
            await screenshot(page, 'lead-detail-reopen-confirm-light-390.png')
            await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click()
          }
        }
      } catch (error) {
        console.warn(`Lead detail QA capture skipped: ${error instanceof Error ? error.message : error}`)
      }
    }
  }

  const reducedState = createFixtureState()
  state.inquiries = reducedState.inquiries
  state.leadEvents = reducedState.leadEvents
  state.upcomingId = reducedState.upcomingId
  state.completedId = reducedState.completedId
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setPortalTheme(page, 'light')
  await gotoLeadsTours(page)
  await page.getByRole('button', { name: 'Mark Completed' }).first().click()
  await page.getByText('Tour marked completed').waitFor()
  await page.setViewportSize({ width: 390, height: 900 })
  await screenshot(page, 'tours-toast-reduced-motion-390.png')
  await gotoLeadsTours(page)
  await page.getByRole('button', { name: 'Reopen tour' }).first().click()
  await page.getByText('Reopen this tour?').waitFor()
  await screenshot(page, 'tours-confirm-reduced-motion-390.png')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
}

async function recordFlowVideo(browser, state, width, theme, fileName) {
  const fresh = createFixtureState()
  state.inquiries = fresh.inquiries
  state.leadEvents = fresh.leadEvents
  state.upcomingId = fresh.upcomingId
  state.completedId = fresh.completedId
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    recordVideo: { dir: artifactDir, size: { width, height: 900 } },
    reducedMotion: 'no-preference',
  })
  await context.addCookies([{ ...createPortalSessionCookie(QA_EMAIL), url: origin }])
  installApiMocks(context, state)
  const page = await context.newPage()
  await setPortalTheme(page, theme)
  await gotoLeadsTours(page)
  await page.getByRole('button', { name: 'Mark Completed' }).first().click()
  await page.getByText('Tour marked completed').waitFor()
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.getByText('Tour reopened').waitFor({ timeout: 15_000 })
  await gotoLeadsTours(page)
  state.inquiries.find((item) => item.id === state.upcomingId).tour_attendance_status = 'attended'
  await page.getByRole('button', { name: 'Reopen tour' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reopen tour' }).click()
  await page.getByText('Tour reopened').waitFor({ timeout: 15_000 })
  await delay(1200)
  const video = page.video()
  await page.close()
  await context.close()
  if (!video) throw new Error('Video recording was not started.')
  const webmPath = await video.path()
  const target = path.join(artifactDir, fileName)
  fs.copyFileSync(webmPath, target)
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true })
  const state = createFixtureState()
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addCookies([{ ...createPortalSessionCookie(QA_EMAIL), url: origin }])
    installApiMocks(context, state)
    const page = await context.newPage()
    const consoleLog = []
    page.on('response', (response) => {
      if (response.status() >= 500) consoleLog.push(`response: ${response.status()} ${response.url()}`)
    })
    page.on('pageerror', (err) => consoleLog.push(`pageerror: ${err.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleLog.push(`console: ${msg.text()}`)
    })
    await captureStaticScreenshots(page, state).catch(async (error) => {
      fs.writeFileSync(path.join(artifactDir, 'qa-console-errors.txt'), consoleLog.join('\n'))
      throw error
    })
    await context.close()

    await recordFlowVideo(browser, state, 1280, 'light', 'tour-reopen-flow-1280-light.webm')
    const state390 = createFixtureState()
    await recordFlowVideo(browser, state390, 390, 'light', 'tour-reopen-flow-390-light.webm')

    console.log(JSON.stringify({ pass: true, artifactDir, screenshots: fs.readdirSync(artifactDir).sort() }))
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