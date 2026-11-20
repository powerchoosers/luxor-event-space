'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PortalButton,
  PortalCardSkeleton,
  PortalFilterBar,
  PortalModal,
  PortalSelect,
  PortalStatusBadge,
  type PortalStatusTone,
} from '@/components/portal/PortalUI'
import {
  LUXOR_MARKET_VENDOR_SPACES,
  LUXOR_PARTNER_APPLICATION_STATUSES,
  LUXOR_PARTNER_APPLICATION_STATUS_LABELS,
  LUXOR_PARTNER_APPLICATION_TYPE_LABELS,
  LUXOR_PARTNER_PAYMENT_STATUSES,
  type LuxorPartnerApplicationStatus,
  type LuxorPartnerApplicationType,
  type LuxorPartnerPaymentStatus,
} from '@/lib/luxorPartnerApplicationTypes'
import { ChevronRight, ClipboardList } from '@/lib/icons/phosphor-compat'

type ApplicationSummary = {
  id: string
  created_at: string
  application_type: LuxorPartnerApplicationType
  status: LuxorPartnerApplicationStatus
  payment_status: LuxorPartnerPaymentStatus | null
  business_name: string
  contact_name: string
  email: string
  phone: string
  vendor_category: string | null
  selected_space: string | null
  selected_space_price_cents: number | null
  typeLabel: string
}

type ApplicationDetail = ApplicationSummary & {
  instagram_handle: string | null
  city: string | null
  website_url: string | null
  requires_electricity: boolean | null
  additional_displays: unknown
  answers: Record<string, unknown>
  internal_notes: string | null
}

type PhotoRow = {
  id: string
  file_name: string
  signedUrl: string | null
}

