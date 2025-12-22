import type { CrosshairEvent, HitTestEvent, KeyCommand, Range, TimeMs } from "../../api/public-types.js";
import type { EngineContext } from "./context.js";
import { ensurePane, getPrimaryScaleId, getPrimarySeries } from "./axis-layout.js";
import { clampRangeToReplay, clampZoomSpan } from "./replay-state.js";
import { resetAroundAnchor, resetToLatest } from "./replay.js";
import { emitVisibleRange } from "./windowing.js";
import { computeHitTest, findNearestTime, xToTime, yToPrice } from "./coordinates.js";
import { isPointInside } from "./util.js";

export function handleKeyCommand(ctx: EngineContext, paneId: string, command: KeyCommand, anchorTimeMs?: TimeMs): void {
  const pane = ensurePane(ctx, paneId);
  if (ctx.interaction.getState() === "disabled") return;
  switch (command) {
    case "pan-left":
      panByFraction(ctx, pane, -ctx.keyboardPanFraction);
      break;
    case "pan-right":
      panByFraction(ctx, pane, ctx.keyboardPanFraction);
      break;
    case "zoom-in": {
      const centerX = pane.plotArea.x + pane.plotArea.width * 0.5;
      zoomAt(ctx, paneId, centerX, ctx.keyboardZoomFactor);
      break;
    }
    case "zoom-out": {
      const centerX = pane.plotArea.x + pane.plotArea.width * 0.5;
      zoomAt(ctx, paneId, centerX, 1 / ctx.keyboardZoomFactor);
      break;
    }
    case "reset-latest":
      resetToLatest(ctx, paneId);
      break;
    case "reset-anchor":
      if (anchorTimeMs === undefined) {
        ctx.diagnostics.addError("keyboard.anchor.missing", "anchor time is required for reset-anchor", {
          paneId
        });
        ctx.diagnosticsEmitter.emit();
        return;
      }
      resetAroundAnchor(ctx, anchorTimeMs, paneId);
      break;
    default:
      ctx.diagnostics.addWarn("keyboard.command.unknown", "keyboard command not supported", {
        paneId,
        command
      });
      ctx.diagnosticsEmitter.emit();
      break;
  }
}

export function handlePointerMove(ctx: EngineContext, paneId: string, x: number, y: number): void {
  const pane = ensurePane(ctx, paneId);
  if (ctx.interaction.getState() === "disabled") return;
  const state = ctx.interaction.getState();
  const isCaptured = ctx.pointerCapturePaneId === paneId;
  if (!isCaptured && !isPointInside(pane.plotArea, x, y)) {
    clearPointer(ctx, paneId);
    return;
  }
  ctx.pointer.update({ x, y });
  if (state === "active-drag" || state === "active-zoom" || state === "selection") {
    return;
  }
  ctx.interaction.setState("hover");
  const timeMs = xToTime(ctx, paneId, x);
  if (timeMs === null) {
    clearPointer(ctx, paneId);
    return;
  }
  const price = yToPrice(ctx, paneId, getPrimaryScaleId(ctx, paneId), y);
  const nearest = findNearestTime(ctx, paneId, timeMs);
  const event: CrosshairEvent = {
    paneId,
    timeMs,
    nearestTimeMs: nearest,
    price,
    screen: { x, y }
  };
  ctx.crosshairState = event;
  queueCrosshairMove(ctx, event);
  if (ctx.hitTestEmitter.hasListeners()) {
    queueHitTest(ctx, computeHitTest(ctx, paneId, timeMs, x, y));
  }
  ctx.scheduler.requestFrame();
}

export function handlePointerClick(ctx: EngineContext, paneId: string, x: number, y: number): void {
  ensurePane(ctx, paneId);
  if (ctx.interaction.getState() === "disabled") return;
  const timeMs = xToTime(ctx, paneId, x);
  if (timeMs === null) return;
  const price = yToPrice(ctx, paneId, getPrimaryScaleId(ctx, paneId), y);
  const nearest = findNearestTime(ctx, paneId, timeMs);
  ctx.crosshairClickEmitter.emit({
    paneId,
    timeMs,
    nearestTimeMs: nearest,
    price,
    screen: { x, y }
  });
}

export function clearPointer(ctx: EngineContext, paneId?: string): void {
  if (ctx.pointerCapturePaneId) return;
  if (paneId && ctx.crosshairState?.paneId !== paneId) return;
  ctx.pointer.clear();
  ctx.crosshairState = null;
  if (!paneId) {
    ctx.pendingHitTest = null;
  }
  if (ctx.interaction.getState() === "hover") {
    ctx.interaction.setState("idle");
  }
  ctx.scheduler.requestFrame();
}

export function beginPan(ctx: EngineContext, paneId: string, x: number): void {
  const pane = ensurePane(ctx, paneId);
  if (ctx.interaction.getState() === "disabled") return;
  ctx.interaction.setState("active-drag");
  ctx.pointerCapturePaneId = paneId;
  ctx.crosshairState = null;
  ctx.pendingHitTest = null;
  ctx.scheduler.requestFrame();
  ctx.panAnchor = { paneId, range: { ...pane.visibleRange }, screenX: x };
}

