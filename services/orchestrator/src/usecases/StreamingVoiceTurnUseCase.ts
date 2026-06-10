import {
  FALLBACK_REPLIES,
  SentenceBuffer,
  TtsChunkCache,
  TtsQueue,
  buildMergedAudioMetadata,
  createTtsCacheKey,
  normalizeTtsText,
  planTtsChunks,
  type EmotionResult,
  type LatencyReport,
  type Message,
  type PersonaConfig,
  type TTSResult,
  type AudioStitchMetadata,
  type TtsChunk,
  type VoiceTurnRequest
} from "@jarvis/shared";
import type { VoiceTurnDependencies } from "./VoiceTurnUseCase.js";
import { createTurnId } from "./VoiceTurnUseCase.js";
import { elapsedMs, measure, nowMs } from "../utils/time.js";

export type StreamingVoiceTurnEvent =
  | {
      type: "voice_turn_started";
      session_id: string;
      turn_id: string;
    }
  | {
      type: "transcript";
      turn_id: string;
      transcript: string;
    }
  | {
      type: "emotion";
      turn_id: string;
      emotion: EmotionResult;
    }
  | {
      type: "sentence";
      turn_id: string;
      sequence: number;
      sentence: string;
    }
  | {
      type: "audio_chunk";
      event: "audio_chunk";
      turn_id: string;
      chunk_id: string;
      sequence: number;
      sentence: string;
      audio_url?: string;
      is_final: boolean;
      tts_cache_hit?: boolean;
      latency: Pick<LatencyReport, "tts_ms" | "audio_encode_ms">;
    }
  | {
      type: "voice_turn_completed";
      session_id: string;
      turn_id: string;
      transcript: string;
      reply: string;
      latency: LatencyReport;
      audio_stitch?: AudioStitchMetadata;
      status: "ok" | "partial";
    }
  | {
      type: "voice_turn_failed";
      session_id: string;
      turn_id: string;
      reply: string;
      latency: LatencyReport;
      status: "error";
    };

type StreamingContext = {
  request: VoiceTurnRequest;
  turnId: string;
  startMs: number;
  transcript: string;
  recentMessages: Message[];
  emotion?: EmotionResult;
  replyParts: string[];
  latency: LatencyReport;
  audioStitch?: AudioStitchMetadata;
  status: "ok" | "partial" | "error";
};

function createLatency(): LatencyReport {
  return {
    vad_ms: 0,
    asr_ms: 0,
    emotion_ms: 0,
    llm_ms: 0,
    policy_ms: 0,
    tts_ms: 0,
    audio_encode_ms: 0,
    playback_delay_ms: 0,
    perceived_total_ms: 0,
    total_ms: 0
  };
}

export class StreamingVoiceTurnUseCase {
  private readonly chunkCache = new TtsChunkCache();

  constructor(private readonly deps: VoiceTurnDependencies) {}

  async *execute(request: VoiceTurnRequest, signal?: AbortSignal): AsyncGenerator<StreamingVoiceTurnEvent> {
    const context: StreamingContext = {
      request,
      turnId: createTurnId(),
      startMs: nowMs(),
      transcript: "",
      recentMessages: [],
      replyParts: [],
      latency: createLatency(),
      status: "ok"
    };

    this.deps.eventBus.emit("voice_turn_started", {
      sessionId: request.session_id,
      turnId: context.turnId
    });
    yield { type: "voice_turn_started", session_id: request.session_id, turn_id: context.turnId };

    try {
      const canContinue = await this.prepareTurn(context);
      if (!canContinue) {
        if (!signal?.aborted) {
          yield await this.completedEvent(context);
        }
        return;
      }

      if (signal?.aborted) {
        return;
      }
      yield { type: "transcript", turn_id: context.turnId, transcript: context.transcript };
      if (context.emotion) {
        yield { type: "emotion", turn_id: context.turnId, emotion: context.emotion };
      }

      if (this.deps.config.TTS_LONG_FORM_ENABLED) {
        yield* this.streamLongFormReplyToTts(context, signal);
      } else {
        yield* this.streamReplyToTts(context, signal);
      }
      if (!signal?.aborted) {
        yield await this.completedEvent(context);
      }
    } catch (error) {
      this.deps.logger.error({ error, turnId: context.turnId }, "streaming voice turn failed");
      context.status = "error";
      if (context.replyParts.length === 0) {
        context.replyParts.push(FALLBACK_REPLIES.policyRejected);
      }
      this.finalizeLatency(context);
      yield {
        type: "voice_turn_failed",
        session_id: request.session_id,
        turn_id: context.turnId,
        reply: context.replyParts.join(""),
        latency: context.latency,
        status: "error"
      };
    }
  }

