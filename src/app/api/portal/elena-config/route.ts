import { NextResponse } from 'next/server'
import { getLuxorPortalSession } from '@/lib/luxorPortalAuth'
import { getLuxorPortalMember, memberCan } from '@/lib/luxorPortalAccess'
import { getElenaManagementState, DEFAULT_ELENA_INSTRUCTIONS, type ElenaInstructions } from '@/lib/luxorElenaServer'
import { getDefaultLuxorProposalPricing } from '@/lib/luxorProposalPricingServer'
import { listAvailableLuxorTourSlots } from '@/lib/luxorTourSlotsServer'
import { supabaseRest } from '@/lib/supabaseRestServer'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SOURCE_TYPES = new Set(['manual', 'import', 'website', 'connected'])
const INSTRUCTION_KEYS = Object.keys(DEFAULT_ELENA_INSTRUCTIONS) as Array<keyof ElenaInstructions>

async function requireElenaManager() {
  const session = await getLuxorPortalSession()
  if (!session) return { error: NextResponse.json({ error: 'Portal login required.' }, { status: 401 }) }
  const member = await getLuxorPortalMember(session.email)
  if (!member || member.role === 'agent' || !memberCan(member, 'settings')) {
    return { error: NextResponse.json({ error: 'Elena settings are managed by an owner or administrator.' }, { status: 403 }) }
  }
  return { session, member }
}

function cleanText(value: unknown, max: number) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function cleanInstructions(value: unknown): ElenaInstructions {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return Object.fromEntries(INSTRUCTION_KEYS.map((key) => [key, cleanText(input[key], 2000) || DEFAULT_ELENA_INSTRUCTIONS[key]])) as ElenaInstructions
}

function cleanSteps(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map((step) => cleanText(step, 600)).filter(Boolean).slice(0, 20)
}

async function audit(action: string, entityType: string, entityId: string | null, actor: string, details: Record<string, unknown> = {}) {
  await supabaseRest('luxor_elena_audit', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ action, entity_type: entityType, entity_id: entityId, actor_email: actor, details }),
  })
}

function parseImportedText(raw: string, sourceLabel: string, category: string) {
  const text = raw.replace(/\r\n/g, '\n').trim().slice(0, 100_000)
  if (!text) return []

  const faqMatches = [...text.matchAll(/(?:^|\n)\s*(?:Q(?:uestion)?\s*[:.-]\s*)?([^\n?]{3,180}\?)\s*\n?\s*(?:A(?:nswer)?\s*[:.-]\s*)?([\s\S]*?)(?=\n\s*(?:Q(?:uestion)?\s*[:.-]\s*)?[^\n?]{3,180}\?\s*(?:\n|$)|$)/gi)]
  if (faqMatches.length) {
    return faqMatches.slice(0, 40).map((match, index) => ({
      title: cleanText(match[1], 180) || `Imported question ${index + 1}`,
      content: cleanText(match[2], 8000),
      category,
      source_type: 'import',
      source_label: sourceLabel,
      active: false,
      archived: false,
      sort_order: index * 10,
    })).filter((entry) => entry.content)
  }

  const sections = text.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean)
  return sections.slice(0, 40).map((section, index) => {
    const lines = section.split('\n').map((line) => line.trim()).filter(Boolean)
    const firstLine = lines[0]?.replace(/^#{1,6}\s*/, '') || ''
    const hasHeading = lines.length > 1 && firstLine.length <= 180
    return {
      title: hasHeading ? firstLine : `${sourceLabel} ${index + 1}`,
      content: cleanText(hasHeading ? lines.slice(1).join('\n') : section, 8000),
      category,
      source_type: 'import',
      source_label: sourceLabel,
      active: false,
      archived: false,
      sort_order: index * 10,
    }
  }).filter((entry) => entry.content)
}

function flattenWebsiteContent(value: unknown, path: string[] = []): Array<{ path: string; text: string }> {
  if (typeof value === 'string' && value.trim().length >= 12) return [{ path: path.join(' › '), text: value.trim() }]
  if (Array.isArray(value)) return value.flatMap((item, index) => flattenWebsiteContent(item, [...path, String(index + 1)]))
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => flattenWebsiteContent(item, [...path, key]))
  }
  return []
}

