import { describe, expect, it } from "vitest";
import { AdapterFactory } from "../factories/AdapterFactory.js";
import { loadConfig } from "../config/env.js";
import { CircuitBreaker } from "../domain/CircuitBreaker.js";
import { MockASRAdapter, MockEmotionAdapter, classifyTextEmotion } from "../adapters/MockAdapters.js";
import { BreezeASRAdapter, BreezyVoiceAdapter, GemmaE2BAdapter, GemmaE4BAdapter } from "../adapters/RealModelAdapters.js";
import { HttpTTSAdapter } from "../adapters/HttpAdapters.js";
import { ResponseCanonicalizer } from "../policy/ResponseCanonicalizer.js";
import { ResponseRepairEngine } from "../policy/ResponseRepairEngine.js";
import { ResponsePolicyEngine } from "../policy/ResponsePolicyEngine.js";
import { InMemoryConversationRepository } from "../repositories/ConversationRepository.js";
import { ConciseJarvisStrategy, EmotionAwareJarvisStrategy } from "../strategies/ResponseStrategy.js";

describe("response policy", () => {
  it("accepts short Jarvis-style Traditional Chinese replies", () => {
    const policy = new ResponsePolicyEngine(14);
    expect(policy.validate("你最擔心哪部分？", { sessionId: "s1" })).toEqual({
      accepted: true,
      finalReply: "你最擔心哪部分？"
    });
  });

  it("rejects long or markdown-like output with fallback", () => {
    const policy = new ResponsePolicyEngine(14);
    const result = policy.validate("- 這是一段很長的回答，應該被拒絕", { sessionId: "s1" });
    expect(result.accepted).toBe(false);
    expect(result.finalReply).toBe("-這是一段很長的回答，應該被拒絕");
  });

  it("rejects AI self-reference with fallback", () => {
    const policy = new ResponsePolicyEngine(14);
    const result = policy.validate("我是AI語言模型。", { sessionId: "s1" });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("ai_self_reference");
    expect(result.finalReply).toBe("我是AI語言模型。");
  });

  it("rejects overly formal customer-support wording", () => {
    const policy = new ResponsePolicyEngine(14);
    const result = policy.validate("請具體說明您的擔憂。", { sessionId: "s1" });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("formal_wording");
  });

  it("rejects repetitive just-do-it style endings", () => {
    const policy = new ResponsePolicyEngine(18);
    const result = policy.validate("放輕鬆自然就好。", { sessionId: "s1" });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("repetitive_ending");
  });

  it("rejects unsafe financial and insurance claims", () => {
    const policy = new ResponsePolicyEngine(18);
    expect(policy.validate("這檔保證獲利。", { sessionId: "s1" }).reason).toBe("return_promise");
    expect(policy.validate("推薦你買這張保單。", { sessionId: "s1" }).reason).toBe("product_recommendation");
    expect(policy.validate("這是投資建議。", { sessionId: "s1" }).reason).toBe("authority_claim");
  });

  it("detects anxious policy violations before repair", () => {
    const policy = new ResponsePolicyEngine(14);
    const result = policy.validate("準備好了嗎?哪個職位呢?", {
      sessionId: "s1",
      emotion: { label: "anxious", confidence: 0.87, signals: ["面試"] }
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("multi_sentence");
    expect(result.finalReply).toBe("準備好了嗎?哪個職位呢?");
  });

  it("marks generic fallback as invalid in late-turn context", () => {
    const policy = new ResponsePolicyEngine(14);
    const result = policy.validate("你可以再說一點。", {
      sessionId: "s1",
      recentMessages: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `m${index}`,
        timestamp: "t"
      }))
    });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("generic_late_turn_fallback");
  });
});

