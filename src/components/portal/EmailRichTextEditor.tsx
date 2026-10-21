'use client'

import React, { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Image as ImageIcon, Italic, Link, List, Underline } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { BrandAssetPicker } from './BrandAssetPicker'

interface EmailRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  autoFocus?: boolean
  className?: string
}

const EMPTY_EDITOR_HTML = /^(?:\s|&nbsp;|<br\s*\/?\s*>|<div><br\s*\/?\s*><\/div>|<p><br\s*\/?\s*><\/p>)*$/i

export function EmailRichTextEditor({
  value,
  onChange,
  placeholder = 'Write your message…',
  ariaLabel = 'Email message',
  autoFocus = false,
  className = '',
}: EmailRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedSelectionRef = useRef<Range | null>(null)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || editor.innerHTML === value) return
    editor.innerHTML = value
  }, [value])

  useEffect(() => {
    if (!autoFocus || !editorRef.current) return
    const frame = window.requestAnimationFrame(() => editorRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [autoFocus])

  const syncValue = () => {
    const next = editorRef.current?.innerHTML || ''
    const empty = EMPTY_EDITOR_HTML.test(next)
    onChange(empty ? '' : next)
  }

  const saveSelection = () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && editorRef.current?.contains(selection.anchorNode)) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
    }
  }

  const runCommand = (command: string, commandValue = '') => {
    editorRef.current?.focus()
    document.execCommand(command, false, commandValue)
    syncValue()
  }

  const requestLink = () => {
    const url = window.prompt('Enter link URL (for example, https://example.com):')
    if (url?.trim()) runCommand('createLink', url.trim())
  }

  const insertImage = (url: string) => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    const selection = window.getSelection()
    if (selection && savedSelectionRef.current) {
      selection.removeAllRanges()
      selection.addRange(savedSelectionRef.current)
    }
    document.execCommand('insertHTML', false, `<img src="${url}" style="max-width:100%;height:auto;border-radius:6px;margin:10px 0;display:block" alt="Luxor image" />`)
    syncValue()
    savedSelectionRef.current = null
    setAssetPickerOpen(false)
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[color:var(--portal-border)] bg-white focus-within:border-[#caa24c]/55 ${className}`}>
      <div role="toolbar" aria-label="Email formatting" className="flex min-h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/65 px-1.5">
        <FormatButton label="Bold" icon={<Bold size={15} />} onClick={() => runCommand('bold')} />
        <FormatButton label="Italic" icon={<Italic size={15} />} onClick={() => runCommand('italic')} />
        <FormatButton label="Underline" icon={<Underline size={15} />} onClick={() => runCommand('underline')} />
        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-[color:var(--portal-border)]" />
        <FormatButton label="Bulleted list" icon={<List size={15} />} onClick={() => runCommand('insertUnorderedList')} />
        <FormatButton label="Align left" icon={<AlignLeft size={15} />} onClick={() => runCommand('justifyLeft')} />
        <FormatButton label="Align center" icon={<AlignCenter size={15} />} onClick={() => runCommand('justifyCenter')} />
        <FormatButton label="Align right" icon={<AlignRight size={15} />} onClick={() => runCommand('justifyRight')} />
        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-[color:var(--portal-border)]" />
        <FormatButton label="Insert link" icon={<Link size={15} />} onClick={requestLink} />
        <button
          type="button"
          title="Insert image"
          aria-label="Insert image"
          onMouseDown={(event) => { event.preventDefault(); saveSelection() }}
          onClick={() => setAssetPickerOpen(true)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
        >
          <ImageIcon size={15} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={editorRef}
          role="textbox"
          aria-label={ariaLabel}
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onInput={syncValue}
          onBlur={syncValue}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: 'nearest' })}
          className="min-h-[11rem] flex-1 overflow-y-auto overscroll-contain bg-white px-3 py-3 text-sm leading-relaxed text-zinc-900 outline-none [overflow-wrap:anywhere] sm:px-4 sm:py-4"
          style={{ scrollMarginBlock: '5rem', WebkitOverflowScrolling: 'touch' }}
        />
        {EMPTY_EDITOR_HTML.test(value) && <div aria-hidden="true" className="pointer-events-none absolute left-3 top-3 text-sm leading-relaxed text-zinc-400 sm:left-4 sm:top-4">{placeholder}</div>}
      </div>
      <AnimatePresence>
        {assetPickerOpen && (
          <BrandAssetPicker isOpen={assetPickerOpen} onClose={() => setAssetPickerOpen(false)} onSelect={insertImage} />
        )}
      </AnimatePresence>
    </div>
  )
}

function FormatButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
    >
      {icon}
    </button>
  )
}
