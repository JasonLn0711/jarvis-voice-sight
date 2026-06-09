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

  private replyFor(input: LLMInput): string {
    if (input.userText.includes("long_output")) {
      return "這是一段太長太像一般聊天機器人的回答，應該被政策拒絕。";
    }
    switch (input.emotion?.label) {
      case "anxious":
        return "先拆一題來練。";
      case "tired":
        return "今天最耗你的事是？";
      case "confused":
        return "卡住的是哪一步？";
      case "excited":
        return "最想先做哪件？";
      case "sad":
        return "哪一刻最難受？";
      case "angry":
        return "先把那句說出來。";
      case "uncertain":
        return "先選一個小步驟。";
      default:
        break;
    }
    if (input.userText.includes("面試") || input.userText.includes("怕")) {
      return "你最擔心哪部分？";
    }
    if (input.userText.includes("累")) {
      return "今天最耗你的事是？";
    }
    return "你想從哪裡說起？";
  }
}

export class MockTTSAdapter implements TTSPort {
  async synthesize(input: TTSInput): Promise<TTSResult> {
    if (input.text.includes("tts_fail")) {
      throw new TTSTimeoutError("mock TTS failure");
    }
    return {
      audioUrl: `/mock-audio/${encodeURIComponent(input.text)}.wav`,
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
