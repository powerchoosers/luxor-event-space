# Elena voice test

The approved phone test number is **+1 817 663 0380** (`PN3339992846524f8140edc3dca201fbfe`). This test setup does not change the selected public or CRM-active number. The public line has a separate, explicitly authorized Elena-first configuration described in [Elena inbound calls](elena-live-inbound.md).

The current phone path uses Twilio Programmable Voice with a secure SIP connection to GPT-Live. A dedicated Elastic SIP trunk was prepared during the initial implementation; the migration script removes only the approved number's association with that trunk. It retains the owned number and trunk and preserves the public line and SMS configuration. Checked-in code and preparation records are not proof of current deployment or live routing.

The browser sandbox and phone test use GPT-Live (`gpt-live-1`). Browser conversations are practice. Phone tour booking is also a rehearsal: it reads published tour times but does not reserve them, save contacts, or send email or SMS. A caller-requested transfer is a real attempt to ring Arianna's saved physical `ring_to_number`; the caller hears that distinction in the opening. No recording or transcript retention is enabled by this feature. A minimal call-history row retains test status and transfer attempts, without marking recording consent as granted.

## Required server setup

Keep values in ignored local env files and Vercel server-only configuration:

- Existing `OPENAI_API_KEY` and Twilio/Supabase server credentials.
- `OPENAI_PROJECT_ID`: project owning the key and webhook.
- `OPENAI_VOICE_WEBHOOK_SECRET`: signing secret for this specific OpenAI endpoint.
- `LUXOR_ELENA_TEST_NUMBER=+18176630380`.
- `LUXOR_ELENA_TEST_TRUNK_SID`: optional former test trunk, used by the migration script to refuse detaching a number from an unexpected trunk. It does not route new test calls.
- `LUXOR_ELENA_PHONE_TEST_ENABLED=true`: defaults to disabled when absent.
- Optional `LUXOR_ELENA_PHONE_BACKEND_MODEL`: an accessible Responses model; default `gpt-6-luna`.

Create the OpenAI project webhook at `https://www.luxoratlaspalmas.com/api/webhooks/openai-voice`, subscribed only to `live.transport.incoming`. Retain the signing secret securely. Confirm GPT-Live and SIP access for this project. Deploy the code and server configuration before changing number routing. This repository requires Lewis's explicit authorization for commit/push/release; local code alone does not make the number callable.

Run the setup script first without mutation:

```powershell
node --env-file=.env.local scripts/elena-phone-test-setup.cjs
```

It requires a healthy deployed endpoint, an MCP endpoint that rejects unauthenticated calls, and incoming/fallback/status handlers that reject unsigned Twilio requests. It checks the selected number in both Twilio and Supabase and refuses to detach it from an unexpected trunk. After reviewing the result, route the approved number:

```powershell
node --env-file=.env.local scripts/elena-phone-test-setup.cjs --apply
```

The script snapshots routing outside the repository before changes. It installs the test number's Programmable Voice incoming, fallback and status URLs, then removes only that number's former Elastic SIP trunk association. It does not modify the trunk, its origination URLs, other numbers, public-number flags or CRM-active flags. SMS URLs are checked unchanged. The runtime uses TLS and SRTP when dialing OpenAI. The setup script makes no outbound calls. Its printed snapshot path supports rollback of the selected number's original routing:

```powershell
node --env-file=.env.local scripts/elena-phone-test-setup.cjs --rollback <snapshot-path>
node --env-file=.env.local scripts/elena-phone-test-setup.cjs --rollback <snapshot-path> --apply
```

If setup partly fails, retain its snapshot and review carrier state before retrying. Stop future AI acceptance with `LUXOR_ELENA_PHONE_TEST_ENABLED=false`; restore carrier routing as well so callers do not reach a disabled AI endpoint.

## How it works and what remains to verify

The incoming Twilio webhook first verifies the carrier signature, account and approved test destination. It creates a one-use call-bound nonce, then returns a secure `<Dial><Sip>` connection to OpenAI. The signed OpenAI event must present that nonce before its session can be bound to the verified parent call. SIP `X-Twilio-CallSid` and SIP `Call-ID` are different identifiers and are not used as standalone authorization. The server does not depend on reading an active Elastic SIP Trunk call through the Calls API: Twilio exposes those call records only after termination. Signed Programmable Voice callbacks supply call progress instead.

Call-scoped signed tool tokens expire after 20 minutes. Hosted Responses delegation executes authenticated HTTP MCP tools without a permanent WebSocket worker. A short server sideband requests the opening greeting; a transcript event does not prove caller playback. No startup instructions or model-generated claim can substitute for the signed ingress and server-side session binding.

Transfers require two tool steps, an expiring call-bound nonce, the caller's explicit affirmative words after the transfer question, and the unchanged saved physical destination. Authorization does not allow a model or caller to supply a destination. An atomic call-history claim permits one transfer attempt; errors and timeouts do not automatically redial. The language model reports the caller's affirmative response; independent audio or DTMF confirmation is not implemented. The confirmed transfer redirects the verified Programmable Voice parent to the saved physical phone. The transfer child has its own signed progress callbacks; its completion never marks the parent call complete. `transfer_answered` is set only after an actual answered/in-progress callback and remains true even if a delayed earlier event arrives. Accepting a transfer request alone does not prove Arianna answered. Human transfer, busy/no-answer behavior and caller audio must be tested by Lewis before using it for customers.

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
- [Twilio secure SIP media](https://www.twilio.com/docs/voice/api/secure-media)
- [Twilio SIP custom headers](https://www.twilio.com/docs/voice/twiml/sip#custom-headers)
- [Twilio Calls resource and call modification](https://www.twilio.com/docs/voice/api/call-resource)
- [Twilio Elastic SIP Trunk call visibility](https://help.twilio.com/articles/43051781532059)
- [Twilio migration from Elastic SIP to Programmable Voice](https://www.twilio.com/en-us/blog/migrate-twilio-elastic-sip-programmable-voice)
- [Question-asking and perceived responsiveness, Huang et al.](https://www.hbs.edu/ris/Publication%20Files/Huang%20et%20al%202017_6945bc5e-3b3e-4c0a-addd-254c9e603c60.pdf): supports listening and relevant follow-ups; no venue conversion guarantee.
- [Gong discovery research](https://www.gong.io/blog/best-discovery-call-tips): supports adapting to the caller's buying stage. B2B question counts are not targets for short venue calls.
