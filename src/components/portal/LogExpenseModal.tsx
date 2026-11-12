'use client'

import React, { useEffect, useRef, useState } from 'react'
import { PortalButton, PortalDatePicker, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import type { LuxorExpenseCategory } from '@/lib/luxorExpenseTypes'

const TEXTAREA_CLASS = 'min-h-24 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/20 placeholder:text-[color:var(--portal-faint)]'
const INPUT_CLASS = 'min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/20 placeholder:text-[color:var(--portal-faint)]'
const PAYMENT_METHODS = ['Credit Card', 'Debit Card', 'Cash', 'Zelle', 'Bank Transfer', 'Check', 'Stripe', 'Other']

const EMPTY_FORM = {
  description: '',
  amount: '',
  incurred_on: '',
  due_date: '',
  category: '',
  vendor_name: '',
  payment_method: '',
  reference_number: '',
  notes: '',
}

function chicagoToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label className="block text-xs font-semibold text-[color:var(--portal-muted)]">{label}</label>
      {children}
    </div>
  )
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${INPUT_CLASS} ${props.className || ''}`} />
}

export interface LogExpenseModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

export function LogExpenseModal({ isOpen, onClose, onCreated }: LogExpenseModalProps) {
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const requestIdRef = useRef('')
  const submitInFlight = useRef(false)

  function resetRequest() {
    requestIdRef.current = crypto.randomUUID()
  }

  function updateForm(patch: Partial<typeof EMPTY_FORM>) {
    if (busy) return
    resetRequest()
    setForm((current) => ({ ...current, ...patch }))
  }

  useEffect(() => {
    if (!isOpen) return
    setNotice(null)
    setForm(EMPTY_FORM)
    resetRequest()

    if (!categoriesLoaded) {
      void fetch('/api/expenses/categories')
        .then((res) => (res.ok ? res.json() : []))
        .then((data: LuxorExpenseCategory[]) => {
          if (Array.isArray(data)) {
            setCategories(data.filter((category) => category.is_active).map((category) => ({ value: category.name, label: category.name })))
          }
          setCategoriesLoaded(true)
        })
        .catch(() => {
          setCategoriesLoaded(true)
        })
    }
  }, [isOpen, categoriesLoaded])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (submitInFlight.current) return
    if (!form.incurred_on || !form.category || !form.vendor_name.trim() || !form.payment_method) {
      setNotice('Enter the expense date, category, vendor, and payment method before saving.')
      return
    }

    submitInFlight.current = true
    setBusy(true)
    setNotice(null)

    const today = chicagoToday()
    const payload = {
      description: form.description.trim(),
      amount: Number(form.amount),
      incurred_on: form.incurred_on,
      due_date: form.due_date || null,
      category: form.category,
      vendor_name: form.vendor_name.trim(),
      booking_id: null,
      expense_type: 'business',
      payment_method: form.payment_method,
      reference_number: form.reference_number.trim() || null,
      notes: form.notes.trim() || null,
      status: form.due_date && form.due_date > today ? 'planned' : 'incurred',
      client_request_id: requestIdRef.current,
    }

    try {
      const response = await fetch('/api/expenses/management', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string; id?: string }
      if (!response.ok) {
        if (response.status < 500) resetRequest()
        throw new Error(result.error || 'Expense could not be saved.')
      }
      if (!result.id) {
        throw new Error('The server accepted the request but did not return the saved expense. Retry this same form to resolve it.')
      }

      window.dispatchEvent(new CustomEvent('luxor:expenses-updated'))
      onCreated?.()
      onClose()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Expense could not be saved.')
    } finally {
      submitInFlight.current = false
      setBusy(false)
    }
  }

  return (
    <PortalModal
      isOpen={isOpen}
      onClose={onClose}
      title="Log business expense"
      description="Save the expense first. Payments are recorded as separate transactions."
      maxWidth="max-w-[600px]"
      sidePanel
      animateClose
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {notice ? (
          <p role="alert" className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-sm text-[color:var(--portal-text)]">
            {notice}
          </p>
        ) : null}

        <fieldset disabled={busy} className="grid min-w-0 gap-4 sm:grid-cols-2">
          <Field label="Expense description">
            <Input required maxLength={200} value={form.description} onChange={(event) => updateForm({ description: event.target.value })} placeholder="e.g. Cleaning supplies" />
          </Field>
          <Field label="Amount (USD)">
            <Input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => updateForm({ amount: event.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Expense date">
            <PortalDatePicker value={form.incurred_on} onChange={(value) => updateForm({ incurred_on: value })} placeholder="Select expense date" timeZone="America/Chicago" />
          </Field>
          <Field label="Due date (optional)">
            <PortalDatePicker value={form.due_date} onChange={(value) => updateForm({ due_date: value })} placeholder="Select due date" timeZone="America/Chicago" />
          </Field>
          <Field label="Category">
            <PortalSelect value={form.category} onChange={(value) => updateForm({ category: value })} options={[{ value: '', label: 'Choose category' }, ...categories]} buttonClassName="min-h-11 w-full" />
          </Field>
          <Field label="Vendor or merchant">
            <Input value={form.vendor_name} onChange={(event) => updateForm({ vendor_name: event.target.value })} maxLength={200} placeholder="Company or merchant" />
          </Field>
          <Field label="Payment method">
            <PortalSelect value={form.payment_method} onChange={(value) => updateForm({ payment_method: value })} options={[{ value: '', label: 'Choose method' }, ...PAYMENT_METHODS.map((value) => ({ value, label: value }))]} buttonClassName="min-h-11 w-full" />
          </Field>
          <Field label="Reference number (optional)">
            <Input value={form.reference_number} onChange={(event) => updateForm({ reference_number: event.target.value })} maxLength={100} placeholder="Receipt, transfer, or invoice ref." />
          </Field>
          <Field label="Notes (optional)" className="sm:col-span-2">
            <textarea className={TEXTAREA_CLASS} value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} maxLength={2000} placeholder="Additional context" />
          </Field>
        </fieldset>

        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:justify-end">
          <PortalButton type="button" disabled={busy} onClick={onClose}>Cancel</PortalButton>
          <PortalButton type="submit" variant="primary" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</PortalButton>
        </div>
      </form>
    </PortalModal>
  )
}
