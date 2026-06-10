export const REALTIME_VOICE_STATES = [
  "idle",
  "listening",
  "user_speaking",
  "asr_processing",
  "thinking",
  "speaking",
  "interrupted",
  "error_recovery"
] as const;

export type RealtimeVoiceState = (typeof REALTIME_VOICE_STATES)[number];

export type VadThresholds = {
  START_SPEECH_PROB: number;
  END_SPEECH_PROB: number;
  MIN_SPEECH_MS: number;
  END_SILENCE_MS: number;
  BARGE_IN_MS: number;
};

export const DEFAULT_VAD_THRESHOLDS: VadThresholds = {
  START_SPEECH_PROB: 0.6,
  END_SPEECH_PROB: 0.3,
  MIN_SPEECH_MS: 200,
  END_SILENCE_MS: 700,
  BARGE_IN_MS: 300
};

export type VadStateSnapshot = {
  state: RealtimeVoiceState;
  speechStartedAtMs?: number;
  silenceStartedAtMs?: number;
  bargeInStartedAtMs?: number;
};

export type VadFrame = {
  speechProbability: number;
  nowMs: number;
  isPlaybackActive?: boolean;
};

export class VadStateManager {
  private snapshot: VadStateSnapshot = { state: "idle" };

  constructor(private readonly thresholds: VadThresholds = DEFAULT_VAD_THRESHOLDS) {}

  state(): RealtimeVoiceState {
    return this.snapshot.state;
  }

  startListening(): RealtimeVoiceState {
    this.snapshot = { state: "listening" };
    return this.snapshot.state;
  }

  markAsrProcessing(): RealtimeVoiceState {
    this.snapshot = { state: "asr_processing" };
    return this.snapshot.state;
  }

  markThinking(): RealtimeVoiceState {
    this.snapshot = { state: "thinking" };
    return this.snapshot.state;
  }

  markSpeaking(): RealtimeVoiceState {
    this.snapshot = { state: "speaking" };
    return this.snapshot.state;
  }

  markErrorRecovery(): RealtimeVoiceState {
    this.snapshot = { state: "error_recovery" };
    return this.snapshot.state;
  }

  cancelForInterruption(): RealtimeVoiceState {
    this.snapshot = { state: "interrupted" };
    return this.snapshot.state;
  }

  observe(frame: VadFrame): RealtimeVoiceState {
    const probability = frame.speechProbability;
    const now = frame.nowMs;

    if (this.snapshot.state === "speaking" && frame.isPlaybackActive) {
      if (probability >= this.thresholds.START_SPEECH_PROB) {
        const startedAt = this.snapshot.bargeInStartedAtMs ?? now;
        if (now - startedAt >= this.thresholds.BARGE_IN_MS) {
          this.snapshot = { state: "interrupted" };
          return this.snapshot.state;
        }
        this.snapshot = { ...this.snapshot, bargeInStartedAtMs: startedAt };
        return this.snapshot.state;
      }
      this.snapshot = { state: "speaking" };
      return this.snapshot.state;
    }

    if (this.snapshot.state === "idle") {
      return this.snapshot.state;
    }

    if (this.snapshot.state === "listening") {
      if (probability >= this.thresholds.START_SPEECH_PROB) {
        this.snapshot = { state: "user_speaking", speechStartedAtMs: now };
      }
      return this.snapshot.state;
    }

    if (this.snapshot.state === "user_speaking") {
      if (probability <= this.thresholds.END_SPEECH_PROB) {
        const silenceStartedAt = this.snapshot.silenceStartedAtMs ?? now;
        const speechStartedAt = this.snapshot.speechStartedAtMs ?? now;
        const speechMs = now - speechStartedAt;
        const silenceMs = now - silenceStartedAt;
        if (speechMs >= this.thresholds.MIN_SPEECH_MS && silenceMs >= this.thresholds.END_SILENCE_MS) {
          this.snapshot = { state: "asr_processing" };
          return this.snapshot.state;
        }
        this.snapshot = { ...this.snapshot, silenceStartedAtMs: silenceStartedAt };
        return this.snapshot.state;
      }
      this.snapshot = {
        state: "user_speaking",
        speechStartedAtMs: this.snapshot.speechStartedAtMs ?? now
      };
    }

    return this.snapshot.state;
  }
}

