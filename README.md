# d4-lootfilter-generator

[![Release](https://img.shields.io/github/v/release/Freitag47/d4-lootfilter-generator)](https://github.com/Freitag47/d4-lootfilter-generator/releases)
[![Downloads](https://img.shields.io/github/downloads/Freitag47/d4-lootfilter-generator/total)](https://github.com/Freitag47/d4-lootfilter-generator/releases)
[![License](https://img.shields.io/github/license/Freitag47/d4-lootfilter-generator)](LICENSE)

**[⬇ Download the latest release (zip)](https://github.com/Freitag47/d4-lootfilter-generator/releases/latest/download/d4-lootfilter-generator.zip)**, unpack it anywhere, double-click `run.bat`.

Turn a build guide into a native Diablo 4 loot filter.

The script reads a build from Mobalytics, D4Builds, InfinityBuilds or **Maxroll**:
the stat priorities of every gear slot, which stats the build wants as Greater
Affixes, its uniques, talisman set charms and seal. It maps all of that to the
game's internal ids and prints an import code for:

> Character Menu → Loot Filter → New Filter → **Import**

```
python d4_lootfilter.py "https://mobalytics.gg/diablo-4/builds/rogue-dance-of-knives"
python d4_lootfilter.py "https://d4builds.gg/builds/dance-of-knives-rogue-endgame/?var=0"
python d4_lootfilter.py "https://infinitybuilds.gg/en/builds/hFrM0wPM4G"
python d4_lootfilter.py "https://maxroll.gg/d4/planner/mmfzmj0i"
python d4_lootfilter.py "https://maxroll.gg/d4/build-guides/dance-of-knives-rogue-guide"
python d4_lootfilter.py mmfzmj0i          # a bare Maxroll planner id works too
```

**No install, in your browser:** this fork also ships a static web app —
**D4 Filter Master** (`web/`) — where you paste a Maxroll build and copy the
import code, no Python needed. See [Web app](#web-app-d4-filter-master).

On Windows you don't need a command line at all: double-click `run.bat` and
paste the link there ([Setup](#setup)).

```
Filter: Rogue Dance Of Knives   (variant 8)   class: rogue
Uniques: 1   Slot rules: 9   Unmapped: 0   Rules: 23/25   Sets: 1

Gear rules (Rare/Legendary, * = wanted as Greater Affix):
  Helm      3+ of 4  (helm)
            Dexterity, Maximum Life, Cooldown Reduction, Imbuements Skills
  Gloves    3+ of 4  (gloves)  [BiS tier]
            Vulnerable Damage*, Damage Over Time, Poison Damage, Dance of Knives
  ...
IMPORT CODE (D4 -> Loot Filter -> New Filter -> Import):
CiEKDUJ1aWxkIFVuaXF1ZXMQAh1QUP...
```

## Two filters from one build: FARM and STASH

Every run produces **two** import codes from the same parsed build — `<name> — FARM`
and `<name> — STASH` — for two different jobs:

- **FARM** (active gameplay): keep useful drops visible, hide ordinary junk. This
  is the rule set described below.
- **STASH** (upgrade triage): now that you *own* an item, how much attention does
  it deserve as a possible upgrade? Stricter, and grouped into four graded
  candidate tiers per slot. It deliberately drops the pickup-oriented catch-alls
  (no generic Codex rule, no generic Greater-Affix catch), so a random garbage GA
  never makes a stash item look interesting.

  | Tier | Colour | Meaning |
  |---|---|---|
  | T1 | white | full desired match **and** the Maxroll-marked priority Greater Affix |
  | T2 | blue | full desired match, no GA required |
  | T3 | pink | **2 desired stats and at least one of them is a Greater Affix** |
  | T4 | teal | 2 desired stats, no GA (a single enchant may fix the third) |

  T3 is encoded with two affix conditions in one rule — a type-6
  `HAS_REQUIRED_AFFIXES` (min 2 of the desired pool) **and** a type-7
  `HAS_OPTIONAL_AFFIXES` (min 1 of the same pool, all pool affixes GA-marked) — so
  the tier means "≥2 desired **and** ≥1 desired is Greater", not the generic "has
  any Greater Affix". Over the 25-rule budget STASH sheds weakest tiers first
  (T4, then T3, T2, T1), last slot first, and reports exactly what it dropped.

## How the FARM filter works

It is a strict endgame filter: it shows what the build can use and hides the rest.
Rules are evaluated top to bottom in game, first match wins.

| # | Colour | Rule |
|---|---|---|
| 1 | red | the build's uniques and unique charms |
| 2 | purple | the build's talisman set charms |
| 3 | gold | **Mythic Uniques** — their own always-visible section, never gated by the ancestral options (disable with `--no-always-mythic`) |
| 4 | green | Codex of Power upgrades |
| 5 | white | per-slot BiS: right item type, all desired affixes, and the marked stats rolled as Greater Affix |
| 6 | blue | per-slot full match: right item type, Rare/Legendary, all affix slots from the wanted pool |
| 7 | teal | per-slot **partial match**: right item type, **2 of the wanted pool** — a progression tier, since a full 3/3 roll is rare (disable with `--no-partial`) |
| 8 | cyan | `--ga-threshold`+ Greater Affixes but not a build match (default 1) |
| 9 | magenta | Legendary/Unique seals (lower seal rarities are hidden) |
| 10 | shown | set charms of any set (magic/rare charms are hidden) |
| 11 | shown | all Uniques and Mythics |
| 12 | hidden | everything else that is gear, up to Legendary, Ancestral or not (only when hiding is enabled) |

The partial tier (7) sits **above** the Greater-Affix catch-all (8). Because the
game evaluates rules top to bottom, first match wins, a wanted item — full or
2-of-3 — that also happens to roll a Greater Affix matches its build tier and is
coloured accordingly; it is never swallowed by the generic GA rule.

The slot rules are the core. A dropped Legendary has three affix slots and a build
lists four wanted stats per gear slot, so an item only lights up when its whole
affix roll comes out of that pool, on the right item type. A helm stat on an
amulet stays dark. The white tier additionally requires the stats the build marks
(the little GA arrows on the guide) to actually be Greater Affixes; an enchanted
affix can never become one, which is why this is checked per stat and not as a
count. Ring 1/2 and the two dual-wield slots merge into one rule each, and weapon
item types come from a per-class table (rogue melee is sword/dagger/hand crossbow,
and so on).

Slots occupied by a unique don't contribute affixes to the pools, since a unique's
stats are fixed. The item itself is matched by name in rule 1 instead.

Only Uniques and Mythics are always visible. The hide rule covers everything else
that matched nothing, including Ancestrals, but it is scoped to equipment item
types: gold, materials, elixirs and sigils are never touched. With
`--ancestral-uniques` (`run.bat` asks for it) rules 1 and 9 only match Ancestral
uniques (via the item-properties condition, any Greater Affix count) and the
hide rule swallows the rest, the build's uniques included. `--ancestral-gear`
(second `run.bat` question) does the same for the white and blue slot tiers:
only Ancestral rare/legendary drops light up, non-Ancestral matches get hidden. Recolors avoid
orange and yellow on purpose, the game already uses those for Legendary and Rare
item names.

A filter can hold 25 rules and a full build needs about 23. If a build would go
over, BiS rules are dropped (last slots first) and the report says so. Import the
code once and skim the rules in the in-game editor, especially after a game patch.

## Setup

### Windows

Grab the repo (**Code → Download ZIP**, unpack it anywhere) and double-click
**`run.bat`**. It checks whether Python, Playwright and Chromium are present,
runs the setup on its own if something is missing, then just asks for a build
link. No terminal or Python knowledge needed.

`setup.bat` can also be run on its own. It only installs what the PC does not
have yet:

- Python 3.12 via winget (where winget is unavailable it opens the python.org
  download page instead)
- the Playwright package
- Playwright's Chromium, a one-time download of roughly 150 MB

If it had to install Python, run it a second time afterwards; an already open
console does not see the fresh installation.

### Manual (macOS, Linux, or if you prefer pip)

Python 3.9 or newer, then:

```
python -m pip install -r requirements.txt
python -m playwright install chromium
```

`--stats` and `--paste` need none of this, they run on a plain Python install.
If a fetch aborts with `Playwright is required to fetch from a URL` or
`Chromium is missing`, the two commands above are the fix.

## Usage

| Command | What it does |
|---|---|
| `d4_lootfilter.py "<url>"` | fetch a Mobalytics/D4Builds/InfinityBuilds/Maxroll build, print the import code |
| `d4_lootfilter.py mmfzmj0i` | a bare Maxroll planner id (or a `maxroll.gg/d4/build-guides/…` link) |
| `d4_lootfilter.py "<url>" --print-detected` | also list the detected uniques and set charms |
| `d4_lootfilter.py --stats "vulnerable damage, max life, ..."` | build from a manual stat list |
| `d4_lootfilter.py --paste` | paste gear text from any site, end with an empty line |
| `d4_lootfilter.py "<url>" --html saved.html` | read a saved Mobalytics page offline |

| Flag | Meaning |
|---|---|
| `--variant ID` | Mobalytics variant id (default from the URL), d4builds `var` index, or InfinityBuilds/Maxroll variant index/name |
| `--name "..."` | filter name in game, max 30 chars (default from the build) |
| `--ga-threshold N` | Greater Affixes needed for the cyan rule (default 1) |
| `--class NAME` | override the auto-detected class (drives weapon item types) |
| `--no-hide` | never hide anything, only recolor/keep |
| `--no-partial` | drop the teal 2-of-3 progression tier (full 3/3 match only) |
| `--no-always-mythic` | drop the dedicated always-visible Mythic Uniques rule |
| `--ancestral-uniques` | show uniques, the build's own included, only when they drop as Ancestral |
| `--ancestral-gear` | match the per-slot BiS/gear/partial rules only on Ancestral drops |
| `--include-tempering` | treat tempering stats as droppable affixes (loosens matching) |
| `--refresh-maxroll-data` | re-download Maxroll's affix dictionary before building |
| `--dump-json PATH` | save the raw extracted build data |

Manual input (`--stats`/`--paste`) has no slot information, so those modes fall
back to a single pool rule that wants 2 matching affixes.

### Picking a variant

Mobalytics and D4Builds put the open variant in the URL, so copying the link is
enough. InfinityBuilds keeps it in client state: switching tabs there changes
nothing in the address bar, and a copied link cannot say which tab you meant. So
for those builds the script lists the variants once it has the build and asks:

```
This build has 3 variants:
  [0] Endgame                      23 stats, 5 uniques   (default)
  [1] Boss Rush                    23 stats, 5 uniques
  [2] Pit/Tower Pushing            19 stats, 6 uniques
Which variant? [0]:
```

Enter takes the default, which is the first variant that actually carries wanted
stats (the first tab is often an empty leveling planner). `--variant 1`,
`--variant "Boss Rush"` or a variant id skips the question, and a piped or
scripted run is never asked and keeps the default.

## Game data

All ids live in `data/` as JSON, so a game patch usually needs no code change:

- `affixes.json`: affix SNO ids with the keys used to match build-site stat names
- `uniques.json`: unique items, each name mapped to all of its SNO variant ids
- `talisman_sets.json`: charm sets and their pieces
- `item_types.json`: item type ids (weapons, armor, Charm, Horadric Seal, ...)

To regenerate after a patch, grab the latest `d4-data.json` from
[D4LootBench](https://github.com/ThunderEagle/D4LootBench) and run:

```
python tools/generate_affixes.py path/to/d4-data.json
```

This rewrites all four files. Stats the build sites name differently from the
game data are handled by normalization plus a fuzzy fallback; anything that still
can't be mapped is listed as "unmapped" in the report instead of being dropped
silently.

## Adding a site

An adapter only has to produce rows of `(slot, stat_name, wants_greater_affix)`
plus the build's unique names; id mapping, rule assembly and encoding are shared.
`slot` feeds the per-slot rules (rows with `slot=None` go to the fallback pool).

- **Mobalytics** (implemented): the build lives in `window.__PRELOADED_STATE__`;
  affixes sit at `buildVariants.values[].genericBuilder.slots[].gameEntity.modifiers.gearStats[]`.
- **D4Builds** (implemented): the build streams in client-side, so the adapter
  reads the rendered DOM. One `.builder__stats__group` per slot, GA mark =
  `greater__affix__button--filled`, rows whose dropdown carries an icon are
  tempering/aspect rows and get skipped. Equipped items via `.builder__gear__name`
  (`--unique`/`--mythic` class modifiers), charms and seal from img alt texts.
- **InfinityBuilds** (implemented): a Next.js app router page, so the build ships
  in the RSC flight payload (the `self.__next_f.push([1,"…"])` chunks concatenate
  into one text that carries `variants[].gear[]` as plain JSON). Every value is a
  game id rather than a display name, which the adapter resolves against `data/`
  alone, no site API needed: `affixId` "affix-s04-life" against the `sno` field
  (`S04_Life`), `itemId` "item-ring-unique-rogue-101-itm" against `internal`
  (`Ring_Unique_Rogue_101`), charms against the talisman set `internal`. Ids also
  encode the roll variant and item-type context (`X2_Life_Greater`,
  `S04_CritChanceJewelry`), which stem to the same filterable affix. The `greater`
  flag per affix is the GA mark; `tempered` rows, a unique's own stats and
  transfiguration bonuses are not affixes a drop can roll and are skipped. Note
  the item's `itemName` is a snapshot in whatever language the author used, so it
  is never read. The weapon family comes from the item type inside the item id,
  not from the slot name: builds do park a two-handed bow in the `offhand` slot.
  The first variant is often an empty leveling planner, so the adapter defaults to
  the first variant that actually carries wanted stats.
- **Maxroll** (implemented, **browserless**): a build guide embeds a planner id
  (`"embed_id"` in the page HTML); the planner API
  `planners.maxroll.gg/profiles/d4/<id>` returns the build as plain JSON, and the
  shared dictionary `assets-ng.maxroll.gg/d4-tools/game/data.min.json` maps each
  numeric affix `nid` to the game SNO that `data/affixes.json` already resolves.
  All three are CORS-open plain HTTP, so unlike the other three sites Maxroll
  needs **no Playwright/Chromium** — the CLI and the browser app both fetch it
  directly. Each profile is a variant (Leveling/Starter/Endgame/…); item `id`
  prefixes give the slot and item type (`_Unique_`/`_Mythic_` and `mythic:true`
  are matched by name, not pooled); each explicit carries `{nid, greater}`, and
  Rune/Runeword powers, weapon-damage implicits and a unique's own stats are
  skipped. The affix dictionary (~12 MB) is cached under `data/`
  (`--refresh-maxroll-data` re-downloads it). Accepts a planner id, a planner
  link, or a build-guide link. See [tools/maxroll_oracle.py](tools/maxroll_oracle.py).

## Web app (D4 Filter Master)

`web/` is a self-contained static site: paste a Maxroll build, pick a variant,
copy the import code — no install, everything runs in the browser. It works
because Maxroll is browserless (see above): the page fetches the planner profile
and reuses a small precomputed mapping bundle, so no 12 MB download and no server.
The same options as the CLI are exposed as toggles (hide, partial 2/3, always-show
Mythics, the ancestral rules), plus per-tier **colour customisation**.

- **Run locally:** `python -m http.server -d web 8000`, open `http://localhost:8000`.
- **Host on GitHub Pages:** the included workflow (`.github/workflows/pages.yml`)
  publishes `web/` automatically. Enable it once under *Settings → Pages →
  Source → GitHub Actions*; every push to `main` that touches `web/` redeploys.
- **Input:** a build id (`mmfzmj0i`), a planner link, or a build-guide link.

The browser never reimplements the fuzzy affix matching — `tools/gen_web_bundle.py`
precomputes `web/data/bundle.json` (nid→affix hash, unique/set/item-type ids)
from the same `data/*.json` the CLI uses. Regenerate it after a game patch:

```
python tools/maxroll_oracle.py <id>          # caches data/maxroll_data.min.json
python tools/gen_web_bundle.py               # -> web/data/bundle.json
```

`web/d4filter.js` is a faithful port of the Python encoder and rule assembly, and
is checked to produce **byte-identical** import codes:

```
python tools/maxroll_oracle.py <id> --dump web/data/oracle.json
node tools/validate_js.mjs <id> web/data/oracle.json
```

### Guide-link support (optional Cloudflare Worker)

Planner links and build ids work on plain GitHub Pages with no backend. Only a
*build-guide* link needs a tiny helper, because Maxroll's guide HTML is the one
endpoint that isn't CORS-open. `worker/` is a ~30-line Cloudflare Worker that
fetches a guide page and returns its embedded planner id (open CORS, and it only
accepts `maxroll.gg/d4/build-guides/…` URLs). Deploy and wire it up:

```
cd worker && npx wrangler deploy          # needs CLOUDFLARE_API_TOKEN + _ACCOUNT_ID
# then set WORKER_URL at the top of the <script> in web/index.html
```

Leave `WORKER_URL` empty to disable guide links entirely; planner links/ids are
unaffected.

## Format notes

The wire format follows the community protobuf schema from
[fnuecke/diablo4-loot-filter-viewer](https://github.com/fnuecke/diablo4-loot-filter-viewer):
each rule carries a name, visibility, an ARGB color and a list of AND-ed
conditions. An affix condition (type 6 `HAS_REQUIRED_AFFIXES`, type 7
`HAS_OPTIONAL_AFFIXES` — the schema documents type 7 as "same as required")
encodes `params1` = the affix-id pool, `params2` = one `(affix id, affix id)`
pair per affix that must roll as a Greater Affix, and `value1` = how many of the
pool must be present. Each `params2` entry is an independent per-affix
"this affix must be Greater" requirement (there is no count field on `params2`),
so the white/T1 tier's marked affixes are each individually required to be
Greater — matching real game exports. The two condition types exist because the
in-game UI forbids two conditions of the same type in one rule; type 7 lets a
single rule (STASH T3) carry a second affix constraint.

## Credits

Built on community reverse engineering, see [NOTICE.md](NOTICE.md) for the full
list: D4LootBench (data), fnuecke's filter viewer (schema), Upsilon72's generator
and the d4lf project. Diablo 4 is a trademark of Blizzard Entertainment; this
tool is unofficial.

MIT licensed, see [LICENSE](LICENSE).
