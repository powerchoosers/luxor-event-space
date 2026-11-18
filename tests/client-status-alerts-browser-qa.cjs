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
const artifactDir = '/opt/cursor/artifacts/client-status-owner-alerts-qa'
const port = Number(process.env.CLIENT_STATUS_QA_PORT || 3299)
const mockSupabasePort = Number(process.env.CLIENT_STATUS_MOCK_PORT || 54321)
const origin = `http://127.0.0.1:${port}`
const mockSupabaseOrigin = `http://127.0.0.1:${mockSupabasePort}`
const QA_SESSION_SECRET = process.env.CLIENT_STATUS_QA_SESSION_SECRET || 'client-status-owner-alerts-qa-local-only'
const QA_EMAIL = process.env.CLIENT_STATUS_QA_EMAIL || 'a.patterson@luxoratlaspalmas.com'

const WIDTHS = [390, 820, 1280]
const ATTENTION_LEAD_ID = '11111111-1111-4111-8111-111111111111'
const DECOY_LEAD_ID = '22222222-2222-4222-8222-222222222222'
const TOUR_VISIT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

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

function attentionFields(enabled) {
  if (!enabled) {
    return {
      client_attention_at: null,
      client_attention_reason: null,
      client_attention_kind: null,
      client_attention_event_id: null,
      client_attention_acknowledged_at: null,
    }
  }
  return {
    client_attention_at: '2026-11-18T12:05:00.000Z',
    client_attention_reason: 'Client requested to reschedule from the email link.',
    client_attention_kind: 'tour_reschedule',
    client_attention_event_id: 'tour_reschedule:synthetic',
    client_attention_acknowledged_at: null,
  }
}

function baseInquiry(id, fullName, overrides = {}) {
  const { withAttention = true, ...rest } = overrides
  return {
    id,
    created_at: rest.created_at || '2026-11-01T12:00:00.000Z',
    updated_at: rest.updated_at || '2026-11-18T12:05:00.000Z',
    status: rest.status || 'new',
    source: rest.source || 'tour_email',
    flow: rest.flow || 'tour',
    campaign_key: null,
    rsvp_status: null,
    marketing_opt_in: false,
    attendee_count: null,
    full_name: fullName,
    email: `${id.slice(0, 8)}@example.test`,
    phone: '+12105550199',
    event_type: 'Quinceañera',
    target_date: '2027-06-14',
    guest_count: 120,
    budget: '$15k',
    preferred_tour_date: '2026-11-20',
    preferred_tour_time: '3:00 PM',
    package_interest: null,
    message: null,
    page_path: null,
    referrer: null,
    user_agent: null,
    metadata: {},
    pipeline_stage: rest.pipeline_stage || 'tour',
    tour_attendance_status: rest.tour_attendance_status || 'rescheduled',
    current_tour_visit_id: TOUR_VISIT_ID,
    current_tour_visit_version: 2,
    is_test: false,
    ...attentionFields(Boolean(withAttention)),
    ...rest,
  }
}

function createFixtureState(options = {}) {
  const withAttention = options.withAttention !== false
  const inquiries = [
    baseInquiry(ATTENTION_LEAD_ID, 'Sample Guest', {
      withAttention,
      created_at: '2026-11-10T12:00:00.000Z',
    }),
    baseInquiry(DECOY_LEAD_ID, 'Other Lead', {
      withAttention: false,
      status: 'new',
      source: 'homepage_brochure',
      flow: 'brochure_lead',
      tour_attendance_status: 'pending',
      created_at: '2026-11-18T11:00:00.000Z',
    }),
  ]
  const leadEvents = [{
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    inquiry_id: ATTENTION_LEAD_ID,
    is_primary: true,
    status: 'tour_requested',
    pipeline_stage: 'tour',
    event_type: 'Quinceañera',
    target_date: '2027-06-14',
    guest_count: 120,
    created_at: '2026-11-01T12:00:00.000Z',
    updated_at: '2026-11-18T12:05:00.000Z',
  }]
  return { inquiries, leadEvents, attentionLeadId: ATTENTION_LEAD_ID }
}

