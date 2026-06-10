import cors from "@fastify/cors";
import {
  asrRequestSchema,
  chatRequestSchema,
  emotionRequestSchema,
  ttsRequestSchema,
  voiceTurnRequestSchema
} from "@jarvis/shared";
import Fastify from "fastify";
import pino, { type Logger } from "pino";
import { AdapterFactory, type AdapterSet } from "./factories/AdapterFactory.js";
import { loadConfig, type AppConfig } from "./config/env.js";
import { EventBus } from "./events/EventBus.js";
import { ResponseCanonicalizer } from "./policy/ResponseCanonicalizer.js";
import { ResponseRepairEngine } from "./policy/ResponseRepairEngine.js";
import { ResponsePolicyEngine } from "./policy/ResponsePolicyEngine.js";
import { TtsTextFinalizer } from "./policy/TtsTextFinalizer.js";
import { InMemoryConversationRepository } from "./repositories/ConversationRepository.js";
import { ConciseJarvisStrategy, EmotionAwareJarvisStrategy } from "./strategies/ResponseStrategy.js";
import { StreamingVoiceTurnUseCase } from "./usecases/StreamingVoiceTurnUseCase.js";
import { VoiceTurnUseCase, type VoiceTurnDependencies } from "./usecases/VoiceTurnUseCase.js";
import { createSilentWavBuffer } from "./utils/wav.js";

export type ServerDependencies = VoiceTurnDependencies & {
  adapters: AdapterSet;
};

export function createDependencies(
  config: AppConfig = loadConfig(),
  logger: Logger = pino({ level: config.APP_ENV === "test" ? "silent" : "info" })
): ServerDependencies {
  const adapters = AdapterFactory.create(config);
  return {
    config,
    logger,
    eventBus: new EventBus(logger),
    vad: adapters.vad,
    asr: adapters.asr,
    llm: adapters.llm,
    tts: adapters.tts,
    emotion: adapters.emotion,
    conversationRepository: new InMemoryConversationRepository(config.MAX_RECENT_MESSAGES),
    responseCanonicalizer: new ResponseCanonicalizer(),
    ttsTextFinalizer: new TtsTextFinalizer(config.REPLY_MAX_CHARS),
    responsePolicy: new ResponsePolicyEngine(config.REPLY_MAX_CHARS),
    responseRepair: new ResponseRepairEngine(),
    conciseStrategy: new ConciseJarvisStrategy(),
    emotionAwareStrategy: new EmotionAwareJarvisStrategy(),
    breakers: adapters.breakers,
    adapters
  };
}

