import type { LifecycleEvent, LifecycleEventName } from "@jarvis/shared";
import type { Logger } from "pino";

export class EventBus {
  constructor(private readonly logger: Logger) {}

  emit(name: LifecycleEventName, event: Omit<LifecycleEvent, "name"> = {}): void {
    this.logger.info({ event: { name, ...event } }, "jarvis lifecycle event");
  }
}
