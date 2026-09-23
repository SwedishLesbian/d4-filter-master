// Validate the JS port produces byte-identical import codes to the Python oracle.
//   node tools/validate_js.mjs <plannerId> <oracleDump.json>
// Fetches the live planner profile, runs the JS pipeline for every variant,
// and diffs each code against the oracle dump written by maxroll_oracle.py.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractVariant, buildFilter, fetchProfile } from "../web/d4filter.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const plannerId = process.argv[2] || "mmfzmj0i";
const oraclePath = process.argv[3] || join(root, "web", "data", "oracle.json");

const bundle = JSON.parse(readFileSync(join(root, "web", "data", "bundle.json"), "utf-8"));
const oracle = JSON.parse(readFileSync(oraclePath, "utf-8"));

const prof = await fetchProfile(plannerId);
let pass = 0, fail = 0;
for (const exp of oracle) {
  const extracted = extractVariant(prof.data, exp.index, prof.cls, bundle);
  const { code, ruleCount } = buildFilter(extracted, exp.name, bundle, { gaThreshold: 1 });
  const ok = code === exp.code;
  ok ? pass++ : fail++;
  console.log(`[${exp.index}] ${exp.name.padEnd(30)} ${ok ? "MATCH" : "DIFF "} ` +
    `rows=${extracted.rows.length} uniques=${extracted.uniques.length} ` +
    `charms=${extracted.charmHashes.length} seal=${+extracted.hasSeal} rules=${ruleCount}`);
  if (!ok) {
    // show first divergent character to localize the mismatch
    const n = Math.min(code.length, exp.code.length);
    let i = 0; while (i < n && code[i] === exp.code[i]) i++;
    console.log(`     first diff at char ${i}/${exp.code.length}`);
    console.log(`     oracle: ...${exp.code.slice(Math.max(0, i - 10), i + 20)}...`);
    console.log(`     jsport: ...${code.slice(Math.max(0, i - 10), i + 20)}...`);
  }
}
console.log(`\n${pass} match, ${fail} diff`);
process.exit(fail ? 1 : 0);
