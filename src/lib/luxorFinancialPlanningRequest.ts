/** Read a bounded UTF-8 JSON body without buffering an unbounded request. */
export async function readPlanningJson(request: Request, limit = 16000): Promise<{ ok: true; value: unknown } | { ok: false; reason: 'invalid' | 'too_large' }> {
  const length = request.headers.get('content-length')
  if (length !== null && !/^\d+$/.test(length)) return { ok: false, reason: 'invalid' }
  if (length !== null && Number(length) > limit) return { ok: false, reason: 'too_large' }
  if (!request.body || request.bodyUsed) return { ok: false, reason: 'invalid' }
  let reader: ReadableStreamDefaultReader<Uint8Array>
  try { reader = request.body.getReader() } catch { return { ok: false, reason: 'invalid' } }
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel().catch(() => undefined); return { ok: false, reason: 'too_large' } }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  } catch { return { ok: false, reason: 'invalid' } }
  finally { reader.releaseLock() }
}
