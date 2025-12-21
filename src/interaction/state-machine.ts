export type InteractionState =
  | "idle"
  | "hover"
  | "active-drag"
  | "active-zoom"
  | "selection"
  | "disabled";

export class InteractionStateMachine {
  private state: InteractionState = "idle";

  getState(): InteractionState {
    return this.state;
  }

  setState(next: InteractionState): void {
    this.state = next;
  }
}
