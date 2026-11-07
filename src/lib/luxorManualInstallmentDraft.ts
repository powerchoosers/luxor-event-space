export type ManualInstallmentPaymentMethod = 'Cash' | 'Zelle' | 'Check' | 'Bank Transfer' | 'ACH' | 'Other'

export type ManualInstallmentPaymentRequest = {
  bookingId: string
  installmentId: string
  amount: number
  paidOn: string
  paymentMethod: ManualInstallmentPaymentMethod
  reference?: string
  notes?: string
  idempotencyKey: string
}

export type ManualInstallmentPaymentDetails = Omit<ManualInstallmentPaymentRequest, 'idempotencyKey'>

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const STORAGE_PREFIX = 'luxor:manual-installment-request:v1:'
const PAYMENT_METHODS: ManualInstallmentPaymentMethod[] = ['Cash', 'Zelle', 'Check', 'Bank Transfer', 'ACH', 'Other']

export function sameManualInstallmentPaymentDetails(previous: ManualInstallmentPaymentRequest, next: ManualInstallmentPaymentDetails) {
  return previous.bookingId === next.bookingId
    && previous.installmentId === next.installmentId
    && previous.amount === next.amount
    && previous.paidOn === next.paidOn
    && previous.paymentMethod === next.paymentMethod
    && (previous.reference || '') === (next.reference || '')
    && (previous.notes || '') === (next.notes || '')
}

export function normalizeLuxorDraftActor(actorEmail: string | null | undefined) {
  const normalized = String(actorEmail || '').trim().toLowerCase()
  return normalized.includes('@') ? normalized : null
}

function storageKey(actorEmail: string) {
  return `${STORAGE_PREFIX}${encodeURIComponent(actorEmail)}`
}

function isPaymentRequest(value: unknown): value is ManualInstallmentPaymentRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.bookingId === 'string' && row.bookingId.length > 0
    && typeof row.installmentId === 'string' && row.installmentId.length > 0
    && typeof row.amount === 'number' && Number.isFinite(row.amount) && row.amount > 0
    && typeof row.paidOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.paidOn)
    && typeof row.paymentMethod === 'string' && PAYMENT_METHODS.includes(row.paymentMethod as ManualInstallmentPaymentMethod)
    && (row.reference === undefined || typeof row.reference === 'string')
    && (row.notes === undefined || typeof row.notes === 'string')
    && typeof row.idempotencyKey === 'string' && row.idempotencyKey.length >= 16
}

export function loadManualInstallmentDraft(storage: DraftStorage | null, actorEmail: string | null | undefined) {
  const actor = normalizeLuxorDraftActor(actorEmail)
  if (!actor || !storage) return { request: null as ManualInstallmentPaymentRequest | null, retryAllowed: true, storageAvailable: false }

  const key = storageKey(actor)
  try {
    const raw = storage.getItem(key)
    if (!raw) return { request: null, retryAllowed: true, storageAvailable: true }
    const saved = JSON.parse(raw) as { version?: unknown; actorEmail?: unknown; request?: unknown; retryAllowed?: unknown } | null
    if (saved?.version === 1 && saved.actorEmail === actor && isPaymentRequest(saved.request)) {
      return { request: saved.request, retryAllowed: saved.retryAllowed !== false, storageAvailable: true }
    }
    storage.removeItem(key)
    return { request: null, retryAllowed: true, storageAvailable: true }
  } catch {
    return { request: null, retryAllowed: true, storageAvailable: false }
  }
}

export function saveManualInstallmentDraft(
  storage: DraftStorage | null,
  actorEmail: string | null | undefined,
  request: ManualInstallmentPaymentRequest,
  retryAllowed = true,
) {
  const actor = normalizeLuxorDraftActor(actorEmail)
  if (!actor || !storage || !isPaymentRequest(request)) return false
  try {
    storage.setItem(storageKey(actor), JSON.stringify({ version: 1, actorEmail: actor, request, retryAllowed }))
    return true
  } catch {
    return false
  }
}

/** Remove only the matching unresolved request, so a stale cleanup cannot erase a newer key. */
export function clearManualInstallmentDraft(
  storage: DraftStorage | null,
  actorEmail: string | null | undefined,
  idempotencyKey: string | null | undefined,
) {
  const actor = normalizeLuxorDraftActor(actorEmail)
  if (!actor || !storage || !idempotencyKey) return false
  const key = storageKey(actor)
  try {
    const raw = storage.getItem(key)
    if (!raw) return true
    const saved = JSON.parse(raw) as { version?: unknown; actorEmail?: unknown; request?: unknown } | null
    if (saved?.version === 1 && saved.actorEmail === actor && isPaymentRequest(saved.request)
      && saved.request.idempotencyKey === idempotencyKey) {
      storage.removeItem(key)
    }
    return true
  } catch {
    return false
  }
}
