import type { EmotionLabel, VoiceState, VoiceTurnResponse, VoiceTurnStreamEvent } from "@jarvis/shared";

export type { EmotionLabel, VoiceState, VoiceTurnResponse, VoiceTurnStreamEvent };

export type VoiceTurnPayload = {
  session_id: string;
  audio_format: "wav" | "mp3" | "webm" | "mock";
  audio_base64: string;
  client_timestamp: string;
};
