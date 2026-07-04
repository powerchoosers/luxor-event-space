import React from "react";
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  ChevronDown, 
  MoreHorizontal,
  Mail,
  Phone,
  Calendar,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { listLuxorInquiries } from "@/lib/luxorInquiriesServer";
import { LuxorInquiry } from "@/lib/luxorInquiryTypes";
import { PortalPageFrame, PortalPageHeader, PortalStickyTable, PortalStickyThead, PortalTableCard } from "@/components/portal/PortalUI";

export default async function LeadsPage() {
  let leads: LuxorInquiry[] = [];
  let loadError: string | null = null;

  try {
    leads = await listLuxorInquiries(75);
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load Luxor inquiries.";
  }

  const tourRequests = leads.filter((lead) => lead.status === "tour_requested").length;
  const newLeads = leads.filter((lead) => lead.status === "new").length;
  const missingContact = leads.filter((lead) => !lead.email && !lead.phone).length;

  return (
    <PortalPageFrame className="h-full min-h-0 overflow-hidden">
      <PortalPageHeader
        icon={<Users size={18} />}
        title="Leads & Clients"
        description="Monitor and manage the intake pipeline of event space prospects."
        actions={
          <>
          <button className="flex items-center gap-2 bg-zinc-900/50 border border-zinc-800 px-4 py-2.5 rounded-lg text-sm font-semibold text-zinc-300 hover:bg-zinc-800 transition-all">
            <Filter size={16} /> Filters
          </button>
          <button className="flex items-center gap-2 bg-blue-600 px-4 py-2.5 rounded-lg text-sm font-bold text-white hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-600/20">
            <Plus size={16} /> New Lead
          </button>
          </>
        }
      />

      <div className="grid shrink-0 grid-cols-1 gap-4 md:grid-cols-3">
        <LeadMetric label="Live inquiries" value={String(leads.length)} detail="Captured from forms and chat" />
        <LeadMetric label="Tour requests" value={String(tourRequests)} detail="Need availability confirmation" tone="gold" />
        <LeadMetric label="New leads" value={String(newLeads)} detail={missingContact ? `${missingContact} missing contact method` : "Ready for follow-up"} tone="green" />
      </div>

      <PortalTableCard
        controls={
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="relative w-full md:w-96">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input 
              type="text" 
              placeholder="Search leads by name, email, or company..." 
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all font-medium placeholder:text-zinc-700"
            />
          </div>
          <div className="flex items-center gap-4 text-xs font-bold text-zinc-500 uppercase tracking-widest">
            <span className="text-zinc-600">Sort by:</span>
            <button className="flex items-center gap-1 text-zinc-300 hover:text-white transition-colors">
              Recently Active <ChevronDown size={14} />
            </button>
          </div>
        </div>
        }
        footer={
          <div className="flex items-center justify-between text-[10px] uppercase font-bold text-zinc-600 tracking-widest">
            <p>Showing <span className="text-zinc-400">{leads.length}</span> live Luxor inquiries</p>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 border border-zinc-800 rounded hover:bg-zinc-900 disabled:opacity-30">Prev</button>
              <button className="px-3 py-1.5 border border-zinc-800 rounded hover:bg-zinc-900">Next</button>
            </div>
          </div>
        }
      >
          <PortalStickyTable minWidth="1060px">
            <PortalStickyThead>
              <tr className="text-[10px] uppercase font-bold text-zinc-600 tracking-[0.15em]">
                <th className="px-8 py-5">Full Name & ID</th>
                <th className="px-6 py-5">Status</th>
                <th className="px-6 py-5">Contract Value</th>
                <th className="px-6 py-5">Last Touch</th>
                <th className="px-6 py-5">Channel</th>
                <th className="px-8 py-5 text-right">Engagement</th>
              </tr>
            </PortalStickyThead>
            <tbody className="divide-y divide-zinc-900/30">
              {loadError ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-sm text-red-300">
                    {loadError}
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-12 text-sm text-zinc-500">
                    <div className="max-w-xl">
                      <p className="text-base font-semibold text-zinc-300">No Luxor inquiries yet.</p>
                      <p className="mt-2 leading-6">New public booking requests will appear here as soon as a visitor submits the form or chat tour request.</p>
                      <Link href="/tour" className="mt-5 inline-flex items-center gap-2 rounded-lg border border-[#caa24c]/24 bg-[#caa24c]/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#f1d27a] transition-colors hover:bg-[#caa24c]/16">
                        Check tour funnel <ExternalLink size={12} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-zinc-900/40 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-950 border border-zinc-700/50 flex items-center justify-center text-zinc-400 font-bold group-hover:from-blue-600 group-hover:to-indigo-600 group-hover:text-white group-hover:border-blue-500/50 transition-all duration-300">
                          {getInitials(lead.full_name)}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-black" title="New inquiry" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white/90 leading-tight mb-1 group-hover:translate-x-0.5 transition-transform">{lead.full_name}</p>
                        <p className="text-[11px] text-zinc-500 font-medium group-hover:text-zinc-400">{lead.email ?? lead.phone ?? `ID: ${lead.id.slice(0, 8)}`}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6 font-mono">
                    <StatusBadge status={formatStatus(lead.status)} />
                  </td>
                  <td className="px-6 py-6 font-mono text-sm group-hover:text-blue-400 transition-colors">
                    {lead.guest_count ? `${lead.guest_count} guests` : "Count needed"}
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex items-start flex-col">
                      <span className="text-xs text-zinc-400 font-medium">{formatDate(lead.created_at)}</span>
                      <span className="text-[10px] text-zinc-600 font-medium uppercase tracking-tighter">{lead.preferred_tour_date ? `Tour ${lead.preferred_tour_date}` : lead.target_date ?? "Date needed"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{lead.source.replaceAll("_", " ")}</span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-4 group-hover:translate-x-0">
                      <ActionButton icon={<Mail size={14} />} tooltip="Send Email" />
                      <ActionButton icon={<Phone size={14} />} tooltip="Call Lead" />
                      <ActionButton icon={<Calendar size={14} />} tooltip="Schedule Tour" />
                      <ActionButton icon={<MoreHorizontal size={14} />} tooltip="More" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </PortalStickyTable>
      </PortalTableCard>
    </PortalPageFrame>
  );
}

function LeadMetric({
  label,
  value,
  detail,
  tone = "blue",
}: {
  label: string
  value: string
  detail: string
  tone?: "blue" | "gold" | "green"
}) {
  const tones = {
    blue: "text-blue-400 border-blue-500/15 bg-blue-500/5",
    gold: "text-[#f1d27a] border-[#caa24c]/18 bg-[#caa24c]/8",
    green: "text-emerald-400 border-emerald-500/15 bg-emerald-500/5",
  };

  return (
    <div className="rounded-2xl border border-[#caa24c]/10 bg-black/36 p-5 shadow-xl shadow-black/20">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-4">
        <p className="font-mono text-3xl font-bold text-white">{value}</p>
        <span className={`rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] ${tones[tone]}`}>Live</span>
      </div>
      <p className="mt-2 text-xs font-medium text-zinc-500">{detail}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    "New": "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    "Tour Requested": "bg-purple-500/10 text-purple-500 border border-purple-500/20",
    "Contacted": "bg-amber-500/10 text-amber-500 border border-amber-500/20",
    "Tour Confirmed": "bg-orange-500/10 text-orange-500 border border-orange-500/20",
    "Booked": "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
    "Closed Lost": "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20",
  };

  return (
    <span className={`px-2.5 py-1 rounded-sm text-[9px] font-bold uppercase tracking-[0.1em] ${styles[status] ?? styles.New}`}>
      {status}
    </span>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function ActionButton({ icon, tooltip }: { icon: React.ReactNode; tooltip: string }) {
  return (
    <button className="p-2 rounded-md bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 transition-all hover:bg-zinc-800" title={tooltip}>
      {icon}
    </button>
  );
}
