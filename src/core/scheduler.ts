export class FrameScheduler {
  private scheduled = false;
  private rafId: number | null = null;

  constructor(private onFrame: () => void) {}

  requestFrame(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    if (typeof requestAnimationFrame === "function") {
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.scheduled = false;
        this.onFrame();
      });
      return;
    }
    queueMicrotask(() => {
      this.rafId = null;
      this.scheduled = false;
      this.onFrame();
    });
  }

  flush(): void {
    if (this.scheduled) {
      this.scheduled = false;
      if (this.rafId !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }
    this.onFrame();
  }
}
