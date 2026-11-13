'use client'

import React, { useCallback, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import type { ElenaSlashCommand, ElenaSlashCommandScope } from '@/lib/luxorElenaSlashCommands'
import { ElenaPersonalSlashCommandsEditor } from '@/components/portal/ElenaPersonalSlashCommandsModal'
import { PORTAL_MODAL_EASE, PORTAL_MODAL_EXIT_EASE } from '@/components/portal/PortalUI'

export function ElenaSlashScopeBadge({ scope }: { scope: ElenaSlashCommandScope }) {
  const system = scope === 'system'
  return (
    <span
      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
        system
          ? 'bg-slate-200/90 text-slate-600 dark:bg-slate-700/90 dark:text-slate-300'
          : 'bg-[#caa24c]/20 text-[#9a7028] dark:text-[#f1d27a]'
      }`}
    >
      {system ? 'System' : 'Personal'}
    </span>
  )
}

export function ElenaSlashTriggerBadge({ command }: { command: ElenaSlashCommand }) {
  const system = command.scope === 'system'
  return (
    <span
      className={`inline-flex max-w-full shrink-0 items-center rounded-lg border px-2 py-0.5 font-mono text-[10px] font-bold leading-5 ${
        system
          ? 'border-slate-300/80 bg-slate-100/90 text-slate-800 dark:border-slate-600/70 dark:bg-slate-800/80 dark:text-slate-100'
          : 'border-[#caa24c]/45 bg-[#caa24c]/14 text-[#8a6422] dark:text-[#f1d27a]'
      }`}
    >
      <span className="truncate">/{command.trigger}</span>
    </span>
  )
}

type SlashMenuCoords = { left: number; width: number; bottom: number }

function useSlashMenuCoords(anchorRef: React.RefObject<HTMLElement | null>, open: boolean) {
  const [coords, setCoords] = useState<SlashMenuCoords | null>(null)
  const [frozenCoords, setFrozenCoords] = useState<SlashMenuCoords | null>(null)

  const update = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    const width = rect.width
    const maxLeft = Math.max(12, window.innerWidth - width - 12)
    const next = {
      left: Math.min(Math.max(12, rect.left), maxLeft),
      width,
      bottom: Math.max(12, window.innerHeight - rect.top + 8),
    }
    setCoords(next)
    setFrozenCoords(next)
  }, [anchorRef])

  useLayoutEffect(() => {
    if (!open) {
      return
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, update])

  return open ? coords : frozenCoords
}

const LIST_MAX_PX = 224
const MANAGE_MAX_PX = 352

function SlashCommandMenuPanel({
  commands,
  highlightIndex,
  onPick,
  reduceMotion,
  manageExpanded,
  onManageExpandedChange,
  userEmail,
  onPersonalShortcutsSaved,
  coords,
}: {
  commands: ElenaSlashCommand[]
  highlightIndex: number
  onPick: (command: ElenaSlashCommand) => void
  reduceMotion: boolean
  manageExpanded: boolean
  onManageExpandedChange: (open: boolean) => void
  userEmail: string
  onPersonalShortcutsSaved: () => void
  coords: SlashMenuCoords
}) {
  const openManage = () => onManageExpandedChange(true)
  const closeManage = () => onManageExpandedChange(false)

  const panelShell =
    'elena-slash-command-popover portal-popover-surface rounded-2xl border border-[color:var(--portal-border)] shadow-[0_18px_40px_-24px_rgba(0,0,0,0.55)] ring-1 ring-black/5'
  const panelScroll = 'portal-scrollbar overflow-y-auto'
  const fixedStyle: React.CSSProperties = {
    position: 'fixed',
    left: coords.left,
    width: coords.width,
    bottom: coords.bottom,
    zIndex: 130,
  }

  const shellSpring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 520, damping: 38, mass: 0.82 }
  const contentSpring = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 480, damping: 36, mass: 0.78 }
  const enterTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: PORTAL_MODAL_EASE }
  const exitTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: PORTAL_MODAL_EXIT_EASE }

  const shellMaxHeight = manageExpanded ? MANAGE_MAX_PX : commands.length ? LIST_MAX_PX : 200

  return (
    <motion.div
      style={fixedStyle}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: enterTransition }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, transition: exitTransition }}
      className="pointer-events-auto origin-bottom"
    >
      <motion.div
        data-portal-popover="true"
        role={manageExpanded ? 'dialog' : commands.length ? 'listbox' : 'status'}
        aria-label={
          manageExpanded
            ? 'Personal Elena shortcuts'
            : commands.length
              ? 'Elena slash commands'
              : undefined
        }
        className={`${panelShell} overflow-hidden py-1.5`}
        initial={false}
        animate={{ maxHeight: shellMaxHeight }}
        transition={shellSpring}
        style={{ maxHeight: shellMaxHeight }}
      >
        <div
          className={panelScroll}
          style={{ maxHeight: shellMaxHeight - 12 }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {manageExpanded ? (
              <motion.div
                key="slash-manage"
                initial={reduceMotion ? false : { opacity: 0, filter: 'blur(6px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' }}
                transition={contentSpring}
              >
                <div className="px-3 pb-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Personal shortcuts</p>
                  <p className="mt-1 text-[10px] leading-snug text-[color:var(--portal-muted)]">
                    Type /your-trigger in Elena to send the saved prompt.
                  </p>
                </div>
                <div className="border-t border-[color:var(--portal-border)]/80 px-3 pt-2.5 pb-1">
                  <ElenaPersonalSlashCommandsEditor
                    key={`${userEmail}-inline`}
                    userEmail={userEmail}
                    variant="inline"
                    onClose={closeManage}
                    onSaved={() => {
                      onPersonalShortcutsSaved()
                      closeManage()
                    }}
                  />
                </div>
              </motion.div>
            ) : !commands.length ? (
              <motion.div
                key="slash-empty"
                className="p-3 text-xs"
                initial={reduceMotion ? false : { opacity: 0, filter: 'blur(6px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' }}
                transition={contentSpring}
              >
                <p className="text-[color:var(--portal-muted)]">No matching commands.</p>
                <button
                  type="button"
                  onClick={openManage}
                  className="mt-2 font-semibold text-[#a8792f] hover:text-[#caa24c] dark:text-[#f1d27a]"
                >
                  Add a personal shortcut
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="slash-list"
                initial={reduceMotion ? false : { opacity: 0, filter: 'blur(6px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' }}
                transition={contentSpring}
              >
                <p className="px-3 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-widest text-[color:var(--portal-muted)]">Slash commands</p>
                <div className="pb-1">
                  {commands.map((command, index) => (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={index === highlightIndex}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        onPick(command)
                      }}
                      className={`mx-1.5 flex w-[calc(100%-0.75rem)] items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                        index === highlightIndex
                          ? 'bg-[#caa24c]/12 ring-1 ring-[#caa24c]/25'
                          : 'hover:bg-[color:var(--portal-soft)]'
                      } ${index === commands.length - 1 ? 'mb-0.5' : ''}`}
                    >
                      <ElenaSlashTriggerBadge command={command} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold text-[color:var(--portal-text)]">{command.label}</span>
                        <span className="mt-0.5 block text-[10px] leading-snug text-[color:var(--portal-muted)]">{command.hint}</span>
                      </span>
                      <ElenaSlashScopeBadge scope={command.scope} />
                    </button>
                  ))}
                </div>
                <div className="border-t border-[color:var(--portal-border)]/80 px-3 py-1">
                  <button
                    type="button"
                    onClick={openManage}
                    className="text-[10px] font-semibold text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)]"
                  >
                    Manage personal shortcuts…
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function ElenaSlashCommandMenu({
  open,
  anchorRef,
  commands,
  highlightIndex,
  onPick,
  reduceMotion,
  manageExpanded,
  onManageExpandedChange,
  userEmail,
  onPersonalShortcutsSaved,
}: {
  open: boolean
  anchorRef: React.RefObject<HTMLElement | null>
  commands: ElenaSlashCommand[]
  highlightIndex: number
  onPick: (command: ElenaSlashCommand) => void
  reduceMotion: boolean
  manageExpanded: boolean
  onManageExpandedChange: (open: boolean) => void
  userEmail: string
  onPersonalShortcutsSaved: () => void
}) {
  const coords = useSlashMenuCoords(anchorRef, open)

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence initial={false}>
      {open && coords ? (
        <SlashCommandMenuPanel
          key="elena-slash-menu"
          commands={commands}
          highlightIndex={highlightIndex}
          onPick={onPick}
          reduceMotion={reduceMotion}
          manageExpanded={manageExpanded}
          onManageExpandedChange={onManageExpandedChange}
          userEmail={userEmail}
          onPersonalShortcutsSaved={onPersonalShortcutsSaved}
          coords={coords}
        />
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
