import { describe, expect, it } from "vitest";
import type { AudioInput, EmotionInput, LLMInput, LLMPort, TTSPort, TTSInput, VADPort } from "../ports/modelPorts.js";
import { loadConfig } from "../config/env.js";
import { buildServer, createDependencies } from "../server.js";
import { StreamingVoiceTurnUseCase } from "../usecases/StreamingVoiceTurnUseCase.js";
import { parsePcm16Wav } from "../utils/audioStitcher.js";
import { createToneWavBuffer } from "../utils/wav.js";

const baseRequest = {
  session_id: "session_test",
  audio_format: "mock",
  audio_base64: "text:我明天要面試",
  client_timestamp: "2026-06-10T23:50:00+08:00"
} as const;

async function appWith(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  const deps = createDependencies(loadConfig({ APP_ENV: "test", ENABLE_PLAYBACK_DELAY: "false", ...overrides }));
  const app = await buildServer(deps);
  return { app, deps };
}

describe("voice-turn endpoint", () => {
  it("reports service health and configured providers", async () => {
    const { app } = await appWith();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/health"
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.services).toMatchObject({
      orchestrator: "ready",
      asr: "ready",
      llm: "ready",
      tts: "ready",
      emotion: "ready"
    });
    expect(body.providers).toMatchObject({
      asr: "mock",
      llm: "mock",
      tts: "mock",
      emotion: "mock"
    });
    await app.close();
  });

  it("supports debug ASR, chat, TTS, and emotion endpoints", async () => {
    const { app } = await appWith();
    const asr = await app.inject({
      method: "POST",
      url: "/api/v1/asr",
      payload: { audio_format: "mock", audio_base64: "text:我明天要面試" }
    });
    expect(asr.statusCode).toBe(200);
    expect(asr.json().text).toBe("我明天要面試");

    const chat = await app.inject({
      method: "POST",
      url: "/api/v1/chat",
      payload: { text: "我明天要面試", session_id: "debug_session" }
    });
    expect(chat.statusCode).toBe(200);
    expect(chat.json().reply).toBeTruthy();

    const tts = await app.inject({
      method: "POST",
      url: "/api/v1/tts",
      payload: { text: "你最擔心哪部分？", voiceId: "jarvis_default_zh_tw" }
    });
    expect(tts.statusCode).toBe(200);
    expect(tts.json().audioUrl).toContain("/mock-audio/");

    const emotion = await app.inject({
      method: "POST",
      url: "/api/v1/emotion",
      payload: { text: "我很怕明天面試", recentMessages: [] }
    });
    expect(emotion.statusCode).toBe(200);
    expect(emotion.json().label).toBe("anxious");
    await app.close();
  });

  it("returns transcript, emotion-aware reply, audio, and latency on happy path", async () => {
    const { app } = await appWith();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: baseRequest
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.transcript).toBe("我明天要面試");
    expect(body.reply).toBe("先穩住，我在。");
    expect(body.emotion.label).toBe("anxious");
    expect(body.audio_url).toContain("/mock-audio/");
    expect(body.latency.total_ms).toBeGreaterThanOrEqual(0);
    expect(body.latency.audio_encode_ms).toBeGreaterThanOrEqual(0);
    expect(body.tts_cache_hit).toBe(true);
    expect(body.latency.tts_cache_hit).toBe(true);
    expect(body.latency.playback_ms).toBe(body.latency.playback_delay_ms);
    expect(body.latency.llm_first_token_ms).toBeGreaterThanOrEqual(0);
    expect(body.latency.llm_total_ms).toBeGreaterThanOrEqual(0);
    expect(body.latency.tts_first_audio_ms).toBeGreaterThanOrEqual(0);
    expect(body.latency.tts_total_ms).toBeGreaterThanOrEqual(0);
    expect(body.latency.playback_start_ms).toBeGreaterThanOrEqual(0);
    expect(body.latency.tts_parallel_chunks).toBe(1);
    await app.close();
  });

  it("adds configurable playback delay for demo pacing", async () => {
    const { app } = await appWith({
      ENABLE_PLAYBACK_DELAY: "true",
      PLAYBACK_DELAY_MIN_MS: "1000",
      PLAYBACK_DELAY_MAX_MS: "1000"
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: baseRequest
    });
    const body = response.json();
    expect(body.latency.playback_delay_ms).toBeGreaterThan(0);
    expect(body.latency.perceived_total_ms).toBe(1000);
    await app.close();
  });

  it("handles empty audio with no-speech fallback", async () => {
    const { app } = await appWith();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: { ...baseRequest, audio_base64: "no_speech" }
    });
    const body = response.json();
    expect(body.status).toBe("partial");
    expect(body.reply).toBe("我剛剛沒聽到。");
    await app.close();
  });

  it("handles ASR timeout fallback", async () => {
    const { app } = await appWith();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: { ...baseRequest, audio_base64: "asr_timeout" }
    });
    const body = response.json();
    expect(body.status).toBe("partial");
    expect(body.reply).toBe("我剛剛沒聽清楚。");
    await app.close();
  });

  it("handles LLM timeout fallback", async () => {
    const { app } = await appWith();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: { ...baseRequest, audio_base64: "text:llm_timeout" }
    });
    const body = response.json();
    expect(body.status).toBe("partial");
    expect(body.reply).toBe("先停一下，我在。");
    await app.close();
  });

  it("handles TTS failure as text-only response", async () => {
    class FailingTTS implements TTSPort {
      async synthesize(_input: TTSInput): Promise<never> {
        throw new Error("tts failure");
      }
    }
    const deps = createDependencies(loadConfig({ APP_ENV: "test", ENABLE_PLAYBACK_DELAY: "false" }));
    deps.tts = new FailingTTS();
    const app = await buildServer(deps);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: baseRequest
    });
    const body = response.json();
    expect(body.status).toBe("partial");
    expect(body.audio_url).toBeUndefined();
    expect(body.reply).toBeTruthy();
    await app.close();
  });

  it("works when emotion is disabled", async () => {
    const { app } = await appWith({ ENABLE_EMOTION: "false" });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: baseRequest
    });
    const body = response.json();
    expect(body.emotion).toBeUndefined();
    expect(body.reply).toBe("先抓一個重點。");
    await app.close();
  });

  it("emotion enabled affects prompt strategy and response", async () => {
    const { app } = await appWith({ ENABLE_EMOTION: "true" });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: baseRequest
    });
    const body = response.json();
    expect(body.emotion.label).toBe("anxious");
    expect(body.reply).toBe("先穩住，我在。");
    await app.close();
  });

  it("preserves recent conversation context", async () => {
    const { app, deps } = await appWith();
    await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: baseRequest
    });
    await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: { ...baseRequest, audio_base64: "text:我怕講不好" }
    });
    const messages = await deps.conversationRepository.getRecentMessages(baseRequest.session_id);
    expect(messages.length).toBe(4);
    expect(messages[0]?.role).toBe("user");
    expect(messages.at(-1)?.role).toBe("assistant");
    await app.close();
  });

  it("repairs invalid late-turn LLM output instead of using generic fallback", async () => {
    class VerboseLLM implements LLMPort {
      async generate(_input: LLMInput) {
        return {
          reply: "你其實已經整理出你的主軸了，可以用產品角度收尾。",
          tokensUsed: 18,
          durationMs: 10,
          finishReason: "stop"
        };
      }
    }

    const deps = createDependencies(loadConfig({ APP_ENV: "test", ENABLE_PLAYBACK_DELAY: "false", MAX_RECENT_MESSAGES: "20" }));
    deps.llm = new VerboseLLM();
    const sessionId = "late_turn_repair";
    for (let index = 0; index < 12; index += 1) {
      await deps.conversationRepository.appendMessage(sessionId, {
        role: index % 2 === 0 ? "user" : "assistant",
        content: `m${index}`,
        timestamp: "t"
      });
    }
    const app = await buildServer(deps);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: {
        ...baseRequest,
        session_id: sessionId,
        audio_base64: "text:最後我該怎麼收尾"
      }
    });
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.reply).toBe("用一句話收尾。");
    await app.close();
  });

  it("canonicalizes finance replies before policy and TTS", async () => {
    class FinanceLLM implements LLMPort {
      async generate(_input: LLMInput) {
        return {
          reply: "報酬要看風險喔。",
          tokensUsed: 8,
          durationMs: 10,
          finishReason: "stop"
        };
      }
    }

    const deps = createDependencies(loadConfig({ APP_ENV: "test", ENABLE_PLAYBACK_DELAY: "false" }));
    deps.llm = new FinanceLLM();
    const app = await buildServer(deps);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: {
        ...baseRequest,
        session_id: "finance_canonicalizer",
        audio_base64: "text:他一直問報酬可不可以保證"
      }
    });
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.reply).toBe("避免承諾報酬。");
    expect(body.tts_cache_hit).toBe(true);
    await app.close();
  });

  it("propagates one turn_id through VAD, ASR, Emotion, LLM, and TTS", async () => {
    const seen: Record<string, string | undefined> = {};
    const deps = createDependencies(loadConfig({ APP_ENV: "test", ENABLE_PLAYBACK_DELAY: "false" }));

    deps.vad = {
      async detect(input: AudioInput) {
        seen.vad = input.turnId;
        return { hasSpeech: true };
      }
    } satisfies VADPort;

    deps.asr = {
      async transcribe(input: AudioInput) {
        seen.asr = input.turnId;
        return { text: "我等一下要拜訪一個新客戶", language: "zh-TW", confidence: 0.9, durationMs: 1 };
      }
    };

    deps.emotion = {
      async classify(input: EmotionInput) {
        seen.emotion = input.turnId;
        return { label: "neutral", confidence: 0.5, signals: [], durationMs: 1 };
      }
    };

    deps.llm = {
      async generate(input: LLMInput) {
        seen.llm = input.turnId;
        return { reply: "先抓住目標。", durationMs: 1 };
      }
    };

    deps.tts = {
      async synthesize(input: TTSInput) {
        seen.tts = input.turnId;
        return {
          audioUrl: "/mock-audio/turn.wav",
          ttsCacheHit: true,
          upstreamTtsMs: 0,
          audioEncodeMs: 0,
          durationMs: 1,
          format: "wav"
        };
      }
    };

    const app = await buildServer(deps);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn",
      payload: { ...baseRequest, session_id: "turn_id_propagation", audio_base64: "text:我等一下要拜訪一個新客戶" }
    });
    const body = response.json();
    expect(body.turn_id).toMatch(/^turn_/);
    expect(seen).toEqual({
      vad: body.turn_id,
      asr: body.turn_id,
      emotion: body.turn_id,
      llm: body.turn_id,
      tts: body.turn_id
    });
    await app.close();
  });

  it("streams sentence-level LLM output into turn-scoped TTS chunks", async () => {
    const ttsInputs: TTSInput[] = [];
    const deps = createDependencies(loadConfig({ APP_ENV: "test", ENABLE_PLAYBACK_DELAY: "false" }));

    deps.llm = {
      async generate(_input: LLMInput) {
        return { reply: "先抓住目標。可以穩穩聊。", durationMs: 1 };
      },
      async *stream(_input: LLMInput) {
        yield "先抓";
        yield "住目標。可以";
        yield "穩穩聊。";
      }
    };

    deps.tts = {
      async synthesize(input: TTSInput) {
        ttsInputs.push(input);
        return {
          audioUrl: `/mock-audio/${encodeURIComponent(input.text)}.wav`,
          ttsCacheHit: true,
          upstreamTtsMs: 0,
          audioEncodeMs: 0,
          durationMs: 1,
          format: "wav"
        };
      }
    };

    const app = await buildServer(deps);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn-stream",
      payload: {
        ...baseRequest,
        session_id: "streaming_turn",
        audio_base64: "text:我想先整理一下"
      }
    });
    expect(response.statusCode).toBe(200);
    const events = response.body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const started = events.find((event) => event.type === "voice_turn_started");
    const sentences = events.filter((event) => event.type === "sentence");
    const audio = events.filter((event) => event.type === "audio_chunk");
    const completed = events.at(-1);

    expect(started.turn_id).toMatch(/^turn_/);
    expect(sentences.map((event) => event.sentence)).toEqual(["先抓住目標。", "可以穩穩聊。"]);
    expect(audio.map((event) => event.sentence)).toEqual(["先抓住目標。", "可以穩穩聊。"]);
    expect(audio.map((event) => event.event)).toEqual(["audio_chunk", "audio_chunk"]);
    expect(audio.map((event) => event.chunk_id)).toEqual([
      `${started.turn_id}_chunk_0`,
      `${started.turn_id}_chunk_1`
    ]);
    expect(audio.at(-1).is_final).toBe(true);
    expect(ttsInputs.map((input) => input.turnId)).toEqual([started.turn_id, started.turn_id]);
    expect(completed).toMatchObject({
      type: "voice_turn_completed",
      turn_id: started.turn_id,
      transcript: "我想先整理一下",
      reply: "先抓住目標。可以穩穩聊。"
    });
    await app.close();
  });

  it("streams long-form chunks in order with cache-backed latency metrics", async () => {
    let upstreamCalls = 0;
    const deps = createDependencies(loadConfig({
      APP_ENV: "test",
      ENABLE_PLAYBACK_DELAY: "false",
      TTS_LONG_FORM_ENABLED: "true",
      TTS_MAX_PARALLEL_CHUNKS: "2",
      TTS_TARGET_CHUNK_SECONDS: "2",
      REPLY_MAX_CHARS: "200"
    }));

    deps.llm = {
      async generate(_input: LLMInput) {
        return {
          reply:
            "第一句先建立信任感，讓對方知道你是在協助他整理需求。第二句釐清家庭責任，確認家庭支出和照顧壓力。第三句不要急著推產品，先把風險缺口講清楚。第四句收斂到下一步，約定之後再看合適方案。",
          durationMs: 1
        };
      }
    };

    deps.tts = {
      async synthesize(input: TTSInput) {
        upstreamCalls += 1;
        const delay = input.text.includes("第一句") ? 20 : 1;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return {
          audioUrl: `/mock-audio/${encodeURIComponent(input.text)}.wav`,
          audioBase64: createToneWavBuffer(240).toString("base64"),
          ttsCacheHit: false,
          upstreamTtsMs: delay,
          audioEncodeMs: 0,
          durationMs: delay,
          format: "wav"
        };
      }
    };

    const app = await buildServer(deps);
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn-stream",
      payload: {
        ...baseRequest,
        session_id: "long_form_streaming",
        audio_base64: "text:請幫我整理長一點"
      }
    });
    const firstEvents = first.body.trim().split("\n").map((line) => JSON.parse(line));
    const firstAudio = firstEvents.filter((event) => event.type === "audio_chunk");
    const firstCompleted = firstEvents.at(-1);

    expect(firstAudio.length).toBeGreaterThan(1);
    expect(firstAudio.map((event) => event.sequence)).toEqual(firstAudio.map((_, index) => index));
    expect(firstAudio.at(-1).is_final).toBe(true);
    expect(firstCompleted.latency).toMatchObject({
      tts_chunk_count: firstAudio.length,
      tts_parallelism: 2,
      tts_cache_miss_count: firstAudio.length,
      tts_cache_hit_count: 0
    });
    expect(firstCompleted.latency.tts_time_to_first_audio_ms).toBeGreaterThanOrEqual(0);
    expect(firstCompleted.latency.tts_total_synthesis_ms).toBeGreaterThanOrEqual(0);
    expect(firstCompleted.latency.tts_merge_ms).toBeGreaterThanOrEqual(0);
    expect(firstCompleted.latency.tts_first_audio_ms).toBe(firstCompleted.latency.tts_time_to_first_audio_ms);
    expect(firstCompleted.latency.tts_total_ms).toBe(firstCompleted.latency.tts_total_synthesis_ms);
    expect(firstCompleted.latency.playback_start_ms).toBe(firstCompleted.latency.playback_start_delay_ms);
    expect(firstCompleted.latency.tts_parallel_chunks).toBe(firstAudio.length);
    expect(firstCompleted.audio_stitch).toMatchObject({
      sample_rate_verified: true,
      normalized: true,
      silence_padding_ms: 160,
      sample_rate_hz: 16000,
      chunk_count: firstAudio.length
    });
    expect(firstCompleted.audio_stitch.total_duration_ms).toBeGreaterThan(0);
    expect(firstCompleted.audio_stitch.stitched_bytes).toBeGreaterThan(44);
    expect(firstCompleted.audio_stitch.audio_base64).toEqual(expect.any(String));
    expect(parsePcm16Wav(Buffer.from(firstCompleted.audio_stitch.audio_base64, "base64")).sampleRate).toBe(16000);
    expect(upstreamCalls).toBe(firstAudio.length);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/voice-turn-stream",
      payload: {
        ...baseRequest,
        session_id: "long_form_streaming",
        audio_base64: "text:請幫我整理長一點"
      }
    });
    const secondEvents = second.body.trim().split("\n").map((line) => JSON.parse(line));
    const secondAudio = secondEvents.filter((event) => event.type === "audio_chunk");
    const secondCompleted = secondEvents.at(-1);
    expect(secondAudio.map((event) => event.tts_cache_hit)).toEqual(secondAudio.map(() => true));
    expect(secondCompleted.latency.tts_cache_hit_count).toBe(secondAudio.length);
    expect(upstreamCalls).toBe(firstAudio.length);
    await app.close();
  });

  it("yields first long-form audio before all chunks finish synthesis", async () => {
    let completedSyntheses = 0;
    const deps = createDependencies(loadConfig({
      APP_ENV: "test",
      ENABLE_PLAYBACK_DELAY: "false",
      TTS_LONG_FORM_ENABLED: "true",
      TTS_MAX_PARALLEL_CHUNKS: "2",
      TTS_TARGET_CHUNK_SECONDS: "2",
      REPLY_MAX_CHARS: "200"
    }));

    deps.llm = {
      async generate(_input: LLMInput) {
        return {
          reply:
            "第一句先建立信任感，讓對方知道你是在協助他整理需求。第二句釐清家庭責任，確認家庭支出和照顧壓力。第三句不要急著推產品，先把風險缺口講清楚。第四句收斂到下一步，約定之後再看合適方案。",
          durationMs: 1
        };
      }
    };

    deps.tts = {
      async synthesize(input: TTSInput) {
        const delay = input.text.includes("第一句") ? 5 : 80;
        await new Promise((resolve) => setTimeout(resolve, delay));
        completedSyntheses += 1;
        return {
          audioUrl: `/mock-audio/${encodeURIComponent(input.text)}.wav`,
          audioBase64: createToneWavBuffer(delay).toString("base64"),
          ttsCacheHit: false,
          upstreamTtsMs: delay,
          audioEncodeMs: 0,
          durationMs: delay,
          format: "wav"
        };
      }
    };

    const events = new StreamingVoiceTurnUseCase(deps).execute({
      ...baseRequest,
      session_id: "first_audio_before_all",
      audio_base64: "text:請幫我整理長一點"
    });

    let firstAudioCompletedSyntheses: number | undefined;
    for await (const event of events) {
      if (event.type === "audio_chunk") {
        firstAudioCompletedSyntheses = completedSyntheses;
        break;
      }
    }

    expect(firstAudioCompletedSyntheses).toBeDefined();
    expect(firstAudioCompletedSyntheses).toBeLessThan(4);
  });

  it("stops yielding long-form chunks after stream abort", async () => {
    const deps = createDependencies(loadConfig({
      APP_ENV: "test",
      ENABLE_PLAYBACK_DELAY: "false",
      TTS_LONG_FORM_ENABLED: "true",
      TTS_MAX_PARALLEL_CHUNKS: "2",
      TTS_TARGET_CHUNK_SECONDS: "2",
      REPLY_MAX_CHARS: "200"
    }));
    const abortController = new AbortController();
    const seenSignals: AbortSignal[] = [];

    deps.llm = {
      async generate(_input: LLMInput) {
        return {
          reply:
            "第一句先建立信任感，讓對方知道你是在協助他整理需求。第二句釐清家庭責任，確認家庭支出和照顧壓力。第三句不要急著推產品，先把風險缺口講清楚。第四句收斂到下一步，約定之後再看合適方案。",
          durationMs: 1
        };
      }
    };

    deps.tts = {
      async synthesize(input: TTSInput) {
        if (input.signal) {
          seenSignals.push(input.signal);
        }
        const delay = input.text.includes("第一句") ? 5 : 80;
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, delay);
          input.signal?.addEventListener("abort", () => {
            clearTimeout(timeout);
            resolve();
          }, { once: true });
        });
        return {
          audioUrl: `/mock-audio/${encodeURIComponent(input.text)}.wav`,
          audioBase64: createToneWavBuffer(delay).toString("base64"),
          ttsCacheHit: false,
          upstreamTtsMs: delay,
          audioEncodeMs: 0,
          durationMs: delay,
          format: "wav"
        };
      }
    };

    const yieldedTypes: string[] = [];
    for await (const event of new StreamingVoiceTurnUseCase(deps).execute(
      {
        ...baseRequest,
        session_id: "abort_long_form",
        audio_base64: "text:請幫我整理長一點"
      },
      abortController.signal
    )) {
      yieldedTypes.push(event.type);
      if (event.type === "audio_chunk") {
        abortController.abort();
      }
    }

    expect(yieldedTypes.filter((type) => type === "audio_chunk")).toHaveLength(1);
    expect(yieldedTypes).not.toContain("voice_turn_completed");
    expect(seenSignals.length).toBeGreaterThan(0);
    expect(seenSignals.some((signal) => signal.aborted)).toBe(true);
  });
});
