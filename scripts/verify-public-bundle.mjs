import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "out");
if (!existsSync(output)) throw new Error("Public bundle verification requires a completed static production build in out/.");

const extensions = new Set([".html", ".js", ".json", ".css", ".map", ".txt", ".xml"]);
const files = [];
const walk = (directory) => {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (extensions.has(extname(path).toLowerCase())) files.push(path);
  }
};
walk(output);
const bundle = files.map((file) => readFileSync(file, "utf8")).join("\n");

const environmentFile = join(root, ".env.local");
if (existsSync(environmentFile)) {
  for (const line of readFileSync(environmentFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || !/(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)/i.test(match[1])) continue;
    const value = match[2].trim().replace(/^['"]|['"]$/g, "");
    if (value.length >= 8 && bundle.includes(value)) throw new Error(`Public bundle contains the configured value of ${match[1]}.`);
  }
}

const forbidden = [
  [/github_pat_[A-Za-z0-9_]+/i, "GitHub personal access token"],
  [/ghp_[A-Za-z0-9]+/i, "GitHub classic token"],
  [/eyJhbGciOiJ[A-Za-z0-9._-]+/i, "JWT-like credential"],
  [/protected:\/\/definition\//i, "licensed-definition backend reference"],
  [/restricted-test-content/i, "restricted licensed test content"],
];
for (const [pattern, label] of forbidden) if (pattern.test(bundle)) throw new Error(`Public bundle contains a ${label}.`);

for (const marker of ["SteerCo summary", "Generate AI draft", "Copy read-only link", "Open workspace", "38 KFLA competency names", "Mapping playbook", "Mutually exclusive, collectively exhaustive role profile"]) {
  if (!bundle.includes(marker)) throw new Error(`Public bundle is missing the required application marker: ${marker}.`);
}

console.log(`Public bundle verified: ${files.length} text assets contain no configured credentials or licensed-content markers.`);
