'use client'

import React, { useEffect, useRef, useState } from 'react'
import { PortalButton, PortalDatePicker, PortalModal, PortalSelect } from '@/components/portal/PortalUI'
import type { LuxorExpenseCategory } from '@/lib/luxorExpenseTypes'

const TEXTAREA_CLASS = 'min-h-24 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2.5 text-sm text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/20 placeholder:text-[color:var(--portal-faint)]'
const INPUT_CLASS = 'min-h-11 w-full rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 text-sm text-[color:var(--portal-text)] outline-none transition focus:border-[#caa24c]/60 focus:ring-2 focus:ring-[#caa24c]/20 placeholder:text-[color:var(--portal-faint)]'

const PAYMENT_METHODS = ['ACH / Bank transfer', 'Credit card', 'Debit card', 'Check', 'Cash', 'Auto-draft']

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

export interface AddRecurringCostModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

export function AddRecurringCostModal({ isOpen, onClose, onCreated }: AddRecurringCostModalProps) {
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const templateSubmitInFlight = useRef(false)

  const [form, setForm] = useState({
    name: '',
    category: '',
    vendor_name: '',
    expected_amount: '',
    is_variable: false,
    frequency: 'monthly',
    custom_interval: '1',
    custom_unit: 'months',
    first_due_date: '',
    start_date: '',
    end_date: '',
    payment_method: '',
    notes: '',
  })

  useEffect(() => {
    if (!isOpen) return
    setNotice(null)
    setForm({
      name: '',
      category: '',
      vendor_name: '',
      expected_amount: '',
      is_variable: false,
      frequency: 'monthly',
      custom_interval: '1',
      custom_unit: 'months',
      first_due_date: '',
      start_date: '',
      end_date: '',
      payment_method: '',
      notes: '',
    })

    if (!categoriesLoaded) {
      void fetch('/api/expenses/categories')
        .then((res) => (res.ok ? res.json() : []))
        .then((data: LuxorExpenseCategory[]) => {
          if (Array.isArray(data)) {
            const active = data.filter((c) => c.is_active).map((c) => ({ value: c.name, label: c.name }))
            setCategories(active)
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
    if (templateSubmitInFlight.current) return
    templateSubmitInFlight.current = true
    setBusy(true)
    setNotice(null)

    const payload = {
      name: form.name.trim(),
      category: form.category,
      vendor_name: form.vendor_name.trim() || null,
      expected_amount: form.is_variable ? null : Number(form.expected_amount),
      is_variable: form.is_variable,
      frequency: form.frequency,
      custom_interval: form.frequency === 'custom' ? Number(form.custom_interval) : null,
      custom_unit: form.frequency === 'custom' ? form.custom_unit : null,
      first_due_date: form.first_due_date,
      start_date: form.start_date,
      end_date: form.end_date || null,
      payment_method: form.payment_method || null,
      notes: form.notes.trim() || null,
      client_request_id: crypto.randomUUID(),
    }

    try {
      const response = await fetch('/api/expenses/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string; template?: { id?: string } }
      if (!response.ok) {
        throw new Error(result.error || 'Recurring cost could not be saved.')
      }

      window.dispatchEvent(new CustomEvent('luxor:recurring-costs-updated'))
      onCreated?.()
      onClose()
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Recurring cost could not be saved.')
    } finally {
      templateSubmitInFlight.current = false
      setBusy(false)
    }
  }

  return (
    <PortalModal
      isOpen={isOpen}
      onClose={onClose}
      title="Add recurring cost"
      description="Set how often this cost repeats. Existing bills and payments stay unchanged."
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
          <Field label="Expense name">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
              maxLength={200}
              placeholder="Monthly internet"
            />
          </Field>

          <Field label="Category">
            <PortalSelect
              value={form.category}
              onChange={(value) => setForm((c) => ({ ...c, category: value }))}
              options={[{ value: '', label: 'Choose category' }, ...categories]}
              buttonClassName="min-h-11 w-full"
            />
          </Field>

          <Field label="Amount">
            <PortalSelect
              value={form.is_variable ? 'variable' : 'fixed'}
              onChange={(value) =>
                setForm((c) => ({
                  ...c,
                  is_variable: value === 'variable',
                  expected_amount: value === 'variable' ? '' : c.expected_amount,
                }))
              }
              options={[
                { value: 'fixed', label: 'Same amount each time' },
                { value: 'variable', label: 'Amount varies' },
              ]}
              buttonClassName="min-h-11 w-full"
            />
          </Field>

          {!form.is_variable ? (
            <Field label="Expected amount (USD)">
              <Input
                required
                min="0.01"
                step="0.01"
                type="number"
                value={form.expected_amount}
                onChange={(e) => setForm((c) => ({ ...c, expected_amount: e.target.value }))}
                placeholder="0.00"
              />
            </Field>
          ) : (
            <p className="rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] px-3 py-2 text-xs leading-5 text-[color:var(--portal-muted)]">
              Each expected bill waits for its actual amount.
            </p>
          )}

          <Field label="Frequency">
            <PortalSelect
              value={form.frequency}
              onChange={(value) => setForm((c) => ({ ...c, frequency: value }))}
              options={['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'custom'].map((value) => ({
                value,
                label: value === 'biweekly' ? 'Every two weeks' : value.charAt(0).toUpperCase() + value.slice(1),
              }))}
              buttonClassName="min-h-11 w-full"
            />
          </Field>

          {form.frequency === 'custom' ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Every">
                <Input
                  required
                  min="1"
                  max="365"
                  type="number"
                  value={form.custom_interval}
                  onChange={(e) => setForm((c) => ({ ...c, custom_interval: e.target.value }))}
                />
              </Field>
              <Field label="Unit">
                <PortalSelect
                  value={form.custom_unit}
                  onChange={(value) => setForm((c) => ({ ...c, custom_unit: value }))}
                  options={['days', 'weeks', 'months', 'years'].map((val) => ({ value: val, label: val }))}
                  buttonClassName="min-h-11 w-full"
                />
              </Field>
            </div>
          ) : null}

          <Field label="Next billing date">
            <PortalDatePicker
              value={form.first_due_date}
              onChange={(value) => setForm((c) => ({ ...c, first_due_date: value }))}
              placeholder="Select next due date"
              timeZone="America/Chicago"
            />
          </Field>

          <Field label="Start date">
            <PortalDatePicker
              value={form.start_date}
              onChange={(value) => setForm((c) => ({ ...c, start_date: value }))}
              placeholder="Select start date"
              timeZone="America/Chicago"
            />
          </Field>

          <Field label="End date (optional)">
            <PortalDatePicker
              value={form.end_date}
              onChange={(value) => setForm((c) => ({ ...c, end_date: value }))}
              placeholder="No end date"
              timeZone="America/Chicago"
            />
          </Field>

          <Field label="Company (optional)">
            <Input
              value={form.vendor_name}
              onChange={(e) => setForm((c) => ({ ...c, vendor_name: e.target.value }))}
              maxLength={200}
              placeholder="Company or merchant"
            />
          </Field>

          <Field label="Payment method (optional)">
            <PortalSelect
              value={form.payment_method}
              onChange={(value) => setForm((c) => ({ ...c, payment_method: value }))}
              options={[{ value: '', label: 'Unknown' }, ...PAYMENT_METHODS.map((val) => ({ value: val, label: val }))]}
              buttonClassName="min-h-11 w-full"
            />
          </Field>

          <Field label="Notes (optional)" className="sm:col-span-2">
            <textarea
              className={TEXTAREA_CLASS}
              value={form.notes}
              onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
              maxLength={2000}
              placeholder="Billing context"
            />
          </Field>
        </fieldset>

        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--portal-border)] pt-4 sm:flex-row sm:justify-end">
          <PortalButton type="button" onClick={onClose}>
            Close
          </PortalButton>
          <PortalButton type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save recurring cost'}
          </PortalButton>
        </div>
      </form>
    </PortalModal>
  )
}