export async function buildServer(deps: ServerDependencies = createDependencies()) {
  const app = Fastify({
    bodyLimit: deps.config.BODY_LIMIT_BYTES,
    logger: deps.config.APP_ENV === "test" ? false : { level: "info" }
  });

  await app.register(cors, {
    origin: true
  });

  const voiceTurnUseCase = new VoiceTurnUseCase(deps);
  const streamingVoiceTurnUseCase = new StreamingVoiceTurnUseCase(deps);

  app.get("/api/v1/health", async () => {
    const emotionStatus = deps.config.ENABLE_EMOTION ? "ready" : "disabled";
    return {
      status: "ok",
      services: {
        orchestrator: "ready",
        asr: deps.breakers.asr.state() === "open" ? "degraded" : "ready",
        llm: deps.breakers.llm.state() === "open" ? "degraded" : "ready",
        tts: deps.breakers.tts.state() === "open" ? "degraded" : "ready",
        emotion: deps.breakers.emotion.state() === "open" ? "degraded" : emotionStatus
      },
      providers: {
        asr: deps.config.ASR_PROVIDER,
        llm: deps.config.LLM_PROVIDER,
        tts: deps.config.TTS_PROVIDER,
        emotion: deps.config.EMOTION_PROVIDER
      }
    };
  });

  app.post("/api/v1/voice-turn", async (request, reply) => {
    const parsed = voiceTurnRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        status: "error",
        message: "Invalid voice turn request"
      });
    }
    return voiceTurnUseCase.execute(parsed.data);
  });

  app.post("/api/v1/voice-turn-stream", async (request, reply) => {
    const parsed = voiceTurnRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        status: "error",
        message: "Invalid voice turn stream request"
      });
    }

    reply.raw.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });

    const abortController = new AbortController();
    reply.raw.on("close", () => abortController.abort());

    for await (const event of streamingVoiceTurnUseCase.execute(parsed.data, abortController.signal)) {
      if (abortController.signal.aborted) {
        break;
      }
      reply.raw.write(`${JSON.stringify(event)}\n`);
    }
    if (!reply.raw.destroyed) {
      reply.raw.end();
    }
    return reply;
  });

  app.post("/api/v1/asr", async (request, reply) => {
    const parsed = asrRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ status: "error", message: "Invalid ASR request" });
    }
    return deps.asr.transcribe({
      audioFormat: parsed.data.audio_format,
      audioBase64: parsed.data.audio_base64,
      ...(parsed.data.turn_id ? { turnId: parsed.data.turn_id } : {})
    });
  });

  app.post("/api/v1/chat", async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ status: "error", message: "Invalid chat request" });
    }
    const recentMessages = parsed.data.session_id
      ? await deps.conversationRepository.getRecentMessages(parsed.data.session_id)
      : [];
    const emotion = deps.config.ENABLE_EMOTION
      ? await deps.emotion.classify({
          text: parsed.data.text,
          recentMessages,
          ...(parsed.data.turn_id ? { turnId: parsed.data.turn_id } : {})
        })
      : undefined;
    const prompt = (emotion ? deps.emotionAwareStrategy : deps.conciseStrategy).buildPrompt({
      userText: parsed.data.text,
      recentMessages,
      persona: {
        name: "Jarvis",
        language: "zh-TW",
        tone: "calm_concise_intelligent_supportive",
        replyMinChars: 6,
        replyMaxChars: deps.config.REPLY_MAX_CHARS
      },
      ...(emotion ? { emotion } : {})
    });
    return deps.llm.generate({
      userText: parsed.data.text,
      recentMessages,
      persona: {
        name: "Jarvis",
        language: "zh-TW",
        tone: "calm_concise_intelligent_supportive",
        replyMinChars: 6,
        replyMaxChars: deps.config.REPLY_MAX_CHARS
      },
      prompt,
      ...(parsed.data.turn_id ? { turnId: parsed.data.turn_id } : {}),
      ...(emotion ? { emotion } : {})
    });
  });

  app.post("/api/v1/tts", async (request, reply) => {
    const parsed = ttsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ status: "error", message: "Invalid TTS request" });
    }
    return deps.tts.synthesize({
      text: parsed.data.text,
      voiceId: parsed.data.voiceId ?? "jarvis_default_zh_tw",
      ...(parsed.data.speed ? { speed: parsed.data.speed } : {}),
      ...(parsed.data.pitch ? { pitch: parsed.data.pitch } : {}),
      ...(parsed.data.emotionStyle ? { emotionStyle: parsed.data.emotionStyle } : {}),
      ...(parsed.data.turn_id ? { turnId: parsed.data.turn_id } : {})
    });
  });

  app.post("/api/v1/emotion", async (request, reply) => {
    const parsed = emotionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ status: "error", message: "Invalid emotion request" });
    }
    return deps.emotion.classify({
      text: parsed.data.text,
      recentMessages: parsed.data.recentMessages ?? [],
      ...(parsed.data.turn_id ? { turnId: parsed.data.turn_id } : {})
    });
  });

  app.get("/mock-audio/:file", async (_request, reply) => {
    return reply.header("Content-Type", "audio/wav").send(createSilentWavBuffer());
  });

  return app;
}