describe("response repair", () => {
  it("repairs anxious policy violations to a supportive short interaction", () => {
    const repair = new ResponseRepairEngine().repair({
      originalReply: "準備好了嗎?哪個職位呢?",
      reason: "multi_sentence",
      context: {
        sessionId: "s1",
        userText: "我明天要面試",
        recentMessages: [],
        emotion: { label: "anxious", confidence: 0.87, signals: ["面試"] }
      }
    });
    expect(repair.repaired).toBe(true);
    expect(repair.reply).toBe("先穩住，我在。");
  });

  it("repairs late interview closing context with a concrete short template", () => {
    const repair = new ResponseRepairEngine().repair({
      originalReply: "你其實已經整理出你的主軸了，可以用產品角度收尾。",
      reason: "too_long",
      context: {
        sessionId: "s1",
        userText: "最後我該怎麼收尾",
        recentMessages: Array.from({ length: 12 }, (_, index) => ({
          role: index % 2 === 0 ? "user" : "assistant",
          content: `m${index}`,
          timestamp: "t"
        }))
      }
    });
    expect(repair.repaired).toBe(true);
    expect(repair.reply).toBe("用一句話收尾。");
  });

  it("repairs insurance and finance context with compliant coaching templates", () => {
    const repair = new ResponseRepairEngine().repair({
      originalReply: "你可以推薦他買這張保單，這樣比較容易成交。",
      reason: "product_recommendation",
      context: {
        sessionId: "s1",
        userText: "客戶對保險很排斥，我該怎麼說",
        recentMessages: []
      }
    });
    expect(repair.repaired).toBe(true);
    expect(repair.reply).toBe("先建立信任感。");
  });

  it("repairs repetitive endings into a varied coaching reply", () => {
    const repair = new ResponseRepairEngine().repair({
      originalReply: "慢慢來，專注需求就好。",
      reason: "repetitive_ending",
      context: {
        sessionId: "s1",
        userText: "我怕講得像推銷",
        recentMessages: []
      }
    });
    expect(repair.repaired).toBe(true);
    expect(repair.reply).toBe("先尊重他的節奏。");
  });
});

