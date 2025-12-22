import type { PaneLayout, PlotArea, Range, ScaleConfig, TimeAxisConfig } from "../../api/public-types.js";
import { generateNumericTicks, generateTimeTicks, type AxisTick } from "../axis.js";
import { computeSeriesDomain, type SeriesState } from "../series.js";
import { priceToY, timeToX } from "../transform.js";
import type { EngineContext } from "./context.js";
import { getCutoffTime } from "./replay-state.js";
import type { PaneRenderState, PaneState } from "./state.js";
import { arraysEqual } from "./util.js";

export function ensurePane(ctx: EngineContext, paneId: string): PaneState {
  const existing = ctx.panes.get(paneId);
  if (existing) return existing;
  const leftGutter = ctx.baseLeftGutterWidth;
  const rightGutter = ctx.baseRightGutterWidth;
  const pane: PaneState = {
    id: paneId,
    order: ctx.paneOrderCounter++,
    layoutWeight: 1,
    plotArea: {
      x: leftGutter,
      y: 0,
      width: Math.max(0, ctx.width - leftGutter - rightGutter),
      height: ctx.height
    },
    visibleRange: { startMs: 0, endMs: 1 },
    scaleDomains: new Map([["price", { min: 0, max: 1 }]]),
    autoScale: new Map([["price", true]]),
    scaleConfigs: new Map([["price", { position: "right", visible: true }]]),
    leftGutterWidth: leftGutter,
    rightGutterWidth: rightGutter,
    axisTicks: new Map(),
    timeTicks: [],
    primaryScaleId: "price",
    lastEmittedRange: null,
    renderWindow: null,
    dataWindowCoverage: null,
    pendingDataWindow: null,
    lastRequestedDataWindow: null,
    lastCoverageWarning: null,
    lastScaleConflict: null
  };
  ctx.panes.set(paneId, pane);
  recomputeLayout(ctx);
  updateAxisLayout(ctx, paneId);
  return pane;
}

export function ensureScale(ctx: EngineContext, paneId: string, scaleId: string): void {
  const pane = ensurePane(ctx, paneId);
  if (!pane.scaleDomains.has(scaleId)) {
    pane.scaleDomains.set(scaleId, { min: 0, max: 1 });
  }
  if (!pane.autoScale.has(scaleId)) {
    pane.autoScale.set(scaleId, true);
  }
  if (!pane.scaleConfigs.has(scaleId)) {
    pane.scaleConfigs.set(scaleId, { position: "right", visible: true });
  }
}

export function recomputeLayout(ctx: EngineContext): void {
  const panes = getOrderedPanes(ctx);
  if (panes.length === 0) return;
  const totalGap = ctx.paneGap * Math.max(0, panes.length - 1);
  const availableHeight = Math.max(1, ctx.height - totalGap);
  let weightSum = 0;
  for (const pane of panes) {
    weightSum += pane.layoutWeight;
  }
  if (weightSum <= 0) weightSum = panes.length;
  let yOffset = 0;
  for (let i = 0; i < panes.length; i += 1) {
    const pane = panes[i];
    const weight = pane.layoutWeight > 0 ? pane.layoutWeight : 1;
    const height =
      i === panes.length - 1
        ? Math.max(1, ctx.height - yOffset)
        : Math.max(1, Math.round((availableHeight * weight) / weightSum));
    const left = pane.leftGutterWidth;
    const right = pane.rightGutterWidth;
    pane.plotArea = {
      x: left,
      y: yOffset,
      width: Math.max(0, ctx.width - left - right),
      height
    };
    yOffset += height + ctx.paneGap;
    ctx.layoutEmitter.emit({ paneId: pane.id, plotArea: pane.plotArea, index: i, count: panes.length });
    ctx.transformEmitter.emit({ paneId: pane.id });
  }
}

export function getOrderedPanes(ctx: EngineContext): PaneState[] {
  return Array.from(ctx.panes.values()).sort((a, b) => a.order - b.order);
}

export function getPrimarySeries(ctx: EngineContext, paneId: string): SeriesState | null {
  for (const series of ctx.series.values()) {
    if (series.paneId === paneId) return series;
  }
  return null;
}

