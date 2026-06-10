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

export const PRODUCT_IDENTITY = {
  name: "Jarvis Voice Sight",
  owner: "Jason Lin",
  affiliation: "NYCU",
  version: "v0.2",
  domain: "Insurance voice coach"
};

export const SYSTEM_STACK = [
  { label: "ASR", value: "Breeze-ASR-25" },
  { label: "LLM", value: "Gemma 4 E2B int4" },
  { label: "TTS", value: "BreezyVoice" },
  { label: "GPU", value: "RTX 4090 Laptop GPU" }
];
