import {
  ASRTimeoutError,
  LLMTimeoutError,
  ServiceUnavailableError,
  TTSTimeoutError,
  asrResultSchema,
  chatResultSchema,
  emotionResultSchema,
  ttsResultSchema
} from "@jarvis/shared";
import type {
  ASRPort,
  AudioInput,
  EmotionInput,
  EmotionPort,
  LLMInput,
  LLMPort,
  TTSPort,
  TTSInput
} from "../ports/modelPorts.js";
import { withTimeout } from "../utils/timeout.js";

async function postJson(url: string, body: unknown, timeoutMs: number, error: () => Error): Promise<unknown> {
  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
    timeoutMs,
    error
  );
  if (!response.ok) {
    throw new ServiceUnavailableError(`${url} returned ${response.status}`);
  }
  return response.json();
}

export class HttpASRAdapter implements ASRPort {
  constructor(
    private readonly serviceUrl: string,
    private readonly timeoutMs: number
  ) {}

  async transcribe(input: AudioInput) {
    const payload = await postJson(
      `${this.serviceUrl}/asr`,
      { audio_format: input.audioFormat, audio_base64: input.audioBase64 },
      this.timeoutMs,
      () => new ASRTimeoutError("ASR service timed out")
    );
    return asrResultSchema.parse(payload);
  }
}

export class HttpLLMAdapter implements LLMPort {
  constructor(
    private readonly serviceUrl: string,
    private readonly timeoutMs: number
  ) {}

  async generate(input: LLMInput) {
    const payload = await postJson(
      `${this.serviceUrl}/chat`,
      {
        text: input.userText,
        prompt: input.prompt,
        emotion: input.emotion
      },
      this.timeoutMs,
      () => new LLMTimeoutError("LLM service timed out")
    );
    return chatResultSchema.parse(payload);
  }
}

export class HttpTTSAdapter implements TTSPort {
  constructor(
    private readonly serviceUrl: string,
    private readonly timeoutMs: number
  ) {}

  async synthesize(input: TTSInput) {
    const payload = await postJson(`${this.serviceUrl}/tts`, input, this.timeoutMs, () => {
      return new TTSTimeoutError("TTS service timed out");
    });
    const result = ttsResultSchema.parse(payload);
    if (result.audioUrl?.startsWith("/")) {
      return {
        ...result,
        audioUrl: `${this.serviceUrl.replace(/\/$/, "")}${result.audioUrl}`
      };
    }
    return result;
  }
}

export class HttpEmotionAdapter implements EmotionPort {
  constructor(
    private readonly serviceUrl: string,
    private readonly timeoutMs: number
  ) {}

  async classify(input: EmotionInput) {
    const payload = await postJson(
      `${this.serviceUrl}/emotion`,
      input,
      this.timeoutMs,
      () => new ServiceUnavailableError("Emotion service timed out")
    );
    return emotionResultSchema.parse(payload);
  }
}