export function getPrimaryScaleId(ctx: EngineContext, paneId: string): string {
  const series = getPrimarySeries(ctx, paneId);
  return series?.scaleId ?? "price";
}

export function setViewportSize(ctx: EngineContext, width: number, height: number, devicePixelRatio?: number): void {
  ctx.width = width;
  ctx.height = height;
  if (devicePixelRatio !== undefined) {
    ctx.devicePixelRatio = devicePixelRatio;
  }
  recomputeLayout(ctx);
  for (const pane of ctx.panes.values()) {
    updateAxisLayout(ctx, pane.id);
  }
  ctx.renderer.resize?.(ctx.width, ctx.height, ctx.devicePixelRatio);
  ctx.transformEmitter.emit({ paneId: "price" });
  ctx.scheduler.requestFrame();
}

export function setAutoScale(ctx: EngineContext, paneId: string, scaleId: string, enabled: boolean): void {
  const pane = ensurePane(ctx, paneId);
  ensureScale(ctx, paneId, scaleId);
  pane.autoScale.set(scaleId, enabled);
  if (enabled) {
    updateScaleDomain(ctx, paneId);
  }
}

export function setScaleConfig(ctx: EngineContext, paneId: string, scaleId: string, config: ScaleConfig): void {
  const pane = ensurePane(ctx, paneId);
  ensureScale(ctx, paneId, scaleId);
  const current = pane.scaleConfigs.get(scaleId) ?? { position: "right", visible: true };
  const position = config.position ?? current.position;
  if (position !== "left" && position !== "right") {
    ctx.diagnostics.addError("scale.position.invalid", "scale position must be left or right", {
      paneId,
      scaleId,
      position
    });
    ctx.diagnosticsEmitter.emit();
    return;
  }
  pane.scaleConfigs.set(scaleId, {
    position,
    visible: config.visible ?? current.visible ?? true,
    tickCount: config.tickCount ?? current.tickCount,
    labelFormatter: config.labelFormatter ?? current.labelFormatter
  });
  updateAxisLayout(ctx, paneId);
  ctx.scheduler.requestFrame();
}

export function setTimeAxisConfig(ctx: EngineContext, config: TimeAxisConfig): void {
  ctx.timeAxisConfig = { ...ctx.timeAxisConfig, ...config };
  for (const pane of ctx.panes.values()) {
    updateAxisLayout(ctx, pane.id);
  }
  ctx.scheduler.requestFrame();
}

export function setPaneLayout(ctx: EngineContext, layout: PaneLayout): void {
  if (!Array.isArray(layout)) return;
  for (const entry of layout) {
    const pane = ensurePane(ctx, entry.paneId);
    const weight = entry.weight ?? 1;
    if (!Number.isFinite(weight) || weight <= 0) {
      ctx.diagnostics.addError("pane.layout.invalid", "pane layout weight must be positive", {
        paneId: entry.paneId,
        weight
      });
      continue;
    }
    pane.layoutWeight = weight;
  }
  recomputeLayout(ctx);
  for (const pane of ctx.panes.values()) {
    updateAxisLayout(ctx, pane.id);
  }
}

export function getPlotArea(ctx: EngineContext, paneId: string): PlotArea {
  const pane = ensurePane(ctx, paneId);
  return { ...pane.plotArea };
}

export function getRightGutterWidth(ctx: EngineContext, paneId: string): number {
  return ensurePane(ctx, paneId).rightGutterWidth;
}

export function setScaleDomain(ctx: EngineContext, paneId: string, scaleId: string, domain: { min: number; max: number }): void {
  const pane = ensurePane(ctx, paneId);
  ensureScale(ctx, paneId, scaleId);
  pane.scaleDomains.set(scaleId, domain);
  pane.autoScale.set(scaleId, false);
  ctx.transformEmitter.emit({ paneId });
  updateAxisLayout(ctx, paneId);
  ctx.scheduler.requestFrame();
}

