"use client";

import { motion } from "framer-motion";
import { Mic, RotateCcw } from "lucide-react";
import type { VoiceState } from "@/lib/types";

type HoldToSpeakButtonProps = {
  state: VoiceState;
  onPressStart: () => void;
  onPressEnd: () => void;
};

export function HoldToSpeakButton({ state, onPressStart, onPressEnd }: HoldToSpeakButtonProps) {
  const isListening = state === "LISTENING";
  const isBusy = state === "TRANSCRIBING" || state === "THINKING" || state === "SPEAKING";
  const isError = state === "ERROR";
  const label = isError ? "Try Again" : isListening ? "Release to Send" : "Hold to Speak";

  return (
    <motion.button
      type="button"
      disabled={isBusy}
      onPointerDown={() => {
        if (!isBusy) onPressStart();
      }}
      onPointerUp={() => {
        if (!isBusy) onPressEnd();
      }}
      onPointerCancel={() => {
        if (!isBusy && isListening) onPressEnd();
      }}
      {...(!isBusy
        ? {
            whileHover: { y: -2, boxShadow: "0 18px 70px rgba(167,199,255,0.22)" },
            whileTap: { scale: 0.98 }
          }
        : {})}
      className="inline-flex min-h-14 min-w-48 items-center justify-center gap-3 rounded-full border border-white/15 bg-white/[0.08] px-7 text-[15px] font-medium text-[color:var(--text-primary)] shadow-[0_16px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl transition disabled:cursor-not-allowed disabled:opacity-45"
    >
      {isError ? <RotateCcw size={18} strokeWidth={1.8} /> : <Mic size={18} strokeWidth={1.8} />}
      {label}
    </motion.button>
  );
}
