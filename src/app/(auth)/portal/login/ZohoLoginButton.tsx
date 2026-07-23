'use client'

import { ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

const steps = [
  'Contacting Zoho identity',
  'Verifying Luxor mailbox',
  'Opening owner workspace',
]

export function ZohoLoginButton() {
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    if (!isAuthenticating) return

    const timers = [
      window.setTimeout(() => setActiveStep(1), 520),
      window.setTimeout(() => setActiveStep(2), 1040),
      window.setTimeout(() => {
        window.location.href = '/api/auth/zoho/login'
      }, 1450),
    ]

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [isAuthenticating])

  return (
    <>
      <button
        type="button"
        onClick={() => setIsAuthenticating(true)}
        disabled={isAuthenticating}
        className="group mt-7 flex h-14 w-full items-center justify-center gap-3 rounded-lg bg-[#caa24c] px-5 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-[#caa24c]/10 transition-colors hover:bg-[#f1d27a] disabled:cursor-wait disabled:opacity-90"
      >
        {isAuthenticating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
        {isAuthenticating ? 'Authenticating' : 'Sign in with Zoho'}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </button>

      {isAuthenticating ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#050505]/92 px-5 backdrop-blur-xl">
          <div className="w-full max-w-md rounded-2xl border border-[#caa24c]/20 bg-zinc-950/90 p-6 text-center shadow-2xl shadow-black/60">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-[#caa24c]/24 bg-[#0d0b08]">
              <ShieldCheck className="h-7 w-7 text-[#f1d27a]" />
            </div>
            <p className="mt-6 font-mono text-[10px] font-black uppercase tracking-[0.32em] text-[#caa24c]">
              Secure Handoff
            </p>
            <h2 className="mt-3 font-serif text-3xl text-white">Preparing Zoho login.</h2>

            <div className="mt-6 space-y-3 text-left">
              {steps.map((step, index) => {
                const isComplete = index < activeStep
                const isActive = index === activeStep

                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                      isActive
                        ? 'border-[#caa24c]/32 bg-[#caa24c]/8 text-[#f7efe3]'
                        : isComplete
                          ? 'border-emerald-500/18 bg-emerald-500/8 text-emerald-200'
                          : 'border-zinc-800 bg-black/20 text-zinc-600'
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                    ) : isActive ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#f1d27a]" />
                    ) : (
                      <span className="h-4 w-4 shrink-0 rounded-full border border-zinc-700" />
                    )}
                    <span className="text-xs font-bold uppercase tracking-[0.16em]">{step}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
