import React from "react";
import { 
  PhoneCall, 
  Send, 
  Search, 
  History, 
  Phone, 
  Mail, 
  Clock, 
  User, 
  Mic, 
  Volume2, 
  Video,
  X,
  Plus,
  Play,
  RotateCcw
} from "lucide-react";

export default function CommunicationsPage() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-12rem)] min-h-[600px]">
      
      {/* Sidebar: Active Contacts & History */}
      <div className="lg:col-span-4 flex flex-col gap-6">
        <div className="flex-1 nodal-void-card rounded-2xl border border-zinc-900 bg-black/40 backdrop-blur-xl overflow-hidden flex flex-col shadow-2xl">
          <div className="p-5 border-b border-zinc-900/50 flex flex-col gap-4">
            <h3 className="font-semibold text-white/90 flex items-center gap-2">
              <History size={16} className="text-zinc-500" /> 
              Comms Queue
            </h3>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input 
                type="text" 
                placeholder="Search history..." 
                className="w-full bg-zinc-950 border border-zinc-900 rounded-lg pl-9 pr-4 py-2 text-xs text-zinc-300 font-medium placeholder:text-zinc-700"
              />
            </div>
            <div className="flex gap-2">
              <button className="flex-1 py-1.5 rounded bg-zinc-900 text-[10px] uppercase font-bold text-zinc-400 border border-zinc-800 hover:text-white transition-colors">Call Logs</button>
              <button className="flex-1 py-1.5 rounded bg-blue-500/10 text-[10px] uppercase font-bold text-blue-500 border border-blue-500/20">Email Threads</button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/30">
            <ContactItem name="Alexandra Chen" time="2m ago" type="email" preview="Re: Booking Inquiry for 2026..." active />
            <ContactItem name="Robert Fox" time="4h ago" type="call" preview="Failed Call (Missed)" />
            <ContactItem name="David Miller" time="Yesterday" type="email" preview="Invoice INV-9842 Sent" />
            <ContactItem name="Elena Petrova" time="2 days ago" type="call" preview="Duration: 12m 45s" />
            <ContactItem name="Sarah J. Williams" time="3 days ago" type="email" preview="Tour Confirmation Details" />
          </div>
        </div>
      </div>

      {/* Main Terminal: Call/Email Interface */}
      <div className="lg:col-span-8 flex flex-col gap-8">
        {/* Terminal Header */}
        <div className="nodal-void-card rounded-2xl border border-zinc-900 bg-black/50 p-1 flex-1 flex flex-col shadow-[0_40px_120px_-40px_rgba(37,99,235,0.25)]">
          <div className="bg-[#0c0c0c] rounded-t-xl py-3 px-6 border-b border-zinc-900 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-600/30 flex items-center justify-center text-blue-500 font-bold text-xs uppercase">AC</div>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-widest leading-none">Alexandra Chen</p>
                <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-tighter mt-1 animate-pulse">Connection: Secure (Low Latency)</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="p-2 rounded-md hover:bg-zinc-900 text-zinc-400 transition-colors"><X size={16} /></button>
            </div>
          </div>

          <div className="flex-1 p-8 overflow-y-auto bg-gradient-to-b from-transparent to-black/20">
             {/* Mode Selector */}
             <div className="flex justify-center mb-8">
               <div className="bg-zinc-900 p-1 rounded-xl border border-zinc-800 flex gap-2">
                 <button className="px-6 py-2 rounded-lg bg-black text-xs font-bold text-white border border-zinc-800 shadow-xl flex items-center gap-2">
                   <Mail size={14} className="text-blue-500" /> Send Email
                 </button>
                 <button className="px-6 py-2 rounded-lg text-xs font-bold text-zinc-500 hover:text-zinc-300 flex items-center gap-2 transition-all group">
                   <Phone size={14} className="group-hover:text-emerald-500" /> Voice Call
                 </button>
               </div>
             </div>

             {/* Email Interface */}
             <div className="space-y-6 max-w-2xl mx-auto">
               <div className="space-y-2">
                 <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">Subject Line</label>
                 <input 
                  type="text" 
                  defaultValue="Re: Booking Inquiry for 2026 - Luxor Event Space"
                  className="w-full bg-[#0a0a0a] border border-zinc-900 rounded-lg px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-blue-700/50 transition-colors"
                 />
               </div>
               <div className="space-y-2">
                 <label className="text-[10px] uppercase font-bold tracking-widest text-zinc-600">Message Payload</label>
                 <textarea 
                  className="w-full h-48 bg-[#0a0a0a] border border-zinc-900 rounded-lg px-4 py-4 text-sm text-zinc-400 focus:outline-none focus:border-blue-700/50 transition-colors leading-relaxed font-sans"
                  placeholder="Draft your forensic response here..."
                 >
                  Hi Alexandra,

