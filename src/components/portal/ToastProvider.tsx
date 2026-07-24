'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

type ToastVariant = 'info' | 'success' | 'warning' | 'error'

type ToastInput = {
  title: ReactNode
  description?: ReactNode
  variant?: ToastVariant
  durationMs?: number
  action?: ReactNode
  icon?: ReactNode
}

type Toast = ToastInput & {
  id: string
  createdAt: number
}

type ToastContextValue = {
  notify: (toast: ToastInput) => string
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

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
      <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5 sm:right-5 sm:top-5">
        <AnimatePresence mode="popLayout" initial={false}>
          {toasts.map((toast) => {
            const style = variantStyles[toast.variant || 'info']
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.92 }}
                transition={{
                  duration: 0.24,
                  ease: [0.23, 1, 0.32, 1],
                  layout: { duration: 0.22, ease: [0.23, 1, 0.32, 1] },
                }}
                className={`pointer-events-auto relative overflow-hidden rounded-2xl border p-4 pr-11 shadow-2xl backdrop-blur-xl ${style.className}`}
                role="status"
                aria-live="polite"
              >
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="absolute right-2.5 top-2.5 rounded-lg p-1 text-[color:var(--portal-muted)] opacity-70 transition-all hover:text-[color:var(--portal-text)] hover:opacity-100 hover:bg-[color:var(--portal-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#caa24c]/50 cursor-pointer"
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
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used inside ToastProvider.')
  }
  return context
}
