export type RealtimeVoiceState =
  | "idle"
  | "listening"
  | "user_speaking"
  | "asr_processing"
  | "thinking"
  | "speaking"
  | "interrupted"
  | "error_recovery";

type VadThresholds = {
  START_SPEECH_PROB: number;
  END_SPEECH_PROB: number;
  MIN_SPEECH_MS: number;
  END_SILENCE_MS: number;
  BARGE_IN_MS: number;
};

const DEFAULT_VAD_THRESHOLDS: VadThresholds = {
  START_SPEECH_PROB: 0.6,
  END_SPEECH_PROB: 0.3,
  MIN_SPEECH_MS: 200,
  END_SILENCE_MS: 700,
  BARGE_IN_MS: 300
};

type VadStateSnapshot = {
  state: RealtimeVoiceState;
  speechStartedAtMs?: number;
  silenceStartedAtMs?: number;
  bargeInStartedAtMs?: number;
};

type VadFrame = {
  speechProbability: number;
  nowMs: number;
  isPlaybackActive?: boolean;
};

export class VadStateManager {
  private snapshot: VadStateSnapshot = { state: "idle" };

  constructor(private readonly thresholds: VadThresholds = DEFAULT_VAD_THRESHOLDS) {}

  state(): RealtimeVoiceState {
    return this.snapshot.state;
  }

  startListening(): RealtimeVoiceState {
    this.snapshot = { state: "listening" };
    return this.snapshot.state;
  }

  markSpeaking(): RealtimeVoiceState {
    this.snapshot = { state: "speaking" };
    return this.snapshot.state;
  }

  observe(frame: VadFrame): RealtimeVoiceState {
    const probability = frame.speechProbability;
    const now = frame.nowMs;

    if (this.snapshot.state === "speaking" && frame.isPlaybackActive) {
      if (probability >= this.thresholds.START_SPEECH_PROB) {
        const startedAt = this.snapshot.bargeInStartedAtMs ?? now;
        if (now - startedAt >= this.thresholds.BARGE_IN_MS) {
          this.snapshot = { state: "interrupted" };
          return this.snapshot.state;
        }
        this.snapshot = { ...this.snapshot, bargeInStartedAtMs: startedAt };
        return this.snapshot.state;
      }
      this.snapshot = { state: "speaking" };
      return this.snapshot.state;
    }

    if (this.snapshot.state === "idle") {
      return this.snapshot.state;
    }

    if (this.snapshot.state === "listening") {
      if (probability >= this.thresholds.START_SPEECH_PROB) {
        this.snapshot = { state: "user_speaking", speechStartedAtMs: now };
      }
      return this.snapshot.state;
    }

    if (this.snapshot.state === "user_speaking") {
      if (probability <= this.thresholds.END_SPEECH_PROB) {
        const silenceStartedAt = this.snapshot.silenceStartedAtMs ?? now;
        const speechStartedAt = this.snapshot.speechStartedAtMs ?? now;
        const speechMs = now - speechStartedAt;
        const silenceMs = now - silenceStartedAt;
        if (speechMs >= this.thresholds.MIN_SPEECH_MS && silenceMs >= this.thresholds.END_SILENCE_MS) {
          this.snapshot = { state: "asr_processing" };
          return this.snapshot.state;
        }
        this.snapshot = { ...this.snapshot, silenceStartedAtMs: silenceStartedAt };
        return this.snapshot.state;
      }
      this.snapshot = {
        state: "user_speaking",
        speechStartedAtMs: this.snapshot.speechStartedAtMs ?? now
      };
    }

    return this.snapshot.state;
  }
}

export class TurnPlaybackGuard {
  private activeTurnId: string | undefined;

  start(turnId: string): void {
    this.activeTurnId = turnId;
  }

  cancel(turnId?: string): void {
    if (!turnId || this.activeTurnId === turnId) {
      this.activeTurnId = undefined;
    }
  }

  canPlay(turnId: string): boolean {
    return this.activeTurnId === turnId;
  }
}
