export class EventEmitter<T> {
  private listeners = new Set<(event: T) => void>();

  subscribe(listener: (event: T) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  hasListeners(): boolean {
    return this.listeners.size > 0;
  }

  clear(): void {
    this.listeners.clear();
  }
}
