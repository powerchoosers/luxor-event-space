'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  PenSquare,
  BrainCircuit,
  LayoutTemplate,
  Loader2,
  ChevronRight,
  Workflow,
} from 'lucide-react'
import { EmailBuilderShell } from '../EmailBuilder/EmailBuilderShell'
import { EMAIL_TEMPLATES, type EmailBlock, type EmailTemplate } from '../emailTemplates'
import { useToast } from '@/components/portal/ToastProvider'
import { type LuxorInquiry } from '@/lib/luxorInquiryTypes'
import type { Campaign, MarketingActivityEvent } from '../page'

interface EmailBuilderTabProps {
  initialTemplate: EmailTemplate | null
  campaigns: Campaign[]
  activityEvents: MarketingActivityEvent[]
  onOpenBlankBuilder: () => void
  onOpenTemplateInBuilder: (template: EmailTemplate) => void
}

type SubTab = 'builder' | 'templates' | 'elena-ai'

export function EmailBuilderTab({
  initialTemplate,
  campaigns,
  activityEvents,
  onOpenBlankBuilder,
  onOpenTemplateInBuilder
}: EmailBuilderTabProps) {
  const { notify } = useToast()
  const searchParams = useSearchParams()
  const leadId = searchParams?.get('leadId')
  
  // Track active subtab (Builder is selected in Rendering 4)
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('builder')
  const [showCanvas, setShowCanvas] = useState(false)
  const [builderTemplate, setBuilderTemplate] = useState<EmailTemplate | null>(initialTemplate)
  const [builderSession, setBuilderSession] = useState(0)

  // Elena AI Assistant state
  const [elenaPromptText, setElenaPromptText] = useState('')
  const [generatingElena, setGeneratingElena] = useState(false)
  const [tone, setTone] = useState<'friendly' | 'professional' | 'urgent' | 'elegant'>('friendly')
  const [activeLead, setActiveLead] = useState<LuxorInquiry | null>(null)

  useEffect(() => {
    if (leadId) {
      fetch('/api/inquiries')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            const found = data.find((i: LuxorInquiry) => i.id === leadId)
            if (found) {
              setActiveLead(found)
              setElenaPromptText(`Write a personalized follow-up email to ${found.full_name} regarding their upcoming ${found.event_type || 'event'} on ${found.target_date || 'their requested date'}. Thank them for reaching out and invite them to book a private tour.`)
              setActiveSubTab('elena-ai')
            }
          }
        })
        .catch(err => console.error('Failed to load lead context:', err))
    }
  }, [leadId])

  const automatedCampaigns = React.useMemo(
    () => campaigns.filter((campaign) => campaign.audience_label?.toLowerCase().includes('automat')),
    [campaigns],
  )
  const campaignTotals = React.useMemo(() => {
    const sent = campaigns.reduce((sum, campaign) => sum + campaign.sent_count, 0)
    const opens = campaigns.reduce((sum, campaign) => sum + campaign.unique_opens, 0)
    const clicks = campaigns.reduce((sum, campaign) => sum + campaign.unique_clicks, 0)
    const recipients = campaigns.reduce((sum, campaign) => sum + campaign.recipient_count, 0)
    return {
      sent,
      recipients,
      openRate: sent ? Math.round((opens / sent) * 1000) / 10 : 0,
      clickRate: sent ? Math.round((clicks / sent) * 1000) / 10 : 0,
    }
  }, [campaigns])
  const performanceKPIs = [
    { label: 'Campaigns', value: campaigns.length.toLocaleString() },
    { label: 'Recipients', value: campaignTotals.recipients.toLocaleString() },
    { label: 'Open Rate', value: `${campaignTotals.openRate}%` },
    { label: 'Click Rate', value: `${campaignTotals.clickRate}%` },
  ]

  function handleStartCanvas(tpl: EmailTemplate | null) {
    setBuilderTemplate(tpl)
    setBuilderSession(curr => curr + 1)
    setShowCanvas(true)
  }

  function handleSelectTemplate(tpl: EmailTemplate) {
    handleStartCanvas(tpl)
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
        body: JSON.stringify({ 
          prompt: elenaPromptText,
          tone,
          leadContext: activeLead
        })
      })

      if (!response.ok) {
        throw new Error('Failed to generate draft')
      }

      const data = await response.json() as {
        subject: string
        name: string
        blocks: Record<string, unknown>[]
      }

      const mappedBlocks: EmailBlock[] = Array.isArray(data.blocks)
        ? (data.blocks.map((block, idx) => ({
            ...block,
            id: (block.id as string) || `${block.type as string}-${idx}-${Date.now()}`
          })) as unknown as EmailBlock[])
        : [
            { id: `hero-${Date.now()}`, type: 'hero', headline: 'Welcome to Luxor', subheadline: 'Your dream event awaits.', backgroundImage: '', overlayOpacity: 0.6, textAlign: 'center', ctaLabel: 'Book Tour', ctaUrl: 'https://luxoratlaspalmas.com/tour', ctaVisible: true },
            { id: `text-${Date.now()}`, type: 'text', content: `We received your request. Let us guide you on a private venue walkthrough.`, fontSize: 15, textAlign: 'left', color: 'rgba(255, 255, 255, 0.85)' }
          ]

      // Append default footer if not present
      if (!mappedBlocks.some(b => b.type === 'footer')) {
        const defaultFooter = EMAIL_TEMPLATES[0].blocks.find(b => b.type === 'footer') || {
          id: 'footer-default',
          type: 'footer',
          companyName: 'Luxor Event Space',
          address: '803 Castroville Rd #402, San Antonio, TX 78237',
          phone: 'Private venue tours by appointment.',
          website: 'luxoratlaspalmas.com',
          unsubscribeUrl: '#unsubscribe',
          showSocial: true,
          instagramUrl: 'https://www.instagram.com/luxoratlaspalmas?utm_source=qr',
          facebookUrl: 'https://www.facebook.com/share/1DD3mKM8XJ/?mibextid=wwXIfr',
          tiktokUrl: 'https://www.tiktok.com/@luxoratlaspalmas?_r=1&_t=ZT-97vnzmYjFUM',
        }
        mappedBlocks.push(defaultFooter)
      }

      const elenaCustomTemplate: EmailTemplate & { subject?: string } = {
        id: `elena-generated-${Date.now()}`,
        name: data.name || `Elena: ${elenaPromptText.slice(0, 30)}...`,
        subject: data.subject || `Welcome to Luxor Event Space`,
        description: `Elena AI Generated Email Draft`,
        category: `seasonal`,
        previewColor: `#a8792f`,
        blocks: mappedBlocks
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
                  
                  <button className="relative z-20 rounded bg-[#caa24c] px-3 py-1 mx-auto text-[8px] font-black uppercase text-white">
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
                  <QuickLink label="Start Blank Email" onClick={() => handleStartCanvas(null)} />
                  <QuickLink label="Browse Templates" onClick={() => setActiveSubTab('templates')} />
                  <QuickLink label="Draft with Elena" onClick={() => setActiveSubTab('elena-ai')} />
                </div>
              </div>
            </div>

            {/* Supabase-backed automated campaigns */}
            <div className="lg:col-span-2 space-y-4">
              <div className="luxor-glass-card rounded-2xl p-6 border border-zinc-900 bg-zinc-950/20 space-y-4">
                <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white">Automated Campaigns</h3>
                    <p className="text-[9px] text-zinc-500 mt-0.5">Campaigns whose saved audience is marked as automated.</p>
                  </div>
                </div>

                <div className="divide-y divide-zinc-900/60 flex flex-col">
                  {automatedCampaigns.length ? automatedCampaigns.map((campaign) => (
                    <div key={campaign.id} className="flex justify-between items-center py-3.5 first:pt-0 last:pb-0 gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-950 border border-zinc-800 text-[#caa24c] shrink-0">
                          <Workflow size={13} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white leading-tight">{campaign.name}</p>
                          <p className="text-[9.5px] font-mono text-zinc-500 mt-1 font-bold">
                            {campaign.recipient_count} recipients • {campaign.open_rate}% open • {campaign.click_rate}% click
                          </p>
                        </div>
                      </div>
                      <span className="rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-zinc-400">{campaign.status}</span>
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed border-zinc-850 p-6 text-center text-xs text-zinc-600">
                      No Supabase campaign is marked as an automation.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Real campaign performance and activity */}
            <div className="space-y-6">
              <div className="luxor-glass-card rounded-2xl p-5 border border-zinc-900 bg-zinc-950/20 space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-white">Tracked Campaign Performance</h4>
                <div className="grid grid-cols-2 gap-3 text-left">
                  {performanceKPIs.map((kpi) => (
                    <div key={kpi.label} className="bg-zinc-950/40 border border-zinc-900 rounded-xl p-3">
                      <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">{kpi.label}</span>
                      <p className="font-mono text-base font-black text-white mt-1 leading-none">{kpi.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="luxor-glass-card rounded-2xl p-5 border border-zinc-900 bg-zinc-950/20 space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-white">Campaign Activity</h4>
                  <span className="text-[8px] font-bold text-zinc-550 uppercase tracking-widest">{activityEvents.length} tracked</span>
                </div>
                <div className="space-y-3 text-[10px] font-bold">
                  {activityEvents.length ? activityEvents.slice(0, 5).map((event) => (
                    <div key={event.id} className="flex justify-between items-center gap-3 py-1.5 border-b border-zinc-900 last:border-b-0">
                      <div>
                        <span className="text-white">{event.campaign_name || event.campaign_subject || 'Campaign name unavailable'}</span>
                        <p className="text-[9px] text-zinc-550 font-medium mt-0.5">{event.event_type} • {event.recipient_name || event.recipient_email || 'Recipient unavailable'}</p>
                      </div>
                      <span className="font-mono text-[9px] text-zinc-650 shrink-0">{new Date(event.created_at).toLocaleDateString()}</span>
                    </div>
                  )) : (
                    <div className="rounded-xl border border-dashed border-zinc-850 p-5 text-center text-xs text-zinc-600">No opens, clicks, or unsubscribes have been tracked.</div>
                  )}
                </div>
              </div>

              <div className="luxor-glass-card rounded-2xl p-5 border border-zinc-900 bg-zinc-950/20 space-y-4">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-white">Tracking Coverage</h4>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <TrackingMetric label="Campaigns" value={campaigns.length} />
                  <TrackingMetric label="Sent" value={campaignTotals.sent} />
                  <TrackingMetric label="Events" value={activityEvents.length} />
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
            
            {activeLead && (
              <div className="rounded-xl border border-[#caa24c]/30 bg-[#caa24c]/5 p-3 flex items-start gap-2.5">
                <BrainCircuit size={14} className="text-[#caa24c] shrink-0 mt-0.5" />
                <div className="text-xs leading-normal">
                  <span className="font-bold text-[#f7efe3]">Context Active:</span> Personalizing follow-up for client <span className="font-bold text-[#caa24c]">{activeLead.full_name}</span> ({activeLead.event_type || 'Event'}, {activeLead.guest_count || 'open'} guests)
                </div>
              </div>
            )}

            <form onSubmit={handleGenerateElenaDraft} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-550 mb-1.5">
                  Email Tone of Voice
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value as 'friendly' | 'professional' | 'urgent' | 'elegant')}
                  className="w-full sm:w-64 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40 cursor-pointer"
                >
                  <option value="friendly">💅 Warm & Friendly</option>
                  <option value="professional">💼 Corporate & Professional</option>
                  <option value="urgent">🔥 Urgent (FOMO)</option>
                  <option value="elegant">✨ Luxurious & Elegant</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-550 mb-1.5">
                  Your Instructions
                </label>
                <textarea
                  required
                  rows={4}
                  value={elenaPromptText}
                  onChange={(e) => setElenaPromptText(e.target.value)}
                  placeholder="Describe what you want Elena to draft..."
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-white outline-none focus:border-[#caa24c]/40"
                />
              </div>

              <button
                type="submit"
                disabled={generatingElena}
                className="rounded-lg bg-[#caa24c] px-5 py-2 text-xs font-black uppercase tracking-wider text-white flex items-center gap-2"
              >
                {generatingElena ? <Loader2 size={13} className="animate-spin" /> : 'Generate Custom Template'}
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

function TrackingMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-900 bg-zinc-950/40 p-3">
      <p className="text-[7px] font-black uppercase tracking-wider text-zinc-600">{label}</p>
      <p className="mt-1 font-mono text-sm font-bold text-white">{value.toLocaleString()}</p>
    </div>
  )
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-full items-center justify-between border-b border-zinc-900/60 py-2 text-left transition-colors last:border-b-0 hover:text-white">
      <span>{label}</span>
      <ChevronRight size={13} className="text-zinc-650 group-hover:translate-x-0.5 transition-transform" />
    </button>
  )
}
