import "jsr:@supabase/functions-js/edge-runtime.d.ts"

type EmailJob = {
  id: string
  job_type: string
  recipient_email: string
  subject: string
  body: string
  attempts: number
  metadata: Record<string, unknown> | null
}

const SUPABASE_URL = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "")
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
const ZOHO_CLIENT_ID = Deno.env.get("ZOHO_CLIENT_ID") || ""
const ZOHO_CLIENT_SECRET = Deno.env.get("ZOHO_CLIENT_SECRET") || ""
const ZOHO_REFRESH_TOKEN = Deno.env.get("ZOHO_REFRESH_TOKEN") || ""
const ZOHO_ACCOUNT_ID = Deno.env.get("ZOHO_ACCOUNT_ID") || ""
const ZOHO_ACCOUNTS_SERVER = (Deno.env.get("ZOHO_ACCOUNTS_SERVER") || "https://accounts.zoho.com").replace(/\/$/, "")
const ZOHO_BASE_URL = (Deno.env.get("ZOHO_BASE_URL") || "https://mail.zoho.com/api/v1").replace(/\/$/, "")
const DEFAULT_SENDER = (Deno.env.get("LUXOR_ZOHO_LOGIN_EMAIL") || "booking@luxoratlaspalmas.com").toLowerCase()
const ALLOWED_SENDERS = (Deno.env.get("LUXOR_ZOHO_ALLOWED_SENDERS") || "booking@luxoratlaspalmas.com,hello@luxoratlaspalmas.com")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean)

let cachedAccessToken: { token: string; expiresAt: number } | null = null

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405)

  try {
    const missing = Object.entries({
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      ZOHO_CLIENT_ID,
      ZOHO_CLIENT_SECRET,
      ZOHO_REFRESH_TOKEN,
      ZOHO_ACCOUNT_ID,
    }).filter(([, value]) => !value).map(([name]) => name)
    if (missing.length) return json({ error: `Missing Edge Function configuration: ${missing.join(", ")}.` }, 500)

    // The database claim function enforces the one-email pacing window. Keep
    // the worker batch at one as a second line of defense against bulk sends.
    const jobs = await supabaseRest<EmailJob[]>("rpc/luxor_claim_due_email_jobs", {
      method: "POST",
      body: JSON.stringify({ job_limit: 1 }),
    })
    const results = []

    for (const job of jobs || []) {
      try {
        await sendZohoEmail(job)
        const sentAt = new Date().toISOString()
        await updateJob(job.id, { status: "sent", sent_at: sentAt, last_error: null })
        if (job.job_type === "marketing_campaign") await updateMarketingResult(job, "sent")
        results.push({ id: job.id, status: "sent" })
      } catch (error) {
        const message = safeError(error)
        const shouldRetry = Number(job.attempts || 0) < 3
        await updateJob(job.id, shouldRetry
          ? {
              status: "queued",
              scheduled_for: new Date(Date.now() + Math.max(1, Number(job.attempts || 1)) * 5 * 60_000).toISOString(),
              last_error: message,
            }
          : { status: "failed", last_error: message })
        if (!shouldRetry && job.job_type === "marketing_campaign") await updateMarketingResult(job, "failed", message)
        results.push({ id: job.id, status: shouldRetry ? "retrying" : "failed" })
      }
    }

    return json({ success: true, processed: results.length, results })
  } catch (error) {
    console.error("Luxor email processor failed:", safeError(error))
    return json({ error: safeError(error) }, 500)
  }
})

async function sendZohoEmail(job: EmailJob) {
  const metadata = job.metadata && typeof job.metadata === "object" ? job.metadata : {}
  const requestedFrom = typeof metadata.sender_from === "string" ? normalizeEmail(metadata.sender_from) : DEFAULT_SENDER
  const from = ALLOWED_SENDERS.includes(requestedFrom) ? requestedFrom : DEFAULT_SENDER
  const fromName = cleanHeader(typeof metadata.sender_name === "string" ? metadata.sender_name : "Luxor Event Space")
  const to = normalizeEmail(job.recipient_email)
  if (!to) throw new Error("The email job does not have a valid recipient.")

  const payload = {
    fromAddress: `"${fromName}" <${from}>`,
    toAddress: to,
    subject: cleanHeader(job.subject),
    content: looksLikeHtml(job.body) ? job.body : plainTextToHtml(job.body),
    mailFormat: "html",
  }

  let token = await getZohoAccessToken()
  let response = await postZohoMessage(token, payload)
  if (response.status === 401) {
    cachedAccessToken = null
    token = await getZohoAccessToken()
    response = await postZohoMessage(token, payload)
  }

  const resultText = await response.text()
  if (!response.ok) throw new Error(`Zoho send failed with ${response.status}: ${resultText.slice(0, 500)}`)
}

async function getZohoAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.token

  const response = await fetch(`${ZOHO_ACCOUNTS_SERVER}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: ZOHO_REFRESH_TOKEN,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  })
  const payload = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error?: string }
  if (!response.ok || !payload.access_token) throw new Error(`Zoho token refresh failed: ${payload.error || response.status}`)

  cachedAccessToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
  }
  return cachedAccessToken.token
}

function postZohoMessage(token: string, payload: Record<string, string>) {
  return fetch(`${ZOHO_BASE_URL}/accounts/${encodeURIComponent(ZOHO_ACCOUNT_ID)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
}

async function updateJob(id: string, updates: Record<string, unknown>) {
  await supabaseRest(`luxor_email_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ ...updates, updated_at: new Date().toISOString() }),
  })
}

async function updateMarketingResult(job: EmailJob, status: "sent" | "failed", error?: string) {
  const metadata = job.metadata && typeof job.metadata === "object" ? job.metadata : {}
  const recipientId = typeof metadata.marketing_recipient_id === "string" ? metadata.marketing_recipient_id : null
  const campaignId = typeof metadata.campaign_id === "string" ? metadata.campaign_id : null
  if (!recipientId || !campaignId) return

  const now = new Date().toISOString()
  await supabaseRest(`luxor_marketing_recipients?id=eq.${encodeURIComponent(recipientId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status, sent_at: status === "sent" ? now : null, last_error: error || null }),
  })
  const recipients = await supabaseRest<Array<{ status: string }>>(
    `luxor_marketing_recipients?select=status&campaign_id=eq.${encodeURIComponent(campaignId)}`,
  )
  const queued = recipients.filter((item) => item.status === "queued").length
  const sent = recipients.filter((item) => item.status === "sent").length
  const failed = recipients.filter((item) => item.status === "failed").length
  await supabaseRest(`luxor_marketing_campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: queued > 0 ? "sending" : failed > 0 && sent === 0 ? "failed" : "sent",
      sent_at: queued === 0 ? now : null,
    }),
  })
}

async function supabaseRest<T = unknown>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Supabase request failed with ${response.status}: ${text.slice(0, 500)}`)
  return (text ? JSON.parse(text) : null) as T
}

function normalizeEmail(value: string) {
  const match = value.trim().toLowerCase().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
  return match ? match[0] : ""
}

function cleanHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 240)
}

function looksLikeHtml(value: string) {
  return /<\/?[a-z][\s\S]*>/i.test(value)
}

function plainTextToHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br />")
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Email processing failed.").slice(0, 800)
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", Connection: "keep-alive" },
  })
}
