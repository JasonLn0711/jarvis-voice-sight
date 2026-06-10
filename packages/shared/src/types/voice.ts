export const VOICE_STATES = [
  "IDLE",
  "LISTENING",
  "TRANSCRIBING",
  "THINKING",
  "SPEAKING",
  "INTERRUPTED",
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
  llm_first_token_ms?: number;
  llm_total_ms?: number;
  policy_ms: number;
  tts_ms: number;
  tts_first_audio_ms?: number;
  tts_total_ms?: number;
  audio_encode_ms: number;
  playback_delay_ms: number;
  playback_ms?: number;
  playback_start_ms?: number;
  perceived_total_ms: number;
  total_ms: number;
  tts_cache_hit?: boolean;
  tts_parallel_chunks?: number;
  tts_chunk_count?: number;
  tts_parallelism?: number;
  tts_time_to_first_audio_ms?: number;
  tts_total_synthesis_ms?: number;
  tts_merge_ms?: number;
  tts_cache_hit_count?: number;
  tts_cache_miss_count?: number;
  tts_first_chunk_cache_hit?: boolean;
  playback_start_delay_ms?: number;
};

export type AudioStitchMetadata = {
  sample_rate_verified: true;
  normalized: true;
  silence_padding_ms: number;
  total_duration_ms: number;
};

export type VoiceTurnStatus = "ok" | "partial" | "error";

export type VoiceTurnResponse = {
  session_id: string;
  turn_id: string;
  transcript: string;
  reply: string;
  emotion?: EmotionResult;
  audio_url?: string;
  tts_cache_hit?: boolean;
  latency: LatencyReport;
  status: VoiceTurnStatus;
};

export type VoiceTurnStreamEvent =
  | {
      type: "voice_turn_started";
      session_id: string;
      turn_id: string;
    }
  | {
      type: "transcript";
      turn_id: string;
      transcript: string;
    }
  | {
      type: "emotion";
      turn_id: string;
      emotion: EmotionResult;
    }
  | {
      type: "sentence";
      turn_id: string;
      sequence: number;
      sentence: string;
    }
  | {
      type: "audio_chunk";
      event: "audio_chunk";
      turn_id: string;
      chunk_id: string;
      sequence: number;
      sentence: string;
      audio_url?: string;
      is_final: boolean;
      tts_cache_hit?: boolean;
      latency: Pick<LatencyReport, "tts_ms" | "audio_encode_ms">;
    }
  | {
      type: "voice_turn_completed";
      session_id: string;
      turn_id: string;
      transcript: string;
      reply: string;
      latency: LatencyReport;
      audio_stitch?: AudioStitchMetadata;
      status: "ok" | "partial";
    }
  | {
      type: "voice_turn_failed";
      session_id: string;
      turn_id: string;
      reply: string;
      latency: LatencyReport;
      status: "error";
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
  INTERRUPTED: "Interrupted.",
  ERROR: "Something faded. Try again."
};
