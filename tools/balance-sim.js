// DEAD ERA — balance sim: scripted AI vs scripted AI self-play.
// Usage: node tools/balance-sim.js [gamesPerMatchup]
// Reports hero win rates (mirror decks) and themed Veilbound deck matchups.
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const load = f => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/"use strict";/, "");
(0, eval)(load("js/cards.js") + "\n" + load("js/game.js") + "\n" + load("js/sets/veilbound.js") + "\n" + load("js/sets/hexrelic.js") + `
;globalThis.__G = { get state(){return state}, DEFS, HEROES, META, FX, newGame, confirmMulligan,
  startTurn, aiTurnScripted, __DECKLIST: DECKLIST };`);
const G = globalThis.__G;
const DEFS = G.DEFS;
const N = Number(process.argv[2]) || 40;

/* mute FX pauses so games run instantly */
G.FX.pause = async () => {};

const baseDeck = [...G.__DECKLIST];
function themedDeck(swaps){ // swaps: [[outId, inId, count], ...]
  const d = [...baseDeck];
  for(const [out, inn, count] of swaps){
    let n = 0;
    for(let i = 0; i < d.length && n < count; i++){
      if(d[i] === out){ d[i] = inn; n++; }
    }
  }
  return d;
}
const DECKS = {
  default: baseDeck,
  blood: themedDeck([["shambler","vb_thrall",2],["warden","vb_bloodknight",2],["ghoul","vb_matriarch",2],["deathknight","vb_bloodgod",1],["grove","vb_fountain",2]]),
  control: themedDeck([["hound","vb_flay",1],["collector","vb_hush",1],["smite","vb_tolling",2],["soultap","vb_veilshift",2]]),
  hex: themedDeck([["shambler","hx_witch",2],["priest","hx_jailer",2],["smite","hx_frost",1],["soultap","hx_blight",2],
                   ["cull","hx_mark",1],["darkpact","hx_fangs",1],["grove","hx_nettles",2],["warbanner","hx_miasma",1],
                   ["wraithcaller","hx_pyro",2],["ghoul","hx_countess",1]]),
  random: null, // resolved per game
};

async function playGame(pDeck, aDeck, pHero, aHero){
  G.META.playerDeck = () => pDeck || randomDeck();
  G.META.aiDeck = () => aDeck || randomDeck();
  G.newGame(pHero);
  G.state.ai.hero = aHero;
  // both sides mulligan away 5+ costs (mirrors aiMulligan)
  G.confirmMulligan(G.state.player.hand.map((id,i) => DEFS[id].cost >= 5 ? i : -1).filter(i => i >= 0));
  let rounds = 0;
  while(!G.state.winner && rounds < 80){
    G.state.mode = null;
    await G.aiTurnScripted("player");          // the "player" side is scripted too
    if(G.state.winner) break;
    G.state.turn = "ai"; G.startTurn("ai");
    await G.aiTurnScripted("ai");
    if(G.state.winner) break;
    G.state.round++;
    G.state.turn = "player"; G.startTurn("player");
    rounds++;
  }
  return {winner: G.state.winner || "TIMEOUT", rounds};
}

(async () => {
  const heroes = Object.keys(G.HEROES);
  console.log(`== hero balance (mirror default decks, ${N} games each vs random foes) ==`);
  for(const h of heroes){
    let w = 0, r = 0;
    for(let g = 0; g < N; g++){
      const foe = heroes[Math.floor(Math.random()*heroes.length)];
      const res = await playGame(DECKS.default, DECKS.default, h, foe);
      if(res.winner === "VICTORY") w++;
      r += res.rounds;
    }
    console.log(`  ${h.padEnd(8)} win ${(100*w/N).toFixed(0).padStart(3)}%  avg rounds ${(r/N).toFixed(1)}`);
  }
  console.log(`\n== themed decks vs default (random heroes, ${N} games each, first-move side alternates) ==`);
  for(const [name, deck] of Object.entries(DECKS)){
    if(name === "default") continue;
    let w = 0, t = 0, r = 0;
    for(let g = 0; g < N; g++){
      const h1 = heroes[Math.floor(Math.random()*heroes.length)];
      const h2 = heroes[Math.floor(Math.random()*heroes.length)];
      const flip = g % 2 === 1; // alternate who goes first
      const res = flip ? await playGame(DECKS.default, deck, h1, h2) : await playGame(deck, DECKS.default, h1, h2);
      const themedWon = flip ? res.winner === "DEFEAT" : res.winner === "VICTORY";
      if(res.winner === "TIMEOUT") t++;
      else if(themedWon) w++;
      r += res.rounds;
    }
    console.log(`  ${name.padEnd(8)} win ${(100*w/N).toFixed(0).padStart(3)}%  timeouts ${t}  avg rounds ${(r/N).toFixed(1)}`);
  }
  console.log(`\n== first-move advantage (default mirror, ${N*2} games) ==`);
  let first = 0;
  for(let g = 0; g < N*2; g++){
    const h1 = heroes[Math.floor(Math.random()*heroes.length)];
    const h2 = heroes[Math.floor(Math.random()*heroes.length)];
    const res = await playGame(DECKS.default, DECKS.default, h1, h2);
    if(res.winner === "VICTORY") first++; // "player" side always moves first
  }
  console.log(`  first mover wins ${(100*first/(N*2)).toFixed(0)}%`);
})().catch(e => { console.error("SIM FAIL:", e); process.exit(1); });
