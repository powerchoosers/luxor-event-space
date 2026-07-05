import React from "react";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  Users, 
  Calendar, 
  Mail,
  Activity,
  ChevronRight,
  ExternalLink,
  Sparkles,
  DollarSign
} from "lucide-react";
import Link from "next/link";
import { listLuxorInquiries } from "@/lib/luxorInquiriesServer";
import { listInvoices } from "@/lib/luxorInvoicesServer";
import { listRecentNotes } from "@/lib/luxorNotesServer";
import { LuxorInquiry, LuxorInvoice, LuxorNote } from "@/lib/luxorInquiryTypes";
import { PortalBridgeCard, PortalPageFrame, PortalStickyTable, PortalStickyThead, PortalTableCard, PortalStatusBadge } from "@/components/portal/PortalUI";

export default async function PortalOverview() {
  let leads: LuxorInquiry[] = [];
  let invoices: LuxorInvoice[] = [];
  let recentNotes: LuxorNote[] = [];
  let loadError: string | null = null;


  try {
    leads = await listLuxorInquiries(100);
    invoices = await listInvoices(100);
    recentNotes = await listRecentNotes(5);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to retrieve database metrics.";
  }

  // Calculations
  const paidInvoices = invoices.filter(inv => inv.status === 'paid');
  const totalRevenue = paidInvoices.reduce((acc, inv) => acc + Number(inv.total), 0);

  const bookedLeads = leads.filter(l => l.status === 'booked');
  const conversionRate = leads.length > 0 ? (bookedLeads.length / leads.length) * 100 : 0;

  const activeLeads = leads.filter(l => l.status !== 'booked' && l.status !== 'closed_lost');

  // Count upcoming tours
  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingEvents = leads.filter(l => l.preferred_tour_date && l.preferred_tour_date >= todayStr);

  return (
    <PortalPageFrame className="min-h-full pb-10 group/portal">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white/90">Portfolio Overview</h1>
        <p className="text-zinc-500 font-medium text-sm">Real-time command and control for Luxor Event Space operations.</p>
      </div>

      <PortalBridgeCard
        label="Public website extension"
        title="Every website visit should have a next step in the CRM."
        description="The public Luxor site sets the mood, captures tour intent, and sends requests into this portal so the owner side can follow up without losing context."
        action={
          <div className="flex flex-wrap gap-3">
            <Link href="/" className="inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/24 bg-[#caa24c]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#f1d27a] transition-colors hover:bg-[#caa24c]/16">
              View website <ExternalLink size={12} />
            </Link>
            <Link href="/tour" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300 transition-colors hover:border-[#caa24c]/30 hover:text-white">
              Tour flow <Sparkles size={12} />
            </Link>
          </div>
        }
      />

      {loadError && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-xs font-medium text-red-400">
          Telemetry Warning: {loadError} (Running in Offline/Fallback Simulation)
        </div>
      )}

      {/* Metric Grid */}
      <div className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        <MetricCard 
          label="Total Revenue" 
          value={`$${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          change="+100%" 
          trend="up" 
          icon={<DollarSign size={16} />} 
          color="blue"
        />
        <MetricCard 
          label="Conversion Rate" 
          value={`${conversionRate.toFixed(1)}%`} 
          change={`${bookedLeads.length} won`} 
          trend={conversionRate > 0 ? "up" : "neutral"} 
          icon={<TrendingUp size={16} />} 
          color="green"
        />
        <MetricCard 
          label="Active Leads" 
          value={String(activeLeads.length)} 
          change="Real-time" 
          trend="neutral" 
          icon={<Users size={16} />} 
          color="orange"
        />
        <MetricCard 
          label="Upcoming Events" 
          value={String(upcomingEvents.length)} 
          change="Tour dates" 
          trend="up" 
          icon={<Calendar size={16} />} 
          color="purple"
        />
      </div>

      {/* Main Dashboard Layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
        {/* Recent Lead Pipeline */}
        <PortalTableCard
          className="lg:col-span-2"
          controls={
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity size={18} className="text-blue-500" />
              <h3 className="font-semibold text-white/90">Leads Pipeline Activity</h3>
            </div>
            <Link href="/portal/leads" className="text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors uppercase tracking-widest flex items-center gap-1">
              View All <ChevronRight size={14} />
            </Link>
          </div>
          }
        >
          <PortalStickyTable minWidth="820px">
            <PortalStickyThead>
              <tr className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest border-b border-zinc-900/50">
                <th className="px-6 py-4">Lead Source</th>
                <th className="px-6 py-4">Contact</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Parameters</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </PortalStickyThead>
            <tbody className="divide-y divide-zinc-900/30">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                    NO ACTIVE INQUIRIES REGISTERED
                  </td>
                </tr>
              ) : (
                leads.slice(0, 5).map((lead) => (
                  <tr key={lead.id} className="hover:bg-zinc-900/40 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 group-hover:bg-zinc-800 group-hover:text-blue-500 transition-colors">
                          {lead.source[0]?.toUpperCase() || 'W'}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white leading-none mb-1 uppercase tracking-widest">{lead.source.replaceAll('_', ' ')}</p>
                          <p className="text-[10px] text-zinc-500 font-medium">Inquiry intake</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div>
                        <p className="text-sm font-semibold text-white/90 leading-none mb-1 group-hover:translate-x-1 transition-transform">{lead.full_name}</p>
                        <p className="text-[10px] text-zinc-500 font-medium">{lead.email || lead.phone || 'No contact details'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <PortalStatusBadge status={lead.status} />
                    </td>
                    <td className="px-6 py-5 text-zinc-400 font-mono text-xs">
                      <span className="text-zinc-300 font-bold block">{lead.event_type || 'Wedding'}</span>
                      <span className="text-zinc-500 text-[10px] mt-0.5">{lead.guest_count ? `${lead.guest_count} guests` : 'No count'}</span>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Link href={`/portal/leads/${lead.id}`} className="inline-flex p-2 transition-colors hover:bg-zinc-800 rounded-md text-zinc-600 hover:text-zinc-300">
                        <ExternalLink size={14} />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </PortalStickyTable>
        </PortalTableCard>

        {/* Action Center & Recent Notes */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="luxor-glass-card hover:translate-y-0 rounded-2xl p-6 luxor-glow-gold shadow-2xl">
            <h3 className="font-semibold text-white/90 mb-6 flex items-center gap-3">
              <TrendingUp size={18} className="text-[#caa24c]" />
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/portal/marketing" className="flex flex-col items-center justify-center gap-3 p-4 border border-zinc-900 rounded-xl bg-zinc-950/80 hover:bg-zinc-900 hover:border-zinc-800 hover:scale-[1.03] transition-all shadow-lg group">
                <div className="p-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-[#caa24c] transition-colors shadow-inner">
                  <Mail size={16} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">Marketing</p>
              </Link>
              <Link href="/portal/invoices" className="flex flex-col items-center justify-center gap-3 p-4 border border-zinc-900 rounded-xl bg-zinc-950/80 hover:bg-zinc-900 hover:border-zinc-800 hover:scale-[1.03] transition-all shadow-lg group">
                <div className="p-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-[#caa24c] transition-colors shadow-inner">
                  <DollarSign size={16} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">Invoices</p>
              </Link>
              <Link href="/portal/leads" className="flex flex-col items-center justify-center gap-3 p-4 border border-zinc-900 rounded-xl bg-zinc-950/80 hover:bg-zinc-900 hover:border-zinc-800 hover:scale-[1.03] transition-all shadow-lg group">
                <div className="p-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-[#caa24c] transition-colors shadow-inner">
                  <Users size={16} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">Add Lead</p>
              </Link>
              <Link href="/portal/calendar" className="flex flex-col items-center justify-center gap-3 p-4 border border-zinc-900 rounded-xl bg-zinc-950/80 hover:bg-zinc-900 hover:border-zinc-800 hover:scale-[1.03] transition-all shadow-lg group">
                <div className="p-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-[#caa24c] transition-colors shadow-inner">
                  <Calendar size={16} />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">Tours Calendar</p>
              </Link>
            </div>
          </div>

          {/* Activity feed / telemetry hybrid */}
          <div className="luxor-glass-card hover:translate-y-0 rounded-2xl p-6 luxor-glow-gold shadow-2xl overflow-hidden relative">
            <h3 className="font-semibold text-white/90 mb-5 flex items-center gap-3">
              <Activity size={18} className="text-[#caa24c]" />
              Recent Workspace Updates
            </h3>
            <div className="space-y-4 relative z-10">
              {recentNotes.length === 0 ? (
                <p className="text-xs text-zinc-500 italic">No notes or status log events recorded recently.</p>
              ) : (
                recentNotes.map((note) => (
                  <div key={note.id} className="border-b border-zinc-900/60 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                      <span>{note.author}</span>
                      <span>{new Date(note.created_at).toLocaleDateString()}</span>
                    </div>
                    <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">{note.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </PortalPageFrame>
  );
}

function MetricCard({ label, value, change, trend, icon, color }: { 
  label: string; 
  value: string; 
  change: string; 
  trend: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'orange' | 'purple';
}) {
  const colorMap = {
    blue: 'text-blue-400 bg-blue-500/5 border-blue-500/10 shadow-blue-500/5',
    green: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10 shadow-emerald-500/5',
    orange: 'text-amber-500 bg-amber-500/5 border-amber-500/10 shadow-amber-500/5',
    purple: 'text-purple-400 bg-purple-500/5 border-purple-500/10 shadow-purple-500/5'
  };

  const glowMap = {
    blue: 'luxor-glow-blue',
    green: 'luxor-glow-green',
    orange: 'luxor-glow-gold',
    purple: 'luxor-glow-gold'
  };

  return (
    <div className={`luxor-glass-card rounded-2xl p-6 ${glowMap[color]} overflow-hidden group`}>
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className={`p-2.5 rounded-xl border flex items-center justify-center shadow-inner ${colorMap[color]}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${
          trend === 'up' ? 'text-emerald-400 bg-emerald-400/5 border-emerald-400/10' : 
          trend === 'down' ? 'text-rose-400 bg-rose-400/5 border-rose-400/10' : 
          'text-zinc-500 bg-zinc-500/5 border-zinc-500/10'
        }`}>
          {trend === 'up' && <ArrowUpRight size={10} />}
          {trend === 'down' && <ArrowDownRight size={10} />}
          {change}
        </div>
      </div>
      <div className="relative z-10">
        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1.5">{label}</p>
        <h4 className="text-2xl font-bold text-white font-mono tracking-tight group-hover:translate-x-1 transition-transform duration-300">
          {value}
        </h4>
      </div>
    </div>
  );
}
