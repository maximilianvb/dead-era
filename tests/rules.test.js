// DEAD ERA — deterministic rule tests + fuzz. Headless (cards.js + game.js only).
// Run with: npm test   (or: node tests/rules.test.js)
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const load = f => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/"use strict";/, "");
(0, eval)(load("js/cards.js") + "\n" + load("js/game.js") + "\n" + load("js/sets/veilbound.js") + "\n" + load("js/sets/hexrelic.js") + `
;globalThis.__G = { get state(){return state}, DEFS, HEROES, META, ESS_CAP, CHANNEL_CAP, MAX_SITS,
  newGame, chooseHero, sacrifice, sacrificeUnit, playCard, playUnit, playSituation, castSpell, validTargets,
  attack, sweepDeaths, startTurn, aiTurn, makeUnit, findUnit, llmLegalActions, guardsOf, __DECKLIST: DECKLIST,
  usePower, canUsePower, powerTargets, forgoSacrifice, doMulligan, confirmMulligan, bloodCostOf,
  useUnitPower, canUseUnitPower, randomDeck, stOf, unitGuard,
  mk(id, dim){ return makeUnit(id, dim); } };`);
const G = globalThis.__G;
const DEFS = G.DEFS, DECKLIST_REF = null;

let passed = 0, failed = 0;
function ok(cond, name){
  if(cond){ passed++; }
  else { failed++; console.error("  FAIL:", name); }
}
function eq(a, b, name){ ok(a === b, name + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

/* fresh controlled game: empty fields/hands, chosen heroes, generous pools */
function fresh(pHero = "alder", aiHero = "alder"){
  G.newGame(pHero);
  const st = G.state;
  st.phase = "play"; // skip the mulligan for controlled setups
  st.ai.hero = aiHero;
  for(const k of ["player","ai"]){
    const s = st[k];
    s.hand = []; s.deadHand = []; s.deadFresh = 0; s.living = []; s.dead = [];
    s.sits = {living:[], dead:[]};
    s.essence = 10; s.maxEss = 5; s.deadEss = 5;
    s.sacrificed = true;
  }
  st.mode = null;
  return st;
}
function put(k, id, dim, ready = true){
  const u = G.mk(id, dim);
  u.exhausted = !ready;
  G.state[k][dim].push(u);
  return u;
}

/* ---------- combat ---------- */
{
  const st = fresh();
  const a = put("player", "ghoul", "living");        // 4/3
  const d = put("ai", "peasant", "living", false);   // 2/1 — dies to first strike
  G.attack(a.uid, d.uid);
  ok(!st.ai.living.some(u => u.uid === d.uid), "attacker kills defender");
  eq(a.hp, 3, "attacker takes no retaliation when defender dies");
  eq(st.ai.dead.length, 0, "death is not an auto-play into the dead field");
  eq(st.ai.deadHand[0], "peasant", "dead card joins its owner's dead hand");
}
{
  const st = fresh();
  const a = put("player", "hound", "living");        // 2/1
  const d = put("ai", "warden", "living", false);    // 3/4 — survives
  G.attack(a.uid, d.uid);
  eq(d.hp, 2, "defender takes attacker damage");
  ok(!st.player.living.some(u => u.uid === a.uid), "attacker died to retaliation");
}
{
  const st = fresh();
  const a = put("player", "ghoul", "dead");          // dead face 4/2
  G.attack(a.uid, null);
  eq(st.ai.soul, 20 - 4, "dead hero attack drains Soul");
  const b = put("player", "shambler", "living");
  G.attack(b.uid, null);
  eq(st.ai.life, 30 - 1, "living hero attack hits Life");
}
{ // Vex passive & torn veil
  const st = fresh("vex");
  const a = put("player", "spirit", "dead");         // 2/2
  G.attack(a.uid, null);
  eq(st.ai.soul, 20 - 3, "Vex adds +1 to direct Soul strikes");
  st.ai.soul = 1; st.ai.soulBroken = false;
  const b = put("player", "gravrat", "dead");        // 2/2 dead
  G.attack(b.uid, null);                             // 2+1 = 3 → shatter
  ok(st.ai.soulBroken, "soul shatters at 0");
  eq(st.ai.soul, 0, "soul clamps at 0");
  const c = put("player", "shambler", "dead");       // 3/3
  const lifeBefore = st.ai.life;
  G.attack(c.uid, null);
  eq(st.ai.life, lifeBefore - 3, "after shatter, dead units hit Life (no Vex bonus)");
  ok(!st.winner, "soul break does not end the game");
}
{ // Tome of the Damned aura
  const st = fresh();
  st.player.sits.dead.push({uid:9001, cardId:"tome", dim:"dead"});
  const a = put("player", "spirit", "dead"); // 2/2 + 1 aura
  G.attack(a.uid, null);
  eq(st.ai.soul, 20 - 3, "dead tome grants +1 ATK to dead units");
}

/* ---------- guard ---------- */
{
  const st = fresh();
  const g = put("ai", "pallbearer", "living", false); // guard 1/4
  const o = put("ai", "peasant", "living", false);
  const a = put("player", "ghoul", "living");         // 4/3
  G.attack(a.uid, null);
  eq(st.ai.life, 30, "guard blocks hero attack");
  ok(!a.exhausted, "blocked attack does not exhaust");
  G.attack(a.uid, o.uid);
  eq(o.hp, DEFS.peasant.l[1], "guard blocks attacks on non-guards");
  G.attack(a.uid, g.uid);
  ok(!st.ai.living.some(u => u.uid === g.uid), "guard itself can be attacked and killed");
  const b = put("player", "hound", "living");
  G.attack(b.uid, o.uid);
  ok(o.hp < DEFS.peasant.l[1], "after guard dies, other units attackable");
}

/* ---------- spells & faces ---------- */
{ // smite / soul rend
  const st = fresh();
  const t1 = put("ai", "warden", "living", false);   // 3/4
  st.player.hand = ["smite"];
  G.castSpell("player", false, 0, {uid:t1.uid});
  eq(t1.hp, 1, "Smite deals 3 to a living unit");
  const t2 = put("ai", "deathknight", "dead", false); // 5/5
  st.player.deadHand = ["smite"];
  G.castSpell("player", true, 0, {uid:t2.uid});
  eq(t2.hp, 2, "Soul Rend (dead face) deals 3 to a dead unit");
  // living Smite (cost 2) crossed 2 energy over first: 5 + 2 - 2 = 5
  eq(st.player.deadEss, 5, "dead-face cast paid with dead energy (after living cast crossed 2 over)");
}
{ // cull / enlighten
  const st = fresh();
  const mine = put("player", "shambler", "living", false);
  st.player.hand = ["cull"]; st.player.deck = ["peasant","peasant"];
  G.castSpell("player", false, 0, {uid:mine.uid});
  eq(st.player.dead.length, 0, "Cull victim does not auto-enter the dead field");
  eq(st.player.deadHand[0], "shambler", "Cull victim joins the dead hand");
  eq(st.player.hand.length, 1, "Cull draws a card");
  const deadUnit = put("player", "shambler", "dead", false);
  st.player.deadHand = ["cull"]; st.player.deadFresh = 0; // settled — playable
  G.castSpell("player", true, 0, {uid:deadUnit.uid});
  eq(st.player.dead.length, 0, "Enlighten releases the dead unit forever");
  eq(st.player.hand.length, 2, "Enlighten draws a card");
}
{ // banish skips everything
  const st = fresh();
  const pb = put("ai", "plague", "living", false);   // on-death burst unit
  const bystander = put("player", "peasant", "living", false);
  st.player.hand = ["banish"]; st.ai.deadHand = [];
  G.castSpell("player", false, 0, {uid:pb.uid});
  eq(st.ai.dead.length, 0, "Banish: no cross-over");
  eq(st.ai.deadHand.length, 0, "Banish: not even to the dead hand");
  eq(bystander.hp, DEFS.peasant.l[1], "Banish: no on-death burst triggered");
  const und = put("ai", "flameblade", "dead", false);
  st.player.deadHand = ["banish"]; st.ai.deadHand = [];
  G.castSpell("player", true, 0, {uid:und.uid});
  eq(st.ai.deadHand.length, 0, "Void Rend: Undying does not return");
}
{ // soul tap faces
  const st = fresh();
  st.player.hand = ["soultap"];
  G.castSpell("player", false, 0, null);
  eq(st.ai.soul, 18, "Soul Tap drains 2 Soul");
  st.player.deadHand = ["soultap"];
  G.castSpell("player", true, 0, null);
  eq(st.ai.life, 28, "Life Tap (dead face) drains 2 Life");
}
{ // requiem/dirge hits both sides in one dimension only
  const st = fresh();
  put("player", "warden", "living", false);          // 3/4
  put("ai", "warden", "living", false);
  const deadSafe = put("ai", "deathknight", "dead", false);
  st.player.hand = ["requiem"];
  G.castSpell("player", false, 0, null);
  eq(st.player.living[0].hp, 2, "Requiem hits own living units");
  eq(st.ai.living[0].hp, 2, "Requiem hits enemy living units");
  eq(deadSafe.hp, 5, "Requiem does not touch the dead dimension");
}
/* ---------- abilities on play/death ---------- */
{ // priest, wraithcaller, haste, digger, ferry, rats
  const st = fresh();
  st.player.life = 20; st.player.hand = ["priest"];
  G.playCard("player", 0, false);
  eq(st.player.life, 22, "Priest heals 2 Life on living play");
  st.player.soul = 10; st.player.deadHand = ["priest"];
  G.playCard("player", 0, true);
  eq(st.player.soul, 12, "Heretic Shade mends 2 Soul on dead play");
  st.player.hand = ["wraithcaller"];
  G.playCard("player", 0, false);
  ok(st.player.dead.some(u => u.cardId === "spirit"), "Wraith Caller sends Spirit to the OTHER dimension");
  st.player.hand = ["hound"];
  G.playCard("player", 0, false);
  ok(!st.player.living.find(u => u.cardId === "hound").exhausted, "Haste enters ready (living)");
  st.player.deadHand = ["hound"];
  G.playCard("player", 0, true);
  ok(!st.player.dead.find(u => u.cardId === "hound").exhausted, "Haste enters ready (dead)");
  st.player.deck = ["deathknight"]; st.player.hand = ["gravedigger"]; st.player.deadHand = [];
  G.playCard("player", 0, false);
  eq(st.player.deadHand[0], "deathknight", "Gravedigger mills top card to dead hand");
  st.player.essence = 10; st.player.deadHand = [];
  st.player.deck = ["smite","peasant"]; st.player.hand = ["ferryman"];
  G.playCard("player", 0, false);
  eq(st.player.hand.length, 1, "Ferryman draws a card");
  eq(st.player.deadHand.length, 1, "Ferryman also ferries the (new) top card to dead hand");
  st.player.essence = 10; st.player.hand = ["ratcatcher"]; st.player.living = [];
  G.playCard("player", 0, false);
  ok(st.player.living.some(u => u.cardId === "rat"), "Ratcatcher summons a Rat in the same dimension");
  st.player.essence = 10; st.player.hand = ["ratcatcher"];
  st.player.living = Array.from({length:5}, () => G.mk("peasant","living"));
  G.playCard("player", 0, false);
  ok(!st.player.living.some(u => u.cardId === "rat"), "Ratcatcher's Rat is lost when the field fills up");
}
{ // undying both dimensions, plague both dimensions
  const st = fresh();
  const fk = put("player", "flameblade", "living", false);
  fk.hp = 0; G.sweepDeaths();
  eq(st.player.hand[0], "flameblade", "Undying returns to living hand");
  eq(st.player.dead.length, 0, "Undying does not cross over");
  const ak = put("player", "flameblade", "dead", false);
  ak.hp = 0; G.sweepDeaths();
  eq(st.player.deadHand[0], "flameblade", "dead-side Undying returns to dead hand");
  st.player.hand = []; st.player.deadHand = [];
  const pb = put("ai", "plague", "living", false);
  const v1 = put("player", "peasant", "living", false); // 2/1 — dies to burst
  pb.hp = 0; G.sweepDeaths();
  ok(!st.player.living.some(u => u.uid === v1.uid), "Plague burst cascades a kill");
  ok(st.player.deadHand.includes("peasant"), "cascade victim's card joins the dead hand");
}
{ // morwen, alder, brann
  const st = fresh("morwen");
  st.player.deadHand = ["peasant"]; st.player.deadEss = 3;
  G.playCard("player", 0, true);
  eq(st.player.dead[0].hp, DEFS.peasant.d[1] + 1, "Morwen: +1 HP entering the dead field");
  const st2 = fresh("alder");
  st2.player.life = 20;
  G.startTurn("player");
  eq(st2.player.life, 21, "Alder restores 1 Life at turn start");
  const st3 = fresh("brann");
  st3.player.sacrificed = false; st3.player.hand = ["peasant"];
  G.sacrifice("player", 0);
  eq(st3.ai.soul, 19, "Brann's sacrifice burns 1 enemy Soul");
}

/* ---------- champions: channel, powers, new passives, mulligan ---------- */
{ // every hero is complete
  const heroIds = Object.keys(G.HEROES);
  eq(heroIds.length, 8, "eight champions");
  const bad = heroIds.filter(id => {
    const h = G.HEROES[id];
    return !(h.name && h.title && h.passive && h.power && h.power.name && h.power.cost >= 2 && h.power.text);
  });
  ok(bad.length === 0, "every hero has a passive and a channeled power"+(bad.length ? " -> "+bad.join(",") : ""));
}
{ // channel accrues each turn and caps
  const st = fresh();
  const p = st.player;
  p.channel = 0;
  G.startTurn("player");
  eq(p.channel, 1, "hero channels 1 Energy at turn start");
  p.channel = G.CHANNEL_CAP;
  G.startTurn("player");
  eq(p.channel, G.CHANNEL_CAP, "channel caps at "+G.CHANNEL_CAP);
}
{ // alder power: heal with soul overflow
  const st = fresh("alder");
  const p = st.player;
  p.channel = 3; p.life = 29; p.soul = 10;
  ok(G.usePower("player"), "Dawn's Aegis fires at 3 channel");
  eq(p.channel, 0, "power spends channel");
  eq(p.life, 30, "Aegis heals to full");
  eq(p.soul, 12, "excess healing overflows into Soul");
  eq(G.usePower("player"), false, "no channel, no power");
}
{ // vex, morwen, corvus, brann, oswin, maelis powers
  const st = fresh("vex");
  st.player.channel = 6;
  G.usePower("player");
  eq(st.ai.soul, 17, "Reap drains 3 Soul");
  G.usePower("player");
  eq(st.ai.soul, 14, "banked channel allows a double Reap in one turn");
  const st2 = fresh("morwen");
  st2.player.channel = 3; st2.player.deck = ["deathknight"]; st2.player.deadEss = 0;
  G.usePower("player");
  eq(st2.player.deadHand[0], "deathknight", "Beckon mills the top card to the dead hand");
  eq(st2.player.deadEss, 1, "Beckon grants 1 dead energy");
  const st3 = fresh("corvus");
  st3.player.channel = 6; st3.player.deck = ["peasant","peasant"]; st3.player.hand = [];
  G.usePower("player");
  eq(st3.player.hand.length, 2, "Foresight draws 2");
  const st4 = fresh("brann");
  st4.player.channel = 6;
  put("ai", "peasant", "living", false);  // 2/1 dies
  put("ai", "gravrat", "dead", false);    // 2/2 survives at 1
  const mine = put("player", "peasant", "living", false);
  G.usePower("player");
  eq(st4.ai.living.length, 0, "Cinderstorm kills the 1-HP enemy living unit");
  eq(st4.ai.dead[0].hp, 1, "Cinderstorm chips enemy dead units");
  eq(mine.hp, DEFS.peasant.l[1], "Cinderstorm spares your own units");
  const st5 = fresh("oswin");
  st5.player.channel = 4;
  const myDead = put("player", "shambler", "dead", false);   // 3/3
  const foeDead = put("ai", "gravrat", "dead", false);       // 2/2
  G.usePower("player");
  eq(myDead.hp, 2, "Final Toll hits your own dead units too");
  eq(foeDead.hp, 1, "Final Toll hits enemy dead units");
  const st6 = fresh("maelis");
  st6.player.channel = 3; st6.player.life = 20; st6.player.essence = 0;
  G.usePower("player");
  eq(st6.player.life, 18, "Transfuse pays 2 Life");
  eq(st6.player.essence, 3, "Transfuse grants 3 Essence");
}
{ // sylvara: veilstep power + dead-energy passive
  const st = fresh("sylvara");
  const p = st.player;
  const u = put("player", "shambler", "living", false); // dead face 3/3
  p.channel = 3;
  ok(G.powerTargets("player").some(x => x.uid === u.uid), "Veilstep offers the living unit");
  ok(G.usePower("player", {uid:u.uid}), "Veilstep fires on a friendly unit");
  ok(!p.living.length, "Veilstep removes the living face");
  eq(p.dead[0].hp, DEFS.shambler.d[1], "Veilstep deploys the dead face");
  p.channel = 3;
  const enemy = put("ai", "peasant", "living", false);
  eq(G.usePower("player", {uid:enemy.uid}), false, "Veilstep refuses enemy units");
  eq(p.channel, 3, "refused power refunds nothing because nothing was spent");
  G.startTurn("player");
  eq(p.deadEss, 1, "Sylvara's passive grants 1 dead energy at turn start");
}
{ // corvus passive: forgone sacrifice charges the channel
  const st = fresh("corvus");
  const p = st.player;
  p.sacrificed = false; p.channel = 2; p.hand = ["smite"];
  G.forgoSacrifice("player");
  eq(p.channel, 3, "Corvus channels +1 when the sacrifice is forgone");
  p.sacrificed = false; p.channel = G.CHANNEL_CAP;
  G.forgoSacrifice("player");
  eq(p.channel, G.CHANNEL_CAP, "Corvus's bonus respects the channel cap");
  const st2 = fresh("alder");
  st2.player.sacrificed = false; st2.player.channel = 2; st2.player.hand = ["smite"];
  G.forgoSacrifice("player");
  eq(st2.player.channel, 2, "other heroes gain nothing for skipping");
}
{ // maelis passive: blood discount
  const st = fresh("maelis");
  const p = st.player;
  eq(G.bloodCostOf(p, DEFS.vb_thrall), DEFS.vb_thrall.blood - 1, "Maelis pays 1 less blood");
  p.hand = ["vb_thrall"]; p.essence = 0; p.life = 20;
  G.playCard("player", 0, false);
  eq(p.life, 20 - (DEFS.vb_thrall.blood - 1), "discounted Bloodprice deducted");
  const st2 = fresh();
  eq(G.bloodCostOf(st2.player, DEFS.vb_thrall), DEFS.vb_thrall.blood, "other heroes pay full blood");
}
{ // oswin passive: enemy units enter his dead dimension weakened
  const st = fresh("alder", "oswin");
  st.player.deadHand = ["gravrat"]; st.player.deadEss = 3;
  G.playCard("player", 0, true);
  eq(st.player.dead[0].hp, DEFS.gravrat.d[1] - 1, "Oswin: enemy units enter the dead field with -1 HP");
  const st2 = fresh("morwen", "oswin");
  st2.player.deadHand = ["gravrat"]; st2.player.deadEss = 3;
  G.playCard("player", 0, true);
  eq(st2.player.dead[0].hp, DEFS.gravrat.d[1], "Morwen's +1 cancels Oswin's -1");
}
{ // mulligan
  G.newGame("alder");
  const st = G.state;
  eq(st.phase, "mulligan", "game opens in the mulligan phase");
  const p = st.player;
  const total = p.deck.length + p.hand.length;
  const before = [...p.hand];
  G.doMulligan("player", [0, 2]);
  eq(p.hand.length, 7, "mulligan keeps the hand at 7");
  eq(p.deck.length + p.hand.length, total, "mulligan conserves cards");
  ok(p.deck.includes(before[0]) || p.hand.filter(c => c === before[0]).length >= before.filter(c => c === before[0]).length - 1,
    "tossed card was shuffled back");
  G.confirmMulligan([]);
  eq(st.phase, "play", "confirming the mulligan starts the game");
  const handAfter = [...p.hand];
  G.confirmMulligan([0]); // must be a no-op now
  ok(p.hand.length === handAfter.length && p.hand.every((c,i) => c === handAfter[i]), "second mulligan is impossible");
}

{ // opening hand
  G.newGame("alder");
  eq(G.state.player.hand.length, 7, "opening hand is 7 cards");
  eq(G.state.ai.hand.length, 7, "AI opening hand is 7 cards");
}

/* ---------- sacrifice economy ---------- */
{
  const st = fresh();
  const p = st.player;
  p.sacrificed = false; p.maxEss = 3; p.essence = 3; p.deadEss = 7;
  p.hand = ["collector"]; p.deck = ["peasant"];
  G.sacrifice("player", 0);
  eq(p.maxEss, 4, "sacrifice: +1 max essence");
  eq(p.essence, 4, "sacrifice: +1 essence now");
  eq(p.deadEss, 7, "sacrifice does not touch dead energy");
  eq(p.deadHand[0], "collector", "sacrificed card in dead hand");
  eq(p.hand.length, 1, "Martyr drew a card");
  G.startTurn("player");
  eq(p.deadEss, 0, "dead energy resets to 0 at turn start");
  p.hand = ["warden"]; p.essence = 5;
  G.playCard("player", 0, false); // cost 3 living
  eq(p.essence, 2, "living play spends essence");
  eq(p.deadEss, 3, "essence spent on living plays crosses over as dead energy");
  p.sacrificed = false; p.maxEss = 10; p.hand = ["peasant"];
  G.sacrifice("player", 0);
  eq(p.maxEss, 10, "max essence capped at 10");
}
{ // pools are separate
  const st = fresh();
  const p = st.player;
  p.essence = 0; p.deadEss = 5; p.hand = ["peasant"]; p.deadHand = ["peasant"];
  eq(G.playCard("player", 0, false), false, "cannot pay living cost with dead energy");
  eq(G.playCard("player", 0, true), true, "dead energy pays dead plays");
  eq(p.deadEss, 4, "dead pool deducted");
  eq(p.essence, 0, "living pool untouched by dead play");
}
{ // sacrificing played units
  const st = fresh();
  const p = st.player;
  p.sacrificed = false; p.maxEss = 3; p.essence = 3;
  const u = put("player", "warden", "living");
  ok(G.sacrificeUnit("player", u.uid), "a living unit can be sacrificed");
  eq(p.maxEss, 4, "unit sacrifice: +1 max essence");
  eq(p.living.length, 0, "the offered unit leaves the field");
  eq(p.deadHand[0], "warden", "its card crosses into the dead hand");
  eq(G.sacrificeUnit("player", 999), false, "one sacrifice per turn");
  const st2 = fresh();
  st2.player.sacrificed = false;
  const d = put("player", "shambler", "dead");
  ok(G.sacrificeUnit("player", d.uid), "a dead unit can be sacrificed");
  eq(st2.player.dead.length, 0, "the dead offering is consumed");
  eq(st2.player.deadHand.length, 0, "a dead-dimension sacrifice does not cross back");
  const st3 = fresh();
  st3.player.sacrificed = false;
  const tok = put("player", "rat", "living");
  ok(G.sacrificeUnit("player", tok.uid), "tokens can be offered too");
  eq(st3.player.deadHand.length, 0, "tokens leave no card behind");
  const st4 = fresh();
  st4.player.sacrificed = false;
  const theirs = put("ai", "warden", "living");
  eq(G.sacrificeUnit("player", theirs.uid), false, "cannot sacrifice enemy units");
  const st5 = fresh("brann");
  st5.player.sacrificed = false;
  const bu = put("player", "collector", "living");
  G.sacrificeUnit("player", bu.uid);
  eq(st5.ai.soul, 19, "Brann's passive fires on unit sacrifice");
  eq(st5.player.hand.length, 1, "Martyr fires on unit sacrifice");
}
{ // dead-hand cooldown: fresh arrivals settle for one turn
  const st = fresh();
  const p = st.player;
  p.sacrificed = false; p.hand = ["peasant"]; p.deadEss = 9;
  G.sacrifice("player", 0);
  eq(p.deadHand[0], "peasant", "sacrifice reaches the dead hand");
  eq(G.playCard("player", 0, true), false, "…but it is fresh: unplayable this turn");
  G.startTurn("player");
  p.deadEss = 9;
  eq(G.playCard("player", 0, true), true, "it settles and plays next turn");
  // settled cards stay playable when a fresh one lands behind them
  const st2 = fresh();
  const p2 = st2.player;
  p2.deadHand = ["peasant"]; p2.deadEss = 9;
  const v = put("player", "gravrat", "living", false);
  v.hp = 0; G.sweepDeaths(); // gravrat falls in, fresh
  eq(p2.deadHand.length, 2, "dying card joined the dead hand");
  eq(G.playCard("player", 1, true), false, "the fresh arrival is locked");
  eq(G.playCard("player", 0, true), true, "the settled card still plays");
}

/* ---------- situations ---------- */
{
  const st = fresh();
  const p = st.player;
  p.sits.living.push({uid:1, cardId:"tome", dim:"living"});
  p.deck = ["peasant","peasant","peasant"]; p.hand = [];
  st.round = 2;
  G.startTurn("player");
  eq(p.hand.length, 2, "Tome of Knowledge draws an extra card");
  ["grove","warbanner","font","siphon"].forEach((id,i) => p.sits.living.push({uid:2+i, cardId:id, dim:"living"}));
  p.hand = ["ward"]; p.essence = 5;
  eq(p.sits.living.length, 5, "five situations can coexist per dimension");
  eq(G.playSituation("player", 0, false), false, "cannot exceed MAX_SITS (5) per dimension");
  p.sits.living.pop();
  eq(G.playSituation("player", 0, false), true, "sixth slot opens when one leaves");
  p.sits.living = p.sits.living.filter(x => x.cardId !== "ward" && x.cardId !== "siphon" && x.cardId !== "warbanner" && x.cardId !== "font");
  // siphon living + grave toll dead
  p.sits.living = [{uid:3, cardId:"siphon", dim:"living"}];
  p.life = 20;
  const v = put("player", "peasant", "living", false);
  v.hp = 0; G.sweepDeaths();
  eq(p.life, 21, "Soul Siphon restores 1 Life on own living death");
  p.sits.dead = [{uid:4, cardId:"siphon", dim:"dead"}];
  const dv = put("player", "spirit", "dead", false);
  dv.hp = 0; G.sweepDeaths();
  eq(st.ai.soul, 19, "Grave Toll burns enemy Soul on own dead destruction");
  // weeping barrow at turn start
  st.ai.sits.dead = [{uid:5, cardId:"grove", dim:"dead"}];
  const soulBefore = st.player.soul;
  G.startTurn("ai");
  eq(st.player.soul, soulBefore - 1, "Weeping Barrow saps 1 Soul at its owner's turn start");
}

/* ---------- Rites & Ruin: dispel, cross-over of situations, uniqueness, omen units ---------- */
{
  const st = fresh();
  st.ai.sits.living.push({uid:7001, cardId:"tome", dim:"living"});
  st.player.hand = ["dispel"];
  st.ai.deadHand = [];
  G.castSpell("player", false, 0, {uid:7001});
  eq(st.ai.sits.living.length, 0, "Unravel destroys a living situation");
  eq(st.ai.sits.dead.length, 0, "destroyed situation is not auto-activated in the dead zone");
  eq(st.ai.deadHand[0], "tome", "destroyed living situation joins its owner's dead hand");
  st.ai.sits.dead.push({uid:7002, cardId:"tome", dim:"dead"});
  st.player.deadHand = ["dispel"];
  G.castSpell("player", true, 0, {uid:7002});
  eq(st.ai.sits.dead.length, 0, "Sever destroys a dead situation for good");
  eq(st.ai.deadHand.length, 1, "Sever leaves nothing behind");
}
{ // uniqueness per dimension
  const st = fresh();
  st.player.hand = ["tome","tome"]; st.player.essence = 10;
  eq(G.playCard("player", 0, false), true, "first Tome plays");
  eq(G.playCard("player", 0, false), false, "second Tome of the same dimension is refused");
  st.player.deadHand = ["tome"];
  eq(G.playCard("player", 0, true), true, "same card CAN be active in the other dimension");
}
{ // omen units: die into situations
  const st = fresh();
  const cm = put("player", "candlemaid", "living", false);
  cm.hp = 0; G.sweepDeaths();
  eq(st.player.dead.length, 0, "omen unit does not become a dead unit");
  eq(st.player.deadHand[0], "candlemaid", "omen unit's card waits in the dead hand");
  st.player.sits.dead.push({uid:7050, cardId:"candlemaid", dim:"dead"});
  st.player.soul = 10;
  G.startTurn("player");
  eq(st.player.soul, 11, "Vigil Flame restores 1 Soul at turn start");
  // played from dead hand it becomes the situation directly
  st.player.deadHand = ["drummer"]; st.player.deadFresh = 0; st.player.deadEss = 5;
  G.playCard("player", 0, true);
  ok(st.player.sits.dead.some(x => x.cardId === "drummer"), "dead-hand omen unit is set as a situation");
  const sp = put("player", "spirit", "dead");
  eq((() => { let n = 0; G.attack(sp.uid, null); return st.ai.soul; })(), 20 - 3, "Dirge Drums grants +1 dead ATK");
}
{ // lamplighter debuff floors at 0
  const st = fresh();
  st.ai.sits.dead.push({uid:7100, cardId:"lamplighter", dim:"dead"});
  const weak = put("player", "hound", "dead"); // dead face 1/1 → 0 atk
  G.attack(weak.uid, null);
  eq(st.ai.soul, 20, "Corpse Light reduces enemy dead ATK (floored at 0, no drain)");
}
{ // warbanner / bone standard / font / ward
  const st = fresh();
  st.player.sits.living.push({uid:7200, cardId:"warbanner", dim:"living"});
  const u = put("player", "peasant", "living"); // 2 atk +1
  G.attack(u.uid, null);
  eq(st.ai.life, 30 - 3, "War Banner grants living +1 ATK");
  st.player.sits.dead.push({uid:7201, cardId:"warbanner", dim:"dead"});
  st.player.deadHand = ["gravrat"]; st.player.deadEss = 3;
  G.playCard("player", 0, true);
  eq(st.player.dead[0].hp, DEFS.gravrat.d[1] + 1, "Bone Standard: +1 HP entering the dead field");
  st.player.sits.living.push({uid:7202, cardId:"font", dim:"living"});
  st.player.sits.dead = [{uid:7203, cardId:"font", dim:"dead"}];
  st.player.maxEss = 4;
  G.startTurn("player");
  eq(st.player.essence, 5, "Essence Font grants +1 essence at turn start");
  eq(st.player.deadEss, 1, "Font of Rot grants +1 dead energy at turn start");
  // ward retaliation
  const st2 = fresh();
  st2.ai.sits.living.push({uid:7300, cardId:"ward", dim:"living"});
  const atkr = put("player", "warden", "living"); // 3/4
  G.attack(atkr.uid, null);
  eq(atkr.hp, 3, "Thorn Ward lashes the attacker for 1");
}
{ // new spells: darkpact, surge, mend, haunt
  const st = fresh();
  const p = st.player;
  p.deck = ["peasant","peasant","peasant","peasant"];
  p.hand = ["darkpact"]; p.life = 20;
  G.castSpell("player", false, 0, null);
  eq(p.hand.length, 2, "Dark Pact draws 2");
  eq(p.life, 18, "Dark Pact costs 2 Life");
  p.hand = ["surge"]; const essBefore = p.essence;
  G.castSpell("player", false, 0, null);
  eq(p.essence, essBefore + 2, "Essence Surge grants +2 (0-cost)");
  p.deadHand = ["surge"]; const dBefore = p.deadEss;
  G.castSpell("player", true, 0, null);
  eq(p.deadEss, dBefore + 2, "Grave Surge grants +2 dead energy");
  p.hand = ["mend"]; p.life = 15;
  G.castSpell("player", false, 0, null);
  eq(p.life, 19, "Mending Light restores 4 Life");
  const big = put("player", "ghoul", "living", false); // 4 atk
  p.hand = ["haunt"];
  G.castSpell("player", false, 0, {uid:big.uid});
  eq(st.ai.life, 30 - 4, "Final Charge deals the unit's ATK to enemy Life");
  ok(p.deadHand.includes("ghoul"), "Final Charge victim's card joins the dead hand");
}

/* ---------- win/veil edge cases ---------- */
{
  const st = fresh();
  st.ai.life = 2;
  const a = put("player", "ghoul", "living"); // 4 atk
  G.attack(a.uid, null);
  eq(st.winner, "VICTORY", "Life 0 ends the game");
  const st2 = fresh();
  st2.player.soul = 1; st2.player.soulBroken = false;
  const b = put("ai", "shambler", "dead");
  G.attack(b.uid, null);
  ok(st2.player.soulBroken && !st2.winner, "own shatter doesn't lose the game");
}

/* ---------- caps / draw ---------- */
{
  const st = fresh();
  const p = st.player;
  p.hand = Array(10).fill("peasant"); p.deck = ["smite"];
  st.round = 2; p.sits.living = [];
  G.startTurn("player");
  eq(p.hand.length, 10, "hand cap: draw burns overflow");
  p.deck = [];
  G.startTurn("player"); // no crash on empty deck
  ok(true, "empty deck draw is safe");
  // dead-hand cap: dying card fades when the dead hand is full
  p.deadHand = Array(10).fill("peasant");
  const v = put("player", "gravrat", "living", false);
  v.hp = 0; G.sweepDeaths();
  eq(p.deadHand.length, 10, "full dead hand: the dying card fades");
}

/* ---------- LLM legal-action integrity ---------- */
{
  const st = fresh();
  const s = st.ai;
  s.sacrificed = false;
  s.hand = ["peasant","smite","requiem","tome"]; s.deadHand = ["deathknight","cull"];
  s.essence = 3; s.deadEss = 3;
  put("ai", "ghoul", "living"); put("ai", "spirit", "dead");
  put("player", "sentinel", "living", false); put("player", "peasant", "living", false);
  const acts = G.llmLegalActions();
  ok(acts.every(a => a.do.action !== "play" ||
      DEFS[(a.do.hand === "dead" ? s.deadHand : s.hand)[a.do.index]].cost <= (a.do.hand === "dead" ? s.deadEss : s.essence)),
    "LLM: no unaffordable plays offered");
  ok(!acts.some(a => a.do.action === "play" && a.do.hand === "dead" && s.deadHand[a.do.index] === "deathknight"),
    "LLM: 5-cost dead play not offered with 3 dead energy");
  const livingAttacks = acts.filter(a => a.do.action === "attack" && G.findUnit(a.do.attackerUid).dim === "living");
  ok(livingAttacks.every(a => a.do.targetUid != null && DEFS[G.findUnit(a.do.targetUid).unit.cardId].ability === "guard"),
    "LLM: guard forces all living attacks onto the guard, no hero option");
  ok(acts.some(a => a.do.action === "cast" && a.do.targetUid === null), "LLM: targetless spells offered");
  ok(acts.filter(a => a.do.action === "sacrifice").length === s.hand.length, "LLM: one sacrifice option per hand card");
}

/* ---------- Veilbound: card integrity across every definition ---------- */
{
  const KINDS_FX = new Set(["dmg","buff","drainSoul","drainLife","healLife","healSoul","cauterize","draw","gainEss","gainDeadEss","aoe","shift","gamble","dispel",
    "freeze","freezeAll","blight","weaken","hollow","shackle","markdoom","transform","betray","bounce",
    "grant","fortify","ready","massReady","invert","clone","swap","equalize","stealDeadHand"]);
  const KINDS_SIT = new Set(["livingAtk","deadAtk","foeDeadAtk","foeLivingAtk","turnDraw","turnLife","turnSoul","turnEss","turnDeadEss","turnDrain","ward","enterDeadHp","enterLivingAtk","enterDeadAtk","onLivingDeathLife","onDeadDestroyDrain","doom","turnStingFoe","turnWeakenFoe"]);
  const BESPOKE = new Set(["cull","smite","banish","soultap","requiem","dispel","darkpact","surge","mend","haunt"]);
  const TARGETS = new Set(["friendlyLiving","anyLiving","anyDead","friendlyDeadAny","friendlyDead","situationLiving","situationDead","enemyDead","enemyLiving"]);
  const ABILITIES = new Set(["haste","heal2","martyr","undying","plague","spirit","digger","ferry","rats","guard","twin","consume","weaken2","freezer","shackler"]);
  const KINDS_UPOWER = new Set(["boltFoe","drainSoul","draw","stormFoes","rallyAllies"]);
  const bad = [];
  for(const [id, def] of Object.entries(DEFS)){
    if(def.token) continue;
    if(!def.rarity) bad.push(id+": no rarity");
    if(typeof def.cost !== "number") bad.push(id+": no cost");
    if(!def.text) bad.push(id+": no text");
    if(def.ability && !ABILITIES.has(def.ability)) bad.push(id+": unknown ability "+def.ability);
    const faces = [def];
    if(def.deadFace) faces.push(Object.assign({}, def, def.deadFace));
    for(const face of faces){
      if(face.target && !TARGETS.has(face.target)) bad.push(id+": bad target "+face.target);
      if(def.type === "spell" && !BESPOKE.has(id) && !face.fx) bad.push(id+": spell face without fx");
      if(face.fx && !KINDS_FX.has(face.fx.kind)) bad.push(id+": bad fx kind "+face.fx.kind);
      if(face.sitFx && !KINDS_SIT.has(face.sitFx.kind)) bad.push(id+": bad sitFx kind "+face.sitFx.kind);
    }
    if(def.power && !(KINDS_UPOWER.has(def.power.kind) && def.power.cost >= 1 && def.power.name && def.power.text)) bad.push(id+": bad unit power");
    if(def.type === "unit"){
      if(!Array.isArray(def.l) || !Array.isArray(def.d)) bad.push(id+": unit missing stats");
      if(def.deadForm === "situation" && !(def.deadFace && def.deadFace.sitFx)) bad.push(id+": omen without dead sitFx");
    } else if(def.type === "situation"){
      if(!def.sitFx) bad.push(id+": situation without living sitFx");
      if(!(def.deadFace && def.deadFace.sitFx)) bad.push(id+": situation without dead sitFx");
    } else if(def.type !== "spell"){ bad.push(id+": bad type "+def.type); }
  }
  ok(bad.length === 0, "card integrity across all "+Object.keys(DEFS).length+" defs"+(bad.length ? " -> "+bad.slice(0,6).join(" | ") : ""));
}

/* ---------- Veilbound novel mechanics ---------- */
{ // twin, harvest, consume
  const st = fresh();
  st.player.hand = ["vb_dove"]; st.player.deadHand = []; st.player.essence = 5;
  G.playCard("player", 0, false);
  eq(st.player.deadHand[0], "vb_dove", "Twin: reflection falls into the dead hand");
  const h = put("player", "vb_cutpurse", "living");
  const victim = put("ai", "peasant", "living", false);
  G.attack(h.uid, victim.uid);
  eq(st.ai.soul, 19, "Harvest drains 1 Soul on kill");
  st.player.deadEss = 9; st.player.deadHand = ["vb_glutton"]; st.player.deadFresh = 0;
  const meal = put("player", "spirit", "dead", false);
  G.playCard("player", 0, true);
  const glut = st.player.dead.find(u => u.cardId === "vb_glutton");
  eq(glut.atk, DEFS.vb_glutton.d[0] + 2, "Consume eats the weakest friendly dead unit, gains its ATK");
  ok(!st.player.dead.some(u => u.uid === meal.uid), "Consume removed the meal");
}
{ // bloodprice
  const st = fresh();
  const p = st.player;
  p.hand = ["vb_thrall"]; p.essence = 0; p.life = 20;
  eq(G.playCard("player", 0, false), true, "Bloodprice unit plays with zero essence");
  eq(p.life, 17, "Bloodprice paid in Life");
  p.deadHand = ["vb_thrall"]; p.deadEss = 0; p.soul = 2; p.soulBroken = false;
  eq(G.playCard("player", 0, true), true, "dead Bloodprice plays with zero dead energy");
  ok(p.soulBroken, "paying Soul past zero shatters your own soul");
  eq(p.soul, 0, "soul clamped after self-shatter");
  p.hand = ["vb_thrall"]; p.life = 3;
  eq(G.playCard("player", 0, false), false, "cannot blood-pay into suicide");
}
{ // echo, veilshift, gamble
  const st = fresh();
  const p = st.player;
  p.hand = ["vb_pin"]; p.deadHand = [];
  const tgt = put("ai", "warden", "living", false);
  G.castSpell("player", false, 0, {uid:tgt.uid});
  eq(p.deadHand[0], "vb_pin", "Echo copies the cast into the dead hand");
  const sh = put("player", "shambler", "living", false);
  p.hand = ["vb_veilshift"];
  G.castSpell("player", false, 0, {uid:sh.uid});
  ok(!p.living.some(u => u.uid === sh.uid), "Veilshift removes the living face");
  eq(p.dead.find(u => u.cardId === "shambler").hp, DEFS.shambler.d[1], "Veilshift deploys the dead face");
  p.deck = ["deathknight"]; p.hand = ["vb_gamble"]; p.living = [];
  G.castSpell("player", false, 0, null);
  ok(p.living.some(u => u.cardId === "deathknight"), "Gamble puts a revealed unit into play free");
  p.deck = ["smite"]; p.hand = ["vb_gamble"]; p.deadHand = [];
  G.castSpell("player", false, 0, null);
  eq(p.deadHand[0], "smite", "Gamble sends a non-unit to the dead hand");
}
{ // ranged
  const st = fresh();
  const a = put("player", "vb_archer", "living"); // 2/2 ranged
  const d = put("ai", "warden", "living", false); // 3/4 survives
  G.attack(a.uid, d.uid);
  eq(d.hp, 2, "ranged attack lands");
  eq(a.hp, 2, "Ranged: no retaliation even when the defender survives");
}
{ // doom knells + charges
  const st = fresh();
  const p = st.player;
  p.sits.living.push({uid:9101, cardId:"vb_tolling", dim:"living"});
  put("player", "warden", "living", false); put("ai", "ghoul", "living", false);
  G.startTurn("player"); G.startTurn("player");
  ok(p.living.length === 1 && st.ai.living.length === 1, "doom does not fire before its final knell");
  G.startTurn("player");
  eq(p.living.length, 0, "The Tolling wipes your living units at 3 knells");
  eq(st.ai.living.length, 0, "The Tolling wipes enemy living units too");
  ok(!p.sits.living.some(x => x.cardId === "vb_tolling"), "the bell consumes itself");
  p.sits.living = [{uid:9102, cardId:"vb_millstone", dim:"living"}];
  p.deck = ["peasant","peasant","peasant","peasant"]; p.hand = [];
  G.startTurn("player"); G.startTurn("player");
  ok(p.sits.living.length === 1, "charged situation persists while charges remain");
  G.startTurn("player");
  eq(p.sits.living.length, 0, "charged situation burns out after its last turn");
}
/* ---------- HEX & RELIC: statuses, hexes, charms, envelope-pushers ---------- */
{ // freeze: stays exhausted, thaws on schedule
  const st = fresh();
  const t = put("ai", "warden", "living", false);
  st.player.hand = ["hx_frost"];
  G.castSpell("player", false, 0, {uid:t.uid});
  eq(t.st.frozen, 2, "Grasp of Frost freezes for 2");
  G.startTurn("ai");
  ok(t.exhausted, "frozen unit does not wake (turn 1)");
  G.startTurn("ai");
  ok(t.exhausted, "frozen unit does not wake (turn 2)");
  G.startTurn("ai");
  ok(!t.exhausted, "thaws on the third turn");
}
{ // blight ticks forever and kills across the veil
  const st = fresh();
  const t = put("ai", "gravrat", "living", false); // 1/1 living
  st.player.hand = ["hx_blight"];
  G.castSpell("player", false, 0, {uid:t.uid});
  st.ai.deadHand = [];
  G.startTurn("ai");
  ok(!st.ai.living.some(u => u.uid === t.uid), "blight tick killed the 1-HP unit");
  ok(st.ai.deadHand.includes("gravrat"), "blight victim crosses over normally");
}
{ // hollow silences everything
  const st = fresh();
  const g = put("ai", "pallbearer", "living", false); // guard
  ok(G.guardsOf("ai", "living").length === 1, "guard active before hollowing");
  st.player.hand = ["hx_hollow"];
  G.castSpell("player", false, 0, {uid:g.uid});
  eq(G.guardsOf("ai", "living").length, 0, "Hollowing strips Guard");
  const u = put("player", "flameblade", "living", false); // undying
  G.stOf(u).hollow = true;
  u.hp = 0; st.player.hand = []; G.sweepDeaths();
  eq(st.player.hand.length, 0, "hollowed Undying dies for real");
  ok(st.player.deadHand.includes("flameblade"), "…and crosses over like anyone else");
}
{ // shackle: no hero attacks, units still fine
  const st = fresh();
  const a = put("ai", "ghoul", "living");
  st.player.hand = ["hx_shackle"];
  G.castSpell("player", false, 0, {uid:a.uid});
  const lifeBefore = st.player.life;
  G.attack(a.uid, null);
  eq(st.player.life, lifeBefore, "shackled unit cannot strike the hero");
  const blocker = put("player", "warden", "living", false);
  G.attack(a.uid, blocker.uid);
  ok(blocker.hp < DEFS.warden.l[1], "shackled unit still fights units");
}
{ // mark of the reaper
  const st = fresh();
  const t = put("ai", "deathknight", "living", false);
  st.player.hand = ["hx_mark"];
  G.castSpell("player", false, 0, {uid:t.uid});
  G.startTurn("ai");
  ok(st.ai.living.some(u => u.uid === t.uid), "marked unit survives the first turn");
  G.startTurn("ai");
  ok(!st.ai.living.some(u => u.uid === t.uid), "the mark claims it on the second");
}
{ // transform, betray, bounce
  const st = fresh();
  const big = put("ai", "deathknight", "living", false);
  st.player.hand = ["hx_toadhex"];
  G.castSpell("player", false, 0, {uid:big.uid});
  ok(!st.ai.living.some(u => u.uid === big.uid), "Croaking Curse removes the target");
  ok(st.ai.living.some(u => u.cardId === "toad" && u.atk === 1 && u.hp === 1), "…and leaves a 1/1 Toad");
  const st2 = fresh();
  const traitor = put("ai", "ghoul", "living", false);   // 4 atk
  const victim = put("ai", "peasant", "living", false);  // 2/1
  st2.player.hand = ["hx_betray"];
  G.castSpell("player", false, 0, {uid:traitor.uid});
  ok(!st2.ai.living.some(u => u.uid === victim.uid), "Whispered Betrayal made the ghoul kill its weakest ally");
  const st3 = fresh();
  const back = put("ai", "warden", "living", false);
  st3.ai.hand = []; st3.player.hand = ["hx_gale"];
  G.castSpell("player", false, 0, {uid:back.uid});
  eq(st3.ai.living.length, 0, "Banishing Gale removes the unit");
  eq(st3.ai.hand[0], "warden", "…back into its owner's hand");
}
{ // charms: lifesteal, ranged grant, fortify, twin strike, ready
  const st = fresh();
  const v = put("player", "ghoul", "living"); // 4 atk
  st.player.hand = ["hx_fangs"]; st.player.life = 15;
  G.castSpell("player", false, 0, {uid:v.uid});
  G.attack(v.uid, null);
  eq(st.player.life, 19, "Vampire Fangs: living strike restores that much Life");
  const st2 = fresh();
  const archer = put("player", "peasant", "living"); // 2/1
  const wall = put("ai", "warden", "living", false); // 3/4 survives
  st2.player.hand = ["hx_bow"];
  G.castSpell("player", false, 0, {uid:archer.uid});
  G.attack(archer.uid, wall.uid);
  eq(archer.hp, 1, "Spectral Longbow: no retaliation");
  const st3 = fresh();
  const soft = put("player", "peasant", "living", false);
  st3.player.hand = ["hx_plate"];
  G.castSpell("player", false, 0, {uid:soft.uid});
  eq(soft.hp, DEFS.peasant.l[1] + 2, "Gravewrought Plate: +2 HP");
  ok(G.unitGuard(soft), "…and Guard");
  const st4 = fresh();
  const twin = put("player", "ghoul", "living");
  st4.player.hand = ["hx_horn"];
  G.castSpell("player", false, 0, {uid:twin.uid});
  G.attack(twin.uid, null);
  ok(!twin.exhausted, "Twin Strike: first attack doesn't exhaust");
  G.attack(twin.uid, null);
  ok(twin.exhausted, "…but the second does");
  eq(st4.ai.life, 30 - 8, "both strikes landed");
  const st5 = fresh();
  const tired = put("player", "ghoul", "living", false);
  ok(tired.exhausted, "setup: exhausted");
  st5.player.hand = ["hx_quick"]; st5.player.deadHand = [];
  G.castSpell("player", false, 0, {uid:tired.uid});
  ok(!tired.exhausted, "Quicksilver Charm readies the unit");
  eq(st5.player.deadHand[0], "hx_quick", "Echo: the charm slips into the dead hand");
}
{ // envelope: invert, clone, swap, equalize, robbery, second sunrise
  const st = fresh();
  const tank = put("player", "sentinel", "living", false); // 1/5
  st.player.hand = ["hx_invert"];
  G.castSpell("player", false, 0, {uid:tank.uid});
  ok(tank.atk === 5 && tank.hp === 1, "Inversion Hex swaps ATK and HP");
  const st2 = fresh();
  const theirBest = put("ai", "deathknight", "living", false);
  st2.player.hand = ["hx_mirror"];
  G.castSpell("player", false, 0, {uid:theirBest.uid});
  ok(st2.player.living.some(u => u.cardId === "deathknight"), "Mirror of Bone copies an ENEMY unit onto your side");
  ok(st2.ai.living.some(u => u.uid === theirBest.uid), "…without stealing the original");
  const st3 = fresh();
  const mine = put("player", "peasant", "living", false);
  const theirs = put("ai", "deathknight", "living", false);
  st3.player.hand = ["hx_exchange"];
  G.castSpell("player", false, 0, {uid:theirs.uid});
  ok(st3.player.living.some(u => u.uid === theirs.uid), "Soul Exchange: their unit is yours now");
  ok(st3.ai.living.some(u => u.uid === mine.uid), "…and your weakest walked the other way");
  const st4 = fresh();
  put("player", "peasant", "living", false); put("ai", "deathknight", "living", false);
  st4.player.hand = ["hx_leveller"];
  G.castSpell("player", false, 0, null);
  ok(st4.player.living.every(u => u.atk === 3 && u.hp === 3) && st4.ai.living.every(u => u.atk === 3 && u.hp === 3),
    "The Leveller makes every living unit 3/3");
  const st5 = fresh();
  st5.ai.deadHand = ["deathknight"]; st5.player.deadHand = [];
  st5.player.hand = ["hx_robbery"];
  G.castSpell("player", false, 0, null);
  eq(st5.player.deadHand[0], "deathknight", "Grave Robbery steals from the enemy dead hand");
  eq(st5.ai.deadHand.length, 0, "…and they lose it");
  const st6 = fresh();
  const w1 = put("player", "ghoul", "living", false), w2 = put("player", "warden", "living", false);
  st6.player.hand = ["hx_sunrise"]; st6.player.essence = 10;
  G.castSpell("player", false, 0, null);
  ok(!w1.exhausted && !w2.exhausted, "Second Sunrise readies the whole living line");
}
{ // winterveil freezes the whole enemy field
  const st = fresh();
  const e1 = put("ai", "ghoul", "living"), e2 = put("ai", "warden", "living");
  st.player.hand = ["hx_winter"];
  G.castSpell("player", false, 0, null);
  ok(e1.st.frozen === 1 && e2.st.frozen === 1, "Winterveil freezes all enemy living units");
}
{ // situations: miasma, nettles, gallows, forge
  const st = fresh();
  st.ai.sits.living.push({uid:8801, cardId:"hx_miasma", dim:"living"});
  const u = put("player", "ghoul", "living"); // 4 atk − 1
  G.attack(u.uid, null);
  eq(st.ai.life, 30 - 3, "Miasma of Despair: enemy living units −1 ATK");
  const st2 = fresh();
  st2.player.sits.living.push({uid:8802, cardId:"hx_nettles", dim:"living"});
  const strong = put("ai", "deathknight", "living", false);
  G.startTurn("player");
  eq(strong.hp, DEFS.deathknight.l[1] - 1, "Field of Nettles stings the strongest enemy");
  const st3 = fresh();
  st3.player.sits.living.push({uid:8803, cardId:"hx_gallows", dim:"living"});
  const cond = put("ai", "ghoul", "living", false); // 4 atk
  G.startTurn("player");
  eq(cond.atk, 3, "The Gallows saps 1 ATK per turn");
  G.startTurn("player"); G.startTurn("player"); G.startTurn("player");
  eq(cond.atk, 0, "…down to 0");
  eq(st3.player.sits.living.length, 0, "the Gallows burns out after 4 turns");
  const st4 = fresh();
  st4.player.sits.living.push({uid:8804, cardId:"hx_forge", dim:"living"});
  st4.player.hand = ["peasant"]; st4.player.essence = 5;
  G.playCard("player", 0, false);
  eq(st4.player.living[0].atk, DEFS.peasant.l[0] + 1, "Blood Forge: units enter the living field with +1 ATK");
}
{ // on-play hex units + innate lifesteal
  const st = fresh();
  const t = put("ai", "ghoul", "living", false); // 4 atk
  st.player.hand = ["hx_witch"]; st.player.essence = 5;
  G.playCard("player", 0, false);
  eq(t.atk, 2, "Gutter Witch saps 2 ATK on play");
  const st2 = fresh();
  const t2 = put("ai", "deathknight", "living");
  st2.player.hand = ["hx_wight"]; st2.player.essence = 5;
  G.playCard("player", 0, false);
  eq(t2.st.frozen, 1, "Frost Wight freezes the strongest enemy on play");
  const st3 = fresh();
  const c = put("player", "hx_countess", "dead");
  st3.player.soul = 10;
  G.attack(c.uid, null);
  eq(st3.player.soul, 10 + 4, "Crimson Countess: dead strikes feed Soul");
}
{ // powered units: charge → unleash
  const st = fresh();
  const pyro = put("player", "hx_pyro", "living", false);
  pyro.pw = 0;
  eq(G.canUseUnitPower("player", pyro.uid), false, "unit power needs charge");
  G.startTurn("player"); G.startTurn("player");
  eq(pyro.pw, 2, "unit charges ⚡1 per turn");
  const t = put("ai", "warden", "living", false); // 3/4 strongest
  ok(G.useUnitPower("player", pyro.uid), "Firebolt fires at full charge");
  eq(t.hp, 2, "Firebolt hits the strongest enemy for 2");
  eq(pyro.pw, 0, "charge spent");
  const st2 = fresh();
  const oracle = put("player", "hx_oracle", "living", false);
  oracle.pw = 2; st2.player.deck = ["peasant"]; st2.player.hand = [];
  G.useUnitPower("player", oracle.uid);
  eq(st2.player.hand.length, 1, "Veil Oracle's Scry draws");
  const st3 = fresh();
  const idol = put("player", "hx_idol", "living", false);
  idol.pw = 4;
  const f1 = put("ai", "peasant", "living", false), f2 = put("ai", "gravrat", "dead", false);
  G.useUnitPower("player", idol.uid);
  ok(!st3.ai.living.some(u => u.uid === f1.uid), "Tempest kills the 1-HP living unit");
  eq(f2.hp, 1, "…and chips the dead one");
  const st4 = fresh();
  const frozenPyro = put("player", "hx_pyro", "living", false);
  frozenPyro.pw = 2; G.stOf(frozenPyro).frozen = 1;
  eq(G.canUseUnitPower("player", frozenPyro.uid), false, "frozen units can't channel");
  frozenPyro.st.frozen = 0; frozenPyro.st.hollow = true;
  eq(G.canUseUnitPower("player", frozenPyro.uid), false, "hollowed units can't channel");
}
{ // random deck: size, copies, distribution
  for(let i = 0; i < 5; i++){
    const d = G.randomDeck();
    eq(d.length, 40, "random deck is exactly 40");
    const counts = {};
    d.forEach(id => counts[id] = (counts[id]||0) + 1);
    ok(Object.values(counts).every(n => n <= 2), "random deck: max 2 copies");
    ok(d.every(id => DEFS[id] && !DEFS[id].token), "random deck: no tokens, all real cards");
    const units = d.filter(id => DEFS[id].type === "unit").length;
    const sits = d.filter(id => DEFS[id].type === "situation").length;
    ok(units >= 18 && units <= 24, "random deck: ~22 units (got "+units+")");
    ok(sits >= 4 && sits <= 8, "random deck: ~6 situations (got "+sits+")");
  }
}

/* ---------- THE TEAR: fields merge into one ---------- */
{
  const st = fresh();
  // the player is about to shatter the AI's soul; both sides have dead assets
  const myDead = put("player", "deathknight", "dead", false); // 5/5 dead face
  st.player.sits.dead.push({uid:9301, cardId:"tome", dim:"dead"});
  st.player.deadHand = ["shambler"];
  put("ai", "ghoul", "dead", false);
  st.ai.sits.dead.push({uid:9302, cardId:"grove", dim:"dead"});
  st.ai.deadHand = ["peasant","warden"];
  st.ai.soul = 1;
  const striker = put("player", "spirit", "dead");
  G.attack(striker.uid, null); // 2 dmg → shatter → TEAR
  ok(st.merged, "the tear merges the dimensions");
  eq(st.ai.dead.length, 0, "loser's dead units are devoured");
  eq(st.ai.sits.dead.length, 0, "loser's dead situations are devoured");
  eq(st.ai.deadHand.length, 0, "loser's dead hand is devoured");
  ok(st.player.dead.length === 0 && st.player.living.some(u => u.uid === myDead.uid),
    "winner's dead legion marches onto the one field");
  const merged = st.player.living.find(u => u.uid === myDead.uid);
  ok(merged.deadFace && merged.dim === "living", "…keeping its dead face");
  ok(st.player.sits.living.some(x => x.cardId === "tome" && x.deadFace), "winner's dead situations follow, dead face active");
  eq(st.player.deadHand[0], "shambler", "winner keeps the dead hand");
  // post-merge: dead-hand plays land on the one field with their dead faces
  st.player.deadEss = 5;
  G.playCard("player", 0, true);
  const sh = st.player.living.find(u => u.cardId === "shambler");
  ok(sh && sh.deadFace && sh.hp === DEFS.shambler.d[1], "post-merge dead-hand play: dead face on the one field");
  // and the merged legion strikes Life directly — the merged Tome of the
  // Damned (dead face: your dead units +1 ATK) still empowers the legion
  const lifeBefore = st.ai.life;
  merged.exhausted = false;
  G.attack(merged.uid, null);
  eq(st.ai.life, lifeBefore - (DEFS.deathknight.d[0] + 1), "merged dead-face unit hits Life (with its dead aura intact)");
}

/* ---------- FUZZ: random legal actions, invariants after every action ---------- */
function invariants(tag){
  const st = G.state;
  for(const k of ["player","ai"]){
    const s = st[k];
    if(s.hand.length > 10) throw new Error(tag+" hand overflow");
    const fieldCap = st.merged ? 12 : 6; // the merge can pool two full fields
    if(s.living.length > fieldCap || s.dead.length > 6) throw new Error(tag+" field overflow");
    if(st.merged && s.dead.length > 0) throw new Error(tag+" dead field nonempty after merge");
    if(s.sits.living.length > (st.merged ? 10 : 5) || s.sits.dead.length > 5) throw new Error(tag+" sits overflow");
    if(s.essence < 0 || s.deadEss < 0) throw new Error(tag+" negative pool");
    if(s.maxEss > 10) throw new Error(tag+" essence cap broken");
    if(s.channel < 0 || s.channel > 9) throw new Error(tag+" channel out of range");
    if(s.soul < 0) throw new Error(tag+" negative soul");
    if(s.soulBroken && s.soul !== 0) throw new Error(tag+" broken soul not clamped");
    for(const dim of ["living","dead"]) for(const u of s[dim]){
      if(u.hp <= 0) throw new Error(tag+" zombie unit "+u.cardId);
      if(u.dim !== dim) throw new Error(tag+" unit dim mismatch "+u.cardId);
    }
    // guard invariant: enemy hero untouched while... (checked implicitly via attack fn)
  }
}
const R = n => Math.floor(Math.random() * n);
async function fuzzGame(g){
  const ALL = Object.keys(DEFS).filter(id => !DEFS[id].token);
  const deck = [];
  while(deck.length < 30) deck.push(ALL[R(ALL.length)]);
  G.META.playerDeck = () => deck;
  const aiDeck = [];
  while(aiDeck.length < 30) aiDeck.push(ALL[R(ALL.length)]);
  G.META.aiDeck = () => aiDeck;
  const heroes = Object.keys(G.HEROES);
  G.newGame(heroes[R(heroes.length)]);
  G.state.ai.hero = heroes[R(heroes.length)];
  // random mulligan: toss a random subset of the opening hand
  G.confirmMulligan(G.state.player.hand.map((_, i) => i).filter(() => Math.random() < .3));
  invariants(`g${g} post-mulligan`);
  let rounds = 0;
  while(!G.state.winner && rounds < 60){
    const p = G.state.player;
    // player: fully random legal actions
    if(!p.sacrificed && p.hand.length && Math.random() < .8) G.sacrifice("player", R(p.hand.length));
    p.sacrificed = true;
    invariants(`g${g} r${rounds} post-sac`);
    for(let step = 0; step < 30 && !G.state.winner; step++){
      const choices = [];
      for(const [fd, hand] of [[false, p.hand],[true, p.deadHand]]){
        hand.forEach((id, i) => {
          if(DEFS[id].cost > (fd ? p.deadEss : p.essence)) return;
          if(DEFS[id].type === "spell"){
            const face = fd && DEFS[id].deadFace ? Object.assign({}, DEFS[id], DEFS[id].deadFace) : DEFS[id];
            if(!face.target) choices.push(() => G.castSpell("player", fd, i, null));
            else {
              const ts = G.validTargets("player", id, fd);
              if(ts.length) choices.push(() => G.castSpell("player", fd, i, {uid: ts[R(ts.length)].uid}));
            }
          } else choices.push(() => G.playCard("player", i, fd));
        });
      }
      for(const dim of ["living","dead"]){
        p[dim].filter(u => !u.exhausted && u.atk > 0).forEach(u => {
          const gs = G.guardsOf("ai", dim);
          const pool = gs.length ? gs : G.state.ai[dim];
          if(pool.length) choices.push(() => G.attack(u.uid, pool[R(pool.length)].uid));
          if(!gs.length) choices.push(() => G.attack(u.uid, null));
        });
      }
      if(G.canUsePower("player")){
        const pts = G.powerTargets("player");
        if(G.HEROES[p.hero].power.targeted){
          if(pts.length) choices.push(() => G.usePower("player", {uid: pts[R(pts.length)].uid}));
        } else choices.push(() => G.usePower("player"));
      }
      for(const dim of ["living","dead"]) p[dim].forEach(u => {
        if(G.canUseUnitPower("player", u.uid)) choices.push(() => G.useUnitPower("player", u.uid));
      });
      if(!choices.length || Math.random() < .12) break;
      choices[R(choices.length)]();
      invariants(`g${g} r${rounds} step${step}`);
    }
    if(G.state.winner) break;
    G.state.turn = "ai"; G.startTurn("ai");
    await G.aiTurn();
    invariants(`g${g} r${rounds} post-ai`);
    rounds++;
  }
  return {winner: G.state.winner || "TIMEOUT", rounds};
}

(async () => {
  console.log(`rule tests: ${passed} passed, ${failed} failed`);
  if(failed) process.exit(1);
  const results = [];
  for(let g = 0; g < 60; g++) results.push(await fuzzGame(g));
  const w = results.filter(r => r.winner === "VICTORY").length;
  const l = results.filter(r => r.winner === "DEFEAT").length;
  const t = results.filter(r => r.winner === "TIMEOUT").length;
  console.log(`fuzz: 60 games, player ${w} / ai ${l} / timeout ${t}, avg rounds ${(results.reduce((n,r)=>n+r.rounds,0)/60).toFixed(1)}`);
  console.log("ALL TESTS OK");
  process.exit(0);
})().catch(e => { console.error("TESTS FAIL:", e); process.exit(1); });
