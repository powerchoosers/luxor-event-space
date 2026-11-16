import type { DeveloperTicketElementDescriptor, DeveloperTicketViewport } from '@/lib/luxorDeveloperTicketAnnotations'

const DEV_IGNORE = '[data-portal-dev-ignore], [data-portal-elena-chat], .portal-elena-chat-panel, .portal-developer-mode-chrome'

export function readDeveloperTicketViewport(): DeveloperTicketViewport {
  if (typeof window === 'undefined') return { width: 0, height: 0 }
  return {
    width: Math.round(window.innerWidth),
    height: Math.round(window.innerHeight),
  }
}

export function isDeveloperTicketSensitiveElement(element: Element | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return true
  if (element.closest(DEV_IGNORE)) return true
  const tag = element.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const input = element as HTMLInputElement
    const type = (input.type || '').toLowerCase()
    if (type === 'password' || type === 'hidden') return true
    const ac = (input.autocomplete || '').toLowerCase()
    if (ac.includes('cc-') || ac.includes('password') || ac.includes('one-time')) return true
    const name = `${input.name || ''} ${input.id || ''}`.toLowerCase()
    if (/password|secret|ssn|social|credit|card|cvc|cvv|token/.test(name)) return true
  }
  if (element.getAttribute('aria-hidden') === 'true') return true
  if (element.getAttribute('data-sensitive') === 'true') return true
  return false
}

function implicitRole(tag: string): string | null {
  if (tag === 'button') return 'button'
  if (tag === 'a') return 'link'
  if (tag === 'input') return 'textbox'
  if (tag === 'textarea') return 'textbox'
  if (tag === 'select') return 'combobox'
  if (tag === 'img') return 'img'
  if (tag === 'nav') return 'navigation'
  if (tag === 'main') return 'main'
  if (tag === 'header') return 'banner'
  if (tag === 'footer') return 'contentinfo'
  if (/^h[1-6]$/.test(tag)) return 'heading'
  return null
}

function visibleTextSnippet(element: HTMLElement): string | null {
  const labeled = element.getAttribute('aria-label')
    || (element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent : null)
    || element.getAttribute('title')
  if (labeled?.trim()) return labeled.trim().slice(0, 120)
  const text = element.innerText?.trim().replace(/\s+/g, ' ')
  if (!text) return null
  return text.slice(0, 120)
}

function labelForElement(element: HTMLElement): string {
  const aria = element.getAttribute('aria-label')?.trim()
  if (aria) return aria.slice(0, 120)
  const labelledby = element.getAttribute('aria-labelledby')
  if (labelledby) {
    const node = document.getElementById(labelledby)
    if (node?.textContent?.trim()) return node.textContent.trim().slice(0, 120)
  }
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
    if (label?.textContent?.trim()) return label.textContent.trim().slice(0, 120)
  }
  const text = element.innerText?.trim().replace(/\s+/g, ' ')
  if (text) return text.slice(0, 120)
  const tag = element.tagName.toLowerCase()
  return tag
}

function selectorForElement(element: HTMLElement): string {
  if (element.id) {
    const id = element.id.trim()
    if (id && /^[a-zA-Z][\w:-]*$/.test(id)) return `#${id}`
  }
  const testId = element.getAttribute('data-testid') || element.getAttribute('data-test-id')
  if (testId?.trim()) return `[data-testid="${testId.trim().slice(0, 80)}"]`
  const parts: string[] = []
  let current: HTMLElement | null = element
  let depth = 0
  while (current && current !== document.body && depth < 6) {
    const tag = current.tagName.toLowerCase()
    const parent: HTMLElement | null = current.parentElement
    if (!parent) {
      parts.unshift(tag)
      break
    }
    const anchor = current
    const siblings = Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.tagName === anchor.tagName)
    const index = siblings.indexOf(current) + 1
    parts.unshift(`${tag}:nth-of-type(${index})`)
    current = parent
    depth += 1
  }
  return parts.join(' > ').slice(0, 512)
}

export function buildDeveloperTicketElementDescriptor(element: Element): DeveloperTicketElementDescriptor | null {
  if (!(element instanceof HTMLElement)) return null
  if (isDeveloperTicketSensitiveElement(element)) return null
  const tag = element.tagName.toLowerCase()
  const role = element.getAttribute('role')?.trim() || implicitRole(tag)
  return {
    selector: selectorForElement(element),
    role,
    label: labelForElement(element),
    visibleText: visibleTextSnippet(element),
  }
}

export function isPointOverDeveloperIgnoredSurface(clientX: number, clientY: number): boolean {
  if (typeof document === 'undefined') return false
  const topElement = document.elementFromPoint(clientX, clientY)
  if (topElement && topElement.closest(DEV_IGNORE)) return true
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const node of stack) {
    if (node instanceof HTMLElement && node.closest(DEV_IGNORE)) {
      const rect = node.getBoundingClientRect()
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return true
      }
    }
  }
  return false
}

export function pickDeveloperTicketElementAtPoint(clientX: number, clientY: number): HTMLElement | null {
  if (typeof document === 'undefined') return null
  if (isPointOverDeveloperIgnoredSurface(clientX, clientY)) return null
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue
    if (node.closest(DEV_IGNORE)) continue
    if (isDeveloperTicketSensitiveElement(node)) continue
    if (node === document.body || node === document.documentElement) continue
    return node
  }
  return null
}