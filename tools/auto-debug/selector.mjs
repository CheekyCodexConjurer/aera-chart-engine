import path from "node:path";
import { normalizePath } from "./utils.mjs";

export function parseStackTraces(text) {
  const lines = text.split(/\r?\n/);
  const frames = [];
  const patterns = [
    /\(([^)]+):(\d+):(\d+)\)/,
    /at\s+([^ ]+):(\d+):(\d+)/,
    /file:\/\/\/([^:]+):(\d+):(\d+)/
  ];
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) {
        const rawPath = normalizePath(match[1]);
        const filePath = normalizePath(rawPath);
        const lineNum = Number(match[2]);
        if (Number.isFinite(lineNum)) {
          frames.push({ file: filePath, line: lineNum, raw: line.trim() });
        }
        break;
      }
    }
  }
  return frames;
}

export function selectTargets(index, selectors, frames, repoRoot) {
  const candidates = new Map();
  const symbols = index.symbols ?? [];
  const normalizedFrames = frames.map((frame) => ({
    ...frame,
    file: normalizeRepoPath(frame.file, repoRoot)
  }));

  if (selectors && Array.isArray(selectors)) {
    for (const selector of selectors) {
      if (!selector) continue;
      if (selector.type === "symbol") {
        for (const symbol of symbols) {
          if (symbol.name === selector.value) {
            candidates.set(symbolKey(symbol), symbol);
          }
        }
      }
      if (selector.type === "regex") {
        const regex = new RegExp(selector.value);
        for (const symbol of symbols) {
          if (regex.test(symbol.name)) {
            candidates.set(symbolKey(symbol), symbol);
          }
        }
      }
      if (selector.type === "file") {
        const normalized = normalizeRepoPath(selector.value, repoRoot);
        for (const symbol of symbols) {
          if (symbol.file === normalized) {
            candidates.set(symbolKey(symbol), symbol);
          }
        }
      }
    }
  }

  for (const frame of normalizedFrames) {
    if (!frame.file) continue;
    const matches = symbols.filter((symbol) => {
      if (symbol.file !== frame.file) return false;
      return frame.line >= symbol.startLine && frame.line <= symbol.endLine;
    });
    if (matches.length > 0) {
      const best = matches.sort((a, b) => (a.endLine - a.startLine) - (b.endLine - b.startLine))[0];
      candidates.set(symbolKey(best), best);
    }
  }

  return Array.from(candidates.values());
}

function symbolKey(symbol) {
  return `${symbol.file}:${symbol.name}:${symbol.startLine}`;
}

function normalizeRepoPath(filePath, repoRoot) {
  if (!filePath) return filePath;
  let normalized = filePath.replace(/^file:\/\//, "");
  normalized = normalized.replace(/\\/g, "/");
  if (normalized.includes("/dist/")) {
    normalized = normalized.replace("/dist/", "/src/");
    normalized = normalized.replace(/\.js$/, ".ts");
  }
  if (normalized.includes(repoRoot.replace(/\\/g, "/"))) {
    normalized = path.posix.relative(repoRoot.replace(/\\/g, "/"), normalized);
  }
  return normalized;
}
