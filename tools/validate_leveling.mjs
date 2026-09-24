// Decode the actual generated LEVELING import code and assert its permissive
// semantics (§12): no Ancestral, no per-affix GA, no generic GA catch, no Hide
// rule, full-match uses the desired pool, 2-of-pool uses min 2, Codex kept.
//   node tools/validate_leveling.mjs [plannerId]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractVariant, buildLeveling, levelFilterName, fetchProfile } from "../web/d4filter.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = JSON.parse(readFileSync(join(root, "web", "data", "bundle.json"), "utf-8"));
const T_PROPS = 2, T_CODEX = 3, T_GREATER = 4, T_ITEMTYPE = 5, T_REQUIRED = 6, T_OPTIONAL = 7;

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
  const b = Buffer.from(b64, "base64"); const rules = [];
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
          if (y.f === 3 && y.wt === 2) c.params2.push(1);
        }
        rule.conds.push(c);
      }
    }
    rules.push(rule);
  }
  return rules;
}

let failed = 0;
const check = (l, c) => { if (!c) { failed++; console.log(`  FAIL: ${l}`); } };
const anyCond = (rules, t) => rules.some((r) => r.conds.some((c) => c.type === t));
const named = (rules, n) => rules.some((r) => r.name === n);
const tier = (rules, pre) => rules.filter((r) => r.name.startsWith(pre));

const prof = await fetchProfile(process.argv[2] || "mmfzmj0i");
for (let vi = 0; vi < prof.data.profiles.length; vi++) {
  const ex = extractVariant(prof.data, vi, prof.cls, bundle);
  if (!ex.rows.length) continue;
  const before = failed;
  // ancestral options must NOT change leveling output (it never gates on Ancestral)
  const rules = decodeRules(buildLeveling(ex, levelFilterName("X"), bundle, { ancestralGear: true, ancestralUniques: true }).code);

  check("LEVEL has NO Hide Junk Gear rule", !named(rules, "Hide Junk Gear"));
  check("LEVEL has NO generic Greater-Affix catch (type 4)", !anyCond(rules, T_GREATER));
  check("LEVEL has NO Ancestral (item-properties) condition anywhere (type 2)", !anyCond(rules, T_PROPS));
  check("LEVEL has NO optional-affix / per-affix GA condition (type 7)", !anyCond(rules, T_OPTIONAL));
  check("LEVEL keeps a Codex Upgrade rule (type 3)", anyCond(rules, T_CODEX));
  if (ex.uniques.length) check("LEVEL keeps Build Uniques", named(rules, "Build Uniques"));
  if (ex.detected.sets.size) check("LEVEL keeps the build's Set Charms", named(rules, "Set Charms"));

  for (const r of tier(rules, "Full:")) {
    const req = r.conds.find((c) => c.type === T_REQUIRED);
    check(`Full ${r.name.slice(6)}: full-match threshold, no GA pairs`,
      req && req.value1 === Math.min(3, req.params1.length) && req.params2.length === 0);
    check(`Full ${r.name.slice(6)}: carries item-type + no Ancestral`,
      r.conds.some((c) => c.type === T_ITEMTYPE) && !r.conds.some((c) => c.type === T_PROPS));
  }
  for (const r of tier(rules, "2/3:")) {
    const req = r.conds.find((c) => c.type === T_REQUIRED);
    check(`2/3 ${r.name.slice(5)}: 2-of-pool threshold, no GA pairs`, req && req.value1 === 2 && req.params2.length === 0);
  }
  if (failed === before) console.log(`[${vi}] ${prof.data.profiles[vi].name || vi} OK`);
}
console.log(failed ? `\n${failed} leveling assertion(s) FAILED` : "\nall leveling assertions passed");
process.exit(failed ? 1 : 0);