export function updateScaleDomain(ctx: EngineContext, paneId: string): void {
  const pane = ensurePane(ctx, paneId);
  const cutoffTime = getCutoffTime(ctx);
  const range: Range = {
    startMs: pane.visibleRange.startMs,
    endMs: cutoffTime !== undefined ? Math.min(pane.visibleRange.endMs, cutoffTime) : pane.visibleRange.endMs
  };
  const merged = new Map<string, { min: number; max: number }>();
  for (const series of ctx.series.values()) {
    if (series.paneId !== paneId) continue;
    if (pane.autoScale.get(series.scaleId) === false) continue;
    const domain = computeSeriesDomain(series, range);
    if (!domain) continue;
    const existing = merged.get(series.scaleId);
    if (!existing) {
      merged.set(series.scaleId, domain);
    } else {
      merged.set(series.scaleId, {
        min: Math.min(existing.min, domain.min),
        max: Math.max(existing.max, domain.max)
      });
    }
  }
  if (merged.size === 0) {
    updateAxisLayout(ctx, paneId);
    return;
  }
  for (const [scaleId, domain] of merged.entries()) {
    pane.scaleDomains.set(scaleId, domain);
  }
  ctx.transformEmitter.emit({ paneId });
  updateAxisLayout(ctx, paneId);
}

export function updateAxisLayout(ctx: EngineContext, paneId: string, allowGutterUpdate = true): void {
  const pane = ensurePane(ctx, paneId);
  const layout = computeAxisLayout(ctx, pane);
  pane.axisTicks = layout.axisTicks;
  pane.timeTicks = layout.timeTicks;
  pane.primaryScaleId = layout.primaryScaleId;

  const leftChanged = Math.abs(layout.leftGutterWidth - pane.leftGutterWidth) > 2;
  const rightChanged = Math.abs(layout.rightGutterWidth - pane.rightGutterWidth) > 2;
  if (allowGutterUpdate && (leftChanged || rightChanged)) {
    pane.leftGutterWidth = layout.leftGutterWidth;
    pane.rightGutterWidth = layout.rightGutterWidth;
    recomputeLayout(ctx);
    updateAxisLayout(ctx, paneId, false);
  }
}

export function computeAxisLayout(
  ctx: EngineContext,
  pane: PaneState
): {
  axisTicks: Map<string, AxisTick[]>;
  timeTicks: AxisTick[];
  leftGutterWidth: number;
  rightGutterWidth: number;
  primaryScaleId: string;
} {
  const axisTicks = new Map<string, AxisTick[]>();
  const primaryScaleId = getPrimaryScaleId(ctx, pane.id);
  const labelHeight = Math.max(8, ctx.axisLabelHeight);
  const targetCount = Math.max(2, Math.floor(pane.plotArea.height / (labelHeight + ctx.axisLabelPadding)));

  let maxLeftLabel = 0;
  let maxRightLabel = 0;
  for (const [scaleId, config] of pane.scaleConfigs.entries()) {
    if (config.visible === false) {
      axisTicks.set(scaleId, []);
      continue;
    }
    const domain = pane.scaleDomains.get(scaleId);
    if (!domain) {
      axisTicks.set(scaleId, []);
      continue;
    }
    const ticks = generateNumericTicks(
      domain.min,
      domain.max,
      config.tickCount ?? targetCount,
      config.labelFormatter
    );
    for (const tick of ticks) {
      const width = measureLabelWidth(ctx, tick.label);
      if (config.position === "left") {
        maxLeftLabel = Math.max(maxLeftLabel, width);
      } else {
        maxRightLabel = Math.max(maxRightLabel, width);
      }
    }
    axisTicks.set(scaleId, filterNumericTicks(ctx, pane, scaleId, ticks));
  }

  const leftGutterWidth = Math.max(ctx.baseLeftGutterWidth, maxLeftLabel + ctx.axisLabelPadding * 2);
  const rightGutterWidth = Math.max(ctx.baseRightGutterWidth, maxRightLabel + ctx.axisLabelPadding * 2);

  const timePixelWidth = ctx.timeAxisConfig.tickCount
    ? ctx.timeAxisConfig.tickCount * 90
    : pane.plotArea.width;
  const timeTicksRaw = generateTimeTicks(pane.visibleRange, timePixelWidth, ctx.timeAxisConfig.labelFormatter);
  const timeTicks = filterTimeTicks(ctx, pane, timeTicksRaw);

  return {
    axisTicks,
    timeTicks,
    leftGutterWidth,
    rightGutterWidth,
    primaryScaleId
  };
}

