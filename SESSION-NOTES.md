# Session Notes — 2026-07-08 (late) · Balance pass: health, hand size, unit sacrifice, dead-hand cooldown

## Rules changes (user design)
- **Health up across the board**: `START_LIFE` 25→30, `START_SOUL` 15→20 (js/cards.js) — the dead-side war has room to breathe (DESIGN.md's own tuning note suggested 18–20 Soul).
- **Opening hand is 7** (was 5) for both sides; mulligan unchanged.
- **Sacrifice reaches the board**: the turn-start prompt now accepts a hand card OR one of your units (`sacrificeUnit()` in js/game.js). Living-face units cross to the dead hand; dead faces/tokens burn to nothing. Martyr and Brann's passive fire either way. Units pulse red during the prompt; the LLM AI gets `sacrifice_unit` actions.
- **Dead-hand cooldown**: every card that ENTERS a dead hand is "fresh" and unplayable until the start of its owner's next turn (`s.deadFresh` counter + `toDeadHand()` funnel — sacrifice, deaths, twin/echo/digger/ferry/gamble/steal/Beckon all route through it; `startTurn` settles everything). UI grays fresh cards with an "⏳ settling" badge; scripted + LLM AI skip locked indices. This kills the sacrifice-then-instantly-redeploy tempo line. (User first wanted dead hands purged at veil-break, then reversed: keep the dead hand, add the cooldown instead.)
- **One-dimension-only cards removed** (design law: every card works in both dimensions): **Whispered Claim** (vb_claim — both faces possess enemy DEAD units only; the `possess` fx machinery went with it) and **Resurrection** (single dead-only face used from both hands). Decklist slot: resurrection→mend; balance-sim control deck subs vb_flay/vb_hush. `loadMeta()` now strips removed ids from saved decks/collections (short decks fall back to default).

## Art
- The **Rat token** was the last card with no painted art (SVG fallback) — rendered `rat_living/rat_dead` via the staged ComfyUI pipeline (started ComfyUI portable from I:\dead-era-ai, rendered, shut it back down). Manifest: 370 images. Added a `rat` subject to tools/generate-art.mjs.

## Tests: all green
- `npm test` → **290 rule tests** (new: opening-hand-7, unit sacrifice incl. tokens/enemy/Brann/Martyr, cooldown lock/settle, settled-vs-fresh indexing) + 60-game fuzz clean.
- `npm run test:ui` → **30/30** (mulligan shows 7; fresh dead-hand card verified locked in-browser).
- `node tools/balance-sim.js` runs clean post-changes.

---

# Session Notes — 2026-07-08 (evening) · Hex & Relic, THE TEAR, unit powers

Huge rules/content session on top of the morning's champion/mulligan/animation work.

## THE TEAR — veil-break completely reworked (user design)
Soul 0 now **collapses both battlefields into ONE field** (`state.merged`, `tearVeil()` in js/game.js):
- Loser forfeits everything in the dead: dead field, dead situations, dead hand — devoured.
- Winner's dead legion marches onto the one field **keeping dead faces** (`u.deadFace`), dead situations follow (dead face stays active), dead hand stays playable (post-merge dead plays land on the one field as dead faces, paid with dead energy).
- One field cap = `MERGED_FIELD_CAP` (10). Veilshift/Veilstep flip faces in place post-merge. UI hides the dead half; living section becomes "THE ONE FIELD".

## Set: Hex & Relic (js/sets/hexrelic.js, 34 cards)
Interaction set on a new **unit-status engine** (`u.st` + board badges): Freeze ❄, Blight 🦠, Reaper's Mark 💀, Hollow 🚫, Shackle ⛓, granted Guard/Ranged/Lifesteal/Twin Strike. Envelope-pushers: Inversion Hex (ATK↔HP), Mirror of Bone (clone any unit), Soul Exchange (ownership swap), The Leveller (all units 3/3), Grave Robbery (steal from dead hand), Second Sunrise (mass-ready; AI has a post-attack pass to use it), Winterveil (mass freeze), Croaking Curse (polymorph → Toad token). Counterplay seam: anything that re-makes a unit (shift/polymorph/bounce) washes statuses off.

## Unit powers (user request)
Units with `power:{}` charge ⚡1 per owner turn in play and unleash a spell of their own (`useUnitPower`): Hedge Pyromancer, Bone Chanter, Veil Oracle, Storm Idol, Banner Saint. Click the glowing ⚡ bar on the unit. Frozen/Hollowed units can't channel. Scripted + LLM AI both use them.

## Other user requests shipped
- **Situations**: max 5 per dimension (was 2); plates now lie faded *behind* the units (full-row layer, hover to read).
- **Random decks**: `randomDeck()` deals a curved 40 (22 units 10/8/4, 12 spells, 6 sits, max 2 copies, blood≈cost). The AI brings a fresh one EVERY game (`META.aiDeck` hook for sims/tests). Main menu "Random Deck Match"; builder "Random Deck" button (ownership-aware).
- **AI pacing slowed**: plays ~1050ms, attacks ~950ms between actions (was 320–650) so turns are readable.
- Default deck got a taste of hexes: hx_frost + hx_fangs swapped in.

## Balance (tools/balance-sim.js — now loads hexrelic, uses META.aiDeck; decks: default/blood/control/hex/random)
- Post-merge meta: games ~9.5 rounds, first-move ≈ even. Hex deck 40–45% vs default (fair-ish), random-vs-default ~40–50%.
- Consistent outliers fixed: Corvus Foresight 5→6 (was 65–73%), Maelis Transfuse now grants 3 essence (was 35–38%).
- Fixed a real AI hang found by fuzz: shackled units caused an infinite attack loop (scriptedAttacks now targets units or gives up).

## Tests: all green
- `npm test` → **274 rule tests** (statuses, all new fx kinds, unit powers, merge semantics, randomDeck distribution, MAX_SITS 5) + 60-game fuzz (now mulligans, uses hero AND unit powers, checks merged invariants).
- `npm run test:ui` → **29/29** (adds Random Deck Match flow).
- `#demo` board now seeds frozen/blighted/doomed/shackled units, granted badges and a charged Firebolt for visual work.

## Art
70 new images (34 Hex & Relic cards + Toad token, both faces) generated via ComfyUI staged pipeline → art/ (~370 total in manifest).

## Ideas for next session
- LLM-vs-scripted overnight matches (still deferred).
- More combo lint: an "archetype sim" pass (freeze-tempo deck, status-voltron deck) once played by better heuristics.
- Post-merge UX: maybe a dramatic one-time field-merge animation (rows sliding together).
- Fresh collection: `localStorage.removeItem("deadera-meta")`.

# Session Notes — 2026-07-08 (night) · MULTIPLAYER: play a friend with a link

Ran in parallel with the balance session above — engine untouched, everything is additive.

## What shipped
- **Link-invite multiplayer, deployed**: https://dead-era-production.up.railway.app — menu → "⚔ Play a Friend (link)" → Create Game Link → friend opens `?room=CODE` link → hero select → mulligan → play. No accounts; **random decks only** (both sides get `randomDeck()`); creator goes first.
- **Architecture** (server-authoritative, zero engine changes):
  - `server/server.js` — static hosting + `ws` rooms (5-char codes, 2 seats, rejoin tokens, 30-min GC, ~500 room cap). Builds the engine per room by concatenating cards.js + game.js + sets + `server/mp.js` into a factory (`new Function`), same trick as tests/rules.test.js. Log strings are source-patched so `who()`/`poss()` speak player names instead of You/AI.
  - `server/mp.js` — 2-player orchestration on the side-parametric engine: `mpNewGame` (delegates to `newGame()` with `META.playerDeck = randomDeck`, so balance changes to hand size etc. flow through), per-seat hero select + mulligan, sacrifice prompt per turn (incl. new `sacrificeUnit`), validated actions (turn/target/legality server-side), `mpViewFor(seat)` per-viewer redaction (opponent hand/deadHand/decks → nulls) + perspective swap (viewer is always `state.player`, winner/log classes mirrored).
  - `js/net.js` — client: lobby overlay, WS, and in MP mode window-overrides the ~12 mutating engine functions (`sacrifice`, `playCard`, `castSpell`, `attack`, …) to send actions instead; renders whatever state arrives. FX events (draw/crossOver/damage/playedCard/shatter/attack) are captured server-side and replayed through the existing FX queues, so animations survive — opponent attacks animate on the old board before the new state lands.
  - Rejoin: token in sessionStorage; refresh mid-game lands back in your seat. Opponent online/offline banners. Rematch via Play Again (both must click).
- **Railway**: project `dead-era` (service d4b9e7ee, env production), `railway up` from the repo, domain generated. In-memory rooms, no DB.

## Tests
- `npm run test:mp` — 38 protocol assertions (create/join/full-room/redaction/perspective/turn legality/rejoin).
- `node tests/mp-ui.test.js` — 20 checks: two headless-Edge pages play each other through the real UI (link create/join, hero select, mulligan, sacrifice, turn cycle, refresh-rejoin, zero JS errors). Note: puppeteer mouse-clicks hang on CDP scrollIntoView for the fullscreen overlays over http — the test dispatches DOM clicks instead.
- Existing `npm test` failures tonight are the balance session's WIP (tests lag the 30/20 health change), not multiplayer.

## Known limits / next
- Spectators, >2 players, turn timers: not built. Room list: none (link-only by design).
- `state.mode` targeting UI is client-local; server only knows the sacrifice prompt.
- If game.js log strings around who/poss change shape, server logs a warning and falls back to You/AI texts (games unaffected).
