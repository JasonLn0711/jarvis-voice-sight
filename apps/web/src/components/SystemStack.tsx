"use client";

import { motion } from "framer-motion";
import { PRODUCT_IDENTITY, SYSTEM_STACK } from "@/lib/constants";

export function SystemStack() {
  return (
    <motion.aside
      className="glass-panel mx-auto mt-4 flex w-full max-w-3xl flex-col items-center justify-center gap-3 rounded-2xl px-4 py-3 text-center sm:mt-5 sm:px-5"
      aria-label="System stack and product identity"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.34, delay: 0.08 }}
    >
      <p className="text-[13px] font-medium text-[color:var(--text-primary)]">
        {PRODUCT_IDENTITY.owner} · {PRODUCT_IDENTITY.affiliation}
        <span className="mx-2 text-[color:var(--text-tertiary)]">·</span>
        <span className="font-normal text-[color:var(--text-secondary)]">
          {PRODUCT_IDENTITY.version} · {PRODUCT_IDENTITY.domain}
        </span>
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {SYSTEM_STACK.map((item) => (
          <span
            key={item.label}
            className="rounded-lg border border-white/8 bg-white/[0.035] px-2.5 py-1 text-[12px] text-[color:var(--text-tertiary)]"
            title={`${item.label}: ${item.value}`}
          >
            <span className="font-medium text-[color:var(--text-secondary)]">{item.label}</span> {item.value}
          </span>
        ))}
      </div>
    </motion.aside>
  );
}
