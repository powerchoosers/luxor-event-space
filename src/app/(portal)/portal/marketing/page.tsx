import React from "react";
import { 
  BarChart3, 
  Mail, 
  Users, 
  Send, 
  Calendar, 
  Plus, 
  Search, 
  Zap, 
  TrendingUp, 
  MousePointer2, 
  MessageSquare,
  Sparkles
} from "lucide-react";

export default function MarketingPage() {
  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-blue-500">
             <div className="p-2 bg-blue-600/10 rounded-xl border border-blue-600/20 shadow-[0_0_20px_rgba(37,99,235,0.2)]">
               <Mail size={18} />
             </div>
             <h1 className="text-3xl font-bold tracking-tight text-white/90">Marketing Command</h1>
          </div>
          <p className="text-zinc-500 font-medium text-sm">Orchestrate automated outreach and analyze audience engagement across campaigns.</p>
        </div>
        
        <div className="flex items-center gap-4">
           <button className="flex items-center gap-2 bg-blue-600 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-600/25">
             <Plus size={16} /> New Sequence
           </button>
        </div>
      </div>

      {/* Engagement Pulse */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         <StatsPanel label="Audience Size" value="8,402" trend="+124" />
         <StatsPanel label="Open Rate (Avg)" value="42.8%" trend="+2.1%" />
         <StatsPanel label="Click-Through" value="18.1%" trend="+0.5%" />
         <StatsPanel label="Bespoke Replies" value="12" trend="+3" />
      </div>

      {/* Main Campaign Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: ACTIVE CAMPAIGNS */}
        <div className="lg:col-span-2 space-y-6">
           <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600 mb-2">Operational Sequences</h3>
           
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
              <button className="text-[10px] font-bold uppercase tracking-widest text-blue-500 flex items-center gap-2 hover:translate-x-1 transition-transform">
                Apply Analysis <Zap size={14} />
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}

function StatsPanel({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <div className="nodal-void-card rounded-2xl border border-zinc-900 p-6 bg-black/40 backdrop-blur-xl group hover:border-zinc-800 transition-all shadow-xl">
      <p className="text-[10px] uppercase font-black text-zinc-600 tracking-[0.2em] mb-2">{label}</p>
      <div className="flex items-end justify-between">
        <h3 className="text-2xl font-bold text-white font-mono tracking-tight group-hover:scale-105 transition-transform origin-left">{value}</h3>
        <span className="text-[10px] font-bold text-emerald-500 pb-1">{trend}</span>
      </div>
    </div>
  );
}

function CampaignCard({ title, status, progress, sent, delivered, type, accent = "blue" }: { 
  title: string; 
  status: string; 
  progress: number; 
  sent: number; 
  delivered: string;
  type: string;
  accent?: 'blue' | 'purple' | 'orange';
}) {
  const accentMap = {
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-500',
    purple: 'border-purple-500/20 bg-purple-500/10 text-purple-500',
    orange: 'border-orange-500/20 bg-orange-500/10 text-orange-500'
  };

  return (
    <div className="nodal-void-card rounded-2xl border border-zinc-900 bg-black/40 backdrop-blur-xl p-6 shadow-xl group hover:border-zinc-800 transition-all">
       <div className="flex items-center justify-between mb-6">
         <div className="flex items-center gap-4">
           <div className={`p-2 rounded-lg border flex items-center justify-center ${accentMap[accent]}`}>
             {type === 'Sequence' ? <Send size={16} /> : type === 'Broadcast' ? <Zap size={16} /> : <Sparkles size={16} />}
           </div>
           <div>
             <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">{type}</p>
             <h4 className="text-sm font-bold text-white/90 group-hover:text-blue-400 transition-colors">{title}</h4>
           </div>
         </div>
         <span className={`px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-widest ${
           status === 'Running' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 
           status === 'Scheduled' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 
           'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
         }`}>
           {status}
         </span>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Total Sends</p>
            <p className="text-lg font-bold text-white font-mono">{sent.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Click Accuracy</p>
            <p className="text-lg font-bold text-white font-mono">{delivered}</p>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 font-bold uppercase mb-1">Progress</p>
            <p className="text-lg font-bold text-white font-mono">{progress}%</p>
          </div>
       </div>

       <div className="h-1.5 w-full bg-zinc-900 rounded-full overflow-hidden">
         <div className="h-full bg-blue-600 rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
       </div>
    </div>
  );
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
  );
}
