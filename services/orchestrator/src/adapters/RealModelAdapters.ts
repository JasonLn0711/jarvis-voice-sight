import { HttpASRAdapter, HttpEmotionAdapter, HttpLLMAdapter, HttpTTSAdapter } from "./HttpAdapters.js";

// Breeze-ASR-25 is served by services/asr, where faster-whisper owns the runtime.
export class BreezeASRAdapter extends HttpASRAdapter {}

// Gemma 4 E2B/E4B is served by services/llm, with Ollama as the fast default runtime.
export class GemmaE2BAdapter extends HttpLLMAdapter {}

export class GemmaE4BAdapter extends HttpLLMAdapter {}

// BreezyVoice is served by services/tts, which wraps a warm OpenAI-compatible TTS server.
export class BreezyVoiceAdapter extends HttpTTSAdapter {}

// v0.2 emotion currently remains a bounded classifier service behind the same HTTP port.
export class EmotionClassifierAdapter extends HttpEmotionAdapter {}
