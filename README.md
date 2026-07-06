# Dead Era

A two-dimension card game prototype: every card lives twice. Units that die in the Living Dimension cross over and keep fighting in the Dead Dimension. Sacrifice cards for resources (Shadow Era-style) — they go to your **dead hand**, deployable among the dead. Win by emptying either the enemy's **Life** or their **Soul**.

## Play

Open [index.html](index.html) in any browser. No install, no build — everything is one file. You play against a simple AI.

**How to play a turn:**
1. Each turn opens with a **sacrifice prompt**: click a hand card to sacrifice it (+1 max Essence, it joins your dead hand) or press **Skip sacrifice**.
2. Click cards to play them — living hand costs Essence; the **dead hand is free** (unlimited energy among the dead). Spells ask for a target; click the spell again or press Esc to cancel. Spells flip to their dead face in the dead hand (Smite → Soul Rend, Cull the Weak → Enlighten).
3. Click one of your ready (highlighted) units, then an enemy unit in the same dimension or the enemy hero chip. The attacker strikes first — if the defender dies, it doesn't hit back.
4. **End Turn.**

Units that die in the living world transform into their creepy dead counterparts on the dead battlefield. Shatter the enemy's **Soul** and the veil tears — your dead units then attack their **Life** directly. Only Life 0 ends the game.

Full rules, card list, AI notes, and the roadmap live in [DESIGN.md](DESIGN.md).
