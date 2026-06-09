import { describe, expect, it } from "vitest";
import type { TTSPort, TTSInput } from "../ports/modelPorts.js";
import { loadConfig } from "../config/env.js";
import { buildServer, createDependencies } from "../server.js";

const baseRequest = {
  session_id: "session_test",
  audio_format: "mock",
  audio_base64: "text:我明天要面試",
  client_timestamp: "2026-06-10T23:50:00+08:00"
} as const;

async function appWith(overrides: Partial<NodeJS.ProcessEnv> = {}) {
  const deps = createDependencies(loadConfig({ APP_ENV: "test", ...overrides }));
  const app = await buildServer(deps);
  return { app, deps };
}

describe("voice-turn endpoint", () => {
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
    expect(body.reply).toBe("先拆一題來練。");
    expect(body.emotion.label).toBe("anxious");
    expect(body.audio_url).toContain("/mock-audio/");
    expect(body.latency.total_ms).toBeGreaterThanOrEqual(0);
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
    const deps = createDependencies(loadConfig({ APP_ENV: "test" }));
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
    expect(body.reply).toBe("你最擔心哪部分？");
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
    expect(body.reply).toBe("先拆一題來練。");
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
});
