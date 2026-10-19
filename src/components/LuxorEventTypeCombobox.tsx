'use client'

import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { filterLuxorEventTypes, LUXOR_EVENT_TYPE_MAX_LENGTH } from '@/lib/luxorInquiryTypes'

type LuxorEventTypeComboboxProps = {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  hideLabel?: boolean
  variant?: 'public-light' | 'public-dark' | 'portal'
  className?: string
  labelClassName?: string
  inputClassName?: string
  listClassName?: string
  suggestionLayout?: 'overlay' | 'flow'
  maxLength?: number
  onBlur?: () => void
  onEnterCustom?: (value: string) => void
  onSelectSuggestion?: (value: string) => void
}

const INPUT_STYLES = {
  'public-light': 'border-[#d8c4a4] bg-[#fffdfa] text-[#241d17] placeholder:text-[#8d8075] focus:border-[#b98a3d] focus:ring-2 focus:ring-[#b98a3d]/15',
  'public-dark': 'border-[#caa24c]/24 bg-black/35 text-[#f7efe3] placeholder:text-[#d7c29a]/42 focus:border-[#f1d27a]/70 focus:ring-2 focus:ring-[#caa24c]/15',
  portal: 'border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] text-[color:var(--portal-text)] placeholder:text-[color:var(--portal-muted)] focus:border-[#b98a3e]/65 focus:ring-2 focus:ring-[#b98a3e]/15',
} as const

const LIST_STYLES = {
  'public-light': 'border-[#d8c4a4] bg-white text-[#241d17]',
  'public-dark': 'border-[#caa24c]/30 bg-[#17130e] text-[#f7efe3]',
  portal: 'border-[color:var(--portal-border)] bg-[color:var(--portal-card)] text-[color:var(--portal-text)]',
} as const

const LABEL_STYLES = {
  'public-light': 'text-[#8d672b]',
  'public-dark': 'text-[#d7b964]',
  portal: 'text-[color:var(--portal-muted)]',
} as const

export function LuxorEventTypeCombobox({
  value,
  onChange,
  label,
  placeholder = 'Search or enter an event type...',
  required = false,
  disabled = false,
  hideLabel = false,
  variant = 'portal',
  className = '',
  labelClassName = '',
  inputClassName = '',
  listClassName = '',
  suggestionLayout = 'overlay',
  maxLength = LUXOR_EVENT_TYPE_MAX_LENGTH,
  onBlur,
  onEnterCustom,
  onSelectSuggestion,
}: LuxorEventTypeComboboxProps) {
  const generatedId = useId().replace(/:/g, '')
  const inputId = `luxor-event-type-${generatedId}`
  const listId = `${inputId}-suggestions`
  const rootRef = useRef<HTMLDivElement>(null)
  const pointerSelectionRef = useRef(false)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const suggestions = filterLuxorEventTypes(value)
  const activeSuggestion = suggestions[activeIndex]
  const showSuggestions = isOpen && suggestions.length > 0

  const selectSuggestion = (suggestion: string) => {
    onChange(suggestion)
    setIsOpen(false)
    setActiveIndex(-1)
    onSelectSuggestion?.(suggestion)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!suggestions.length) return
      setIsOpen(true)
      setActiveIndex((current) => current < suggestions.length - 1 ? current + 1 : 0)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!suggestions.length) return
      setIsOpen(true)
      setActiveIndex((current) => current > 0 ? current - 1 : suggestions.length - 1)
      return
    }

    if (event.key === 'Enter' && isOpen && activeSuggestion) {
      event.preventDefault()
      selectSuggestion(activeSuggestion)
      return
    }

    if (event.key === 'Enter' && onEnterCustom) {
      event.preventDefault()
      onEnterCustom(value)
      setIsOpen(false)
      setActiveIndex(-1)
      return
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      setIsOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <label htmlFor={inputId} className={`${hideLabel ? 'sr-only' : 'mb-1.5 block text-[10px] font-bold uppercase tracking-[0.16em]'} ${LABEL_STYLES[variant]} ${labelClassName}`}>
        {label}{required ? ' *' : ''}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={showSuggestions}
          aria-controls={showSuggestions ? listId : undefined}
          aria-activedescendant={showSuggestions && activeSuggestion ? `${listId}-option-${activeIndex}` : undefined}
          aria-required={required || undefined}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          required={required}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          onFocus={() => setIsOpen(true)}
          onChange={(event) => {
            onChange(event.target.value)
            setActiveIndex(-1)
            setIsOpen(true)
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            window.setTimeout(() => {
              if (pointerSelectionRef.current || rootRef.current?.contains(document.activeElement)) return
              setIsOpen(false)
              setActiveIndex(-1)
              onBlur?.()
            }, 0)
          }}
          className={`min-h-12 w-full rounded-xl border px-3.5 py-3 pr-10 text-sm outline-none transition placeholder:normal-case placeholder:tracking-normal disabled:cursor-not-allowed disabled:opacity-60 ${INPUT_STYLES[variant]} ${inputClassName}`}
        />
        {value && !disabled ? (
          <button
            type="button"
            aria-label="Clear event type"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('')
              setActiveIndex(-1)
              setIsOpen(true)
              rootRef.current?.querySelector('input')?.focus()
            }}
            className={`absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md transition ${variant === 'portal' ? 'text-[color:var(--portal-muted)] hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)]' : variant === 'public-dark' ? 'text-[#d7c29a]/65 hover:bg-white/10 hover:text-[#f7efe3]' : 'text-[#8d8075] hover:bg-[#f5efe5] hover:text-[#241d17]'}`}
          >
            <X aria-hidden="true" size={15} />
          </button>
        ) : null}
      </div>

      {showSuggestions ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className={`${suggestionLayout === 'flow' ? 'relative mt-2' : 'absolute left-0 top-full z-50 mt-1'} max-h-64 w-full overflow-y-auto rounded-xl border p-1 shadow-xl ${LIST_STYLES[variant]} ${listClassName}`}
        >
          {suggestions.map((suggestion, index) => (
            <li
              id={`${listId}-option-${index}`}
              key={suggestion}
              role="option"
              aria-selected={value === suggestion}
              onPointerDown={() => { pointerSelectionRef.current = true }}
              onPointerCancel={() => { pointerSelectionRef.current = false }}
              onPointerLeave={() => { pointerSelectionRef.current = false }}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                pointerSelectionRef.current = false
                selectSuggestion(suggestion)
              }}
              className={`flex min-h-11 cursor-pointer items-center rounded-lg px-3 text-sm transition-colors ${activeIndex === index ? variant === 'portal' ? 'bg-[color:var(--portal-soft)]' : variant === 'public-dark' ? 'bg-white/10' : 'bg-[#f5efe5]' : variant === 'portal' ? 'hover:bg-[color:var(--portal-soft)]' : variant === 'public-dark' ? 'hover:bg-white/10' : 'hover:bg-[#f5efe5]'}`}
            >
              {suggestion}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
