// Validate the JS port produces byte-identical import codes to the Python oracle.
//   node tools/validate_js.mjs <plannerId> <oracleDump.json>
// Fetches the live planner profile, runs the JS pipeline for every variant,
// and diffs each code against the oracle dump written by maxroll_oracle.py.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractVariant, buildFilter, buildStash, dualFilterNames, fetchProfile } from "../web/d4filter.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const plannerId = process.argv[2] || "mmfzmj0i";
const oraclePath = process.argv[3] || join(root, "web", "data", "oracle.json");

const bundle = JSON.parse(readFileSync(join(root, "web", "data", "bundle.json"), "utf-8"));
const oracle = JSON.parse(readFileSync(oraclePath, "utf-8"));

const firstDiff = (a, b) => { let i = 0; const n = Math.min(a.length, b.length); while (i < n && a[i] === b[i]) i++; return i; };

const prof = await fetchProfile(plannerId);
let pass = 0, fail = 0;
for (const exp of oracle) {
  const extracted = extractVariant(prof.data, exp.index, prof.cls, bundle);
  const names = dualFilterNames(exp.base);
  const farm = buildFilter(extracted, names.farm, bundle, { gaThreshold: 1 });
  const stash = buildStash(extracted, names.stash, bundle, {});
  const farmOk = farm.code === exp.farm_code;
  const stashOk = stash.code === exp.stash_code;
  farmOk && stashOk ? pass++ : fail++;
  console.log(`[${exp.index}] ${exp.base.slice(0, 24).padEnd(24)} ` +
    `FARM ${farmOk ? "MATCH" : "DIFF"}(${farm.ruleCount}) STASH ${stashOk ? "MATCH" : "DIFF"}(${stash.ruleCount})`);
  if (!farmOk) console.log(`     FARM diff@${firstDiff(farm.code, exp.farm_code)}`);
  if (!stashOk) console.log(`     STASH diff@${firstDiff(stash.code, exp.stash_code)}\n` +
    `       oracle …${exp.stash_code.slice(0, 40)}…\n       jsport …${stash.code.slice(0, 40)}…`);
}
console.log(`\n${pass} variants fully match, ${fail} with a diff`);
process.exit(fail ? 1 : 0);
