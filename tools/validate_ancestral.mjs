// Decode a generated filter and assert that, when the Ancestral gear option is
// on, every Rare/Legendary per-slot rule (BiS / Gear / 2-of-3) carries the
// item-properties = Ancestral condition — and that none do when it is off.
//   node tools/validate_ancestral.mjs [plannerId]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extractVariant, buildFilter, fetchProfile } from "../web/d4filter.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = JSON.parse(readFileSync(join(root, "web", "data", "bundle.json"), "utf-8"));
const PROP_ANCESTRAL = 4;

// ---- minimal protobuf reader (matches the encoder in web/d4filter.js) ----
function rdVarint(b, p) { let r = 0n, s = 0n; for (;;) { const x = b[p++]; r |= BigInt(x & 0x7f) << s; if (!(x & 0x80)) break; s += 7n; } return [Number(r), p]; }
function fields(b, start, end) {
  const out = []; let p = start;
  while (p < end) {
    let key; [key, p] = rdVarint(b, p); const f = key >> 3, wt = key & 7;
    if (wt === 0) { let v; [v, p] = rdVarint(b, p); out.push({ f, wt, v }); }
    else if (wt === 5) { const v = (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0; p += 4; out.push({ f, wt, v }); }
    else if (wt === 2) { let len; [len, p] = rdVarint(b, p); out.push({ f, wt, start: p, end: p + len }); p += len; }
    else throw new Error("unexpected wire type " + wt);
  }
  return out;
}
const CT = { 1: "rarity", 2: "props", 3: "codex", 4: "greater", 5: "itemtype", 6: "affixes", 8: "unique", 9: "talisman" };
function decodeRules(b64) {
  const b = Buffer.from(b64, "base64");
  const rules = [];
  for (const t of fields(b, 0, b.length)) {
    if (t.f !== 1 || t.wt !== 2) continue;                 // top-level repeated rule
    const rule = { name: "", conds: [] };
    for (const x of fields(b, t.start, t.end)) {
      if (x.f === 1 && x.wt === 2) rule.name = b.toString("utf8", x.start, x.end);
      if (x.f === 4 && x.wt === 2) {                        // a condition message
        let ctype = null, value1 = null;
        for (const y of fields(b, x.start, x.end)) {
          if (y.f === 1 && y.wt === 0) ctype = y.v;
          if (y.f === 4 && y.wt === 0) value1 = y.v;
        }
        rule.conds.push({ ctype: CT[ctype] || ctype, value1 });
      }
    }
    rules.push(rule);
  }
  return rules;
}

const isGearRule = (name) => /^(BiS:|Gear:|2\/3:)/.test(name);
const hasAncestral = (r) => r.conds.some((c) => c.ctype === "props" && c.value1 === PROP_ANCESTRAL);
const hasHideRule = (rules) => rules.some((r) => /^Hide/.test(r.name));

// The web UI's "Only show Ancestral items (hide the rest)" master maps to this
// opts combination (web/index.html generate()): both ancestral sub-rules on and
// hiding forced on. The off case is the default (no ancestral, hide off).
const MASTER_ON = { ancestralGear: true, ancestralUniques: true, hideJunk: true };
const MASTER_OFF = { ancestralGear: false, ancestralUniques: false, hideJunk: false };

async function run(plannerId) {
  const prof = await fetchProfile(plannerId);
  let failures = 0, checked = 0;
  for (let vi = 0; vi < prof.data.profiles.length; vi++) {
    const ex = extractVariant(prof.data, vi, prof.cls, bundle);
    if (!ex.rows.length) continue;

    const on = decodeRules(buildFilter(ex, "T", bundle, MASTER_ON).code);
    const onGear = on.filter((r) => isGearRule(r.name));
    const missing = onGear.filter((r) => !hasAncestral(r));       // every gear rule needs Ancestral
    const noHide = !hasHideRule(on);                              // "hide the rest" must be enforced

    const off = decodeRules(buildFilter(ex, "T", bundle, MASTER_OFF).code);
    const leaked = off.filter((r) => isGearRule(r.name) && hasAncestral(r));  // none when off

    checked += onGear.length;
    const ok = missing.length === 0 && leaked.length === 0 && onGear.length > 0 && !noHide;
    if (!ok) failures++;
    console.log(`[${vi}] ${(prof.data.profiles[vi].name || vi).padEnd(24)} gearRules=${onGear.length} ` +
      `${ok ? "OK" : "FAIL"}` +
      (missing.length ? ` missingAncestral=[${missing.map((r) => r.name).join(", ")}]` : "") +
      (noHide ? " NO-HIDE-RULE(non-Ancestral gear would still show)" : "") +
      (leaked.length ? ` leakedWhenOff=[${leaked.map((r) => r.name).join(", ")}]` : ""));
  }
  console.log(`\n${checked} gear rules checked · ${failures ? failures + " variant(s) FAILED" : "all variants OK"}`);
  process.exit(failures ? 1 : 0);
}

run(process.argv[2] || "mmfzmj0i");
