"use client";

import { useCallback, useState } from "react";
import { sendVoiceTurn } from "@/lib/api";
import { DEFAULT_SESSION_ID } from "@/lib/constants";
import type { VoiceTurnPayload, VoiceTurnResponse } from "@/lib/types";

export function useVoiceTurn() {
  const [lastTurn, setLastTurn] = useState<VoiceTurnResponse | undefined>();

  const submit = useCallback(async (payload: Omit<VoiceTurnPayload, "session_id" | "client_timestamp">) => {
    const response = await sendVoiceTurn({
      session_id: DEFAULT_SESSION_ID,
      client_timestamp: new Date().toISOString(),
      ...payload
    });
    setLastTurn(response);
    return response;
  }, []);

  return {
    lastTurn,
    submit
  };
}
