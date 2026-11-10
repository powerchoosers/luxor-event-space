'use client'

import { useEffect, useState } from 'react'
import { PortalButton, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import type { LuxorVendor } from '@/lib/luxorInquiryTypes'
import { lookupProviderWebsite, type WebsiteSuggestion } from '@/lib/luxorProviderWebsiteLookupClient'

export type VendorDetails = LuxorVendor & { archived_at?: string | null; contact_person?: string | null; business_website?: string | null; mailing_address?: string | null; vendor_category?: string | null; internal_notes?: string | null }
const CATEGORIES = ['Venue Maintenance', 'Utilities', 'Insurance', 'Marketing', 'Event Rentals', 'Decor', 'Entertainment', 'Catering', 'Cleaning', 'Security', 'Technology', 'Professional Services', 'Other', 'DJs & Music', 'Fine Caterers', 'Security Crew', 'Florist Services', 'Rentals & Decor', 'Valet Service', 'Bartenders', 'Photographers', 'Makeup Artist']
type FormValues = {
  name: string
  email: string
  phone: string
  vendor_type: string
  contact_person: string
  business_website: string
  mailing_address: string
  vendor_category: string
  internal_notes: string
}
function formState(vendor: VendorDetails): FormValues {
  return {
    name: vendor.name,
    email: vendor.email || '',
    phone: vendor.phone || '',
    vendor_type: vendor.vendor_type || 'Other',
    contact_person: vendor.contact_person || '',
    business_website: vendor.business_website || '',
    mailing_address: vendor.mailing_address || '',
    vendor_category: vendor.vendor_category || '',
    internal_notes: vendor.internal_notes || '',
  }
}
function profileFieldsStored(vendor: VendorDetails) {
  return vendor.contact_person !== undefined
    || vendor.business_website !== undefined
    || vendor.mailing_address !== undefined
    || vendor.vendor_category !== undefined
    || vendor.internal_notes !== undefined
}

export default function VendorBusinessDetails({ vendor, onSaved, onWebsiteSuggested }: { vendor: VendorDetails; onSaved: (vendor: VendorDetails) => void; onWebsiteSuggested?: (vendorId: string, suggestion: WebsiteSuggestion | null) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [lookupBusy, setLookupBusy] = useState(false)
  const [suggestion, setSuggestion] = useState<WebsiteSuggestion | null>(null)
  const [lookupMessage, setLookupMessage] = useState('')
  const [editVersion, setEditVersion] = useState(vendor.updated_at)
  const [values, setValues] = useState<FormValues>(() => formState(vendor))
  const profileReady = profileFieldsStored(vendor)
  const options = CATEGORIES.includes(values.vendor_type) ? CATEGORIES : [values.vendor_type, ...CATEGORIES]
  useEffect(() => {
    if (!profileReady || vendor.archived_at || vendor.business_website) return
    let live = true
    setSuggestion(null)
    setLookupBusy(true)
    void lookupProviderWebsite(vendor).then((result) => {
      if (!live) return
      setSuggestion(result)
      if (result) onWebsiteSuggested?.(vendor.id, result)
    }).catch(() => { /* Manual retry remains available. */ }).finally(() => { if (live) setLookupBusy(false) })
    return () => { live = false }
  }, [vendor.id, vendor.name, vendor.vendor_type, vendor.business_website, vendor.archived_at, profileReady, onWebsiteSuggested])
  function begin() {
    setValues(formState(vendor))
    setEditVersion(vendor.updated_at)
    setMessage('')
    setLookupMessage('')
    setOpen(true)
  }
  async function findWebsite() {
    setLookupBusy(true); setLookupMessage(''); setSuggestion(null)
    try {
      const result = await lookupProviderWebsite(vendor, true)
      if (!result) setLookupMessage('No grounded match found. Enter the website if you know it.')
      else { setSuggestion(result); onWebsiteSuggested?.(vendor.id, result) }
    } catch (error) { setLookupMessage(error instanceof Error ? error.message : 'Website lookup failed.') }
    finally { setLookupBusy(false) }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const payload: Record<string, string> = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      vendor_type: values.vendor_type,
      expectedUpdatedAt: editVersion,
    }
    if (profileReady) {
      payload.contact_person = values.contact_person
      payload.business_website = values.business_website
      payload.mailing_address = values.mailing_address
      payload.vendor_category = values.vendor_category
      payload.internal_notes = values.internal_notes
    }
    try {
      const response = await fetch(`/api/portal/vendor-profile/${encodeURIComponent(vendor.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Vendor details could not be saved.')
      const saved = { ...vendor, ...(result as VendorDetails) } as VendorDetails
      if (profileReady) {
        saved.contact_person = values.contact_person.trim() || null
        saved.business_website = values.business_website.trim() || null
        saved.mailing_address = values.mailing_address.trim() || null
        saved.vendor_category = values.vendor_category.trim() || null
        saved.internal_notes = values.internal_notes.trim() || null
      }
      onSaved(saved)
      setOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Vendor details could not be saved.')
    } finally {
      setBusy(false)
    }
  }
  const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-card)] px-3 text-sm text-[color:var(--portal-text)]'
  return <>
    <div className="space-y-2"><PortalButton size="sm" onClick={begin} disabled={Boolean(vendor.archived_at)}>Edit company details</PortalButton>{suggestion && !vendor.business_website ? <p className="text-xs text-[color:var(--portal-muted)]">Possible website found. <button type="button" onClick={begin} className="font-semibold text-[#9a712e] underline dark:text-[#e6c77f]">Review website</button></p> : null}</div>
    <PortalModal isOpen={open} onClose={() => { if (!busy) setOpen(false) }} title="Edit company details" description={profileReady ? 'Business details save on the vendor record. Do not enter tax or government identification numbers.' : 'Name, email, phone, and category save on the existing vendor record.'} maxWidth="max-w-lg">
      <form onSubmit={save} className="space-y-4">
        <label className="block text-sm text-[color:var(--portal-text)]">Business name<input className={inputClass} required maxLength={200} value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label>
        <label className="block text-sm text-[color:var(--portal-text)]">Email<input className={inputClass} type="email" maxLength={200} value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label>
        <label className="block text-sm text-[color:var(--portal-text)]">Phone<input className={inputClass} type="tel" maxLength={50} value={values.phone} onChange={(event) => setValues({ ...values, phone: event.target.value })} /></label>
        <div className="block text-sm text-[color:var(--portal-text)]">Operations category<PortalSelect value={values.vendor_type} onChange={(vendor_type) => setValues({ ...values, vendor_type })} options={options.map((value) => ({ value, label: value }))} buttonClassName="mt-1 min-h-11 w-full" /></div>
        {profileReady ? <div className="space-y-4 border-t border-[color:var(--portal-border)] pt-4">
          <label className="block text-sm text-[color:var(--portal-text)]">Primary contact<input className={inputClass} maxLength={200} value={values.contact_person} onChange={(event) => setValues({ ...values, contact_person: event.target.value })} /></label>
          <label className="block text-sm text-[color:var(--portal-text)]">Website<input className={inputClass} maxLength={500} value={values.business_website} onChange={(event) => setValues({ ...values, business_website: event.target.value })} placeholder="https://…" /></label>
          <div className="space-y-2"><PortalButton type="button" size="sm" disabled={lookupBusy} onClick={() => void findWebsite()}>{lookupBusy ? 'Looking up website…' : 'Find website'}</PortalButton>{lookupMessage ? <p role="status" className="text-xs text-[color:var(--portal-muted)]">{lookupMessage}</p> : null}{suggestion ? <div className="space-y-2 text-xs text-[color:var(--portal-muted)]"><p>Possible website: <a href={suggestion.source} target="_blank" rel="noreferrer" className="font-semibold text-[#9a712e] underline dark:text-[#e6c77f]">{suggestion.website}</a>. Check that it is the right business.</p><PortalButton type="button" size="sm" onClick={() => { setValues((current) => ({ ...current, business_website: suggestion.website })) }}>Use this website</PortalButton></div> : null}</div>
          <label className="block text-sm text-[color:var(--portal-text)]">Mailing address<textarea className={`${inputClass} min-h-24 py-2`} maxLength={1000} value={values.mailing_address} onChange={(event) => setValues({ ...values, mailing_address: event.target.value })} /></label>
          <label className="block text-sm text-[color:var(--portal-text)]">Finance category<input className={inputClass} maxLength={100} value={values.vendor_category} onChange={(event) => setValues({ ...values, vendor_category: event.target.value })} /></label>
          <label className="block text-sm text-[color:var(--portal-text)]">Internal notes<textarea className={`${inputClass} min-h-24 py-2`} maxLength={2000} value={values.internal_notes} onChange={(event) => setValues({ ...values, internal_notes: event.target.value })} /></label>
        </div> : <p className="text-xs leading-5 text-[color:var(--portal-muted)]">Contact, website, mailing address, and notes are not stored on the vendor record yet.</p>}
        {message ? <p role="alert" className="text-sm text-[color:var(--portal-text)]">{message}</p> : null}
        <div className="flex justify-end gap-2"><PortalButton disabled={busy} onClick={() => setOpen(false)}>Cancel</PortalButton><PortalButton type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</PortalButton></div>
      </form>
    </PortalModal>
  </>
}
