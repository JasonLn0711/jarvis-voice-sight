export function createSilentWavBuffer(durationMs = 240, sampleRate = 16000): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const dataSize = samples * 2;
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

  return buffer;
}

export function createToneWavBuffer(durationMs = 240, sampleRate = 16000, amplitude = 8000): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const dataSize = samples * 2;
  const buffer = createSilentWavBuffer(durationMs, sampleRate);
  for (let index = 0; index < samples; index += 1) {
    const value = Math.round(Math.sin((index / sampleRate) * Math.PI * 2 * 440) * amplitude);
    buffer.writeInt16LE(value, 44 + index * 2);
  }
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}
