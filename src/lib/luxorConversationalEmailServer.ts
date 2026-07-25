function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const PUBLIC_BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  'https://www.luxoratlaspalmas.com'

function absoluteUrl(path: string) {
  return `${PUBLIC_BASE_URL.replace(/\/$/, '')}${path}`
}

export interface ConversationalEmailParams {
  to: string
  recipientName?: string
  subject: string
  body: string
  bodyHtml?: string
  senderName?: string
  senderRole?: string
  senderEmail?: string
  senderPhone?: string | null
  senderImageUrl?: string | null
}

function sanitizeRichEmailHtml(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button|meta|link)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(script|style|iframe|object|embed|form|input|button|meta|link)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '')
}

export function buildConversationalEmailHtml(params: ConversationalEmailParams): string {
  const {
    body,
    senderName = 'Luxor Event Space',
    senderRole = 'Venue Team',
    senderEmail = 'booking@luxoratlaspalmas.com',
    senderPhone = null,
    senderImageUrl,
  } = params

  const websiteUrl = absoluteUrl('/')
  const visitUrl = absoluteUrl('/visit')
  const mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('803 Castroville Rd #402, San Antonio, TX 78237')
  const initials = senderName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'LE'
  const safeSenderImageUrl = (() => {
    if (!senderImageUrl) return null
    try {
      const url = new URL(senderImageUrl)
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
    } catch {
      return null
    }
  })()
  const senderPhoneDigits = String(senderPhone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  const senderPhoneDisplay = senderPhoneDigits.length === 10
    ? `(${senderPhoneDigits.slice(0, 3)}) ${senderPhoneDigits.slice(3, 6)}-${senderPhoneDigits.slice(6)}`
    : String(senderPhone || '').trim()
  const senderPhoneHref = senderPhoneDigits.length === 10 ? `+1${senderPhoneDigits}` : String(senderPhone || '').trim()

  const formattedBodyHtml = params.bodyHtml
    ? `<div style="font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#332c24;">${sanitizeRichEmailHtml(params.bodyHtml)}</div>`
    : body
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map(
          (p) =>
            `<p style="margin:0 0 17px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#332c24;">${escapeHtml(
              p
            ).replace(/\n/g, '<br />')}</p>`
        )
        .join('')

  const avatarHtml = safeSenderImageUrl
    ? `<img src="${escapeHtml(safeSenderImageUrl)}" width="60" height="60" alt="${escapeHtml(senderName)}" style="display:block;width:60px;height:60px;border-radius:30px;object-fit:cover;border:1px solid #dfc98f;" />`
    : `<table role="presentation" width="60" height="60" cellpadding="0" cellspacing="0" border="0" style="width:60px;height:60px;background-color:#caa24c;border-radius:30px;">
        <tr>
          <td width="60" height="60" align="center" valign="middle" style="width:60px;height:60px;border-radius:30px;font-family:Georgia,'Times New Roman',serif;font-size:23px;font-weight:700;line-height:60px;color:#18130d;letter-spacing:0.05em;">
            ${escapeHtml(initials)}
          </td>
        </tr>
      </table>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${escapeHtml(params.subject)}</title>
  <style>
    @media only screen and (max-width:620px) {
      .luxor-outer { padding:12px 6px !important; }
      .luxor-header { padding:22px 20px 17px !important; }
      .luxor-body { padding:27px 20px 17px !important; }
      .luxor-signature-wrap { padding:0 14px 26px !important; }
      .luxor-signature { padding:23px 16px !important; }
      .luxor-footer { padding:15px 18px !important; }
      .luxor-logo { font-size:21px !important; }
      .luxor-body, .luxor-body p, .luxor-body div { font-size:15px !important; line-height:1.68 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f1ea;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table class="luxor-outer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f5f1ea;padding:30px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7dcc8;box-shadow:0 14px 40px rgba(79,57,24,0.08);">
          <!-- Gold Line Accent Header -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24);font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>

          <!-- Subtle Luxor Header -->
          <tr>
            <td class="luxor-header" align="center" style="padding:25px 28px 18px;border-bottom:1px solid #eee5d6;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="text-align:center;">
                    <span class="luxor-logo" style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:500;letter-spacing:0.18em;color:#9f742b;text-transform:uppercase;">LUXOR</span>
                    <span style="display:block;font-family:Arial,'Helvetica Neue',sans-serif;font-size:8px;font-weight:600;letter-spacing:0.34em;color:#8b8175;text-transform:uppercase;margin-top:3px;">EVENT SPACE</span>
                    <a href="${visitUrl}" target="_blank" style="display:inline-block;margin-top:13px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:9px;font-weight:700;color:#9f742b;text-decoration:none;letter-spacing:0.13em;text-transform:uppercase;">Book A Private Tour</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Conversational Email Body -->
          <tr>
            <td class="luxor-body" style="padding:34px 36px 22px;">
              ${formattedBodyHtml}
            </td>
          </tr>

          <!-- Sender signature block -->
          <tr>
            <td class="luxor-signature-wrap" style="padding:0 36px 34px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#fbf8f2;border:1px solid #eadfca;border-top:3px solid #caa24c;border-radius:12px;">
                <tr>
                  <td class="luxor-signature" align="center" style="padding:25px 20px;text-align:center;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                      <tr><td align="center">${avatarHtml}</td></tr>
                    </table>
                    <p style="margin:13px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:600;color:#241c14;line-height:1.25;letter-spacing:0.01em;">
                      ${escapeHtml(senderName)}
                    </p>
                    <p style="margin:4px 0 0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:10px;font-weight:700;color:#9f742b;line-height:1.5;letter-spacing:0.08em;text-transform:uppercase;">
                      ${escapeHtml(senderRole)}
                    </p>
                    <p style="margin:2px 0 0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:10px;font-weight:600;color:#8b8175;line-height:1.5;letter-spacing:0.08em;text-transform:uppercase;">
                      Luxor Event Space
                    </p>
                    <table role="presentation" width="44" cellpadding="0" cellspacing="0" border="0" align="center" style="width:44px;margin:15px auto 13px;">
                      <tr><td height="1" style="height:1px;background-color:#d8bd7d;font-size:1px;line-height:1px;">&nbsp;</td></tr>
                    </table>
                    <p style="margin:0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:11px;line-height:1.85;color:#71675c;word-break:break-word;">
                      ${senderPhoneDisplay ? `<a href="tel:${escapeHtml(senderPhoneHref)}" style="color:#52525b;text-decoration:none;">${escapeHtml(senderPhoneDisplay)}</a><br />` : ''}
                      <a href="mailto:${escapeHtml(senderEmail)}" style="color:#caa24c;text-decoration:none;">${escapeHtml(senderEmail)}</a><br />
                      <a href="${websiteUrl}" target="_blank" style="color:#71675c;text-decoration:none;">luxoratlaspalmas.com</a>
                    </p>
                    <p style="margin:13px 0 0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:9px;line-height:1.5;letter-spacing:0.1em;text-transform:uppercase;">
                      <a href="${mapUrl}" target="_blank" style="color:#9f742b;text-decoration:none;">San Antonio, Texas &bull; View Location</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="luxor-footer" style="background-color:#faf7f1;padding:16px 28px;border-top:1px solid #eee5d6;text-align:center;">
              <p style="margin:0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:10px;color:#95897c;line-height:1.55;letter-spacing:0.02em;">
                Elegant spaces for weddings, Quinceañeras and milestone celebrations.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