async function connectedDataSummary() {
  const [pricing, tours, siteContent] = await Promise.all([
    getDefaultLuxorProposalPricing().then((record) => ({ status: 'connected', detail: `Catalog v${record.version}` })).catch(() => ({ status: 'unavailable', detail: 'Pricing catalog could not be read' })),
    listAvailableLuxorTourSlots(500).then((slots) => ({ status: 'connected', detail: `${slots.length} current opening${slots.length === 1 ? '' : 's'}` })).catch(() => ({ status: 'unavailable', detail: 'Tour availability could not be read' })),
    supabaseRest<Array<{ page_name: string }>>('luxor_site_content?select=page_name').then((rows) => ({ status: 'connected', detail: `${rows.length} website page${rows.length === 1 ? '' : 's'}` })).catch(() => ({ status: 'unavailable', detail: 'Website content could not be read' })),
  ])
  return { pricing, tours, siteContent, venue: { status: 'connected', detail: 'Verified venue record' } }
}

export async function GET() {
  try {
    const auth = await requireElenaManager()
    if ('error' in auth) return auth.error
    const [state, connections] = await Promise.all([getElenaManagementState(), connectedDataSummary()])
    return NextResponse.json({ ...state, connections })
  } catch (error) {
    console.error('Failed to load Elena management:', error)
    return NextResponse.json({ error: 'Elena settings are unavailable. Please try again.' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireElenaManager()
    if ('error' in auth) return auth.error
    const actor = auth.session.email.toLowerCase()
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = cleanText(body.action, 40)

    if (action === 'save_instructions') {
      const instructions = cleanInstructions(body.instructions)
      const [row] = await supabaseRest('luxor_elena_settings?scope=eq.public&select=*', {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ draft_instructions: instructions, updated_by: actor }),
      }) as Array<Record<string, unknown>>
      await audit('save_draft', 'instructions', 'public', actor)
      return NextResponse.json({ settings: row })
    }

    if (action === 'save_knowledge') {
      const id = cleanText(body.id, 64)
      if (id && !UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid knowledge entry.' }, { status: 400 })
      const title = cleanText(body.title, 180)
      const content = cleanText(body.content, 8000)
      const category = cleanText(body.category, 100)
      const sourceType = cleanText(body.source_type, 30) || 'manual'
      if (!title || !content || !category || !SOURCE_TYPES.has(sourceType)) {
        return NextResponse.json({ error: 'Title, category, and knowledge are required.' }, { status: 400 })
      }
      const record = {
        title, content, category, source_type: sourceType,
        source_label: cleanText(body.source_label, 200) || (sourceType === 'manual' ? 'Owner entry' : null),
        active: body.active === true,
        archived: false,
        sort_order: Math.max(0, Math.min(100_000, Number(body.sort_order) || 0)),
        updated_by: actor,
      }
      const path = id ? `luxor_elena_knowledge?id=eq.${encodeURIComponent(id)}&select=*` : 'luxor_elena_knowledge?select=*'
      const [saved] = await supabaseRest(path, {
        method: id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify(id ? record : { ...record, created_by: actor }),
      }) as Array<Record<string, unknown>>
      if (!saved) return NextResponse.json({ error: 'Knowledge entry could not be saved.' }, { status: 404 })
      await audit(id ? 'update' : 'create', 'knowledge', String(saved.id), actor, { title, active: record.active })
      return NextResponse.json({ knowledge: saved })
    }

    if (action === 'archive_knowledge') {
      const id = cleanText(body.id, 64)
      if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid knowledge entry.' }, { status: 400 })
      const [saved] = await supabaseRest(`luxor_elena_knowledge?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ archived: true, active: false, updated_by: actor }),
      }) as Array<Record<string, unknown>>
      if (!saved) return NextResponse.json({ error: 'Knowledge entry was not found.' }, { status: 404 })
      await audit('archive_draft', 'knowledge', id, actor)
      return NextResponse.json({ knowledge: saved })
    }

    if (action === 'save_flow') {
      const id = cleanText(body.id, 64)
      if (id && !UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid flow.' }, { status: 400 })
      const name = cleanText(body.name, 160)
      const steps = cleanSteps(body.steps)
      if (!name || !steps.length) return NextResponse.json({ error: 'A flow name and at least one step are required.' }, { status: 400 })
      const record = {
        name,
        description: cleanText(body.description, 1000),
        trigger_text: cleanText(body.trigger_text, 1000),
        steps,
        active: body.active === true,
        archived: false,
        sort_order: Math.max(0, Math.min(100_000, Number(body.sort_order) || 0)),
        updated_by: actor,
      }
      const path = id ? `luxor_elena_flows?id=eq.${encodeURIComponent(id)}&select=*` : 'luxor_elena_flows?select=*'
      const [saved] = await supabaseRest(path, {
        method: id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify(id ? record : { ...record, created_by: actor }),
      }) as Array<Record<string, unknown>>
      if (!saved) return NextResponse.json({ error: 'Flow could not be saved.' }, { status: 404 })
      await audit(id ? 'update' : 'create', 'flow', String(saved.id), actor, { name, active: record.active })
      return NextResponse.json({ flow: saved })
    }

    if (action === 'archive_flow') {
      const id = cleanText(body.id, 64)
      if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'Invalid flow.' }, { status: 400 })
      const [saved] = await supabaseRest(`luxor_elena_flows?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ archived: true, active: false, updated_by: actor }),
      }) as Array<Record<string, unknown>>
      if (!saved) return NextResponse.json({ error: 'Flow was not found.' }, { status: 404 })
      await audit('archive_draft', 'flow', id, actor)
      return NextResponse.json({ flow: saved })
    }

    if (action === 'import_text') {
      const label = cleanText(body.source_label, 200) || 'Imported knowledge'
      const category = cleanText(body.category, 100) || 'Frequently Asked Questions'
      const rows = parseImportedText(cleanText(body.text, 100_000), label, category)
      if (!rows.length) return NextResponse.json({ error: 'No reviewable knowledge was found in that content.' }, { status: 400 })
      const saved = await supabaseRest('luxor_elena_knowledge?select=*', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify(rows.map((row) => ({ ...row, created_by: actor, updated_by: actor }))),
      }) as Array<Record<string, unknown>>
      await audit('import', 'knowledge', null, actor, { source: label, count: saved.length })
      return NextResponse.json({ knowledge: saved, count: saved.length })
    }

    if (action === 'import_website') {
      const [records, existingRows] = await Promise.all([
        supabaseRest<Array<{ page_name: string; content: unknown }>>('luxor_site_content?select=page_name,content'),
        supabaseRest<Array<{ title: string; source_label: string | null }>>('luxor_elena_knowledge?source_type=eq.website&archived=eq.false&select=title,source_label'),
      ])
      const existing = new Set(existingRows.map((row) => `${row.source_label || ''}\n${row.title}`.toLowerCase()))
      const rows = records.flatMap((record) => flattenWebsiteContent(record.content, [record.page_name]).slice(0, 20).map((item, index) => ({
        title: cleanText(item.path || `${record.page_name} content ${index + 1}`, 180),
        content: cleanText(item.text, 8000),
        category: 'Venue Information',
        source_type: 'website',
        source_label: `Website: ${record.page_name}`,
        active: false,
        archived: false,
        sort_order: index * 10,
        created_by: actor,
        updated_by: actor,
      }))).filter((row) => !existing.has(`${row.source_label}\n${row.title}`.toLowerCase())).slice(0, 60)
      if (!rows.length) return NextResponse.json({ error: 'Website knowledge is already up to date for the available saved content.' }, { status: 400 })
      const saved = await supabaseRest('luxor_elena_knowledge?select=*', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(rows),
      }) as Array<Record<string, unknown>>
      await audit('import', 'knowledge', null, actor, { source: 'website', count: saved.length })
      return NextResponse.json({ knowledge: saved, count: saved.length })
    }

    if (action === 'publish') {
      const result = await supabaseRest<Record<string, unknown>>('rpc/luxor_publish_elena_configuration', {
        method: 'POST', body: JSON.stringify({ p_actor: actor }),
      })
      return NextResponse.json({ published: result })
    }

    return NextResponse.json({ error: 'Unsupported Elena configuration action.' }, { status: 400 })
  } catch (error) {
    console.error('Failed to update Elena configuration:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Elena could not save that change.' }, { status: 500 })
  }
}
