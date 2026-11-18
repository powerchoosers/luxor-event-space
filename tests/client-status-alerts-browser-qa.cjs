/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const artifacts = '/opt/cursor/artifacts'
const leadId = '11111111-1111-4111-8111-111111111111'
const port = Number(process.env.CLIENT_STATUS_QA_PORT || 3221)
const mockPort = Number(process.env.CLIENT_STATUS_MOCK_PORT || 54321)
const origin = `http://127.0.0.1:${port}`
const secret = 'synthetic-portal-session-secret-for-qa'

const sampleLead = {
  id: leadId,
  created_at: '2026-11-18T10:00:00.000Z',
  updated_at: '2026-11-18T12:05:00.000Z',
  status: 'tour_requested',
  source: 'tour_email',
  flow: 'tour',
  campaign_key: null,
  rsvp_status: null,
  marketing_opt_in: false,
  attendee_count: null,
  full_name: 'Sample Guest',
  email: 'sample.guest@example.test',
  phone: '+12105550199',
  event_type: 'Quinceañera',
  target_date: '2027-06-14',
  guest_count: 120,
  budget: '$15k',
  preferred_tour_date: '2026-11-20',
  preferred_tour_time: '15:00:00',
  package_interest: null,
  message: null,
  page_path: null,
  referrer: null,
  user_agent: null,
  metadata: {},
  pipeline_stage: 'tour',
  tour_attendance_status: 'rescheduled',
  client_attention_at: '2026-11-18T12:05:00.000Z',
  client_attention_reason: 'Client requested to reschedule from the email link.',
  client_attention_kind: 'tour_reschedule',
  client_attention_event_id: 'tour_reschedule:synthetic',
  client_attention_acknowledged_at: null,
}

function signSessionCookie() {
  const payload = {
    email: 'a.patterson@luxoratlaspalmas.com',
    accountId: 'synthetic',
    mailboxAddress: 'booking@luxoratlaspalmas.com',
    issuedAt: Date.now(),
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url')
  return `luxor_portal_session=${encoded}.${signature}`
}

function startMockSupabase() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${mockPort}`)
      res.setHeader('Content-Type', 'application/json')
      if (url.pathname.includes('luxor_portal_members')) {
        res.end(JSON.stringify([{ status: 'active', sessions_revoked_at: null }]))
        return
      }
      if (url.pathname.includes('luxor_inquiries')) {
        if (req.method === 'PATCH') {
          res.end(JSON.stringify([sampleLead]))
          return
        }
        res.end(JSON.stringify([sampleLead]))
        return
      }
      if (url.pathname.includes('luxor_notes')) {
        res.end(JSON.stringify([{ id: 'note-1', inquiry_id: leadId, content: 'Acknowledged', note_type: 'status_change' }]))
        return
      }
      res.end(JSON.stringify([]))
    })
    server.listen(mockPort, '127.0.0.1', () => resolve(server))
  })
}

async function waitForServer(child) {
  for (let i = 0; i < 120; i += 1) {
    if (child.exitCode !== null) throw new Error(`Next server exited with ${child.exitCode}`)
    try {
      const response = await fetch(origin)
      if (response.status < 500) return
    } catch {}
    await delay(500)
  }
  throw new Error('Timed out waiting for production Next server.')
}

;(async () => {
  fs.mkdirSync(artifacts, { recursive: true })
  const mock = await startMockSupabase()
  const server = spawn('npm', ['run', 'start', '--', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      LUXOR_PORTAL_SESSION_SECRET: secret,
      SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-role',
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
    },
    stdio: 'ignore',
    detached: true,
  })
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
    args: ['--no-sandbox'],
  })
  try {
    await waitForServer(server)
    const viewports = [
      { name: '390', width: 390, height: 844, reducedMotion: true },
      { name: '820', width: 820, height: 1180, reducedMotion: false },
      { name: '1280', width: 1280, height: 900, reducedMotion: false },
    ]
    const themes = ['light', 'dark']

    for (const theme of themes) {
      for (const viewport of viewports) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: viewport.reducedMotion ? 'reduce' : 'no-preference',
          colorScheme: theme,
        })
        await context.addCookies([{ name: 'luxor_portal_session', value: signSessionCookie().split('=')[1], url: origin }])
        const page = await context.newPage()
        await page.addInitScript((mode) => {
          document.documentElement.dataset.portalTheme = mode
          localStorage.setItem('luxor_portal_theme', mode)
        }, theme)

        await page.route('**/api/**', async (route) => {
          const url = new URL(route.request().url())
          const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
          if (url.pathname === '/api/inquiries') return json([sampleLead])
          if (url.pathname.startsWith('/api/inquiries')) return json(sampleLead)
          if (url.pathname === '/api/portal/notifications/summary') {
            return json({ sources: { inquiries: { ok: true, data: [sampleLead] } } })
          }
          if (url.pathname.endsWith('/acknowledge-client-attention')) {
            sampleLead.client_attention_acknowledged_at = new Date().toISOString()
            return json({ inquiry: sampleLead })
          }
          return json({})
        })

        await page.goto(`${origin}/portal/leads`, { waitUntil: 'networkidle' })
        await page.screenshot({ path: path.join(artifacts, `client-status-leads-list-${theme}-${viewport.name}.png`), fullPage: true })

        await page.goto(`${origin}/portal/leads/${leadId}`, { waitUntil: 'networkidle' })
        await page.screenshot({ path: path.join(artifacts, `client-status-lead-banner-${theme}-${viewport.name}.png`), fullPage: true })

        if (viewport.name === '1280' && theme === 'light') {
          await page.getByRole('button', { name: 'Acknowledge' }).click()
          await page.screenshot({ path: path.join(artifacts, 'client-status-lead-acknowledged-1280-light.png'), fullPage: true })
        }
        await context.close()
      }
    }

    const videoContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      recordVideo: { dir: artifacts, size: { width: 1280, height: 900 } },
    })
    await videoContext.addCookies([{ name: 'luxor_portal_session', value: signSessionCookie().split('=')[1], url: origin }])
    const videoPage = await videoContext.newPage()
    await videoPage.route('**/api/**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.includes('notifications')) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ sources: { inquiries: { ok: true, data: [sampleLead] } } }) })
      }
      if (url.pathname.includes('inquiries')) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith(leadId) ? sampleLead : [sampleLead]) })
      }
      return route.fulfill({ contentType: 'application/json', body: '{}' })
    })
    await videoPage.goto(`${origin}/portal/leads`, { waitUntil: 'networkidle' })
    await videoPage.goto(`${origin}/portal/leads/${leadId}`, { waitUntil: 'networkidle' })
    await videoPage.getByRole('button', { name: 'Acknowledge' }).click()
    await delay(1200)
    const video = await videoPage.video()
    await videoContext.close()
    if (video) await video.saveAs(path.join(artifacts, 'client-status-flow-1280-light.webm'))

    console.log(`Saved client status QA artifacts under ${artifacts}`)
  } finally {
    await browser.close()
    mock.close()
    if (server.pid) process.kill(-server.pid)
  }
})().catch((error) => {
  console.error(error)
  process.exit(1)
})