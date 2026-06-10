import {
  ASREmptyTranscriptError,
  ASRTimeoutError,
  FALLBACK_REPLIES,
  LLMTimeoutError,
  TTSTimeoutError,
  type ASRResult,
  type ChatResult,
  type EmotionResult,
  type LatencyReport,
  type Message,
  type PersonaConfig,
  type TTSResult,
  type VoiceTurnRequest,
  type VoiceTurnResponse,
  type VoiceTurnStatus
} from "@jarvis/shared";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env.js";
import type { CircuitBreaker } from "../domain/CircuitBreaker.js";
import type { EventBus } from "../events/EventBus.js";
import type { ResponseCanonicalizer } from "../policy/ResponseCanonicalizer.js";
import type { ResponseRepairEngine } from "../policy/ResponseRepairEngine.js";
import type { ResponsePolicyEngine } from "../policy/ResponsePolicyEngine.js";
import type {
  ASRPort,
  EmotionPort,
  LLMPort,
  TTSPort,
  VADPort
} from "../ports/modelPorts.js";
import type { ConversationRepository } from "../repositories/ConversationRepository.js";
import type { ResponseStrategy } from "../strategies/ResponseStrategy.js";
import { elapsedMs, measure, nowMs } from "../utils/time.js";

export type VoiceTurnDependencies = {
  config: AppConfig;
  logger: Logger;
  eventBus: EventBus;
  vad: VADPort;
  asr: ASRPort;
  llm: LLMPort;
  tts: TTSPort;
  emotion: EmotionPort;
  conversationRepository: ConversationRepository;
  responseCanonicalizer: ResponseCanonicalizer;
  responsePolicy: ResponsePolicyEngine;
  responseRepair: ResponseRepairEngine;
  conciseStrategy: ResponseStrategy;
  emotionAwareStrategy: ResponseStrategy;
  breakers: {
    asr: CircuitBreaker;
    llm: CircuitBreaker;
    tts: CircuitBreaker;
    emotion: CircuitBreaker;
  };
};

type PipelineContext = {
  request: VoiceTurnRequest;
  turnId: string;
  startMs: number;
  transcript: string;
  recentMessages: Message[];
  emotion?: EmotionResult;
  llmResult?: ChatResult;
  ttsResult?: TTSResult;
  reply: string;
  status: VoiceTurnStatus;
  latency: LatencyReport;
  shortCircuit: boolean;
};

