"use client";

import { useCallback } from "react";
import { resolveAudioUrl } from "@/lib/api";

export function useAudioPlayback() {
  const play = useCallback(async (audioUrl?: string) => {
    if (!audioUrl) {
      return;
    }
    const audio = new Audio(resolveAudioUrl(audioUrl));
    try {
      await audio.play();
    } catch {
      return;
    }
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
    });
  }, []);

  return { play };
}
