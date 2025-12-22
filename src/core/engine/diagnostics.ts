import type { Diagnostic, EngineMetricsSnapshot, LogEvent, LogLevel } from "../../api/public-types.js";
import { ENGINE_CONTRACT_VERSION, ENGINE_VERSION } from "../version.js";
import type { EngineContext } from "./context.js";

export function getDiagnostics(ctx: EngineContext): ReadonlyArray<ReturnType<EngineContext["diagnostics"]["getAll"]>[number]> {
  return ctx.diagnostics.getAll();
}

export function getEngineInfo(): { engineVersion: string; engineContractVersion: string } {
  return { engineVersion: ENGINE_VERSION, engineContractVersion: ENGINE_CONTRACT_VERSION };
}

export function getLogs(ctx: EngineContext): ReadonlyArray<LogEvent> {
  return ctx.logStore.getAll();
}

export function getMetrics(ctx: EngineContext): EngineMetricsSnapshot {
  return {
    renderer: ctx.renderer.getMetrics?.() ?? null,
    engine: { ...ctx.engineMetrics }
  };
}

export function recordLog(
  ctx: EngineContext,
  level: LogLevel,
  eventType: string,
  context?: Record<string, unknown>
): void {
  ctx.logStore.add({
    timestamp: new Date().toISOString(),
    sessionId: ctx.sessionId,
    chartId: ctx.chartId,
    engineVersion: ENGINE_VERSION,
    engineContractVersion: ENGINE_CONTRACT_VERSION,
    level,
    eventType,
    context
  });
}

export function recordDiagnostic(ctx: EngineContext, diagnostic: Diagnostic): void {
  const level = diagnostic.severity === "fatal" ? "fatal" : diagnostic.severity;
  recordLog(ctx, level, "diagnostic_emitted", {
    code: diagnostic.code,
    message: diagnostic.message,
    severity: diagnostic.severity,
    recoverable: diagnostic.recoverable,
    context: diagnostic.context
  });
}
