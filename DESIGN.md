# DEAD ERA — Design Doc & Prototype Plan

A two-dimension card game. Every card lives twice: once in the **Living Dimension**, once in the **Dead Dimension**. Death is not removal — it's redeployment.

## Core fantasy

- Inspired by Shadow Era's sacrifice economy: at the start of each turn (right after your draw) you're **prompted** to sacrifice a card — but here, sacrificed cards don't vanish, they go to your **dead hand**, deployable in the Dead Dimension for free.
- Any unit that dies in the Living Dimension **crosses over**: it transforms into its **dead counterpart** — a creepy version with its own name, art, and stats — directly on the dead battlefield.
- Some cards refuse to stay dead (the Beric Dondarrion archetype): **Undying** units return to the matching hand when killed instead of passing on.
- Winning in the Dead Dimension gives you the **upper hand**, not the game: shatter their Soul and the veil tears — your dead legion starts attacking their Life directly.

## Design law: no dead cards

**Every card must do something in both dimensions.** Units have two full identities (living face / dead counterpart). Spells are dual-faced and flip depending on which hand they sit in. No card is ever a brick because it's on the wrong side.

## Rules v0.2 (what the prototype implements)

### Setup

- Each player: **25 Life** (Living) and **15 Soul** (Dead), a 30-card deck, opening hand of 5.
- Only **Life 0 ends the game**. Soul is the upper-hand track (see The Veil below).

### Resources — Essence (living side only)

- You start at 0 max Essence; it refills at the start of your turn.
- **Turn-start sacrifice prompt** (Shadow Era style): after your draw, you're prompted to sacrifice one card from hand — +1 max Essence, +1 now, card moves to your dead hand — or skip. It's part of the turn flow, not an action you activate.
- **The Dead Dimension has unlimited energy.** Playing anything from your dead hand costs nothing. The cost was paid in blood already. There is no sacrificing on the dead side.

### Zones per player

| Zone         | What it holds                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| Hand         | Drawn cards; play into the Living field at Essence cost                                                |
| Dead hand    | Sacrificed cards; free to play — units enter the Dead field as dead counterparts, spells use dead faces |
| Living field | Units, living stats (max 6)                                                                            |
| Dead field   | Dead counterparts, dead stats (max 6)                                                                  |

### Turn

1. Refill Essence, draw 1.
2. **Sacrifice prompt**: pick a card (or skip). Once per turn.
3. Main phase: play from either hand, attack with ready units in both dimensions, any order.
4. End turn.

### Combat — attacker strikes first

- An attacker picks an enemy unit in the same dimension, or the enemy hero. **The attacker deals its damage first; only if the defender survives does it strike back.** Heroes never retaliate.
- Living attacks on the hero hit **Life**; dead attacks hit **Soul** — until the veil tears.
- Units enter play exhausted (except **Haste**, which works in either dimension) and attack once per turn. Crossing over leaves a unit exhausted.

### Death rules

- Dies in Living → transforms into its dead counterpart on its owner's Dead field (full health again; if the field is full, it fades).
- Dies in Dead → gone forever (ash) — unless it's Undying, which returns to the **dead hand**.
- **Undying** always bounces to the hand of the dimension it died in. Replaying costs Essence on the living side, nothing on the dead side.
- **Resurrection** pulls a unit from your Dead field back to your Living field — the loop closes.

### The Veil — winning the dead war

- When a player's Soul hits 0 it **shatters** (permanently). The veil tears for them: the opponent's dead units now attack their **Life** directly.
- The dead war is a race for a second attack lane, and killing your own units is real strategy — feed the dead board, shatter their Soul, then pour through.

## Mock card set (v0.2)

12 units + 3 dual-faced spells. Decks are fixed copies of the same list.

