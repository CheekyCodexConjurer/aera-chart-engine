import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { ensureDir, relativePosix } from "./utils.mjs";

export function buildIndex(repoRoot) {
  const srcRoot = path.resolve(repoRoot, "src");
  const files = listFiles(srcRoot, (file) => file.endsWith(".ts"));
  const symbols = [];

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
    const relFile = relativePosix(repoRoot, filePath);
    const distPath = toDistPath(relFile);

    const visit = (node, className = null) => {
      if (ts.isFunctionDeclaration(node) && node.name) {
        symbols.push(buildEntry(sourceFile, node, relFile, distPath, {
          name: node.name.text,
          kind: "function",
          exported: isExported(node)
        }));
      }
      if (ts.isClassDeclaration(node) && node.name) {
        symbols.push(buildEntry(sourceFile, node, relFile, distPath, {
          name: node.name.text,
          kind: "class",
          exported: isExported(node)
        }));
        const classId = node.name.text;
        for (const member of node.members) {
          if (!ts.isMethodDeclaration(member) || !member.name) continue;
          if (!member.body) continue;
          const methodName = member.name.getText(sourceFile);
          symbols.push(buildEntry(sourceFile, member, relFile, distPath, {
            name: `${classId}.${methodName}`,
            kind: "class-method",
            className: classId,
            methodName
          }));
        }
      }
      ts.forEachChild(node, (child) => visit(child, className));
    };

    visit(sourceFile);
  }

  return {
    generatedAt: new Date().toISOString(),
    root: "src",
    symbols
  };
}

function listFiles(dir, predicate, results = []) {
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(full, predicate, results);
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

function isExported(node) {
  const flags = ts.getCombinedModifierFlags(node);
  return (flags & ts.ModifierFlags.Export) !== 0;
}

function buildEntry(sourceFile, node, relFile, distPath, info) {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
  return {
    ...info,
    file: relFile,
    dist: distPath,
    startLine: start.line + 1,
    endLine: end.line + 1
  };
}

function toDistPath(relFile) {
  if (!relFile.startsWith("src/")) return relFile;
  return relFile.replace(/^src\//, "dist/").replace(/\.ts$/, ".js");
}
