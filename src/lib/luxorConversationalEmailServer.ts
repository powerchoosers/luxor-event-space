function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
    ? `<img src="${escapeHtml(safeSenderImageUrl)}" width="44" height="44" alt="${escapeHtml(senderName)}" style="display:block;width:44px;height:44px;border-radius:22px;object-fit:cover;border:1px solid #dfc98f;" />`
    : `<table role="presentation" width="44" height="44" cellpadding="0" cellspacing="0" border="0" style="width:44px;height:44px;background-color:#caa24c;border-radius:22px;">
        <tr>
          <td width="44" height="44" align="center" valign="middle" style="width:44px;height:44px;border-radius:22px;font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:700;line-height:44px;color:#18130d;letter-spacing:0.05em;">
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
      .luxor-outer { padding:16px 8px !important; }
      .luxor-header { padding:20px 20px 15px !important; }
      .luxor-body { padding:22px 20px 14px !important; }
      .luxor-signature-wrap { padding:0 20px 24px !important; }
      .luxor-body, .luxor-body p, .luxor-body div { font-size:15px !important; line-height:1.68 !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table class="luxor-outer" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#ffffff;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:620px;background-color:#ffffff;">
          <tr>
            <td class="luxor-header" style="padding:22px 28px 16px;border-bottom:1px solid #e8e1d7;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:600;letter-spacing:0.08em;color:#8f6829;text-transform:uppercase;">Luxor</p>
              <p style="margin:4px 0 0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:9px;font-weight:600;letter-spacing:0.16em;color:#887d70;text-transform:uppercase;">Private Event Space</p>
            </td>
          </tr>
          <tr>
            <td class="luxor-body" style="padding:30px 28px 18px;">
              ${formattedBodyHtml}
            </td>
          </tr>
          <tr>
            <td class="luxor-signature-wrap" style="padding:0 28px 30px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #e8e1d7;">
                <tr>
                  <td style="padding:18px 0 0;vertical-align:top;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:0 12px 0 0;vertical-align:top;">${avatarHtml}</td>
                        <td style="vertical-align:middle;">
                          <p style="margin:0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:14px;font-weight:700;color:#332c24;line-height:1.35;">${escapeHtml(senderName)}</p>
                          <p style="margin:2px 0 0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:12px;color:#756b60;line-height:1.45;">${escapeHtml(senderRole)} · Luxor Event Space</p>
                          <p style="margin:5px 0 0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:12px;color:#756b60;line-height:1.5;">
                            ${senderPhoneDisplay ? `<a href="tel:${escapeHtml(senderPhoneHref)}" style="color:#756b60;text-decoration:none;">${escapeHtml(senderPhoneDisplay)}</a><span style="color:#c3b9ac;"> &nbsp;|&nbsp; </span>` : ''}<a href="mailto:${escapeHtml(senderEmail)}" style="color:#756b60;text-decoration:none;">${escapeHtml(senderEmail)}</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
