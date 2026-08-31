export type LuxorEmailThemeMode = 'light' | 'dark' | 'brand'

export interface LuxorEmailTheme {
  mode: LuxorEmailThemeMode
  label: string
  canvas: string
  surface: string
  surfaceAlt: string
  text: string
  muted: string
  accent: string
  accentText: string
  border: string
  fontHeading: string
  fontBody: string
  radius: number
  contentWidth: number
}

export const LUXOR_EMAIL_THEME_PRESETS: Record<LuxorEmailThemeMode, LuxorEmailTheme> = {
  light: {
    mode: 'light',
    label: 'Ivory editorial',
    canvas: '#f1ede6',
    surface: '#fffdf9',
    surfaceAlt: '#f6f0e6',
    text: '#201b16',
    muted: '#6f6456',
    accent: '#b88732',
    accentText: '#fffdf9',
    border: '#dfd3c0',
    fontHeading: 'Cormorant Garamond, Georgia, Times New Roman, serif',
    fontBody: 'Manrope, Helvetica Neue, Arial, sans-serif',
    radius: 20,
    contentWidth: 620,
  },
  dark: {
    mode: 'dark',
    label: 'Midnight gold',
    canvas: '#050505',
    surface: '#0a0807',
    surfaceAlt: '#120d0a',
    text: '#f7efe3',
    muted: '#d7c29a',
    accent: '#caa24c',
    accentText: '#17120c',
    border: '#3a2e1d',
    fontHeading: 'Cormorant Garamond, Georgia, Times New Roman, serif',
    fontBody: 'Manrope, Helvetica Neue, Arial, sans-serif',
    radius: 20,
    contentWidth: 620,
  },
  brand: {
    mode: 'brand',
    label: 'Champagne contrast',
    canvas: '#18130e',
    surface: '#fbf5ea',
    surfaceAlt: '#100d0a',
    text: '#211a13',
    muted: '#6e604f',
    accent: '#c79b43',
    accentText: '#17120c',
    border: '#d9c7a6',
    fontHeading: 'Cormorant Garamond, Georgia, Times New Roman, serif',
    fontBody: 'Manrope, Helvetica Neue, Arial, sans-serif',
    radius: 20,
    contentWidth: 620,
  },
}

export function cloneLuxorEmailTheme(mode: LuxorEmailThemeMode = 'brand'): LuxorEmailTheme {
  return { ...LUXOR_EMAIL_THEME_PRESETS[mode] }
}

export function normalizeLuxorEmailTheme(value: unknown): LuxorEmailTheme {
  if (value === 'light' || value === 'dark' || value === 'brand') return cloneLuxorEmailTheme(value)
  if (!value || typeof value !== 'object') return cloneLuxorEmailTheme('brand')
  const candidate = value as Partial<LuxorEmailTheme>
  const mode: LuxorEmailThemeMode = candidate.mode === 'light' || candidate.mode === 'dark' || candidate.mode === 'brand'
    ? candidate.mode
    : 'brand'
  return { ...cloneLuxorEmailTheme(mode), ...candidate, mode }
}

export interface LuxorSystemEmailAction {
  label: string
  url: string
  tone?: 'primary' | 'secondary'
}

export interface LuxorSystemEmailDetail {
  label: string
  value: string
}

export interface LuxorSystemEmailInput {
  previewText?: string
  eyebrow: string
  title: string
  heroImage?: string
  heroAlt?: string
  greeting?: string
  bodyHtml: string
  details?: LuxorSystemEmailDetail[]
  actions?: LuxorSystemEmailAction[]
  note?: string
  theme?: LuxorEmailTheme | LuxorEmailThemeMode
}

function escapeAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function resolveTheme(theme: LuxorSystemEmailInput['theme']) {
  if (typeof theme === 'string') return cloneLuxorEmailTheme(theme)
  return normalizeLuxorEmailTheme(theme)
}

