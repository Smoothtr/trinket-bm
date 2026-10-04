import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "trinket-tests-"));
process.env.PORT = process.env.PORT || "4173";
process.env.AUTH_DISABLED = "1";
process.env.DATA_BACKEND = "json";
process.env.TRINKET_STORE_PATH = path.join(testDirectory, "store.json");

const { default: handleRequest } = await import("../server.mjs");
const server = http.createServer(handleRequest);

function cleanup() {
  const resolved = path.resolve(testDirectory);
  const tempRoot = path.resolve(os.tmpdir());
  if (resolved.startsWith(`${tempRoot}${path.sep}`)) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function shutdown() {
  server.close(() => {
    cleanup();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
process.once("exit", cleanup);

server.listen(Number(process.env.PORT), "127.0.0.1", () => {
  console.log(`Trinket test server running at http://127.0.0.1:${process.env.PORT}`);
});
