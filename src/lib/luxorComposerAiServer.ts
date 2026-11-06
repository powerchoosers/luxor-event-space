import 'server-only'

export async function completeComposerMessage(system: string, user: string, options: { temperature?: number; title?: string } = {}) {
  const key = process.env.OPEN_ROUTER_API_KEY
  if (!key) throw new Error('Elena is temporarily unavailable. Please try again later.')
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    cache: 'no-store',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://www.luxoratlaspalmas.com', 'X-Title': options.title || 'Luxor Elena Composer' },
    body: JSON.stringify({ model: 'google/gemini-2.5-flash', temperature: options.temperature ?? 0.35, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error('Elena could not finish. Please try again.')
  const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
  const draft = result.choices?.[0]?.message?.content?.trim()
  if (!draft) throw new Error('Elena returned an empty message. Please try again.')
  return draft
}
