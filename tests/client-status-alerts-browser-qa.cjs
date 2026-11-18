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
  return {
    sources: {
      inquiries: { ok: true, data: state.inquiries },
      emails: { ok: true, data: null },
      messages: { ok: true, data: [] },
      calls: { ok: true, data: [] },
      invoices: { ok: true, data: [] },
      expenses: { ok: true, data: [] },
      bookings: { ok: true, data: [] },
      payments: { ok: true, data: [] },
      signatures: { ok: true, data: [] },
      marketingEvents: { ok: true, data: { events: [] } },
      layoutReviews: { ok: true, data: { feedback: [] } },
      calendarResponses: { ok: true, data: { responses: [] } },
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
  spawnSync('fuser', ['-k', `${portNumber}/tcp`], { stdio: 'ignore' })
  const result = spawnSync('lsof', ['-ti', `:${portNumber}`], { encoding: 'utf8' })
  const pids = result.stdout.trim().split('\n').filter(Boolean)
  for (const pid of pids) {
    if (pid === String(process.pid)) continue
    try {
      process.kill(Number(pid), 'SIGKILL')
    } catch {}
  }
}

async function waitForPortFree() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(`${origin}/portal/login`)
      freePort(port)
      await delay(250)
    } catch {
      return
    }
  }
  throw new Error(`Port ${port} is still serving a stale Next.js process.`)
}

async function waitForServer() {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    try {
      const response = await fetch(`${origin}/portal/login`)
      if (response.status < 500) {
        const html = await response.text()
        const layoutChunk = html.match(/layout-[a-f0-9]+\.js/)?.[0]
        const portalChunkDir = path.join(root, '.next/static/chunks/app/(workspace)/(portal)')
        const onDisk = fs.existsSync(portalChunkDir)
          ? fs.readdirSync(portalChunkDir).find((name) => name.startsWith('layout-') && name.endsWith('.js'))
          : null
        if (layoutChunk && onDisk && layoutChunk !== onDisk) {
          throw new Error(`Stale Next.js server on ${port}: HTML references ${layoutChunk} but build has ${onDisk}.`)
        }
        return
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Stale Next.js server')) throw error
    }
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

function attachPageDiagnostics(page, consoleLog) {
  page.on('pageerror', (err) => {
    consoleLog.push(`pageerror: ${err.message}`)
    if (err.stack) consoleLog.push(err.stack)
  })
  page.on('console', (msg) => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      consoleLog.push(`console.${type}: ${msg.text()}`)
      const location = msg.location()
      if (location.url) {
        consoleLog.push(`  at ${location.url}:${location.lineNumber}:${location.columnNumber}`)
      }
    }
  })
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (url.includes('_rsc=')) return
    consoleLog.push(`requestfailed: ${request.method()} ${url} ${request.failure()?.errorText || ''}`)
  })
}