  private async *streamReplyToTts(
    context: StreamingContext,
    signal?: AbortSignal
  ): AsyncGenerator<StreamingVoiceTurnEvent> {
    const input = this.llmInput(context);
    const buffer = new SentenceBuffer();
    const queue = new TtsQueue();
    const llmStart = nowMs();
    let sequence = 0;
    const tokenStream = this.deps.llm.stream ? this.deps.llm.stream(input) : this.fallbackTokenStream(input);

    for await (const token of tokenStream) {
      if (signal?.aborted) {
        queue.cancel(context.turnId);
        return;
      }
      for (const sentence of buffer.push(token)) {
        if (signal?.aborted) {
          queue.cancel(context.turnId);
          return;
        }
        yield* this.handleSentence(context, queue, sentence, sequence);
        sequence += 1;
      }
    }

    const remaining = buffer.flush();
    if (remaining) {
      if (signal?.aborted) {
        queue.cancel(context.turnId);
        return;
      }
      yield* this.handleSentence(context, queue, remaining, sequence);
    }
    context.latency.llm_ms = Math.max(context.latency.llm_ms, elapsedMs(llmStart));
  }

  private async *handleSentence(
    context: StreamingContext,
    queue: TtsQueue,
    rawSentence: string,
    sequence: number
  ): AsyncGenerator<StreamingVoiceTurnEvent> {
    const sentence = this.finalizeReply(context, rawSentence);
    if (!sentence) {
      return;
    }
    context.replyParts.push(sentence);
    queue.enqueue({
      chunkId: `${context.turnId}_chunk_${sequence}`,
      sentence,
      turnId: context.turnId,
      sequence
    });
    yield {
      type: "sentence",
      turn_id: context.turnId,
      sequence,
      sentence
    };

    const item = queue.dequeue(context.turnId);
    if (!item) {
      return;
    }

    const result = await measure(() =>
      this.deps.tts.synthesize({
        text: item.sentence,
        voiceId: "jarvis_default_zh_tw",
        turnId: item.turnId,
        speed: 1,
        ...(context.emotion ? { emotionStyle: context.emotion.label } : {})
      })
    );
    context.latency.tts_ms += result.value.upstreamTtsMs ?? Math.max(result.durationMs, result.value.durationMs);
    context.latency.audio_encode_ms += result.value.audioEncodeMs ?? 0;
    yield {
      type: "audio_chunk",
      event: "audio_chunk",
      turn_id: context.turnId,
      chunk_id: item.chunkId,
      sequence,
      sentence: item.sentence,
      ...(result.value.audioUrl ? { audio_url: result.value.audioUrl } : {}),
      is_final: true,
      ...(result.value.ttsCacheHit !== undefined ? { tts_cache_hit: result.value.ttsCacheHit } : {}),
      latency: {
        tts_ms: result.value.upstreamTtsMs ?? Math.max(result.durationMs, result.value.durationMs),
        audio_encode_ms: result.value.audioEncodeMs ?? 0
      }
    };
  }

