# Luxor Event Space

These instructions apply to this entire repository.

## Repository

- GitHub: `https://github.com/powerchoosers/luxor-event-space`
- Git remote: `origin`
- Default and deployment branch: `main`
- This is the Luxor Event Space website. Do not commit or push its files to the Nodal Point CRM repository.
- `AGENTS.md` is the highest-priority repo guidance. `README.md` is supporting context for humans and can help Codex, but it is not the authority if it conflicts with code or this file.

## Source Of Truth

- `src/app/(site)/layout.tsx` for public site shell, fonts, and shared site chrome.
- `src/app/(portal)/layout.tsx` for portal protection and redirect behavior.
- `src/lib/luxorPortalAuth.ts` for portal session rules and allowed email addresses.
- `src/lib/zohoMailServer.ts` for Zoho config, sender restrictions, and message delivery.
- `src/lib/luxorEmailJobsServer.ts` for email job queue processing and marketing updates.
- `src/lib/luxorBookingsServer.ts` and `src/lib/luxorInquiryTypes.ts` for booking and inquiry data flow.
- `src/lib/luxorTwilioServer.ts`, `src/lib/luxorPhoneNumbersServer.ts`, and `src/lib/luxorPhoneRoutingServer.ts` for Twilio credentials, the selected public number, call routing, and phone settings.
- `src/lib/luxorCallsServer.ts`, `src/lib/luxorMessagesServer.ts`, and `src/lib/luxorTextAutomationsServer.ts` for communication history, SMS consent, and deduplicated text automations.
- `src/components/Header.tsx` and `src/components/Footer.tsx` for public navigation.
- `src/components/Reveal.tsx` for animation policy on the public site.

## Development

```bash
npm run dev
npm run typecheck
npm run lint
npm run build
```

The site uses Next.js, React, TypeScript, and Tailwind CSS. The local development URL is `http://localhost:3000`.

Do not run `npm run build` after every small change. During normal iteration, prefer targeted checks such as `npm run typecheck`, `npm run lint -- --quiet`, and browser validation for the affected page. Run `npm run build` only before deployment/release, when the user explicitly asks for a build, or when a change is likely to affect production compilation.

## Browser Validation

- Lewis has the bundled Chrome plugin (`[@chrome](plugin://chrome@openai-bundled)`) available. Treat the Chrome skill as available when it is listed in the session, and read it before browser work.
- Use the Chrome plugin first for portal and public-site visual QA, interaction testing, console inspection, screenshots, and flows that benefit from Lewis's existing authenticated Chrome session.
- When Lewis explicitly mentions `@chrome` or the Chrome plugin, that selects Chrome for the task. Do not substitute standalone Playwright, Computer Use, or another browser unless Lewis approves the switch or the Chrome skill's documented recovery path has been exhausted.
- Standalone Playwright remains an acceptable fallback only when the Chrome plugin is not available for the session or when its documented setup/recovery process cannot establish a connection. Record the reason for the fallback in the final QA summary.

## Current Site Conventions

