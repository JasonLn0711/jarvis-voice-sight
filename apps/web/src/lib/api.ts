import type { VoiceTurnPayload, VoiceTurnResponse } from "./types";

export const ORCHESTRATOR_URL =
  process.env.NEXT_PUBLIC_ORCHESTRATOR_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export async function sendVoiceTurn(payload: VoiceTurnPayload): Promise<VoiceTurnResponse> {
  const response = await fetch(`${ORCHESTRATOR_URL}/api/v1/voice-turn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("voice turn failed");
  }

  return (await response.json()) as VoiceTurnResponse;
}

export function resolveAudioUrl(audioUrl: string): string {
  if (audioUrl.startsWith("http")) {
    return audioUrl;
  }
  return `${ORCHESTRATOR_URL}${audioUrl.startsWith("/") ? audioUrl : `/${audioUrl}`}`;
}
