// Unit tests for the source-independent build-stage detector (§11).
//   node tools/validate_stage.mjs
import { detectStage } from "../web/d4filter.js";

let failed = 0;
function check(label, got, want) {
  const ok = got === want;
  if (!ok) { failed++; console.log(`  FAIL: ${label} — got ${got}, want ${want}`); }
}
const stage = (name, hasGa) => detectStage(name, hasGa).stage;
const conf = (name, hasGa) => detectStage(name, hasGa).confidence;

// obvious names
check("'Leveling 1 - 70' -> leveling", stage("Leveling 1 - 70", false), "leveling");
check("'Endgame' + GA -> endgame", stage("Endgame", true), "endgame");
check("'1-60' -> leveling", stage("Act 1-60 Campaign", false), "leveling");
check("'Campaign' -> leveling", stage("Campaign", false), "leveling");
check("'Pit Pushing' -> endgame", stage("Pit Pushing", true), "endgame");
check("'Bossing' -> endgame", stage("Bossing", true), "endgame");
check("'Speed Farming' -> endgame", stage("Speed Farming", true), "endgame");
check("'Torment IV' -> endgame", stage("Torment IV", true), "endgame");

// GA evidence with no name signal
check("no-name + GA -> endgame", stage("My Build", true), "endgame");
check("no-name + GA confidence medium", conf("My Build", true), "medium");

// ambiguous -> safe permissive leveling, low confidence
check("no-name + no GA -> leveling", stage("My Build", false), "leveling");
check("no-name + no GA confidence low", conf("My Build", false), "low");
check("empty name + no GA -> leveling", stage("", false), "leveling");

// name vs GA interplay
check("'Endgame' but no GA -> endgame (name wins)", stage("Endgame", false), "endgame");
check("'Endgame' no GA -> medium confidence", conf("Endgame", false), "medium");
check("'Leveling' but GA present -> leveling (name wins)", stage("Leveling", true), "leveling");
check("'Leveling' + GA -> medium confidence", conf("Leveling", true), "medium");

// mixed terms -> ambiguous leveling low
check("'Leveling to Endgame' -> leveling", stage("Leveling to Endgame", true), "leveling");
check("mixed terms -> low confidence", conf("Leveling to Endgame", true), "low");

// reasons are populated
const r = detectStage("Endgame", true).reasons;
check("reasons non-empty", r.length > 0, true);

console.log(failed ? `\n${failed} stage assertion(s) FAILED` : "\nall stage-detection assertions passed");
process.exit(failed ? 1 : 0);
