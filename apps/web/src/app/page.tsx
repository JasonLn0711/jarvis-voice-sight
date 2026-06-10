"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AppShell } from "@/components/AppShell";
import { HoldToSpeakButton } from "@/components/HoldToSpeakButton";
import { JarvisReplyCard } from "@/components/JarvisReplyCard";
import { StatusStrip } from "@/components/StatusStrip";
import { SystemStack } from "@/components/SystemStack";
import { TranscriptCard } from "@/components/TranscriptCard";
import { VoiceOrb } from "@/components/VoiceOrb";
import { useAudioPlayback } from "@/hooks/useAudioPlayback";
import { useRealtimeVoiceController } from "@/hooks/useRealtimeVoiceController";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useVoiceTurn } from "@/hooks/useVoiceTurn";
import { STATE_COPY } from "@/lib/constants";
import type { VoiceState, VoiceTurnPayload, VoiceTurnStreamEvent } from "@/lib/types";

export default function Home() {
  const [voiceState, setVoiceState] = useState<VoiceState>("IDLE");
  const recorder = useVoiceRecorder();
  const voiceTurn = useVoiceTurn();
  const audio = useAudioPlayback();

  const currentTurn = voiceTurn.lastTurn;

  const playStreamEvent = useCallback(async (event: VoiceTurnStreamEvent) => {
    if (event.type === "transcript") {
      setVoiceState("THINKING");
      return;
    }
    if (event.type === "sentence") {
      setVoiceState("THINKING");
      return;
    }
    if (event.type === "audio_chunk") {
      setVoiceState("SPEAKING");
      await audio.play(event.audio_url, event.turn_id, voiceTurn.canPlayTurn);
      return;
    }
    if (event.type === "voice_turn_failed") {
      setVoiceState("ERROR");
    }
  }, [audio, voiceTurn]);

  const processVoicePayload = useCallback(async (payload: Omit<VoiceTurnPayload, "session_id" | "client_timestamp">, mode: "single" | "stream" = "single") => {
    try {
      setVoiceState("TRANSCRIBING");
      if (mode === "stream") {
        await voiceTurn.submitStream(payload, playStreamEvent);
        setVoiceState("LISTENING");
        return;
      }
      setVoiceState("THINKING");
      const response = await voiceTurn.submit(payload);
      if (response.audio_url) {
        setVoiceState("SPEAKING");
        const played = await audio.play(response.audio_url, response.turn_id, voiceTurn.canPlayTurn);
        if (!played) {
          setVoiceState("LISTENING");
          return;
        }
      }
      setVoiceState("IDLE");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setVoiceState("INTERRUPTED");
        return;
      }
      setVoiceState("ERROR");
    }
  }, [audio, playStreamEvent, voiceTurn]);

  const realtime = useRealtimeVoiceController({
    onUtterance: (payload) => processVoicePayload(payload, "stream"),
    isPlaybackActive: audio.isPlaying,
    onInterrupted: () => {
      audio.stop();
      voiceTurn.cancelTurn();
      setVoiceState("INTERRUPTED");
    }
  });
  const orbLevel = realtime.enabled ? Math.min(1, realtime.level * 8) : recorder.level;

  useEffect(() => {
    if (!realtime.enabled) {
      return;
    }
    if (realtime.state === "listening" || realtime.state === "user_speaking") {
      setVoiceState("LISTENING");
    }
    if (realtime.state === "interrupted") {
      setVoiceState("INTERRUPTED");
    }
    if (realtime.state === "asr_processing") {
      setVoiceState("TRANSCRIBING");
    }
    if (realtime.state === "thinking") {
      setVoiceState("THINKING");
    }
    if (realtime.state === "speaking") {
      setVoiceState("SPEAKING");
    }
    if (realtime.state === "error_recovery") {
      setVoiceState("ERROR");
    }
  }, [realtime.enabled, realtime.state]);

  async function handlePressStart() {
    if (realtime.enabled) {
      return;
    }
    setVoiceState("LISTENING");
    await recorder.start();
  }

  async function handlePressEnd() {
    if (realtime.enabled || voiceState !== "LISTENING") {
      return;
    }
    const payload = await recorder.stop();
    await processVoicePayload(payload);
  }

  return (
    <AppShell>
      <motion.header
        className="mb-5 max-w-3xl sm:mb-10"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-[40px] font-semibold leading-none tracking-[-0.04em] text-[color:var(--text-primary)] sm:text-[56px]">
          Jarvis Voice Sight
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[17px] font-normal leading-relaxed text-[color:var(--text-secondary)] sm:mt-5 sm:text-[18px]">
          A real-time insurance voice coach powered by RTX GPU inference.
        </p>
      </motion.header>

      <VoiceOrb state={voiceState} level={orbLevel} />

      <motion.p
        className="mb-5 mt-1 text-[15px] text-[color:var(--text-secondary)] sm:mb-7 sm:mt-2"
        key={voiceState}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
      >
        {STATE_COPY[voiceState]}
      </motion.p>

      <div className="grid w-full max-w-2xl gap-4">
        <JarvisReplyCard reply={currentTurn?.reply} emotion={currentTurn?.emotion?.label} />
        <TranscriptCard transcript={currentTurn?.transcript} />
      </div>

      <div className="mt-5 flex flex-col items-center gap-3 sm:mt-7 sm:gap-4">
        <HoldToSpeakButton state={voiceState} onPressStart={handlePressStart} onPressEnd={handlePressEnd} />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <StatusStrip
            latencyMs={currentTurn?.latency.perceived_total_ms ?? currentTurn?.latency.total_ms}
            emotion={currentTurn?.emotion?.label}
            sessionState={
              realtime.enabled
                ? `realtime ${realtime.state.replace("_", " ")}`
                : recorder.mockMode
                  ? "mock mode"
                  : "session active"
            }
          />
          <button
            type="button"
            onClick={async () => {
              if (realtime.enabled) {
                realtime.stop();
                setVoiceState("IDLE");
                return;
              }
              try {
                const started = await realtime.start();
                if (started) {
                  setVoiceState("LISTENING");
                }
              } catch {
                setVoiceState("ERROR");
              }
            }}
            className="text-[13px] text-[color:var(--text-tertiary)] transition hover:text-[color:var(--text-secondary)]"
          >
            {realtime.enabled ? "realtime listening" : "enable realtime mode"}
          </button>
          <button
            type="button"
            onClick={() => recorder.setMockMode(!recorder.mockMode)}
            className="text-[13px] text-[color:var(--text-tertiary)] transition hover:text-[color:var(--text-secondary)]"
          >
            {recorder.mockMode ? "mock phrase active" : "use mock phrase"}
          </button>
        </div>
      </div>

      {recorder.mockMode && (
        <motion.div className="mt-3 w-full max-w-2xl text-left" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.32, delay: 0.1 }}>
          <textarea
            value={recorder.mockText}
            onChange={(event) => recorder.setMockText(event.target.value)}
            rows={2}
            className="mt-3 w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] text-[color:var(--text-primary)] outline-none transition placeholder:text-[color:var(--text-tertiary)] focus:border-white/20"
            placeholder="我明天要面試"
          />
        </motion.div>
      )}

      <SystemStack />
    </AppShell>
  );
}
