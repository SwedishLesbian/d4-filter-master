# Credits and attribution

This tool stands on community reverse engineering of Diablo 4's loot filter
format and datamined game data. Thanks to:

- **ThunderEagle / D4LootBench** (MIT License): the `data/*.json` files (affixes,
  uniques, talisman sets, item types) are derived from their `d4-data.json`
  (CASC-extracted affix/item/set SNO ids).
  https://github.com/ThunderEagle/D4LootBench
- **fnuecke / diablo4-loot-filter-viewer**: the protobuf schema
  (`diablo4-loot-filter.proto`) and a second independent affix id table used to
  cross-check ids. https://github.com/fnuecke/diablo4-loot-filter-viewer
- **Upsilon72 / d4-filter-generator**: original reverse engineering of the base64
  protobuf import code format and the first affix id tables.
  https://github.com/Upsilon72/d4-filter-generator
- **d4lfteam / d4lf**: reference for build site extraction and affix name
  matching. https://github.com/d4lfteam/d4lf
- **DiabloTools / d4data**: the CoreTOC SNO tables underlying the datamined ids.
  https://github.com/DiabloTools/d4data
- **Maxroll.gg**: the Maxroll adapter reads a build's planner profile
  (`planners.maxroll.gg`) and Maxroll's public game-data dictionary
  (`assets-ng.maxroll.gg/d4-tools/game/data.min.json`) purely to map Maxroll's
  numeric affix ids to the game's datamined SNO ids. Build guides and planner
  contents are the work of their respective Maxroll authors. This tool is
  unofficial and not affiliated with or endorsed by Maxroll.

Affix ids are datamined game data (identifiers, not creative content). Diablo 4
is a trademark of Blizzard Entertainment; this tool is unofficial and not
affiliated with Blizzard.

The `data/` JSON files incorporate data from D4LootBench, used under the MIT
License (Copyright (c) 2026 Scott Williams, ThunderEagle/D4LootBench; full text:
https://github.com/ThunderEagle/D4LootBench/blob/main/LICENSE).
