async function requestSignature(body: string) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  } catch {
    // Preserve retry behavior if SubtleCrypto is unavailable in an embedded browser.
    let first = 2166136261
    let second = 2246822519
    for (let index = 0; index < body.length; index += 1) {
      const code = body.charCodeAt(index)
      first = Math.imul(first ^ code, 16777619)
      second = Math.imul(second ^ code, 3266489917)
    }
    return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
  }
}

/** Reuses a retry key for the same form payload until the server confirms success. */
export async function submitLuxorIdempotentForm(formKey: string, path: string, payload: unknown) {
  const body = JSON.stringify(payload)
  const signature = await requestSignature(body)
  const storageKey = `luxor-submission:${formKey}`
  let idempotencyKey = crypto.randomUUID()

  try {
    const previous = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as { signature?: string; id?: string } | null
    if (previous?.signature === signature && previous.id) idempotencyKey = previous.id
    else sessionStorage.setItem(storageKey, JSON.stringify({ signature, id: idempotencyKey }))
  } catch {
    // Requests still receive an idempotency key if storage is unavailable.
  }

  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body,
  })

  if (response.ok) {
    try {
      const current = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as { signature?: string; id?: string } | null
      if (current?.signature === signature && current.id === idempotencyKey) sessionStorage.removeItem(storageKey)
    } catch {
      // A failed cleanup only keeps the already-used key for a retry.
    }
  }

  return response
}
