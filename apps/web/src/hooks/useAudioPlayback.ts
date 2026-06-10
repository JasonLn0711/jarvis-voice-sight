"use client";

import { useCallback, useRef } from "react";
import { resolveAudioUrl } from "@/lib/api";

export function useAudioPlayback() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  const play = useCallback(async (audioUrl: string | undefined, turnId: string, canPlay: (turnId: string) => boolean) => {
    if (!audioUrl || !canPlay(turnId)) {
      return false;
    }
    stop();
    const audio = new Audio(resolveAudioUrl(audioUrl));
    audioRef.current = audio;
    try {
      if (!canPlay(turnId)) {
        stop();
        return false;
      }
      await audio.play();
    } catch {
      return false;
    }
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
    });
    if (!canPlay(turnId)) {
      stop();
      return false;
    }
    audioRef.current = null;
    return true;
  }, [stop]);

  const isPlaying = useCallback(() => {
    const audio = audioRef.current;
    return Boolean(audio && !audio.paused && !audio.ended);
  }, []);

  return { play, stop, isPlaying };
}
