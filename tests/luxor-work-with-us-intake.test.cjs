/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')
const root = path.resolve(__dirname, '..')

function loadTypeScript(filePath, stubs = {}) {
  const source = fs.readFileSync(path.join(root, filePath), 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleKind.CommonJS,
      paths: { '@/*': ['src/*'] },
      baseUrl: root,
    },
  }).outputText
  const absolutePath = path.join(root, filePath)
  const loaded = new Module(absolutePath, module)
  loaded.filename = absolutePath
  loaded.paths = module.paths
  const originalLoad = Module._load
  const alias = (request) => {
    if (request.startsWith('@/')) return path.join(root, 'src', request.slice(2))
    return request
  }
  Module._load = function (request, parent, isMain) {
    const resolved = alias(request)
    if (Object.hasOwn(stubs, request)) return stubs[request]
    if (Object.hasOwn(stubs, resolved)) return stubs[resolved]
    if (fs.existsSync(resolved + '.ts')) {
      return loadTypeScript(path.relative(root, resolved + '.ts'), stubs)
    }
    try {
      return originalLoad.call(this, request, parent, isMain)
    } catch {
      return originalLoad.call(this, resolved, parent, isMain)
    }
  }
  loaded._compile(js, absolutePath)
  Module._load = originalLoad
  return loaded.exports
}

const {
  classifyLuxorWorkWithUsIntake,
  shouldRouteLuxorInquiryToWorkWithUs,
} = loadTypeScript('src/lib/luxorWorkWithUsIntakeServer.ts', { 'server-only': {} })

test('contact-form marketing outreach routes to Work With Us instead of leads', () => {
  const input = {
    flow: 'contact_form',
    source: 'contact_page',
    message: 'Hi, I wanted to discuss marketing partnership opportunities with Luxor.',
    eventType: 'Private celebration',
    pagePath: '/contact',
    metadata: {},
  }
  assert.equal(shouldRouteLuxorInquiryToWorkWithUs(input), true)
  const classified = classifyLuxorWorkWithUsIntake(input)
  assert.equal(classified.isWorkWithUs, true)
  assert.equal(classified.applicationType, 'general')
})

test('event hosting contact messages still count as leads', () => {
  const input = {
    flow: 'contact_form',
    source: 'contact_page',
    message: 'We are planning a Quinceañera for 120 guests and would like pricing.',
    eventType: 'Quinceañera',
    pagePath: '/contact',
    metadata: {},
  }
  assert.equal(shouldRouteLuxorInquiryToWorkWithUs(input), false)
})

test('explicit work-with-us intent from contact query is routed to applications', () => {
  const input = {
    flow: 'contact_form',
    source: 'contact_page',
    message: 'Here is our sponsorship deck.',
    eventType: 'Private celebration',
    pagePath: '/contact',
    metadata: { contactIntent: 'work-with-us' },
  }
  const classified = classifyLuxorWorkWithUsIntake(input)
  assert.equal(classified.isWorkWithUs, true)
  assert.equal(classified.applicationType, 'sponsorship')
})

test('inquiries route intercepts contact-form Work With Us intake before createLuxorInquiry', () => {
  const filename = path.resolve('src/app/api/inquiries/route.ts')
  const source = fs.readFileSync(filename, 'utf8')
  assert.match(source, /submitLuxorPartnerApplicationFromContact/)
  assert.doesNotMatch(source, /isLuxorWorkWithUsMisclassifiedInquiry/)
  assert.match(source, /workWithUsIntake\.isWorkWithUs/)
  assert.match(source, /queueLuxorPartnerApplicationContactStaffAlerts/)
  assert.match(source, /!result\.replayed/)
})

test('partner application review dialog shows applicant message with line breaks', () => {
  const filename = path.resolve('src/components/portal/PartnerApplicationsPanel.tsx')
  const source = fs.readFileSync(filename, 'utf8')
  assert.match(source, /Applicant message/)
  assert.match(source, /whitespace-pre-wrap/)
  assert.match(source, /answers\.message/)
})

test('partner contact staff alert uses rendered inquiry_notification jobs', () => {
  const staffAlerts = path.resolve('src/lib/luxorPartnerApplicationStaffAlertsServer.ts')
  const source = fs.readFileSync(staffAlerts, 'utf8')
  assert.match(source, /notificationKind: 'partner_application_contact'/)
  assert.match(source, /notificationRendered: true/)
  assert.match(source, /listLuxorOwnerNotificationRecipients/)
  assert.ok(source.includes(".replace(/\\n/g, '<br />')"), 'staff alert HTML should preserve newlines')
  const notifications = path.resolve('src/lib/luxorNotificationEmails.ts')
  assert.match(fs.readFileSync(notifications, 'utf8'), /partner_application_contact/)
})