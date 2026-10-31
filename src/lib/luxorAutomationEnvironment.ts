export function canControlLiveLuxorAutomations() {
  return process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production'
}
