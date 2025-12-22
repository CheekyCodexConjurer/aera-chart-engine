import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { buildIndex } from "./indexer.mjs";
import { parseStackTraces, selectTargets } from "./selector.mjs";
import { isCommandAllowed } from "./safety.mjs";
import { createRunId, ensureDir, nowIso, parseArgs, readJson, writeJson, writeText } from "./utils.mjs";
import { writeReport } from "./report.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

const args = parseArgs(process.argv);
const { config, path: configPath } = loadConfig(repoRoot, args.config);
const runId = createRunId("auto-debug");
const mode = args.mode ?? "full";

const artifactDir = path.resolve(repoRoot, config.artifactsDir ?? "artifacts/auto-debug", runId);
ensureDir(artifactDir);

const runMeta = {
  runId,
  timestamp: nowIso(),
  repoRoot,
  mode,
  configPath
};
writeJson(path.join(artifactDir, "run.json"), runMeta);

const index = buildIndex(repoRoot);
writeJson(path.join(artifactDir, "index.json"), index);

const commandResults = [];
const failures = [];
const stackFrames = [];
const stdoutLogs = [];

if (mode !== "analyze") {
  const commands = [...(config.run?.commands ?? []), ...buildTestCommands(config.run?.tests ?? [])];
  for (const command of commands) {
    const allowed = isCommandAllowed(command.cmd, config.allowlist);
    if (!allowed) {
      commandResults.push({
        id: command.id,
        cmd: command.cmd,
        exitCode: -1,
        durationMs: 0,
        blocked: true
      });
      continue;
    }
    const start = Date.now();
    const result = spawnSync(command.cmd, {
      cwd: repoRoot,
      shell: true,
      timeout: config.limits?.maxCommandMs ?? 120000,
      encoding: "utf8"
    });
    const durationMs = Date.now() - start;
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    const stdoutPath = path.join(artifactDir, `command-${command.id}.stdout.log`);
    const stderrPath = path.join(artifactDir, `command-${command.id}.stderr.log`);
    writeText(stdoutPath, stdout);
    writeText(stderrPath, stderr);
    stdoutLogs.push(stdout, stderr);
    const exitCode = result.status ?? 0;
    commandResults.push({
      id: command.id,
      cmd: command.cmd,
      exitCode,
      durationMs
    });
    if (exitCode !== 0) {
      failures.push({
        commandId: command.id,
        summary: `${command.cmd} failed with exit ${exitCode}`,
        stdoutPath,
        stderrPath
      });
    }
  }
}

for (const logText of stdoutLogs) {
  stackFrames.push(...parseStackTraces(logText));
}

const targets = selectTargets(
  index,
  config.targets?.selectors ?? [],
  config.targets?.fromStacks ? stackFrames : [],
  repoRoot
);

const targetsPath = path.join(artifactDir, "targets.json");
writeJson(targetsPath, targets);

let probeSummary = null;
if (shouldRunProbe(mode, args.probe, config.probe?.enabled) && targets.length > 0) {
  const tracePath = path.join(artifactDir, "probe-events.json");
  const probeEnv = {
    ...process.env,
    AUTO_DEBUG_TARGETS: targetsPath,
    AUTO_DEBUG_TRACE_PATH: tracePath,
    AUTO_DEBUG_LIMITS: JSON.stringify(config.probe ?? {})
  };
  const probeCommands = (config.run?.tests ?? []).filter((cmd) => cmd.startsWith("node "));
  for (const [index, cmd] of probeCommands.entries()) {
    const commandId = `probe-${index + 1}`;
    const allowed = isCommandAllowed(cmd, config.allowlist);
    if (!allowed) {
      commandResults.push({ id: commandId, cmd, exitCode: -1, durationMs: 0, blocked: true });
      continue;
    }
    const expanded = cmd.replace(/^node\s+/, `node --import ${path.resolve(__dirname, "probe-preload.mjs")} `);
    const start = Date.now();
    const result = spawnSync(expanded, {
      cwd: repoRoot,
      shell: true,
      timeout: config.limits?.maxCommandMs ?? 120000,
      encoding: "utf8",
      env: probeEnv
    });
    const durationMs = Date.now() - start;
    const exitCode = result.status ?? 0;
    commandResults.push({
      id: commandId,
      cmd: expanded,
      exitCode,
      durationMs
    });
  }
  probeSummary = summarizeProbe(tracePath, config.limits?.maxReportLines ?? 200);
}

const report = {
  runId,
  timestamp: nowIso(),
  mode,
  commands: commandResults,
  failures,
  targets,
  probeSummary,
  artifacts: listArtifacts(artifactDir)
};

writeReport(artifactDir, report);

function buildTestCommands(tests) {
  return tests.map((cmd, index) => ({ id: `test-${index + 1}`, cmd }));
}

function summarizeProbe(tracePath, limit) {
  if (!fs.existsSync(tracePath)) return null;
  const trace = readJson(tracePath, null);
  if (!trace || !Array.isArray(trace.events)) return null;
  const stats = new Map();
  for (const event of trace.events) {
    if (!event || !event.id || event.type !== "exit") continue;
    const entry = stats.get(event.id) ?? { name: event.id, count: 0, total: 0, max: 0 };
    entry.count += 1;
    entry.total += event.durationMs ?? 0;
    entry.max = Math.max(entry.max, event.durationMs ?? 0);
    stats.set(event.id, entry);
  }
  const top = Array.from(stats.values())
    .map((entry) => ({
      name: entry.name,
      count: entry.count,
      avgMs: entry.count > 0 ? entry.total / entry.count : 0,
      maxMs: entry.max
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, limit);
  return {
    totalEvents: trace.events.length,
    dropped: trace.dropped ?? 0,
    errors: trace.errors ?? 0,
    skipped: trace.skipped ?? [],
    top
  };
}

function listArtifacts(dir) {
  const entries = [];
  for (const entry of fs.readdirSync(dir)) {
    entries.push(entry);
  }
  return entries;
}

function shouldRunProbe(mode, flag, enabled) {
  if (mode === "analyze") return false;
  if (flag === "off") return false;
  if (flag === "on") return true;
  return Boolean(enabled);
}
