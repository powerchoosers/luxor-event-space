import 'server-only'

import { MPEGDecoder } from 'mpg123-decoder'

export type DecodedDualChannelAudio = {
  sampleRate: number
  channels: [Float32Array, Float32Array]
  durationSeconds: number
}

export async function decodeStereoMp3(buffer: ArrayBuffer): Promise<DecodedDualChannelAudio> {
  const decoder = new MPEGDecoder()
  await decoder.ready
  try {
    const { channelData, sampleRate, samplesDecoded } = decoder.decode(new Uint8Array(buffer))
    const left = channelData[0] ?? new Float32Array(0)
    const right = channelData[1] ?? left
    const durationSeconds = sampleRate > 0 ? samplesDecoded / sampleRate : 0
    return { sampleRate, channels: [left, right], durationSeconds }
  } finally {
    decoder.free()
  }
}

export function sliceChannelToWav(
  audio: DecodedDualChannelAudio,
  channelIndex: 0 | 1,
  startSeconds: number,
  endSeconds: number,
): Buffer {
  const { sampleRate, channels } = audio
  const channel = channels[channelIndex]
  const startSample = Math.max(0, Math.floor(startSeconds * sampleRate))
  const endSample = Math.min(channel.length, Math.ceil(endSeconds * sampleRate))
  if (endSample <= startSample) return encodeMonoWav(new Float32Array(0), sampleRate)
  return encodeMonoWav(channel.subarray(startSample, endSample), sampleRate)
}

function encodeMonoWav(samples: Float32Array, sampleRate: number): Buffer {
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    pcm[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  const dataSize = pcm.length * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(buffer, 44)
  return buffer
}