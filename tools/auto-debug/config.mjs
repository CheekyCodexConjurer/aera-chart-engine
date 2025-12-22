import path from "node:path";
import { readJson } from "./utils.mjs";

const DEFAULT_CONFIG = {
  version: "0.1.0",
  artifactsDir: "artifacts/auto-debug",
  run: {
    commands: [
      { id: "check", cmd: "npm run check" },
      { id: "ui-smoke", cmd: "npm run test:ui:smoke" }
    ],
    tests: []
  },
  targets: {
    fromStacks: true,
    selectors: []
  },
  probe: {
    enabled: true,
    sampleRate: 1,
    maxEvents: 5000,
    maxDepth: 16
  },
  limits: {
    maxCommandMs: 120000,
    maxReportLines: 200
  },
  allowlist: [
    "npm run check",
    "npm run test:ui:smoke",
    "node tests/",
    "node tools/bench/"
  ]
};

export function loadConfig(repoRoot, configPath) {
  const resolved = configPath
    ? path.resolve(repoRoot, configPath)
    : path.resolve(repoRoot, "auto-debug.config.json");
  const config = readJson(resolved, {});
  return {
    path: resolved,
    config: mergeDefaults(DEFAULT_CONFIG, config ?? {})
  };
}

function mergeDefaults(base, override) {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }
  if (typeof base !== "object" || base === null) {
    return override ?? base;
  }
  const result = { ...base };
  const source = override ?? {};
  for (const key of Object.keys(source)) {
    result[key] = mergeDefaults(base[key], source[key]);
  }
  return result;
}