export function filterTimeTicks(ctx: EngineContext, pane: PaneState, ticks: AxisTick[]): AxisTick[] {
  if (ticks.length <= 2) return ticks;
  const minGap = Math.max(4, ctx.axisLabelPadding);
  let lastRight = -Infinity;
  const result: AxisTick[] = [];
  for (const tick of ticks) {
    const x = timeToX(pane.visibleRange, pane.plotArea, tick.value);
    if (x === null) continue;
    const width = measureLabelWidth(ctx, tick.label);
    const left = x - width / 2;
    const right = x + width / 2;
    if (left >= lastRight + minGap) {
      result.push(tick);
      lastRight = right;
    }
  }
  return result;
}

export function filterNumericTicks(ctx: EngineContext, pane: PaneState, scaleId: string, ticks: AxisTick[]): AxisTick[] {
  if (ticks.length <= 2) return ticks;
  const domain = pane.scaleDomains.get(scaleId);
  if (!domain) return ticks;
  const labelHeight = Math.max(8, ctx.axisLabelHeight);
  const minGap = labelHeight + ctx.axisLabelPadding;
  const candidates: { tick: AxisTick; y: number }[] = [];
  for (const tick of ticks) {
    const y = priceToY(domain, pane.plotArea, tick.value);
    if (y === null) continue;
    candidates.push({ tick, y });
  }
  if (candidates.length <= 2) return ticks;
  candidates.sort((a, b) => a.y - b.y);
  const kept = new Set<AxisTick>();
  let lastBottom = -Infinity;
  for (const candidate of candidates) {
    const top = candidate.y - labelHeight / 2;
    const bottom = candidate.y + labelHeight / 2;
    if (top >= lastBottom + minGap) {
      kept.add(candidate.tick);
      lastBottom = bottom;
    }
  }
  return ticks.filter((tick) => kept.has(tick));
}

export function enforceSingleScalePerSide(
  ctx: EngineContext,
  pane: PaneState,
  left: PaneRenderState["axis"]["left"],
  right: PaneRenderState["axis"]["right"]
): { left: PaneRenderState["axis"]["left"]; right: PaneRenderState["axis"]["right"] } {
  const leftVisible = left.filter((item) => item.visible);
  const rightVisible = right.filter((item) => item.visible);
  const nextConflictState = {
    left: leftVisible.map((item) => item.scaleId),
    right: rightVisible.map((item) => item.scaleId)
  };
  if (
    pane.lastScaleConflict === null ||
    !arraysEqual(pane.lastScaleConflict.left, nextConflictState.left) ||
    !arraysEqual(pane.lastScaleConflict.right, nextConflictState.right)
  ) {
    if (leftVisible.length > 1) {
      const kept = pickScaleToKeep(leftVisible, pane.primaryScaleId);
      ctx.diagnostics.addWarn("axis.scale.overlap", "multiple visible scales on left side; hiding extras", {
        paneId: pane.id,
        side: "left",
        visibleScaleIds: nextConflictState.left,
        keptScaleId: kept
      });
      ctx.diagnosticsEmitter.emit();
      for (const item of left) {
        item.visible = item.scaleId === kept;
      }
    }
    if (rightVisible.length > 1) {
      const kept = pickScaleToKeep(rightVisible, pane.primaryScaleId);
      ctx.diagnostics.addWarn("axis.scale.overlap", "multiple visible scales on right side; hiding extras", {
        paneId: pane.id,
        side: "right",
        visibleScaleIds: nextConflictState.right,
        keptScaleId: kept
      });
      ctx.diagnosticsEmitter.emit();
      for (const item of right) {
        item.visible = item.scaleId === kept;
      }
    }
    pane.lastScaleConflict = nextConflictState;
  }
  return { left, right };
}

export function pickScaleToKeep(scales: Array<{ scaleId: string }>, primaryScaleId: string): string {
  const preferred = scales.find((scale) => scale.scaleId === primaryScaleId);
  return preferred?.scaleId ?? scales[0]?.scaleId ?? primaryScaleId;
}

export function measureLabelWidth(ctx: EngineContext, text: string): number {
  if (ctx.axisLabelMeasure) {
    const measured = ctx.axisLabelMeasure(text);
    if (Number.isFinite(measured)) return Math.max(0, measured);
  }
  return text.length * ctx.axisLabelCharWidth;
}
