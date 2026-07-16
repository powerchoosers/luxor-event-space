'use client'

import React, { useState } from 'react'
import {
  PenSquare,
  Sparkles,
  Settings,
  HelpCircle,
  LayoutTemplate,
  ToggleLeft,
  ToggleRight,
  Send,
  Loader2,
  ChevronRight,
  Eye,
  Check,
  CheckCircle2,
  Workflow,
  ShieldCheck,
  Zap,
  Trash2
} from 'lucide-react'
import { EmailBuilderShell } from '../EmailBuilder/EmailBuilderShell'
import { EMAIL_TEMPLATES, type EmailTemplate } from '../emailTemplates'
import { useToast } from '@/components/portal/ToastProvider'

interface EmailBuilderTabProps {
  initialTemplate: EmailTemplate | null
  onOpenBlankBuilder: () => void
  onOpenTemplateInBuilder: (template: EmailTemplate) => void
}

type SubTab = 'builder' | 'templates' | 'elena-ai' | 'automation' | 'workflows' | 'settings' | 'assets'

export function EmailBuilderTab({
  initialTemplate,
  onOpenBlankBuilder,
  onOpenTemplateInBuilder
}: EmailBuilderTabProps) {
  const { notify } = useToast()
  
  // Track active subtab (Builder is selected in Rendering 4)
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('builder')
  const [showCanvas, setShowCanvas] = useState(false)
  const [builderTemplate, setBuilderTemplate] = useState<EmailTemplate | null>(initialTemplate)
  const [builderSession, setBuilderSession] = useState(0)

  // Elena AI Assistant state
  const [elenaPromptText, setElenaPromptText] = useState('')
  const [generatingElena, setGeneratingElena] = useState(false)

  // Workflows from Rendering 4
  const [automations, setAutomations] = useState([
    { id: '1', name: 'Welcome Series', enrolled: 132, rate: '45% Open', active: true },
    { id: '2', name: 'Inquiry Follow-up', enrolled: 87, rate: '38% Open', active: true },
    { id: '3', name: 'Tour Reminder', enrolled: 19, rate: '52% Open', active: true },
    { id: '4', name: 'Proposal Follow-up', enrolled: 24, rate: '41% Open', active: true },
    { id: '5', name: 'Deposit Reminder', enrolled: 11, rate: '60% Open', active: true },
    { id: '6', name: 'Review Request', enrolled: 8, rate: '67% Open', active: true },
    { id: '7', name: 'Birthday Email', enrolled: 42, rate: 'Scheduled', active: true },
    { id: '8', name: 'Re-engagement Campaign', enrolled: 6, rate: 'Draft', active: false }
  ])

  // Email Health checklist items
  const healthChecks = [
    { name: 'Spam Score', status: 'Good' },
    { name: 'Authentication', status: 'Pass' },
    { name: 'Domain Reputation', status: 'Good' },
    { name: 'Email Delivery', status: 'Excellent' }
  ]

  // Automation Activity Logs
  const activityLogs = [
    { action: 'Welcome Series', detail: 'New contact enrolled', time: '3 min ago' },
    { action: 'Inquiry Follow-up', detail: 'Email sent', time: '15 min ago' },
    { action: 'Tour Reminder', detail: 'Reminder sent to Client', time: '1 hour ago' },
    { action: 'Review Request', detail: 'Review request sent', time: '3 hours ago' },
    { action: 'Proposal Follow-up', detail: 'Email sent', time: '5 hours ago' }
  ]

  // Automation KPIs
  const performanceKPIs = [
    { label: 'Emails Sent', value: '8,452', change: '15.4% vs last 30 days', positive: true },
    { label: 'Open Rate', value: '42.6%', change: '6.4% vs last 30 days', positive: true },
    { label: 'Click Rate', value: '8.7%', change: '1.2% vs last 30 days', positive: true },
    { label: 'Reply Rate', value: '3.1%', change: '0.6% vs last 30 days', positive: true }
  ]

  function handleStartCanvas(tpl: EmailTemplate | null) {
    setBuilderTemplate(tpl)
    setBuilderSession(curr => curr + 1)
    setShowCanvas(true)
  }

  function handleSelectTemplate(tpl: EmailTemplate) {
    handleStartCanvas(tpl)
  }

  function toggleAutomation(id: string) {
    setAutomations(automations.map(aut => {
      if (aut.id === id) {
        const nextState = !aut.active
        notify({
          title: nextState ? 'Workflow Activated' : 'Workflow Deactivated',
          description: `"${aut.name}" trigger settings updated.`,
          variant: 'success'
        })
        return { ...aut, active: nextState }
      }
      return aut
    }))
  }

  async function handleGenerateElenaDraft(e: React.FormEvent) {
    e.preventDefault()
    if (!elenaPromptText.trim()) return

    setGeneratingElena(true)
    try {
      const response = await fetch('/api/portal/generate-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: elenaPromptText })
      })

      if (!response.ok) {
        throw new Error('Failed to generate draft')
      }

      const data = await response.json() as {
        subject: string
        headline: string
        body: string
      }

      const elenaCustomTemplate: EmailTemplate & { subject?: string } = {
        id: `elena-generated-${Date.now()}`,
        name: `Elena: ${elenaPromptText.slice(0, 30)}...`,
        subject: data.subject || `Welcome to Luxor Event Space`,
        description: `Elena AI Generated Email Draft`,
        category: `seasonal`,
        previewColor: `#a8792f`,
        blocks: [
          { id: '1', type: 'hero', headline: data.headline || 'Welcome to Luxor', subheadline: 'Your dream event awaits.', backgroundImage: '', overlayOpacity: 0.6, textAlign: 'center', ctaLabel: 'Book Tour', ctaUrl: 'https://luxoratlaspalmas.com/tour', ctaVisible: true },
          { id: '2', type: 'text', content: data.body || `We received your request. ${elenaPromptText}. Let us guide you on a private venue walkthrough.`, fontSize: 15, textAlign: 'left', color: 'rgba(255, 255, 255, 0.85)' }
        ]
      }

      setBuilderTemplate(elenaCustomTemplate)
      setBuilderSession(curr => curr + 1)
      setShowCanvas(true)

      notify({
        title: 'Elena Draft Generated',
        description: 'Template loaded in email editor.',
        variant: 'success'
      })
    } catch (err) {
      console.error(err)
      notify({
        title: 'Draft Generation Failed',
        description: 'Sorry bestie, I could not generate the draft email right now.',
        variant: 'error'
      })
    } finally {
      setGeneratingElena(false)
    }
  }

  // If live email builder canvas is activated
  if (showCanvas) {
    return (
      <div className="h-full min-h-[500px] border border-zinc-900/60 rounded-2xl overflow-hidden bg-black/40 flex flex-col">
        <div className="bg-zinc-950 px-4 py-2 border-b border-zinc-900 flex justify-between items-center shrink-0">
          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Email Builder Workspace
          </span>
          <button
            onClick={() => setShowCanvas(false)}
            className="rounded px-2.5 py-1 text-[9px] font-black uppercase bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
          >
            Close Canvas
          </button>
        </div>
        <div className="flex-1 min-h-0">
          <EmailBuilderShell
            key={`${builderTemplate?.id || 'blank-builder'}-${builderSession}`}
            initialTemplate={builderTemplate}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 flex flex-col h-full min-h-0 overflow-hidden">
      {/* 7 top tabs matching mockup layout */}
      <div className="flex items-center gap-1.5 border-b border-zinc-900 pb-3 overflow-x-auto portal-scrollbar w-full">
        <TabBtn active={activeSubTab === 'builder'} onClick={() => setActiveSubTab('builder')} label="Builder" />
        <TabBtn active={activeSubTab === 'templates'} onClick={() => setActiveSubTab('templates')} label="Templates" />
        <TabBtn active={activeSubTab === 'elena-ai'} onClick={() => setActiveSubTab('elena-ai')} label="Elena AI Assistant" />
        <TabBtn active={activeSubTab === 'automation'} onClick={() => setActiveSubTab('automation')} label="Automation Center" />
        <TabBtn active={activeSubTab === 'workflows'} onClick={() => setActiveSubTab('workflows')} label="Workflows" />
        <TabBtn active={activeSubTab === 'settings'} onClick={() => setActiveSubTab('settings')} label="Email Settings" />
        <TabBtn active={activeSubTab === 'assets'} onClick={() => setActiveSubTab('assets')} label="Brand Assets" />
      </div>

      {/* Main split grid layout */}
      <div className="flex-1 min-h-0 overflow-y-auto portal-scrollbar">
        {activeSubTab === 'builder' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            
            {/* Column 1: Email Builder Preview */}
            <div className="space-y-4">
              <div className="luxor-glass-card rounded-2xl p-5 border border-zinc-900 bg-zinc-950/20 space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Email Builder</h4>
                
                {/* Visual template flyer preview */}
                <div className="relative group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 h-52 flex flex-col justify-between p-4 text-center">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 z-10" />
                  
                  <span className="relative z-20 text-[7px] tracking-widest uppercase font-black text-[#caa24c]">Luxor Las Palmas</span>
                  <div className="relative z-20 space-y-1 my-auto">
                    <h5 className="text-xs font-black text-white uppercase tracking-wider leading-tight">Your Dream Event Starts Here</h5>
                    <p className="text-[8px] text-zinc-500 max-w-[140px] mx-auto">Create stunning emails with our drag and drop editor.</p>
                  </div>
                  
                  <button className="relative z-20 rounded bg-[#caa24c] px-3 py-1 mx-auto text-[8px] font-black uppercase text-black">
                    Book Tour Slot
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    onClick={() => handleStartCanvas(EMAIL_TEMPLATES[0])}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 py-2.5 text-[9px] font-black uppercase text-white tracking-widest transition-all text-center"
                  >
                    Create New Email
                  </button>
                  <button
                    onClick={() => handleStartCanvas(null)}
                    className="w-full rounded-lg bg-zinc-950 border border-zinc-900 hover:border-zinc-800 py-2.5 text-[9px] font-black uppercase text-zinc-400 tracking-widest transition-all text-center"
                  >
                    Use Blank Template
                  </button>
                </div>
              </div>

              {/* Quick Actions Card */}
              <div className="luxor-glass-card rounded-2xl p-5 border border-zinc-900 bg-zinc-950/20 space-y-3">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-zinc-500 border-b border-zinc-900 pb-2">Quick Actions</h4>
                <div className="space-y-2 text-xs font-bold text-zinc-400">
                  <QuickLink label="Create New Automation" />
                  <QuickLink label="Send Test Email" />
                  <QuickLink label="Preview Email" />
                  <QuickLink label="Check Spam Score" />
                </div>
              </div>
            </div>

            {/* Column 2 & 3: Automation Center (Workflow lists) */}
            <div className="lg:col-span-2 space-y-4">
              <div className="luxor-glass-card rounded-2xl p-6 border border-zinc-900 bg-zinc-950/20 space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Automation Center</h3>
                    <p className="text-[9px] text-zinc-500 mt-0.5">Create and manage automated email workflows.</p>
                  </div>
                  <button
                    onClick={() => setActiveSubTab('automation')}
                    className="rounded-lg bg-[#caa24c] px-3.5 py-1.5 text-[9px] font-black uppercase text-black shadow-lg shadow-[#caa24c]/10"
                  >
                    + New Automation
                  </button>
                </div>

                <div className="divide-y divide-zinc-900/60 flex flex-col">
                  {automations.map((aut) => (
                    <div key={aut.id} className="flex justify-between items-center py-3.5 first:pt-0 last:pb-0 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-950 border border-zinc-800 text-[#caa24c] shrink-0">
                          <Workflow size={13} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">{aut.name}</p>
                          <p className="text-[9.5px] font-mono text-zinc-500 mt-1 font-bold">
                            Active • {aut.enrolled} Enrolled • {aut.rate}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className={`rounded px-1.5 py-0.5 text-[7.5px] font-black uppercase tracking-wider ${
                          aut.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-900 text-zinc-550'
                        }`}>
                          {aut.active ? 'Active' : 'Inactive'}
                        </span>
                        
                        <button
                          type="button"
                          onClick={() => toggleAutomation(aut.id)}
                          className="text-zinc-400 hover:text-white transition-colors"
                        >
                          {aut.active ? (
                            <ToggleRight size={22} className="text-emerald-500" />
                          ) : (
                            <ToggleLeft size={22} className="text-zinc-650" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Column 4: Performance, Activity & Health */}
            <div className="space-y-6">
              
              {/* Performance */}
              <div className="luxor-glass-card rounded-2xl p-5 border border-zinc-900 bg-zinc-950/20 space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-white">Automation Performance (Last 30 Days)</h4>
                <div className="grid grid-cols-2 gap-3 text-left">
                  {performanceKPIs.map((kpi, idx) => (
                    <div key={idx} className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-3">
                      <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">{kpi.label}</span>
                      <p className="font-mono text-base font-black text-white mt-1 leading-none">{kpi.value}</p>
                      <p className="text-[7.5px] font-bold text-emerald-400 mt-1.5 leading-none">↑ {kpi.change.split(' ')[0]}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity Log */}
              <div className="luxor-glass-card rounded-2xl p-5 border border-zinc-900 bg-zinc-950/20 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-white">Automation Activity</h4>
                  <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">View all</span>
                </div>
                <div className="space-y-3 text-[10px] font-bold">
                  {activityLogs.map((log, idx) => (
                    <div key={idx} className="flex justify-between items-center py-1.5 border-b border-zinc-900 last:border-b-0">
                      <div>
                        <span className="text-white">{log.action}</span>
                        <p className="text-[9px] text-zinc-550 font-medium mt-0.5">{log.detail}</p>
                      </div>
                      <span className="font-mono text-[9px] text-zinc-650 shrink-0">{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Email Health Circular bar */}
              <div className="luxor-glass-card rounded-2xl p-5 border border-zinc-900 bg-zinc-950/20 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-white">Email Health</h4>
                  <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">View Report</span>
                </div>
                
                <div className="flex items-center gap-4 py-1">
                  {/* Gauge circle */}
                  <div className="relative flex items-center justify-center h-16 w-16 shrink-0">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#18181b" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15.915" fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray="98 2" />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="font-mono text-base font-black text-white leading-none">98</span>
                      <span className="text-[6px] font-bold text-emerald-400 uppercase tracking-widest mt-0.5">Excellent</span>
                    </div>
                  </div>

                  {/* Checklist items */}
                  <div className="flex-1 space-y-1.5 text-[9px] font-bold text-zinc-400">
                    {healthChecks.map((chk, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="flex items-center gap-1">
                          <Check size={10} className="text-emerald-400" />
                          {chk.name}
                        </span>
                        <span className="text-white font-bold">{chk.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Templates subtab */}
        {activeSubTab === 'templates' && (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {EMAIL_TEMPLATES.map((tpl) => (
              <button
                type="button"
                key={tpl.id}
                onClick={() => handleSelectTemplate(tpl)}
                className="group cursor-pointer overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/20 text-left transition-all hover:-translate-y-0.5 hover:border-zinc-600 hover:bg-zinc-800/20"
              >
                <div className="h-1.5 w-full" style={{ background: tpl.previewColor || '#caa24c' }} />
                <div className="p-5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-white/90 transition-colors group-hover:text-white">{tpl.name}</h4>
                    <span className="shrink-0 rounded-sm border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest border-zinc-700 text-zinc-450 bg-zinc-800/10">
                      {tpl.category}
                    </span>
                  </div>
                  <p className="mb-4 text-[11px] leading-relaxed text-zinc-500">{tpl.description}</p>
                  <span className="text-[10px] font-black uppercase text-[#caa24c] tracking-widest group-hover:underline">
                    Use Template &rarr;
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Elena AI tab */}
        {activeSubTab === 'elena-ai' && (
          <div className="max-w-3xl luxor-glass-card rounded-2xl p-6 border border-zinc-900 bg-zinc-950/20 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-white">Generate with Elena AI</h3>
            <form onSubmit={handleGenerateElenaDraft} className="space-y-4">
              <textarea
                required
                rows={4}
                value={elenaPromptText}
                onChange={(e) => setElenaPromptText(e.target.value)}
                placeholder="Describe what you want Elena to draft..."
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40"
              />
              <button
                type="submit"
                disabled={generatingElena}
                className="rounded-lg bg-[#caa24c] px-5 py-2 text-xs font-black uppercase tracking-wider text-black flex items-center gap-2"
              >
                {generatingElena ? <Loader2 size={13} className="animate-spin" /> : 'Generate Draft'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3.5 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer ${
        active ? 'bg-[#caa24c]/10 text-[#caa24c]' : 'text-zinc-550 hover:text-zinc-300'
      }`}
    >
      {label}
    </button>
  )
}

function QuickLink({ label }: { label: string }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-zinc-900/60 last:border-b-0 hover:text-white transition-colors cursor-pointer group">
      <span>{label}</span>
      <ChevronRight size={13} className="text-zinc-650 group-hover:translate-x-0.5 transition-transform" />
    </div>
  )
}
