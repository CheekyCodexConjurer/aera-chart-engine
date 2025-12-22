import { performance } from "node:perf_hooks";

const WRAP_MARK = Symbol.for("autoDebugWrapped");

export function createProbe(options) {
  const state = {
    maxEvents: options.maxEvents ?? 5000,
    sampleRate: options.sampleRate ?? 1,
    maxDepth: options.maxDepth ?? 16,
    events: [],
    dropped: 0,
    errors: 0,
    depth: 0
  };

  function shouldSample() {
    return Math.random() <= state.sampleRate;
  }

  function record(event) {
    if (state.events.length >= state.maxEvents) {
      state.dropped += 1;
      return;
    }
    state.events.push(event);
  }

  function wrapMethod(classRef, methodName, id) {
    if (!classRef || !classRef.prototype) {
      return { ok: false, reason: "missing-class" };
    }
    const original = classRef.prototype[methodName];
    if (typeof original !== "function") {
      return { ok: false, reason: "missing-method" };
    }
    if (original[WRAP_MARK]) {
      return { ok: true, reason: "already-wrapped" };
    }
    const wrapped = function (...args) {
      if (state.depth >= state.maxDepth || !shouldSample()) {
        return original.apply(this, args);
      }
      state.depth += 1;
      const start = performance.now();
      try {
        return original.apply(this, args);
      } catch (error) {
        state.errors += 1;
        record({
          id,
          type: "error",
          message: String(error),
          durationMs: performance.now() - start
        });
        throw error;
      } finally {
        record({
          id,
          type: "exit",
          durationMs: performance.now() - start
        });
        state.depth -= 1;
      }
    };
    wrapped[WRAP_MARK] = true;
    classRef.prototype[methodName] = wrapped;
    return { ok: true, reason: "wrapped" };
  }

  return {
    wrapMethod,
    getState: () => ({ ...state, events: [...state.events] })
  };
}
