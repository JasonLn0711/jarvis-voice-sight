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

async function postJson(
  url: string,
  body: unknown,
  timeoutMs: number,
  error: () => Error,
  signal?: AbortSignal
): Promise<unknown> {
  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {})
    }),
    timeoutMs,
    error
  );
  if (!response.ok) {
    throw new ServiceUnavailableError(`${url} returned ${response.status}`);
  }
  return response.json();
}

async function openJsonStream(url: string, body: unknown, timeoutMs: number, error: () => Error): Promise<Response> {
  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }),
    timeoutMs,
    error
  );
  if (!response.ok || !response.body) {
    throw new ServiceUnavailableError(`${url} returned ${response.status}`);
  }
  return response;
}

export class HttpASRAdapter implements ASRPort {
  constructor(
    private readonly serviceUrl: string,
    private readonly timeoutMs: number
  ) {}

  async transcribe(input: AudioInput) {
    const payload = await postJson(
      `${this.serviceUrl}/asr`,
      {
        audio_format: input.audioFormat,
        audio_base64: input.audioBase64,
        turn_id: input.turnId
      },
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
        emotion: input.emotion,
        turn_id: input.turnId
      },
      this.timeoutMs,
      () => new LLMTimeoutError("LLM service timed out")
    );
    return chatResultSchema.parse(payload);
  }

  async *stream(input: LLMInput): AsyncIterable<string> {
    const body = {
      text: input.userText,
      prompt: input.prompt,
      emotion: input.emotion,
      turn_id: input.turnId
    };
    let response: Response;
    try {
      response = await openJsonStream(
        `${this.serviceUrl}/chat/stream`,
        body,
        this.timeoutMs,
        () => new LLMTimeoutError("LLM stream service timed out")
      );
    } catch {
      const fallback = await this.generate(input);
      yield fallback.reply;
      return;
    }

    const bodyStream = response.body;
    if (!bodyStream) {
      const fallback = await this.generate(input);
      yield fallback.reply;
      return;
    }

    const reader = bodyStream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        const event = JSON.parse(line) as { token?: string; done?: boolean };
        if (event.token) {
          yield event.token;
        }
        if (event.done) {
          return;
        }
      }
    }
    if (buffer.trim()) {
      const event = JSON.parse(buffer) as { token?: string };
      if (event.token) {
        yield event.token;
      }
    }
  }
}

export class HttpTTSAdapter implements TTSPort {
  constructor(
    private readonly serviceUrl: string,
    private readonly timeoutMs: number
  ) {}

  async synthesize(input: TTSInput) {
    const payload = await postJson(
      `${this.serviceUrl}/tts`,
      {
        text: input.text,
        voiceId: input.voiceId,
        speed: input.speed,
        pitch: input.pitch,
        emotionStyle: input.emotionStyle,
        turn_id: input.turnId
      },
      this.timeoutMs,
      () => {
        return new TTSTimeoutError("TTS service timed out");
      },
      input.signal
    );
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
      {
        text: input.text,
        recentMessages: input.recentMessages,
        turn_id: input.turnId
      },
      this.timeoutMs,
      () => new ServiceUnavailableError("Emotion service timed out")
    );
    return emotionResultSchema.parse(payload);
  }
}
