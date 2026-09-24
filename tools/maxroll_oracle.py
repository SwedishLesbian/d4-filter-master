#!/usr/bin/env python3
"""Ground-truth import codes for a Maxroll planner, straight through the CLI's
own Maxroll extraction + build() pipeline. This is the oracle the JS port is
validated against (tools/validate_js.mjs); it deliberately reuses the shipping
d4_lootfilter functions so the CLI, the oracle and the JS can never drift.

  python tools/maxroll_oracle.py mmfzmj0i                     # all variants
  python tools/maxroll_oracle.py mmfzmj0i --variant 3         # one variant
  python tools/maxroll_oracle.py mmfzmj0i --dump out.json     # for the JS validator
"""
import argparse, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import d4_lootfilter as d4  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("planner", help="planner id, planner link, or guide link")
    ap.add_argument("--variant", type=int, help="profile index (default: all)")
    ap.add_argument("--ga-threshold", type=int, default=1)
    ap.add_argument("--dump", help="write per-variant JSON {index,name,code} here")
    args = ap.parse_args()

    adb = d4.AffixDB(d4._data_file("affixes.json"))
    udb = d4.UniqueDB(d4._data_file("uniques.json"))
    tset = d4.TalismanSetDB(d4._data_file("talisman_sets.json"))
    itype = d4.ItemTypeDB(d4._data_file("item_types.json"))
    nid2sno = d4.maxroll_nid_to_sno()

    prof = d4.fetch_maxroll(args.planner)
    pdata, cls = prof["data"], prof["cls"]
    n = len(pdata["profiles"])
    indices = [args.variant] if args.variant is not None else range(n)

    print(f"Planner {prof['id']}: {prof.get('name')} (class {cls}) — {n} profiles\n")
    out = []
    for i in indices:
        name, rows, uniques, charms, has_seal, _c = d4.extract_maxroll(
            pdata, i, nid2sno, adb, udb, tset, cls)
        base = name or f"variant {i}"     # build() adds the — FARM / — STASH suffix
        code, rep = d4.build(adb, udb, rows, uniques, base, args.ga_threshold,
                             hide_junk=True, cls=cls, tset_db=tset, itype_db=itype,
                             charm_slugs=charms, has_seal=has_seal)
        print(f"[{i}] {base[:26]:<26} rows={len(rows):>2} FARM={rep['n_rules']} "
              f"STASH={rep['stash_n_rules']}"
              + (f"  drop:{rep['stash_dropped']}" if rep['stash_dropped'] else ""))
        out.append({"index": i, "base": base,
                    "farm_code": code, "stash_code": rep["stash_code"],
                    "farm_rules": rep["n_rules"], "stash_rules": rep["stash_n_rules"],
                    "stash_dropped": rep["stash_dropped"]})
    if args.dump:
        Path(args.dump).write_text(json.dumps(out, ensure_ascii=False, indent=2),
                                   encoding="utf-8")
        print(f"wrote {args.dump}")


if __name__ == "__main__":
    main()
