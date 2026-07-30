/**
 * Copies pdf.js's worker bundle into public/ so the viewer can point
 * `GlobalWorkerOptions.workerSrc` at a fixed, deterministic URL instead of
 * relying on bundler-specific `new URL(..., import.meta.url)` asset
 * resolution (which behaves differently between Turbopack dev and the
 * production build). Run before dev/build via the predev/prebuild npm
 * script hooks — see package.json.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destDir = join(__dirname, "..", "public");
const dest = join(destDir, "pdf.worker.min.mjs");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`Copied pdf.worker.min.mjs -> ${dest}`);
