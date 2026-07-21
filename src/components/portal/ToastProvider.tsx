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
    icon: <Info size={16} />,
    className: 'border-blue-500/20 bg-blue-500/10 text-blue-200',
    labelClassName: 'text-blue-300',
  },
  success: {
    icon: <CheckCircle2 size={16} />,
    className: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
    labelClassName: 'text-emerald-300',
  },
  warning: {
    icon: <AlertCircle size={16} />,
    className: 'border-[#caa24c]/25 bg-[#caa24c]/10 text-[#f1d27a]',
    labelClassName: 'text-[#f1d27a]',
  },
  error: {
    icon: <AlertCircle size={16} />,
    className: 'border-rose-500/25 bg-rose-500/10 text-rose-200',
    labelClassName: 'text-rose-300',
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
      <div className="pointer-events-none fixed right-4 top-4 z-[120] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 sm:right-5 sm:top-5">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const style = variantStyles[toast.variant || 'info']
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 24, scale: 0.98 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
                className={`pointer-events-auto relative overflow-hidden rounded-2xl border p-4 pr-11 shadow-2xl backdrop-blur-xl ${style.className}`}
                role="status"
                aria-live="polite"
              >
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  className="absolute right-2.5 top-2.5 rounded-lg p-1 text-current opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                  aria-label="Close notification"
                >
                  <X size={15} />
                </button>
                <div className="flex gap-3">
                  <span className={`mt-0.5 shrink-0 ${style.labelClassName}`}>
                    {toast.icon !== undefined ? toast.icon : style.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-5 text-white">{toast.title}</p>
                    {toast.description ? (
                      <p className="mt-1 text-xs leading-5 text-current/75">{toast.description}</p>
                    ) : null}
                    {toast.action ? (
                      <div className="mt-3 pointer-events-auto">
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
