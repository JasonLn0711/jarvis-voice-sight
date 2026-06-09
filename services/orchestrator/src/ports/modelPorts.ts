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
  emotion?: EmotionResult;
};

export type TTSInput = {
  text: string;
  voiceId: string;
  speed?: number;
  pitch?: number;
  emotionStyle?: string;
};

export type EmotionInput = {
  text: string;
  recentMessages: Message[];
};

export interface VADPort {
  detect(input: AudioInput): Promise<VADResult>;
}

export interface ASRPort {
  transcribe(input: AudioInput): Promise<ASRResult>;
}

export interface LLMPort {
  generate(input: LLMInput): Promise<ChatResult>;
}

export interface TTSPort {
  synthesize(input: TTSInput): Promise<TTSResult>;
}

export interface EmotionPort {
  classify(input: EmotionInput): Promise<EmotionResult>;
}
