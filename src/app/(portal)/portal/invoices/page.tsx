import React from "react";
import { 
  FileText, 
  Search, 
  Filter, 
  Download, 
  Printer, 
  MoreVertical, 
  Euro,
  ArrowUpRight,
  TrendingDown,
  Calendar,
  Send,
  Plus
} from "lucide-react";

export default function InvoicesPage() {
  const invoices = [
    { id: "INV-2984", client: "Alexandra Chen", project: "Grand Hall Booking", amount: "$4,500.00", status: "Paid", date: "Apr 2, 2026", due: "Apr 15, 2026" },
    { id: "INV-2985", client: "Robert Fox", project: "Corporate Summit", amount: "$12,200.00", status: "Pending", date: "Apr 4, 2026", due: "Apr 18, 2026" },
    { id: "INV-2986", client: "Fox Capital", project: "VIP Catering", amount: "$2,800.00", status: "Overdue", date: "Mar 28, 2026", due: "Apr 1, 2026" },
    { id: "INV-2987", client: "Jane Cooper", project: "Wedding Social", amount: "$8,000.00", status: "Draft", date: "Apr 5, 2026", due: "Apr 20, 2026" },
    { id: "INV-2842", client: "Cody Fisher", project: "Studio Rentals", amount: "$15,000.00", status: "Paid", date: "Mar 25, 2026", due: "Apr 15, 2026" },
  ];

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-blue-600/10 rounded-lg border border-blue-600/20">
               <FileText size={18} className="text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.3)]" />
             </div>
             <h1 className="text-3xl font-bold tracking-tight text-white/90">Revenue & Invoicing</h1>
          </div>
          <p className="text-zinc-500 font-medium text-sm">Financial command center for tracking Luxor&apos;s event contract performance.</p>
        </div>
        
        <div className="flex items-center gap-4">
           <button className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-5 py-2.5 rounded-xl text-xs font-bold text-zinc-300 hover:bg-zinc-800 transition-all uppercase tracking-wider">
             Financial Audit Report
           </button>
           <button className="flex items-center gap-2 bg-blue-600 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-600/25">
             <Plus size={16} /> Create Invoice
           </button>
        </div>
      </div>

      {/* Financial Health Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <StatsPanel label="Net Revenue (MTD)" value="$42,850.00" trend="+12.5%" />
         <StatsPanel label="Outstanding AR" value="$18,400.00" trend="-4.2%" isNegative />
         <StatsPanel label="Avg Collection Time" value="4.2 Days" trend="-1d" />
      </div>

      {/* Invoices List */}
      <div className="nodal-void-card rounded-2xl border border-zinc-900 bg-black/40 backdrop-blur-xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-zinc-900/50 bg-white/[0.01] flex items-center justify-between">
           <div className="relative w-full md:w-96 group">
             <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 group-hover:text-blue-500 transition-colors" />
             <input 
              type="text" 
              placeholder="Filter by ID, Client, or Amount..." 
              className="w-full bg-[#080808] border border-zinc-900 rounded-lg pl-10 pr-4 py-2.5 text-xs text-zinc-400 focus:outline-none focus:border-blue-700/50 transition-all font-mono"
             />
           </div>
           <div className="flex items-center gap-3">
             <button className="p-2 border border-zinc-900 rounded-lg hover:bg-zinc-900 text-zinc-500 transition-colors"><Download size={16} /></button>
             <button className="p-2 border border-zinc-900 rounded-lg hover:bg-zinc-900 text-zinc-500 transition-colors"><Printer size={16} /></button>
           </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase font-bold text-zinc-600 tracking-[0.2em] border-b border-zinc-900/50 bg-[#0c0c0c]">
                <th className="px-8 py-5">Invoice ID</th>
                <th className="px-6 py-5">Client Portfolio</th>
                <th className="px-6 py-5">Value (USD)</th>
                <th className="px-6 py-5">Issue Date</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-8 py-5 text-right">Fulfillment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/30">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-zinc-900/40 transition-colors group">
                  <td className="px-8 py-6 font-mono text-sm text-zinc-400 group-hover:text-amber-500/80 transition-colors">
                    {inv.id}
                  </td>
                  <td className="px-6 py-6">
                    <div>
                      <p className="text-sm font-semibold text-white/90 leading-none mb-1">{inv.client}</p>
                      <p className="text-[10px] text-zinc-500 font-medium italic">{inv.project}</p>
                    </div>
                  </td>
                  <td className="px-6 py-6 font-mono text-sm text-white/90 font-bold tracking-tight">
                    {inv.amount}
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col">
                      <span className="text-xs text-zinc-400 font-medium">{inv.date}</span>
                      <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-tighter">Due: {inv.due}</span>
                    </div>
                  </td>
                  <td className="px-6 py-6 font-mono">
                    <InvoiceStatus status={inv.status} />
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2">
                       <button className="p-2 bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-600 hover:text-white transition-colors"><Send size={14} /></button>
                       <button className="p-2 bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-600 hover:text-white transition-colors"><MoreVertical size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatsPanel({ label, value, trend, isNegative = false }: { label: string; value: string; trend: string; isNegative?: boolean }) {
  return (
    <div className="nodal-void-card rounded-2xl border border-zinc-900 p-6 bg-black/40 backdrop-blur-xl group hover:border-zinc-800 transition-all shadow-xl">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase font-black text-zinc-600 tracking-[0.2em]">{label}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
          isNegative ? 'bg-rose-500/5 text-rose-500 border-rose-500/10' : 'bg-emerald-500/5 text-emerald-500 border-emerald-500/10'
        }`}>
          {trend}
        </span>
      </div>
      <h3 className="text-2xl font-bold text-white font-mono tracking-tight group-hover:scale-105 transition-transform origin-left">{value}</h3>
    </div>
  );
}

function InvoiceStatus({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "Paid": "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
    "Pending": "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    "Overdue": "bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]",
    "Draft": "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20",
  };

  return (
    <span className={`px-2.5 py-1 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em] ${styles[status]}`}>
      {status}
    </span>
  );
}
