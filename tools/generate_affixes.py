#!/usr/bin/env python3
"""
Regenerate the data/ JSON files from D4LootBench's d4-data.json.

Run this after a Diablo 4 patch changes ids:

  1. Grab the latest d4-data.json:
     https://raw.githubusercontent.com/ThunderEagle/D4LootBench/main/src/D4LootBench.Core/Data/d4-data.json
  2. python tools/generate_affixes.py path/to/d4-data.json
     (writes affixes.json, uniques.json, talisman_sets.json and item_types.json)

Match keys come from snoName (game-internal, unambiguous) for the damage/crit/
attack-speed cluster whose display names are unreliable, and from displayName for
the unambiguous majority. Cross-checked against fnuecke/diablo4-loot-filter-viewer.
"""
import json
import re
import sys
from pathlib import Path

# snoName -> canonical match keys, for entries whose displayName is wrong/ambiguous.
SNO_KEYS = {
    "S04_CoreStat_Dexterity":    ["dexterity"],
    "S04_CoreStat_Strength":     ["strength"],
    "S04_CoreStat_Intelligence": ["intelligence"],
    "S04_CoreStat_Willpower":    ["willpower"],
    "S04_AttackSpeed":           ["attack-speed"],
    "S04_CritChance":            ["critical-strike-chance", "crit-chance"],
    "S04_CritDamage":            ["critical-strike-damage", "crit-damage",
                                  "critical-strike-damage-multiplier"],
    "S04_Damage_to_Vulnerable":  ["vulnerable-damage", "vulnerable-damage-multiplier"],
    "S04_Damage_DoT":            ["damage-over-time", "damage-over-time-multiplier"],
    "S04_Damage_All":            ["all-damage", "all-damage-multiplier"],
    "S04_CooldownReductionCDR":  ["cooldown-reduction"],
    "S04_Life":                  ["maximum-life", "max-life"],
    "S04_Movement_Speed":        ["movement-speed"],
    "S04_Armor":                 ["armor"],
    "X2_DamageType_Physical":    ["physical-damage", "physical-damage-multiplier"],
    "X2_DamageType_Cold":        ["cold-damage", "cold-damage-multiplier"],
    "X2_DamageType_Fire":        ["fire-damage", "fire-damage-multiplier"],
    "X2_DamageType_Shadow":      ["shadow-damage", "shadow-damage-multiplier"],
    "X2_DamageType_Poison":      ["poison-damage", "poison-damage-multiplier"],
    "X2_DamageType_Lightning":   ["lightning-damage", "lightning-damage-multiplier"],
    "X2_DamageType_Holy":        ["holy-damage", "holy-damage-multiplier"],
}
EXTRA_ALIASES = {
    "life": "maximum-life",
    "all-resistance": "resistance-to-all-elements",
    "max-resource": "maximum-resource",
}
_SMALL = {"of", "to", "the", "on", "per"}


def norm(s: str) -> str:
    s = s.strip().lstrip("+%").strip().replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def titlecase(k: str) -> str:
    return " ".join(w if w in _SMALL else w.capitalize() for w in k.split("-"))


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("d4-data.json")
    out = Path(__file__).resolve().parent.parent / "data" / "affixes.json"
    data = json.loads(src.read_text(encoding="utf-8"))

    affixes, key_index = [], {}

    def add_keys(h, keys):
        for k in keys:
            key_index.setdefault(k, [])
            if h not in key_index[k]:
                key_index[k].append(h)

    for a in data["affixes"]:
        h = a["hash"].upper().replace("0X", "0x")
        sno = a.get("snoName", "")
        disp = a["displayName"]
        disp_clean = re.sub(r"\s*\([^)]*\)", "", disp)
        if sno in SNO_KEYS:
            keys = list(SNO_KEYS[sno])
            name = titlecase(SNO_KEYS[sno][0])
        else:
            base = norm(disp_clean)
            keys = [base] if base else []
            name = disp.lstrip("+%").strip()
            if "skillrank" in sno.lower() and base:
                keys.append("ranks-to-" + base)
        affixes.append({"hash": h, "name": name, "sno": sno,
                        "classes": a.get("classes", []), "keys": keys})
        add_keys(h, keys)

    for alias, canonical in EXTRA_ALIASES.items():
        hs = key_index.get(canonical)
        if hs:
            for e in affixes:
                if e["hash"] == hs[0] and alias not in e["keys"]:
                    e["keys"].append(alias)
                    add_keys(e["hash"], [alias])

    collisions = {k: v for k, v in key_index.items() if len(v) > 1}
    print(f"affixes: {len(affixes)}   keys: {len(key_index)}   collisions: {len(collisions)}")
    for k, v in collisions.items():
        print(f"  collision {k!r} -> {v} (first wins)")

    doc = {
        "_meta": {
            "description": "Diablo 4 affix SNO IDs for native loot-filter import codes.",
            "source": "Derived from ThunderEagle/D4LootBench d4-data.json (MIT), "
                      "cross-checked vs fnuecke/diablo4-loot-filter-viewer names.json.",
            "d4lootbench_build": data.get("source"),
        },
        "affixes": affixes,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {out} ({out.stat().st_size:,} bytes)")

    # uniques.json — feeds the "highlight my build's uniques" rule.
    # A display name can map to several SNO IDs (item variants); keep them all.
    uniques = []
    for u in data.get("uniques", []):
        h = u.get("snoId") or u.get("hash")
        dn = u.get("displayName", "")
        if not h or dn.startswith("[PH]") or dn == u.get("internalName"):
            continue
        uniques.append({
            "hash": h.upper().replace("0X", "0x"),
            "name": dn,
            "internal": u.get("internalName"),
            "classes": u.get("classes", []),
            "keys": [norm(dn)],
        })
    uout = out.parent / "uniques.json"
    uout.write_text(json.dumps(
        {"_meta": {"source": "Derived from ThunderEagle/D4LootBench d4-data.json (MIT)."},
         "uniques": uniques}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {uout} ({len(uniques)} uniques, {uout.stat().st_size:,} bytes)")

    # talisman_sets.json — feeds the "highlight the build's set charms" rule
    # (loot-filter condition type 9, matched by set hash).
    sets = []
    for s in data.get("talismanSets", []):
        h = s.get("hash")
        dn = s.get("displayName", "")
        if not h or not dn:
            continue
        sets.append({
            "hash": h.upper().replace("0X", "0x"),
            "name": dn,
            "internal": s.get("internalName"),
            "classes": s.get("classes", []),
            "keys": [norm(dn)],
            "items": [{"hash": it["hash"].upper().replace("0X", "0x"), "name": it.get("displayName")}
                      for it in s.get("items", []) if it.get("hash")],
        })
    sout = out.parent / "talisman_sets.json"
    sout.write_text(json.dumps(
        {"_meta": {"source": "Derived from ThunderEagle/D4LootBench d4-data.json (MIT)."},
         "talismanSets": sets}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {sout} ({len(sets)} sets, {sout.stat().st_size:,} bytes)")

    # item_types.json — feeds ItemType rules (condition type 5), e.g. Horadric Seal.
    itypes = []
    for a in data.get("itemTypes", []):
        h = a.get("hash")
        dn = a.get("displayName", "")
        if not h or not dn:
            continue
        itypes.append({"hash": h.upper().replace("0X", "0x"), "name": dn, "keys": [norm(dn)]})
    iout = out.parent / "item_types.json"
    iout.write_text(json.dumps(
        {"_meta": {"source": "Derived from ThunderEagle/D4LootBench d4-data.json (MIT)."},
         "itemTypes": itypes}, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {iout} ({len(itypes)} item types, {iout.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
