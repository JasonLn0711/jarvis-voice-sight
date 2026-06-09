import { HttpASRAdapter, HttpEmotionAdapter, HttpLLMAdapter, HttpTTSAdapter } from "./HttpAdapters.js";

// TODO(real-model): replace the HTTP contract target with the actual Breeze-ASR-25 runtime endpoint.
export class BreezeASRAdapter extends HttpASRAdapter {}

// TODO(real-model): replace the HTTP contract target with a Gemma 4 E4B local or near-edge runtime.
export class GemmaE4BAdapter extends HttpLLMAdapter {}

// TODO(real-model): replace the HTTP contract target with the actual BreezyVoice inference service.
export class BreezyVoiceAdapter extends HttpTTSAdapter {}

// TODO(real-model): replace this with a transcript/prosody classifier when v0.2 runs with real signals.
export class EmotionClassifierAdapter extends HttpEmotionAdapter {}
