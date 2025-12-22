export class LruCache<K, V> {
  private map = new Map<K, V>();
  constructor(private capacity: number, private onEvict?: (key: K, value: V) => void) {}

  get(key: K): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    if (this.map.size > this.capacity) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) {
        const evicted = this.map.get(firstKey);
        if (evicted !== undefined) {
          this.onEvict?.(firstKey, evicted);
        }
        this.map.delete(firstKey);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }
}
