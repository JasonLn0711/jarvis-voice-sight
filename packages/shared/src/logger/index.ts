export type LifecycleEventName =
  | "voice_turn_started"
  | "asr_completed"
  | "emotion_completed"
  | "llm_completed"
  | "tts_completed"
  | "voice_turn_completed"
  | "voice_turn_failed";

export type LifecycleEvent = {
  name: LifecycleEventName;
  sessionId?: string;
  turnId?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};
