import { describe, expect, it } from "vitest";
import { AdapterFactory } from "../factories/AdapterFactory.js";
import { loadConfig } from "../config/env.js";
import { CircuitBreaker } from "../domain/CircuitBreaker.js";
import { MockASRAdapter, MockEmotionAdapter, classifyTextEmotion } from "../adapters/MockAdapters.js";
import { ResponsePolicyEngine } from "../policy/ResponsePolicyEngine.js";
import { InMemoryConversationRepository } from "../repositories/ConversationRepository.js";
import { ConciseJarvisStrategy, EmotionAwareJarvisStrategy } from "../strategies/ResponseStrategy.js";

describe("response policy", () => {
  it("accepts short Jarvis-style Traditional Chinese replies", () => {
    const policy = new ResponsePolicyEngine(20);
    expect(policy.validate("你最擔心哪部分？", { sessionId: "s1" })).toEqual({
      accepted: true,
      finalReply: "你最擔心哪部分？"
    });
  });

  it("rejects long or markdown-like output with fallback", () => {
    const policy = new ResponsePolicyEngine(20);
    const result = policy.validate("- 這是一段很長的回答，應該被拒絕", { sessionId: "s1" });
    expect(result.accepted).toBe(false);
    expect(result.finalReply).toBe("你可以再說一點。");
  });
});

describe("prompt builders", () => {
  it("builds v0.1 concise prompt", () => {
    const prompt = new ConciseJarvisStrategy().buildPrompt({
      userText: "我明天要面試",
      recentMessages: [],
      persona: {
        name: "Jarvis",
        language: "zh-TW",
        tone: "calm_concise_intelligent_supportive",
        replyMinChars: 10,
        replyMaxChars: 20
      }
    });
    expect(prompt).toContain("Reply in 10 to 20 Chinese characters.");
    expect(prompt).toContain("我明天要面試");
  });

  it("builds v0.2 emotion-aware prompt", () => {
    const prompt = new EmotionAwareJarvisStrategy().buildPrompt({
      userText: "我覺得明天會完蛋",
      recentMessages: [],
      persona: {
        name: "Jarvis",
        language: "zh-TW",
        tone: "calm_concise_intelligent_supportive",
        replyMinChars: 10,
        replyMaxChars: 20
      },
      emotion: {
        label: "anxious",
        confidence: 0.87,
        signals: ["完蛋"]
      }
    });
    expect(prompt).toContain("User emotional state:");
    expect(prompt).toContain("slow down, ask one concrete question");
  });
});

describe("emotion classifier", () => {
  it("classifies anxious transcript", () => {
    expect(classifyTextEmotion("我很怕明天面試會完蛋")).toMatchObject({
      label: "anxious",
      confidence: 0.87
    });
  });

  it("mock emotion adapter returns supported labels", async () => {
    const result = await new MockEmotionAdapter().classify({
      text: "我今天很累",
      recentMessages: []
    });
    expect(result.label).toBe("tired");
  });
});

describe("conversation repository", () => {
  it("keeps only recent bounded messages", async () => {
    const repository = new InMemoryConversationRepository(2);
    await repository.appendMessage("s1", { role: "user", content: "one", timestamp: "t1" });
    await repository.appendMessage("s1", { role: "assistant", content: "two", timestamp: "t2" });
    await repository.appendMessage("s1", { role: "user", content: "three", timestamp: "t3" });
    const messages = await repository.getRecentMessages("s1");
    expect(messages.map((message) => message.content)).toEqual(["two", "three"]);
  });
});

describe("adapter factory", () => {
  it("creates mock adapters from env config", () => {
    const adapters = AdapterFactory.create(loadConfig({ APP_ENV: "test" }));
    expect(adapters.asr).toBeInstanceOf(MockASRAdapter);
  });
});

describe("circuit breaker", () => {
  it("opens after repeated failures and closes after cooldown", () => {
    const breaker = new CircuitBreaker(3, 60_000, 10);
    breaker.recordFailure(0);
    breaker.recordFailure(1);
    expect(breaker.canCall(2)).toBe(true);
    breaker.recordFailure(3);
    expect(breaker.canCall(4)).toBe(false);
    expect(breaker.canCall(20)).toBe(true);
  });
});
