/* eslint-disable @typescript-eslint/no-require-imports */
// Synthetic-only browser harness. Run with PLAYWRIGHT_MODULE and CHROMIUM_EXECUTABLE_PATH
// when Playwright is provided by the execution environment instead of this app.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { setTimeout: delay } = require('node:timers/promises')
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')

const root = path.resolve(__dirname, '..')
const routeDir = path.join(root, 'src/app/(site)/followups-qa')
const routeFile = path.join(routeDir, 'page.tsx')
const port = Number(process.env.FOLLOWUPS_QA_PORT || 3218)
const origin = `http://127.0.0.1:${port}`

async function waitForServer(child) {
  for (let i = 0; i < 100; i += 1) {
    if (child.exitCode !== null) throw new Error(`Next dev server exited with ${child.exitCode}`)
    try { const response = await fetch(origin); if (response.ok || response.status < 500) return } catch {}
    await delay(500)
  }
  throw new Error('Timed out waiting for the temporary Next.js browser QA route.')
}

;(async () => {
  if (fs.existsSync(routeFile)) throw new Error(`Refusing to overwrite existing QA route: ${routeFile}`)
  fs.mkdirSync(routeDir, { recursive: true })
  fs.copyFileSync(path.join(__dirname, 'fixtures/follow-ups-browser-page.tsx'), routeFile)
  const server = spawn('npm', ['run', 'dev:webpack', '--', '--hostname', '127.0.0.1', '--port', String(port)], { cwd: root, stdio: 'ignore', detached: true })
  let browser
  try {
    await waitForServer(server)
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] })
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const requests = []
    const errors = []
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']
    const dates = { overdue: '2026-10-06', today: '2026-10-08', future: '2026-10-12' }
    const tasks = ids.slice(0, 4).map((id, i) => ({ id: `task-${i + 1}`, created_at: '2026-10-01T12:00:00Z', inquiry_id: id, title: `Synthetic action ${i + 1}`, description: '[follow-up:phone] Fixture only', due_date: dates[['overdue', 'today', 'future', 'future'][i]], due_at: `${dates[['overdue', 'today', 'future', 'future'][i]]}T15:00:00Z`, completed_at: null, priority: 'medium', status: 'pending', assigned_to: null, automation_enrollment_id: null }))
    const leads = [
      { id: ids[0], full_name: 'Synthetic Demo', email: 'demo@example.test', phone: '+12105550101', status: 'new', source: 'homepage_brochure', flow: 'brochure_lead', event_type: 'Wedding', target_date: '2027-06-14', guest_count: 90, budget: '$10k', created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z', metadata: {}, marketing_opt_in: true, message: 'Fixture only' },
      { id: ids[1], full_name: 'Synthetic Demo', email: 'demo@example.test', phone: '+12105550102', status: 'new', source: 'homepage_brochure', flow: 'brochure_lead', event_type: 'Wedding', target_date: '2027-06-14', guest_count: 90, budget: '$10k', created_at: '2026-10-02T12:00:00Z', updated_at: '2026-10-02T12:00:00Z', metadata: {}, marketing_opt_in: true, message: 'Fixture only' },
      { id: ids[2], full_name: 'Synthetic No Phone', email: 'nophone@example.test', phone: null, status: 'new', source: 'homepage_brochure', flow: 'brochure_lead', event_type: 'Birthday', target_date: '2027-08-01', guest_count: 40, budget: null, created_at: '2026-10-03T12:00:00Z', updated_at: '2026-10-03T12:00:00Z', metadata: {}, marketing_opt_in: false, message: 'Fixture only' },
      { id: ids[3], full_name: 'Synthetic Post Tour', email: 'tour@example.test', phone: '+12105550104', status: 'tour_confirmed', source: 'homepage_brochure', flow: 'brochure_lead', event_type: 'Quinceañera', target_date: '2027-09-03', guest_count: 120, budget: '$20k', tour_attendance_status: 'attended', created_at: '2026-10-04T12:00:00Z', updated_at: '2026-10-04T12:00:00Z', metadata: {}, marketing_opt_in: true, message: 'Fixture only' },
      { id: ids[4], full_name: 'Synthetic Paused', email: 'paused@example.test', phone: '+12105550105', status: 'new', source: 'homepage_brochure', flow: 'brochure_lead', event_type: 'Wedding', target_date: '2027-10-03', guest_count: 50, budget: null, created_at: '2026-10-05T12:00:00Z', updated_at: '2026-10-05T12:00:00Z', metadata: {}, marketing_opt_in: true, message: 'Fixture only' },
    ]
    const seq = Object.fromEntries(ids.map((id, i) => [id, { id: `enroll-${i + 1}`, inquiry_id: id, automation_key: 'brochure_lead', status: i === 1 || i === 4 ? 'paused' : 'active', started_at: '2026-10-01T12:00:00Z', response_received_at: null, ended_reason: null, marketing_consent_at_enrollment: true }]))
    const history = []
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== origin) return route.abort()
      const method = route.request().method()
      let body = {}
      try { body = route.request().postDataJSON() || {} } catch {}
      if (url.pathname.startsWith('/portal/leads/')) {
        return route.fulfill({ contentType: 'text/html', body: `<!doctype html><button id="mark-attended" onclick="fetch('/api/qa-lead-update',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'${url.pathname.split('/').pop()}'})})">Mark Tour Attended</button>` })
      }
      if (!url.pathname.startsWith('/api/')) return route.continue()
      requests.push({ path: url.pathname, method, query: url.search, body })
      const json = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
      if (url.pathname === '/api/inquiries' && method === 'GET') return json(leads)
      if (url.pathname === '/api/qa-lead-update' && method === 'POST') {
        const lead = leads.find((item) => item.id === body.id)
        if (lead) lead.tour_attendance_status = 'attended'
        tasks.push({ id: 'task-after-tour', created_at: new Date().toISOString(), inquiry_id: body.id, title: 'Synthetic post-tour follow-up', description: '[follow-up:phone] Created by fixture', due_date: '2026-10-12', due_at: '2026-10-12T15:00:00Z', completed_at: null, priority: 'medium', status: 'pending', assigned_to: 'Synthetic staff' })
        history.unshift({ id: 'history-after-tour', inquiry_id: body.id, kind: 'follow-up', label: 'Synthetic post-tour follow-up', detail: 'Created by fixture', at: new Date().toISOString() })
        return json({ success: true })
      }
      if (url.pathname === '/api/tasks' && method === 'GET') return json({ tasks, assignees: ['Synthetic staff'] })
      if (url.pathname === '/api/tasks' && method === 'POST') {
        const task = { id: `created-${tasks.length}`, created_at: new Date().toISOString(), inquiry_id: body.inquiryId, title: body.title, description: body.description, due_date: body.dueDate, due_at: body.dueAt, completed_at: null, priority: 'medium', status: 'pending', assigned_to: body.assignedTo ?? null }
        tasks.push(task); return json({ task })
      }
      if (url.pathname === '/api/tasks' && method === 'PATCH') { const index = tasks.findIndex((item) => item.id === body.id); if (index >= 0) tasks[index] = { ...tasks[index], ...body }; return json({ success: true }) }
      if (url.pathname === '/api/follow-ups' && method === 'GET' && url.searchParams.get('dashboard') === '1') return json({ emailActions: [], pausedEnrollmentIds: ['enroll-2', 'enroll-5'], pausedEnrollments: [{ id: 'enroll-5', inquiry_id: ids[4] }], sendingEnabled: true })
      if (url.pathname === '/api/follow-ups' && method === 'GET' && url.searchParams.has('inquiryId')) { const id = url.searchParams.get('inquiryId'); return json({ enrollment: seq[id] ?? null, actions: id === ids[1] ? [{ id: 'action-overdue', inquiry_id: id, enrollment_id: 'enroll-2', step_key: 'email_2', channel: 'email', scheduled_at: '2026-10-06T15:00:00Z', status: 'email_queued', email_job_id: 'synthetic-job' }] : [], history: history.filter((item) => item.inquiry_id === id), hasMoreHistory: false }) }
      if (url.pathname === '/api/follow-ups' && method === 'POST') {
        if (body.action === 'resume') return json({ error: 'This paused sequence has an overdue email.' }, 409)
        if (body.action === 'pause') { seq[body.inquiryId].status = 'paused'; return json({ success: true, status: 'paused' }) }
        if (body.action === 'stop') { seq[body.inquiryId].status = 'stopped'; return json({ success: true, status: 'stopped' }) }
        if (body.action === 'recover_overdue') return json({ success: true })
        if (body.action === 'disposition') return json({ success: true, disposition: body.disposition })
        if (body.action === 'response') return json({ recorded: true })
        return json({ success: true })
      }
      if (url.pathname === '/api/notes' && method === 'POST') { history.unshift({ id: `note-${history.length + 1}`, inquiry_id: body.inquiryId, kind: 'note', label: 'Note', detail: body.content, at: new Date().toISOString() }); return json({ success: true }) }
      return json({ error: `unmocked ${method} ${url.pathname}` }, 500)
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${origin}/followups-qa`, { waitUntil: 'domcontentloaded' })
    const cards = page.locator('article[role="button"]')
    await page.getByText('Synthetic action 1').waitFor()
    assert.equal(await cards.count(), 5, 'lead cards are grouped by distinct lead id, including paused-only lead')
    assert.equal(await page.getByText('Due Today', { exact: true }).count(), 1)
    await page.getByRole('button', { name: 'New Leads' }).click()
    assert.equal(await cards.count(), 4)
    await page.getByRole('button', { name: 'Post-Tour' }).click()
    assert.equal(await cards.count(), 1)
    await page.getByRole('button', { name: 'All', exact: true }).click()
    await page.getByLabel('Search leads or follow-ups').fill('Synthetic Demo')
    assert.equal(await cards.count(), 2, 'same-name leads stay distinct')
    await cards.filter({ hasText: 'Synthetic Demo' }).first().getByRole('button', { name: 'View' }).click()
    await page.getByRole('button', { name: 'Schedule Tour' }).click()
    const frame = page.frameLocator('iframe[title="Synthetic Demo workspace"]')
    await frame.locator('#mark-attended').click()
    await page.getByRole('button', { name: /Close Synthetic Demo.*Tour controls/ }).click()
    await page.getByText('Post-Tour', { exact: true }).first().waitFor()
    await page.getByRole('tab', { name: 'Timeline' }).click()
    await page.getByText('Synthetic post-tour follow-up · pending').waitFor()
    assert(requests.some((item) => item.path === '/api/inquiries' && item.method === 'GET'), 'closing the modal refreshed the parent lead data')
    assert(requests.some((item) => item.path === '/api/tasks' && item.method === 'GET'), 'closing the modal refreshed Follow-Up tasks')
    assert(requests.some((item) => item.path === '/api/follow-ups' && item.query.includes('inquiryId=' + ids[0])), 'closing the modal refreshed the selected lead history')
    await page.getByRole('tab', { name: 'Overview' }).click()
    await page.getByRole('button', { name: 'Log Call', exact: true }).click({ force: true })
    assert.equal(await page.getByText('This form does not place a call.').count(), 1)
    assert(!requests.some((item) => item.path.includes('voice') || (item.path.includes('call') && item.method === 'POST')), 'log-only call flow did not place a call')
    await page.getByRole('button', { name: 'Cancel', exact: true }).last().click()
    assert.deepEqual(errors, [], 'browser runtime has no uncaught page errors')
    console.log(JSON.stringify({ pass: true, scenarios: 10, syntheticApiRequests: requests.length, pageErrors: errors.length, checks: ['one row per persistent lead ID', 'due-today count', 'new and post-tour filters', 'same-name search', 'iframe action refreshes lead/tasks/history after close', 'manual call logging has no dial side effect'] }))
    await browser.close()
  } finally {
    if (browser) await browser.close().catch(() => {})
    try { process.kill(-server.pid, 'SIGTERM') } catch {}
    await delay(300)
    fs.rmSync(routeFile, { force: true })
    try { fs.rmdirSync(routeDir) } catch {}
  }
})().catch((error) => { console.error(error); process.exit(1) })
