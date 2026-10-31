'use client'

import React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { DYNAMIC_VARIABLE_CHIPS } from '@/lib/luxorCustomWorkflowDefinition'

type WorkflowTextSegment =
  | { type: 'text'; value: string; key: string }
  | { type: 'variable'; token: string; label: string; key: string }

const variableByToken = new Map(DYNAMIC_VARIABLE_CHIPS.map((chip) => [chip.token, chip]))
const variablePattern = new RegExp(`(\\{\\{(?:${DYNAMIC_VARIABLE_CHIPS.map((chip) => chip.token.slice(2, -2)).join('|')})\\}\\})`, 'g')

function splitWorkflowText(value: string): WorkflowTextSegment[] {
  const segments: WorkflowTextSegment[] = []
  const occurrences = new Map<string, number>()
  let cursor = 0

  for (const match of value.matchAll(variablePattern)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index > cursor) segments.push({ type: 'text', value: value.slice(cursor, index), key: `text-${cursor}` })
    const occurrence = occurrences.get(token) || 0
    occurrences.set(token, occurrence + 1)
    segments.push({ type: 'variable', token, label: variableByToken.get(token)?.label || token, key: `${token}-${occurrence}` })
    cursor = index + token.length
  }

  if (cursor < value.length) segments.push({ type: 'text', value: value.slice(cursor), key: `text-${cursor}` })
  return segments
}

function isVariableElement(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && Boolean(node.dataset.workflowVariable)
}

function getNodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length || 0
  if (isVariableElement(node)) return node.dataset.workflowVariable?.length || 0
  if (node instanceof HTMLBRElement) return 1
  return Array.from(node.childNodes).reduce((total, child) => total + getNodeTextLength(child), 0)
}

function getTextOffset(root: HTMLElement, container: Node, offset: number): number | null {
  let total = 0
  let found = false

  const visit = (node: Node) => {
    if (found) return
    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) total += Math.min(offset, node.textContent?.length || 0)
      else {
        const children = Array.from(node.childNodes).slice(0, offset)
        total += children.reduce((sum, child) => sum + getNodeTextLength(child), 0)
      }
      found = true
      return
    }
    if (node !== root && (node.nodeType === Node.TEXT_NODE || isVariableElement(node) || node instanceof HTMLBRElement)) {
      total += getNodeTextLength(node)
      return
    }
    for (const child of Array.from(node.childNodes)) visit(child)
  }

  visit(root)
  return found ? total : null
}

function setCaretAtTextOffset(root: HTMLElement, offset: number) {
  const range = document.createRange()
  const selection = window.getSelection()
  let total = 0
  let placed = false

  const placeAtEnd = () => {
    range.selectNodeContents(root)
    range.collapse(false)
    placed = true
  }

  const visit = (node: Node) => {
    if (placed) return
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length || 0
      if (offset <= total + length) {
        range.setStart(node, Math.max(0, offset - total))
        range.collapse(true)
        placed = true
      } else total += length
      return
    }
    if (isVariableElement(node)) {
      const length = node.dataset.workflowVariable?.length || 0
      if (offset <= total) range.setStartBefore(node)
      else if (offset <= total + length) range.setStartAfter(node)
      else {
        total += length
        return
      }
      range.collapse(true)
      placed = true
      return
    }
    if (node instanceof HTMLBRElement) {
      if (offset <= total) range.setStartBefore(node)
      else if (offset <= total + 1) range.setStartAfter(node)
      else {
        total += 1
        return
      }
      range.collapse(true)
      placed = true
      return
    }
    for (const child of Array.from(node.childNodes)) visit(child)
  }

  for (const child of Array.from(root.childNodes)) visit(child)
  if (!placed) placeAtEnd()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (isVariableElement(node)) return node.dataset.workflowVariable || ''
  if (node instanceof HTMLBRElement) return '\n'

  const children = Array.from(node.childNodes)
  let output = ''
  children.forEach((child, index) => {
    const block = child instanceof HTMLElement && ['DIV', 'P'].includes(child.tagName)
    if (block && output && !output.endsWith('\n')) output += '\n'
    output += serializeNode(child)
    if (block && index < children.length - 1 && !output.endsWith('\n')) output += '\n'
  })
  return output
}

function getEditorValue(root: HTMLElement) {
  return serializeNode(root)
}

function createVariableChip(token: string) {
  const chip = variableByToken.get(token)
  const element = document.createElement('span')
  element.dataset.workflowVariable = token
  element.contentEditable = 'false'
  element.draggable = false
  element.title = token
  element.setAttribute('aria-label', `${chip?.label || token} variable`)
  element.className = 'mx-0.5 inline-flex select-none items-center whitespace-nowrap rounded-md border border-[#caa24c]/35 bg-[#caa24c]/10 px-1.5 py-0.5 align-baseline text-[10px] font-semibold leading-4 text-[#8c6424] dark:text-[#f1d27a]'
  element.textContent = chip?.label || token
  return element
}

