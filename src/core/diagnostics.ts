import { Diagnostic, DiagnosticSeverity } from "../api/public-types.js";

export class DiagnosticsStore {
  private diagnostics: Diagnostic[] = [];

  add(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  addError(code: string, message: string, context?: Record<string, unknown>): void {
    this.add({ code, message, severity: "error", recoverable: false, context });
  }

  addWarn(code: string, message: string, context?: Record<string, unknown>): void {
    this.add({ code, message, severity: "warn", recoverable: true, context });
  }

  addInfo(code: string, message: string, context?: Record<string, unknown>): void {
    this.add({ code, message, severity: "info", recoverable: true, context });
  }

  addFatal(code: string, message: string, context?: Record<string, unknown>): void {
    this.add({ code, message, severity: "fatal", recoverable: false, context });
  }

  getAll(): Diagnostic[] {
    return [...this.diagnostics];
  }

  drain(): Diagnostic[] {
    const drained = [...this.diagnostics];
    this.diagnostics = [];
    return drained;
  }

  hasSeverity(severity: DiagnosticSeverity): boolean {
    return this.diagnostics.some((diag) => diag.severity === severity);
  }
}