function applyClientAttention(state, enabled = true) {
  const inquiry = state.inquiries.find((item) => item.id === ATTENTION_LEAD_ID)
  if (!inquiry) return
  Object.assign(inquiry, attentionFields(enabled))
  if (!enabled) {
    inquiry.client_attention_acknowledged_at = null
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

function startMockSupabase() {
  const member = {
    id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    email: QA_EMAIL,
    display_name: 'Arianna Patterson',
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
    const requestUrl = new URL(req.url || '/', mockSupabaseOrigin)
    if (!requestUrl.pathname.startsWith('/rest/v1/') && !requestUrl.pathname.startsWith('/auth/v1/')) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    if (requestUrl.pathname.includes('luxor_portal_members')) {
      res.end(JSON.stringify([member]))
      return
    }
    if (requestUrl.pathname.includes('luxor_user_preferences')) {
      res.end(JSON.stringify([{
        email: QA_EMAIL,
        display_name: 'Arianna Patterson',
        role_title: 'Owner',
        avatar_url: null,
        notification_emails: 'booking@luxoratlaspalmas.com',
      }]))
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
    if (requestUrl.pathname.startsWith('/auth/v1/')) {
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
      process.kill(Number(pid), 'SIGKILL')
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

function installSupabaseBrowserRoutes(context) {
  context.route(`${mockSupabaseOrigin}/**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/realtime/')) {
      return route.abort()
    }
  if (url.pathname.startsWith('/rest/v1/') || url.pathname.startsWith('/auth/v1/')) {
      return json(route, [])
    }
    return route.abort()
  })
}

function installApiMocks(context, state) {
  installSupabaseBrowserRoutes(context)
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

    const acknowledgeMatch = url.pathname.match(/^\/api\/leads\/([^/]+)\/acknowledge-client-attention$/)
    if (acknowledgeMatch && method === 'POST') {
      const inquiry = state.inquiries.find((item) => item.id === acknowledgeMatch[1])
      if (!inquiry) return json(route, { error: 'Not found' }, 404)
      inquiry.client_attention_acknowledged_at = new Date().toISOString()
      return json(route, { inquiry })
    }

    if (url.pathname === '/api/tour-actions' && method === 'GET') {
      return json(route, { jobs: [], calendar: { status: 'none' } })
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
        display_name: 'Arianna Patterson',
        avatar_url: null,
      })
    }
    if (url.pathname === '/api/portal/notifications/summary') {
      return json(route, notificationSummaryPayload(state))
    }
    if (url.pathname === '/api/twilio/phone-settings') {
      return json(route, { outbound_mode: 'browser', ring_to_number: null, ring_browser: false, ring_phone: false })
    }
    if (url.pathname === '/api/twilio/token') {
      return json(route, { token: 'synthetic-qa-token' })
    }
    if (url.pathname === '/api/twilio/phone-lookup') {
      return json(route, { match: null })
    }
    if (url.pathname === '/api/notes') return json(route, method === 'GET' ? [] : { success: true })
    if (url.pathname === '/api/tasks') return json(route, method === 'GET' ? { tasks: [], assignees: [] } : { success: true })
    if (url.pathname === '/api/invoices') return json(route, [])
    if (url.pathname === '/api/bookings') return json(route, [])
    if (url.pathname === '/api/payments') return json(route, [])
    if (url.pathname === '/api/documents') return json(route, [])
    if (url.pathname === '/api/signatures') return json(route, [])
    if (url.pathname === '/api/vendors') return json(route, [])
    if (url.pathname === '/api/twilio/calls') {
      if (url.searchParams.get('unreadOnly')) return json(route, [])
      return json(route, { calls: [] })
    }
    if (url.pathname.startsWith('/api/twilio/consent')) return json(route, { status: 'unknown' })
    if (url.pathname === '/api/twilio/messages') return json(route, { messages: [] })
    if (url.pathname === '/api/marketing/members') return json(route, { members: [] })
    if (url.pathname === '/api/marketing/lead') return json(route, { lead: null })
    if (url.pathname === '/api/portal/lead-event-preference') return json(route, { preferred_event_id: state.leadEvents[0]?.id || null })
    if (url.pathname === '/api/portal/payment-installments') return json(route, { installments: [] })
    if (url.pathname.startsWith('/api/portal/leads/')) return json(route, { clicks: [] })
    if (url.pathname === '/api/portal/realtime-config') return json(route, { enabled: false })
    if (url.pathname === '/api/email/inbox') return json(route, { emails: [] })
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

async function gotoLeadsList(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('luxor_leads_active_tab', 'pipeline')
    window.localStorage.removeItem('luxor_read_notification_ids_v1')
    window.localStorage.removeItem('luxor_notified_toast_ids_v1')
  })
  await page.goto(`${origin}/portal/leads?view=pipeline`, { waitUntil: 'domcontentloaded' })
  await delay(500)
  try {
    await page.getByText('Sample Guest').first().waitFor({ timeout: 90_000 })
  } catch (error) {
    const snippet = await page.locator('body').innerText().catch(() => '')
    const diagnostics = await page.evaluate(async () => {
      const res = await fetch('/api/inquiries')
      return {
        href: window.location.href,
        inquiryStatus: res.status,
        inquiryPreview: (await res.text()).slice(0, 600),
      }
    }).catch(() => ({}))
    fs.writeFileSync(
      path.join(artifactDir, 'qa-failure-body.txt'),
      `url=${page.url()}\n\n${JSON.stringify(diagnostics, null, 2)}\n\n${snippet}`,
    )
    throw error
  }
}

async function screenshot(page, name) {
  fs.mkdirSync(artifactDir, { recursive: true })
  await page.screenshot({ path: path.join(artifactDir, name), fullPage: true })
}

async function openNotificationsPanel(page) {
  const bell = page.getByRole('button', { name: 'Notifications' }).first()
  await bell.click()
  await page.getByText('Client update: Sample Guest').first().waitFor({ timeout: 60_000 })
  await delay(200)
}

async function captureToast(page, state, theme, width, fileName) {
  applyClientAttention(state, false)
  await page.goto(`${origin}/portal/leads?view=pipeline`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    window.localStorage.removeItem('luxor_notified_toast_ids_v1')
    window.localStorage.removeItem('luxor_read_notification_ids_v1')
  })
  await page.getByText('Sample Guest').first().waitFor({ timeout: 90_000 })
  await delay(1200)
  applyClientAttention(state, true)
  await page.evaluate(() => {
    window.dispatchEvent(new Event('luxor:inquiries-updated'))
  })
  await page.getByText('Client update: Sample Guest').first().waitFor({ timeout: 30_000 })
  await page.setViewportSize({ width, height: 900 })
  await delay(300)
  await screenshot(page, fileName)
}

async function captureThemeScreenshots(page, state, theme, reducedMotion = false) {
  const fresh = createFixtureState({ withAttention: true })
  state.inquiries = fresh.inquiries
  state.leadEvents = fresh.leadEvents
  if (reducedMotion) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  } else {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
  }
  await setPortalTheme(page, theme)
  await gotoLeadsList(page)
  await page.getByText('Needs attention').first().waitFor({ timeout: 60_000 })

  const firstLeadCell = page.locator('tbody tr').first().getByText('Sample Guest')
  await firstLeadCell.waitFor({ timeout: 30_000 })

  const widthSet = reducedMotion ? [390] : WIDTHS
  const suffix = reducedMotion ? '-reduced-motion' : ''

  for (const width of widthSet) {
    await page.setViewportSize({ width, height: 900 })
    await delay(200)
    await screenshot(page, `client-status-leads-list-${theme}-${width}${suffix}.png`)

    await openNotificationsPanel(page)
    await screenshot(page, `client-status-bell-${theme}-${width}${suffix}.png`)
    await page.keyboard.press('Escape').catch(() => {})
    await delay(150)

    if (!reducedMotion) {
      await captureToast(page, state, theme, width, `client-status-toast-${theme}-${width}.png`)
      await gotoLeadsList(page)
      await page.setViewportSize({ width, height: 900 })
    }

    await page.goto(`${origin}/portal/leads/${ATTENTION_LEAD_ID}?tab=overview`, { waitUntil: 'domcontentloaded' })
    await page.getByText('Client update needs your attention').waitFor({ timeout: 90_000 })
    await page.setViewportSize({ width, height: 900 })
    await delay(200)
    await screenshot(page, `client-status-lead-banner-${theme}-${width}${suffix}.png`)

    if (width === 1280 && !reducedMotion) {
      await page.getByRole('button', { name: 'Acknowledge' }).click()
      await page.getByText('Client update needs your attention').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
      await delay(400)
      await screenshot(page, `client-status-lead-acknowledged-${theme}-${width}.png`)
      const reset = createFixtureState({ withAttention: true })
      state.inquiries = reset.inquiries
      state.leadEvents = reset.leadEvents
    }
  }
}

async function recordFlowVideo(browser, state) {
  const flowState = createFixtureState({ withAttention: false })
  state.inquiries = flowState.inquiries
  state.leadEvents = flowState.leadEvents
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: artifactDir, size: { width: 1280, height: 900 } },
    reducedMotion: 'no-preference',
    colorScheme: 'light',
  })
  await context.addCookies([
    { ...createPortalSessionCookie(QA_EMAIL), url: origin },
    { name: 'luxor-portal-theme', value: 'light', url: origin },
  ])
  installApiMocks(context, state)
  const page = await context.newPage()
  await page.addInitScript(() => {
    window.localStorage.setItem('luxor_leads_active_tab', 'pipeline')
    window.localStorage.removeItem('luxor_notified_toast_ids_v1')
    window.localStorage.removeItem('luxor_read_notification_ids_v1')
  })
  await page.goto(`${origin}/portal/leads?view=pipeline`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Sample Guest').first().waitFor({ timeout: 90_000 })
  await delay(1000)
  applyClientAttention(state, true)
  await page.evaluate(() => {
    window.dispatchEvent(new Event('luxor:inquiries-updated'))
  })
  await page.getByText('Client update: Sample Guest').first().waitFor({ timeout: 30_000 })
  await delay(800)
  await page.getByRole('button', { name: 'Notifications' }).first().click()
  await delay(600)
  await page.goto(`${origin}/portal/leads/${ATTENTION_LEAD_ID}?tab=overview`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Client update needs your attention').waitFor({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Acknowledge' }).click()
  await delay(1200)
  const video = page.video()
  await page.close()
  await context.close()
  if (!video) throw new Error('Video recording was not started.')
  const webmPath = await video.path()
  fs.copyFileSync(webmPath, path.join(artifactDir, 'client-status-flow-1280-light.webm'))
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true })
  const state = createFixtureState({ withAttention: true })
  freePort(port)
  freePort(mockSupabasePort)
  await delay(300)
  const mockSupabase = await startMockSupabase()

  if (!fs.existsSync(path.join(root, '.next/BUILD_ID'))) {
    const build = spawnSync('npm', ['run', 'build'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    })
    if (build.status !== 0) process.exit(build.status || 1)
  }

  const serverEnv = {
    ...process.env,
    PORT: String(port),
    NODE_ENV: 'production',
    LUXOR_PORTAL_SESSION_SECRET: QA_SESSION_SECRET,
    LUXOR_PORTAL_ALLOWED_EMAILS: QA_EMAIL,
    SUPABASE_URL: mockSupabaseOrigin,
    SUPABASE_SERVICE_ROLE_KEY: 'client-status-alerts-qa-local',
    NEXT_PUBLIC_SUPABASE_URL: mockSupabaseOrigin,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'client-status-alerts-qa-local',
  }

  const useDevServer = process.env.CLIENT_STATUS_QA_DEV === '1'
  const server = spawn('npm', ['run', useDevServer ? 'dev' : 'start', '--', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    env: serverEnv,
    stdio: 'ignore',
  })

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })

  try {
    await waitForServer()
    await delay(1500)

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addCookies([{ ...createPortalSessionCookie(QA_EMAIL), url: origin }])
    installApiMocks(context, state)
    const page = await context.newPage()

    const consoleLog = []
    page.on('response', (response) => {
      if (response.status() >= 500) consoleLog.push(`response: ${response.status()} ${response.url()}`)
    })
    page.on('pageerror', (err) => {
      consoleLog.push(`pageerror: ${err.message}`)
      if (err.stack) consoleLog.push(err.stack)
    })

    for (const theme of ['light', 'dark']) {
      await captureThemeScreenshots(page, state, theme, false)
    }
    await captureThemeScreenshots(page, state, 'light', true)

    await context.close()
    await recordFlowVideo(browser, state)

    const screenshots = fs.readdirSync(artifactDir).filter((name) => name.endsWith('.png') || name.endsWith('.webm')).sort()
    console.log(JSON.stringify({ pass: true, artifactDir, screenshots }))
  } catch (error) {
    fs.mkdirSync(artifactDir, { recursive: true })
    fs.writeFileSync(path.join(artifactDir, 'qa-error.txt'), error instanceof Error ? `${error.stack || error.message}` : String(error))
    throw error
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