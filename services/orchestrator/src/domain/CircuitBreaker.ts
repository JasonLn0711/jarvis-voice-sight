export type CircuitState = "closed" | "open";

export class CircuitBreaker {
  private failures: number[] = [];
  private openedAt: number | undefined;

  constructor(
    private readonly failureThreshold = 3,
    private readonly windowMs = 60_000,
    private readonly cooldownMs = 20_000
  ) {}

  canCall(now = Date.now()): boolean {
    if (this.state(now) === "closed") {
      return true;
    }
    return false;
  }

  recordSuccess(): void {
    this.failures = [];
    this.openedAt = undefined;
  }

  recordFailure(now = Date.now()): void {
    this.failures = [...this.failures.filter((time) => now - time <= this.windowMs), now];
    if (this.failures.length >= this.failureThreshold) {
      this.openedAt = now;
    }
  }

  state(now = Date.now()): CircuitState {
    if (this.openedAt === undefined) {
      return "closed";
    }
    if (now - this.openedAt > this.cooldownMs) {
      this.recordSuccess();
      return "closed";
    }
    return "open";
  }
}
