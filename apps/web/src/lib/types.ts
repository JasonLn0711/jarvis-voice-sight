import type { EmotionLabel, VoiceState, VoiceTurnResponse } from "@jarvis/shared";

export type { EmotionLabel, VoiceState, VoiceTurnResponse };

export type VoiceTurnPayload = {
  session_id: string;
  audio_format: "wav" | "mp3" | "webm" | "mock";
  audio_base64: string;
  client_timestamp: string;
};
