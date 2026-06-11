import type {
  ASRResult,
  ChatResult,
  TTSResult,
  VoiceTurnRequest
} from "@jarvis/shared";
import type { EmotionResult, Message, PersonaConfig } from "@jarvis/shared";

export type AudioInput = {
  audioFormat: VoiceTurnRequest["audio_format"];
  audioBase64: string;
  sessionId?: string;
  turnId?: string;
};

export type VADResult = {
  hasSpeech: boolean;
  speechStartMs?: number;
  speechEndMs?: number;
  confidence?: number;
};

export type LLMInput = {
  userText: string;
  recentMessages: Message[];
  persona: PersonaConfig;
  prompt: string;
  turnId?: string;
  emotion?: EmotionResult;
};

export type TTSInput = {
  text: string;
  voiceId: string;
  turnId?: string;
  speed?: number;
  pitch?: number;
  emotionStyle?: string;
  signal?: AbortSignal;
};

export type EmotionInput = {
  text: string;
  recentMessages: Message[];
  turnId?: string;
};

export interface VADPort {
  detect(input: AudioInput): Promise<VADResult>;
}

export interface ASRPort {
  transcribe(input: AudioInput): Promise<ASRResult>;
}

export type AsrProvider = ASRPort;

export interface LLMPort {
  generate(input: LLMInput): Promise<ChatResult>;
  stream?(input: LLMInput): AsyncIterable<string>;
}

export type LlmProvider = LLMPort;

export interface TTSPort {
  synthesize(input: TTSInput): Promise<TTSResult>;
}

export type TtsProvider = TTSPort;

export interface EmotionPort {
  classify(input: EmotionInput): Promise<EmotionResult>;
}