interface VoiceTurnStep {
  readonly name: string;
  run(context: PipelineContext): Promise<void>;
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function turnId(): string {
  return `turn_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

abstract class BaseStep implements VoiceTurnStep {
  abstract readonly name: string;

  constructor(protected readonly deps: VoiceTurnDependencies) {}

  abstract run(context: PipelineContext): Promise<void>;
}

export class ValidateAudioStep extends BaseStep {
  readonly name = "ValidateAudioStep";

  async run(context: PipelineContext): Promise<void> {
    if (!context.request.audio_base64.trim()) {
      context.reply = FALLBACK_REPLIES.noSpeech;
      context.status = "partial";
      context.shortCircuit = true;
    }
  }
}

export class VADStep extends BaseStep {
  readonly name = "VADStep";

  async run(context: PipelineContext): Promise<void> {
    const result = await measure(() =>
      this.deps.vad.detect({
        audioFormat: context.request.audio_format,
        audioBase64: context.request.audio_base64,
        sessionId: context.request.session_id
      })
    );
    context.latency.vad_ms = result.durationMs;
    if (!result.value.hasSpeech) {
      context.reply = FALLBACK_REPLIES.noSpeech;
      context.status = "partial";
      context.shortCircuit = true;
    }
  }
}

export class ASRStep extends BaseStep {
  readonly name = "ASRStep";

  async run(context: PipelineContext): Promise<void> {
    const breaker = this.deps.breakers.asr;
    if (!breaker.canCall()) {
      context.reply = FALLBACK_REPLIES.asrEmpty;
      context.status = "partial";
      context.shortCircuit = true;
      return;
    }

    try {
      const result = await measure(() =>
        this.deps.asr.transcribe({
          audioFormat: context.request.audio_format,
          audioBase64: context.request.audio_base64,
          sessionId: context.request.session_id
        })
      );
      context.latency.asr_ms = Math.max(result.durationMs, result.value.durationMs);
      if (!result.value.text.trim()) {
        throw new ASREmptyTranscriptError("empty transcript");
      }
      context.transcript = result.value.text.trim();
      breaker.recordSuccess();
      this.deps.eventBus.emit("asr_completed", {
        sessionId: context.request.session_id,
        turnId: context.turnId,
        durationMs: result.durationMs
      });
    } catch (error) {
      breaker.recordFailure();
      context.latency.asr_ms ||= error instanceof ASRTimeoutError ? this.deps.config.ASR_TIMEOUT_MS : 0;
      context.reply = FALLBACK_REPLIES.asrEmpty;
      context.status = "partial";
      context.shortCircuit = true;
    }
  }
}

export class ContextStep extends BaseStep {
  readonly name = "ContextStep";

  async run(context: PipelineContext): Promise<void> {
    context.recentMessages = await this.deps.conversationRepository.getRecentMessages(context.request.session_id);
  }
}

export class EmotionStep extends BaseStep {
  readonly name = "EmotionStep";

  async run(context: PipelineContext): Promise<void> {
    if (!this.deps.config.ENABLE_EMOTION || !context.transcript) {
      return;
    }
    const breaker = this.deps.breakers.emotion;
    if (!breaker.canCall()) {
      return;
    }
    try {
      const result = await measure(() =>
        this.deps.emotion.classify({
          text: context.transcript,
          recentMessages: context.recentMessages
        })
      );
      context.latency.emotion_ms = Math.max(result.durationMs, result.value.durationMs ?? 0);
      context.emotion = result.value;
      breaker.recordSuccess();
      this.deps.eventBus.emit("emotion_completed", {
        sessionId: context.request.session_id,
        turnId: context.turnId,
        durationMs: result.durationMs,
        metadata: { label: result.value.label }
      });
    } catch {
      breaker.recordFailure();
      context.latency.emotion_ms = this.deps.config.EMOTION_TIMEOUT_MS;
    }
  }
}

export class LLMStep extends BaseStep {
  readonly name = "LLMStep";

  async run(context: PipelineContext): Promise<void> {
    const breaker = this.deps.breakers.llm;
    if (!breaker.canCall()) {
      context.reply = FALLBACK_REPLIES.llmTimeout;
      context.status = "partial";
      return;
    }
    try {
      const strategy =
        this.deps.config.ENABLE_EMOTION && context.emotion
          ? this.deps.emotionAwareStrategy
          : this.deps.conciseStrategy;
      const persona: PersonaConfig = {
        name: "Jarvis",
        language: "zh-TW",
        tone: "calm_concise_intelligent_supportive",
        replyMinChars: 6,
        replyMaxChars: this.deps.config.REPLY_MAX_CHARS
      };
      const strategyInput = {
        userText: context.transcript,
        recentMessages: context.recentMessages,
        persona,
        ...(context.emotion ? { emotion: context.emotion } : {})
      };
      const prompt = strategy.buildPrompt(strategyInput);
      const llmInput = {
        ...strategyInput,
        prompt
      };
      const result = await measure(() =>
        this.deps.llm.generate(llmInput)
      );
      context.latency.llm_ms = Math.max(result.durationMs, result.value.durationMs);
      context.llmResult = result.value;
      context.reply = result.value.reply;
      breaker.recordSuccess();
      this.deps.eventBus.emit("llm_completed", {
        sessionId: context.request.session_id,
        turnId: context.turnId,
        durationMs: result.durationMs
      });
    } catch (error) {
      breaker.recordFailure();
      context.latency.llm_ms = error instanceof LLMTimeoutError ? this.deps.config.LLM_TIMEOUT_MS : 0;
      context.reply = FALLBACK_REPLIES.llmTimeout;
      context.status = "partial";
    }
  }
}

export class CanonicalizeStep extends BaseStep {
  readonly name = "CanonicalizeStep";

  async run(context: PipelineContext): Promise<void> {
    if (!context.reply) {
      return;
    }
    const result = this.deps.responseCanonicalizer.canonicalize(context.reply, {
      userText: context.transcript,
      recentMessages: context.recentMessages,
      ...(context.emotion ? { emotion: context.emotion } : {})
    });
    if (result.changed) {
      this.deps.logger.info(
        {
          sessionId: context.request.session_id,
          turnId: context.turnId,
          original_reply: context.reply,
          canonical_reply: result.reply,
          reason: result.reason
        },
        "response canonicalized"
      );
      context.reply = result.reply;
    }
  }
}

export class PolicyStep extends BaseStep {
  readonly name = "PolicyStep";

  async run(context: PipelineContext): Promise<void> {
    const start = nowMs();
    const policyContext = {
      sessionId: context.request.session_id,
      userText: context.transcript,
      recentMessages: context.recentMessages,
      ...(context.emotion ? { emotion: context.emotion } : {})
    };
    let result = this.deps.responsePolicy.validate(context.reply, policyContext);
    if (!result.accepted) {
      const repair = this.deps.responseRepair.repair({
        originalReply: context.reply,
        reason: result.reason ?? "unknown",
        context: {
          sessionId: context.request.session_id,
          userText: context.transcript,
          recentMessages: context.recentMessages,
          ...(context.emotion ? { emotion: context.emotion } : {})
        }
      });
      result = this.deps.responsePolicy.validate(repair.reply, policyContext);
      if (!result.accepted) {
        result = {
          accepted: false,
          finalReply: FALLBACK_REPLIES.policyRejected,
          ...(result.reason ? { reason: result.reason } : {})
        };
      }
    }
    context.latency.policy_ms = elapsedMs(start);
    context.reply = result.finalReply;
    if (!result.accepted && result.finalReply === FALLBACK_REPLIES.policyRejected) {
      context.status = "partial";
    }
  }
}

export class TTSStep extends BaseStep {
  readonly name = "TTSStep";

  async run(context: PipelineContext): Promise<void> {
    if (!context.reply) {
      return;
    }
    const breaker = this.deps.breakers.tts;
    if (!breaker.canCall()) {
      context.status = "partial";
      return;
    }
    try {
      const ttsInput = {
        text: context.reply,
        voiceId: "jarvis_default_zh_tw",
        speed: 1,
        ...(context.emotion ? { emotionStyle: context.emotion.label } : {})
      };
      const result = await measure(() =>
        this.deps.tts.synthesize(ttsInput)
      );
      context.latency.tts_ms = result.value.upstreamTtsMs ?? Math.max(result.durationMs, result.value.durationMs);
      context.latency.audio_encode_ms = result.value.audioEncodeMs ?? 0;
      context.ttsResult = result.value;
      breaker.recordSuccess();
      this.deps.logger.info(
        {
          sessionId: context.request.session_id,
          turnId: context.turnId,
          tts_cache_hit: result.value.ttsCacheHit ?? false,
          upstream_tts_ms: result.value.upstreamTtsMs ?? 0,
          audio_encode_ms: result.value.audioEncodeMs ?? 0,
          total_tts_ms: result.value.durationMs
        },
        "tts stage completed"
      );
      this.deps.eventBus.emit("tts_completed", {
        sessionId: context.request.session_id,
        turnId: context.turnId,
        durationMs: result.durationMs
      });
    } catch (error) {
      breaker.recordFailure();
      context.latency.tts_ms = error instanceof TTSTimeoutError ? this.deps.config.TTS_TIMEOUT_MS : 0;
      context.status = "partial";
    }
  }
}

export class PersistStep extends BaseStep {
  readonly name = "PersistStep";

  async run(context: PipelineContext): Promise<void> {
    const timestamp = new Date().toISOString();
    if (context.transcript) {
      await this.deps.conversationRepository.appendMessage(context.request.session_id, {
        role: "user",
        content: context.transcript,
        timestamp
      });
    }
    if (context.reply) {
      await this.deps.conversationRepository.appendMessage(context.request.session_id, {
        role: "assistant",
        content: context.reply,
        timestamp
      });
    }
  }
}

export class PlaybackDelayStep extends BaseStep {
  readonly name = "PlaybackDelayStep";

  async run(context: PipelineContext): Promise<void> {
    if (!this.deps.config.ENABLE_PLAYBACK_DELAY || !context.ttsResult?.audioUrl || context.status === "error") {
      return;
    }
    const minMs = this.deps.config.PLAYBACK_DELAY_MIN_MS;
    const maxMs = Math.max(minMs, this.deps.config.PLAYBACK_DELAY_MAX_MS);
    const targetMs = randomInt(minMs, maxMs);
    const currentMs = this.currentPipelineLatency(context);
    const delayMs = Math.max(0, targetMs - currentMs);
    context.latency.playback_delay_ms = delayMs;
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  private currentPipelineLatency(context: PipelineContext): number {
    return (
      context.latency.vad_ms +
      context.latency.asr_ms +
      context.latency.emotion_ms +
      context.latency.llm_ms +
      context.latency.policy_ms +
      context.latency.tts_ms +
      context.latency.audio_encode_ms
    );
  }
}

export class VoiceTurnUseCase {
  private readonly steps: VoiceTurnStep[];

  constructor(private readonly deps: VoiceTurnDependencies) {
    this.steps = [
      new ValidateAudioStep(deps),
      new VADStep(deps),
      new ASRStep(deps),
      new ContextStep(deps),
      new EmotionStep(deps),
      new LLMStep(deps),
      new CanonicalizeStep(deps),
      new PolicyStep(deps),
      new TTSStep(deps),
      new PersistStep(deps),
      new PlaybackDelayStep(deps)
    ];
  }

  async execute(request: VoiceTurnRequest): Promise<VoiceTurnResponse> {
    const context: PipelineContext = {
      request,
      turnId: turnId(),
      startMs: nowMs(),
      transcript: "",
      recentMessages: [],
      reply: "",
      status: "ok",
      latency: createLatency(),
      shortCircuit: false
    };

    this.deps.eventBus.emit("voice_turn_started", {
      sessionId: request.session_id,
      turnId: context.turnId
    });

    try {
      for (const step of this.steps) {
        await step.run(context);
        if (context.shortCircuit) {
          break;
        }
      }
      context.latency.total_ms = this.totalLatency(context);
      context.latency.perceived_total_ms = context.latency.total_ms + context.latency.playback_delay_ms;
      const response = this.toResponse(context);
      this.deps.logger.info(
        {
          sessionId: context.request.session_id,
          turnId: context.turnId,
          latency: response.latency,
          tts_cache_hit: response.tts_cache_hit ?? false,
          status: response.status
        },
        "voice turn latency"
      );
      this.deps.eventBus.emit("voice_turn_completed", {
        sessionId: request.session_id,
        turnId: context.turnId,
        durationMs: response.latency.total_ms,
        metadata: { status: response.status }
      });
      return response;
    } catch (error) {
      this.deps.logger.error({ error }, "voice turn failed");
      context.status = "error";
      context.reply = context.reply || FALLBACK_REPLIES.policyRejected;
      context.latency.total_ms = this.totalLatency(context);
      context.latency.perceived_total_ms = context.latency.total_ms + context.latency.playback_delay_ms;
      this.deps.eventBus.emit("voice_turn_failed", {
        sessionId: request.session_id,
        turnId: context.turnId,
        durationMs: context.latency.total_ms
      });
      return this.toResponse(context);
    }
  }

  private toResponse(context: PipelineContext): VoiceTurnResponse {
    return {
      session_id: context.request.session_id,
      turn_id: context.turnId,
      transcript: context.transcript,
      reply: context.reply,
      ...(context.emotion ? { emotion: context.emotion } : {}),
      ...(context.ttsResult?.audioUrl ? { audio_url: context.ttsResult.audioUrl } : {}),
      ...(context.ttsResult?.ttsCacheHit !== undefined ? { tts_cache_hit: context.ttsResult.ttsCacheHit } : {}),
      latency: context.latency,
      status: context.status
    };
  }

  private totalLatency(context: PipelineContext): number {
    const stageTotal =
      context.latency.vad_ms +
      context.latency.asr_ms +
      context.latency.emotion_ms +
      context.latency.llm_ms +
      context.latency.policy_ms +
      context.latency.tts_ms +
      context.latency.audio_encode_ms;
    return Math.max(elapsedMs(context.startMs) - context.latency.playback_delay_ms, stageTotal);
  }
}
