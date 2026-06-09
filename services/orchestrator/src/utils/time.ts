export function nowMs(): number {
  return performance.now();
}

export function elapsedMs(startMs: number): number {
  return Math.max(0, Math.round(performance.now() - startMs));
}

export async function measure<T>(task: () => Promise<T>): Promise<{ value: T; durationMs: number }> {
  const start = nowMs();
  const value = await task();
  return { value, durationMs: elapsedMs(start) };
}
