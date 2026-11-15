#!/usr/bin/env node
'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const artifactDir = '/opt/cursor/artifacts'

process.env.LUXOR_ELENA_MAIL_ADDRESS = process.env.LUXOR_ELENA_MAIL_ADDRESS || 'elena@luxoratlaspalmas.com'
process.env.LUXOR_MAIL_ALLOWED_SENDERS =
  process.env.LUXOR_MAIL_ALLOWED_SENDERS || 'booking@luxoratlaspalmas.com,hello@luxoratlaspalmas.com,elena@luxoratlaspalmas.com'

const moduleCache = new Map()

function resolveLuxorModuleFile(fromFile, request) {
  if (!request.startsWith('.')) return null
  const base = path.resolve(path.dirname(fromFile), request)
  for (const suffix of ['', '.ts', '.tsx', '.js', '/index.ts', '/index.js']) {
    const candidate = base.endsWith('.ts') || base.endsWith('.js') ? base : `${base}${suffix}`
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

function compileModule(relativePath, stubs = {}) {
  const filename = path.join(root, relativePath)
  if (moduleCache.has(filename)) return moduleCache.get(filename)

  const source = fs.readFileSync(filename, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = loaded.require.bind(loaded)
  loaded.require = (name) => {
    if (Object.hasOwn(stubs, name)) return stubs[name]
    const resolved = resolveLuxorModuleFile(filename, name)
    if (resolved) {
      const rel = path.relative(root, resolved).split(path.sep).join('/')
      return compileModule(rel, stubs)
    }
    return original(name)
  }
  loaded._compile(compiled, filename)
  moduleCache.set(filename, loaded.exports)
  return loaded.exports
}

const email = compileModule('src/lib/luxorSalesBriefingEmail.ts', {
  'server-only': {},
})

const basePipeline = {
  briefingDateKey: '2026-11-15',
  newInquiries: [
    {
      id: 'lead-new-1',
      name: 'Victoria Cardenas',
      eventType: 'Quinceañera',
      status: 'new',
      href: '/portal/leads/sample-new',
      waitingLabel: 'waiting 3h',
    },
    {
      id: 'lead-new-2',
      name: 'Rebecca Aleman',
      eventType: 'Wedding Reception',
      status: 'contacted',
      href: '/portal/leads/sample-contacted',
      waitingLabel: 'waiting 14h',
    },
  ],
  openInquiriesCount: 14,
  openInquiryHighlights: [
    {
      id: 'lead-open-1',
      name: 'Mia Ortega',
      eventType: 'Sweet 16',
      status: 'proposal_sent',
      href: '/portal/leads/sample-open',
    },
  ],
  leadsToCallToday: [
    {
      id: 'task-call-1',
      name: 'Rebecca Aleman',
      detail: 'Call Rebecca for her tour follow-up',
      href: '/portal/leads/sample-contacted',
    },
  ],
  toursToday: [
    {
      id: 'visit-today-1',
      name: 'Sofia Ramirez',
      tourDate: '2026-11-15',
      tourTime: '11:00 AM',
      tourStatus: 'Confirmed',
      href: '/portal/leads/sample-tour-today',
    },
  ],
  upcomingTours: [
    {
      id: 'visit-upcoming-1',
      name: 'Daniel & Priya',
      tourDate: '2026-11-18',
      tourTime: '5:30 PM',
      tourStatus: 'Requested',
      href: '/portal/leads/sample-tour-upcoming',
    },
  ],
  awaitingBookingPayment: [
    {
      id: 'booking-pay-1',
      clientName: 'Elena Morales',
      eventDate: '2027-03-14',
      href: '/portal/leads/sample-deposit',
    },
  ],
  eventsNext14Days: [
    {
      id: 'booking-event-1',
      clientName: 'Carter Family',
      eventDate: '2026-11-22',
      eventType: 'Celebration of Life',
      href: '/portal/leads/sample-event',
    },
  ],
  overdueFollowUps: [
    {
      id: 'task-overdue-1',
      name: 'Mia Ortega',
      detail: 'Due 2026-11-13',
      href: '/portal/leads/sample-open',
    },
  ],
  tourNoShowsToRebook: [
    {
      id: 'visit-noshow-1',
      name: 'Jordan Lee',
      tourDate: '2026-11-12',
      tourTime: '4:00 PM',
      tourStatus: 'No-show',
      href: '/portal/leads/sample-noshow',
    },
  ],
  dailyPriorities: [
    {
      id: 'priority-1',
      priority_date: '2026-11-15',
      rank: 1,
      title: 'Call Rebecca before her Saturday tour follow-up window closes.',
      meta: 'Due today',
      action_type: 'call',
      reasoning: '',
      href: '/portal/leads/sample-contacted',
      is_overdue: false,
      completed: false,
      completed_at: null,
      target_id: 'lead-new-2',
      target_type: 'lead',
      created_at: '2026-11-15T12:00:00.000Z',
      updated_at: '2026-11-15T12:00:00.000Z',
    },
  ],
}

const marcusCoaching = {
  headline: 'Lead with follow-ups before noon.',
  coachingMarkdown:
    'Victoria and Rebecca both need a human touch today.\n\n**On the phone today**\n- Ask for the date first, then the guest count.\n- After a price question, offer a tour before quoting.',
  focusItems: [
    { title: 'Post-tour speed', detail: 'Send custom proposals within 24 hours of every attended tour.' },
    { title: 'Booking payment chase', detail: 'Signed agreements without the initial booking payment get a calm check-in call.' },
  ],
}

function writePreview(filename, rendered) {
  const outPath = path.join(artifactDir, filename)
  fs.mkdirSync(artifactDir, { recursive: true })
  fs.writeFileSync(outPath, rendered.html, 'utf8')
  console.log(`Wrote ${outPath} (${rendered.html.length} bytes)`)
  console.log(`Subject: ${rendered.subject}`)
}

const marcusRendered = email.renderLuxorSalesBriefingEmail({
  siteOrigin: 'https://www.luxoratlaspalmas.com',
  pipeline: basePipeline,
  marcusBriefingReady: true,
  coaching: marcusCoaching,
  senderPhone: '+12105550111',
})

const neutralRendered = email.renderLuxorSalesBriefingEmail({
  siteOrigin: 'https://www.luxoratlaspalmas.com',
  pipeline: {
    ...basePipeline,
    leadsToCallToday: [],
    overdueFollowUps: [],
    tourNoShowsToRebook: [],
    toursToday: [],
    upcomingTours: [],
    awaitingBookingPayment: [],
  },
  marcusBriefingReady: false,
  coaching: null,
  senderPhone: '+12105550111',
})

writePreview('sales-briefing-preview-marcus-ready.html', marcusRendered)
writePreview('sales-briefing-preview-neutral.html', neutralRendered)
writePreview('sales-briefing-preview.html', marcusRendered)