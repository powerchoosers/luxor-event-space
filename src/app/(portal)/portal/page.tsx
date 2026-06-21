import React from "react";
import { 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  Users, 
  Calendar, 
  Euro,
  Mail,
  MoreVertical,
  Activity,
  ChevronRight
} from "lucide-react";

export default function PortalOverview() {
  return (
    <div className="space-y-10 group/portal">
      {/* Page Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-white/90">Portfolio Overview</h1>
        <p className="text-zinc-500 font-medium text-sm">Real-time command and control for Luxor Event Space operations.</p>
      </div>

      {/* Metric Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          label="Total Revenue" 
          value="$128,430.00" 
          change="+12.5%" 
          trend="up" 
          icon={<Euro size={16} />} 
          color="blue"
        />
        <MetricCard 
          label="Conversion Rate" 
          value="18.2%" 
          change="+2.1%" 
          trend="up" 
          icon={<TrendingUp size={16} />} 
          color="green"
        />
        <MetricCard 
          label="Active Leads" 
          value="48" 
          change="-3.5%" 
          trend="down" 
          icon={<Users size={16} />} 
          color="orange"
        />
        <MetricCard 
          label="Upcoming Events" 
          value="12" 
          change="+0" 
          trend="neutral" 
          icon={<Calendar size={16} />} 
          color="purple"
        />
      </div>

      {/* Main Dashboard Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Lead Pipeline */}
        <div className="lg:col-span-2 nodal-void-card rounded-2xl border border-zinc-900 bg-black/40 backdrop-blur-xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-zinc-900/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity size={18} className="text-blue-500" />
              <h3 className="font-semibold text-white/90">Leads Pipeline Activity</h3>
            </div>
            <button className="text-xs font-semibold text-blue-500 hover:text-blue-400 transition-colors uppercase tracking-widest flex items-center gap-1">
              View All <ChevronRight size={14} />
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase font-bold text-zinc-600 tracking-widest border-b border-zinc-900/50">
                  <th className="px-6 py-4">Lead Source</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Est. Value</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/30">
                <LeadRow 
                  source="Web Form" 
                  name="Marcus Thorne" 
                  email="marcus@example.com"
                  status="Qualified" 
                  value="$8,500.00" 
                  statusColor="bg-blue-500/10 text-blue-400 border border-blue-500/20"
                />
                <LeadRow 
                  source="Instagram Ads" 
                  name="Sarah J. Williams" 
                  email="sarah.w@example.com"
                  status="Negotiation" 
                  value="$12,200.00" 
                  statusColor="bg-purple-500/10 text-purple-400 border border-purple-500/20"
                />
                <LeadRow 
                  source="Referral" 
                  name="David Miller" 
                  email="d.miller@example.com"
                  status="Proposing" 
                  value="$5,400.00" 
                  statusColor="bg-amber-500/10 text-amber-400 border border-amber-500/20"
                />
                <LeadRow 
                  source="Direct Mail" 
                  name="Elena Petrova" 
                  email="elena_p@example.com"
                  status="Closed Lead" 
                  value="$15,000.00" 
                  statusColor="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                />
              </tbody>
            </table>
          </div>
        </div>

        {/* Action Center */}
        <div className="space-y-8">
          {/* Quick Actions */}
          <div className="nodal-void-card rounded-2xl border border-zinc-900 p-6 bg-black/40 backdrop-blur-xl shadow-2xl">
            <h3 className="font-semibold text-white/90 mb-6 flex items-center gap-3">
              <TrendingUp size={18} className="text-zinc-400" />
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <QuickActionButton icon={<Mail size={16} />} label="Send Campaign" />
              <QuickActionButton icon={<Euro size={16} />} label="Draft Invoice" />
              <QuickActionButton icon={<Users size={16} />} label="Add Contact" />
              <QuickActionButton icon={<Calendar size={16} />} label="Record Tour" />
            </div>
          </div>

          {/* System Performance Status */}
          <div className="nodal-void-card rounded-2xl border border-zinc-900 p-6 bg-black/40 backdrop-blur-xl shadow-2xl overflow-hidden relative">
            {/* Background Glow */}
            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-blue-600/5 blur-[120px] rounded-full pointer-events-none" />
            
            <h3 className="font-semibold text-white/90 mb-6 flex items-center gap-3">
              <Activity size={18} className="text-zinc-400" />
              System Telemetry
            </h3>
            <div className="space-y-4 relative z-10">
              <StatProgressBar label="CRM Fulfillment Rate" value={98.2} />
              <StatProgressBar label="Server Response (API)" value={14} unit="ms" />
              <StatProgressBar label="Mail Delivery Score" value={99.9} />
            </div>
          </div>
        </div>
      </div>
    </div>
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
    blue: 'text-blue-500 bg-blue-500/10 border-blue-500/20 shadow-blue-500/10',
    green: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/10',
    orange: 'text-amber-500 bg-amber-500/10 border-amber-500/20 shadow-amber-500/10',
    purple: 'text-purple-500 bg-purple-500/10 border-purple-500/20 shadow-purple-500/10'
  };

  return (
    <div className="nodal-void-card rounded-2xl p-6 border border-zinc-900 bg-black/40 backdrop-blur-xl transition-all hover:translate-y-[-4px] hover:border-zinc-800 group shadow-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2.5 rounded-lg border flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.5)] ${colorMap[color]}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-sm border ${
          trend === 'up' ? 'text-emerald-400 bg-emerald-400/5 border-emerald-400/10' : 
          trend === 'down' ? 'text-rose-400 bg-rose-400/5 border-rose-400/10' : 
          'text-zinc-500 bg-zinc-500/5 border-zinc-500/10'
        }`}>
          {trend === 'up' && <ArrowUpRight size={10} />}
          {trend === 'down' && <ArrowDownRight size={10} />}
          {change}
        </div>
      </div>
      <div>
        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">{label}</p>
        <h4 className="text-2xl font-bold text-white font-mono tracking-tight group-hover:scale-105 transition-transform origin-left duration-300">
          {value}
        </h4>
      </div>
    </div>
  );
}

function LeadRow({ source, name, email, status, value, statusColor }: { 
  source: string; 
  name: string; 
  email: string;
  status: string; 
  value: string; 
  statusColor: string;
}) {
  return (
    <tr className="hover:bg-zinc-900/40 transition-colors group">
      <td className="px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500 group-hover:bg-zinc-800 group-hover:text-blue-500 transition-colors">
            {source[0]}
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-none mb-1 uppercase tracking-widest">{source}</p>
            <p className="text-[10px] text-zinc-500 font-medium">Auto-Ingest v2.1</p>
          </div>
        </div>
      </td>
      <td className="px-6 py-5">
        <div>
          <p className="text-sm font-semibold text-white/90 leading-none mb-1 group-hover:translate-x-1 transition-transform">{name}</p>
          <p className="text-[10px] text-zinc-500 font-medium">{email}</p>
        </div>
      </td>
      <td className="px-6 py-5">
        <span className={`text-[9px] uppercase font-bold tracking-[0.1em] px-2.5 py-1 rounded-sm ${statusColor}`}>
          {status}
        </span>
      </td>
      <td className="px-6 py-5 text-zinc-400 font-mono text-sm group-hover:text-white transition-colors">
        {value}
      </td>
      <td className="px-6 py-5 text-right">
        <button className="p-2 transition-colors hover:bg-zinc-800 rounded-md">
          <MoreVertical size={16} className="text-zinc-600 hover:text-zinc-300" />
        </button>
      </td>
    </tr>
  );
}

function QuickActionButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex flex-col items-center justify-center gap-3 p-4 border border-zinc-900 rounded-xl bg-zinc-950 hover:bg-zinc-900 hover:border-zinc-800 hover:scale-105 transition-all shadow-lg group">
      <div className="p-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 group-hover:text-blue-500 transition-colors shadow-inner">
        {icon}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300 transition-colors">{label}</p>
    </button>
  );
}

function StatProgressBar({ label, value, unit = "%" }: { label: string; value: number; unit?: string }) {
  return (
    <div className="space-y-1.5 group/bar">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
        <span className="text-zinc-500 group-hover/bar:text-zinc-300 transition-colors">{label}</span>
        <span className="text-zinc-400 font-mono">
          {value}{unit}
        </span>
      </div>
      <div className="h-1 w-full bg-zinc-900 rounded-full overflow-hidden">
        <div 
          className="h-full bg-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.4)] transition-all duration-1000 ease-out group-hover/bar:bg-blue-500" 
          style={{ width: `${value > 100 ? 100 : value}%` }}
        />
      </div>
    </div>
  );
}
