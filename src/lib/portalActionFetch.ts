export async function readPortalActionResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text()
  if (!text.trim()) {
    if (response.status === 413) {
      throw new Error('That request was too large. Try fewer screenshots or smaller images.')
    }
    throw new Error('The server did not respond. Please try again.')
  }
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    const lowered = text.toLowerCase()
    if (response.status === 413 || lowered.includes('entity too large') || lowered.includes('payload too large')) {
      throw new Error('That request was too large. Try fewer screenshots or smaller images.')
    }
    if (/^request /i.test(text.trim())) {
      throw new Error('The server could not accept that request. Try fewer or smaller attachments.')
    }
    throw new Error('The server returned an unexpected response. Please try again.')
  }
}
