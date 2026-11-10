# Elena voice test

The approved phone test number is **+1 817 663 0380** (`PN3339992846524f8140edc3dca201fbfe`). The public number **+1 956 365 2037** is protected. These changes do not choose a new public or CRM-active number in Supabase.

Preparation on November 10, 2026: the dedicated `Luxor Elena voice test` trunk (`TKa63364a2d6187423aabc1afef1b235d2`) was created with secure media and transfer support, with no numbers attached. The ignored local configuration records that trunk and the approved test number, with phone answering disabled. OpenAI project/webhook configuration and deployment are still required before attaching the number.

The browser sandbox and phone test use GPT-Live (`gpt-live-1`). Browser conversations are practice. Phone tour booking is also a rehearsal: it reads published tour times but does not reserve them, save contacts, or send email or SMS. A caller-requested transfer is a real attempt to ring Arianna's saved physical `ring_to_number`; the caller hears that distinction in the opening. No recording or transcript retention is enabled by this feature. A minimal call-history row retains test status and transfer attempts, without marking recording consent as granted.

## Required server setup

Keep values in ignored local env files and Vercel server-only configuration:

- Existing `OPENAI_API_KEY` and Twilio/Supabase server credentials.
- `OPENAI_PROJECT_ID`: project owning the key and webhook.
- `OPENAI_VOICE_WEBHOOK_SECRET`: signing secret for this specific OpenAI endpoint.
- `LUXOR_ELENA_TEST_NUMBER=+18176630380`.
- `LUXOR_ELENA_TEST_TRUNK_SID`: a dedicated empty Twilio Elastic SIP trunk owned by the Luxor account. Never use the main line's trunk.
- `LUXOR_ELENA_PHONE_TEST_ENABLED=true`: defaults to disabled when absent.
- Optional `LUXOR_ELENA_PHONE_BACKEND_MODEL`: an accessible Responses model; default `gpt-6-luna`.

Create the OpenAI project webhook at `https://www.luxoratlaspalmas.com/api/webhooks/openai-voice`, subscribed only to `live.transport.incoming`. Retain the signing secret securely. Confirm GPT-Live and SIP access for this project. Deploy the code and server configuration before attaching any number. This repository requires Lewis's explicit authorization for commit/push/release; local code alone does not make the number callable.

Run the setup script first without mutation:

```powershell
node --env-file=.env.local scripts/elena-phone-test-setup.cjs
```

It requires a healthy deployed endpoint and an MCP endpoint that rejects unauthenticated calls, checks the selected number in both Twilio and Supabase, and rejects a shared or unexpectedly routed trunk. After reviewing the result, attach the approved number:

```powershell
node --env-file=.env.local scripts/elena-phone-test-setup.cjs --apply
```

The script snapshots routing outside the repository before changes, sets TLS/SRTP secure trunking and PSTN transfer support, creates the OpenAI origination URI, and attaches only the approved number. SMS URLs are checked unchanged. It makes no outbound calls and changes no public-number or CRM-active flags. Its printed snapshot path supports rollback:

```powershell
node --env-file=.env.local scripts/elena-phone-test-setup.cjs --rollback <snapshot-path>
node --env-file=.env.local scripts/elena-phone-test-setup.cjs --rollback <snapshot-path> --apply
```

If setup partly fails, retain its snapshot and review carrier state before retrying. Stop future AI acceptance with `LUXOR_ELENA_PHONE_TEST_ENABLED=false`; restore carrier routing as well so callers do not reach a disabled AI endpoint.

## How it works and what remains to verify

Twilio sends audio through native SIP to OpenAI. The signed incoming event is additionally bound to the selected physical call by checking its Twilio Call SID against the carrier API, including account, test destination, dedicated trunk, active state and freshness. SIP headers alone never authorize tools. Call-scoped signed tokens expire after 20 minutes. Hosted Responses delegation executes the authenticated HTTP MCP tools without a permanent WebSocket worker. A short server sideband requests the opening greeting; a transcript event does not prove caller playback.

Transfers require two tool steps, an expiring call-bound nonce, the caller's explicit affirmative words after the transfer question, and the unchanged saved physical destination. Authorization does not allow a model or caller to supply a destination. An atomic call-history claim permits one transfer attempt; errors and timeouts do not automatically redial. The language model reports the caller's affirmative response; independent audio or DTMF confirmation is not implemented. SIP REFER is a blind transfer, so its HTTP success means the request was accepted, not that Arianna answered. Human transfer, busy/no-answer behavior and caller audio must be tested by Lewis before using it for customers.

Call the test number manually and check: opening disclosure, natural pauses, interruptions, background noise, Spanish, pricing accuracy, two genuine tour choices, a changed date, refusal of a booking without confirmation, explicit rehearsal wording, a request for Arianna, a declined transfer, and a busy/no-answer transfer. Verify the public number still routes normally. This work does not prove any of those real call outcomes until a caller exercises them.

The phone defaults to Marin. The sandbox can save a voice for the next phone test call. Voice choices do not alter a conversation already in progress; start a fresh browser session or phone call to compare them.

## Verification

Local regression checks (synthetic callers; no real calls, reservations or messages):

```powershell
node --test tests/elena-phone-test.test.cjs tests/elena-voice-sandbox.test.cjs tests/elena-voice-sandbox-client.test.cjs
npm run typecheck
npm run lint -- --quiet
npm run build
```

## Sources

- [OpenAI GPT-Live telephony and SIP](https://developers.openai.com/api/docs/guides/voice-sip)
- [OpenAI delegation and MCP tools](https://developers.openai.com/api/docs/guides/live-delegation)
- [OpenAI opening greeting guidance](https://developers.openai.com/api/docs/guides/live-conversations#greet-before-the-caller-speaks)
- [Twilio call transfer and PSTN enablement](https://www.twilio.com/docs/sip-trunking/call-transfer)
- [Question-asking and perceived responsiveness, Huang et al.](https://www.hbs.edu/ris/Publication%20Files/Huang%20et%20al%202017_6945bc5e-3b3e-4c0a-addd-254c9e603c60.pdf): supports listening and relevant follow-ups; no venue conversion guarantee.
- [Gong discovery research](https://www.gong.io/blog/best-discovery-call-tips): supports adapting to the caller's buying stage. B2B question counts are not targets for short venue calls.
