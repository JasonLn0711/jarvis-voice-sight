import type { ReactNode } from "react";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <main className="premium-canvas relative isolate flex min-h-svh items-center justify-center overflow-x-hidden px-5 py-6 sm:px-8 sm:py-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(167,199,255,0.10),transparent_68%)] blur-2xl" />
      <section className="relative z-10 flex w-full max-w-4xl flex-col items-center text-center">
        {children}
      </section>
    </main>
  );
}
