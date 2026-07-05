import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Mail,
  MessageSquare,
  Phone,
  User,
  Users,
} from "lucide-react";
import { getLuxorInquiry } from "@/lib/luxorInquiriesServer";
import { PortalPageFrame, PortalPageHeader } from "@/components/portal/PortalUI";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await getLuxorInquiry(id);

  if (!lead) notFound();

  const emailHref = lead.email ? `mailto:${lead.email}?subject=${encodeURIComponent("Luxor Event Space tour request")}` : undefined;
  const phoneHref = lead.phone ? `tel:${lead.phone}` : undefined;

  return (
    <PortalPageFrame>
      <div className="shrink-0">
        <Link href="/portal/leads" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-white">
          <ArrowLeft size={14} />
          Back to leads
        </Link>
      </div>

      <PortalPageHeader
        icon={<User size={18} />}
        title={lead.full_name}
        description={`${lead.event_type ?? "Event type needed"} inquiry captured from ${lead.source.replaceAll("_", " ")}.`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-3">
            {emailHref ? (
              <Link href={emailHref} className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-all hover:bg-zinc-800">
                <Mail size={16} /> Email
              </Link>
            ) : null}
            {phoneHref ? (
              <Link href={phoneHref} className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm font-semibold text-zinc-300 transition-all hover:bg-zinc-800">
                <Phone size={16} /> Call
              </Link>
            ) : null}
            <Link href="/portal/calendar" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition-all hover:bg-blue-500">
              <Calendar size={16} /> Calendar
            </Link>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-[#caa24c]/10 bg-black/40 p-6 shadow-2xl shadow-black/30">
          <div className="flex items-start justify-between gap-5 border-b border-[#caa24c]/10 pb-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#caa24c]">Client dossier</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">Inquiry details</h2>
            </div>
            <StatusBadge status={formatStatus(lead.status)} />
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <DetailItem label="Email" value={lead.email ?? "Needed"} icon={<Mail size={15} />} />
            <DetailItem label="Phone" value={lead.phone ?? "Needed"} icon={<Phone size={15} />} />
            <DetailItem label="Event type" value={lead.event_type ?? "Needed"} icon={<CheckCircle2 size={15} />} />
            <DetailItem label="Guest count" value={lead.guest_count ? `${lead.guest_count} guests` : "Needed"} icon={<Users size={15} />} />
            <DetailItem label="Target date" value={lead.target_date ?? "Needed"} icon={<Calendar size={15} />} />
            <DetailItem label="Package" value={lead.package_interest ?? "Not specified"} icon={<CheckCircle2 size={15} />} />
          </div>

          <div className="mt-6 rounded-xl border border-zinc-900 bg-zinc-950/50 p-5">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-zinc-600">
              <MessageSquare size={14} />
              Visitor notes
            </div>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              {lead.message ?? "No message was included with this inquiry."}
            </p>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-[#caa24c]/10 bg-black/40 p-6 shadow-2xl shadow-black/30">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#caa24c]">Tour request</p>
            <div className="mt-5 space-y-4">
              <DetailItem label="Preferred date" value={lead.preferred_tour_date ?? "Needs scheduling"} icon={<Calendar size={15} />} />
              <DetailItem label="Preferred time" value={lead.preferred_tour_time ?? "Flexible or needed"} icon={<Clock size={15} />} />
              <DetailItem label="Captured" value={formatDate(lead.created_at)} icon={<Clock size={15} />} />
            </div>
          </section>

          <section className="rounded-2xl border border-[#caa24c]/10 bg-black/40 p-6 shadow-2xl shadow-black/30">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#caa24c]">Client functions</p>
            <div className="mt-5 grid gap-3">
              <ActionLink href={emailHref} icon={<Mail size={16} />} label="Send follow-up email" disabled={!emailHref} />
              <ActionLink href={phoneHref} icon={<Phone size={16} />} label="Call client" disabled={!phoneHref} />
              <ActionLink href="/portal/calendar" icon={<Calendar size={16} />} label="Review tour calendar" />
              <ActionLink href="/portal/communications" icon={<MessageSquare size={16} />} label="Open communications" />
            </div>
          </section>
        </aside>
      </div>
    </PortalPageFrame>
  );
}

function DetailItem({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-900 bg-zinc-950/50 p-4">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">
        <span className="text-zinc-500">{icon}</span>
        {label}
      </div>
      <p className="mt-2 text-sm font-semibold text-zinc-200">{value}</p>
    </div>
  );
}

function ActionLink({
  href,
  icon,
  label,
  disabled = false,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  if (disabled || !href) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-900 bg-zinc-950/40 px-4 py-3 text-sm font-semibold text-zinc-700">
        {icon}
        {label}
      </div>
    );
  }

  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/80 px-4 py-3 text-sm font-semibold text-zinc-300 transition-colors hover:border-blue-500/35 hover:bg-blue-500/10 hover:text-white">
      {icon}
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    New: "bg-blue-500/10 text-blue-500 border border-blue-500/20",
    "Tour Requested": "bg-purple-500/10 text-purple-500 border border-purple-500/20",
    Contacted: "bg-amber-500/10 text-amber-500 border border-amber-500/20",
    "Tour Confirmed": "bg-orange-500/10 text-orange-500 border border-orange-500/20",
    Booked: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
    "Closed Lost": "bg-zinc-500/10 text-zinc-500 border border-zinc-500/20",
  };

  return (
    <span className={`rounded-sm px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] ${styles[status] ?? styles.New}`}>
      {status}
    </span>
  );
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
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
