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
  responsePolicy: ResponsePolicyEngine;
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

const persona: PersonaConfig = {
  name: "Jarvis",
  language: "zh-TW",
  tone: "calm_concise_intelligent_supportive",
  replyMinChars: 10,
  replyMaxChars: 20
};

function createLatency(): LatencyReport {
  return {
    vad_ms: 0,
    asr_ms: 0,
    emotion_ms: 0,
    llm_ms: 0,
    policy_ms: 0,
    tts_ms: 0,
    total_ms: 0
  };
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

export class PolicyStep extends BaseStep {
  readonly name = "PolicyStep";

  async run(context: PipelineContext): Promise<void> {
    const start = nowMs();
    const policyContext = {
      sessionId: context.request.session_id,
      ...(context.emotion ? { emotion: context.emotion } : {})
    };
    const result = this.deps.responsePolicy.validate(context.reply, policyContext);
    context.latency.policy_ms = elapsedMs(start);
    context.reply = result.finalReply;
    if (!result.accepted) {
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
      context.latency.tts_ms = Math.max(result.durationMs, result.value.durationMs);
      context.ttsResult = result.value;
      breaker.recordSuccess();
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
      new PolicyStep(deps),
      new TTSStep(deps),
      new PersistStep(deps)
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
      const response = this.toResponse(context);
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
      context.latency.tts_ms;
    return Math.max(elapsedMs(context.startMs), stageTotal);
  }
}
