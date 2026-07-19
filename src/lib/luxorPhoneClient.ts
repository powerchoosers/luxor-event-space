export function getUsDialDigits(value: string) {
  const digits = value.replace(/\D/g, '')
  const includesCountryCode = value.trimStart().startsWith('+1') || (digits.startsWith('1') && digits.length > 10)
  return (includesCountryCode ? digits.slice(1) : digits).slice(0, 10)
}

export function formatUsDialInput(value: string) {
  const digits = getUsDialDigits(value)
  if (!digits) return ''

  const areaCode = digits.slice(0, 3)
  const prefix = digits.slice(3, 6)
  const line = digits.slice(6)

  let formatted = `+1 (${areaCode}`
  if (areaCode.length === 3) formatted += ')'
  if (prefix) formatted += ` ${prefix}`
  if (line) formatted += `-${line}`
  return formatted
}

export function formatPhoneDisplay(value: string | null | undefined) {
  if (!value) return ''
  return toUsE164(value) ? formatUsDialInput(value) : value
}

export function toUsE164(value: string) {
  const digits = getUsDialDigits(value)
  return digits.length === 10 ? `+1${digits}` : null
}

export function removeLastDialDigit(value: string) {
  return formatUsDialInput(getUsDialDigits(value).slice(0, -1))
}
