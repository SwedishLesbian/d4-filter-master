// Diablo 4 loot-filter generator — browser port of the Maxroll path.
//
// Faithful port of d4_lootfilter.py's encoder + rule assembly. All fuzzy affix
// matching is precomputed into bundle.json by tools/gen_web_bundle.py, so this
// file only does exact lookups + deterministic protobuf assembly and MUST stay
// byte-for-byte identical to the Python output (validated in tools/validate_js.mjs).

// ---- constants (mirror d4_lootfilter.py) ---------------------------------
const BYTES_HIGHEST_FIRST = true;
const MAX_RULES = 25;
const MAX_NAME = 30;
const NATURAL_AFFIXES = 3;
const STASH_MIN = 2;

const SHOW = 0, RECOLOR = 2, HIDE = 3;
const COMMON = 1, MAGIC = 2, RARE = 4, LEGENDARY = 8, UNIQUE = 16, MYTHIC = 32, TALISMAN = 64;
const PROP_ANCESTRAL = 4;

const color = (r, g, b, a = 255) => (((a << 24) | (r << 16) | (g << 8) | b) >>> 0);
const C_UNIQUE = color(255, 80, 80);
const C_CYAN   = color(0, 255, 255);
const C_GREEN  = color(0, 200, 0);
const C_BIS    = color(255, 255, 255);
const C_GEAR   = color(0, 150, 255);
const C_PARTIAL= color(0, 200, 170);
const C_SET    = color(190, 130, 255);
const C_SEAL   = color(255, 100, 200);
const C_MYTHIC = color(255, 200, 80);
const C_STASH_T3 = color(255, 62, 165);  // STASH tier 3: 2 desired + a desired GA

