import type { EmotionLabel } from "@/lib/types";

type StatusStripProps = {
  latencyMs?: number | undefined;
  emotion?: EmotionLabel | undefined;
  sessionState?: string | undefined;
};

export function StatusStrip({ latencyMs, emotion, sessionState = "session active" }: StatusStripProps) {
  const latency = latencyMs ? `${(latencyMs / 1000).toFixed(2)}s` : "ready";
  return (
    <p className="text-[13px] font-normal text-[color:var(--text-tertiary)]">
      {[latency, emotion, sessionState].filter(Boolean).join(" · ")}
    </p>
  );
}