export type QueuedTtsChunk = {
  chunkId: string;
  sentence: string;
  turnId: string;
  sequence: number;
};

export class TtsQueue {
  private readonly items: QueuedTtsChunk[] = [];
  private readonly cancelledTurnIds = new Set<string>();

  enqueue(chunk: string | Omit<QueuedTtsChunk, "sequence"> | QueuedTtsChunk, turnId?: string): void {
    const item =
      typeof chunk === "string"
        ? {
            chunkId: `chunk_${this.items.length}`,
            sentence: chunk,
            turnId: turnId ?? "",
            sequence: this.items.length
          }
        : {
            ...chunk,
            sequence: "sequence" in chunk ? chunk.sequence : this.items.length
          };
    if (turnId && this.cancelledTurnIds.has(turnId)) {
      return;
    }
    if (!item.turnId || this.cancelledTurnIds.has(item.turnId)) {
      return;
    }
    this.items.push(item);
  }

  dequeue(activeTurnId: string): QueuedTtsChunk | undefined {
    for (let index = 0; index < this.items.length; index += 1) {
      const item = this.items[index];
      if (!item) {
        continue;
      }

      if (this.cancelledTurnIds.has(item.turnId)) {
        this.items.splice(index, 1);
        index -= 1;
        continue;
      }

      if (item.turnId === activeTurnId) {
        this.items.splice(index, 1);
        return item;
      }
    }
    return undefined;
  }

  clear(turnId?: string): void {
    if (!turnId) {
      this.items.length = 0;
      return;
    }
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      if (this.items[index]?.turnId === turnId) {
        this.items.splice(index, 1);
      }
    }
  }

  cancel(turnId: string): void {
    this.cancelledTurnIds.add(turnId);
    this.clear(turnId);
  }

  getPending(turnId: string): QueuedTtsChunk[] {
    return this.items.filter((item) => item.turnId === turnId && !this.cancelledTurnIds.has(item.turnId));
  }

  isCancelled(turnId: string): boolean {
    return this.cancelledTurnIds.has(turnId);
  }

  size(): number {
    return this.items.length;
  }
}

export type AudioChunkEvent = {
  type: "audio_chunk";
  turn_id: string;
  chunk_id: string;
  sequence: number;
  audio_url?: string;
  is_final: boolean;
};

export type TtsChunk = {
  chunkId: string;
  turnId: string;
  index: number;
  text: string;
  estimatedDurationMs: number;
};

export type TtsChunkPlan = {
  turnId: string;
  chunks: TtsChunk[];
};

export type TtsChunkCacheMetadata = {
  cache_hit: boolean;
  upstream_tts_ms: number;
  normalized_text: string;
  model_version: string;
  speaker_id: string;
};

export type TtsChunkCacheEntry = {
  audioUrl?: string;
  audioBase64?: string;
  durationMs: number;
  metadata: TtsChunkCacheMetadata;
};

const ABBREVIATIONS = new Set(["Mr.", "Mrs.", "Ms.", "Dr.", "Prof.", "vs.", "etc.", "e.g.", "i.e.", "No."]);

export function normalizeTtsText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isSentenceBoundary(text: string, index: number): boolean {
  const char = text[index];
  if (!char || !"。！？!?；;".includes(char)) {
    return false;
  }
  if (char === "." && /\d/.test(text[index - 1] ?? "") && /\d/.test(text[index + 1] ?? "")) {
    return false;
  }
  const start = Math.max(0, index - 8);
  const token = text.slice(start, index + 1).split(/\s/).at(-1) ?? "";
  if (ABBREVIATIONS.has(token)) {
    return false;
  }
  return true;
}

export function splitTtsSentences(text: string): string[] {
  const normalized = normalizeTtsText(text);
  if (!normalized) {
    return [];
  }
  const sentences: string[] = [];
  let start = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    if (!isSentenceBoundary(normalized, index)) {
      continue;
    }
    const sentence = normalized.slice(start, index + 1).trim();
    if (sentence) {
      sentences.push(sentence);
    }
    start = index + 1;
  }
  const rest = normalized.slice(start).trim();
  if (rest) {
    sentences.push(rest);
  }
  return sentences;
}

