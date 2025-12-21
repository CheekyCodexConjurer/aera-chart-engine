export class FrameScheduler {
  private scheduled = false;

  constructor(private onFrame: () => void) {}

  requestFrame(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.onFrame();
    });
  }

  flush(): void {
    if (this.scheduled) {
      this.scheduled = false;
    }
    this.onFrame();
  }
}
