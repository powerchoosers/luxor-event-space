import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | Luxor Event Space',
  description: 'How Luxor Event Space handles information submitted through its website.',
}

const sections = [
  ['Information we collect', 'When you request a tour, RSVP, ask a question, or begin planning an event, we may collect your name, email address, phone number, event type, preferred dates, guest-count estimate, package interest, and any notes you choose to provide.'],
  ['How we use it', 'We use submitted information to respond to your request, discuss availability, plan tours, prepare event proposals, manage bookings, send requested updates, and maintain customer-service records.'],
  ['Service providers', 'We may use service providers for website hosting, customer relationship management, email and text delivery, scheduling, payment processing, and other business operations. They receive only the information needed to provide those services.'],
  ['Mobile information and sharing', 'We do not sell, rent, or share mobile phone numbers, text-message opt-in data, or SMS consent with third parties or affiliates for marketing or promotional purposes. Mobile information may be disclosed only to service providers that help Luxor Event Space deliver requested messages and operate the service, or when required by law.'],
  ['Text messages', 'When you provide a mobile number and check the text-message consent box, Luxor Event Space may send customer-care messages about your inquiry, tour, booking, payment, or event. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent to text messages is not a condition of purchase.'],
  ['Marketing messages', 'We send promotional email only when permitted. Marketing messages include an unsubscribe option. Customer-care messages about a request, tour, proposal, contract, payment, or booked event may still be sent when necessary and when permitted by the communication preference you provided.'],
  ['Retention and security', 'We retain information for as long as reasonably needed to respond to inquiries, manage events, meet business or legal obligations, and resolve disputes. No online system is completely secure, but we use reasonable safeguards appropriate to the information we handle.'],
  ['Your choices', 'You may ask to review, correct, or delete information you submitted, subject to records we must retain for legal, accounting, security, or contractual reasons.'],
]

export default function PrivacyPage() {
  return (
    <main className="bg-[#050505] px-5 pb-24 pt-36 text-[#f7efe3] sm:px-6 lg:px-8 lg:pt-44">
      <div className="mx-auto max-w-4xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-[#caa24c]">Website policy</p>
        <h1 className="mt-4 font-serif text-5xl leading-[0.92] sm:text-6xl">Privacy Policy</h1>
        <p className="mt-5 text-sm text-[#d7c29a]/60">Effective July 23, 2026</p>
        <p className="mt-8 max-w-3xl text-base leading-7 text-[#d7c29a]/76">
          This policy explains how Luxor Event Space handles information collected through this website and related customer communications.
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
          <h2 className="font-serif text-3xl">Questions or requests</h2>
          <p className="mt-3 text-sm leading-7 text-[#d7c29a]/72 sm:text-base">
            Contact <a className="text-[#f1d27a] underline underline-offset-4" href="mailto:booking@luxoratlaspalmas.com">booking@luxoratlaspalmas.com</a> about your information or this policy.
          </p>
          <Link href="/" className="mt-6 inline-flex text-sm font-bold uppercase tracking-[0.14em] text-[#f1d27a]">Return home</Link>
        </section>
      </div>
    </main>
  )
}
