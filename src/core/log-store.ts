import { LogEvent } from "../api/public-types.js";

export class LogStore {
  private events: LogEvent[] = [];

  constructor(private maxEntries: number) {}

  add(event: LogEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEntries) {
      this.events.shift();
    }
  }

  getAll(): LogEvent[] {
    return [...this.events];
  }

  drain(): LogEvent[] {
    const drained = [...this.events];
    this.events = [];
    return drained;
  }
}
