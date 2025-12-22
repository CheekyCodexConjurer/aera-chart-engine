import fs from "node:fs";
import path from "node:path";

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function writeText(filePath, text) {
  fs.writeFileSync(filePath, text);
}

export function nowIso() {
  return new Date().toISOString();
}

export function createRunId(prefix = "run") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}`;
}

export function normalizePath(input) {
  if (!input) return input;
  if (input.startsWith("file:///")) {
    return decodeURIComponent(input.slice("file:///".length));
  }
  return input;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function relativePosix(root, target) {
  const rel = path.relative(root, target);
  return rel.split(path.sep).join("/");
}

export function parseArgs(argv) {
  const args = { config: null, mode: "full", probe: "auto" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config" && argv[i + 1]) {
      args.config = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--mode=")) {
      args.mode = arg.slice("--mode=".length);
    } else if (arg === "--mode" && argv[i + 1]) {
      args.mode = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--probe=")) {
      args.probe = arg.slice("--probe=".length);
    } else if (arg === "--probe" && argv[i + 1]) {
      args.probe = argv[i + 1];
      i += 1;
    }
  }
  return args;
}
