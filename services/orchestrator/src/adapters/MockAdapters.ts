import {
  ASREmptyTranscriptError,
  ASRTimeoutError,
  LLMTimeoutError,
  TTSTimeoutError,
  type ASRResult,
  type ChatResult,
  type EmotionResult,
  type TTSResult
} from "@jarvis/shared";
import type {
  ASRPort,
  AudioInput,
  EmotionInput,
  EmotionPort,
  LLMInput,
  LLMPort,
  TTSPort,
  TTSInput,
  VADPort,
  VADResult
} from "../ports/modelPorts.js";

function decodeMockText(audioBase64: string): string | undefined {
  if (audioBase64.startsWith("text:")) {
    return audioBase64.slice("text:".length).trim();
  }
  return undefined;
}

export class MockVADAdapter implements VADPort {
  async detect(input: AudioInput): Promise<VADResult> {
    const silence = ["", "silence", "mock-silence", "no_speech"].includes(input.audioBase64);
    if (silence) {
      return {
        hasSpeech: false,
        confidence: 0.08
      };
    }
    return {
      hasSpeech: true,
      speechStartMs: 0,
      speechEndMs: 900,
      confidence: 0.96
    };
  }
}

export class MockASRAdapter implements ASRPort {
  async transcribe(input: AudioInput): Promise<ASRResult> {
    if (input.audioBase64 === "asr_timeout") {
      throw new ASRTimeoutError("mock ASR timeout");
    }
    if (input.audioBase64 === "empty" || input.audioBase64 === "asr_empty") {
      throw new ASREmptyTranscriptError("mock empty transcript");
    }

    const text = decodeMockText(input.audioBase64) ?? this.defaultTranscript(input.audioBase64);
    return {
      text,
      language: "zh-TW",
      confidence: 0.93,
      durationMs: 120,
      segments: [
        {
          startMs: 0,
          endMs: 900,
          text
        }
      ]
    };
  }

  private defaultTranscript(audioBase64: string): string {
    if (audioBase64.includes("tired")) {
      return "我今天很累";
    }
    if (audioBase64.includes("angry")) {
      return "我有點生氣";
    }
    if (audioBase64.includes("confused")) {
      return "我不太懂";
    }
    if (audioBase64.includes("sad")) {
      return "我有點難過";
    }
    if (audioBase64.includes("uncertain")) {
      return "我不確定該怎麼辦";
    }
    return "我明天要面試";
  }
}

export class MockLLMAdapter implements LLMPort {
  async generate(input: LLMInput): Promise<ChatResult> {
    if (input.userText.includes("llm_timeout")) {
      throw new LLMTimeoutError("mock LLM timeout");
    }
    const reply = this.replyFor(input);
    return {
      reply,
      tokensUsed: 18,
      durationMs: 180,
      finishReason: "stop"
    };
  }

  async *stream(input: LLMInput): AsyncIterable<string> {
    const reply = this.replyFor(input);
    for (const char of Array.from(reply)) {
      yield char;
    }
  }

  private replyFor(input: LLMInput): string {
    if (input.userText.includes("long_output")) {
      return "這是一段太長太像一般聊天機器人的回答，應該被政策拒絕。";
    }
    switch (input.emotion?.label) {
      case "anxious":
        return "先穩住，我在。";
      case "tired":
        return "先讓腦袋休息。";
      case "confused":
        return "這裡先慢慢理。";
      case "excited":
        return "這個方向不錯。";
      case "sad":
        return "這真的不好受。";
      case "angry":
        return "先把那句說出來。";
      case "uncertain":
        return "先選一個小步驟。";
      default:
        break;
    }
    if (input.userText.includes("新客戶") || input.userText.includes("拜訪")) {
      return "先抓住目標。";
    }
    if (input.userText.includes("排斥") || input.userText.includes("抗拒")) {
      return "先不要急著推。";
    }
    if (input.userText.includes("防備")) {
      return "先聊他的生活。";
    }
    if (input.userText.includes("三十多歲") || input.userText.includes("小孩")) {
      return "家庭責任是切入點。";
    }
    if (input.userText.includes("像推銷")) {
      return "用關心的語氣。";
    }
    if (input.userText.includes("家庭支出")) {
      return "可以，這很自然。";
    }
    if (input.userText.includes("風險缺口")) {
      return "這比推產品好。";
    }
    if (input.userText.includes("顧問") || input.userText.includes("不是業務")) {
      return "這就是信任感。";
    }
    if (input.userText.includes("知道怎麼開場")) {
      return "可以，先穩穩聊。";
    }
    if (input.userText.includes("保險") || input.userText.includes("保單") || input.userText.includes("投保")) {
      return "先建立信任感。";
    }
    if (input.userText.includes("排斥") || input.userText.includes("抗拒") || input.userText.includes("不想買")) {
      return "先聽他的顧慮。";
    }
    if (input.userText.includes("開場") || input.userText.includes("開口") || input.userText.includes("第一句")) {
      return "用關心開場。";
    }
    if (input.userText.includes("報酬") || input.userText.includes("獲利") || input.userText.includes("收益")) {
      return "避免承諾報酬。";
    }
    if (input.userText.includes("商品") || input.userText.includes("產品") || input.userText.includes("基金")) {
      return "不要先談商品。";
    }
    if (input.userText.includes("客訴") || input.userText.includes("抱怨") || input.userText.includes("不滿")) {
      return "先接住情緒。";
    }
    if (input.userText.includes("語氣") || input.userText.includes("太急") || input.userText.includes("壓迫")) {
      return "語氣再放慢。";
    }
    if (input.userText.includes("風險") || input.userText.includes("理財") || input.userText.includes("資產")) {
      return "先釐清他的目標。";
    }
    if (input.userText.includes("面試") || input.userText.includes("怕")) {
      return "先抓一個重點。";
    }
    if (input.userText.includes("累")) {
      return "你可以慢慢說。";
    }
    return "我懂你的意思。";
  }
}

