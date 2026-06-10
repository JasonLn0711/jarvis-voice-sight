"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VadStateManager, type RealtimeVoiceState } from "@/lib/realtime";
import type { VoiceTurnPayload } from "@/lib/types";

type RealtimeOptions = {
  onUtterance: (payload: Pick<VoiceTurnPayload, "audio_format" | "audio_base64">) => Promise<void>;
  isPlaybackActive: () => boolean;
  onInterrupted: () => void;
};

type RecorderPayload = Pick<VoiceTurnPayload, "audio_format" | "audio_base64">;

const FRAME_INTERVAL_MS = 80;
const INTERRUPTED_DISPLAY_MS = 450;

declare global {
  interface Window {
    __JARVIS_TEST_SPEECH_LEVEL__?: number;
    __JARVIS_TEST_PLAYBACK_ACTIVE__?: boolean;
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read realtime recording"));
        return;
      }
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = () => reject(new Error("Could not read realtime recording"));
    reader.readAsDataURL(blob);
  });
}

function levelToSpeechProbability(level: number): number {
  return Math.max(0, Math.min(1, (level - 0.025) / 0.11));
}

export function useRealtimeVoiceController({ onUtterance, isPlaybackActive, onInterrupted }: RealtimeOptions) {
  const managerRef = useRef(new VadStateManager());
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeRef = useRef(false);
  const processingRef = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<RealtimeVoiceState>("idle");
  const [level, setLevel] = useState(0);

  const stopRecorderTracks = useCallback(() => {
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
  }, []);

  const readLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return 0;
    }
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    return Math.sqrt(sum / data.length);
  }, []);

  const buildPayloadFromChunks = useCallback(async (): Promise<RecorderPayload> => {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    chunksRef.current = [];
    if (blob.size === 0) {
      return { audio_format: "mock", audio_base64: "no_speech" };
    }
    return {
      audio_format: "webm",
      audio_base64: await blobToBase64(blob)
    };
  }, []);

  const startRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "inactive") {
      return;
    }
    chunksRef.current = [];
    recorder.start();
  }, []);

  const finishUtterance = useCallback(async () => {
    if (processingRef.current) {
      return;
    }
    processingRef.current = true;
    const recorder = recorderRef.current;
    try {
      if (recorder && recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          recorder.onstop = () => resolve();
          recorder.stop();
        });
      }
      const payload = await buildPayloadFromChunks();
      await onUtterance(payload);
    } finally {
      processingRef.current = false;
      if (activeRef.current) {
        managerRef.current.startListening();
        setState("listening");
        startRecorder();
      }
    }
  }, [buildPayloadFromChunks, onUtterance, startRecorder]);

  const tick = useCallback(() => {
    if (!activeRef.current) {
      return;
    }

    const rawLevel = window.__JARVIS_TEST_SPEECH_LEVEL__ ?? readLevel();
    setLevel(rawLevel);
    const playbackActive = window.__JARVIS_TEST_PLAYBACK_ACTIVE__ ?? isPlaybackActive();
    if (playbackActive && managerRef.current.state() !== "speaking" && managerRef.current.state() !== "interrupted") {
      managerRef.current.markSpeaking();
    }

    const nextState = managerRef.current.observe({
      speechProbability: levelToSpeechProbability(rawLevel),
      nowMs: performance.now(),
      isPlaybackActive: playbackActive
    });
    setState(nextState);

    if (nextState === "interrupted") {
      onInterrupted();
      chunksRef.current = [];
      window.setTimeout(() => {
        if (activeRef.current && managerRef.current.state() === "interrupted") {
          managerRef.current.startListening();
          setState("listening");
        }
      }, INTERRUPTED_DISPLAY_MS);
    } else if (nextState === "asr_processing") {
      void finishUtterance();
    }

    timerRef.current = window.setTimeout(tick, FRAME_INTERVAL_MS);
  }, [finishUtterance, isPlaybackActive, onInterrupted, readLevel]);

  const start = useCallback(async () => {
    if (activeRef.current || !navigator.mediaDevices?.getUserMedia) {
      return false;
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    streamRef.current = stream;
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorderRef.current = recorder;

    activeRef.current = true;
    setEnabled(true);
    managerRef.current.startListening();
    setState("listening");
    startRecorder();
    timerRef.current = window.setTimeout(tick, FRAME_INTERVAL_MS);
    return true;
  }, [startRecorder, tick]);

  const stop = useCallback(() => {
    activeRef.current = false;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    stopRecorderTracks();
    managerRef.current = new VadStateManager();
    chunksRef.current = [];
    processingRef.current = false;
    setEnabled(false);
    setState("idle");
    setLevel(0);
  }, [stopRecorderTracks]);

  useEffect(() => stop, [stop]);

  return {
    enabled,
    state,
    level,
    start,
    stop
  };
}
