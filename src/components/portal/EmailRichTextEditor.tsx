'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Image as ImageIcon, Italic, Link, List, Underline } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { BrandAssetPicker } from './BrandAssetPicker'

interface EmailRichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  ariaLabel?: string
  autoFocus?: boolean
  readOnly?: boolean
  hideToolbar?: boolean
  focusMode?: boolean
  bodyClassName?: string
  onReadOnlyBodyClick?: () => void
  onReadOnlyCommand?: (command: string) => void
  initialCommand?: string | null
  onInitialCommandApplied?: () => void
  className?: string
}

const EMPTY_EDITOR_HTML = /^(?:\s|&nbsp;|<br\s*\/?\s*>|<div><br\s*\/?\s*><\/div>|<p><br\s*\/?\s*><\/p>)*$/i

export function EmailRichTextEditor({
  value,
  onChange,
  placeholder = 'Write your message…',
  ariaLabel = 'Email message',
  autoFocus = false,
  readOnly = false,
  hideToolbar = false,
  focusMode = false,
  bodyClassName = '',
  onReadOnlyBodyClick,
  onReadOnlyCommand,
  initialCommand = null,
  onInitialCommandApplied,
  className = '',
}: EmailRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const savedSelectionRef = useRef<Range | null>(null)
  const [assetPickerOpen, setAssetPickerOpen] = useState(false)

  const syncValue = useCallback(() => {
    const next = editorRef.current?.innerHTML || ''
    const empty = EMPTY_EDITOR_HTML.test(next)
    onChange(empty ? '' : next)
  }, [onChange])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || editor.innerHTML === value) return
    editor.innerHTML = value
  }, [value])

  useEffect(() => {
    if (!autoFocus || readOnly || !editorRef.current) return
    const frame = window.requestAnimationFrame(() => {
      const editor = editorRef.current
      if (!editor) return
      editor.focus({ preventScroll: focusMode })
      const selection = window.getSelection()
      if (selection) {
        const range = document.createRange()
        range.selectNodeContents(editor)
        range.collapse(false)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      if (initialCommand === 'insertImage') {
        setAssetPickerOpen(true)
      } else if (initialCommand === 'createLink') {
        window.requestAnimationFrame(() => {
          const url = window.prompt('Enter link URL (for example, https://example.com):')
          if (url?.trim()) {
            editor.focus()
            document.execCommand('createLink', false, url.trim())
            syncValue()
          }
          onInitialCommandApplied?.()
        })
        return
      } else if (initialCommand) {
        document.execCommand(initialCommand, false, '')
        syncValue()
      }
      if (initialCommand) onInitialCommandApplied?.()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [autoFocus, readOnly, focusMode, initialCommand, onInitialCommandApplied, syncValue])

  const saveSelection = () => {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0 && editorRef.current?.contains(selection.anchorNode)) {
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange()
    }
  }

  const runCommand = (command: string, commandValue = '') => {
    if (readOnly) {
      onReadOnlyCommand?.(command)
      return
    }
    editorRef.current?.focus()
    document.execCommand(command, false, commandValue)
    syncValue()
  }

  const requestLink = () => {
    if (readOnly) {
      onReadOnlyCommand?.('createLink')
      return
    }
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
    <div className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[color:var(--portal-border)] bg-[color:var(--portal-bg)] focus-within:border-[#caa24c]/55 ${focusMode ? 'rounded-none border-0 focus-within:border-0' : ''} ${className}`}>
      {!hideToolbar && <div role="toolbar" aria-label="Email formatting" className="flex min-h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[color:var(--portal-border)] bg-[color:var(--portal-soft)]/65 px-1.5">
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
          onClick={() => readOnly ? onReadOnlyCommand?.('insertImage') : setAssetPickerOpen(true)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[color:var(--portal-muted)] transition-colors hover:bg-[color:var(--portal-soft)] hover:text-[color:var(--portal-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45"
        >
          <ImageIcon size={15} />
        </button>
      </div>}
      <div className={`relative flex min-h-0 flex-1 flex-col ${focusMode ? 'bg-[color:var(--portal-bg)]' : ''}`}>
        <div
          ref={editorRef}
          role={readOnly ? (onReadOnlyBodyClick ? 'button' : 'presentation') : 'textbox'}
          aria-label={readOnly ? (onReadOnlyBodyClick ? 'Edit email message' : undefined) : ariaLabel}
          aria-multiline={readOnly ? undefined : 'true'}
          aria-readonly={readOnly || undefined}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          tabIndex={readOnly ? (onReadOnlyBodyClick ? 0 : -1) : undefined}
          onInput={readOnly ? undefined : syncValue}
          onBlur={readOnly ? undefined : syncValue}
          onFocus={readOnly || focusMode ? undefined : (event) => event.currentTarget.scrollIntoView({ block: 'nearest' })}
          onClick={readOnly ? onReadOnlyBodyClick : undefined}
          onKeyDown={readOnly && onReadOnlyBodyClick ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onReadOnlyBodyClick()
            }
          } : undefined}
          className={`flex-1 overflow-y-auto overscroll-contain px-3 py-3 text-sm leading-relaxed text-[color:var(--portal-text)] outline-none [overflow-wrap:anywhere] sm:px-4 sm:py-4 ${focusMode ? 'min-h-0 bg-[color:var(--portal-bg)] px-4 py-5 text-[18px] leading-8 sm:px-5 sm:py-6' : 'min-h-[11rem] bg-[color:var(--portal-bg)]'} ${readOnly ? 'cursor-pointer' : ''} ${bodyClassName}`}
          style={{ scrollMarginBlock: focusMode ? '1rem' : '5rem', WebkitOverflowScrolling: 'touch' }}
        />
        {EMPTY_EDITOR_HTML.test(value) && <div aria-hidden="true" className={`pointer-events-none absolute text-sm leading-relaxed text-[color:var(--portal-faint)] ${focusMode ? 'left-4 top-5 px-4 text-[18px] leading-8 sm:left-5 sm:top-6 sm:px-5' : 'left-3 top-3 sm:left-4 sm:top-4'}`}>{placeholder}</div>}
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
