import type { AppConfig } from "../config/env.js";
import { CircuitBreaker } from "../domain/CircuitBreaker.js";
import {
  MockASRAdapter,
  MockEmotionAdapter,
  MockLLMAdapter,
  MockTTSAdapter,
  MockVADAdapter
} from "../adapters/MockAdapters.js";
import { HttpASRAdapter, HttpEmotionAdapter, HttpLLMAdapter, HttpTTSAdapter } from "../adapters/HttpAdapters.js";
import {
  BreezeASRAdapter,
  BreezyVoiceAdapter,
  EmotionClassifierAdapter,
  GemmaE2BAdapter,
  GemmaE4BAdapter
} from "../adapters/RealModelAdapters.js";
import type { ASRPort, EmotionPort, LLMPort, TTSPort, VADPort } from "../ports/modelPorts.js";

export type AdapterSet = {
  vad: VADPort;
  asr: ASRPort;
  llm: LLMPort;
  tts: TTSPort;
  emotion: EmotionPort;
  breakers: {
    asr: CircuitBreaker;
    llm: CircuitBreaker;
    tts: CircuitBreaker;
    emotion: CircuitBreaker;
  };
};

export class AdapterFactory {
  static create(config: AppConfig): AdapterSet {
    return {
      vad: new MockVADAdapter(),
      asr: this.createASR(config),
      llm: this.createLLM(config),
      tts: this.createTTS(config),
      emotion: this.createEmotion(config),
      breakers: {
        asr: new CircuitBreaker(),
        llm: new CircuitBreaker(),
        tts: new CircuitBreaker(),
        emotion: new CircuitBreaker()
      }
    };
  }

  private static createASR(config: AppConfig): ASRPort {
    if (config.ASR_PROVIDER === "mock") {
      return new MockASRAdapter();
    }
    if (config.ASR_PROVIDER === "breeze_asr" || config.ASR_PROVIDER === "breeze_asr_25") {
      return new BreezeASRAdapter(config.ASR_SERVICE_URL, config.ASR_TIMEOUT_MS);
    }
    return new HttpASRAdapter(config.ASR_SERVICE_URL, config.ASR_TIMEOUT_MS);
  }

  private static createLLM(config: AppConfig): LLMPort {
    if (config.LLM_PROVIDER === "mock") {
      return new MockLLMAdapter();
    }
    if (config.LLM_PROVIDER === "ollama" || config.LLM_PROVIDER === "vllm") {
      return new HttpLLMAdapter(config.LLM_SERVICE_URL, config.LLM_TIMEOUT_MS);
    }
    if (config.LLM_PROVIDER === "gemma_4_e2b") {
      return new GemmaE2BAdapter(config.LLM_SERVICE_URL, config.LLM_TIMEOUT_MS);
    }
    if (config.LLM_PROVIDER === "gemma_4_e4b") {
      return new GemmaE4BAdapter(config.LLM_SERVICE_URL, config.LLM_TIMEOUT_MS);
    }
    return new HttpLLMAdapter(config.LLM_SERVICE_URL, config.LLM_TIMEOUT_MS);
  }

  private static createTTS(config: AppConfig): TTSPort {
    if (config.TTS_PROVIDER === "mock") {
      return new MockTTSAdapter();
    }
    if (config.TTS_PROVIDER === "breezyvoice") {
      return new BreezyVoiceAdapter(config.TTS_SERVICE_URL, config.TTS_TIMEOUT_MS);
    }
    return new HttpTTSAdapter(config.TTS_SERVICE_URL, config.TTS_TIMEOUT_MS);
  }

  private static createEmotion(config: AppConfig): EmotionPort {
    if (config.EMOTION_PROVIDER === "mock") {
      return new MockEmotionAdapter();
    }
    return new EmotionClassifierAdapter(config.EMOTION_SERVICE_URL, config.EMOTION_TIMEOUT_MS);
  }
}
