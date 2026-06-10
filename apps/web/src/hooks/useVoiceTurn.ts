"use client";

import { useCallback, useRef, useState } from "react";
import { sendVoiceTurn, sendVoiceTurnStream } from "@/lib/api";
import { DEFAULT_SESSION_ID } from "@/lib/constants";
import { TurnPlaybackGuard } from "@/lib/realtime";
import type { VoiceTurnPayload, VoiceTurnResponse, VoiceTurnStreamEvent } from "@/lib/types";

export function useVoiceTurn() {
  const [lastTurn, setLastTurn] = useState<VoiceTurnResponse | undefined>();
  const playbackGuardRef = useRef(new TurnPlaybackGuard());
  const streamAbortRef = useRef<AbortController | null>(null);

  const submit = useCallback(async (payload: Omit<VoiceTurnPayload, "session_id" | "client_timestamp">) => {
    const response = await sendVoiceTurn({
      session_id: DEFAULT_SESSION_ID,
      client_timestamp: new Date().toISOString(),
      ...payload
    });
    playbackGuardRef.current.start(response.turn_id);
    setLastTurn(response);
    return response;
  }, []);

  const submitStream = useCallback(
    async (
      payload: Omit<VoiceTurnPayload, "session_id" | "client_timestamp">,
      onEvent: (event: VoiceTurnStreamEvent) => Promise<void> | void
    ) => {
      streamAbortRef.current?.abort();
      const controller = new AbortController();
      streamAbortRef.current = controller;
      const response = await sendVoiceTurnStream(
        {
          session_id: DEFAULT_SESSION_ID,
          client_timestamp: new Date().toISOString(),
          ...payload
        },
        async (event) => {
          if (event.type === "voice_turn_started") {
            playbackGuardRef.current.start(event.turn_id);
          }
          await onEvent(event);
        },
        controller.signal
      );
      playbackGuardRef.current.start(response.turn_id);
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }
      setLastTurn(response);
      return response;
    },
    []
  );

  const canPlayTurn = useCallback((turnId: string) => playbackGuardRef.current.canPlay(turnId), []);

  const cancelTurn = useCallback((turnId?: string) => {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    playbackGuardRef.current.cancel(turnId);
  }, []);

  return {
    lastTurn,
    canPlayTurn,
    cancelTurn,
    submitStream,
    submit
  };
}