function writeConsoleLog(consoleLog) {
  fs.mkdirSync(artifactDir, { recursive: true })
  const filtered = consoleLog.filter((line) => !line.includes('Supabase Realtime is unavailable'))
  const errors = filtered.filter((line) => line.startsWith('pageerror:') || line.startsWith('console.error:') || line.startsWith('response: 5') || line.startsWith('requestfailed:'))
  fs.writeFileSync(
    path.join(artifactDir, 'qa-console-errors.txt'),
    errors.length ? `${errors.join('\n---\n')}\n` : 'No console errors.\n',
  )
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
    if (url.pathname === '/api/tasks' && method === 'GET') {
      if (url.searchParams.get('all') === '1') {
        return json(route, { tasks: [], assignees: [QA_EMAIL] })
      }
      if (url.searchParams.get('inquiryId')) return json(route, [])
      return json(route, { error: 'Missing inquiryId parameter.' }, 400)
    }
    if (url.pathname === '/api/tasks') return json(route, { success: true })
    if (url.pathname === '/api/invoices') return json(route, [])
    if (url.pathname === '/api/bookings') return json(route, [])
    if (url.pathname === '/api/payments') return json(route, [])
    if (url.pathname === '/api/documents') return json(route, [])
    if (url.pathname === '/api/signatures') return json(route, [])
    if (url.pathname === '/api/vendors') return json(route, [])
    if (url.pathname === '/api/twilio/calls') return json(route, [])
    if (url.pathname.startsWith('/api/twilio/consent')) return json(route, { status: 'unknown' })
    if (url.pathname === '/api/twilio/messages') return json(route, { messages: [] })
    if (url.pathname === '/api/marketing/members') return json(route, { members: [] })
    if (url.pathname === '/api/marketing/lists') return json(route, { lists: [] })
    if (url.pathname === '/api/marketing/custom-workflows') return json(route, { workflows: [] })
    if (url.pathname === '/api/marketing/lead') return json(route, { lead: null })
    if (url.pathname === '/api/follow-ups' && url.searchParams.get('dashboard') === '1') {
      return json(route, {
        emailActions: [],
        pausedEnrollmentIds: [],
        pausedEnrollments: [],
        signedBookedInquiryIds: [],
        sequenceStatus: 'unknown',
        missedCallTextEnabled: false,
        inboundTextReplyEnabled: false,
      })
    }
    if (url.pathname === '/api/portal/team-members') return json(route, { members: [] })
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

async function waitForSampleGuestLead(page) {
  const viewport = page.viewportSize()?.width ?? 1280
  const leadAnchor = page.locator('a[href*="/portal/leads/"]').filter({ hasText: 'Sample Guest' })
  if (viewport < 768) {
    await page.locator('div.md\\:hidden').filter({ hasText: 'Sample Guest' }).first().waitFor({ state: 'visible', timeout: 90_000 })
    return
  }
  await leadAnchor.first().waitFor({ state: 'attached', timeout: 90_000 })
  await page.locator('tbody tr').filter({ hasText: 'Sample Guest' }).first().waitFor({ state: 'visible', timeout: 90_000 })
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
    await waitForSampleGuestLead(page)
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
  await page.setViewportSize({ width, height: 900 })
  applyClientAttention(state, false)
  await page.goto(`${origin}/portal/leads?view=pipeline`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => {
    window.localStorage.removeItem('luxor_notified_toast_ids_v1')
    window.localStorage.removeItem('luxor_read_notification_ids_v1')
  })
  await page.getByRole('heading', { name: /Leads/i }).first().waitFor({ state: 'visible', timeout: 90_000 }).catch(() => {})
  await delay(1500)
  applyClientAttention(state, true)
  await page.evaluate(async () => {
    window.localStorage.removeItem('luxor_notified_toast_ids_v1')
    await fetch('/api/portal/notifications/summary', { cache: 'no-store' })
    window.dispatchEvent(new Event('luxor:inquiries-updated'))
  })
  await delay(800)
  await page.locator('.portal-toast').filter({ hasText: 'Client update: Sample Guest' }).first().waitFor({ state: 'visible', timeout: 60_000 })
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

    if (!reducedMotion) {
      await captureToast(page, state, theme, width, `client-status-toast-${theme}-${width}.png`)
      await gotoLeadsList(page)
      await page.setViewportSize({ width, height: 900 })
      await delay(200)
    }

    await openNotificationsPanel(page)
    await screenshot(page, `client-status-bell-${theme}-${width}${suffix}.png`)
    await page.keyboard.press('Escape').catch(() => {})
    await delay(150)

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
  await waitForSampleGuestLead(page)
  await delay(1000)
  applyClientAttention(state, true)
  await page.evaluate(async () => {
    window.localStorage.removeItem('luxor_notified_toast_ids_v1')
    await fetch('/api/portal/notifications/summary', { cache: 'no-store' })
    window.dispatchEvent(new Event('luxor:inquiries-updated'))
  })
  await page.locator('.portal-toast').filter({ hasText: 'Client update: Sample Guest' }).first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
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
  await waitForPortFree()
  await delay(500)
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
  const nextCli = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
  const serverCmd = useDevServer ? nextCli : nextCli
  const serverArgs = useDevServer
    ? ['dev', '-H', '127.0.0.1', '-p', String(port)]
    : ['start', '-H', '127.0.0.1', '-p', String(port)]
  const server = spawn(process.execPath, [serverCmd, ...serverArgs], {
    cwd: root,
    env: serverEnv,
    stdio: 'ignore',
    detached: true,
  })

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  let consoleLog = []

  try {
    await waitForServer()
    await delay(1500)

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addCookies([{ ...createPortalSessionCookie(QA_EMAIL), url: origin }])
    installApiMocks(context, state)
    const page = await context.newPage()

    consoleLog = []
    attachPageDiagnostics(page, consoleLog)
  page.on('response', (response) => {
    if (response.status() >= 500) consoleLog.push(`response: ${response.status()} ${response.url()}`)
  })

    for (const theme of ['light', 'dark']) {
      await captureThemeScreenshots(page, state, theme, false)
    }
    await captureThemeScreenshots(page, state, 'light', true)

    await context.close()
    await recordFlowVideo(browser, state)

    writeConsoleLog(consoleLog)
    const screenshots = fs.readdirSync(artifactDir).filter((name) => name.endsWith('.png') || name.endsWith('.webm')).sort()
    console.log(JSON.stringify({ pass: true, artifactDir, screenshots }))
  } catch (error) {
    fs.mkdirSync(artifactDir, { recursive: true })
    writeConsoleLog(consoleLog)
    fs.writeFileSync(path.join(artifactDir, 'qa-error.txt'), error instanceof Error ? `${error.stack || error.message}` : String(error))
    throw error
  } finally {
    await browser.close().catch(() => {})
    try {
      if (server.pid) process.kill(-server.pid, 'SIGKILL')
    } catch {
      server.kill('SIGKILL')
    }
    mockSupabase.close(() => {})
    freePort(port)
    freePort(mockSupabasePort)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})