Thanks for reaching out about the Luxor Grand Hall. Following up on our tour earlier this morning, I&apos;ve prepared a custom proposal based on your 200-guest requirement.

I&apos;ve attached the preliminary invoice for your review. Please let me know if you have any questions about the tech rider or the catering options.

Best regards,
Ownership Management
                 </textarea>
               </div>
               
               <div className="flex items-center justify-between border-t border-zinc-900 pt-6">
                 <div className="flex items-center gap-3">
                   <button className="p-2.5 rounded-lg border border-zinc-900 bg-zinc-950 text-zinc-500 hover:text-zinc-300 hover:border-zinc-800 transition-all"><Plus size={18} /></button>
                   <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-tighter">Draft auto-saved 12s ago</p>
                 </div>
                 <button className="bg-blue-600 px-8 py-3 rounded-xl text-xs font-black uppercase tracking-[0.2em] text-white flex items-center gap-3 hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-600/30">
                   Execute Transmission <Send size={16} />
                 </button>
               </div>
             </div>
          </div>
        </div>

        {/* Call Controls (Quick Overlay View) */}
        <div className="nodal-void-card rounded-2xl border border-blue-900/30 bg-blue-950/10 p-6 flex items-center justify-between shadow-2xl relative overflow-hidden group/call">
           <div className="absolute right-0 top-0 h-full w-32 bg-gradient-to-l from-blue-600/5 to-transparent pointer-events-none" />
           <div className="flex items-center gap-5">
             <div className="p-3 bg-emerald-500/20 rounded-full border border-emerald-500/40 relative">
               <Phone size={20} className="text-emerald-500 animate-pulse" />
               <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
               </span>
             </div>
             <div>
               <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Incoming Signal Detected</p>
               <h4 className="text-lg font-bold text-white tracking-tight">Cody Fisher (Prospective Wedding)</h4>
             </div>
           </div>
           
           <div className="flex items-center gap-3">
              <button className="px-6 py-2.5 rounded-lg bg-rose-600/10 text-rose-500 border border-rose-600/20 text-xs font-bold uppercase tracking-widest hover:bg-rose-600/20 transition-all">Decline</button>
              <button className="px-8 py-2.5 rounded-lg bg-emerald-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-emerald-500 hover:scale-105 transition-all shadow-lg shadow-emerald-600/20">Accept Call</button>
           </div>
        </div>
      </div>

    </div>
  );
}

function ContactItem({ name, time, type, preview, active = false }: { 
  name: string; 
  time: string; 
  type: 'call' | 'email'; 
  preview: string;
  active?: boolean;
}) {
  return (
    <div className={`p-5 flex flex-col gap-2 hover:bg-zinc-900/40 transition-all cursor-pointer group ${active ? 'bg-zinc-900/60 border-l-2 border-blue-500' : ''}`}>
      <div className="flex items-center justify-between">
        <h4 className={`text-xs font-bold uppercase tracking-widest ${active ? 'text-white' : 'text-zinc-300'} group-hover:text-blue-400 transition-colors`}>{name}</h4>
        <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-tighter">{time}</span>
      </div>
      <div className="flex items-center gap-2">
        {type === 'email' ? <Mail size={12} className="text-zinc-600" /> : <Phone size={12} className="text-zinc-600" />}
        <p className="text-[11px] text-zinc-500 group-hover:text-zinc-400 line-clamp-1 italic">{preview}</p>
      </div>
    </div>
  );
}
