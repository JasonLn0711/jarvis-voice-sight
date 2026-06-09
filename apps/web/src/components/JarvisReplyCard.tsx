"use client";

import { motion } from "framer-motion";
import type { EmotionLabel } from "@/lib/types";

type JarvisReplyCardProps = {
  reply?: string | undefined;
  emotion?: EmotionLabel | undefined;
};

export function JarvisReplyCard({ reply, emotion }: JarvisReplyCardProps) {
  return (
    <motion.section
      className="glass-panel w-full rounded-3xl px-6 py-6 text-left sm:px-7"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      <div className="mb-2 flex items-center justify-between gap-4">
        <p className="text-[13px] font-normal text-[color:var(--text-tertiary)]">Jarvis replied.</p>
        {emotion && <p className="text-[13px] text-[color:var(--text-tertiary)]">{emotion}</p>}
      </div>
      <p className="min-h-11 text-[32px] font-medium leading-tight tracking-[-0.02em] text-[color:var(--text-primary)]">
        {reply || <span className="text-[color:var(--text-tertiary)]">I am here.</span>}
      </p>
    </motion.section>
  );
}
