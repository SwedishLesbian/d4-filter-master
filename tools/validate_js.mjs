// Validate the JS port produces byte-identical import codes to the Python oracle.
//   node tools/validate_js.mjs <plannerId> <oracleDump.json>
// Fetches the live planner profile, runs the JS pipeline for every variant,
// and diffs each code against the oracle dump written by maxroll_oracle.py.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractVariant, buildFilter, buildStash, buildLeveling, dualFilterNames, levelFilterName, detectStage, fetchProfile } from "../web/d4filter.js";

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
  const level = buildLeveling(extracted, levelFilterName(exp.base), bundle, {});
  const farmOk = farm.code === exp.farm_code;
  const stashOk = stash.code === exp.stash_code;
  const levelOk = level.code === exp.level_code;
  // stage detector agrees between JS and Python
  const stageJs = detectStage(exp.base, extracted.rows.some((r) => r[2]));
  const stageOk = exp.stage && stageJs.stage === exp.stage.stage &&
    stageJs.confidence === exp.stage.confidence;
  farmOk && stashOk && levelOk && stageOk ? pass++ : fail++;
  console.log(`[${exp.index}] ${exp.base.slice(0, 22).padEnd(22)} ` +
    `FARM ${farmOk ? "ok" : "DIFF"} STASH ${stashOk ? "ok" : "DIFF"} LEVEL ${levelOk ? "ok" : "DIFF"} ` +
    `stage ${stageOk ? "ok" : "DIFF"}(${stageJs.stage}/${stageJs.confidence})`);
  if (!farmOk) console.log(`     FARM diff@${firstDiff(farm.code, exp.farm_code)}`);
  if (!stashOk) console.log(`     STASH diff@${firstDiff(stash.code, exp.stash_code)}`);
  if (!levelOk) console.log(`     LEVEL diff@${firstDiff(level.code, exp.level_code)}`);
}
console.log(`\n${pass} variants fully match, ${fail} with a diff`);
process.exit(fail ? 1 : 0);