- Public site routes include `/`, `/events`, `/spaces`, `/gallery`, `/pricing`, `/visit`, and `/tour`. Header and footer navigation should point to these real pages, not homepage hash anchors, unless a section jump is intentional.
- Portal routes live under `/portal` and are private owner-workspace routes. Do not place portal login screens inside the public `(site)` route group because that adds the public header, footer, and Elena concierge widget.
- The portal login route is `/portal/login` and should use the dedicated `(auth)` layout. It signs users in through Zoho via `/api/auth/zoho/login` and returns through `/api/auth/callback/zoho`.
- The owner portal is protected by the signed `luxor_portal_session` cookie. Logout uses `/api/auth/logout` and must clear that cookie before redirecting to `/portal/login`.
- Zoho sender access is limited by `LUXOR_ZOHO_LOGIN_EMAIL` and `LUXOR_ZOHO_ALLOWED_SENDERS`. The intended Luxor mailbox is `booking@luxoratlaspalmas.com`, with `hello@luxoratlaspalmas.com` as an allowed alias.
- Zoho mail env var names are allowed in docs, but never write real values into tracked files or chat summaries: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_ACCOUNT_ID`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ACCOUNTS_SERVER`, `ZOHO_BASE_URL`, `LUXOR_PORTAL_SESSION_SECRET`.
- Twilio credentials are server-only. Never expose or commit `LUXOR_TWILIO_ACCOUNT_SID`, `LUXOR_TWILIO_AUTH_TOKEN`, `LUXOR_TWILIO_API_KEY_SID`, or `LUXOR_TWILIO_API_KEY_SECRET`, and never prefix them with `NEXT_PUBLIC_`.
- The selected row in `luxor_phone_numbers` is the source of truth for the public business number and outgoing caller ID. Activating a number must configure its voice, voice fallback, SMS, and SMS fallback webhooks together.
- Voice supports two outgoing modes: the persistent browser softphone and a PSTN bridge that rings the saved physical phone first. Incoming calls may ring the browser and physical phone simultaneously; preserve status callbacks and `luxor_calls` history for both legs.
- Twilio webhook routes must validate `X-Twilio-Signature`. Portal-only Twilio routes must validate `luxor_portal_session`. Do not trust caller IDs, destinations, or webhook form values without normalization and validation.
- Use `https://www.luxoratlaspalmas.com` as the canonical Twilio webhook base. The apex domain redirects to `www`; never configure Twilio with a URL that redirects because it can break the HTTP method or signature headers.
- Automated texts are opt-in features configured in portal Settings and must remain disabled by default. Missed-call and inbound-acknowledgment texts must be deduplicated through `luxor_text_automation_events`, written to `luxor_messages`, and include clear Luxor identification and STOP instructions when appropriate.
- Respect SMS consent. An inbound STOP-family keyword records `opted_out` in `luxor_sms_consents` and blocks manual and automated CRM texts; only a START/UNSTOP event may restore sending. Do not send a second application reply when Twilio has already handled an opt-out keyword.
- Do not place paid calls, send real texts, purchase phone numbers, or activate a public number during testing unless Lewis explicitly authorizes that real-world action.
- Desktop heroes should feel balanced as one composition. Use the centered Luxor axis lockup with centered headline, copy, and CTAs unless the page intentionally uses a split hero with a strong visual on the other side.
- Do not wrap above-the-fold hero content in scroll-triggered `Reveal`; first viewport content must render immediately.
- Use the correct Spanish spelling: `Quinceañera` and `Quinceañeras` with `ñ` everywhere user-facing.
- The gallery page uses a custom filtered grid and lightbox. Do not add a gallery dependency unless it clearly improves the experience beyond the current custom implementation.
- Keep new packages conservative. Prefer existing Next.js, React, Tailwind, Framer Motion, and Lucide patterns unless a package solves a real interaction or accessibility problem.
- Make sure all dropdowns and calendars in the portal use React elements (e.g. PortalSelect and PortalDatePicker from '@/components/portal/PortalUI') instead of native browser elements.
- If README and AGENTS disagree, follow AGENTS and the source files.

## Commit And Push

Only commit or push when the user explicitly requests it.

1. Confirm the current branch and scope with `git status -sb`.
2. Run `npm run typecheck` and `npm run lint -- --quiet`.
3. Stage only the files belonging to the requested change.
4. Commit with a concise message describing the user-facing result.
5. Push the deployment branch with `git push origin main` when the user explicitly requests a direct main-branch push.

Never commit `.env*`, credentials, `node_modules`, `.next`, local Codex state, browser logs, or QA screenshots. The root `.gitignore` covers these files.

## Deployment

The GitHub repository is ready for a standard Vercel Next.js deployment:

- Root directory: repository root
- Build command: `npm run build`
- Output/framework detection: Next.js defaults
- The public website can run without secrets, but portal, Zoho mail, and Twilio features require their server-only env vars in Vercel. Do not expose them with `NEXT_PUBLIC_`.

## Supabase Connection And Authority

- The `Supabase` Codex plugin is connected to the production database used by this Luxor repository.
- Lewis authorizes Codex to use that connected Supabase project autonomously for database work required by requested Luxor features, including inspecting schema, running SQL, applying migrations, managing storage-related database configuration, and verifying results.
- Confirm that the target contains the Luxor tables before making changes. Do not assume that similarly named CRM tables are the intended target.
- Apply checked-in migrations when they are required for the requested feature, then verify the resulting columns, constraints, RLS posture, and relevant advisors.
- This standing authorization does not permit exposing credentials, weakening RLS, deleting production data, resetting branches, or performing unrelated destructive changes without Lewis explicitly requesting that specific action.