const typeFilterOptions = [
  { value: 'all', label: 'All types' },
  ...Object.entries(LUXOR_PARTNER_APPLICATION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
]

const statusOptions = LUXOR_PARTNER_APPLICATION_STATUSES.map((value) => ({
  value,
  label: LUXOR_PARTNER_APPLICATION_STATUS_LABELS[value],
}))

const paymentOptions = [
  { value: '', label: 'None' },
  ...LUXOR_PARTNER_PAYMENT_STATUSES.map((value) => ({
    value,
    label: value === 'payment_pending' ? 'Payment Pending' : 'Confirmed',
  })),
]

function statusTone(status: LuxorPartnerApplicationStatus): PortalStatusTone {
  if (status === 'approved') return 'green'
  if (status === 'declined') return 'red'
  if (status === 'under_review') return 'warning'
  return 'neutral'
}

function applicantMessageFromAnswers(answers: Record<string, unknown> | undefined) {
  const message = answers && typeof answers.message === 'string' ? answers.message.trim() : ''
  return message || null
}

function contactFormIntakeLabel(answers: Record<string, unknown> | undefined) {
  return answers?.intake_channel === 'contact_form' ? 'Submitted through the contact form' : null
}

export function PartnerApplicationsPanel() {
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [applications, setApplications] = useState<ApplicationSummary[]>([])
  const [counts, setCounts] = useState({ total: 0, awaitingReview: 0, approved: 0, declined: 0 })
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ApplicationDetail | null>(null)
  const [photos, setPhotos] = useState<PhotoRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusDraft, setStatusDraft] = useState<LuxorPartnerApplicationStatus>('new')
  const [paymentDraft, setPaymentDraft] = useState('')
  const [notesDraft, setNotesDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (typeFilter !== 'all') params.set('type', typeFilter)
      if (search.trim()) params.set('search', search.trim())
      const response = await fetch(`/api/portal/partner-applications?${params.toString()}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Applications unavailable.')
      setApplications(body.applications || [])
      setCounts(body.counts || { total: 0, awaitingReview: 0, approved: 0, declined: 0 })
      setUnavailable(body.unavailable === true)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Applications unavailable.')
    } finally {
      setLoading(false)
    }
  }, [search, typeFilter])

  useEffect(() => {
    void loadList()
  }, [loadList])

  const metricCards = useMemo(
    () => [
      { label: 'Total', value: counts.total },
      { label: 'Awaiting review', value: counts.awaitingReview },
      { label: 'Approved', value: counts.approved },
      { label: 'Declined', value: counts.declined },
    ],
    [counts],
  )

  async function openDetail(id: string) {
    setSelectedId(id)
    setDetailLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/portal/partner-applications/${encodeURIComponent(id)}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Application unavailable.')
      setDetail(body.application)
      setPhotos(body.photos || [])
      setStatusDraft(body.application.status)
      setPaymentDraft(body.application.payment_status || '')
      setNotesDraft(body.application.internal_notes || '')
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'Application unavailable.')
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  async function saveDetail() {
    if (!selectedId) return
    setSaving(true)
    setError('')
    try {
      const response = await fetch(`/api/portal/partner-applications/${encodeURIComponent(selectedId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusDraft,
          payment_status: paymentDraft || null,
          internal_notes: notesDraft,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Unable to save changes.')
      setDetail(body.application)
      await loadList()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {unavailable ? (
        <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-4 py-3 text-sm text-[color:var(--portal-muted)]">
          Partner applications will appear here after the database migration is applied in production.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-4 py-4"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{metric.label}</p>
            <p className="mt-2 font-sans text-2xl font-bold tabular-nums text-[color:var(--portal-text)]">{metric.value}</p>
          </div>
        ))}
      </div>

      <PortalFilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search business, contact, email, phone"
        searchAriaLabel="Search partner applications"
        resultLabel={`${applications.length.toLocaleString()} submission${applications.length === 1 ? '' : 's'}`}
        activeFilters={
          typeFilter !== 'all'
            ? [{ id: 'type', label: LUXOR_PARTNER_APPLICATION_TYPE_LABELS[typeFilter as LuxorPartnerApplicationType], onRemove: () => setTypeFilter('all') }]
            : []
        }
      >
        <PortalSelect
          aria-label="Application type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={typeFilterOptions}
          buttonClassName="min-h-10 w-full sm:min-w-[12rem]"
        />
      </PortalFilterBar>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[color:var(--portal-border)] bg-[color:var(--portal-card)]">
        {loading ? (
          <div className="space-y-3 p-4">
            <PortalCardSkeleton />
            <PortalCardSkeleton />
            <PortalCardSkeleton />
          </div>
        ) : applications.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center px-5 py-12 text-center">
            <ClipboardList className="h-8 w-8 text-[color:var(--portal-faint)]" aria-hidden />
            <p className="mt-3 text-sm font-semibold text-[color:var(--portal-text)]">No applications yet</p>
            <p className="mt-1 max-w-sm text-xs text-[color:var(--portal-muted)]">
              Work With Us submissions will list here once applicants submit through the public forms.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--portal-border)]">
            {applications.map((application) => (
              <li key={application.id}>
                <button
                  type="button"
                  onClick={() => void openDetail(application.id)}
                  className="flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-[color:var(--portal-soft)] sm:px-5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[color:var(--portal-text)]">{application.business_name}</span>
                      <PortalStatusBadge
                        status={LUXOR_PARTNER_APPLICATION_STATUS_LABELS[application.status]}
                        tone={statusTone(application.status)}
                      />
                    </span>
                    <span className="mt-1 block text-xs text-[color:var(--portal-muted)]">
                      {application.typeLabel} · {application.contact_name} · {new Date(application.created_at).toLocaleString()}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[color:var(--portal-faint)]" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PortalModal
        isOpen={Boolean(selectedId)}
        onClose={() => {
          setSelectedId(null)
          setDetail(null)
          setPhotos([])
        }}
        title="Application review"
        maxWidth="max-w-3xl"
      >
        {detailLoading || !detail ? (
          <div className="space-y-3 py-4">
            <PortalCardSkeleton />
            <PortalCardSkeleton />
          </div>
        ) : (
          <div className="space-y-6 py-1">
            {applicantMessageFromAnswers(detail.answers) ? (
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 sm:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Applicant message</p>
                {contactFormIntakeLabel(detail.answers) ? (
                  <p className="mt-1 text-[11px] text-[color:var(--portal-faint)]">{contactFormIntakeLabel(detail.answers)}</p>
                ) : null}
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--portal-text)]">
                  {applicantMessageFromAnswers(detail.answers)}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Business" value={detail.business_name} />
              <DetailField label="Contact" value={detail.contact_name} />
              <DetailField label="Email" value={detail.email} />
              <DetailField label="Phone" value={detail.phone} />
              <DetailField label="Instagram" value={detail.instagram_handle ? `@${detail.instagram_handle}` : '—'} />
              <DetailField label="City" value={detail.city || '—'} />
              <DetailField label="Type" value={LUXOR_PARTNER_APPLICATION_TYPE_LABELS[detail.application_type]} />
              <DetailField label="Submitted" value={new Date(detail.created_at).toLocaleString()} />
            </div>

            {detail.application_type === 'market_vendor' ? (
              <div className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-4 text-sm">
                <p className="font-semibold text-[color:var(--portal-text)]">Market vendor details</p>
                <ul className="mt-2 space-y-1 text-[color:var(--portal-muted)]">
                  <li>Category: {detail.vendor_category || '—'}</li>
                  <li>
                    Space:{' '}
                    {detail.selected_space
                      ? `${LUXOR_MARKET_VENDOR_SPACES[detail.selected_space as keyof typeof LUXOR_MARKET_VENDOR_SPACES]?.label || detail.selected_space} · $${((detail.selected_space_price_cents || 0) / 100).toFixed(0)}`
                      : '—'}
                  </li>
                  <li>Electricity: {detail.requires_electricity ? 'Yes' : 'No'}</li>
                  <li>
                    Additional displays:{' '}
                    {Array.isArray(detail.additional_displays) && detail.additional_displays.length
                      ? detail.additional_displays.join(', ')
                      : 'None listed'}
                  </li>
                </ul>
              </div>
            ) : null}

            {typeof detail.answers?.product_description === 'string' ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Product description</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--portal-text)]">{detail.answers.product_description}</p>
              </div>
            ) : null}

            {photos.length ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">Photos</p>
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {photos.map((photo) => (
                    <li key={photo.id} className="rounded-lg border border-[color:var(--portal-border)] p-2 text-xs">
                      {photo.signedUrl ? (
                        <a href={photo.signedUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#a8792f] dark:text-[#e6c77f]">
                          {photo.file_name}
                        </a>
                      ) : (
                        <span>{photo.file_name} (link unavailable)</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-[color:var(--portal-text)]">Status</span>
                <PortalSelect
                  aria-label="Application status"
                  value={statusDraft}
                  onChange={(value) => setStatusDraft(value as LuxorPartnerApplicationStatus)}
                  options={statusOptions}
                  buttonClassName="mt-2 w-full"
                />
              </label>
              {detail.application_type === 'market_vendor' ? (
                <label className="block">
                  <span className="text-xs font-semibold text-[color:var(--portal-text)]">Payment status</span>
                  <PortalSelect
                    aria-label="Payment status"
                    value={paymentDraft}
                    onChange={setPaymentDraft}
                    options={paymentOptions}
                    buttonClassName="mt-2 w-full"
                  />
                </label>
              ) : null}
            </div>

            <label className="block">
              <span className="text-xs font-semibold text-[color:var(--portal-text)]">Internal notes</span>
              <textarea
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-sm text-[color:var(--portal-text)]"
              />
            </label>

            <div className="flex justify-end gap-2">
              <PortalButton type="button" variant="secondary" onClick={() => setSelectedId(null)}>
                Close
              </PortalButton>
              <PortalButton type="button" variant="primary" disabled={saving} onClick={() => void saveDetail()}>
                Save changes
              </PortalButton>
            </div>
          </div>
        )}
      </PortalModal>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--portal-muted)]">{label}</p>
      <p className="mt-1 text-sm text-[color:var(--portal-text)]">{value}</p>
    </div>
  )
}