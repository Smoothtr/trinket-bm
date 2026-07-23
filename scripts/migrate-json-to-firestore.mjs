import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importFirestoreState } from "../lib/store.mjs";
import { normalizeData } from "../server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  const entry = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

async function main() {
  const defaultSource = fs.existsSync(path.join(__dirname, "..", "data", "store.json"))
    ? path.join(__dirname, "..", "data", "store.json")
    : path.join(__dirname, "..", "data", "seed.json");
  const source = path.resolve(argument("source", defaultSource));
  const dryRun = hasFlag("dry-run");
  const force = hasFlag("force");
  if (!fs.existsSync(source)) throw new Error(`Không tìm thấy file nguồn: ${source}`);
  if (force && argument("confirm") !== "OVERWRITE_FIRESTORE") {
    throw new Error("Khi dùng --force, cần thêm --confirm=OVERWRITE_FIRESTORE.");
  }

  const state = normalizeData(JSON.parse(fs.readFileSync(source, "utf8")));
  const counts = Object.fromEntries(Object.entries(state)
    .filter(([, value]) => Array.isArray(value))
    .map(([key, value]) => [key, value.length]));
  console.log(JSON.stringify({ source, schema_version: state.schema_version, counts, dryRun, force }, null, 2));
  if (dryRun) return;

  await importFirestoreState(state, { force, actor: "json-migration" });
  console.log("Migration Firestore hoàn tất.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
