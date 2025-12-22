import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const port = Number.parseInt(process.env.HARNESS_PORT ?? "5173", 10);

const mimeTypes = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".bin": "application/octet-stream"
};

function resolvePath(urlPath) {
  const safePath = urlPath.split("?")[0].replace(/\\/g, "/");
  const cleaned = safePath.replace(/^\/+/, "");
  const target = path.join(repoRoot, cleaned);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    return path.join(target, "index.html");
  }
  return target;
}

const server = http.createServer((req, res) => {
  const target = resolvePath(req.url ?? "/");
  if (!fs.existsSync(target)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  const ext = path.extname(target);
  res.setHeader("Content-Type", mimeTypes[ext] ?? "application/octet-stream");
  fs.createReadStream(target).pipe(res);
});

server.listen(port, () => {
  console.log(`Harness server: http://localhost:${port}/tools/harness/ui/`);
});
