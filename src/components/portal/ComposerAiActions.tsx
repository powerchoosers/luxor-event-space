'use client'

import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { FilePenLine, Loader2 } from 'lucide-react'

type Props = {
  channel: 'email' | 'sms'
  value: string
  setValue: Dispatch<SetStateAction<string>>
  contextKey: string
  context?: string
  disabled?: boolean
  writeEndpoint?: string
  polishOnly?: boolean
  onBusyChange?: (busy: boolean) => void
  requestLock?: RefObject<boolean>
}

function plainToHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n?|\n/g, '<br>')
}

// Do not insert model-provided active content or silently change links/images.
function safePolishedHtml(output: string, original: string) {
  const parser = new DOMParser()
  const before = parser.parseFromString(original, 'text/html')
  const after = parser.parseFromString(output, 'text/html')
  const urls = (doc: Document) => Array.from(doc.querySelectorAll('a[href], img[src]')).map((node) => `${node.tagName}:${node.getAttribute(node.tagName === 'A' ? 'href' : 'src')}`).sort().join('\n')
  if (urls(before) !== urls(after)) throw new Error('Elena changed a link or image. Your original draft is still here.')
  if (/^\s*```/.test(output) || !after.body.textContent?.trim()) throw new Error('Elena returned an unreadable draft. Your original draft is still here.')
  for (const tag of ['b', 'strong', 'i', 'em', 'u', 's', 'ul', 'ol', 'li']) {
    if (after.querySelectorAll(tag).length < before.querySelectorAll(tag).length) throw new Error('Elena changed the formatting. Your original draft is still here.')
  }
  const originalAttributes = new Set(Array.from(before.body.querySelectorAll('*')).flatMap((node) => Array.from(node.attributes).map((attribute) => `${node.tagName}:${attribute.name}:${attribute.value}`)))
  const preservedStyles = (doc: Document) => Array.from(doc.body.querySelectorAll('[style]')).map((node) => `${node.tagName}:${node.getAttribute('style')}`).sort()
  const outputStyles = preservedStyles(after)
  if (preservedStyles(before).some((style) => !outputStyles.includes(style))) throw new Error('Elena changed the formatting. Your original draft is still here.')
  const allowed = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'IMG', 'SPAN', 'BLOCKQUOTE'])
  for (const node of Array.from(after.body.querySelectorAll('*'))) {
    if (!allowed.has(node.tagName)) throw new Error('Elena returned unsupported formatting. Your original draft is still here.')
    for (const attribute of Array.from(node.attributes)) {
      if (!['href', 'src', 'alt', 'width', 'height', 'style'].includes(attribute.name) || !originalAttributes.has(`${node.tagName}:${attribute.name}:${attribute.value}`)) node.removeAttribute(attribute.name)
    }
  }
  return after.body.innerHTML
}

export function ComposerAiActions({ channel, value, setValue, contextKey, context = '', disabled = false, writeEndpoint, polishOnly = false, onBusyChange, requestLock }: Props) {
  const [instruction, setInstruction] = useState('')
  const [promptOpen, setPromptOpen] = useState(false)
  const [busy, setBusy] = useState<'write' | 'polish' | null>(null)
  const [status, setStatus] = useState('')
  const inFlight = useRef(false)
  const latest = useRef({ value, contextKey })
  latest.current = { value, contextKey }
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  async function run(mode: 'write' | 'polish') {
    if (inFlight.current || requestLock?.current || disabled || (mode === 'polish' && !value.trim())) return
    const initial = value
    const key = contextKey
    inFlight.current = true
    if (requestLock) requestLock.current = true
    onBusyChange?.(true)
    setBusy(mode)
    setStatus('')
    try {
      const response = await fetch(mode === 'write' && writeEndpoint ? writeEndpoint : '/api/portal/composer-ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'write' && writeEndpoint ? { instruction } : { mode, channel, draft: initial, instruction, context: context.slice(0, 20000), html: channel === 'email' && mode === 'polish' }),
      })
      const data = await response.json() as { draft?: string; error?: string }
      if (!response.ok || !data.draft?.trim()) throw new Error(data.error || 'Elena could not finish. Your draft is still here.')
      const output = channel === 'email' ? mode === 'polish' ? safePolishedHtml(data.draft, initial) : plainToHtml(data.draft.trim()) : data.draft.trim()
      if (!mounted.current) return
      if (latest.current.contextKey !== key || latest.current.value !== initial) {
        setStatus('Your draft changed while Elena was working, so it was kept as-is. Please try again.')
        return
      }
      setValue((current) => current === initial && latest.current.contextKey === key ? output : current)
      setPromptOpen(false)
      setStatus(mode === 'polish' ? 'Polished. Review before sending.' : 'Draft ready. Review before sending.')
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error ? error.message : 'Elena could not finish. Your draft is still here.')
    } finally {
      inFlight.current = false
      if (requestLock) requestLock.current = false
      onBusyChange?.(false)
      if (mounted.current) setBusy(null)
    }
  }
  const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#986c24] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#f1d27a]'
  return <div className="min-w-0">
    {promptOpen && !polishOnly ? <div className="flex flex-wrap items-end gap-2 pb-1">
      <label className="min-w-0 flex-1 text-xs text-[color:var(--portal-muted)]">Direction for Elena <span className="font-normal">(optional)</span><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={2000} rows={2} className="mt-1 min-h-11 w-full resize-y rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] p-2 text-base text-[color:var(--portal-text)] focus:outline-none focus:ring-2 focus:ring-[#caa24c]/50" /></label>
      <button type="button" className={buttonClass} disabled={disabled || Boolean(busy)} onClick={() => void run('write')}>{busy === 'write' ? <Loader2 size={15} className="animate-spin" /> : <FilePenLine size={15} />} Draft</button>
      <button type="button" className={buttonClass} onClick={() => setPromptOpen(false)}>Close</button>
    </div> : null}
    <div className="flex flex-wrap items-center gap-x-2">
      {!polishOnly && !promptOpen ? <button type="button" className={buttonClass} disabled={disabled || Boolean(busy)} onClick={() => setPromptOpen(true)}><FilePenLine size={15} /> Write with Elena</button> : null}
      <button type="button" className={buttonClass} disabled={disabled || Boolean(busy) || !value.trim()} onClick={() => void run('polish')}>{busy === 'polish' ? <Loader2 size={15} className="animate-spin" /> : null} {busy === 'polish' ? 'Polishing…' : 'Polish'}</button>
    </div>
    {busy === 'write' ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">Elena is drafting…</p> : null}
    {status ? <p role="status" aria-live="polite" className="break-words text-xs leading-5 text-[color:var(--portal-muted)]">{status}</p> : null}
  </div>
}
