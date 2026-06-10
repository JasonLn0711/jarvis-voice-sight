import type { VoiceTurnPayload, VoiceTurnResponse, VoiceTurnStreamEvent } from "./types";

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

export async function sendVoiceTurnStream(
  payload: VoiceTurnPayload,
  onEvent: (event: VoiceTurnStreamEvent) => Promise<void> | void,
  signal?: AbortSignal
): Promise<VoiceTurnResponse> {
  const init: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  };
  if (signal) {
    init.signal = signal;
  }
  const response = await fetch(`${ORCHESTRATOR_URL}/api/v1/voice-turn-stream`, init);

  if (!response.ok || !response.body) {
    throw new Error("voice turn stream failed");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: VoiceTurnResponse | undefined;

  async function consumeLine(line: string) {
    if (!line.trim()) {
      return;
    }
    const event = JSON.parse(line) as VoiceTurnStreamEvent;
    await onEvent(event);
    if (event.type === "voice_turn_completed" || event.type === "voice_turn_failed") {
      finalResponse = {
        session_id: event.type === "voice_turn_completed" ? event.session_id : payload.session_id,
        turn_id: event.turn_id,
        transcript: event.type === "voice_turn_completed" ? event.transcript : "",
        reply: event.reply,
        latency: event.latency,
        status: event.status
      };
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      await consumeLine(line);
    }
  }
  if (buffer.trim()) {
    await consumeLine(buffer);
  }
  if (!finalResponse) {
    throw new Error("voice turn stream ended without completion");
  }
  return finalResponse;
}

export function resolveAudioUrl(audioUrl: string): string {
  if (audioUrl.startsWith("http")) {
    return audioUrl;
  }
  return `${ORCHESTRATOR_URL}${audioUrl.startsWith("/") ? audioUrl : `/${audioUrl}`}`;
}
