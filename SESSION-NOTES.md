# Session Notes — 2026-07-08 · handoff

## Running right now (unattended)

- **Veilbound art generation** (200 images, ~15–20 min on the 4070) is rendering in **staged mode**: images land in `I:\dead-era-ai\art-staging`, and are published to `art/` + `art/manifest.js` **in one burst at the very end**, so a live-server session isn't disturbed mid-run. Requires ComfyUI to stay up (`tools/start-comfyui.ps1` if it was closed).
- **Check tomorrow:** `art/` should hold ~286 PNGs including `vb_*` files. If not, just re-run: `node tools/generate-art.mjs --no-llm --staged` — it only renders what's missing.
- Live-server tip: add `art/**` to `liveServer.settings.ignoreFiles` to avoid even the one reload burst at publish time.

## What landed at the end of this session (engine side, all tested ✅)

- **Death is never an auto-play anymore**: units, omen units, and destroyed situations all go to their owner's **dead hand**; the dead board is built only by paying dead energy. (Undying still bounces to the living hand; dead-side deaths still final.)
- **Generic situation engine**: every situation face carries `sitFx {kind, n, charges?}` — all legacy situations migrated. Kinds: `livingAtk deadAtk foeDeadAtk turnDraw turnLife turnSoul turnEss turnDeadEss turnDrain ward enterDeadHp onLivingDeathLife onDeadDestroyDrain doom`.
- **Generic spell engine**: `face.fx {kind,...}` in `runSpellFx()` — `dmg buff drainSoul drainLife healLife healSoul cauterize draw(payLife/paySoul) gainEss gainDeadEss aoe shift gamble possess dispel` + the `echo` flag (living cast copies itself to the dead hand).
- **New unit mechanics**: `twin` (reflection to dead hand on living play), `harvest:N` (kills drain Soul), `consume` (eats weakest friendly dead unit on dead play), `blood:N` Bloodprice (pay Life living / Soul dead — can shatter yourself; cost:0), doom knells & charge counters on situations.
- **`js/sets/veilbound.js`** — the 100-card set (58 units / 26 spells / 16 situations), every card with `art:{l,d}` prompts. **NOT yet loaded by the game** (deliberate — see below).
- `npm test` currently: **112 rule tests + fuzz, all green** (set not loaded yet, so untested).

## Remaining to do (priority order)

1. **Load the set**: add `<script src="js/sets/veilbound.js"></script>` to `index.html` between `js/game.js` and `js/meta.js`. Collection migration then auto-grants 1 copy of each new card and packs start dropping them.
2. **Bloodprice for situations**: `playSituation()` in `js/game.js` doesn't yet handle `def.blood` (needed by `vb_fountain`). Mirror the `canPayBlood`/`payBlood` logic from `playUnit`.
3. **UI polish for new mechanics**:
   - Blood-cost gem on cards (red gem showing `def.blood`; affordable = living: `life > blood`, dead: always) in `cardEl` + preview (`js/ui.js`), plus a `.cost.blood` style.
   - Doom/charge counters on situation plates (`sitPlate()`): show `🔔 sit.n/fx.n` for doom, `sit.c left` for charges.
4. **AI support**: scripted AI has no heuristics for generic-fx spells or blood units yet — it will simply never cast/play them.
   - Add a `tryFx()` fallback in `scriptedPlayOnce` switching on `face.fx.kind` (dmg→like smite, buff→own biggest, drain→like soultap, heal→if missing, draw→if hand small & can pay, aoe→if enemy loses more, shift→if other face is ≥3 stats better, gamble→if deck nonempty, possess→enemy dead usum≥5, dispel→any target).
   - Blood-unit gates in `scriptedPlayOnce` options and LLM `addPlays` (`canPayBlood` instead of pool check; AI shouldn't blood-pay below ~life 8).
5. **Tests**: add (a) a **card-integrity mass test** — every DEFS entry has valid type/cost/rarity, units have l+d, spell fx kinds ∈ implemented set, situation sitFx kinds ∈ implemented set, omen deadFaces have sitFx; (b) mechanic tests for twin/harvest/consume/blood/echo/shift/gamble/possess/doom/charges; (c) fuzz with a Veilbound-heavy deck. Then `npm test` + `npm run test:ui`.
6. **Balance pass** on Veilbound numbers after a few games; consider adding some `vb_` cards to the default `DECKLIST`.
7. **Docs**: DESIGN.md section for Veilbound + the new mechanic glossary; README card-count updates.

## Where things live

- Rules engine: `js/game.js` (DOM-free) · cards: `js/cards.js` + `js/sets/veilbound.js` · UI: `js/ui.js` · meta/packs/builder: `js/meta.js`
- Tests: `npm test` (rules+fuzz), `npm run test:ui` (headless-Edge, needs `npm install` once)
- Art pipeline: `tools/generate-art.mjs` (`--no-llm` fast, `--staged` no-interruption, `--only <id>`, `--force`) · ComfyUI at `I:\dead-era-ai`
- Debug boards: `index.html#demo`, `#packs`, `#builder`