function animateVariable(element: HTMLElement, entering: boolean) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  element.animate(
    entering
      ? [{ opacity: 0, transform: 'translateY(2px) scale(.88)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }]
      : [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(-2px) scale(.88)' }],
    { duration: entering ? 170 : 140, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' },
  )
}

function hasRawVariableText(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (splitWorkflowText(node.textContent || '').some((segment) => segment.type === 'variable')) return true
  }
  return false
}

function renderEditorValue(root: HTMLElement, value: string, animateNewVariables: boolean) {
  const priorCounts = new Map<string, number>()
  root.querySelectorAll<HTMLElement>('[data-workflow-variable]').forEach((element) => {
    const token = element.dataset.workflowVariable || ''
    priorCounts.set(token, (priorCounts.get(token) || 0) + 1)
  })

  root.replaceChildren()
  const nextCounts = new Map<string, number>()
  for (const segment of splitWorkflowText(value)) {
    if (segment.type === 'text') {
      root.append(document.createTextNode(segment.value))
      continue
    }
    const count = nextCounts.get(segment.token) || 0
    nextCounts.set(segment.token, count + 1)
    const element = createVariableChip(segment.token)
    root.append(element)
    if (animateNewVariables && count >= (priorCounts.get(segment.token) || 0)) animateVariable(element, true)
  }
}

function findChipAtOffset(root: HTMLElement, offset: number, direction: 'backward' | 'forward') {
  let total = 0
  let found: HTMLElement | null = null
  const visit = (node: Node) => {
    if (found) return
    if (node.nodeType === Node.TEXT_NODE) {
      total += node.textContent?.length || 0
      return
    }
    if (isVariableElement(node)) {
      const length = node.dataset.workflowVariable?.length || 0
      if ((direction === 'backward' && offset === total + length) || (direction === 'forward' && offset === total)) {
        found = node
        return
      }
      total += length
      return
    }
    if (node instanceof HTMLBRElement) {
      total += 1
      return
    }
    for (const child of Array.from(node.childNodes)) visit(child)
  }
  visit(root)
  return found
}

export interface WorkflowTokenEditorHandle {
  insertToken: (token: string) => void
}

export interface WorkflowTokenEditorProps {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder?: string
  rows?: number
}

export const WorkflowTokenEditor = React.forwardRef<WorkflowTokenEditorHandle, WorkflowTokenEditorProps>(function WorkflowTokenEditor(
  { value, onChange, label, placeholder, rows = 4 },
  forwardedRef,
) {
  const editorRef = React.useRef<HTMLDivElement>(null)
  const savedRangeRef = React.useRef<Range | null>(null)
  const onChangeRef = React.useRef(onChange)

  React.useLayoutEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const captureSelection = React.useCallback(() => {
    const root = editorRef.current
    const selection = window.getSelection()
    if (!root || !selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    if (root.contains(range.startContainer) && root.contains(range.endContainer)) savedRangeRef.current = range.cloneRange()
  }, [])

  React.useLayoutEffect(() => {
    const root = editorRef.current
    if (root && getEditorValue(root) !== value) renderEditorValue(root, value, false)
  }, [value])

  const emitCurrentValue = React.useCallback((normalizeTokens: boolean) => {
    const root = editorRef.current
    if (!root) return
    const current = getEditorValue(root)
    if (!current) {
      root.replaceChildren()
      setCaretAtTextOffset(root, 0)
    }
    const selection = window.getSelection()
    const caret = selection?.rangeCount && root.contains(selection.anchorNode)
      ? getTextOffset(root, selection.anchorNode!, selection.anchorOffset)
      : null
    if (normalizeTokens && hasRawVariableText(root)) {
      renderEditorValue(root, current, true)
      if (caret !== null) setCaretAtTextOffset(root, caret)
    }
    onChangeRef.current(current)
    captureSelection()
  }, [captureSelection])

  const insertToken = React.useCallback((token: string) => {
    if (!variableByToken.has(token)) return
    const root = editorRef.current
    if (!root) return
    root.focus()

    const current = getEditorValue(root)
    const selection = window.getSelection()
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      range = savedRangeRef.current && root.contains(savedRangeRef.current.startContainer) ? savedRangeRef.current.cloneRange() : null
    }
    const start = range ? getTextOffset(root, range.startContainer, range.startOffset) ?? current.length : current.length
    const end = range?.collapsed ? start : range ? getTextOffset(root, range.endContainer, range.endOffset) ?? start : start
    const before = current.slice(0, start)
    const after = current.slice(end)
    const leadingSpace = before && !/\s$/.test(before) ? ' ' : ''
    const trailingSpace = after && !/^\s/.test(after) ? ' ' : ''
    const next = `${before}${leadingSpace}${token}${trailingSpace}${after}`
    const caret = start + leadingSpace.length + token.length + trailingSpace.length
    renderEditorValue(root, next, true)
    setCaretAtTextOffset(root, caret)
    onChangeRef.current(next)
    captureSelection()
  }, [captureSelection])

  React.useImperativeHandle(forwardedRef, () => ({ insertToken }), [insertToken])

  const removeChip = React.useCallback((chip: HTMLElement) => {
    if (chip.dataset.removing === 'true') return
    const root = editorRef.current
    if (!root) return
    const token = chip.dataset.workflowVariable || ''
    const parent = chip.parentNode
    const siblingIndex = parent ? Array.from(parent.childNodes).indexOf(chip) : -1
    const start = parent && siblingIndex >= 0 ? getTextOffset(root, parent, siblingIndex) : null
    const current = getEditorValue(root)
    let before = start === null ? current : current.slice(0, start)
    let after = start === null ? '' : current.slice(start + token.length)
    let caret = start ?? current.length
    if (/^\s/.test(after)) after = after.slice(1)
    else if (/\s$/.test(before)) {
      before = before.slice(0, -1)
      caret = Math.max(0, caret - 1)
    }
    const nextValue = `${before}${after}`
    chip.dataset.removing = 'true'

    const finish = () => {
      const nextText = chip.nextSibling?.nodeType === Node.TEXT_NODE ? chip.nextSibling as Text : null
      const previousText = chip.previousSibling?.nodeType === Node.TEXT_NODE ? chip.previousSibling as Text : null
      if (nextText && /^\s/.test(nextText.data)) nextText.deleteData(0, 1)
      else if (previousText && /\s$/.test(previousText.data)) previousText.deleteData(previousText.length - 1, 1)
      chip.remove()
      if (root.isConnected) {
        if (!nextValue) root.replaceChildren()
        root.focus()
        setCaretAtTextOffset(root, caret)
        captureSelection()
      }
      onChangeRef.current(nextValue)
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }
    const animation = chip.animate(
      [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(-2px) scale(.88)' }],
      { duration: 140, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' },
    )
    animation.finished.then(finish).catch(() => undefined)
  }, [captureSelection])

  const insertPlainTextAtCaret = React.useCallback((text: string) => {
    const root = editorRef.current
    const selection = window.getSelection()
    if (!root || !selection?.rangeCount || !root.contains(selection.anchorNode)) return
    const range = selection.getRangeAt(0)
    range.deleteContents()
    const textNode = document.createTextNode(text)
    range.insertNode(textNode)
    range.setStartAfter(textNode)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    emitCurrentValue(true)
  }, [emitCurrentValue])

  return (
    <div className="relative">
      <div
        ref={editorRef}
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        spellCheck
        data-placeholder={placeholder}
        className="min-h-[6.5rem] w-full whitespace-pre-wrap break-words rounded-xl border border-[color:var(--portal-border)] bg-[color:var(--portal-soft)] p-3 text-xs leading-relaxed text-[color:var(--portal-text)] outline-none transition-colors focus:border-[#caa24c] empty:before:pointer-events-none empty:before:text-[color:var(--portal-faint)] empty:before:content-[attr(data-placeholder)]"
        style={{ minHeight: `${Math.max(2, rows) * 1.35 + 1.5}rem` }}
        onInput={(event) => emitCurrentValue(!(event.nativeEvent as InputEvent).isComposing)}
        onKeyUp={captureSelection}
        onMouseUp={captureSelection}
        onFocus={captureSelection}
        onBlur={captureSelection}
        onKeyDown={(event) => {
          const root = editorRef.current
          const selection = window.getSelection()
          if (!root || !selection?.isCollapsed || !selection.rangeCount) return
          const range = selection.getRangeAt(0)
          if (!root.contains(range.startContainer)) return
          const offset = getTextOffset(root, range.startContainer, range.startOffset)
          if (offset === null) return
          if (event.key === 'Backspace') {
            const chip = findChipAtOffset(root, offset, 'backward')
            if (chip) {
              event.preventDefault()
              removeChip(chip)
            }
          } else if (event.key === 'Delete') {
            const chip = findChipAtOffset(root, offset, 'forward')
            if (chip) {
              event.preventDefault()
              removeChip(chip)
            }
          } else if (event.key === 'Enter') {
            event.preventDefault()
            insertPlainTextAtCaret('\n')
          }
        }}
        onPaste={(event) => {
          event.preventDefault()
          insertPlainTextAtCaret(event.clipboardData.getData('text/plain'))
        }}
      />
    </div>
  )
})

export function WorkflowVariableText({ value, className = '' }: { value: string; className?: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <span className={className}>
      <AnimatePresence initial={false}>
        {splitWorkflowText(value).map((segment) => segment.type === 'text' ? (
          <span key={segment.key}>{segment.value}</span>
        ) : (
          <motion.span
            key={segment.key}
            title={segment.token}
            aria-label={`${segment.label} variable`}
            initial={reduceMotion ? false : { opacity: 0, y: 2, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -2, scale: 0.9 }}
            transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="mx-0.5 inline-flex select-none items-center whitespace-nowrap rounded-md border border-[#caa24c]/35 bg-[#caa24c]/10 px-1.5 py-0.5 align-baseline text-[10px] font-semibold leading-4 text-[#8c6424] dark:text-[#f1d27a]"
          >
            {segment.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  )
}
