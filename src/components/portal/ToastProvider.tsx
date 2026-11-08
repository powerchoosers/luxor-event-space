'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, Info, X } from '@/lib/icons/phosphor-compat'
import { AnimatePresence, motion } from 'framer-motion'

type ToastVariant = 'info' | 'success' | 'warning' | 'error'

type ToastInput = {
  title: ReactNode
  description?: ReactNode
  variant?: ToastVariant
  durationMs?: number
  action?: ReactNode
  icon?: ReactNode
  onClick?: () => void
}

type Toast = ToastInput & {
  id: string
  createdAt: number
}

type ToastContextValue = {
  notify: (toast: ToastInput) => string
  dismiss: (id: string) => void
}

const noopToastContext: ToastContextValue = {
  notify: () => '',
  dismiss: () => {},
}

const ToastContext = createContext<ToastContextValue>(noopToastContext)

const variantStyles: Record<ToastVariant, { icon: ReactNode; className: string; labelClassName: string }> = {
  info: {
    icon: <Info size={18} className="text-blue-400" />,
    className: 'border-blue-500/30 bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-lg shadow-blue-500/5',
    labelClassName: 'text-blue-400',
  },
  success: {
    icon: <CheckCircle2 size={18} className="text-emerald-400" />,
    className: 'border-emerald-500/30 bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-lg shadow-emerald-500/5',
    labelClassName: 'text-emerald-400',
  },
  warning: {
    icon: <AlertCircle size={18} className="text-[#caa24c]" />,
    className: 'border-[#caa24c]/40 bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-lg shadow-[#caa24c]/5',
    labelClassName: 'text-[#caa24c]',
  },
  error: {
    icon: <AlertCircle size={18} className="text-rose-400" />,
    className: 'border-rose-500/30 bg-[color:var(--portal-card)] text-[color:var(--portal-text)] shadow-lg shadow-rose-500/5',
    labelClassName: 'text-rose-400',
  },
}

function ToastItem({
  toast,
  style,
  onDismiss,
}: {
  toast: Toast
  style: { icon: ReactNode; className: string; labelClassName: string }
  onDismiss: (id: string) => void
}) {
  const isDraggingRef = useRef(false)

  return (
    <motion.div
      key={toast.id}
      layout
      drag="x"
      dragDirectionLock
      dragConstraints={{ left: 0, right: 320 }}
      dragElastic={{ left: 0.05, right: 0.75 }}
      dragSnapToOrigin
      onDragStart={() => {
        isDraggingRef.current = true
      }}
      onDragEnd={(_e, info) => {
        // Swipe right past 60px or flick right with velocity to dismiss
        if (info.offset.x > 60 || info.velocity.x > 250) {
          onDismiss(toast.id)
        }
        setTimeout(() => {
          isDraggingRef.current = false
        }, 120)
      }}
      initial={{ opacity: 0, y: -20, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{
        opacity: 0,
        x: 180,
        scale: 0.92,
        transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] },
      }}
      transition={{
        duration: 0.24,
        ease: [0.23, 1, 0.32, 1],
        layout: { duration: 0.22, ease: [0.23, 1, 0.32, 1] },
      }}
      className={`portal-toast pointer-events-auto relative overflow-hidden rounded-2xl border p-4 pr-12 shadow-2xl backdrop-blur-xl touch-pan-y cursor-grab active:cursor-grabbing select-none transform-gpu will-change-transform ${
        toast.onClick ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/60' : ''
      } ${style.className}`}
      data-toast-variant={toast.variant || 'info'}
      role={toast.onClick ? 'button' : 'status'}
      tabIndex={toast.onClick ? 0 : undefined}
      onClick={() => {
        if (isDraggingRef.current) return
        toast.onClick?.()
      }}
      onKeyDown={(event) => {
        if (toast.onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          toast.onClick()
        }
      }}
      aria-live="polite"
    >
      {/* Vertically centered dismiss button on the right edge */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDismiss(toast.id)
        }}
        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex h-7 w-7 items-center justify-center rounded-xl text-[color:var(--portal-muted)] transition-colors hover:text-[color:var(--portal-text)] hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/45 cursor-pointer"
        aria-label="Close notification"
      >
        <X size={15} />
      </button>
      <div className="flex gap-3">
        <span className={`mt-0.5 shrink-0 ${style.labelClassName}`}>
          {toast.icon !== undefined ? toast.icon : style.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5 text-[color:var(--portal-text)]">{toast.title}</p>
          {toast.description ? (
            <p className="mt-1 text-xs leading-5 text-[color:var(--portal-muted)]">{toast.description}</p>
          ) : null}
          {toast.action ? (
            <div className="mt-2.5 pointer-events-auto">
              {toast.action}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const canUsePortal = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  )

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const notify = useCallback((toast: ToastInput) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const nextToast: Toast = {
      ...toast,
      id,
      createdAt: Date.now(),
      variant: toast.variant || 'info',
    }

    setToasts((current) => [nextToast, ...current].slice(0, 5))

    if (toast.durationMs !== 0) {
      window.setTimeout(() => dismiss(id), toast.durationMs ?? 7000)
    }

    return id
  }, [dismiss])

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {canUsePortal ? createPortal(<div className="pointer-events-none fixed right-4 top-4 z-[300] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5 sm:right-5 sm:top-5">
        <AnimatePresence mode="popLayout" initial={false}>
          {toasts.map((toast) => (
            <ToastItem
              key={toast.id}
              toast={toast}
              style={variantStyles[toast.variant || 'info']}
              onDismiss={dismiss}
            />
          ))}
        </AnimatePresence>
      </div>, document.body) : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  return context || noopToastContext
}
