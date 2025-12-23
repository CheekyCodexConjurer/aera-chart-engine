export type InteractionState =
  | "idle"
  | "hover"
  | "active-drag"
  | "active-zoom"
  | "selection"
  | "disabled";

export class InteractionStateMachine {
  private state: InteractionState = "idle";
  constructor(
    private onInvalidTransition?: (from: InteractionState, to: InteractionState) => void
  ) {}

  getState(): InteractionState {
    return this.state;
  }

  setState(next: InteractionState): void {
    if (this.state === next) return;
    if (!isTransitionAllowed(this.state, next)) {
      this.onInvalidTransition?.(this.state, next);
    }
    this.state = next;
  }
}

const ALLOWED_TRANSITIONS: Record<InteractionState, Set<InteractionState>> = {
  idle: new Set(["hover", "active-drag", "active-zoom", "selection", "disabled"]),
  hover: new Set(["idle", "active-drag", "active-zoom", "selection", "disabled"]),
  "active-drag": new Set(["idle", "selection", "disabled"]),
  "active-zoom": new Set(["idle", "disabled"]),
  selection: new Set(["idle", "disabled"]),
  disabled: new Set(["idle", "hover"])
};

function isTransitionAllowed(from: InteractionState, to: InteractionState): boolean {
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}