  private async *streamLongFormReplyToTts(
    context: StreamingContext,
    signal?: AbortSignal
  ): AsyncGenerator<StreamingVoiceTurnEvent> {
    const llmStart = nowMs();
    const generated = await measure(() => this.deps.llm.generate(this.llmInput(context)));
    if (signal?.aborted) {
      return;
    }
    context.latency.llm_ms = Math.max(generated.durationMs, generated.value.durationMs);
    context.latency.tts_parallelism = this.deps.config.TTS_MAX_PARALLEL_CHUNKS;

    const reply = this.finalizeLongFormReply(context, generated.value.reply);
    if (!reply) {
      return;
    }
    context.replyParts.push(reply);
    context.latency.llm_ms = Math.max(context.latency.llm_ms, elapsedMs(llmStart));

    const plan = planTtsChunks(reply, context.turnId, {
      targetChunkSeconds: this.deps.config.TTS_TARGET_CHUNK_SECONDS
    });
    if (signal?.aborted) {
      return;
    }
    context.latency.tts_chunk_count = plan.chunks.length;
    context.latency.tts_cache_hit_count = 0;
    context.latency.tts_cache_miss_count = 0;

    const startedAt = nowMs();
    const ready = new Map<number, Awaited<ReturnType<StreamingVoiceTurnUseCase["synthesizeChunk"]>>>();
    const inFlight = new Set<Promise<void>>();
    let nextToStart = 0;
    let nextToYield = 0;
    let firstAudioSeen = false;

    const startNext = () => {
      if (signal?.aborted) {
        return;
      }
      while (nextToStart < plan.chunks.length && inFlight.size < this.deps.config.TTS_MAX_PARALLEL_CHUNKS) {
        const chunk = plan.chunks[nextToStart];
        nextToStart += 1;
        if (!chunk) {
          continue;
        }
        let task: Promise<void>;
        task = this.synthesizeChunk(context, chunk).then((result) => {
          ready.set(chunk.index, result);
        }).finally(() => {
          inFlight.delete(task);
        });
        inFlight.add(task);
      }
    };

    startNext();
    while (nextToYield < plan.chunks.length) {
      if (signal?.aborted) {
        break;
      }
      if (!ready.has(nextToYield)) {
        if (inFlight.size === 0) {
          break;
        }
        await Promise.race(inFlight);
        startNext();
        continue;
      }

      const result = ready.get(nextToYield);
      ready.delete(nextToYield);
      if (signal?.aborted) {
        break;
      }
      if (!result) {
        nextToYield += 1;
        continue;
      }
      if (!firstAudioSeen) {
        context.latency.tts_time_to_first_audio_ms = elapsedMs(startedAt);
        context.latency.playback_start_delay_ms = context.latency.tts_time_to_first_audio_ms;
        context.latency.tts_first_audio_ms = context.latency.tts_time_to_first_audio_ms;
        context.latency.playback_start_ms = context.latency.playback_start_delay_ms;
        context.latency.tts_first_chunk_cache_hit = result.cacheHit;
        firstAudioSeen = true;
      }
      context.latency.tts_ms += result.ttsMs;
      context.latency.audio_encode_ms += result.audioEncodeMs;
      context.latency.tts_total_synthesis_ms = elapsedMs(startedAt);
      context.latency.tts_cache_hit_count = (context.latency.tts_cache_hit_count ?? 0) + (result.cacheHit ? 1 : 0);
      context.latency.tts_cache_miss_count = (context.latency.tts_cache_miss_count ?? 0) + (result.cacheHit ? 0 : 1);

      yield {
        type: "audio_chunk",
        event: "audio_chunk",
        turn_id: context.turnId,
        chunk_id: result.chunk.chunkId,
        sequence: result.chunk.index,
        sentence: result.chunk.text,
        ...(result.tts.audioUrl ? { audio_url: result.tts.audioUrl } : {}),
        is_final: result.chunk.index === plan.chunks.length - 1,
        tts_cache_hit: result.cacheHit,
        latency: {
          tts_ms: result.ttsMs,
          audio_encode_ms: result.audioEncodeMs
        }
      };
      nextToYield += 1;
      startNext();
    }

    const mergeStart = nowMs();
    const mergedAudio = buildMergedAudioMetadata(
      plan.chunks.map((chunk) => ({ sequence: chunk.index, durationMs: chunk.estimatedDurationMs })),
      this.deps.config.TTS_SENTENCE_SILENCE_MS
    );
    context.audioStitch = {
      sample_rate_verified: mergedAudio.sampleRateVerified,
      normalized: mergedAudio.normalized,
      silence_padding_ms: mergedAudio.silencePaddingMs,
      total_duration_ms: mergedAudio.totalDurationMs
    };
    context.latency.tts_merge_ms = elapsedMs(mergeStart);
  }

