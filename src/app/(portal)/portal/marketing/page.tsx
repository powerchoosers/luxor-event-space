'use client'

import React, { useState } from 'react'
import { 
  Mail, 
  Send, 
  Plus, 
  Zap, 
  MousePointer2, 
  Sparkles,
  BarChart3,
  PenSquare,
  LayoutTemplate,
} from 'lucide-react'
import { PortalPageFrame, PortalPageHeader } from '@/components/portal/PortalUI'
import { EmailBuilderShell } from './EmailBuilder/EmailBuilderShell'
import { EMAIL_TEMPLATES } from './emailTemplates'

// ─── Tab type ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'builder' | 'templates'

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={14} /> },
    { id: 'builder', label: 'Email Builder', icon: <PenSquare size={14} /> },
    { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={14} /> },
  ]

  return (
    <PortalPageFrame>
      <PortalPageHeader
        icon={<Mail size={18} />}
        title="Marketing Command"
        description="Orchestrate automated outreach, build branded emails, and analyze audience engagement."
        actions={
          activeTab === 'overview' ? (
            <button
              onClick={() => setActiveTab('builder')}
              className="flex items-center gap-2 bg-blue-600 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-600/25"
            >
              <Plus size={16} /> New Campaign
            </button>
          ) : null
        }
      />

      {/* Tab Bar */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-1 p-1 rounded-xl border border-zinc-800/60 bg-zinc-900/30 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-[0.15em] transition-all ${
                activeTab === tab.id
                  ? 'bg-[#caa24c] text-black shadow-md shadow-[#caa24c]/20'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Overview Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* Engagement Pulse */}
          <div className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-4 lg:gap-6">
            <StatsPanel label="Subscribers" value="8,402" trend="+124" />
            <StatsPanel label="Open Rate (Avg)" value="42.8%" trend="+2.1%" />
            <StatsPanel label="Click-Through" value="18.1%" trend="+0.5%" />
            <StatsPanel label="Bespoke Replies" value="12" trend="+3" />
          </div>

          {/* Main Campaign Grid */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
            
            {/* Left Column: ACTIVE CAMPAIGNS */}
            <div className="lg:col-span-2 space-y-4 lg:space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600">Operational Sequences</h3>
                <button
                  onClick={() => setActiveTab('builder')}
                  className="text-[10px] font-bold uppercase tracking-widest text-blue-500 hover:text-blue-400 flex items-center gap-1.5 transition-colors"
                >
                  <PenSquare size={11} />
                  Build Email
                </button>
              </div>
              
              <CampaignCard 
                title="Q2 Event Space Outreach" 
                status="Running" 
                progress={75} 
                sent={1250} 
                delivered="99.8%" 
                type="Sequence"
              />
              <CampaignCard 
                title="Corporate Holiday Early Bird" 
                status="Scheduled" 
                progress={0} 
                sent={0} 
                delivered="N/A" 
                type="Broadcast"
                accent="purple"
              />
              <CampaignCard 
                title="Post-Tour Nurture Loop" 
                status="Paused" 
                progress={42} 
                sent={84} 
                delivered="100%" 
                type="Triggered"
                accent="orange"
              />
            </div>

            {/* Right Column: AUDIENCE SEGMENTS */}
            <div className="space-y-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600 mb-2">Segment Logic</h3>
              <div className="nodal-void-card rounded-2xl border border-zinc-900 bg-black/40 backdrop-blur-xl p-6 shadow-2xl divide-y divide-zinc-900/50">
                <SegmentRow label="Corporate Planners" count="1,250" />
                <SegmentRow label="Wedding Leads (Unqualified)" count="3,480" />
                <SegmentRow label="VIP Event Portfolio" count="420" />
                <SegmentRow label="Tour No-Shows" count="180" />
                <SegmentRow label="Referral Network" count="1,042" />
                
                <div className="pt-6">
                  <button className="w-full py-2.5 rounded-lg bg-zinc-900/50 border border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors">
                    Build Custom Segment
                  </button>
                </div>
              </div>

              {/* Quick Intelligence Block */}
              <div className="nodal-void-card rounded-2xl border border-blue-900/20 bg-blue-950/5 p-6 shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-100 transition-opacity">
                  <Sparkles size={40} className="text-blue-500" />
                </div>
                <h4 className="text-xs font-bold text-white uppercase tracking-widest mb-4">Marketing Intelligence</h4>
                <p className="text-[11px] text-zinc-400 font-medium leading-relaxed italic mb-4">
                  &ldquo;We recommend re-engaging the &apos;Tour No-Shows&apos; segment using the &apos;Concierge Offer&apos; template. Current conversion probability is estimated at 18.5%.&rdquo;
                </p>
                <button
                  onClick={() => setActiveTab('builder')}
                  className="text-[10px] font-bold uppercase tracking-widest text-blue-500 flex items-center gap-2 hover:translate-x-1 transition-transform"
                >
                  Build This Email <Zap size={14} />
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Email Builder Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'builder' && (
        <div className="flex-1 min-h-0">
          <EmailBuilderShell />
        </div>
      )}

      {/* ── Templates Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div className="flex-1">
          <div className="mb-6">
            <p className="text-xs text-zinc-500">
              Choose a template to jump-start your next campaign. Templates open directly in the Email Builder with pre-filled blocks.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {EMAIL_TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                className="rounded-2xl border border-zinc-800/60 bg-zinc-900/20 overflow-hidden group hover:border-zinc-600 hover:bg-zinc-800/20 transition-all"
              >
                {/* Color bar */}
                <div className="h-1.5 w-full" style={{ background: tpl.previewColor }} />
                
                {/* Simulated email preview */}
                <div className="p-5 border-b border-zinc-800/40" style={{ minHeight: 140 }}>
                  <div className="rounded-lg overflow-hidden border border-zinc-800/40" style={{ background: '#ffffff10' }}>
                    {/* Hero simulation */}
                    <div
                      className="h-16 flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg,${tpl.previewColor}30,${tpl.previewColor}10)` }}
                    >
                      <div className="text-center px-4">
                        <div className="h-2.5 rounded-full mx-auto mb-1.5" style={{ background: tpl.previewColor, width: '60%', opacity: 0.8 }} />
                        <div className="h-1.5 rounded-full mx-auto" style={{ background: `${tpl.previewColor}60`, width: '40%' }} />
                      </div>
                    </div>
                    {/* Content simulation */}
                    <div className="p-3 space-y-1.5">
                      {[80, 95, 60, 75].map((w, i) => (
                        <div key={i} className="h-1 rounded-full bg-zinc-700/40" style={{ width: `${w}%` }} />
                      ))}
                      {/* Button simulation */}
                      <div className="flex justify-center pt-1">
                        <div className="h-4 rounded-sm px-4" style={{ background: tpl.previewColor, width: 80, opacity: 0.7 }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-sm font-bold text-white/90 group-hover:text-white transition-colors">{tpl.name}</h4>
                    <span
                      className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-sm border flex-shrink-0"
                      style={{ color: tpl.previewColor, borderColor: `${tpl.previewColor}40`, background: `${tpl.previewColor}15` }}
                    >
                      {tpl.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed mb-4">{tpl.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-700 font-mono">{tpl.blocks.length} blocks</span>
                    <button
                      onClick={() => setActiveTab('builder')}
                      className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.15em] px-3 py-1.5 rounded-lg transition-all hover:scale-105 active:scale-95"
                      style={{ background: `${tpl.previewColor}20`, color: tpl.previewColor, border: `1px solid ${tpl.previewColor}30` }}
                    >
                      <PenSquare size={10} />
                      Use Template
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PortalPageFrame>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatsPanel({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="luxor-glass-card rounded-2xl p-6 luxor-glow-gold overflow-hidden group shadow-xl">
      <p className="text-[10px] uppercase font-black text-zinc-550 tracking-[0.2em] mb-2 relative z-10">{label}</p>
      <div className="flex items-end justify-between relative z-10">
        <h3 className="text-2xl font-bold text-white font-mono tracking-tight group-hover:translate-x-1 transition-transform duration-300">{value}</h3>
        <span className="text-[10px] font-bold text-emerald-400 pb-1">{trend}</span>
      </div>
    </div>
  )
}

function CampaignCard({ title, status, progress, sent, delivered, type, accent = 'blue' }: { 
  title: string; 
  status: string; 
  progress: number; 
  sent: number; 
  delivered: string;
  type: string;
  accent?: 'blue' | 'purple' | 'orange';
}) {
  const accentMap = {
    blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
    purple: 'border-purple-500/20 bg-purple-500/5 text-purple-400',
    orange: 'border-orange-500/20 bg-orange-500/5 text-orange-400'
  }

  const glowMap = {
    blue: 'luxor-glow-blue',
    purple: 'luxor-glow-gold',
    orange: 'luxor-glow-gold'
  }

  return (
    <div className={`luxor-glass-card rounded-2xl p-6 ${glowMap[accent]} overflow-hidden shadow-xl group`}>
      <div className="flex items-center justify-between mb-6 relative z-10">
        <div className="flex items-center gap-4">
          <div className={`p-2 rounded-lg border flex items-center justify-center ${accentMap[accent]}`}>
            {type === 'Sequence' ? <Send size={16} /> : type === 'Broadcast' ? <Zap size={16} /> : <Sparkles size={16} />}
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-zinc-500 tracking-widest">{type}</p>
            <h4 className="text-sm font-bold text-white/90 group-hover:text-blue-400 transition-colors">{title}</h4>
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest ${
          status === 'Running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
          status === 'Scheduled' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 
          'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
        }`}>
          {status}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 relative z-10">
        <div>
          <p className="text-[10px] text-zinc-550 font-bold uppercase mb-1">Total Sends</p>
          <p className="text-lg font-bold text-white font-mono">{sent.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-550 font-bold uppercase mb-1">Click Accuracy</p>
          <p className="text-lg font-bold text-white font-mono">{delivered}</p>
        </div>
        <div>
          <p className="text-[10px] text-zinc-550 font-bold uppercase mb-1">Progress</p>
          <p className="text-lg font-bold text-white font-mono">{progress}%</p>
        </div>
      </div>

      <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden relative z-10">
        <div className="h-full bg-blue-600 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}

function SegmentRow({ label, count }: { label: string; count: string }) {
  return (
    <div className="py-4 flex items-center justify-between group/seg">
      <span className="text-[11px] font-medium text-zinc-400 group-hover/seg:text-zinc-200 transition-colors uppercase tracking-tight">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono font-bold text-white/90 group-hover/seg:text-blue-500 transition-colors">{count}</span>
        <button className="text-zinc-700 hover:text-zinc-300 transition-colors"><MousePointer2 size={12} /></button>
      </div>
    </div>
  )
}
