# Dead Era

A two-dimension card game prototype: every card lives twice. Units that die in the Living Dimension cross over and keep fighting in the Dead Dimension — transformed into their creepy dead counterparts. Sacrifice cards for resources (Shadow Era-style turn-start prompt) — they go to your **dead hand**, free to deploy among the dead. Shatter the enemy's **Soul** and the veil tears: your dead legion attacks their **Life** directly. Only Life 0 ends the game.

## Play

Open [index.html](index.html) in any browser (no install, no build). For the **LLM opponent** run `tools/serve.ps1` and play at `http://localhost:8123` instead (browsers only let the page talk to Ollama from a localhost origin).

**Getting started:** pick a **champion** (each has a passive and a dead face), then play. Win games to earn **card packs** (header → Packs; some pulls are holographic **foils**), and build your own 30-card deck in **Collection**.

**A turn:**

1. Every turn opens with a **sacrifice prompt** — click a hand card (+1 max Essence, it joins your dead hand) or **Skip Sacrifice**.
2. Play cards: the living hand spends **Essence**; the dead hand spends **Dead Energy**, which is created by your living spending — every Essence spent on living plays crosses the veil as 1 Dead Energy that turn (resets each turn, so play living first). Spells and situations flip to their dead face in the dead hand (Smite → Soul Rend, Cull the Weak → Enlighten, Tome of Knowledge → Tome of the Damned).
3. **Situations** are persistent passives over one dimension (max 2 per side per dimension) — hover the small gold chips by the hero plaques.
4. Attack: click a ready (glowing) unit, then an enemy unit in the same dimension or the enemy hero plaque. Attacker strikes first — if the defender dies, it doesn't hit back.
5. **End Turn.**

Hover any card or unit for a full-size preview including its other face.

## AI opponents

Toggle with the **AI:** button (top right).

- **Scripted** (default) — fast greedy heuristics.
- **LLM (Ollama)** — a local model plays for real: each step it receives the rules, the full game state, recent history, and an enumerated list of legal actions, and picks one. Requires [Ollama](https://ollama.com) running with the configured model (default `qwen2.5:14b`) and the game served from localhost (`tools/serve.ps1`). Falls back to scripted play automatically if unreachable. Model/settings: `AI_CFG` in [js/game.js](js/game.js).

## Card art generation (living + dead face per card)

Every card has two AI-art slots: `<cardId>_living.png` and `<cardId>_dead.png` in `art/`. Until images exist, hand-drawn SVG placeholders are used. Pipeline (local, free):

1. **ComfyUI** (installed at `I:\dead-era-ai\ComfyUI_windows_portable` with DreamShaperXL Turbo): start it with `tools/start-comfyui.ps1`, wait for `http://127.0.0.1:8188`.
2. Run `node tools/generate-art.mjs` — it renders both faces for all 27 cards and 4 champions (~62 images, ~25s each incl. prompt enrichment). Prompts are optionally enriched by your local Ollama model first (`--no-llm` to skip; `--force` to regenerate; `--only <cardId>` for one card). Re-running only renders what's missing.
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

- `npm test` — 111 deterministic rule tests covering every mechanic, then a 60-game fuzz with invariants checked after every action.
- `npm install` once, then `npm run test:ui` — drives the real game in headless Edge (menu → hero select → a full turn vs the AI → packs → deck builder), asserting zero JS errors.

Full rules and roadmap: [DESIGN.md](DESIGN.md). Open `index.html#demo` for a seeded mid-game board (useful for design work).
