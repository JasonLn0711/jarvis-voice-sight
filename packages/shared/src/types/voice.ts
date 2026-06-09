export const VOICE_STATES = [
  "IDLE",
  "LISTENING",
  "TRANSCRIBING",
  "THINKING",
  "SPEAKING",
  "ERROR"
] as const;

export type VoiceState = (typeof VOICE_STATES)[number];

export const EMOTION_LABELS = [
  "neutral",
  "anxious",
  "tired",
  "confused",
  "excited",
  "sad",
  "angry",
  "uncertain"
] as const;

export type EmotionLabel = (typeof EMOTION_LABELS)[number];

export type MessageRole = "user" | "assistant" | "system";

export type Message = {
  role: MessageRole;
  content: string;
  timestamp: string;
};

export type EmotionResult = {
  label: EmotionLabel;
  confidence: number;
  signals: string[];
  durationMs?: number | undefined;
};

export type LatencyReport = {
  vad_ms: number;
  asr_ms: number;
  emotion_ms: number;
  llm_ms: number;
  policy_ms: number;
  tts_ms: number;
  total_ms: number;
};

export type VoiceTurnStatus = "ok" | "partial" | "error";

export type VoiceTurnResponse = {
  session_id: string;
  turn_id: string;
  transcript: string;
  reply: string;
  emotion?: EmotionResult;
  audio_url?: string;
  latency: LatencyReport;
  status: VoiceTurnStatus;
};

export type PersonaConfig = {
  name: "Jarvis";
  language: "zh-TW";
  tone: "calm_concise_intelligent_supportive";
  replyMinChars: number;
  replyMaxChars: number;
};

export const FALLBACK_REPLIES = {
  noSpeech: "我剛剛沒聽到。",
  asrEmpty: "我剛剛沒聽清楚。",
  llmTimeout: "先停一下，我在。",
  policyRejected: "你可以再說一點。"
} as const;

export const STATE_COPY: Record<VoiceState, string> = {
  IDLE: "Speak when ready.",
  LISTENING: "Listening.",
  TRANSCRIBING: "I heard this.",
  THINKING: "Thinking.",
  SPEAKING: "Speaking.",
  ERROR: "Something faded. Try again."
};