export function updatePan(ctx: EngineContext, paneId: string, x: number): void {
  if (!ctx.panAnchor || ctx.panAnchor.paneId !== paneId) return;
  const pane = ensurePane(ctx, paneId);
  const span = ctx.panAnchor.range.endMs - ctx.panAnchor.range.startMs;
  const deltaX = x - ctx.panAnchor.screenX;
  const deltaTime = -(deltaX / pane.plotArea.width) * span;
  const range: Range = {
    startMs: ctx.panAnchor.range.startMs + deltaTime,
    endMs: ctx.panAnchor.range.endMs + deltaTime
  };
  pane.visibleRange = clampRangeToReplay(ctx, range, getPrimarySeries(ctx, paneId));
  emitVisibleRange(ctx, paneId, pane.visibleRange);
}

export function handleWheelZoom(ctx: EngineContext, paneId: string, x: number, deltaY: number, zoomSpeed = 0.002): void {
  if (ctx.interaction.getState() === "disabled") return;
  if (!Number.isFinite(deltaY)) return;
  const speed = Math.max(0.0001, zoomSpeed);
  const factor = Math.exp(-deltaY * speed);
  if (!Number.isFinite(factor) || factor <= 0) return;
  zoomAt(ctx, paneId, x, factor);
}

export function zoomAt(ctx: EngineContext, paneId: string, x: number, zoomFactor: number): void {
  if (!Number.isFinite(zoomFactor) || zoomFactor <= 0) {
    ctx.diagnostics.addError("zoom.invalid", "zoom factor must be a positive number", {
      paneId,
      zoomFactor
    });
    ctx.diagnosticsEmitter.emit();
    return;
  }
  const pane = ensurePane(ctx, paneId);
  const range = pane.visibleRange;
  const anchorTime = xToTime(ctx, paneId, x) ?? (range.startMs + range.endMs) * 0.5;
  const span = range.endMs - range.startMs;
  const nextSpan = clampZoomSpan(ctx, span / zoomFactor, getPrimarySeries(ctx, paneId));
  const ratio = span > 0 ? (anchorTime - range.startMs) / span : 0.5;
  const startMs = anchorTime - ratio * nextSpan;
  const endMs = startMs + nextSpan;
  ctx.interaction.setState("active-zoom");
  pane.visibleRange = clampRangeToReplay(ctx, { startMs, endMs }, getPrimarySeries(ctx, paneId));
  emitVisibleRange(ctx, paneId, pane.visibleRange);
  ctx.interaction.setState("idle");
}

export function endPan(ctx: EngineContext): void {
  if (ctx.interaction.getState() === "active-drag") {
    ctx.interaction.setState("idle");
  }
  ctx.panAnchor = null;
  ctx.pointerCapturePaneId = null;
}

export function queueCrosshairMove(ctx: EngineContext, event: CrosshairEvent): void {
  ctx.pendingCrosshairMove = event;
  if (ctx.crosshairMoveScheduled) return;
  ctx.crosshairMoveScheduled = true;
  const emit = () => {
    ctx.crosshairMoveScheduled = false;
    const pending = ctx.pendingCrosshairMove;
    ctx.pendingCrosshairMove = null;
    if (pending) {
      ctx.crosshairMoveEmitter.emit(pending);
    }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(emit);
  } else {
    queueMicrotask(emit);
  }
}

export function queueHitTest(ctx: EngineContext, event: HitTestEvent): void {
  ctx.pendingHitTest = event;
  if (ctx.hitTestScheduled) return;
  ctx.hitTestScheduled = true;
  const emit = () => {
    ctx.hitTestScheduled = false;
    const pending = ctx.pendingHitTest;
    ctx.pendingHitTest = null;
    if (pending) {
      ctx.hitTestEmitter.emit(pending);
    }
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(emit);
  } else {
    queueMicrotask(emit);
  }
}

export function flushPendingCrosshairMove(ctx: EngineContext): void {
  const pending = ctx.pendingCrosshairMove;
  if (!pending) {
    ctx.crosshairMoveScheduled = false;
    return;
  }
  ctx.pendingCrosshairMove = null;
  ctx.crosshairMoveScheduled = false;
  ctx.crosshairMoveEmitter.emit(pending);
}

export function panByFraction(ctx: EngineContext, pane: { id: string; visibleRange: Range }, fraction: number): void {
  if (!Number.isFinite(fraction) || fraction === 0) return;
  const span = pane.visibleRange.endMs - pane.visibleRange.startMs;
  const delta = span * fraction;
  const range: Range = {
    startMs: pane.visibleRange.startMs + delta,
    endMs: pane.visibleRange.endMs + delta
  };
  pane.visibleRange = clampRangeToReplay(ctx, range, getPrimarySeries(ctx, pane.id));
  emitVisibleRange(ctx, pane.id, pane.visibleRange);
}
