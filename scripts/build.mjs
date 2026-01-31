import { execSync } from "node:child_process";
import { mkdirSync, rmSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "src", "exp_privacy_gate.js");
const distDir = resolve(root, "dist");
const dist = resolve(distDir, "exp_privacy_gate.js");
const distMin = resolve(distDir, "exp_privacy_gate.min.js");

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

copyFileSync(src, dist);

execSync(`npx terser "${dist}" -c -m -o "${distMin}"`, { stdio: "inherit" });
