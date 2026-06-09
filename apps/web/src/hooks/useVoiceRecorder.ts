"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RecorderPayload = {
  audio_format: "webm" | "mock";
  audio_base64: string;
};

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read recording"));
        return;
      }
      resolve(result.split(",")[1] ?? result);
    };
    reader.onerror = () => reject(new Error("Could not read recording"));
    reader.readAsDataURL(blob);
  });
}

export function useVoiceRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [mockMode, setMockMode] = useState(false);
  const [mockText, setMockText] = useState("我明天要面試");
  const [level, setLevel] = useState(0.48);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLevel(0.28 + Math.random() * 0.62);
    }, 280);
    return () => window.clearInterval(id);
  }, []);

  const start = useCallback(async () => {
    chunksRef.current = [];
    if (mockMode || !navigator.mediaDevices?.getUserMedia) {
      setMockMode(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.start();
    } catch {
      setMockMode(true);
    }
  }, [mockMode]);

  const stop = useCallback(async (): Promise<RecorderPayload> => {
    if (mockMode || !mediaRecorderRef.current) {
      return {
        audio_format: "mock",
        audio_base64: `text:${mockText || "我明天要面試"}`
      };
    }

    const recorder = mediaRecorderRef.current;
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    await stopped;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    if (blob.size === 0) {
      return {
        audio_format: "mock",
        audio_base64: "no_speech"
      };
    }
    return {
      audio_format: "webm",
      audio_base64: await blobToBase64(blob)
    };
  }, [mockMode, mockText]);

  return {
    level,
    mockMode,
    mockText,
    setMockMode,
    setMockText,
    start,
    stop
  };
}
