type WorkflowChoice = { id: string; name: string; status: string; kind: 'custom' | 'brochure' | 'system' }

/** Return candidates, never silently choose among similarly named workflows. */
export function matchWorkflowForChat(query: string, custom: Array<{ id: string; name: string; status: string }>, system: Array<{ id: string; name: string }> = []): WorkflowChoice[] {
  const needle = query.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
  if (!needle || needle.length > 120) return []
  const choices: WorkflowChoice[] = [
    { id: 'brochure_lead', name: 'Brochure Lead Follow-Up', status: 'system', kind: 'brochure' },
    ...system.map((item) => ({ id: item.id, name: item.name, status: 'system', kind: 'system' as const })),
    ...custom.map((item) => ({ id: item.id, name: item.name, status: item.status, kind: 'custom' as const })),
  ]
  const exact = choices.filter((item) => item.name.toLocaleLowerCase().replace(/\s+/g, ' ') === needle)
  if (exact.length) return exact
  return choices.filter((item) => item.name.toLocaleLowerCase().includes(needle)).slice(0, 10)
}
