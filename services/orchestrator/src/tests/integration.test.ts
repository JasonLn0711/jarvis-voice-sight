import { describe, expect, it } from "vitest";
import type { LLMInput, LLMPort, TTSPort, TTSInput } from "../ports/modelPorts.js";
import { loadConfig } from "../config/env.js";
import { buildServer, createDependencies } from "../server.js";

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
});
