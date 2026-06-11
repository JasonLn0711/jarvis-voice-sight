export type ParsedPcmWav = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  samples: Int16Array;
};

export type StitchedAudio = {
  buffer: Buffer;
  sampleRate: number;
  normalized: true;
  silencePaddingMs: number;
  totalDurationMs: number;
  chunkCount: number;
};

function readAscii(buffer: Buffer, offset: number, length: number): string {
  return buffer.subarray(offset, offset + length).toString("ascii");
}

export function parsePcm16Wav(buffer: Buffer): ParsedPcmWav {
  if (buffer.length < 44 || readAscii(buffer, 0, 4) !== "RIFF" || readAscii(buffer, 8, 4) !== "WAVE") {
    throw new Error("Expected RIFF/WAVE audio");
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataStart = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = readAscii(buffer, offset, 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt ") {
      const audioFormat = buffer.readUInt16LE(chunkStart);
      channels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
      if (audioFormat !== 1 || bitsPerSample !== 16 || channels < 1) {
        throw new Error("Only PCM 16-bit WAV audio is supported");
      }
    } else if (chunkId === "data") {
      dataStart = chunkStart;
      dataSize = chunkSize;
      break;
    }
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!sampleRate || !channels || dataStart < 0 || dataSize <= 0) {
    throw new Error("WAV audio is missing fmt or data chunks");
  }

  const frameCount = Math.floor(dataSize / 2 / channels);
  const samples = new Int16Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let total = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      total += buffer.readInt16LE(dataStart + (frame * channels + channel) * 2);
    }
    samples[frame] = Math.round(total / channels);
  }

  return { sampleRate, channels, bitsPerSample, samples };
}

export function createPcm16WavBuffer(samples: Int16Array, sampleRate: number): Buffer {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index] ?? 0, 44 + index * 2);
  }
  return buffer;
}

function clampInt16(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value)));
}

export function stitchNormalizePcm16Wavs(buffers: Buffer[], sentenceSilenceMs: number): StitchedAudio {
  if (buffers.length === 0) {
    throw new Error("Cannot stitch audio without chunks");
  }

  const parsed = buffers.map(parsePcm16Wav);
  const sampleRate = parsed[0]?.sampleRate;
  if (!sampleRate) {
    throw new Error("Cannot determine sample rate");
  }
  for (const chunk of parsed) {
    if (chunk.sampleRate !== sampleRate) {
      throw new Error(`Mismatched WAV sample rate: ${chunk.sampleRate} != ${sampleRate}`);
    }
  }

  const silencePaddingMs = Math.max(120, Math.min(220, sentenceSilenceMs));
  const silenceSamples = Math.round((silencePaddingMs / 1000) * sampleRate);
  const totalSamples =
    parsed.reduce((total, chunk) => total + chunk.samples.length, 0) +
    Math.max(0, parsed.length - 1) * silenceSamples;
  const merged = new Int16Array(totalSamples);
  let cursor = 0;
  for (let index = 0; index < parsed.length; index += 1) {
    merged.set(parsed[index]?.samples ?? new Int16Array(), cursor);
    cursor += parsed[index]?.samples.length ?? 0;
    if (index < parsed.length - 1) {
      cursor += silenceSamples;
    }
  }

  let peak = 0;
  for (const sample of merged) {
    peak = Math.max(peak, Math.abs(sample));
  }
  const targetPeak = Math.round(32767 * 0.9);
  const gain = peak > 0 ? targetPeak / peak : 1;
  const normalized = new Int16Array(merged.length);
  for (let index = 0; index < merged.length; index += 1) {
    normalized[index] = clampInt16((merged[index] ?? 0) * gain);
  }

  return {
    buffer: createPcm16WavBuffer(normalized, sampleRate),
    sampleRate,
    normalized: true,
    silencePaddingMs,
    totalDurationMs: Math.round((normalized.length / sampleRate) * 1000),
    chunkCount: buffers.length
  };
}
