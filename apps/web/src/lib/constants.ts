import type { VoiceState } from "./types";

export const STATE_COPY: Record<VoiceState, string> = {
  IDLE: "Speak when ready.",
  LISTENING: "Listening.",
  TRANSCRIBING: "I heard this.",
  THINKING: "Thinking.",
  SPEAKING: "Speaking.",
  ERROR: "Something faded. Try again."
};

export const DEFAULT_SESSION_ID = "session_demo";
