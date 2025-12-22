import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createProbe } from "./probe-runtime.mjs";

const targetsPath = process.env.AUTO_DEBUG_TARGETS;
const tracePath = process.env.AUTO_DEBUG_TRACE_PATH;
const limits = process.env.AUTO_DEBUG_LIMITS ? JSON.parse(process.env.AUTO_DEBUG_LIMITS) : {};

const probe = createProbe(limits);
globalThis.__AUTO_DEBUG_PROBE = probe;

async function main() {
  if (!targetsPath || !fs.existsSync(targetsPath)) {
    return;
  }
  const targets = JSON.parse(fs.readFileSync(targetsPath, "utf8"));
  for (const target of targets) {
    if (target.kind !== "class-method") continue;
    if (!target.dist) continue;
    const fileUrl = pathToFileURL(path.resolve(target.dist)).href;
    try {
      const mod = await import(fileUrl);
      const classRef = mod[target.className];
      const result = probe.wrapMethod(classRef, target.methodName, target.name);
      if (!result.ok) {
        recordSkip(target, result.reason);
      }
    } catch (error) {
      recordSkip(target, "import-failed", String(error));
    }
  }
}

const skipped = [];

function recordSkip(target, reason, message) {
  skipped.push({
    name: target.name,
    dist: target.dist,
    reason,
    message
  });
}

process.on("exit", () => {
  if (!tracePath) return;
  const state = probe.getState();
  const payload = {
    events: state.events,
    dropped: state.dropped,
    errors: state.errors,
    skipped
  };
  fs.mkdirSync(path.dirname(tracePath), { recursive: true });
  fs.writeFileSync(tracePath, JSON.stringify(payload, null, 2));
});

await main();