export function renderLuxorSystemEmail(input: LuxorSystemEmailInput) {
  const t = resolveTheme(input.theme)
  const details = input.details?.length
    ? `<tr><td style="padding:0 42px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;border-spacing:0;background:${t.surfaceAlt};border:1px solid ${t.border};border-radius:${Math.max(12, t.radius - 6)}px;overflow:hidden"><tr>${input.details.map((detail, index) => `<td style="width:${100 / input.details!.length}%;padding:17px 18px;vertical-align:top;${index ? `border-left:1px solid ${t.border};` : ''}"><p style="margin:0 0 7px;color:${t.accent};font-family:${t.fontBody};font-size:9px;font-weight:800;letter-spacing:.19em;text-transform:uppercase">${detail.label}</p><p style="margin:0;color:${t.mode === 'brand' ? '#f7efe3' : t.text};font-family:${t.fontBody};font-size:13px;line-height:1.55">${detail.value}</p></td>`).join('')}</tr></table></td></tr>`
    : ''
  const actions = input.actions?.length
    ? `<tr><td align="center" style="padding:22px 42px 38px">${input.actions.map((action) => action.tone === 'secondary'
      ? `<a href="${escapeAttribute(action.url)}" target="_blank" style="display:inline-block;margin:0 5px 10px;padding:14px 24px;border:1px solid ${t.accent};border-radius:999px;color:${t.accent};font-family:${t.fontBody};font-size:10px;font-weight:800;letter-spacing:.16em;text-decoration:none;text-transform:uppercase">${action.label}</a>`
      : `<a href="${escapeAttribute(action.url)}" target="_blank" style="display:inline-block;margin:0 5px 10px;padding:15px 25px;border:1px solid ${t.accent};border-radius:999px;background:${t.accent};color:${t.accentText};font-family:${t.fontBody};font-size:10px;font-weight:800;letter-spacing:.16em;text-decoration:none;text-transform:uppercase">${action.label}</a>`).join('')}</td></tr>`
    : ''
  const previewText = input.previewText || `${input.eyebrow}: ${input.title}`

  return `<!doctype html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${input.title}</title>
  <style>
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0;mso-table-rspace:0}table{border-collapse:collapse!important}img{border:0;display:block;height:auto;line-height:100%;outline:none;text-decoration:none}a{text-decoration:none}
    @media(max-width:640px){.luxor-shell{width:100%!important}.luxor-pad{padding-left:24px!important;padding-right:24px!important}.luxor-title{font-size:34px!important}.luxor-detail{display:block!important;width:100%!important;border-left:0!important;border-top:1px solid ${t.border}!important}}
    @media(prefers-color-scheme:dark){.luxor-canvas{background:#050505!important}.luxor-shell{background:#0a0807!important;border-color:#3a2e1d!important}.luxor-copy{color:#d7c29a!important}.luxor-title{color:#f7efe3!important}.luxor-header{background:#080605!important}.luxor-footer{background:#080605!important}}
  </style>
</head>
<body class="luxor-canvas" style="margin:0;padding:0;background:${t.canvas};font-family:${t.fontBody};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${previewText}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${t.canvas}"><tr><td align="center" style="padding:28px 12px">
    <table class="luxor-shell" role="presentation" width="${t.contentWidth}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${t.contentWidth}px;background:${t.surface};border:1px solid ${t.border};border-radius:${t.radius}px;overflow:hidden">
      <tr><td style="height:3px;background:${t.accent};font-size:1px;line-height:1px">&nbsp;</td></tr>
      <tr><td class="luxor-header luxor-pad" align="center" style="padding:27px 42px 23px;background:${t.mode === 'dark' ? '#080605' : t.surface};border-bottom:1px solid ${t.border}">
        <p style="margin:0;color:${t.accent};font-family:${t.fontHeading};font-size:30px;font-weight:600;letter-spacing:.19em;text-transform:uppercase">Luxor</p>
        <p style="margin:5px 0 0;color:${t.muted};font-family:${t.fontBody};font-size:8px;font-weight:700;letter-spacing:.37em;text-transform:uppercase">At Las Palmas Events</p>
      </td></tr>
      ${input.heroImage ? `<tr><td><img src="${escapeAttribute(input.heroImage)}" alt="${escapeAttribute(input.heroAlt || '')}" width="${t.contentWidth}" style="display:block;width:100%;max-width:${t.contentWidth}px;height:auto" /></td></tr>` : ''}
      <tr><td class="luxor-pad" style="padding:48px 42px 22px">
        <p style="margin:0 0 13px;color:${t.accent};font-family:${t.fontBody};font-size:9px;font-weight:800;letter-spacing:.25em;text-transform:uppercase">${input.eyebrow}</p>
        <h1 class="luxor-title" style="margin:0;color:${t.text};font-family:${t.fontHeading};font-size:41px;font-weight:600;line-height:1.05;letter-spacing:-.01em">${input.title}</h1>
        ${input.greeting ? `<p class="luxor-copy" style="margin:20px 0 0;color:${t.muted};font-family:${t.fontBody};font-size:15px;line-height:1.78">${input.greeting}</p>` : ''}
      </td></tr>
      <tr><td class="luxor-copy luxor-pad" style="padding:0 42px 25px;color:${t.muted};font-family:${t.fontBody};font-size:15px;line-height:1.78">${input.bodyHtml}</td></tr>
      ${details}
      ${actions}
      ${input.note ? `<tr><td class="luxor-copy luxor-pad" style="padding:0 42px 35px;color:${t.muted};font-family:${t.fontBody};font-size:12px;line-height:1.7">${input.note}</td></tr>` : ''}
      <tr><td class="luxor-footer luxor-pad" align="center" style="padding:29px 42px 31px;background:${t.surfaceAlt};border-top:1px solid ${t.border}">
        <p style="margin:0;color:${t.accent};font-family:${t.fontHeading};font-size:22px;letter-spacing:.14em;text-transform:uppercase">Luxor</p>
        <p class="luxor-copy" style="margin:10px 0 0;color:${t.muted};font-family:${t.fontBody};font-size:10px;line-height:1.75">803 Castroville Rd #402, San Antonio, TX 78237<br />Private venue tours by appointment.<br /><a href="mailto:booking@luxoratlaspalmas.com" style="color:${t.accent}">booking@luxoratlaspalmas.com</a> &nbsp;·&nbsp; <a href="https://www.luxoratlaspalmas.com" style="color:${t.accent}">luxoratlaspalmas.com</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
}
