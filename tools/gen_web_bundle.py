#!/usr/bin/env python3
"""Precompute the mapping tables the browser app needs, using the real Python
DBs so the JS never has to reimplement fuzzy matching. The browser then fetches
only the small planner profile JSON (no 12 MB data.min.json download): every
Maxroll `nid` is resolved to its filter affix hash here, at build time.

  python tools/gen_web_bundle.py            # -> web/data/bundle.json

Re-run after a game patch (regenerate data/*.json first, then this). The bundle
carries only datamined ids/hashes, same as data/*.json.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import d4_lootfilter as d4  # noqa: E402

DATA_MIN = ROOT / "data" / "maxroll_data.min.json"
OUT = ROOT / "web" / "data" / "bundle.json"


def main():
    if not DATA_MIN.exists():
        raise SystemExit("run tools/maxroll_oracle.py once first to cache "
                         "data/maxroll_data.min.json")
    adb = d4.AffixDB(d4._data_file("affixes.json"))
    udb = d4.UniqueDB(d4._data_file("uniques.json"))
    tset = d4.TalismanSetDB(d4._data_file("talisman_sets.json"))
    itype = d4.ItemTypeDB(d4._data_file("item_types.json"))
    dmin = json.loads(DATA_MIN.read_text(encoding="utf-8"))

    # nid -> affix filter hash, exactly as build() resolves it:
    #   nid (data.min affix .id) -> SNO (the affix dict key) -> key_by_sno
    #   -> map_slug -> hash.  Store the display name too, for the rule preview.
    affix, affix_name = {}, {}
    for sno, entry in dmin["affixes"].items():
        nid = entry.get("id")
        if nid is None:
            continue
        key = adb.key_by_sno(sno)
        if not key:
            continue
        h, name = adb.map_slug(key)
        if h is None:
            continue
        affix[str(nid)] = h
        affix_name[str(h)] = name

    # unique item internal name -> display name, and display name -> all its
    # variant hashes (what build()'s udb.map_all(name) returns, order preserved).
    unique_by_internal = {k: v for k, v in udb.int2name.items()}
    unique_hashes = {}
    for name in set(udb.int2name.values()):
        hs, _ = udb.map_all(name)
        if hs:
            unique_hashes[name] = hs

    # talisman set internal -> the set-id build() computes, and hash -> name.
    set_by_internal, set_name = {}, {}
    for s in tset.by_hash.values():
        internal = d4._norm(s.get("internal") or "")
        if not internal:
            continue
        sid = tset.match_charm(s["name"])
        if sid is None:
            sid = int(s["hash"], 16)
        set_by_internal[internal] = sid
        set_name[str(sid)] = tset.name(sid)

    # item-type ids for every key the slot rules can ask for, plus the specials.
    keys = set()
    for v in d4.ARMOR_SLOT_TYPES.values():
        keys.update(v)
    for w in d4.CLASS_WEAPONS.values():
        for lst in w.values():
            keys.update(lst)
    keys.update(["horadric-seal", "charm"])
    item_type = {k: itype.type_id(k) for k in sorted(keys) if itype.type_id(k) is not None}

    bundle = {
        "schema": 1,
        "dataMinVersion": dmin.get("version"),
        "affix": affix,
        "affixName": affix_name,
        "uniqueByInternal": unique_by_internal,
        "uniqueHashes": unique_hashes,
        "setByInternal": set_by_internal,
        "setName": set_name,
        "itemType": item_type,
        "sealType": itype.type_id("horadric-seal"),
        "charmType": itype.type_id("charm"),
        "allItemTypeIds": [e["_int"] for e in itype.entries],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")),
                   encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"wrote {OUT.relative_to(ROOT)}  ({kb:.0f} KB)")
    print(f"  affixes={len(affix)} uniques={len(unique_by_internal)} "
          f"sets={len(set_by_internal)} itemTypes={len(item_type)} "
          f"dataMinVersion={bundle['dataMinVersion']}")


if __name__ == "__main__":
    main()
