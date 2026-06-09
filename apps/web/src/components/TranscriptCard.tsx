"use client";

import { motion } from "framer-motion";

type TranscriptCardProps = {
  transcript?: string | undefined;
  placeholder?: string | undefined;
};

export function TranscriptCard({ transcript, placeholder = "Your words will appear here." }: TranscriptCardProps) {
  return (
    <motion.section
      className="glass-panel w-full rounded-3xl px-6 py-5 text-left sm:px-7"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
    >
      <p className="mb-2 text-[13px] font-normal text-[color:var(--text-tertiary)]">I heard this.</p>
      <p className="min-h-8 text-[22px] font-normal leading-normal text-[color:var(--text-primary)]">
        {transcript || <span className="text-[color:var(--text-tertiary)]">{placeholder}</span>}
      </p>
    </motion.section>
  );
}
