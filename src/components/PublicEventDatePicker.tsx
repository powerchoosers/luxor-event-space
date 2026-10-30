'use client'

import { LuxorDatePicker } from '@/components/LuxorDatePicker'

type PublicEventDatePickerProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  locale?: string
  className?: string
  availableDates?: Set<string>
  timeZone?: string
  label?: string
}

export function PublicEventDatePicker({ value, onChange, placeholder = 'Select a date', locale = 'en-US', className = '', availableDates, timeZone, label = 'Event date' }: PublicEventDatePickerProps) {
  return <LuxorDatePicker value={value} onChange={onChange} placeholder={placeholder} locale={locale} className={className} availableDates={availableDates} timeZone={timeZone} label={label} theme="light" />
}
