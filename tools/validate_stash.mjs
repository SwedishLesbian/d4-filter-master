// Decode the actual generated FARM and STASH filters and assert the STASH
// classification semantics (§12). Validates serialized output, not option values.
//   node tools/validate_stash.mjs [plannerId]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractVariant, buildFilter, buildStash, dualFilterNames, fetchProfile } from "../web/d4filter.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = JSON.parse(readFileSync(join(root, "web", "data", "bundle.json"), "utf-8"));
const PROP_ANCESTRAL = 4;
const T_RARITY = 1, T_PROPS = 2, T_CODEX = 3, T_GREATER = 4, T_ITEMTYPE = 5, T_REQUIRED = 6, T_OPTIONAL = 7;

// ---- protobuf reader ----
function rdVarint(b, p) { let r = 0n, s = 0n; for (;;) { const x = b[p++]; r |= BigInt(x & 0x7f) << s; if (!(x & 0x80)) break; s += 7n; } return [Number(r), p]; }
function fields(b, start, end) {
  const out = []; let p = start;
  while (p < end) {
    let key; [key, p] = rdVarint(b, p); const f = key >> 3, wt = key & 7;
    if (wt === 0) { let v; [v, p] = rdVarint(b, p); out.push({ f, wt, v }); }
    else if (wt === 5) { const v = (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; p += 4; out.push({ f, wt, v }); }
    else if (wt === 2) { let len; [len, p] = rdVarint(b, p); out.push({ f, wt, start: p, end: p + len }); p += len; }
    else throw new Error("wt " + wt);
  }
  return out;
}
function decodeRules(b64) {
  const b = Buffer.from(b64, "base64");
  const rules = [];
  for (const t of fields(b, 0, b.length)) {
    if (t.f !== 1 || t.wt !== 2) continue;
    const rule = { name: "", conds: [] };
    for (const x of fields(b, t.start, t.end)) {
      if (x.f === 1 && x.wt === 2) rule.name = b.toString("utf8", x.start, x.end);
      if (x.f === 4 && x.wt === 2) {
        const c = { type: null, params1: [], params2: [], value1: null };
        for (const y of fields(b, x.start, x.end)) {
          if (y.f === 1 && y.wt === 0) c.type = y.v;
          if (y.f === 2 && y.wt === 5) c.params1.push(y.v);
          if (y.f === 4 && y.wt === 0) c.value1 = y.v;
          if (y.f === 3 && y.wt === 2) { const pr = fields(b, y.start, y.end).filter(z => z.wt === 5).map(z => z.v); c.params2.push(pr); }
        }
        rule.conds.push(c);
      }
    }
    rules.push(rule);
  }
  return rules;
}

// ---- assertions ----
let failed = 0;
const eq = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function check(label, cond, extra = "") { if (cond) { /* ok */ } else { failed++; console.log(`  FAIL: ${label}${extra ? " — " + extra : ""}`); } }
const condOfType = (r, t) => r.conds.find(c => c.type === t);
const hasCondType = (rules, t) => rules.some(r => r.conds.some(c => c.type === t));
const gearTier = (rules, prefix) => rules.filter(r => r.name.startsWith(prefix));

const prof = await fetchProfile(process.argv[2] || "mmfzmj0i");
for (let vi = 0; vi < prof.data.profiles.length; vi++) {
  const ex = extractVariant(prof.data, vi, prof.cls, bundle);
  if (!ex.rows.length) continue;
  const names = dualFilterNames(prof.data.profiles[vi].name || `v${vi}`);
  const before = failed;

  // ---- FARM: retains generic GA catch + Codex; neither is Ancestral-gated ----
  const farmOff = decodeRules(buildFilter(ex, names.farm, bundle, { ancestralGear: false, hideJunk: true }).code);
  const farmOn = decodeRules(buildFilter(ex, names.farm, bundle, { ancestralGear: true, ancestralUniques: true, hideJunk: true }).code);
  check("FARM retains generic 1+ Greater Affix catch (type 4)", hasCondType(farmOff, T_GREATER));
  check("FARM retains a Codex Upgrade rule (type 3)", hasCondType(farmOff, T_CODEX));
  const farmCodex = farmOn.find(r => r.conds.some(c => c.type === T_CODEX));
  check("FARM Codex Upgrade is NOT Ancestral-gated (even when Ancestral on)", !farmCodex.conds.some(c => c.type === T_PROPS));
  const gaOff = farmOff.find(r => r.conds.some(c => c.type === T_GREATER));
  const gaOn = farmOn.find(r => r.conds.some(c => c.type === T_GREATER));
  check("FARM GA catch is NOT Ancestral-gated by default", !gaOff.conds.some(c => c.type === T_PROPS));
  check("FARM GA catch IS Ancestral-gated when Ancestral-gear on", gaOn.conds.some(c => c.type === T_PROPS));

  // ---- STASH: strict classifier ----
  const stashRes = buildStash(ex, names.stash, bundle, { ancestralGear: false });
  const stashOff = decodeRules(stashRes.code);
  const stashOn = decodeRules(buildStash(ex, names.stash, bundle, { ancestralGear: true }).code);
  const named = (rules, name) => rules.some(r => r.name === name);
  check("STASH has NO generic 1+ Greater Affix catch (type 4)", !hasCondType(stashOff, T_GREATER));
  check("STASH has NO generic Codex Upgrade rule (type 3)", !hasCondType(stashOff, T_CODEX));
  // Phase 1: STASH drops the generic pickup rules; FARM keeps them.
  check("STASH has NO generic Legendary Seals rule", !named(stashOff, "Legendary Seals"));
  check("STASH has NO generic Set Charms (all) rule", !named(stashOff, "Set Charms (all)"));
  check("FARM retains its Legendary Seals rule", named(farmOff, "Legendary Seals"));
  check("FARM retains its Set Charms (all) rule", named(farmOff, "Set Charms (all)"));
  if (ex.detected.sets.size)
    check("STASH keeps the build's own Set Charms rule", named(stashOff, "Set Charms"));
  // decoded tier count agrees with the reported surviving tiers
  check("STASH decoded T4 count == surviving T4 tiers",
    gearTier(stashOff, "T4:").length === stashRes.tiers.t4.length);

  // every tier rule: correct item type + (Ancestral when enabled)
  const tiersOn = gearTier(stashOn, "T");
  check("STASH tier rules all carry an item-type condition (type 5)",
    tiersOn.every(r => condOfType(r, T_ITEMTYPE)), `${tiersOn.length} tiers`);
  check("STASH tier rules all carry Ancestral (type 2 = props 4) when enabled",
    tiersOn.every(r => r.conds.some(c => c.type === T_PROPS && c.value1 === PROP_ANCESTRAL)));
  const tiersOffAnc = gearTier(stashOff, "T").some(r => r.conds.some(c => c.type === T_PROPS));
  check("STASH tier rules carry NO Ancestral when disabled", !tiersOffAnc);

  // Tier structure, per slot
  for (const t2 of gearTier(stashOff, "T2:")) {
    const slot = t2.name.slice(4);
    const req = condOfType(t2, T_REQUIRED);
    const full = Math.min(3, req.params1.length);
    check(`STASH T2 ${slot}: full-match threshold (${full})`, req && req.value1 === full);
    check(`STASH T2 ${slot}: single required-affix condition, no GA pairs`, req && req.params2.length === 0);
  }
  for (const t4 of gearTier(stashOff, "T4:")) {
    const req = condOfType(t4, T_REQUIRED);
    check(`STASH T4 ${t4.name.slice(4)}: 2-of-pool threshold`, req && req.value1 === 2 && req.params2.length === 0);
  }
  for (const t3 of gearTier(stashOff, "T3:")) {
    const slot = t3.name.slice(4);
    const req = condOfType(t3, T_REQUIRED), opt = condOfType(t3, T_OPTIONAL);
    check(`STASH T3 ${slot}: has BOTH a type-6 and a type-7 affix condition`, !!req && !!opt);
    check(`STASH T3 ${slot}: type-6 requires minimum 2 desired`, req && req.value1 === 2);
    check(`STASH T3 ${slot}: type-6 carries no GA pairs`, req && req.params2.length === 0);
    check(`STASH T3 ${slot}: type-7 requires minimum 1`, opt && opt.value1 === 1);
    check(`STASH T3 ${slot}: type-7 GA pool == the desired-affix pool`,
      opt && eq(opt.params2.map(p => p[0]), opt.params1) && eq(opt.params1, req.params1));
    check(`STASH T3 ${slot}: type-7 GA pairs are (id,id)`, opt && opt.params2.every(p => p[0] === p[1]));
    check(`STASH T3 ${slot}: NOT using the generic Greater-Affix condition (type 4)`,
      !t3.conds.some(c => c.type === T_GREATER));
  }
  // T1 = full + priority GA
  for (const t1 of gearTier(stashOff, "T1:")) {
    const req = condOfType(t1, T_REQUIRED);
    check(`STASH T1 ${t1.name.slice(4)}: full match + priority GA pairs`,
      req && req.value1 === Math.min(3, req.params1.length) && req.params2.length >= 1);
  }
  if (failed === before) console.log(`[${vi}] ${(prof.data.profiles[vi].name || vi)} OK`);
}
console.log(failed ? `\n${failed} assertion(s) FAILED` : "\nall STASH assertions passed");
process.exit(failed ? 1 : 0);