export class MockTTSAdapter implements TTSPort {
  async synthesize(input: TTSInput): Promise<TTSResult> {
    if (input.text.includes("tts_fail")) {
      throw new TTSTimeoutError("mock TTS failure");
    }
    return {
      audioUrl: `/mock-audio/${encodeURIComponent(input.text)}.wav`,
      ttsCacheHit: [
        "好，我在。",
        "你說。",
        "我懂。",
        "繼續說。",
        "你最擔心哪一點？",
        "用一句話收尾。",
        "這個成果很關鍵。",
        "先講產品感。",
        "先講延遲目標。",
        "先講備援方案。",
        "研究重點很清楚。",
        "自我介紹先求穩。",
        "先抓一個重點。",
        "這句再短一點。",
        "先講產品手感。",
        "先穩住，我在。",
        "我懂你的意思。",
        "這樣講可以。",
        "你可以慢慢說。",
        "先抓最小版本。",
        "你已經接近了。",
        "這裡先求穩。",
        "先建立信任感。",
        "先聽他的顧慮。",
        "用關心開場。",
        "先釐清他的目標。",
        "不要先談商品。",
        "避免承諾報酬。",
        "這裡要保守講。",
        "先尊重他的節奏。",
        "先接住情緒。",
        "語氣再放慢。",
        "先抓住目標。",
        "先不要急著推。",
        "先聊他的生活。",
        "家庭責任是切入點。",
        "用關心的語氣。",
        "可以，這很自然。",
        "這比推產品好。",
        "這就是信任感。",
        "可以，先穩穩聊。"
      ].includes(input.text),
      upstreamTtsMs: 160,
      audioEncodeMs: 0,
      normalizedText: input.text,
      durationMs: 160,
      format: "wav"
    };
  }
}

export class MockEmotionAdapter implements EmotionPort {
  async classify(input: EmotionInput): Promise<EmotionResult> {
    const result = classifyTextEmotion(input.text);
    return {
      ...result,
      durationMs: 20
    };
  }
}

export function classifyTextEmotion(text: string): Omit<EmotionResult, "durationMs"> {
  const rules: Array<{ label: EmotionResult["label"]; keywords: string[] }> = [
    { label: "anxious", keywords: ["怕", "擔心", "焦慮", "完蛋", "面試"] },
    { label: "tired", keywords: ["累", "疲倦", "沒力"] },
    { label: "confused", keywords: ["不懂", "混亂", "卡住"] },
    { label: "excited", keywords: ["開心", "興奮", "期待"] },
    { label: "sad", keywords: ["難過", "沮喪", "失落"] },
    { label: "angry", keywords: ["生氣", "火大", "不爽"] },
    { label: "uncertain", keywords: ["不確定", "不知道", "猶豫"] }
  ];

  for (const rule of rules) {
    const signals = rule.keywords.filter((keyword) => text.includes(keyword));
    if (signals.length > 0) {
      return {
        label: rule.label,
        confidence: rule.label === "anxious" ? 0.87 : 0.78,
        signals
      };
    }
  }

  return {
    label: "neutral",
    confidence: 0.64,
    signals: []
  };
}
