import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Website Terms | Luxor Event Space',
  description: 'Terms governing use of the Luxor Event Space website.',
}

const sections = [
  ['Website information', 'This website provides general information about Luxor Event Space, event types, packages, tours, and planning options. Content may be updated as the venue, packages, availability, and services evolve.'],
  ['Quotes and availability', 'Submitting an inquiry, requesting a tour, or discussing a package does not reserve a date or create a booking. Dates, pricing, services, and package details are not final until confirmed in writing by Luxor Event Space.'],
  ['Event agreements', 'Every confirmed event is governed by its signed event agreement and related written documents. If these website terms conflict with a signed event agreement, the signed event agreement controls for that booking.'],
  ['Payments and cancellations', 'Deposits, payment schedules, cancellations, refunds, damages, and other event-specific obligations are stated in the applicable proposal, invoice, and signed event agreement.'],
  ['Acceptable use', 'You may use this website to learn about the venue and submit legitimate inquiries. You may not attempt to disrupt the website, access protected systems, submit fraudulent requests, or misuse website content.'],
  ['Third-party services', 'Links to maps, payment services, email services, or other third-party tools are provided for convenience. Those services operate under their own terms and privacy practices.'],
  ['Limitation', 'To the extent permitted by law, Luxor Event Space is not responsible for indirect losses arising solely from use of this informational website or from reliance on information that has not been confirmed in a signed agreement.'],
]

export default function TermsPage() {
  return (
    <main className="bg-[#050505] px-5 pb-24 pt-36 text-[#f7efe3] sm:px-6 lg:px-8 lg:pt-44">
      <div className="mx-auto max-w-4xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Website policy</p>
        <h1 className="mt-4 font-serif text-5xl leading-[0.92] sm:text-6xl">Website Terms</h1>
        <p className="mt-5 text-sm text-[#d7c29a]/60">Effective July 10, 2026</p>
        <p className="mt-8 max-w-3xl text-base leading-7 text-[#d7c29a]/76">
          These terms govern use of the Luxor Event Space website. They do not replace the signed agreement for a booked event.
        </p>

        <div className="mt-12 divide-y divide-[#caa24c]/18 border-y border-[#caa24c]/18">
          {sections.map(([title, copy]) => (
            <section key={title} className="py-7">
              <h2 className="font-serif text-3xl text-[#f7efe3]">{title}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-[#d7c29a]/72 sm:text-base">{copy}</p>
            </section>
          ))}
        </div>

        <section className="mt-10 rounded-md border border-[#caa24c]/22 bg-[#0a0807] p-6 sm:p-8">
          <h2 className="font-serif text-3xl">Questions</h2>
          <p className="mt-3 text-sm leading-7 text-[#d7c29a]/72 sm:text-base">
            Contact <a className="text-[#f1d27a] underline underline-offset-4" href="mailto:booking@luxoratlaspalmas.com">booking@luxoratlaspalmas.com</a> with questions about these terms or an event agreement.
          </p>
          <Link href="/" className="mt-6 inline-flex text-sm font-bold uppercase tracking-[0.14em] text-[#f1d27a]">Return home</Link>
        </section>
      </div>
    </main>
  )
}
