import 'server-only'

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
}

export function buildConversationalEmailHtml(params: ConversationalEmailParams): string {
  const {
    body,
    senderName = 'Arianna Patterson',
    senderRole = 'Owner & Managing Director',
    senderEmail = 'booking@luxoratlaspalmas.com',
    senderPhone = '(210) 940-0902',
  } = params

  const websiteUrl = absoluteUrl('/')
  const visitUrl = absoluteUrl('/visit')

  // Split plain text body into paragraphs
  const paragraphs = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const formattedParagraphsHtml = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#27272a;">${escapeHtml(
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
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;box-shadow:0 4px 20px rgba(0,0,0,0.05);">
          <!-- Gold Line Accent Header -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,#9b6d24,#f1d27a,#caa24c,#9b6d24);font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>

          <!-- Subtle Luxor Header -->
          <tr>
            <td style="padding:24px 36px 16px;border-bottom:1px solid #f4f4f5;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:700;letter-spacing:0.12em;color:#caa24c;text-transform:uppercase;">LUXOR</span>
                    <span style="display:block;font-size:8px;letter-spacing:0.3em;color:#a1a1aa;text-transform:uppercase;margin-top:2px;">EVENT SPACE</span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <a href="${visitUrl}" target="_blank" style="font-size:11px;font-weight:600;color:#caa24c;text-decoration:none;letter-spacing:0.05em;">Book A Tour &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Conversational Email Body -->
          <tr>
            <td style="padding:32px 36px 24px;">
              ${formattedParagraphsHtml}
            </td>
          </tr>

          <!-- Elegant Arianna Patterson Signature Block -->
          <tr>
            <td style="padding:0 36px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #f4f4f5;padding-top:24px;">
                <tr>
                  <td width="52" style="width:52px;vertical-align:top;padding-right:16px;">
                    <!-- AP Letter Glyph Badge -->
                    <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#f1d27a 0%,#caa24c 50%,#9b6d24 100%);display:block;text-align:center;line-height:48px;box-shadow:0 2px 8px rgba(202,162,76,0.25);">
                      <span style="font-family:Georgia,'Times New Roman',serif;font-size:18px;font-weight:700;color:#050505;letter-spacing:0.05em;">AP</span>
                    </div>
                  </td>
                  <td style="vertical-align:top;">
                    <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;font-weight:700;color:#18181b;line-height:1.2;">
                      ${escapeHtml(senderName)}
                    </p>
                    <p style="margin:2px 0 8px;font-size:12px;font-weight:500;color:#caa24c;letter-spacing:0.02em;">
                      ${escapeHtml(senderRole)} &bull; Luxor Event Space
                    </p>
                    <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;">
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
            <td style="background-color:#fafafa;padding:16px 36px;border-top:1px solid #f4f4f5;text-align:center;">
              <p style="margin:0;font-size:11px;color:#a1a1aa;line-height:1.5;">
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
