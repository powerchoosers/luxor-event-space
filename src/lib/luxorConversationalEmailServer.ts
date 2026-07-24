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
  senderName?: string
  senderRole?: string
  senderEmail?: string
  senderPhone?: string
  senderImageUrl?: string | null
}

export function buildConversationalEmailHtml(params: ConversationalEmailParams): string {
  const {
    body,
    senderName = 'Luxor Event Space',
    senderRole = 'Venue Team',
    senderEmail = 'booking@luxoratlaspalmas.com',
    senderPhone = '(210) 940-0902',
    senderImageUrl,
  } = params

  const websiteUrl = absoluteUrl('/')
  const visitUrl = absoluteUrl('/visit')
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

  // Split plain text body into paragraphs
  const paragraphs = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const formattedParagraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 17px;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;font-size:15px;line-height:1.75;color:#332c24;">${escapeHtml(
          p
        ).replace(/\n/g, '<br />')}</p>`
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>${escapeHtml(params.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f1ea;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f1ea;padding:36px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7dcc8;box-shadow:0 14px 40px rgba(79,57,24,0.08);">
          <!-- Gold Line Accent Header -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24);font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>

          <!-- Subtle Luxor Header -->
          <tr>
            <td style="padding:25px 36px 18px;border-bottom:1px solid #eee5d6;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:500;letter-spacing:0.18em;color:#9f742b;text-transform:uppercase;">LUXOR</span>
                    <span style="display:block;font-family:Arial,'Helvetica Neue',sans-serif;font-size:8px;font-weight:600;letter-spacing:0.34em;color:#8b8175;text-transform:uppercase;margin-top:3px;">EVENT SPACE</span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <a href="${visitUrl}" target="_blank" style="font-family:Arial,'Helvetica Neue',sans-serif;font-size:10px;font-weight:700;color:#9f742b;text-decoration:none;letter-spacing:0.12em;text-transform:uppercase;">Book A Tour &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Conversational Email Body -->
          <tr>
            <td style="padding:34px 36px 22px;">
              ${formattedParagraphsHtml}
            </td>
          </tr>

          <!-- Sender signature block -->
          <tr>
            <td style="padding:0 36px 34px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fbf8f2;border:1px solid #eadfca;border-left:3px solid #caa24c;border-radius:10px;">
                <tr>
                  <td width="72" style="width:72px;vertical-align:middle;padding:18px 0 18px 18px;">
                    ${safeSenderImageUrl
                      ? `<img src="${escapeHtml(safeSenderImageUrl)}" width="54" height="54" alt="${escapeHtml(senderName)}" style="display:block;width:54px;height:54px;border-radius:50%;object-fit:cover;border:1px solid #dfc98f;box-shadow:0 4px 12px rgba(117,81,25,0.16);" />`
                      : `<div style="width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#f1d27a 0%,#caa24c 52%,#9b6d24 100%);display:block;text-align:center;line-height:54px;box-shadow:0 4px 12px rgba(117,81,25,0.18);"><span style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:700;color:#18130d;letter-spacing:0.06em;">${escapeHtml(initials)}</span></div>`}
                  </td>
                  <td style="vertical-align:middle;padding:18px 18px 18px 0;">
                    <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:600;color:#241c14;line-height:1.2;letter-spacing:0.01em;">
                      ${escapeHtml(senderName)}
                    </p>
                    <p style="margin:3px 0 9px;font-family:Arial,'Helvetica Neue',sans-serif;font-size:11px;font-weight:700;color:#9f742b;letter-spacing:0.04em;">
                      ${escapeHtml(senderRole)} &bull; Luxor Event Space
                    </p>
                    <p style="margin:0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:11px;line-height:1.65;color:#71675c;">
                      📞 <a href="tel:${escapeHtml(senderPhone).replace(/\D/g, '')}" style="color:#52525b;text-decoration:none;">${escapeHtml(senderPhone)}</a> &nbsp;|&nbsp; 
                      ✉️ <a href="mailto:${escapeHtml(senderEmail)}" style="color:#caa24c;text-decoration:none;">${escapeHtml(senderEmail)}</a><br />
                      📍 803 Castroville Rd #402, San Antonio, TX 78237<br />
                      🌐 <a href="${websiteUrl}" style="color:#71717a;text-decoration:none;">luxoratlaspalmas.com</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#faf7f1;padding:16px 36px;border-top:1px solid #eee5d6;text-align:center;">
              <p style="margin:0;font-family:Arial,'Helvetica Neue',sans-serif;font-size:10px;color:#95897c;line-height:1.55;letter-spacing:0.02em;">
                Luxor Event Space &bull; Premier Venue for Weddings, Quinceañeras & Milestone Celebrations
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