| Living face       | Dead counterpart | Cost | Living | Dead | Ability (works in both dimensions)                 |
| ----------------- | ---------------- | ---- | ------ | ---- | -------------------------------------------------- |
| Peasant Levy      | Restless Levy    | 1    | 2/1    | 1/1  | —                                                  |
| Grave Rat         | Bone Rat         | 1    | 1/1    | 2/2  | Better off dead                                    |
| Charging Hound    | Barrow Hound     | 2    | 2/1    | 1/1  | Haste, either dimension                            |
| Bone Shambler     | Risen Shambler   | 2    | 1/2    | 3/3  | —                                                  |
| Village Priest    | Heretic Shade    | 2    | 1/3    | 1/1  | On play: +2 Life (living) / +2 Soul (dead)         |
| Corpse Collector  | Grave Servant    | 2    | 2/2    | 2/2  | Martyr: draw a card when sacrificed                |
| Flameblade Knight | Ashen Knight     | 3    | 3/3    | 1/1  | Undying: returns to that dimension's hand on death |
| Plague Bearer     | Hollow Bearer    | 3    | 2/3    | 2/2  | On death: 1 dmg to all enemy units in its dimension |
| Soul Warden       | Warden of Souls  | 3    | 3/4    | 2/3  | —                                                  |
| Wraith Caller     | Wraith Lord      | 4    | 2/4    | 3/3  | On play: 2/2 Spirit into the _other_ dimension     |
| Ember Ghoul       | Cinder Wretch    | 4    | 4/3    | 4/2  | —                                                  |
| Death Knight      | Dread Revenant   | 5    | 4/5    | 5/5  | —                                                  |

| Spell, living face | Dead face     | Cost | Effect                                                                                                     |
| ------------------ | ------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| Smite              | **Soul Rend** | 2    | 3 damage to any living unit / any dead unit                                                                |
| Cull the Weak      | **Enlighten** | 1    | Kill a friendly living unit (it crosses over) / release a friendly dead unit forever. Either way: draw a card. |
| Resurrection       | Resurrection  | 3    | Return a friendly dead unit to the living field (bridges dimensions from either hand)                      |

## AI (v0)

Greedy heuristics, no search:

- **Sacrifice**: prefers the card whose dead stats most exceed its living stats — sacrificing is deployment.
- **Play**: units greedily by cost (dead hand is free, so it floods when it can); Smite/Soul Rend on big cheap-to-kill threats, Resurrection when behind on the living board, Cull on units worth ≥3 more dead, Enlighten to cycle when its dead field is packed.
- **Attack**: free kills first (attacker-strikes-first makes these safe), even trades against bigger threats, otherwise face. Goes all-face on lethal — counting the torn veil.

## Simulation notes (30-game headless smoke run)

- Games end around round 7; a Soul shatters in ~80% of games, so the dead war matters nearly every game — by design.
- No timeouts, no rule violations (field/hand caps, essence, death sweeps).

## Tuning knobs to playtest first

- Soul 15: shatters often — is the veil too easy to tear? Try 18–20.
- Free dead plays are a big tempo engine; if sacrifice-flooding dominates, try dead plays costing cost−2 (min 0) instead.
- Undying on the dead side is a free replayable 1/1 — make dead-side Undying once per game if it turns out degenerate.

## Roadmap

- **v0 (this prototype)** — `index.html`, playable vs AI, fixed decks, full two-dimension loop, SVG art with a living face and a creepy dead face per card.
- **v1** — deckbuilding, mulligan, more veil-bridging abilities (auras from the dead buffing the living, necromancer hero powers), heroes (see Ideas).
- **v2** — real art/frames, a crossing-over animation (the money moment — the card visibly flipping to its creepy face as it falls through), multiplayer.

## Open design questions

- Killing an enemy unit feeds _their_ dead board — removal always has a cost. Consider a premium "Banish" keyword that skips the cross-over.
- Grave-robbing archetype: resurrecting/stealing from the opponent's dead field?
- Should a shattered player get a desperation mechanic (e.g. their dead units fight back through the veil too) so the shatter isn't a pure snowball?

## Ideas

- There should be a black magic hero that can "fuse" two units like frankenstein so all cards in that strat have like 2 arts.
- Beastmaster, can turn a card into an animal which makes it ferocious, meaning that on kill it can attack again. again you have alternative art where the unit is turned into an animal
-
