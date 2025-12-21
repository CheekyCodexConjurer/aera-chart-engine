import { Point } from "../api/public-types.js";

export class PointerState {
  private position: Point | null = null;

  update(position: Point): void {
    this.position = position;
  }

  clear(): void {
    this.position = null;
  }

  getPosition(): Point | null {
    return this.position ? { ...this.position } : null;
  }
}