  private async synthesizeChunk(context: StreamingContext, chunk: TtsChunk): Promise<{
    chunk: TtsChunk;
    tts: TTSResult;
    ttsMs: number;
    audioEncodeMs: number;
    cacheHit: boolean;
  }> {
    const normalizedText = normalizeTtsText(chunk.text);
    const speakerId = "jarvis_default_zh_tw";
    const voiceStyle = context.emotion?.label ?? "neutral";
    const cacheKey = await createTtsCacheKey({
      speakerId,
      normalizedText,
      voiceStyle,
      modelVersion: this.deps.config.TTS_MODEL_VERSION
    });
    const cached = this.chunkCache.get(cacheKey);
    if (cached) {
      return {
        chunk,
        tts: {
          ...(cached.audioUrl ? { audioUrl: cached.audioUrl } : {}),
          ...(cached.audioBase64 ? { audioBase64: cached.audioBase64 } : {}),
          ttsCacheHit: true,
          upstreamTtsMs: 0,
          audioEncodeMs: 0,
          normalizedText: cached.metadata.normalized_text,
          durationMs: cached.durationMs,
          format: "wav"
        },
        ttsMs: 0,
        audioEncodeMs: 0,
        cacheHit: true
      };
    }

    const result = await measure(() =>
      this.deps.tts.synthesize({
        text: normalizedText,
        voiceId: speakerId,
        turnId: context.turnId,
        speed: 1,
        ...(context.emotion ? { emotionStyle: context.emotion.label } : {})
      })
    );
    const ttsMs = result.value.upstreamTtsMs ?? Math.max(result.durationMs, result.value.durationMs);
    const audioEncodeMs = result.value.audioEncodeMs ?? 0;
    this.chunkCache.set(cacheKey, {
      ...(result.value.audioUrl ? { audioUrl: result.value.audioUrl } : {}),
      ...(result.value.audioBase64 ? { audioBase64: result.value.audioBase64 } : {}),
      durationMs: result.value.durationMs,
      metadata: {
        cache_hit: false,
        upstream_tts_ms: ttsMs,
        normalized_text: normalizedText,
        model_version: this.deps.config.TTS_MODEL_VERSION,
        speaker_id: speakerId
      }
    });
    return {
      chunk,
      tts: result.value,
      ttsMs,
      audioEncodeMs,
        cacheHit: false
      };
  }

  private async prepareTurn(context: StreamingContext): Promise<boolean> {
    if (!context.request.audio_base64.trim()) {
      context.status = "partial";
      context.replyParts.push(FALLBACK_REPLIES.noSpeech);
      return false;
    }

    const vadResult = await measure(() =>
      this.deps.vad.detect({
        audioFormat: context.request.audio_format,
        audioBase64: context.request.audio_base64,
        sessionId: context.request.session_id,
        turnId: context.turnId
      })
    );
    context.latency.vad_ms = vadResult.durationMs;
    if (!vadResult.value.hasSpeech) {
      context.status = "partial";
      context.replyParts.push(FALLBACK_REPLIES.noSpeech);
      return false;
    }

    const asrResult = await measure(() =>
      this.deps.asr.transcribe({
        audioFormat: context.request.audio_format,
        audioBase64: context.request.audio_base64,
        sessionId: context.request.session_id,
        turnId: context.turnId
      })
    );
    context.latency.asr_ms = Math.max(asrResult.durationMs, asrResult.value.durationMs);
    context.transcript = asrResult.value.text.trim();
    if (!context.transcript) {
      context.status = "partial";
      context.replyParts.push(FALLBACK_REPLIES.asrEmpty);
      return false;
    }

    context.recentMessages = await this.deps.conversationRepository.getRecentMessages(context.request.session_id);
    if (this.deps.config.ENABLE_EMOTION) {
      const emotionResult = await measure(() =>
        this.deps.emotion.classify({
          text: context.transcript,
          recentMessages: context.recentMessages,
          turnId: context.turnId
        })
      );
      context.latency.emotion_ms = Math.max(emotionResult.durationMs, emotionResult.value.durationMs ?? 0);
      context.emotion = emotionResult.value;
    }
    return true;
  }

  private llmInput(context: StreamingContext) {
    const persona: PersonaConfig = {
      name: "Jarvis",
      language: "zh-TW",
      tone: "calm_concise_intelligent_supportive",
      replyMinChars: 6,
      replyMaxChars: this.deps.config.REPLY_MAX_CHARS
    };
    const strategy =
      this.deps.config.ENABLE_EMOTION && context.emotion
        ? this.deps.emotionAwareStrategy
        : this.deps.conciseStrategy;
    const strategyInput = {
      userText: context.transcript,
      recentMessages: context.recentMessages,
      persona,
      ...(context.emotion ? { emotion: context.emotion } : {})
    };
    return {
      ...strategyInput,
      prompt: strategy.buildPrompt(strategyInput),
      turnId: context.turnId
    };
  }

  private async *fallbackTokenStream(input: ReturnType<StreamingVoiceTurnUseCase["llmInput"]>): AsyncIterable<string> {
    const result = await this.deps.llm.generate(input);
    yield result.reply;
  }

