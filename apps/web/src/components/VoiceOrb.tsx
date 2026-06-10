"use client";

import { motion } from "framer-motion";
import type { VoiceState } from "@/lib/types";

type VoiceOrbProps = {
  state: VoiceState;
  level?: number;
};

const stateColor: Record<VoiceState, string> = {
  IDLE: "var(--accent)",
  LISTENING: "var(--listening)",
  TRANSCRIBING: "var(--accent-strong)",
  THINKING: "var(--thinking)",
  SPEAKING: "var(--speaking)",
  INTERRUPTED: "var(--accent-strong)",
  ERROR: "var(--error)"
};

export function VoiceOrb({ state, level = 0.48 }: VoiceOrbProps) {
  const activeColor = stateColor[state];
  const scale = state === "LISTENING" || state === "SPEAKING" || state === "INTERRUPTED" ? 1 + level * 0.08 : 1;

  return (
    <div className="relative flex h-60 w-60 items-center justify-center sm:h-80 sm:w-80" aria-label={`Voice state ${state}`}>
      <motion.div
        className="absolute inset-0 rounded-full"
        animate={{
          scale: state === "IDLE" ? [0.98, 1.04, 0.98] : [1, scale, 1],
          opacity: state === "ERROR" ? [0.5, 0.72, 0.5] : [0.58, 0.86, 0.58]
        }}
        transition={{
          duration: state === "IDLE" ? 3 : 1.6,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        style={{
          background: `radial-gradient(circle, ${activeColor} 0%, rgba(167,199,255,0.08) 36%, transparent 68%)`,
          filter: "blur(18px)"
        }}
      />
      <motion.div
        className="absolute h-52 w-52 rounded-full border border-white/15 sm:h-64 sm:w-64"
        animate={{
          rotate: state === "TRANSCRIBING" ? 360 : 0,
          borderColor: state === "ERROR" ? "rgba(255,154,154,0.42)" : "rgba(255,255,255,0.16)"
        }}
        transition={{
          rotate: {
            duration: 2.2,
            repeat: state === "TRANSCRIBING" ? Infinity : 0,
            ease: "linear"
          },
          borderColor: { duration: 0.24 }
        }}
      />
      <motion.div
        className="glass-panel relative h-40 w-40 overflow-hidden rounded-full sm:h-52 sm:w-52"
        animate={{
          scale,
          boxShadow:
            state === "ERROR"
              ? "0 0 80px rgba(255,154,154,0.24)"
              : `0 0 90px color-mix(in srgb, ${activeColor}, transparent 68%)`
        }}
        transition={{ duration: 0.8, ease: "easeInOut" }}
      >
        <div className="absolute inset-5 rounded-full bg-[radial-gradient(circle_at_34%_24%,rgba(255,255,255,0.70),rgba(215,230,255,0.28)_18%,rgba(167,199,255,0.12)_42%,rgba(255,255,255,0.03)_72%)]" />
        <div className="absolute inset-0 rounded-full bg-[linear-gradient(140deg,rgba(255,255,255,0.18),transparent_42%,rgba(255,255,255,0.08))]" />
        {(state === "LISTENING" || state === "SPEAKING" || state === "INTERRUPTED") && (
          <motion.div
            className="absolute inset-0 rounded-full border border-white/20"
            animate={{ scale: [0.82, 1.12, 0.82], opacity: [0.18, 0.42, 0.18] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </motion.div>
    </div>
  );
}