// ---- protobuf encoder (bytes as number[] 0..255) -------------------------
function varint(v) {
  const out = [];
  do { out.push(v & 0x7f); v = Math.floor(v / 128); } while (v > 0);
  for (let i = 0; i < out.length - 1; i++) out[i] |= 0x80;
  return out;
}
const efv = (fn, v) => varint((fn << 3) | 0).concat(varint(v));
const ef32 = (fn, v) => varint((fn << 3) | 5).concat(
  [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);
const efb = (fn, d) => varint((fn << 3) | 2).concat(varint(d.length)).concat(d);
const efs = (fn, s) => efb(fn, Array.from(new TextEncoder().encode(s)));

const cRarity = (mask) => efb(4, efv(1, 1).concat(efv(4, mask)));
const cProps  = (mask) => efb(4, efv(1, 2).concat(efv(4, mask)));
const cCodex  = () => efb(4, efv(1, 3).concat(efv(6, 1)));
const cGreater = (n) => efb(4, efv(1, 4).concat(efv(4, n)).concat(efv(6, 1)));
// Affix condition, shared by type 6 (HAS_REQUIRED_AFFIXES) and type 7
// (HAS_OPTIONAL_AFFIXES): params1 = pool, params2 = one (id,id) pair per affix
// that must roll Greater, value1 = how many of the pool must be present. Type 7
// is "same as required" in the schema; the type lets one rule carry two affix
// conditions (duplicate condition types in a rule are not allowed).
function cAffixCond(ctype, ids, n, gaIds = []) {
  let inner = efv(1, ctype);
  for (const i of ids) inner = inner.concat(ef32(2, i));
  for (const g of gaIds) inner = inner.concat(efb(3, ef32(1, g).concat(ef32(2, g))));
  return efb(4, inner.concat(efv(4, n)));
}
// Type 6: >= n of ids present; every id in gaIds must be present as a Greater Affix.
const cRequiredAffixes = (ids, n, gaIds = []) => cAffixCond(6, ids, n, gaIds);
// Type 7: same structure, distinct type so it can coexist with a type-6 condition.
const cOptionalAffixes = (ids, n, gaIds = []) => cAffixCond(7, ids, n, gaIds);
const cAffixes = cRequiredAffixes;   // back-compat alias (existing FARM call sites)
function cParams(ctype, ids) {
  let inner = efv(1, ctype);
  for (const i of ids) inner = inner.concat(ef32(2, i));
  return efb(4, inner);
}
const cUniques = (ids) => cParams(8, ids);
const cItemType = (ids) => cParams(5, ids);
const cTalismanSet = (ids) => cParams(9, ids);

function rule(name, vis, conds, colorVal = null) {
  let r = efs(1, name).concat(efv(2, vis));
  if (colorVal !== null) r = r.concat(ef32(3, colorVal));
  for (const c of conds) r = r.concat(c);
  return efb(1, r.concat(efv(5, 1)));
}
function filterBytes(name, rules) {
  const seq = BYTES_HIGHEST_FIRST ? rules : [...rules].reverse();
  let out = [];
  for (const r of seq) out = out.concat(r);
  return out.concat(efs(2, name)).concat(efv(3, 3)).concat(efv(4, 3));
}
function b64(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ---- slot / item-type mapping (mirror d4_lootfilter.py) -------------------
function norm(s) {
  s = (s || "").trim().replace(/^[+%]+/, "").trim().replace(/['’]/g, "");
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const ARMOR_SLOT_TYPES = {
  helm: ["helm"], "chest-armor": ["chest-armor"], gloves: ["gloves"],
  pants: ["pants"], boots: ["boots"], amulet: ["amulet"], ring: ["ring"],
};
const CLASS_WEAPONS = {
  rogue:       { "1h": ["sword", "dagger", "hand-crossbow"], "2h": [], ranged: ["bow", "crossbow"], offhand: [] },
  barbarian:   { "1h": ["axe", "mace", "sword"], "2h": ["two-handed-axe", "two-handed-mace", "two-handed-sword", "polearm"], ranged: [], offhand: [] },
  necromancer: { "1h": ["sword", "dagger", "wand", "scythe"], "2h": ["two-handed-sword", "two-handed-scythe"], ranged: [], offhand: ["focus", "shield"] },
  sorcerer:    { "1h": ["wand"], "2h": ["staff"], ranged: [], offhand: ["focus"] },
  druid:       { "1h": ["axe", "mace"], "2h": ["two-handed-axe", "two-handed-mace", "staff"], ranged: [], offhand: ["totem"] },
  spiritborn:  { "1h": [], "2h": ["staff", "polearm"], ranged: [], offhand: [] },
};
const SLOT_LABELS = {
  "chest-armor": "Chest", ring: "Rings", "dual-wield-weapon": "Melee",
  "ranged-weapon": "Ranged", "main-hand-weapon": "Weapon", "off-hand-weapon": "Off-Hand",
  "two-handed-bludgeoning-weapon": "2H Blunt", "two-handed-slashing-weapon": "2H Slash",
};

const INF_RANGED = new Set(["2hbow", "2hcrossbow", "bow", "crossbow"]);
const INF_OFF_HAND = new Set(["1hfocus", "1hshield", "1htotem", "focus", "shield", "totem"]);
const INF_TWO_HAND = new Set(["2hsword", "2haxe", "2hmace", "2hscythe", "2hstaff", "2hpolearm", "2hglaive", "2hquarterstaff", "quarterstaff"]);
const INF_ONE_HAND = new Set(["1hsword", "1haxe", "1hmace", "1hdagger", "1hwand", "1hscythe", "1hflail", "1hcrossbow", "sword", "axe", "mace", "dagger", "wand"]);

function slotTypeKeys(slot, cls) {
  const base = norm(slot).replace(/-\d+$/, "");
  if (ARMOR_SLOT_TYPES[base]) return { keys: ARMOR_SLOT_TYPES[base], base };
  const w = CLASS_WEAPONS[cls || ""] || {};
  let keys;
  if (base.includes("ranged")) keys = w.ranged;
  else if (base.includes("dual-wield")) keys = w["1h"];
  else if (base.includes("bludgeoning") && cls === "barbarian") keys = ["two-handed-mace"];
  else if (base.includes("slashing") && cls === "barbarian") keys = ["two-handed-sword", "two-handed-axe", "polearm"];
  else if (base.includes("two-handed")) keys = w["2h"];
  else if (base.includes("off-hand")) keys = w.offhand;
  else if (base.includes("main-hand") || base.includes("weapon")) keys = (w["1h"] || []).concat(w["2h"] || []);
  else keys = null;
  return { keys: (keys && keys.length) ? keys : null, base };
}
function slotLabel(base) {
  return SLOT_LABELS[base] || base.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const ARMOR_HEAD = { helm: "helm", chest: "chest-armor", gloves: "gloves", pants: "pants", boots: "boots", amulet: "amulet", ring: "ring" };
function slotSlug(itemId) {
  const head = norm(itemId).split("-")[0];
  if (ARMOR_HEAD[head]) return ARMOR_HEAD[head];
  if (INF_RANGED.has(head)) return "ranged-weapon";
  if (INF_OFF_HAND.has(head)) return "off-hand-weapon";
  if (INF_TWO_HAND.has(head)) return "two-handed-weapon";
  if (INF_ONE_HAND.has(head)) return "dual-wield-weapon-1";
  return null;
}
function charmSetInternal(itemId) {
  const m = itemId.toLowerCase().match(/^talisman_charm_set_(.+)_(\d+)_\d+$/);
  return m ? `talisman-${m[1]}-${m[2]}` : norm(itemId);
}

// The rule label a given row's slot belongs to — lets the preview bucket each
// affix under its own slot instead of guessing from a (possibly shared) hash.
export function slotLabelFor(slot, cls) {
  return slotLabel(slotTypeKeys(slot, cls).base);
}

// ---- Maxroll extraction --------------------------------------------------
export function listVariants(pdata) {
  return (pdata.profiles || []).map((p, i) => ({ index: i, name: p.name || `variant ${i}` }));
}

function uniqueName(itemId, bundle) {
  const core = norm(itemId);
  for (const cand of [core, core.replace(/-x\d+$/, ""), core.replace(/^\d+-/, "")]) {
    if (bundle.uniqueByInternal[cand]) return bundle.uniqueByInternal[cand];
  }
  return null;
}

// -> { rows:[[slot,hash,greater,name]], uniques:[name], charmHashes:[id], hasSeal, cls, detected }
export function extractVariant(pdata, variantIndex, cls, bundle) {
  const variant = pdata.profiles[variantIndex];
  const items = pdata.items || {};
  const rows = [], uniques = [], charmHashes = [];
  let hasSeal = false;
  const detected = { uniques: [], sets: new Set(), unmappedAffix: 0, skipped: 0 };

  const slots = Object.keys(variant.items || {}).map(Number).sort((a, b) => a - b);
  for (const slotNo of slots) {
    const it = items[String(variant.items[slotNo])];
    if (!it) continue;
    const id = it.id || "";
    const low = id.toLowerCase();

    if (low.startsWith("talisman_seal")) { hasSeal = true; continue; }
    if (low.startsWith("talisman_charm")) {
      const internal = charmSetInternal(id);
      const h = bundle.setByInternal[internal];
      if (h != null) { charmHashes.push(h); detected.sets.add(bundle.setName[String(h)] || internal); }
      else { const nm = uniqueName(id, bundle); if (nm) { uniques.push(nm); detected.uniques.push(nm); } }
      continue;
    }
    const isUnique = it.mythic || low.includes("_unique_") || low.includes("_mythic_");
    if (isUnique) {
      const nm = uniqueName(id, bundle);
      if (nm) { uniques.push(nm); detected.uniques.push(nm); }
      continue; // a unique's own affixes are fixed; matched by name, not pool
    }
    const slug = slotSlug(id);
    if (slug === null) { detected.skipped++; continue; } // runewords etc.
    for (const a of it.explicits || []) {
      const h = bundle.affix[String(a.nid)];
      if (h != null) rows.push([slug, h, !!a.greater, bundle.affixName[String(h)] || String(h)]);
      else detected.unmappedAffix++;
    }
  }
  return { rows, uniques, charmHashes, hasSeal, cls, detected };
}

// ---- shared prep: the parsed build → per-slot rules + keep/hide ids -------
// Computed once from the parsed build so FARM and STASH assemble from the same
// data (§8: load once, generate both).
function prepare(extracted, bundle, opts) {
  const { rows, uniques, charmHashes, cls } = extracted;
  const ancestralUniques = opts.ancestralUniques ?? false;
  const ancestralGear = opts.ancestralGear ?? false;
  const alwaysMythic = opts.alwaysMythic ?? true;
  const co = opts.colors || {};
  const COL = {
    unique: co.unique ?? C_UNIQUE, mythic: co.mythic ?? C_MYTHIC, set: co.set ?? C_SET,
    codex: co.codex ?? C_GREEN, bis: co.bis ?? C_BIS, gear: co.gear ?? C_GEAR,
    partial: co.partial ?? C_PARTIAL, ga: co.ga ?? C_CYAN, seal: co.seal ?? C_SEAL,
    // STASH tiers reuse FARM colours for the equivalent tiers (T1 white, T2 blue,
    // T4 teal) plus one new colour for T3.
    stashT1: co.stashT1 ?? co.bis ?? C_BIS, stashT2: co.stashT2 ?? co.gear ?? C_GEAR,
    stashT3: co.stashT3 ?? C_STASH_T3, stashT4: co.stashT4 ?? co.partial ?? C_PARTIAL,
  };

  const groups = new Map(), order = [];
  for (const [slot, hash, greater] of rows) {
    const { keys, base } = slotTypeKeys(slot, cls);
    const gk = base + "|" + (keys || []).join(",");
    let g = groups.get(gk);
    if (!g) { g = { base, keys, ids: [], ga: [] }; groups.set(gk, g); order.push(gk); }
    if (!g.ids.includes(hash)) g.ids.push(hash);
    if (greater && !g.ga.includes(hash)) g.ga.push(hash);
  }
  const slotRules = order.map((gk) => {
    const g = groups.get(gk);
    const typeIds = (g.keys || []).map((k) => bundle.itemType[k]).filter((t) => t != null);
    const nFull = Math.min(NATURAL_AFFIXES, g.ids.length);
    return { label: slotLabel(g.base), typeIds, ids: g.ids, ga: g.ga, nBis: nFull, nFix: nFull };
  });

  const setIds = [];
  for (const h of charmHashes) if (!setIds.includes(h)) setIds.push(h);
  const uids = [];
  for (const nm of uniques) {
    const hs = bundle.uniqueHashes[nm];
    if (hs) for (const h of hs) if (!uids.includes(h)) uids.push(h);
  }
  return {
    slotRules, setIds, uids, COL,
    sealType: bundle.sealType, charmType: bundle.charmType,
    allTypeIds: bundle.allItemTypeIds || [],
    ancestralUniques, ancestralGear, alwaysMythic,
  };
}

// Rare/Legendary + (Ancestral when enabled) + correct item type. Shared by both.
function gearBaseConds(sr, ancestralGear) {
  const conds = [cRarity(RARE | LEGENDARY)];
  if (ancestralGear) conds.push(cProps(PROP_ANCESTRAL));
  if (sr.typeIds.length) conds.push(cItemType(sr.typeIds));
  return conds;
}

// ---- FARM rule assembly (mirror build_filter_code) -----------------------
export function buildFilter(extracted, name, bundle, opts = {}) {
  const gaN = opts.gaThreshold ?? 1;
  const hideJunk = opts.hideJunk ?? true;
  const partial = opts.partial ?? true;
  const partialMin = 2;
  const { slotRules, setIds, uids, COL, sealType, charmType, allTypeIds,
          ancestralUniques, ancestralGear, alwaysMythic } = prepare(extracted, bundle, opts);

  function slotConds(sr, n, ga) {
    return gearBaseConds(sr, ancestralGear).concat([cAffixes(sr.ids, n, ga)]);
  }
  function assemble(bisRules, partialRules) {
    const rules = [];
    if (uids.length) {
      const uc = [cUniques(uids)];
      if (ancestralUniques) uc.push(cProps(PROP_ANCESTRAL));
      rules.push(rule("Build Uniques", RECOLOR, uc, COL.unique));
    }
    if (setIds.length) rules.push(rule("Set Charms", RECOLOR, [cTalismanSet(setIds)], COL.set));
    if (alwaysMythic) rules.push(rule("Mythic Uniques", RECOLOR, [cRarity(MYTHIC)], COL.mythic));
    rules.push(rule("Codex Upgrade", RECOLOR, [cCodex()], COL.codex));
    for (const sr of bisRules) rules.push(rule(`BiS: ${sr.label}`, RECOLOR, slotConds(sr, sr.nBis, sr.ga), COL.bis));
    for (const sr of slotRules) rules.push(rule(`Gear: ${sr.label}`, RECOLOR, slotConds(sr, sr.nFix, []), COL.gear));
    // 2-of-pool progression tier, below full-match tiers, above the GA catch.
    for (const sr of partialRules) rules.push(rule(`2/3: ${sr.label}`, RECOLOR, slotConds(sr, partialMin, []), COL.partial));
    rules.push(rule(`${gaN}+ Greater Affix`, RECOLOR, [cGreater(gaN)], COL.ga));
    if (sealType != null) rules.push(rule("Legendary Seals", RECOLOR, [cRarity(LEGENDARY | UNIQUE | MYTHIC), cItemType([sealType])], COL.seal));
    if (charmType != null) rules.push(rule("Set Charms (all)", SHOW, [cRarity(TALISMAN), cItemType([charmType])]));
    if (ancestralUniques) rules.push(rule("Ancestral Uniques", SHOW, [cRarity(UNIQUE | MYTHIC), cProps(PROP_ANCESTRAL)]));
    else rules.push(rule("Keep Uniques", SHOW, [cRarity(UNIQUE | MYTHIC)]));
    if (hideJunk) {
      let mask = COMMON | MAGIC | RARE | LEGENDARY;
      if (ancestralUniques) mask |= UNIQUE;
      const conds = [cRarity(mask)];
      if (allTypeIds.length) conds.push(cItemType(allTypeIds));
      rules.push(rule("Hide Junk Gear", HIDE, conds));
    }
    return rules;
  }

  let bis = slotRules.filter((sr) => sr.ga.length);
  let partials = partial ? slotRules.filter((sr) => sr.nFix > partialMin) : [];
  const dropped = [];
  let rules = assemble(bis, partials);
  while (rules.length > MAX_RULES && partials.length) {
    dropped.push("2/3 " + partials[partials.length - 1].label); partials = partials.slice(0, -1);
    rules = assemble(bis, partials);
  }
  while (rules.length > MAX_RULES && bis.length) {
    dropped.push(bis[bis.length - 1].label); bis = bis.slice(0, -1);
    rules = assemble(bis, partials);
  }
  const code = b64(filterBytes(name, rules));
  return { code, ruleCount: rules.length, dropped, slotRules, partials, setIds, uids };
}

// ---- STASH rule assembly (mirror stash_filter_code) ----------------------
// Upgrade-triage of already-looted gear: four graded candidate tiers per slot,
// and no pickup catch-alls (no generic Codex, no generic Greater Affix catch).
export function buildStash(extracted, name, bundle, opts = {}) {
  const { slotRules, setIds, uids, COL, sealType, charmType, allTypeIds,
          ancestralUniques, ancestralGear, alwaysMythic } = prepare(extracted, bundle, opts);

  const base = (sr) => gearBaseConds(sr, ancestralGear);
  // Tier condition builders (the three affix concepts kept explicit):
  const t1Conds = (sr) => base(sr).concat([cRequiredAffixes(sr.ids, sr.nBis, sr.ga)]);      // full + priority GA
  const t2Conds = (sr) => base(sr).concat([cRequiredAffixes(sr.ids, sr.nFix)]);             // full, no GA
  const t3Conds = (sr) => base(sr).concat([                                                 // 2 desired + a desired GA
    cRequiredAffixes(sr.ids, STASH_MIN),        // type 6: >=2 of the pool present
    cOptionalAffixes(sr.ids, 1, sr.ids)]);      // type 7: >=1 of the pool present AND Greater
  const t4Conds = (sr) => base(sr).concat([cRequiredAffixes(sr.ids, STASH_MIN)]);           // plain 2-of-pool

  let t1 = slotRules.filter((sr) => sr.ga.length);
  let t2 = slotRules.slice();
  let t3 = slotRules.filter((sr) => sr.nFix > STASH_MIN);
  let t4 = slotRules.filter((sr) => sr.nFix > STASH_MIN);

  function assemble() {
    const rules = [];
    if (uids.length) {
      const uc = [cUniques(uids)];
      if (ancestralUniques) uc.push(cProps(PROP_ANCESTRAL));
      rules.push(rule("Build Uniques", RECOLOR, uc, COL.unique));
    }
    if (setIds.length) rules.push(rule("Set Charms", RECOLOR, [cTalismanSet(setIds)], COL.set));
    if (alwaysMythic) rules.push(rule("Mythic Uniques", RECOLOR, [cRarity(MYTHIC)], COL.mythic));
    for (const sr of t1) rules.push(rule(`T1: ${sr.label}`, RECOLOR, t1Conds(sr), COL.stashT1));
    for (const sr of t2) rules.push(rule(`T2: ${sr.label}`, RECOLOR, t2Conds(sr), COL.stashT2));
    for (const sr of t3) rules.push(rule(`T3: ${sr.label}`, RECOLOR, t3Conds(sr), COL.stashT3));
    for (const sr of t4) rules.push(rule(`T4: ${sr.label}`, RECOLOR, t4Conds(sr), COL.stashT4));
    if (sealType != null) rules.push(rule("Legendary Seals", RECOLOR, [cRarity(LEGENDARY | UNIQUE | MYTHIC), cItemType([sealType])], COL.seal));
    if (charmType != null) rules.push(rule("Set Charms (all)", SHOW, [cRarity(TALISMAN), cItemType([charmType])]));
    if (ancestralUniques) rules.push(rule("Ancestral Uniques", SHOW, [cRarity(UNIQUE | MYTHIC), cProps(PROP_ANCESTRAL)]));
    else rules.push(rule("Keep Uniques", SHOW, [cRarity(UNIQUE | MYTHIC)]));
    let mask = COMMON | MAGIC | RARE | LEGENDARY;
    if (ancestralUniques) mask |= UNIQUE;
    const conds = [cRarity(mask)];
    if (allTypeIds.length) conds.push(cItemType(allTypeIds));
    rules.push(rule("Hide Junk Gear", HIDE, conds));
    return rules;
  }

  // Over budget: shed weakest tiers first (T4, then T3, T2, T1), last slot first.
  const dropped = [];
  let rules = assemble();
  for (const [label, tier] of [["T4", t4], ["T3", t3], ["T2", t2], ["T1", t1]]) {
    while (rules.length > MAX_RULES && tier.length) {
      dropped.push(`${label}: ${tier[tier.length - 1].label}`); tier.pop();
      rules = assemble();
    }
  }
  const code = b64(filterBytes(name, rules));
  return { code, ruleCount: rules.length, dropped, slotRules,
           tiers: { t1, t2, t3, t4 }, setIds, uids };
}

// (FARM name, STASH name) within MAX_NAME; mirrors dual_filter_names in Python.
export function dualFilterNames(base) {
  base = (base || "D4 Filter").trim();
  const room = MAX_NAME - " — STASH".length;
  const b = base.slice(0, room).replace(/\s+$/, "") || "D4 Filter".slice(0, room);
  return { farm: `${b} — FARM`, stash: `${b} — STASH` };
}

// ---- fetch helpers -------------------------------------------------------
export function parsePlannerId(input) {
  const s = (input || "").trim();
  const m = s.match(/planner\/([A-Za-z0-9_-]{4,40})/) ||
            s.match(/^([A-Za-z0-9_-]{4,40})(?:#\d+)?$/);
  const idx = s.match(/#(\d+)/);
  return m ? { id: m[1], variant: idx ? Number(idx[1]) : null } : null;
}
export async function fetchProfile(plannerId) {
  const r = await fetch(`https://planners.maxroll.gg/profiles/d4/${plannerId}`);
  if (!r.ok) throw new Error(`planner ${plannerId}: HTTP ${r.status}`);
  const prof = await r.json();
  const data = typeof prof.data === "string" ? JSON.parse(prof.data) : prof.data;
  return { name: prof.name, cls: (prof.class || "").toLowerCase() || null, data };
}