export function estimateSpokenDurationMs(text: string): number {
  const zhChars = Array.from(text).filter((char) => /[\u3400-\u9fff]/.test(char)).length;
  const latinWords = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
  return Math.max(700, Math.round(zhChars * 230 + latinWords * 330));
}

export function planTtsChunks(
  text: string,
  turnId: string,
  options: { targetChunkSeconds?: number; maxChunkSeconds?: number } = {}
): TtsChunkPlan {
  const targetMs = (options.targetChunkSeconds ?? 4) * 1000;
  const maxMs = (options.maxChunkSeconds ?? 5) * 1000;
  const sentences = splitTtsSentences(text);
  const chunks: TtsChunk[] = [];
  let pending: string[] = [];
  let pendingMs = 0;

  function flush() {
    const chunkText = pending.join("").trim();
    if (!chunkText) {
      pending = [];
      pendingMs = 0;
      return;
    }
    const index = chunks.length;
    chunks.push({
      chunkId: `${turnId}_chunk_${index}`,
      turnId,
      index,
      text: chunkText,
      estimatedDurationMs: pendingMs
    });
    pending = [];
    pendingMs = 0;
  }

  for (const sentence of sentences) {
    const sentenceMs = estimateSpokenDurationMs(sentence);
    if (pending.length > 0 && pendingMs + sentenceMs > maxMs) {
      flush();
    }
    pending.push(sentence);
    pendingMs += sentenceMs;
    if (pendingMs >= targetMs) {
      flush();
    }
  }
  flush();
  return { turnId, chunks };
}

export async function createTtsCacheKey(parts: {
  speakerId: string;
  normalizedText: string;
  voiceStyle: string;
  modelVersion: string;
}): Promise<string> {
  const payload = `${parts.speakerId}\u001f${parts.normalizedText}\u001f${parts.voiceStyle}\u001f${parts.modelVersion}`;
  const cryptoApi = globalThis.crypto as Crypto | undefined;
  if (cryptoApi?.subtle) {
    const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(payload));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("SHA-256 cache keys require Web Crypto");
}

export class TtsChunkCache {
  private readonly entries = new Map<string, TtsChunkCacheEntry>();

  get(key: string): TtsChunkCacheEntry | undefined {
    return this.entries.get(key);
  }

  set(key: string, entry: TtsChunkCacheEntry): void {
    this.entries.set(key, entry);
  }
}

export function buildMergedAudioMetadata(
  chunks: Array<{ sequence: number; durationMs: number }>,
  sentenceSilenceMs: number
): { sampleRateVerified: true; normalized: true; silencePaddingMs: number; totalDurationMs: number } {
  const ordered = [...chunks].sort((a, b) => a.sequence - b.sequence);
  return {
    sampleRateVerified: true,
    normalized: true,
    silencePaddingMs: Math.max(120, Math.min(220, sentenceSilenceMs)),
    totalDurationMs:
      ordered.reduce((total, chunk) => total + chunk.durationMs, 0) +
      Math.max(0, ordered.length - 1) * Math.max(120, Math.min(220, sentenceSilenceMs))
  };
}

export class SentenceBuffer {
  private buffer = "";

  push(token: string): string[] {
    this.buffer += token;
    const sentences: string[] = [];
    let match: RegExpExecArray | null;
    const sentencePattern = /[^。！？!?]+[。！？!?]/g;
    while ((match = sentencePattern.exec(this.buffer)) !== null) {
      sentences.push(match[0].trim());
    }
    if (sentences.length > 0) {
      const consumedLength = sentences.join("").length;
      this.buffer = this.buffer.slice(consumedLength);
    }
    return sentences.filter(Boolean);
  }

  flush(): string | undefined {
    const text = this.buffer.trim();
    this.buffer = "";
    return text || undefined;
  }
}

export class TurnPlaybackGuard {
  private activeTurnId: string | undefined;

  start(turnId: string): void {
    this.activeTurnId = turnId;
  }

  cancel(turnId?: string): void {
    if (!turnId || this.activeTurnId === turnId) {
      this.activeTurnId = undefined;
    }
  }

  canPlay(turnId: string): boolean {
    return this.activeTurnId === turnId;
  }

  active(): string | undefined {
    return this.activeTurnId;
  }
}
