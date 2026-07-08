# Dead Era

A two-dimension card game prototype: every card lives twice. Units that die in the Living Dimension cross over and keep fighting in the Dead Dimension — transformed into their creepy dead counterparts. Sacrifice cards for resources (Shadow Era-style turn-start prompt) — they go to your **dead hand**, free to deploy among the dead. Shatter the enemy's **Soul** and the veil tears: **the dimensions collapse into ONE battlefield** — the loser forfeits everything in the dead (field, omens, dead hand), while your dead legion marches onto the one field wearing its dead faces and keeps fighting. Only Life 0 ends the game.

## Play

Open [index.html](index.html) in any browser (no install, no build). For the **LLM opponent** run `tools/serve.ps1` and play at `http://localhost:8123` instead (browsers only let the page talk to Ollama from a localhost origin).

## Multiplayer — play a friend with a link

Live at **https://dead-era-production.up.railway.app** — main menu → **⚔ Play a Friend (link)** → Create Game Link → send the link (`…?room=CODE`) to a friend. The moment they open it, the game starts: both pick champions, mulligan, and play. No accounts, no login — the link is the invite. Multiplayer is **random decks only** (both players get a fresh, well-curved random 40).

- **Server-authoritative**: [server/server.js](server/server.js) serves the game and runs the untouched rules engine once per room ([server/mp.js](server/mp.js) drives it for two humans). Clients send actions over a WebSocket and render the state the server returns — redacted (you never receive your opponent's hand, dead hand, or any deck order) and perspective-swapped (`state.player` is always *you*), so the whole existing UI works unchanged. [js/net.js](js/net.js) swaps the engine's mutating functions for network sends and replays the server's FX events (draws, cross-overs, damage floats, attack animations, banners).
- **Reconnect-safe**: refresh mid-game and you land back in your seat (rejoin token in sessionStorage). Rooms live in memory — no database — and expire ~30 min after both players leave.
- **Run it yourself**: `npm install && npm start` → `http://localhost:8123`. Deployed on Railway (`railway up`).
- Tests: `npm run test:mp` (protocol: create/join/redaction/turns/rejoin), `node tests/mp-ui.test.js` (two headless-Edge browsers play each other through the real UI).

**Getting started:** pick a **champion** — each of the 8 has a passive, a **channeled power** and a dead face — then **mulligan** your opening hand (exchange any of your 5 cards, once). Win games to earn **card packs** (header → Packs; some pulls are holographic **foils**), and build your own deck in **Collection**.

**Champions & Channel:** your hero banks **⚡1 Channel every turn** (cap 9). Their power spends it — use it on cooldown, or bank for a double-cast turn (e.g. two Reaps). The ⚡ button in the controls glows when it's ready; Sylvara's Veilstep asks for a target unit.

**A turn:**

1. Every turn opens with a **sacrifice prompt** — click a hand card (+1 max Essence, it joins your dead hand) or **Skip Sacrifice**. (Corvus turns skipped sacrifices into extra Channel.)
2. Play cards: the living hand spends **Essence**; the dead hand spends **Dead Energy**, which is created by your living spending — every Essence spent on living plays crosses the veil as 1 Dead Energy that turn (resets each turn, so play living first). Spells and situations flip to their dead face in the dead hand (Smite → Soul Rend, Cull the Weak → Enlighten, Tome of Knowledge → Tome of the Damned).
3. **Situations** are persistent passives laid flat on the battlefield *behind* your units (max 5 per side per dimension) — hover a plate to read it.
4. Attack: click a ready (glowing) unit, then an enemy unit in the same dimension or the enemy hero plaque. Attacker strikes first — if the defender dies, it doesn't hit back.
5. Watch for **status badges** on units (❄ frozen, 🦠 blight, 💀 doomed, ⛓ shackled, 🚫 hollowed, 🩸 lifesteal, 🏹 ranged, ⚔² twin strike) and **⚡ unit powers** — some units charge energy each turn they stay in play and carry a spell of their own (click the glowing ⚡ bar to unleash).
6. **End Turn.**

**Random Deck Match** (main menu): you and the AI each get a fresh, well-curved random 40-card deck. The AI *always* brings a random deck to every game; the Collection screen also has a Random Deck button for your own draft.

Hover any card or unit for a full-size preview including its other face.

## AI opponents

Toggle with the **AI:** button (top right).

- **Scripted** (default) — fast greedy heuristics.
- **LLM (Ollama)** — a local model plays for real: each step it receives the rules, the full game state, recent history, and an enumerated list of legal actions, and picks one. Requires [Ollama](https://ollama.com) running with the configured model (default `qwen2.5:14b`) and the game served from localhost (`tools/serve.ps1`). Falls back to scripted play automatically if unreachable. Model/settings: `AI_CFG` in [js/game.js](js/game.js).

## Card art generation (living + dead face per card)

Every card has two AI-art slots: `<cardId>_living.png` and `<cardId>_dead.png` in `art/`. Until images exist, hand-drawn SVG placeholders are used. Pipeline (local, free):

1. **ComfyUI** (installed at `I:\dead-era-ai\ComfyUI_windows_portable` with DreamShaperXL Turbo): start it with `tools/start-comfyui.ps1`, wait for `http://127.0.0.1:8188`.
2. Run `node tools/generate-art.mjs --no-llm --staged` — it renders both faces for every card and champion (~260 images total across the base game + Veilbound). `--staged` renders outside the repo and publishes in one burst at the end (no live-server reload storm); `--no-llm` skips Ollama prompt enrichment (much faster — Ollama and SDXL fight over VRAM); `--force` regenerates; `--only <cardId>` for one card. Re-running only renders what's missing. Expansion sets carry their own prompts (`art:{l,d}` per card).
3. Refresh the game — `art/manifest.js` makes it pick up the PNGs automatically.

Note: Ollama generates *text* (it enriches the art prompts and powers the LLM opponent); ComfyUI + Stable Diffusion generates the *images*.

## Project layout

| Path | What |
| --- | --- |
| `index.html` | shell page (works over `file://`) |
| `css/style.css` | table + card design system, all animations |
| `js/cards.js` | card definitions, deck list, dual-face helpers |
| `js/game.js` | rules engine (DOM-free), scripted AI, LLM opponent |
| `js/ui.js` | rendering, input, animation system (FX layer) |
| `js/art.js` | SVG placeholder art + PNG manifest loader |
| `tools/` | art generator, ComfyUI launcher, localhost server |

## Tests

- `npm test` — 274 deterministic rule tests covering every mechanic, then a 60-game fuzz with invariants checked after every action.
- `npm install` once, then `npm run test:ui` — drives the real game in headless Edge (menu → hero select → mulligan → a full turn vs the AI, incl. a hero power → packs → deck builder → random deck match), asserting zero JS errors.
- `node tools/balance-sim.js [n]` — scripted-vs-scripted self-play: hero win-rate matrix, themed Veilbound decks vs default, first-move advantage.

Full rules and roadmap: [DESIGN.md](DESIGN.md). Open `index.html#demo` for a seeded mid-game board (useful for design work).