  private finalizeReply(context: StreamingContext, rawReply: string): string {
    const canonical = this.deps.responseCanonicalizer.canonicalize(rawReply, {
      userText: context.transcript,
      recentMessages: context.recentMessages,
      ...(context.emotion ? { emotion: context.emotion } : {})
    });
    const policyContext = {
      sessionId: context.request.session_id,
      userText: context.transcript,
      recentMessages: context.recentMessages,
      ...(context.emotion ? { emotion: context.emotion } : {})
    };
    const policyStart = nowMs();
    let policy = this.deps.responsePolicy.validate(canonical.reply, policyContext);
    if (!policy.accepted) {
      const repair = this.deps.responseRepair.repair({
        originalReply: canonical.reply,
        reason: policy.reason ?? "unknown",
        context: policyContext
      });
      policy = this.deps.responsePolicy.validate(repair.reply, policyContext);
    }
    context.latency.policy_ms += elapsedMs(policyStart);
    return this.deps.ttsTextFinalizer.finalize(policy.accepted ? policy.finalReply : FALLBACK_REPLIES.policyRejected);
  }

  private finalizeLongFormReply(context: StreamingContext, rawReply: string): string {
    const policyStart = nowMs();
    const text = rawReply
      .replace(/```[\s\S]*?```/g, "")
      .replace(/["']?(reply|content|text|assistant)["']?\s*[:：]\s*/gi, "")
      .replace(/[{}\[\]"'\\]/g, "")
      .replace(/[-*•#`_]/g, "")
      .replace(/\s+/g, "")
      .replace(/[!！]+/g, "。")
      .replace(/[?？]+/g, "？")
      .replace(/。{2,}/g, "。")
      .replace(/？{2,}/g, "？")
      .trim();
    context.latency.policy_ms += elapsedMs(policyStart);
    return text && !/[。！？?]$/.test(text) ? `${text}。` : text;
  }

  private async completedEvent(context: StreamingContext): Promise<StreamingVoiceTurnEvent> {
    const timestamp = new Date().toISOString();
    const reply = context.replyParts.join("");
    if (context.transcript) {
      await this.deps.conversationRepository.appendMessage(context.request.session_id, {
        role: "user",
        content: context.transcript,
        timestamp
      });
    }
    if (reply) {
      await this.deps.conversationRepository.appendMessage(context.request.session_id, {
        role: "assistant",
        content: reply,
        timestamp
      });
    }
    this.finalizeLatency(context);
    return {
      type: "voice_turn_completed",
      session_id: context.request.session_id,
      turn_id: context.turnId,
      transcript: context.transcript,
      reply,
      latency: context.latency,
      ...(context.audioStitch ? { audio_stitch: context.audioStitch } : {}),
      status: context.status === "error" ? "partial" : context.status
    };
  }

  private finalizeLatency(context: StreamingContext): void {
    const stageTotal =
      context.latency.vad_ms +
      context.latency.asr_ms +
      context.latency.emotion_ms +
      context.latency.llm_ms +
      context.latency.policy_ms +
      context.latency.tts_ms +
      context.latency.audio_encode_ms;
    context.latency.total_ms = Math.max(elapsedMs(context.startMs), stageTotal);
    context.latency.perceived_total_ms = context.latency.total_ms;
    this.applyV05LatencyAliases(context);
  }

  private applyV05LatencyAliases(context: StreamingContext): void {
    context.latency.llm_first_token_ms = context.latency.llm_first_token_ms ?? context.latency.llm_ms;
    context.latency.llm_total_ms = context.latency.llm_total_ms ?? context.latency.llm_ms;
    context.latency.tts_first_audio_ms =
      context.latency.tts_first_audio_ms ?? context.latency.tts_time_to_first_audio_ms ?? context.latency.tts_ms;
    context.latency.tts_total_ms =
      context.latency.tts_total_ms ?? context.latency.tts_total_synthesis_ms ?? context.latency.tts_ms;
    context.latency.playback_ms = context.latency.playback_delay_ms;
    context.latency.playback_start_ms =
      context.latency.playback_start_ms ?? context.latency.playback_start_delay_ms ?? context.latency.playback_delay_ms;
    context.latency.tts_cache_hit =
      context.latency.tts_first_chunk_cache_hit ?? ((context.latency.tts_cache_hit_count ?? 0) > 0);
    context.latency.tts_parallel_chunks =
      context.latency.tts_parallel_chunks ?? context.latency.tts_chunk_count ?? (context.latency.tts_ms > 0 ? 1 : 0);
  }
}
