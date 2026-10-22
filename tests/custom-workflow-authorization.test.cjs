'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const repo = path.resolve(__dirname, '..')
const servicePath = path.join(repo, 'src/lib/luxorCustomWorkflowsServer.ts')
const approved = new Set(['owner@example.invalid', 'marketing@example.invalid'])
const members = new Map()
let lookupCount = 0

function loadServiceWithSyntheticAuth() {
  const source = fs.readFileSync(servicePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: servicePath,
  }).outputText

  const mocks = {
    'server-only': {},
    './luxorEmailDesignSystem': { renderLuxorSystemEmail: () => '' },
    './supabaseRestServer': { supabaseRest: async () => [] },
    './luxorPortalAuth': {
      getAllowedZohoPortalEmails: () => [...approved],
      isAuthorizedLuxorPortalEmail: (email) => approved.has(String(email).trim().toLowerCase()),
    },
    './luxorPortalAccess': {
      getLuxorPortalMember: async (email) => {
        lookupCount += 1
        return members.get(email) || null
      },
      memberCan: (member, permission) => member.role === 'owner' || member.permissions.includes(permission),
    },
    './luxorCustomWorkflowDefinition': {
      cloneCustomWorkflowDefinition: (value) => value,
      createNewContactFollowUpDefinition: () => ({ steps: [] }),
      validateCustomWorkflowDefinition: () => ({ valid: true, issues: [] }),
    },
    './luxorCustomWorkflowFeatureGates': {
      CUSTOM_WORKFLOW_AUTHORING_ENABLED: false,
      CUSTOM_WORKFLOW_EXECUTION_ENABLED: false,
    },
    './luxorCustomWorkflowLifecycle': { evaluateCustomWorkflowLifecycleAction: () => ({ allowed: false }) },
  }

  const loaded = new Module(servicePath, module)
  loaded.filename = servicePath
  loaded.paths = Module._nodeModulePaths(path.dirname(servicePath))
  const realRequire = loaded.require.bind(loaded)
  loaded.require = (specifier) => Object.hasOwn(mocks, specifier) ? mocks[specifier] : realRequire(specifier)
  loaded._compile(compiled, servicePath)
  return loaded.exports
}

const service = loadServiceWithSyntheticAuth()

function member(role, permissions, status = 'active') {
  return { role, permissions, status }
}

test('rejects an unapproved email before looking up a portal member', async () => {
  members.set('unapproved@example.invalid', member('owner', ['marketing']))
  const before = lookupCount
  await assert.rejects(
    service.requireCustomWorkflowOperator('unapproved@example.invalid'),
    (error) => error.status === 403,
  )
  assert.equal(lookupCount, before)
})

test('rejects an approved active member without marketing permission', async () => {
  members.set('marketing@example.invalid', member('agent', ['leads', 'emails']))
  await assert.rejects(
    service.requireCustomWorkflowOperator('marketing@example.invalid'),
    (error) => error.status === 403,
  )
})

test('rejects a suspended approved member even if marketing is listed', async () => {
  members.set('marketing@example.invalid', member('admin', ['marketing'], 'suspended'))
  await assert.rejects(
    service.requireCustomWorkflowOperator('marketing@example.invalid'),
    (error) => error.status === 403,
  )
})

test('rejects an approved operator whose portal member is missing', async () => {
  members.delete('marketing@example.invalid')
  await assert.rejects(
    service.requireCustomWorkflowOperator('marketing@example.invalid'),
    (error) => error.status === 403,
  )
})

test('allows an approved active member only when the existing helper grants marketing', async () => {
  members.set('marketing@example.invalid', member('admin', ['marketing']))
  assert.equal(await service.requireCustomWorkflowOperator(' Marketing@Example.Invalid '), 'marketing@example.invalid')
})

test('preserves existing owner semantics but still requires the approved-operator list', async () => {
  members.set('owner@example.invalid', member('owner', []))
  assert.equal(await service.requireCustomWorkflowOperator('owner@example.invalid'), 'owner@example.invalid')
  await assert.rejects(
    service.requireCustomWorkflowOperator('unapproved@example.invalid'),
    (error) => error.status === 403,
  )
})

test('workflow API routes derive actor identity from the verified session, never request JSON', () => {
  const files = [
    'src/app/api/marketing/custom-workflows/route.ts',
    'src/app/api/marketing/custom-workflows/[workflowId]/route.ts',
    'src/app/api/marketing/custom-workflows/[workflowId]/duplicate/route.ts',
    'src/app/api/marketing/custom-workflows/preview/route.ts',
  ]
  for (const relativePath of files) {
    const source = fs.readFileSync(path.join(repo, relativePath), 'utf8')
    assert.match(source, /getLuxorPortalSession\(/, relativePath)
    assert.doesNotMatch(source, /(?:payload|body)\.actorEmail/, relativePath)
  }
  assert.match(fs.readFileSync(path.join(repo, files[0]), 'utf8'), /listCustomWorkflows\(session\.email\)/)
  assert.match(fs.readFileSync(path.join(repo, files[0]), 'utf8'), /actorEmail:\s*session\.email/)
  assert.match(fs.readFileSync(path.join(repo, files[1]), 'utf8'), /actorEmail:\s*session\.email/)
  assert.match(fs.readFileSync(path.join(repo, files[2]), 'utf8'), /duplicateCustomWorkflow\(workflowId,\s*session\.email\)/)
  assert.match(fs.readFileSync(path.join(repo, files[3]), 'utf8'), /requireCustomWorkflowOperator\(session\.email\)/)
})

test('legacy email fallback stays queryable before the custom-workflow migration', () => {
  const source = fs.readFileSync(path.join(repo, 'src/lib/luxorEmailJobsServer.ts'), 'utf8')
  const match = source.match(/export async function listDueLuxorEmailJobs\(limit = 25\) \{([\s\S]*?)\n\}/)
  assert.ok(match, 'legacy fallback query must remain present')
  assert.match(match[1], /job_type=not\.in\.\([^)]*custom_workflow[^)]*\)/)
  assert.doesNotMatch(match[1], /custom_workflow_step_run_id/)
})
