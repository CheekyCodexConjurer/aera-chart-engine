import type {
  OverlayBatch,
  OverlayLayoutItem,
  RightLabelOverlayData,
  TableOverlayData
} from "../../api/public-types.js";
import { enforceOverlayCaps, isOverlaySupported, type OverlayRenderItem, validateOverlay } from "../overlays.js";
import { priceToY } from "../transform.js";
import type { EngineContext } from "./context.js";
import { getPrimaryScaleId } from "./axis-layout.js";

export function setOverlays(ctx: EngineContext, batch: OverlayBatch): void {
  const accepted: typeof batch.overlays = [];
  let diagnosticsChanged = false;
  for (const overlay of batch.overlays) {
    if (!isOverlaySupported(overlay.type)) {
      ctx.diagnostics.addWarn("overlay.unsupported", "overlay type is not supported", {
        batchId: batch.batchId,
        overlayId: overlay.id,
        type: overlay.type
      });
      diagnosticsChanged = true;
      continue;
    }
    const capped = enforceOverlayCaps(overlay);
    const cappedOverlay = capped.overlay;
    if (capped.capped) {
      ctx.diagnostics.addWarn("overlay.points.capped", "overlay points capped to limit", {
        batchId: batch.batchId,
        overlayId: cappedOverlay.id,
        type: cappedOverlay.type,
        cap: capped.cap,
        originalCount: capped.originalCount
      });
      diagnosticsChanged = true;
    }
    const issues = validateOverlay(cappedOverlay);
    if (issues.length > 0) {
      for (const issue of issues) {
        ctx.diagnostics.addError(issue.code, issue.message, {
          batchId: batch.batchId,
          overlayId: cappedOverlay.id,
          type: cappedOverlay.type,
          ...issue.context
        });
        diagnosticsChanged = true;
      }
      continue;
    }
    const paneId = cappedOverlay.paneId ?? "price";
    const pane = ctx.panes.get(paneId);
    if (!pane) {
      ctx.diagnostics.addError("overlay.pane.missing", "overlay pane does not exist", {
        batchId: batch.batchId,
        overlayId: cappedOverlay.id,
        paneId
      });
      diagnosticsChanged = true;
      continue;
    }
    const scaleId = cappedOverlay.scaleId ?? getPrimaryScaleId(ctx, paneId);
    if (!pane.scaleDomains.has(scaleId)) {
      ctx.diagnostics.addError("overlay.scale.missing", "overlay scale does not exist", {
        batchId: batch.batchId,
        overlayId: cappedOverlay.id,
        paneId,
        scaleId
      });
      diagnosticsChanged = true;
      continue;
    }
    accepted.push({ ...cappedOverlay, paneId, scaleId });
  }
  ctx.overlays.setBatch({ ...batch, overlays: accepted });
  if (diagnosticsChanged) {
    ctx.diagnosticsEmitter.emit();
  }
  ctx.scheduler.requestFrame();
}

export function removeOverlayBatch(ctx: EngineContext, batchId: string): void {
  ctx.overlays.removeBatch(batchId);
  ctx.scheduler.requestFrame();
}

export function emitOverlayLayout(ctx: EngineContext, overlays: OverlayRenderItem[]): void {
  if (!ctx.overlayLayoutEmitter.hasListeners()) return;
  const items = buildOverlayLayoutItems(ctx, overlays);
  ctx.overlayLayoutEmitter.emit({ frameId: ctx.frameId, items });
}

export function buildOverlayLayoutItems(ctx: EngineContext, overlays: OverlayRenderItem[]): OverlayLayoutItem[] {
  const items: OverlayLayoutItem[] = [];
  for (const item of overlays) {
    const overlay = item.overlay;
    if (overlay.type === "table") {
      const data = item.clippedData as TableOverlayData | null;
      if (!data || !Array.isArray(data.rows) || data.rows.length === 0) continue;
      const paneId = overlay.paneId ?? "price";
      const pane = ctx.panes.get(paneId);
      if (!pane) continue;
      const position = data.position ?? "top-right";
      items.push({
        type: "table",
        overlayId: overlay.id,
        paneId,
        position,
        plotArea: { ...pane.plotArea },
        rightGutterWidth: pane.rightGutterWidth,
        rows: data.rows,
        anchorTimeMs: data.anchorTimeMs,
        layer: overlay.layer,
        zIndex: overlay.zIndex
      });
    }
    if (overlay.type === "right-label") {
      const data = item.clippedData as RightLabelOverlayData | null;
      if (!data || !Array.isArray(data.labels) || data.labels.length === 0) continue;
      const paneId = overlay.paneId ?? "price";
      const pane = ctx.panes.get(paneId);
      if (!pane) continue;
      const scaleId = overlay.scaleId ?? getPrimaryScaleId(ctx, paneId);
      const domain = pane.scaleDomains.get(scaleId);
      if (!domain) {
        ctx.diagnostics.addError("overlay.scale.missing", "overlay scale does not exist", {
          overlayId: overlay.id,
          paneId,
          scaleId
        });
        ctx.diagnosticsEmitter.emit();
        continue;
      }
      for (const label of data.labels) {
        const y = priceToY(domain, pane.plotArea, label.price);
        if (y === null) continue;
        items.push({
          type: "right-label",
          overlayId: overlay.id,
          labelId: label.id,
          paneId,
          scaleId,
          plotArea: { ...pane.plotArea },
          rightGutterWidth: pane.rightGutterWidth,
          price: label.price,
          text: label.text,
          timeMs: label.timeMs,
          color: label.color,
          sizePx: label.sizePx,
          y,
          layer: overlay.layer,
          zIndex: overlay.zIndex
        });
      }
    }
  }
  return items;
}
