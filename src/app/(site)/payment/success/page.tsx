import Link from 'next/link'

export default function PaymentSuccessPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl items-center px-6 py-20 text-center">
      <div className="w-full rounded-3xl border border-white/10 bg-white/[0.03] p-8 sm:p-12">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#caa24c]">Payment received</p>
        <h1 className="mt-4 text-3xl font-semibold text-white">Thank you for choosing Luxor.</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-400">Your payment was submitted securely. Our team will confirm the next event-planning step with you.</p>
        <Link href="/" className="mt-8 inline-flex rounded-full bg-[#b98a3e] px-6 py-3 text-xs font-black uppercase tracking-widest text-white">Return home</Link>
      </div>
    </main>
  )
}