describe("response canonicalizer", () => {
  it("maps return-risk phrasing to a cached compliant reply", () => {
    const result = new ResponseCanonicalizer().canonicalize("報酬要看風險喔。", {
      userText: "他一直問報酬可不可以保證",
      recentMessages: []
    });
    expect(result.changed).toBe(true);
    expect(result.reply).toBe("避免承諾報酬。");
  });

  it("maps soft sales-pressure phrasing to a cached coaching reply", () => {
    const result = new ResponseCanonicalizer().canonicalize("慢慢來，專注需求就好。", {
      userText: "我怕講得像推銷",
      recentMessages: []
    });
    expect(result.changed).toBe(true);
    expect(result.reply).toBe("用關心的語氣。");
  });

  it("maps insurance visit coaching examples to cached style replies", () => {
    const canonicalizer = new ResponseCanonicalizer();
    expect(
      canonicalizer.canonicalize("先抓住拜訪目標。", {
        userText: "我等一下要拜訪一個新客戶",
        recentMessages: []
      }).reply
    ).toBe("先抓住目標。");
    expect(
      canonicalizer.canonicalize("可以先聊聊生活。", {
        userText: "我怕一開口他就防備",
        recentMessages: []
      }).reply
    ).toBe("先聊他的生活。");
    expect(
      canonicalizer.canonicalize("家庭責任可以切入。", {
        userText: "他是三十多歲，有小孩",
        recentMessages: []
      }).reply
    ).toBe("家庭責任是切入點。");
    expect(
      canonicalizer.canonicalize("可以慢慢問。", {
        userText: "我可以先問他最近家庭支出壓力嗎？",
        recentMessages: []
      }).reply
    ).toBe("可以，這很自然。");
    expect(
      canonicalizer.canonicalize("這樣比較自然。", {
        userText: "那我就先幫他整理風險缺口。",
        recentMessages: []
      }).reply
    ).toBe("這比推產品好。");
    expect(
      canonicalizer.canonicalize("你在建立信任。", {
        userText: "我想讓他覺得我是顧問，不是業務。",
        recentMessages: []
      }).reply
    ).toBe("這就是信任感。");
  });

  it("leaves unrelated short replies unchanged", () => {
    const result = new ResponseCanonicalizer().canonicalize("我懂你的意思。", {
      userText: "今天有點累",
      recentMessages: []
    });
    expect(result.changed).toBe(false);
    expect(result.reply).toBe("我懂你的意思。");
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
        replyMinChars: 6,
        replyMaxChars: 18
      }
    });
    expect(prompt).toContain("Reply in 6 to 18 Chinese characters.");
    expect(prompt).toContain("Avoid formal customer-service wording.");
    expect(prompt).toContain('Avoid repetitive sentence endings such as "就好".');
    expect(prompt).toContain("Use a follow-up question only when it helps the conversation.");
    expect(prompt).toContain("insurance and financial service conversations");
    expect(prompt).toContain("Never recommend a specific product.");
    expect(prompt).toContain("Never promise returns.");
    expect(prompt).toContain("Style examples:");
    expect(prompt).toContain("先不要急著推。");
    expect(prompt).toContain("我明天要面試");
  });

  it("adds late-turn anti-summary rule when context is long", () => {
    const prompt = new ConciseJarvisStrategy().buildPrompt({
      userText: "最後我該怎麼收尾",
      recentMessages: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? "user" : "assistant",
        content: `m${index}`,
        timestamp: "t"
      })),
      persona: {
        name: "Jarvis",
        language: "zh-TW",
        tone: "calm_concise_intelligent_supportive",
        replyMinChars: 6,
        replyMaxChars: 18
      }
    });
    expect(prompt).toContain("Do not summarize.");
    expect(prompt).toContain("Use one concrete short interaction.");
  });

  it("builds v0.2 emotion-aware prompt", () => {
    const prompt = new EmotionAwareJarvisStrategy().buildPrompt({
      userText: "我覺得明天會完蛋",
      recentMessages: [],
      persona: {
        name: "Jarvis",
        language: "zh-TW",
        tone: "calm_concise_intelligent_supportive",
        replyMinChars: 6,
        replyMaxChars: 18
      },
      emotion: {
        label: "anxious",
        confidence: 0.87,
        signals: ["完蛋"]
      }
    });
    expect(prompt).toContain("User emotional state:");
    expect(prompt).toContain("slow down, reassure first, ask only if clarification helps");
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

  it("creates real provider adapters from env config", () => {
    const adapters = AdapterFactory.create(
      loadConfig({
        APP_ENV: "test",
        ASR_PROVIDER: "breeze_asr_25",
        LLM_PROVIDER: "gemma_4_e2b",
        TTS_PROVIDER: "breezyvoice",
        EMOTION_PROVIDER: "http"
      })
    );
    expect(adapters.asr).toBeInstanceOf(BreezeASRAdapter);
    expect(adapters.llm).toBeInstanceOf(GemmaE2BAdapter);
    expect(adapters.tts).toBeInstanceOf(BreezyVoiceAdapter);
  });

  it("keeps the legacy Gemma E4B provider alias available", () => {
    const adapters = AdapterFactory.create(
      loadConfig({
        APP_ENV: "test",
        LLM_PROVIDER: "gemma_4_e4b"
      })
    );
    expect(adapters.llm).toBeInstanceOf(GemmaE4BAdapter);
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

describe("HTTP TTS adapter", () => {
  it("rewrites relative audio URLs to the TTS service origin", async () => {
    const originalFetch = global.fetch;
    global.fetch = (async () =>
      new Response(
        JSON.stringify({
          audioUrl: "/audio/turn.wav",
          ttsCacheHit: true,
          upstreamTtsMs: 0,
          audioEncodeMs: 3,
          durationMs: 12,
          format: "wav"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )) as typeof fetch;

    try {
      const adapter = new HttpTTSAdapter("http://localhost:8003", 1000);
      const result = await adapter.synthesize({ text: "你最擔心哪部分？", voiceId: "jarvis_default_zh_tw" });
      expect(result.audioUrl).toBe("http://localhost:8003/audio/turn.wav");
      expect(result.ttsCacheHit).toBe(true);
      expect(result.audioEncodeMs).toBe(3);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
