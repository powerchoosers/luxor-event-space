import type { DeveloperTicketAnnotation } from '@/lib/luxorDeveloperTicketAnnotations'

export type DeveloperTicketSavedAttachment = {
  name: string
  type: string
  kind: 'image' | 'document' | 'text'
  storagePath?: string
  textContent?: string
}
import { parseDeveloperSupportAnnotations } from '@/lib/luxorDeveloperTicketAnnotations'

export type DeveloperTicketDraftPhase = 'compose' | 'review' | 'sent'

export type DeveloperTicketDraft = {
  version: 1
  active: boolean
  phase: DeveloperTicketDraftPhase
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  pagePath: string
  savedAttachments: DeveloperTicketSavedAttachment[]
  selectedAttachmentKeys: string[]
  annotations: DeveloperTicketAnnotation[]
  chatId: string | null
  updatedAt: number
}

const DRAFT_KEY_PREFIX = 'luxor_developer_ticket_draft_v1:'
const EMPTY_DRAFT: DeveloperTicketDraft = {
  version: 1,
  active: false,
  phase: 'compose',
  title: '',
  description: '',
  priority: 'medium',
  pagePath: '/portal',
  savedAttachments: [],
  selectedAttachmentKeys: [],
  annotations: [],
  chatId: null,
  updatedAt: 0,
}

export function developerTicketDraftStorageKey(userEmail: string) {
  return `${DRAFT_KEY_PREFIX}${userEmail.trim().toLowerCase()}`
}

export function readDeveloperTicketDraft(userEmail: string): DeveloperTicketDraft {
  if (typeof window === 'undefined' || !userEmail) return EMPTY_DRAFT
  try {
    const raw = window.localStorage.getItem(developerTicketDraftStorageKey(userEmail))
    if (!raw) return EMPTY_DRAFT
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return EMPTY_DRAFT
    const value = parsed as Record<string, unknown>
    if (value.version !== 1) return EMPTY_DRAFT
    const priority = value.priority
    const validPriority = priority === 'low' || priority === 'medium' || priority === 'high' || priority === 'urgent'
      ? priority
      : 'medium'
    const phase = value.phase === 'review' || value.phase === 'sent' || value.phase === 'compose' ? value.phase : 'compose'
    let annotations: DeveloperTicketAnnotation[] = []
    try {
      annotations = parseDeveloperSupportAnnotations(value.annotations)
    } catch {
      annotations = []
    }
    return {
      version: 1,
      active: value.active === true,
      phase,
      title: typeof value.title === 'string' ? value.title : '',
      description: typeof value.description === 'string' ? value.description : '',
      priority: validPriority,
      pagePath: typeof value.pagePath === 'string' && value.pagePath.trim() ? value.pagePath : '/portal',
      savedAttachments: Array.isArray(value.savedAttachments) ? value.savedAttachments as DeveloperTicketSavedAttachment[] : [],
      selectedAttachmentKeys: Array.isArray(value.selectedAttachmentKeys)
        ? value.selectedAttachmentKeys.filter((item): item is string => typeof item === 'string')
        : [],
      annotations,
      chatId: typeof value.chatId === 'string' ? value.chatId : null,
      updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    }
  } catch {
    return EMPTY_DRAFT
  }
}

export function writeDeveloperTicketDraft(userEmail: string, draft: DeveloperTicketDraft) {
  if (typeof window === 'undefined' || !userEmail) return
  const payload: DeveloperTicketDraft = { ...draft, version: 1, updatedAt: Date.now() }
  window.localStorage.setItem(developerTicketDraftStorageKey(userEmail), JSON.stringify(payload))
  window.dispatchEvent(new CustomEvent('luxor:developer-ticket-draft', { detail: payload }))
}

export function clearDeveloperTicketDraft(userEmail: string) {
  if (typeof window === 'undefined' || !userEmail) return
  window.localStorage.removeItem(developerTicketDraftStorageKey(userEmail))
  window.dispatchEvent(new CustomEvent('luxor:developer-ticket-draft', { detail: EMPTY_DRAFT }))
}

export function subscribeDeveloperTicketDraft(callback: () => void) {
  if (typeof window === 'undefined') return () => {}
  const handler = () => callback()
  window.addEventListener('luxor:developer-ticket-draft', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('luxor:developer-ticket-draft', handler)
    window.removeEventListener('storage', handler)
  }
}