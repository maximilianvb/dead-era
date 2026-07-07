// DEAD ERA — deterministic rule tests + fuzz. Headless (cards.js + game.js only).
// Run with: npm test   (or: node tests/rules.test.js)
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const load = f => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/"use strict";/, "");
(0, eval)(load("js/cards.js") + "\n" + load("js/game.js") + `
;globalThis.__G = { get state(){return state}, DEFS, HEROES, META, ESS_CAP,
  newGame, chooseHero, sacrifice, playCard, playUnit, playSituation, castSpell, validTargets,
  attack, sweepDeaths, startTurn, aiTurn, makeUnit, findUnit, llmLegalActions, guardsOf, __DECKLIST: DECKLIST,
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
  st.ai.hero = aiHero;
  for(const k of ["player","ai"]){
    const s = st[k];
    s.hand = []; s.deadHand = []; s.living = []; s.dead = [];
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
  eq(st.ai.soul, 15 - 4, "dead hero attack drains Soul");
  const b = put("player", "shambler", "living");
  G.attack(b.uid, null);
  eq(st.ai.life, 25 - 1, "living hero attack hits Life");
}
{ // Vex passive & torn veil
  const st = fresh("vex");
  const a = put("player", "spirit", "dead");         // 2/2
  G.attack(a.uid, null);
  eq(st.ai.soul, 15 - 3, "Vex adds +1 to direct Soul strikes");
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
  eq(st.ai.soul, 15 - 3, "dead tome grants +1 ATK to dead units");
}

/* ---------- guard ---------- */
{
  const st = fresh();
  const g = put("ai", "pallbearer", "living", false); // guard 1/4
  const o = put("ai", "peasant", "living", false);
  const a = put("player", "ghoul", "living");         // 4/3
  G.attack(a.uid, null);
  eq(st.ai.life, 25, "guard blocks hero attack");
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
  st.player.deadHand = ["cull"];
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
  eq(st.ai.soul, 13, "Soul Tap drains 2 Soul");
  st.player.deadHand = ["soultap"];
  G.castSpell("player", true, 0, null);
  eq(st.ai.life, 23, "Life Tap (dead face) drains 2 Life");
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
{ // resurrection
  const st = fresh();
  const d = put("player", "deathknight", "dead", false);
  st.player.hand = ["resurrection"];
  G.castSpell("player", false, 0, {uid:d.uid});
  eq(st.player.dead.length, 0, "Resurrection removes from dead field");
  eq(st.player.living.length, 1, "Resurrection puts unit on living field");
  eq(st.player.living[0].hp, DEFS.deathknight.l[1], "resurrected with living stats");
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
  eq(st3.ai.soul, 14, "Brann's sacrifice burns 1 enemy Soul");
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

/* ---------- situations ---------- */
{
  const st = fresh();
  const p = st.player;
  p.sits.living.push({uid:1, cardId:"tome", dim:"living"});
  p.deck = ["peasant","peasant","peasant"]; p.hand = [];
  st.round = 2;
  G.startTurn("player");
  eq(p.hand.length, 2, "Tome of Knowledge draws an extra card");
  p.sits.living.push({uid:2, cardId:"grove", dim:"living"});
  eq(G.playSituation("player", 0, false), false, "situation slots capped at 2 (setup: needs a card)"); // no card in hand → false anyway
  p.hand = ["siphon"]; p.essence = 5;
  eq(G.playSituation("player", 0, false), false, "cannot exceed MAX_SITS per dimension");
  // siphon living + grave toll dead
  p.sits.living = [{uid:3, cardId:"siphon", dim:"living"}];
  p.life = 20;
  const v = put("player", "peasant", "living", false);
  v.hp = 0; G.sweepDeaths();
  eq(p.life, 21, "Soul Siphon restores 1 Life on own living death");
  p.sits.dead = [{uid:4, cardId:"siphon", dim:"dead"}];
  const dv = put("player", "spirit", "dead", false);
  dv.hp = 0; G.sweepDeaths();
  eq(st.ai.soul, 14, "Grave Toll burns enemy Soul on own dead destruction");
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
  st.player.deadHand = ["drummer"]; st.player.deadEss = 5;
  G.playCard("player", 0, true);
  ok(st.player.sits.dead.some(x => x.cardId === "drummer"), "dead-hand omen unit is set as a situation");
  const sp = put("player", "spirit", "dead");
  eq((() => { let n = 0; G.attack(sp.uid, null); return st.ai.soul; })(), 15 - 3, "Dirge Drums grants +1 dead ATK");
}
{ // lamplighter debuff floors at 0
  const st = fresh();
  st.ai.sits.dead.push({uid:7100, cardId:"lamplighter", dim:"dead"});
  const weak = put("player", "hound", "dead"); // dead face 1/1 → 0 atk
  G.attack(weak.uid, null);
  eq(st.ai.soul, 15, "Corpse Light reduces enemy dead ATK (floored at 0, no drain)");
}
{ // warbanner / bone standard / font / ward
  const st = fresh();
  st.player.sits.living.push({uid:7200, cardId:"warbanner", dim:"living"});
  const u = put("player", "peasant", "living"); // 2 atk +1
  G.attack(u.uid, null);
  eq(st.ai.life, 25 - 3, "War Banner grants living +1 ATK");
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
  eq(st.ai.life, 25 - 4, "Final Charge deals the unit's ATK to enemy Life");
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

/* ---------- FUZZ: random legal actions, invariants after every action ---------- */
function invariants(tag){
  const st = G.state;
  for(const k of ["player","ai"]){
    const s = st[k];
    if(s.hand.length > 10) throw new Error(tag+" hand overflow");
    if(s.living.length > 6 || s.dead.length > 6) throw new Error(tag+" field overflow");
    if(s.sits.living.length > 2 || s.sits.dead.length > 2) throw new Error(tag+" sits overflow");
    if(s.essence < 0 || s.deadEss < 0) throw new Error(tag+" negative pool");
    if(s.maxEss > 10) throw new Error(tag+" essence cap broken");
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
  G.__DECKLIST.length = 0;
  while(G.__DECKLIST.length < 30) G.__DECKLIST.push(ALL[R(ALL.length)]);
  const heroes = Object.keys(G.HEROES);
  G.newGame(heroes[R(heroes.length)]);
  G.state.ai.hero = heroes[R(heroes.length)];
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
