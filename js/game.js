"use strict";
/* ============ GAME LOGIC (no DOM) ============
   UI hooks in via the FX registry; headless tests run on the no-op defaults. */

const FX = {
  render(){}, hint(){}, banner(){}, shatter(){},
  damage(){},                       // (ref, amount) ref = {uid} | {hero, dim}
  draw(){},                         // (k, cardId) a card visibly drawn into k's hand
  playedCard(){},                   // (k, cardId, fromDead, kind) kind = "play"|"cast"|"sacrifice"
  crossOver(){},                    // (k, cardId, uid|null) a living card falls into k's dead hand
  async attackAnim(){},             // (attackerUid, targetUid|null)
  async pause(){},                  // (ms)
};

/* AI configuration — "scripted" heuristics or "llm" via local Ollama. */
const AI_CFG = {
  mode: "scripted",
  model: "qwen2.5:14b",
  url: "http://localhost:11434/api/chat",
  maxActionsPerTurn: 25,
};

/* Meta-game hooks (deck builder / packs) — js/meta.js overrides these. */
const META = {
  playerDeck: () => null,   // return an array of card ids, or null for default
  aiDeck: null,             // override the AI's deck (sims/tests); default: fresh random deck each game
  onVictory(){},            // called once when the player wins
};

let state = null, uidSeq = 0;

/* ============ SETUP ============ */
function newSide(deckList){
  const deck = [...(deckList || DECKLIST)];
  for(let i = deck.length-1; i > 0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [deck[i],deck[j]] = [deck[j],deck[i]];
  }
  return {life:START_LIFE, soul:START_SOUL, soulBroken:false, essence:0, maxEss:0, deadEss:0, channel:0, deck, hero:null,
          hand:[], deadHand:[], deadFresh:0, living:[], dead:[], sits:{living:[], dead:[]}, sacrificed:false};
}

function newGame(playerHeroId){
  // the AI brings a fresh, well-distributed random deck to every game
  state = {player:newSide(META.playerDeck()), ai:newSide(META.aiDeck ? META.aiDeck() : randomDeck()),
           turn:"player", round:1, merged:false,
           winner:null, mode:null, log:[], phase: playerHeroId ? "mulligan" : "heroSelect"};
  const heroIds = Object.keys(HEROES);
  state.ai.hero = heroIds[Math.floor(Math.random()*heroIds.length)];
  draw("player",7); draw("ai",7);
  log("A new age begins. You go first (no draw on turn 1).","s");
  if(playerHeroId) state.player.hero = playerHeroId;
}

function chooseHero(id){
  if(!state || state.phase !== "heroSelect" || !HEROES[id]) return;
  state.player.hero = id;
  state.phase = "mulligan";
  const e = HEROES[state.ai.hero];
  log("You champion "+HEROES[id].name+" "+HEROES[id].title+". The enemy follows "+e.name+" "+e.title+".","s");
}

/* ---- mulligan: once, at the start, exchange any of your opening cards ---- */
function doMulligan(k, indices){
  const s = S(k);
  const tossed = [...new Set(indices)].filter(i => i >= 0 && i < s.hand.length)
    .sort((a,b) => b - a).map(i => s.hand.splice(i,1)[0]);
  if(!tossed.length) return;
  draw(k, tossed.length); // replacements first — you can't redraw what you tossed
  tossed.forEach(c => s.deck.splice(Math.floor(Math.random()*(s.deck.length+1)), 0, c));
  log(who(k)+" exchanged "+tossed.length+" card"+(tossed.length>1?"s":"")+" in the mulligan.","s");
}
function aiMulligan(){
  // simple heuristic: ship everything that costs 5+ (too slow for an opening hand)
  const idx = state.ai.hand.map((id,i) => DEFS[id].cost >= 5 ? i : -1).filter(i => i >= 0);
  doMulligan("ai", idx);
}
function confirmMulligan(indices){
  if(!state || state.phase !== "mulligan" || !state.player.hero) return;
  doMulligan("player", indices || []);
  aiMulligan();
  state.phase = "play";
  beginPlayerTurn();
}

/* Morwen's passive and enter-dead bonuses: units enter the dead field hardier.
   Oswin's toll: enemy units cross into HIS dead dimension 1 HP weaker. */
function enterDeadField(k, unit){
  const s = S(k);
  let bonus = (s.hero === "morwen" ? 1 : 0) + sumSitFx(s, "dead", "enterDeadHp");
  if(S(foe(k)).hero === "oswin") bonus -= 1;
  unit.hp = Math.max(1, unit.hp + bonus);
  unit.maxHp = Math.max(1, unit.maxHp + bonus);
  unit.atk += sumSitFx(s, "dead", "enterDeadAtk"); // Bone Forge
  s.dead.push(unit);
}

/* ============ HELPERS ============ */
const S = k => state[k];
const foe = k => k === "player" ? "ai" : "player";
const who = k => k === "player" ? "You" : "AI";
const poss = k => k === "player" ? "your" : "the AI's";
const Poss = k => k === "player" ? "Your" : "The AI's";

function log(msg, cls){
  state.log.push({msg, cls: cls || (state.turn === "player" ? "p" : "a")});
  if(state.log.length > 140) state.log.shift();
}

function draw(k, n){
  const s = S(k);
  for(let i = 0; i < (n||1); i++){
    if(!s.deck.length){ log(who(k)+" has no cards left to draw.","s"); return; }
    const c = s.deck.pop();
    if(s.hand.length >= MAX_HAND){ log(who(k)+" burned "+DEFS[c].name+" (hand full).","s"); }
    else { s.hand.push(c); FX.draw(k, c); }
  }
}

/* Every card that falls into a dead hand needs a turn to settle: it is FRESH
   (unplayable) until the start of its owner's next turn. Fresh cards are always
   the newest — the tail of the dead hand — so a single counter tracks them. */
function toDeadHand(k, cardId, uid){
  const s = S(k);
  if(s.deadHand.length >= MAX_HAND) return false;
  s.deadHand.push(cardId);
  s.deadFresh++;
  if(uid !== undefined) FX.crossOver(k, cardId, uid);
  return true;
}
const deadReady = (s, idx) => idx < s.deadHand.length - s.deadFresh;

function makeUnit(cardId, dim, asDeadFace){
  const def = DEFS[cardId], st = (dim === "dead" || asDeadFace) ? def.d : def.l;
  const u = {uid:++uidSeq, cardId, dim, atk:st[0], hp:st[1], maxHp:st[1], exhausted:true};
  if(asDeadFace) u.deadFace = true; // post-merge: dead faces fight on the one field
  if(def.power) u.pw = 0; // powered units charge ⚡ every turn they stay in play
  return u;
}
/* Post-merge, "dead" plays land on the one (living) field, keeping their dead face. */
const isDeadFaced = u => u.dim === "dead" || !!u.deadFace;

function findUnit(uid){
  for(const k of ["player","ai"]) for(const dim of ["living","dead"]){
    const u = S(k)[dim].find(u => u.uid === uid);
    if(u) return {unit:u, side:k, dim};
  }
  return null;
}

function findSit(uid){
  for(const k of ["player","ai"]) for(const dim of ["living","dead"]){
    const x = S(k).sits[dim].find(s => s.uid === uid);
    if(x) return {sit:x, side:k, dim};
  }
  return null;
}

/* Situations obey the cross-over law too: destroyed over the living dimension,
   they cross to their owner's dead zone (dead face active); destroyed dead = ash. */
function destroySituation(uid){
  const f = findSit(uid);
  if(!f) return false;
  const s = S(f.side);
  s.sits[f.dim] = s.sits[f.dim].filter(x => x.uid !== uid);
  if(f.dim === "living"){
    const def = DEFS[f.sit.cardId];
    if(toDeadHand(f.side, f.sit.cardId, uid)){
      log(def.name+" is torn down — the card slips into "+poss(f.side)+" dead hand.","s");
    } else {
      log(def.name+" is torn down and fades — the dead hand is full.","s");
    }
  } else {
    log(faceOf(f.sit.cardId, true).name+" is destroyed in the dead dimension. Ash and silence.","s");
  }
  return true;
}

/* Generic situation effects: each face carries sitFx {kind, n, charges?}.
   Auras stack across different cards; ATK never drops below 0. */
function sitFxOf(sit){ return faceOf(sit.cardId, sit.dim === "dead" || !!sit.deadFace).sitFx || null; }
function sumSitFx(side, dim, kind){
  return side.sits[dim].reduce((n,x) => { const fx = sitFxOf(x); return n + (fx && fx.kind === kind ? fx.n : 0); }, 0);
}
function atkOf(u, side){
  let n = u.atk;
  const enemySide = state && (state.player === side ? state.ai : state.player);
  if(u.dim === "dead"){
    n += sumSitFx(side, "dead", "deadAtk");
    if(enemySide) n += sumSitFx(enemySide, "dead", "foeDeadAtk");
  } else {
    n += sumSitFx(side, "living", "livingAtk");
    if(enemySide) n += sumSitFx(enemySide, "living", "foeLivingAtk");
    if(u.deadFace){ // merged field: dead-face auras keep empowering the crossed legion
      n += sumSitFx(side, "living", "deadAtk");
      if(enemySide) n += sumSitFx(enemySide, "living", "foeDeadAtk");
    }
  }
  return Math.max(0, n);
}

/* ---- unit statuses (Hex & Relic): hexes and charms live on u.st ---- */
const stOf = u => u.st || (u.st = {});
const isHollow = u => !!(u.st && u.st.hollow);
const abilityOf = u => isHollow(u) ? null : DEFS[u.cardId].ability;
const unitGuard = u => abilityOf(u) === "guard" || !!(u.st && u.st.guard);
const unitRanged = u => (!isHollow(u) && DEFS[u.cardId].ranged) || !!(u.st && u.st.ranged);
const unitLifesteal = u => (!isHollow(u) && DEFS[u.cardId].lifesteal) || !!(u.st && u.st.lifesteal);
const harvestOf = u => isHollow(u) ? 0 : (DEFS[u.cardId].harvest || 0);

/* Lifesteal: living strikes feed Life, dead strikes feed Soul (Life once shattered). */
function lifestealHeal(k, dim, n){
  const s = S(k);
  if(dim === "living" || s.soulBroken) s.life = Math.min(START_LIFE, s.life + n);
  else s.soul = Math.min(START_SOUL, s.soul + n);
  log(who(k) === "You" ? "Lifesteal feeds you "+n+"." : "Lifesteal feeds the AI "+n+".","s");
}

/* ============ CORE RULES ============ */
function finishSacrifice(k, label, cardId, kept){
  const s = S(k);
  s.sacrificed = true;
  const dest = kept ? " → dead hand." : " — nothing crosses over.";
  if(s.maxEss < ESS_CAP){
    s.maxEss++; s.essence++;
    log(who(k)+" sacrificed "+label+dest+" Essence is now "+s.maxEss+".");
  } else {
    log(who(k)+" sacrificed "+label+dest+" Essence is already at its peak.");
  }
  if(DEFS[cardId].ability === "martyr"){ draw(k,1); log("Martyr: "+(k === "player" ? "you" : "the AI")+" drew a card.","s"); }
  if(s.hero === "brann"){ // the Ashen King: every offering burns the enemy's soul
    const e = S(foe(k));
    if(e.soulBroken){ e.life -= 1; } else { e.soul -= 1; }
    FX.damage({hero:foe(k), dim:"dead"}, 1);
    log(HEROES.brann.name+"'s offering burns the enemy for 1 "+(e.soulBroken ? "Life" : "Soul")+".","s");
    checkWin();
  }
}

function sacrifice(k, handIdx){
  const s = S(k);
  if(s.sacrificed || handIdx < 0 || handIdx >= s.hand.length) return false;
  const cardId = s.hand.splice(handIdx,1)[0];
  FX.playedCard(k, cardId, false, "sacrifice");
  const kept = toDeadHand(k, cardId);
  finishSacrifice(k, DEFS[cardId].name, cardId, kept);
  return true;
}

/* The knife also reaches the board: any of your units can be the turn's offering.
   A living-face unit crosses to the dead hand; dead faces and tokens burn to nothing. */
function sacrificeUnit(k, uid){
  const s = S(k), f = findUnit(uid);
  if(s.sacrificed || !f || f.side !== k) return false;
  const def = DEFS[f.unit.cardId];
  s[f.dim] = s[f.dim].filter(x => x.uid !== uid);
  FX.playedCard(k, f.unit.cardId, isDeadFaced(f.unit), "sacrifice");
  const kept = f.dim === "living" && !f.unit.deadFace && !def.token && toDeadHand(k, f.unit.cardId, uid);
  finishSacrifice(k, unitName(f.unit), f.unit.cardId, kept);
  return true;
}

/* Skipping the sacrifice is a real choice — Corvus the Cartomancer turns it into cards. */
function forgoSacrifice(k){
  const s = S(k);
  if(s.sacrificed) return;
  s.sacrificed = true;
  if(s.hero === "corvus"){
    s.channel = Math.min(CHANNEL_CAP, s.channel + 1);
    log(HEROES.corvus.name+" reads the unspilled blood: +1 channel (now "+s.channel+").","s");
  }
}

function playCard(k, handIdx, fromDead){
  const hand = fromDead ? S(k).deadHand : S(k).hand;
  const def = DEFS[hand[handIdx]];
  if(!def) return false;
  if(def.type === "unit"){
    if(fromDead && def.deadForm === "situation") return playSituation(k, handIdx, fromDead); // its dead face is an omen
    return playUnit(k, handIdx, fromDead);
  }
  if(def.type === "situation") return playSituation(k, handIdx, fromDead);
  return false; // spells go through castSpell with a target
}

/* Essence spent on living plays crosses the veil: it becomes dead energy this turn. */
const poolOf = (s, fromDead) => fromDead ? s.deadEss : s.essence;
/* Where a play lands: dead-hand plays go to the dead field — or the ONE field after the merge. */
const dimFor = fromDead => (fromDead && !state.merged) ? "dead" : "living";
function pay(s, cost, fromDead){
  if(fromDead) s.deadEss -= cost;
  else { s.essence -= cost; s.deadEss += cost; }
}

/* Bloodprice: pays Life (living) or Soul (dead, may shatter yourself) instead of energy.
   Maelis the Bloodbound pays 1 less (minimum 1). */
function bloodCostOf(s, def){
  if(!def.blood) return 0;
  return s.hero === "maelis" ? Math.max(1, def.blood - 1) : def.blood;
}
function canPayBlood(s, def, fromDead){
  if(!def.blood) return true;
  return fromDead ? true : s.life > bloodCostOf(s, def); // never suicide outright; dead side may break its own soul
}
function payBlood(k, s, def, fromDead){
  const n = bloodCostOf(s, def);
  if(fromDead && !s.soulBroken){ s.soul -= n; log("Bloodprice: "+n+" Soul.","s"); }
  else { s.life -= n; log("Bloodprice: "+n+" Life.","s"); }
  FX.damage({hero:k, dim: fromDead ? "dead" : "living"}, n);
}

function playUnit(k, handIdx, fromDead){
  const s = S(k), hand = fromDead ? s.deadHand : s.hand;
  const cardId = hand[handIdx], def = DEFS[cardId];
  const merged = !!(state.merged && fromDead);
  const dim = dimFor(fromDead);
  const cost = def.blood ? 0 : def.cost;
  const cap = state.merged ? MERGED_FIELD_CAP : MAX_FIELD;
  if(fromDead && !deadReady(s, handIdx)) return false; // fresh in the dead hand — settles next turn
  if(cost > poolOf(s, fromDead) || s[dim].length >= cap || !canPayBlood(s, def, fromDead)) return false;
  hand.splice(handIdx,1);
  if(def.blood) payBlood(k, s, def, fromDead);
  else pay(s, cost, fromDead);
  FX.playedCard(k, cardId, fromDead, "play");
  const u = makeUnit(cardId, dim, merged);
  if(def.ability === "haste") u.exhausted = false; // haste works in either dimension
  if(dim === "living" && !merged) u.atk += sumSitFx(s, "living", "enterLivingAtk"); // Blood Forge
  if(dim === "dead") enterDeadField(k, u); else s.living.push(u);
  log(who(k)+" played "+((dim === "dead" || merged) && def.deadName ? def.deadName : def.name)+" into the "+(state.merged ? "one" : dim)+" field.");
  if(def.ability === "heal2"){
    if(dim === "living"){ s.life = Math.min(START_LIFE, s.life+2); log("Village Priest restores 2 Life.","s"); }
    else if(!s.soulBroken){ s.soul = Math.min(START_SOUL, s.soul+2); log("Heretic Shade mends 2 Soul.","s"); }
  }
  if(def.ability === "spirit"){ // the Spirit is summoned into the OTHER dimension
    const other = state.merged ? "living" : (dim === "living" ? "dead" : "living");
    if(s[other].length < (state.merged ? MERGED_FIELD_CAP : MAX_FIELD)){
      const sp = makeUnit("spirit", other, state.merged && dim === "living" ? false : state.merged);
      if(other === "dead") enterDeadField(k, sp); else s.living.push(sp);
      log((dim === "living" && !merged ? "Wraith Caller" : "Wraith Lord")+" sends a Spirit "+(state.merged ? "onto the one field" : "across the veil into the "+other+" field")+".","s");
    }
  }
  if(def.ability === "digger" || def.ability === "ferry"){
    if(def.ability === "ferry") draw(k,1);
    if(s.deck.length){
      const c = s.deck.pop();
      if(toDeadHand(k, c)) log(who(k)+"'s "+(dim === "dead" && def.deadName ? def.deadName : def.name)+" ferries "+DEFS[c].name+" into the dead hand.","s");
      else log("The dead hand is full — "+DEFS[c].name+" is lost in the crossing.","s");
    }
  }
  if(def.ability === "rats" && s[dim].length < MAX_FIELD){
    const r = makeUnit("rat", dim);
    if(dim === "dead") enterDeadField(k, r); else s.living.push(r);
    log("A Rat scurries out beside its master.","s");
  }
  if(def.ability === "twin" && dim === "living" && toDeadHand(k, cardId)){
    log(def.name+"'s reflection falls through the veil into "+poss(k)+" dead hand.","s");
  }
  if(def.ability === "consume" && dim === "dead"){
    const others = s.dead.filter(x => x.uid !== u.uid);
    if(others.length){
      const meal = others.sort((a,b) => (a.atk + a.hp) - (b.atk + b.hp))[0];
      s.dead = s.dead.filter(x => x.uid !== meal.uid);
      u.atk += meal.atk;
      log(unitName(u)+" consumes "+unitName(meal)+" and gains +"+meal.atk+" ATK.","s");
    }
  }
  /* Hex & Relic on-play hexes: they always pick the strongest enemy in their dimension */
  if(def.ability === "weaken2" || def.ability === "freezer" || def.ability === "shackler"){
    const t = [...S(foe(k))[dim]].sort((a,b) => (b.atk+b.hp)-(a.atk+a.hp))[0];
    if(t){
      if(def.ability === "weaken2"){ t.atk = Math.max(0, t.atk - 2); log(unitName(u)+" saps 2 ATK from "+unitName(t)+".","s"); }
      else if(def.ability === "freezer"){ const st0 = stOf(t); st0.frozen = Math.max(st0.frozen||0, 1); t.exhausted = true; log(unitName(u)+" freezes "+unitName(t)+" solid.","s"); }
      else { stOf(t).noHero = true; log(unitName(u)+" shackles "+unitName(t)+" — it can no longer strike heroes.","s"); }
    }
  }
  sweepDeaths(); // blood costs / consume can have consequences
  return true;
}

/* Guard: enemies must attack Guards in that dimension before anything else.
   Hollowed units stop guarding; Gravewrought Plate makes anything guard. */
const guardsOf = (k, dim) => S(k)[dim].filter(unitGuard);

function playSituation(k, handIdx, fromDead){
  const s = S(k), hand = fromDead ? s.deadHand : s.hand;
  const cardId = hand[handIdx], def = DEFS[cardId], dim = dimFor(fromDead);
  const merged = !!(state.merged && fromDead);
  const cost = def.blood ? 0 : def.cost;
  if(fromDead && !deadReady(s, handIdx)) return false; // fresh in the dead hand — settles next turn
  if(cost > poolOf(s, fromDead) || s.sits[dim].length >= MAX_SITS || !canPayBlood(s, def, fromDead)) return false;
  if(s.sits[dim].some(x => x.cardId === cardId)) return false; // situations are unique per dimension
  hand.splice(handIdx,1);
  if(def.blood) payBlood(k, s, def, fromDead);
  else pay(s, cost, fromDead);
  FX.playedCard(k, cardId, fromDead, "play");
  const sit = {uid:++uidSeq, cardId, dim};
  if(merged) sit.deadFace = true;
  s.sits[dim].push(sit);
  log(who(k)+" set "+faceOf(cardId, fromDead).name+" over the "+(state.merged ? "one field" : dim+" dimension")+".");
  if(def.blood) sweepDeaths(); // blood payment can shatter your own soul — resolve it
  return true;
}

function castSpell(k, fromDead, handIdx, target){ // target = {uid}
  const s = S(k), hand = fromDead ? s.deadHand : s.hand;
  const cardId = hand[handIdx], face = faceOf(cardId, fromDead);
  if(fromDead && !deadReady(s, handIdx)) return false; // fresh in the dead hand — settles next turn
  if(DEFS[cardId].cost > poolOf(s, fromDead)) return false;
  hand.splice(handIdx,1);
  pay(s, DEFS[cardId].cost, fromDead);
  FX.playedCard(k, cardId, fromDead, "cast");
  const t = target ? findUnit(target.uid) : null;
  const tSit = (!t && target) ? findSit(target.uid) : null;
  log(who(k)+" cast "+face.name+(t ? " on "+unitName(t.unit) : tSit ? " on "+faceOf(tSit.sit.cardId, tSit.dim === "dead").name : "")+".");
  if(cardId === "smite"){ if(t){ t.unit.hp -= 3; FX.damage({uid:t.unit.uid}, 3); } }
  else if(cardId === "cull"){
    if(fromDead){ // Enlighten: release a dead unit for good
      if(t){ s.dead = s.dead.filter(u => u.uid !== t.unit.uid); log(unitName(t.unit)+" is enlightened and passes on forever.","s"); }
    } else if(t){ t.unit.hp = 0; }
    draw(k,1);
  }
  else if(cardId === "banish"){
    if(t){
      const ts = S(t.side); // no cross-over, no death triggers, no Undying
      ts[t.dim] = ts[t.dim].filter(u => u.uid !== t.unit.uid);
      log(unitName(t.unit)+" is torn from existence. Nothing crosses over.","s");
    }
  }
  else if(cardId === "soultap"){
    const e = S(foe(k));
    if(fromDead || e.soulBroken){
      e.life -= 2; FX.damage({hero:foe(k), dim:"dead"}, 2);
      log("The tap drains 2 Life from "+who(foe(k))+".","s");
    } else {
      e.soul -= 2; FX.damage({hero:foe(k), dim:"dead"}, 2);
      log("The tap drains 2 Soul from "+who(foe(k))+".","s");
    }
  }
  else if(cardId === "requiem"){
    const dim = dimFor(fromDead);
    log("The bell tolls over the "+dim+" dimension: 2 damage to every unit there.","s");
    for(const kk of ["player","ai"]) S(kk)[dim].forEach(u => { u.hp -= 2; FX.damage({uid:u.uid}, 2); });
  }
  else if(cardId === "dispel" || (face.fx && face.fx.kind === "dispel")){
    if(tSit) destroySituation(tSit.sit.uid);
  }
  else if(face.fx){ runSpellFx(k, fromDead, face, t); }
  else if(cardId === "darkpact"){
    draw(k,2);
    if(fromDead && !s.soulBroken){ s.soul -= 2; log("The pact takes 2 Soul.","s"); }
    else { s.life -= 2; log("The pact takes 2 Life.","s"); }
    FX.damage({hero:k, dim: fromDead ? "dead" : "living"}, 2);
  }
  else if(cardId === "surge"){
    if(fromDead){ s.deadEss += 2; log("Grave energy wells up: +2 dead energy.","s"); }
    else { s.essence += 2; log("Essence surges: +2 this turn.","s"); }
  }
  else if(cardId === "mend"){
    if(fromDead && !s.soulBroken){ s.soul = Math.min(START_SOUL, s.soul + 4); log("Soul Stitch restores 4 Soul.","s"); }
    else { s.life = Math.min(START_LIFE, s.life + 4); log("4 Life restored.","s"); }
  }
  else if(cardId === "haunt"){
    if(t){
      const e = S(foe(k)), dmg = atkOf(t.unit, s);
      if(fromDead){
        if(e.soulBroken){ e.life -= dmg; } else { e.soul -= dmg; }
        FX.damage({hero:foe(k), dim:"dead"}, dmg);
        s.dead = s.dead.filter(u => u.uid !== t.unit.uid); // released — passes on
        log(unitName(t.unit)+"'s last wail rends "+who(foe(k))+" for "+dmg+", then it passes on.","s");
      } else {
        e.life -= dmg;
        FX.damage({hero:foe(k), dim:"living"}, dmg);
        t.unit.hp = 0; // dies properly — its card falls to the dead hand
        log(unitName(t.unit)+" makes a final charge for "+dmg+" damage and falls.","s");
      }
    }
  }
  if(!fromDead && face.echo && toDeadHand(k, cardId)){ // Echo: the cast reverberates across
    log(face.name+" echoes through the veil into "+poss(k)+" dead hand.","s");
  }
  sweepDeaths();
  return true;
}

function validTargets(k, cardId, fromDead){
  const face = faceOf(cardId, fromDead), me = S(k), en = S(foe(k)), out = [];
  if(face.target === "friendlyLiving") out.push(...me.living);
  else if(face.target === "anyLiving") out.push(...me.living, ...en.living);
  else if(face.target === "anyDead") out.push(...me.dead, ...en.dead);
  else if(face.target === "friendlyDeadAny") out.push(...me.dead);
  else if(face.target === "friendlyDead"){ if(me.living.length < MAX_FIELD) out.push(...me.dead); }
  else if(face.target === "situationLiving") out.push(...en.sits.living);
  else if(face.target === "situationDead") out.push(...en.sits.dead);
  else if(face.target === "enemyDead") out.push(...en.dead);
  else if(face.target === "enemyLiving") out.push(...en.living);
  return out;
}

/* Generic spell effects: face.fx = {kind, n, ...}. Novel kinds live here. */
function runSpellFx(k, fromDead, face, t){
  const s = S(k), e = S(foe(k)), fx = face.fx;
  if(fx.kind === "dmg"){ if(t){ t.unit.hp -= fx.n; FX.damage({uid:t.unit.uid}, fx.n); } }
  else if(fx.kind === "buff"){ if(t){ t.unit.atk += (fx.a||0); t.unit.hp += (fx.h||0); t.unit.maxHp += (fx.h||0);
    log(unitName(t.unit)+" gains +"+(fx.a||0)+"/+"+(fx.h||0)+".","s"); } }
  else if(fx.kind === "drainSoul"){
    if(e.soulBroken) e.life -= fx.n; else e.soul -= fx.n;
    FX.damage({hero:foe(k), dim:"dead"}, fx.n);
  }
  else if(fx.kind === "drainLife"){ e.life -= fx.n; FX.damage({hero:foe(k), dim:"living"}, fx.n); }
  else if(fx.kind === "healLife"){ s.life = Math.min(START_LIFE, s.life + fx.n); }
  else if(fx.kind === "healSoul"){
    if(s.soulBroken) s.life = Math.min(START_LIFE, s.life + fx.n);
    else s.soul = Math.min(START_SOUL, s.soul + fx.n);
  }
  else if(fx.kind === "cauterize"){ // overflow healing burns the enemy
    const healed = Math.min(fx.n, START_LIFE - s.life);
    s.life += healed;
    const over = fx.n - healed;
    if(over > 0){ e.life -= over; FX.damage({hero:foe(k), dim:"living"}, over); log("The excess light sears "+who(foe(k))+" for "+over+".","s"); }
  }
  else if(fx.kind === "draw"){
    draw(k, fx.n);
    if(fx.payLife){ s.life -= fx.payLife; FX.damage({hero:k, dim:"living"}, fx.payLife); }
    if(fx.paySoul){ if(s.soulBroken) s.life -= fx.paySoul; else s.soul -= fx.paySoul; FX.damage({hero:k, dim:"dead"}, fx.paySoul); }
  }
  else if(fx.kind === "gainEss"){ s.essence += fx.n; }
  else if(fx.kind === "gainDeadEss"){ s.deadEss += fx.n; }
  else if(fx.kind === "aoe"){
    const dim = dimFor(fromDead);
    for(const kk of ["player","ai"]) S(kk)[dim].forEach(u => { u.hp -= fx.n; FX.damage({uid:u.uid}, fx.n); });
    log("Every "+dim+" unit takes "+fx.n+".","s");
  }
  else if(fx.kind === "shift"){ // Veilshift: a friendly unit steps through to the other dimension
    if(t && t.side === k){
      if(state.merged){ // no other side left — the unit flips its face in place instead
        const nu = makeUnit(t.unit.cardId, "living", !t.unit.deadFace);
        s.living = s.living.map(x => x.uid === t.unit.uid ? nu : x);
        log("The veil is gone — "+unitName(t.unit)+" turns its other face outward and becomes "+unitName(nu)+".","s");
        return;
      }
      const other = t.dim === "living" ? "dead" : "living";
      if(other === "dead" ? s.dead.length < MAX_FIELD : s.living.length < MAX_FIELD){
        s[t.dim] = s[t.dim].filter(x => x.uid !== t.unit.uid);
        const shifted = makeUnit(t.unit.cardId, other);
        if(other === "dead") enterDeadField(k, shifted); else s.living.push(shifted);
        log(unitName(t.unit)+" steps through the veil and becomes "+unitName(shifted)+".","s");
      } else log("The other side is full — nothing happens.","s");
    }
  }
  else if(fx.kind === "gamble"){ // reveal the top card
    if(s.deck.length){
      const c = s.deck.pop(), cd = DEFS[c], dim = dimFor(fromDead);
      const cap = state.merged ? MERGED_FIELD_CAP : MAX_FIELD;
      if(cd.type === "unit" && !(fromDead && cd.deadForm === "situation") && s[dim].length < cap){
        const u2 = makeUnit(c, dim, state.merged && fromDead);
        if(dim === "dead") enterDeadField(k, u2); else s.living.push(u2);
        log("The gamble pays off: "+unitName(u2)+" storms in, free.","s");
      } else if(toDeadHand(k, c)){
        log("The gamble reveals "+cd.name+" — it slips into the dead hand.","s");
      } else {
        log("The gamble reveals "+cd.name+" — but the dead hand is full, and it is lost.","s");
      }
    }
  }
  /* ---- Hex & Relic: hexes on enemies ---- */
  else if(fx.kind === "freeze"){
    if(t){ const st0 = stOf(t.unit); st0.frozen = Math.max(st0.frozen||0, fx.n); t.unit.exhausted = true;
      log(unitName(t.unit)+" is frozen for "+fx.n+" turn"+(fx.n>1?"s":"")+".","s"); }
  }
  else if(fx.kind === "freezeAll"){
    const dim = dimFor(fromDead);
    e[dim].forEach(u => { const st0 = stOf(u); st0.frozen = Math.max(st0.frozen||0, fx.n); u.exhausted = true; });
    log("Winter takes the whole "+dim+" field — every enemy unit there is frozen.","s");
  }
  else if(fx.kind === "blight"){
    if(t){ const st0 = stOf(t.unit); st0.blight = (st0.blight||0) + fx.n;
      log(unitName(t.unit)+" is blighted — it will fester for "+st0.blight+" each turn.","s"); }
  }
  else if(fx.kind === "weaken"){
    if(t){ t.unit.atk = Math.max(0, t.unit.atk - fx.n); log(unitName(t.unit)+" loses "+fx.n+" ATK.","s"); }
  }
  else if(fx.kind === "hollow"){
    if(t){ const st0 = stOf(t.unit); st0.hollow = true;
      st0.guard = st0.ranged = st0.lifesteal = st0.doubleStrike = false;
      log(unitName(t.unit)+" is hollowed — every gift and ability, gone.","s"); }
  }
  else if(fx.kind === "shackle"){
    if(t){ stOf(t.unit).noHero = true; log(unitName(t.unit)+" is shackled — it can no longer strike heroes.","s"); }
  }
  else if(fx.kind === "markdoom"){
    if(t){ stOf(t.unit).doom = fx.t; log("The Reaper marks "+unitName(t.unit)+": "+fx.t+" turns to live.","s"); }
  }
  else if(fx.kind === "transform"){
    if(t){
      const ts = S(t.side);
      const nu = makeUnit(fx.into, t.dim);
      ts[t.dim] = ts[t.dim].map(x => x.uid === t.unit.uid ? nu : x);
      log(unitName(t.unit)+" is transformed into a "+unitName(nu)+"!","s");
    }
  }
  else if(fx.kind === "betray"){
    if(t){
      const ts = S(t.side);
      const victim = ts[t.dim].filter(x => x.uid !== t.unit.uid).sort((a,b) => (a.atk+a.hp)-(b.atk+b.hp))[0];
      const pow = atkOf(t.unit, ts);
      if(victim && pow > 0){
        victim.hp -= pow; FX.damage({uid:victim.uid}, pow);
        log(unitName(t.unit)+" hears the whisper and turns on "+unitName(victim)+" for "+pow+"!","s");
      } else log("The whisper finds no one to betray — it fizzles.","s");
    }
  }
  else if(fx.kind === "bounce"){
    if(t){
      const ts = S(t.side);
      ts[t.dim] = ts[t.dim].filter(x => x.uid !== t.unit.uid);
      const kept = t.dim === "living"
        ? (ts.hand.length < MAX_HAND && ts.hand.push(t.unit.cardId))
        : toDeadHand(t.side, t.unit.cardId);
      if(kept) log(unitName(t.unit)+" is blown back into "+poss(t.side)+" "+(t.dim === "living" ? "hand" : "dead hand")+".","s");
      else log(unitName(t.unit)+" is blown away — and lost, the hand was full.","s");
    }
  }
  /* ---- Hex & Relic: charms on your own units ---- */
  else if(fx.kind === "grant"){
    if(t){ stOf(t.unit)[fx.what] = true; log(unitName(t.unit)+" gains "+(fx.label||fx.what)+".","s"); }
  }
  else if(fx.kind === "fortify"){
    if(t){ t.unit.hp += fx.n; t.unit.maxHp += fx.n; stOf(t.unit).guard = true;
      log(unitName(t.unit)+" is plated: +"+fx.n+" HP and Guard.","s"); }
  }
  else if(fx.kind === "ready"){
    if(t){ t.unit.exhausted = false; if(t.unit.st) t.unit.st.frozen = 0;
      log(unitName(t.unit)+" quickens — ready to act again.","s"); }
  }
  else if(fx.kind === "massReady"){
    const dim = dimFor(fromDead);
    s[dim].forEach(u => { if(!(u.st && u.st.frozen > 0)) u.exhausted = false; });
    log("A second sunrise! "+Poss(k)+" whole "+dim+" line surges forward again.","s");
  }
  /* ---- Hex & Relic: envelope-pushers ---- */
  else if(fx.kind === "invert"){
    if(t){ const a0 = t.unit.atk; t.unit.atk = t.unit.hp; t.unit.hp = a0; t.unit.maxHp = Math.max(t.unit.maxHp, a0);
      log(unitName(t.unit)+"'s flesh and fury trade places: now "+t.unit.atk+"/"+t.unit.hp+".","s"); }
  }
  else if(fx.kind === "clone"){
    if(t){
      const dim = t.dim;
      if(s[dim].length < MAX_FIELD){
        const nu = makeUnit(t.unit.cardId, dim);
        if(dim === "dead") enterDeadField(k, nu); else s.living.push(nu);
        log("A mirror-image of "+unitName(t.unit)+" steps out on "+poss(k)+" side.","s");
      } else log("The mirror shows nothing — the field is full.","s");
    }
  }
  else if(fx.kind === "swap"){
    if(t && t.side === foe(k)){
      const dim = t.dim;
      const mine = [...s[dim]].sort((a,b) => (a.atk+a.hp)-(b.atk+b.hp))[0];
      if(mine){
        s[dim] = s[dim].filter(x => x.uid !== mine.uid);
        e[dim] = e[dim].filter(x => x.uid !== t.unit.uid);
        mine.exhausted = true; t.unit.exhausted = true;
        s[dim].push(t.unit); e[dim].push(mine);
        log("Souls are exchanged: "+unitName(mine)+" for "+unitName(t.unit)+"!","s");
      } else log("You have nothing to give in exchange — the pact fails.","s");
    }
  }
  else if(fx.kind === "equalize"){
    const dim = dimFor(fromDead);
    for(const kk of ["player","ai"]) S(kk)[dim].forEach(u => { u.atk = 3; u.hp = 3; u.maxHp = 3; });
    log("The Leveller speaks: every "+dim+" unit is made 3/3, no more, no less.","s");
  }
  else if(fx.kind === "stealDeadHand"){
    if(e.deadHand.length && s.deadHand.length < MAX_HAND){
      const i = Math.floor(Math.random() * e.deadHand.length);
      if(i >= e.deadHand.length - e.deadFresh) e.deadFresh--; // stole a still-fresh card
      const c = e.deadHand.splice(i, 1)[0];
      toDeadHand(k, c);
      log(who(k)+" robs the grave: "+faceOf(c, true).name+" stolen from "+poss(foe(k))+" dead hand!","s");
    } else log("The grave is empty — nothing to rob.","s");
  }
}

function attack(attackerUid, targetUid){ // targetUid null = hero
  const a = findUnit(attackerUid);
  if(!a || a.unit.exhausted) return;
  const k = a.side, enemy = S(foe(k));
  const gs = guardsOf(foe(k), a.dim);
  if(targetUid == null && gs.length) return; // a Guard blocks the way to the hero
  if(targetUid == null && a.unit.st && a.unit.st.noHero) return; // shackled: units only
  if(targetUid != null && gs.length){
    const tt = findUnit(targetUid);
    if(!tt || !unitGuard(tt.unit)) return; // must break the Guard first
  }
  let power = atkOf(a.unit, S(k));
  if(a.unit.st && a.unit.st.doubleStrike && !a.unit.st.struck){
    a.unit.st.struck = true; // Twin Strike: the first blow doesn't exhaust
  } else {
    a.unit.exhausted = true;
  }
  if(targetUid == null){
    if(a.dim === "living"){
      enemy.life -= power;
      FX.damage({hero:foe(k), dim:"living"}, power);
      log(unitName(a.unit)+" strikes "+who(foe(k))+" for "+power+" Life.");
    } else if(enemy.soulBroken){
      enemy.life -= power;
      FX.damage({hero:foe(k), dim:"dead"}, power);
      log(unitName(a.unit)+" pours through the torn veil — "+power+" damage to "+poss(foe(k))+" Life!");
    } else {
      if(S(k).hero === "vex") power++; // the Soul Reaper harvests deeper
      enemy.soul -= power;
      FX.damage({hero:foe(k), dim:"dead"}, power);
      log(unitName(a.unit)+" drains "+power+" Soul from "+who(foe(k))+".");
    }
    if(unitLifesteal(a.unit) && power > 0) lifestealHeal(k, a.dim, power);
    const wardN = sumSitFx(enemy, a.dim, "ward");
    if(wardN > 0){ // Thorn / Wailing Ward
      a.unit.hp -= wardN;
      FX.damage({uid:a.unit.uid}, wardN);
      log(Poss(foe(k))+" ward lashes back: "+wardN+" damage to "+unitName(a.unit)+".","s");
    }
  } else {
    const t = findUnit(targetUid);
    if(!t || t.side !== foe(k) || t.dim !== a.dim) return;
    t.unit.hp -= power; // attacker strikes first
    FX.damage({uid:t.unit.uid}, power);
    if(unitLifesteal(a.unit) && power > 0) lifestealHeal(k, a.dim, power);
    if(t.unit.hp > 0){
      if(unitRanged(a.unit)){
        log(unitName(a.unit)+" strikes "+unitName(t.unit)+" from afar — no retaliation.");
      } else {
        const back = atkOf(t.unit, S(t.side));
        a.unit.hp -= back;
        FX.damage({uid:a.unit.uid}, back);
        log(unitName(a.unit)+" attacks "+unitName(t.unit)+" — it survives and strikes back.");
      }
    } else {
      log(unitName(a.unit)+" slays "+unitName(t.unit)+" before it can retaliate.");
      const hv = harvestOf(a.unit);
      if(hv){ // Harvest: kills feed on the enemy's Soul
        if(enemy.soulBroken) enemy.life -= hv; else enemy.soul -= hv;
        FX.damage({hero:foe(k), dim:"dead"}, hv);
        log(unitName(a.unit)+" harvests "+hv+" "+(enemy.soulBroken ? "Life" : "Soul")+" from the kill.","s");
      }
    }
  }
  sweepDeaths();
}

function sweepDeaths(){
  let again = true;
  while(again){
    again = false;
    for(const k of ["player","ai"]){
      const s = S(k);
      for(const u of [...s.living]){
        if(u.hp <= 0){ handleLivingDeath(k,u); again = true; }
      }
      for(const u of [...s.dead]){
        if(u.hp <= 0){
          s.dead = s.dead.filter(x => x.uid !== u.uid);
          again = true; // burst effects below can cascade — re-sweep
          const def = DEFS[u.cardId];
          const tollN = sumSitFx(s, "dead", "onDeadDestroyDrain");
          if(tollN > 0){
            const e = S(foe(k));
            if(e.soulBroken) e.life -= tollN; else e.soul -= tollN;
            FX.damage({hero:foe(k), dim:"dead"}, tollN);
            log(Poss(k)+" toll exacts its price: "+tollN+" "+(e.soulBroken ? "Life" : "Soul")+".","s");
          }
          if(abilityOf(u) === "plague"){
            log("Hollow Bearer bursts: 1 damage to all enemy dead units.","s");
            S(foe(k)).dead.forEach(x => x.hp -= 1);
          }
          if(abilityOf(u) === "undying" && toDeadHand(k, u.cardId)){
            log(def.deadName+" refuses even this death and returns to "+poss(k)+" dead hand!","s");
          } else {
            log(unitName(u)+" is destroyed in the dead dimension. Ash and silence.","s");
          }
        }
      }
    }
  }
  checkWin();
}

function handleLivingDeath(k, u){
  const s = S(k), def = DEFS[u.cardId];
  s.living = s.living.filter(x => x.uid !== u.uid);
  const siphonN = sumSitFx(s, "living", "onLivingDeathLife");
  if(siphonN > 0){
    s.life = Math.min(START_LIFE, s.life + siphonN);
    log(Poss(k)+" siphon draws "+siphonN+" Life from the passing.","s");
  }
  if(abilityOf(u) === "plague"){
    log("Plague Bearer bursts: 1 damage to all enemy living units.","s");
    S(foe(k)).living.forEach(x => x.hp -= 1);
  }
  // Death is never an auto-play: the card falls into its owner's DEAD HAND,
  // to be deployed later with dead energy. (Undying refuses and goes back living.)
  if(abilityOf(u) === "undying" && !u.deadFace && s.hand.length < MAX_HAND){
    s.hand.push(u.cardId);
    log(def.name+" refuses death and returns to "+poss(k)+" hand!","s");
  } else if(abilityOf(u) === "undying" && u.deadFace && toDeadHand(k, u.cardId)){
    log((def.deadName || def.name)+" refuses even this death and returns to "+poss(k)+" dead hand!","s");
  } else if(!def.token && toDeadHand(k, u.cardId, u.uid)){
    log(def.name+" dies — "+(def.deadForm === "situation" ? "its omen" : def.deadName)+" waits in "+poss(k)+" dead hand.","s");
  } else if(!def.token){
    log(def.name+" fades away — the dead hand is full.","s");
  } else {
    log(def.name+" fades away.","s");
  }
}

/* THE TEAR: when a soul shatters, the dimensions collapse into ONE battlefield.
   The loser forfeits EVERYTHING in the dead (field, situations, dead hand).
   The winner keeps it all — their dead legion marches onto the one field,
   still wearing its dead faces, and their omens follow. */
function tearVeil(loserK){
  const l = S(loserK), w = S(foe(loserK));
  const lostUnits = l.dead.length, lostSits = l.sits.dead.length, lostHand = l.deadHand.length;
  l.dead = []; l.sits.dead = []; l.deadHand = []; l.deadFresh = 0;
  log("The tear devours "+poss(loserK)+" side of the dead: "+lostUnits+" unit(s), "+lostSits+" omen(s) and "+lostHand+" dead-hand card(s) — gone.","s");
  if(!state.merged){
    state.merged = true;
    w.dead.forEach(u => { u.dim = "living"; u.deadFace = true; w.living.push(u); });
    w.dead = [];
    w.sits.dead.forEach(x => { x.dim = "living"; x.deadFace = true; w.sits.living.push(x); });
    w.sits.dead = [];
    log("🌌 THE DIMENSIONS COLLAPSE INTO ONE FIELD — "+poss(foe(loserK))+" dead legion pours through and keeps fighting!","s");
  }
}

function checkWin(){
  if(state.winner) return;
  // Soul 0 doesn't end the game — it tears the veil and merges the battlefield.
  for(const k of ["player","ai"]){
    const s = S(k);
    if(!s.soulBroken && s.soul <= 0){
      s.soul = 0; s.soulBroken = true;
      log("💀 "+(k === "player" ? "Your Soul is SHATTERED" : "The AI's Soul is SHATTERED")+"! The veil tears apart.","s");
      FX.shatter(k);
      tearVeil(k);
    }
  }
  const p = state.player, a = state.ai;
  if(a.life <= 0){
    state.winner = "VICTORY";
    state.winWhy = a.soulBroken ? "With their Soul shattered, the dead dragged them down. Total conquest." : "You extinguished the enemy's Life.";
    META.onVictory();
  }
  else if(p.life <= 0){ state.winner = "DEFEAT"; state.winWhy = p.soulBroken ? "Your shattered Soul let the dead pour through. Nothing remains." : "Your Life was extinguished."; }
}

/* ============ HERO POWERS ============
   Channeled abilities: each hero banks 1 Energy per turn and unleashes it. */
function canUsePower(k){
  const s = S(k), pw = s.hero && HEROES[s.hero].power;
  return !!pw && !state.winner && state.turn === k && state.phase === "play" && s.channel >= pw.cost;
}
function powerTargets(k){ // only Veilstep is targeted: friendly units with room on the other side
  const s = S(k);
  if(!s.hero || !HEROES[s.hero].power.targeted) return [];
  if(state.merged) return [...s.living]; // post-merge Veilstep flips a unit's face in place
  const out = [];
  if(s.dead.length < MAX_FIELD) out.push(...s.living);
  if(s.living.length < MAX_FIELD) out.push(...s.dead);
  return out;
}
function usePower(k, target){ // target = {uid} for targeted powers
  if(!canUsePower(k)) return false;
  const s = S(k), e = S(foe(k)), pw = HEROES[s.hero].power;
  if(s.hero === "sylvara"){
    const t = target && findUnit(target.uid);
    if(!t || t.side !== k || !powerTargets(k).some(u => u.uid === t.unit.uid)) return false;
    s.channel -= pw.cost;
    if(state.merged){ // no other side — flip the unit's face in place
      const nu = makeUnit(t.unit.cardId, "living", !t.unit.deadFace);
      s.living = s.living.map(x => x.uid === t.unit.uid ? nu : x);
      log(HEROES.sylvara.name+" turns "+unitName(t.unit)+" inside-out: it becomes "+unitName(nu)+".","s");
    } else {
      const other = t.dim === "living" ? "dead" : "living";
      s[t.dim] = s[t.dim].filter(x => x.uid !== t.unit.uid);
      const shifted = makeUnit(t.unit.cardId, other);
      if(other === "dead") enterDeadField(k, shifted); else s.living.push(shifted);
      log(HEROES.sylvara.name+" parts the veil: "+unitName(t.unit)+" steps through and becomes "+unitName(shifted)+".","s");
    }
  }
  else if(s.hero === "alder"){
    s.channel -= pw.cost;
    const healed = Math.min(3, START_LIFE - s.life);
    s.life += healed;
    const over = 3 - healed;
    if(over > 0 && !s.soulBroken) s.soul = Math.min(START_SOUL, s.soul + over);
    log(HEROES.alder.name+"'s aegis restores "+healed+" Life"+(over > 0 && !s.soulBroken ? " and "+over+" Soul" : "")+".","s");
  }
  else if(s.hero === "morwen"){
    if(!s.deck.length || s.deadHand.length >= MAX_HAND) return false;
    s.channel -= pw.cost;
    const c = s.deck.pop();
    toDeadHand(k, c);
    s.deadEss += 1;
    log(HEROES.morwen.name+" beckons: "+DEFS[c].name+" slips into "+poss(k)+" dead hand, and grave energy stirs (+1).","s");
  }
  else if(s.hero === "vex"){
    s.channel -= pw.cost;
    if(e.soulBroken){ e.life -= 3; } else { e.soul -= 3; }
    FX.damage({hero:foe(k), dim:"dead"}, 3);
    log(HEROES.vex.name+" reaps 3 "+(e.soulBroken ? "Life" : "Soul")+" from "+who(foe(k))+".","s");
  }
  else if(s.hero === "brann"){
    s.channel -= pw.cost;
    log(HEROES.brann.name+"'s cinderstorm scours every enemy unit for 1.","s");
    for(const dim of ["living","dead"]) e[dim].forEach(u => { u.hp -= 1; FX.damage({uid:u.uid}, 1); });
  }
  else if(s.hero === "corvus"){
    s.channel -= pw.cost;
    draw(k, 2);
    log(HEROES.corvus.name+" reads two cards ahead.","s");
  }
  else if(s.hero === "maelis"){
    if(s.life <= 2) return false;
    s.channel -= pw.cost;
    s.life -= 2;
    s.essence += 3;
    FX.damage({hero:k, dim:"living"}, 2);
    log(HEROES.maelis.name+" transfuses 2 Life into 3 Essence.","s");
  }
  else if(s.hero === "oswin"){
    s.channel -= pw.cost;
    log(HEROES.oswin.name+"'s bell tolls over the dead: 1 damage to every dead unit.","s");
    for(const kk of ["player","ai"]) S(kk).dead.forEach(u => { u.hp -= 1; FX.damage({uid:u.uid}, 1); });
  }
  else return false;
  FX.banner(pw.name);
  sweepDeaths();
  return true;
}

/* ============ UNIT POWERS ============
   Some units carry a spell of their own: they charge ⚡1 at each of their
   owner's turn starts and unleash it when full. Hollowing silences them. */
function canUseUnitPower(k, uid){
  const f = findUnit(uid);
  if(!f || f.side !== k || state.turn !== k || state.winner || state.phase !== "play") return false;
  const pw = DEFS[f.unit.cardId].power;
  return !!pw && !isHollow(f.unit) && (f.unit.pw || 0) >= pw.cost && !(f.unit.st && f.unit.st.frozen > 0);
}
function useUnitPower(k, uid){
  if(!canUseUnitPower(k, uid)) return false;
  const f = findUnit(uid), u = f.unit, pw = DEFS[u.cardId].power;
  const s = S(k), e = S(foe(k)), dim = u.dim;
  if(!["boltFoe","drainSoul","draw","stormFoes","rallyAllies"].includes(pw.kind)) return false;
  u.pw -= pw.cost;
  const strongestFoe = () => [...e[dim]].sort((a,b) => (b.atk+b.hp)-(a.atk+a.hp))[0];
  if(pw.kind === "boltFoe"){
    const t = strongestFoe();
    if(t){ t.hp -= pw.n; FX.damage({uid:t.uid}, pw.n); log(unitName(u)+"'s "+pw.name+" scorches "+unitName(t)+" for "+pw.n+".","s"); }
    else { const eh = e; if(dim === "living" || eh.soulBroken){ eh.life -= pw.n; } else { eh.soul -= pw.n; }
      FX.damage({hero:foe(k), dim}, pw.n); log(unitName(u)+"'s "+pw.name+" finds no unit — it strikes "+who(foe(k))+" for "+pw.n+".","s"); }
  }
  else if(pw.kind === "drainSoul"){
    if(e.soulBroken) e.life -= pw.n; else e.soul -= pw.n;
    FX.damage({hero:foe(k), dim:"dead"}, pw.n);
    log(unitName(u)+"'s "+pw.name+" drains "+pw.n+" "+(e.soulBroken ? "Life" : "Soul")+".","s");
  }
  else if(pw.kind === "draw"){ draw(k, pw.n); log(unitName(u)+"'s "+pw.name+": "+(k === "player" ? "you draw" : "the AI draws")+" "+pw.n+".","s"); }
  else if(pw.kind === "stormFoes"){
    log(unitName(u)+" calls down "+pw.name+": "+pw.n+" damage to every enemy unit!","s");
    for(const d2 of ["living","dead"]) e[d2].forEach(x => { x.hp -= pw.n; FX.damage({uid:x.uid}, pw.n); });
  }
  else if(pw.kind === "rallyAllies"){
    s[dim].forEach(x => { if(x.uid !== u.uid) x.atk += pw.n; });
    log(unitName(u)+"'s "+pw.name+" rallies its side: +"+pw.n+" ATK to the others.","s");
  }
  else return false;
  FX.banner(pw.name);
  sweepDeaths();
  return true;
}

function startTurn(k){
  const s = S(k), e = S(foe(k));
  s.sacrificed = false;
  s.deadFresh = 0; // everything in the dead hand has settled — playable from now on
  s.essence = s.maxEss;
  s.deadEss = 0; // dead energy only flows from essence spent on living plays this turn
  s.channel = Math.min(CHANNEL_CAP, s.channel + 1); // the hero channels 1 Energy every turn
  if(s.hero === "sylvara"){ s.deadEss += 1; } // the Veilwalker always has a foot on the other side
  /* wake units; tick hexes (blight, doom marks, frost) and charge unit powers */
  for(const dim of ["living","dead"]) for(const u of [...s[dim]]){
    if(u.pw != null && DEFS[u.cardId].power) u.pw = Math.min(DEFS[u.cardId].power.cost, u.pw + 1);
    if(u.st){
      u.st.struck = false;
      if(u.st.blight){
        u.hp -= u.st.blight; FX.damage({uid:u.uid}, u.st.blight);
        log(unitName(u)+" festers: "+u.st.blight+" blight damage.","s");
      }
      if(u.st.doom != null){
        u.st.doom--;
        if(u.st.doom <= 0){ u.hp = 0; log("☠ The Reaper's mark claims "+unitName(u)+".","s"); }
        else log("The Reaper's mark on "+unitName(u)+" darkens ("+u.st.doom+" turn"+(u.st.doom>1?"s":"")+" left).","s");
      }
      if(u.st.frozen > 0){ u.st.frozen--; u.exhausted = true; continue; }
    }
    u.exhausted = false;
  }
  /* generic start-of-turn situation effects (both zones), incl. doom knells & charges */
  let extraDraw = 0;
  for(const dim of ["living","dead"]){
    for(const sit of [...s.sits[dim]]){
      const fx = sitFxOf(sit);
      if(!fx) continue;
      const face = faceOf(sit.cardId, dim === "dead");
      if(fx.kind === "turnDraw") extraDraw += fx.n;
      else if(fx.kind === "turnLife"){ s.life = Math.min(START_LIFE, s.life + fx.n); log(Poss(k)+" "+face.name+" restores "+fx.n+" Life.","s"); }
      else if(fx.kind === "turnSoul"){
        if(s.soulBroken) s.life = Math.min(START_LIFE, s.life + fx.n);
        else s.soul = Math.min(START_SOUL, s.soul + fx.n);
        log(Poss(k)+" "+face.name+" glimmers: +"+fx.n+" "+(s.soulBroken ? "Life" : "Soul")+".","s");
      }
      else if(fx.kind === "turnEss") s.essence += fx.n;
      else if(fx.kind === "turnDeadEss") s.deadEss += fx.n;
      else if(fx.kind === "turnDrain"){
        if(e.soulBroken){ e.life -= fx.n; } else { e.soul -= fx.n; }
        FX.damage({hero:foe(k), dim:"dead"}, fx.n);
        log(Poss(k)+" "+face.name+" saps "+fx.n+" "+(e.soulBroken ? "Life" : "Soul")+".","s");
      }
      else if(fx.kind === "turnStingFoe"){
        const t = [...e[dim]].sort((a,b) => (b.atk+b.hp)-(a.atk+a.hp))[0];
        if(t){ t.hp -= fx.n; FX.damage({uid:t.uid}, fx.n); log(Poss(k)+" "+face.name+" stings "+unitName(t)+" for "+fx.n+".","s"); }
      }
      else if(fx.kind === "turnWeakenFoe"){
        const t = [...e[dim]].filter(u => u.atk > 0).sort((a,b) => b.atk-a.atk)[0];
        if(t){ t.atk = Math.max(0, t.atk - fx.n); log(Poss(k)+" "+face.name+" saps "+fx.n+" ATK from "+unitName(t)+".","s"); }
      }
      else if(fx.kind === "doom"){
        sit.n = (sit.n || 0) + 1;
        if(sit.n >= fx.n){
          log("🔔 "+face.name+" tolls its last — every "+dim+" unit perishes!","s");
          for(const kk of ["player","ai"]) S(kk)[dim].forEach(u => { u.hp = 0; });
          s.sits[dim] = s.sits[dim].filter(x => x.uid !== sit.uid);
        } else {
          log(face.name+" tolls... ("+sit.n+"/"+fx.n+")","s");
        }
      }
      if(fx.charges != null){ // limited-use situations burn out
        sit.c = (sit.c == null ? fx.charges : sit.c) - 1;
        if(sit.c <= 0){
          s.sits[dim] = s.sits[dim].filter(x => x.uid !== sit.uid);
          log(Poss(k)+" "+face.name+" is spent and crumbles.","s");
        }
      }
    }
  }
  if(!(state.round === 1 && k === "player")) draw(k, 1 + extraDraw);
  else if(extraDraw) draw(k, extraDraw);
  if(s.hero === "alder"){ // the Lifewarden endures
    s.life = Math.min(START_LIFE, s.life+1);
    log(HEROES.alder.name+" mends "+(k === "player" ? "your" : "his")+" wounds: +1 Life.","s");
  }
  sweepDeaths();
  checkWin();
}

function beginPlayerTurn(){
  state.turn = "player";
  startTurn("player");
  FX.banner("Your Turn");
  const p = state.player;
  if((p.hand.length || p.living.length || p.dead.length) && !state.winner){
    state.mode = {type:"sacrificePrompt"};
    FX.hint("Sacrifice a hand card or one of your units (+1 Essence) — or skip.");
  } else {
    forgoSacrifice("player");
    state.mode = null;
  }
}

function skipSacrifice(){
  if(state.turn !== "player" || state.winner) return;
  if(state.mode && state.mode.type === "sacrificePrompt"){
    state.mode = null; FX.hint("");
    log("You forgo the sacrifice this turn.");
    forgoSacrifice("player");
    FX.render();
  }
}

function playerEndTurn(){
  if(state.turn !== "player" || state.winner) return;
  if(state.mode && state.mode.type === "sacrificePrompt"){
    log("You forgo the sacrifice this turn.");
    forgoSacrifice("player");
  }
  state.mode = null; FX.hint("");
  state.turn = "ai";
  startTurn("ai");
  FX.banner("Enemy's Turn");
  FX.render();
  aiTurn();
}

/* ============ AI ============ */
const lsum = id => DEFS[id].l ? DEFS[id].l[0]+DEFS[id].l[1] : 0;
const dsum = id => DEFS[id].d ? DEFS[id].d[0]+DEFS[id].d[1] : 0;
const usum = u => u.atk + u.hp;

async function aiTurn(){
  try {
    if(AI_CFG.mode === "llm") await aiTurnLLM();
    else await aiTurnScripted();
  } catch(err){
    log("AI error ("+(err && err.message || err)+") — finishing turn with scripted logic.","s");
    try { await aiTurnScripted(); } catch(e){ /* never wedge the game */ }
  }
  if(state.winner){ FX.render(); return; }
  state.round++;
  log("— Round "+state.round+" — your turn.","s");
  beginPlayerTurn();
  FX.render();
}

/* ---- scripted heuristics (side-parametric: also drives self-play balance sims) ---- */
function scriptedSacrifice(k = "ai"){
  const s = S(k);
  if(s.sacrificed || !s.hand.length) return false;
  if(!(s.maxEss < 7 || s.hand.length >= 6)) { forgoSacrifice(k); return false; }
  let best = 0, bestScore = -99;
  s.hand.forEach((id,i) => {
    const score = DEFS[id].type === "unit" ? dsum(id) - lsum(id) : 0;
    if(score > bestScore){ bestScore = score; best = i; }
  });
  sacrifice(k, best);
  return true;
}

/* When and how the scripted AI unleashes its hero power. */
function scriptedPower(k = "ai"){
  if(!canUsePower(k)) return false;
  const s = S(k), p = S(foe(k));
  const h = s.hero;
  if(h === "alder") return s.life <= START_LIFE - 3 && usePower(k);
  if(h === "vex") return usePower(k);
  if(h === "morwen") return s.deck.length > 0 && s.deadHand.length < MAX_HAND && usePower(k);
  if(h === "corvus") return s.hand.length <= 4 && usePower(k);
  if(h === "maelis") return s.life > 8 && usePower(k);
  if(h === "brann"){
    const hits = p.living.length + p.dead.length;
    const kills = p.living.filter(u => u.hp <= 1).length + p.dead.filter(u => u.hp <= 1).length;
    return (kills >= 1 || hits >= 3) && usePower(k);
  }
  if(h === "oswin"){
    const gain = p.dead.filter(u => u.hp <= 1).length - s.dead.filter(u => u.hp <= 1).length;
    return (gain >= 1 || (p.dead.length - s.dead.length >= 3)) && usePower(k);
  }
  if(h === "sylvara"){
    const ts = powerTargets(k).filter(u => u.dim === "living"
      ? dsum(u.cardId) - lsum(u.cardId) >= 3
      : lsum(u.cardId) - dsum(u.cardId) >= 3);
    const t = ts.sort((a,b) => usum(b) - usum(a))[0];
    return t ? usePower(k, {uid:t.uid}) : false;
  }
  return false;
}

function scriptedPlayOnce(k = "ai"){
  const s = S(k), p = S(foe(k));
  const options = [];
  const sitOk = (dim, id) => s.sits[dim].length < MAX_SITS && !s.sits[dim].some(x => x.cardId === id);
  s.hand.forEach((id,i) => {
    const d = DEFS[id];
    if(d.blood ? s.life <= d.blood + 5 : d.cost > s.essence) return; // don't bleed below a safety margin
    if(d.type === "unit" && s.living.length < MAX_FIELD) options.push({fromDead:false,i,prio:d.blood || d.cost});
    if(d.type === "situation" && sitOk("living", id)) options.push({fromDead:false,i,prio:(d.blood || d.cost)+2});
  });
  s.deadHand.forEach((id,i) => {
    const d = DEFS[id];
    if(!deadReady(s, i)) return; // still settling — playable next turn
    if(d.blood ? (!s.soulBroken ? false : s.life <= d.blood + 5) : d.cost > s.deadEss) return; // blood-pay soul freely, life carefully
    if(d.type === "unit"){
      if(d.deadForm === "situation"){ if(sitOk("dead", id)) options.push({fromDead:true,i,prio:d.cost+2}); }
      else if(s.dead.length < MAX_FIELD) options.push({fromDead:true,i,prio:d.cost});
    }
    if(d.type === "situation" && sitOk("dead", id)) options.push({fromDead:true,i,prio:d.cost+2});
  });
  if(options.length){
    options.sort((a,b) => b.prio - a.prio);
    return playCard(k, options[0].i, options[0].fromDead);
  }
  const trySpell = (id, pick) => {
    for(const [fromDead, hand] of [[false,s.hand],[true,s.deadHand]]){
      const i = hand.indexOf(id);
      if(i < 0 || DEFS[id].cost > poolOf(s, fromDead) || (fromDead && !deadReady(s, i))) continue;
      const t = pick(validTargets(k, id, fromDead), fromDead);
      if(t){ castSpell(k, fromDead, i, {uid:t.uid}); return true; }
    }
    return false;
  };
  const tryNoTarget = (id, cond) => {
    for(const [fromDead, hand] of [[false,s.hand],[true,s.deadHand]]){
      const i = hand.indexOf(id);
      if(i < 0 || DEFS[id].cost > poolOf(s, fromDead) || (fromDead && !deadReady(s, i))) continue;
      if(cond(fromDead)){ castSpell(k, fromDead, i, null); return true; }
    }
    return false;
  };
  /* Generic-fx spells (the Veilbound set): simple per-kind heuristics. */
  const tryFxSpells = () => {
    for(const [fromDead, hand] of [[false,s.hand],[true,s.deadHand]]){
      for(let i = 0; i < hand.length; i++){
        const id = hand[i], def = DEFS[id];
        if(def.type !== "spell" || (fromDead && !deadReady(s, i))) continue;
        const face = faceOf(id, fromDead);
        if(!face.fx) continue;
        if(def.blood ? !canPayBlood(s, def, fromDead) || (!fromDead && s.life <= def.blood + 5) : def.cost > poolOf(s, fromDead)) continue;
        const fx = face.fx;
        const ts = face.target ? validTargets(k, id, fromDead) : [];
        let t = null, go = false;
        switch(fx.kind){
          case "dmg":
            t = ts.filter(u => findUnit(u.uid) && findUnit(u.uid).side === foe(k) && u.hp <= fx.n && usum(u) >= 4).sort((a,b)=>usum(b)-usum(a))[0];
            go = !!t; break;
          case "buff":
            t = ts.filter(u => findUnit(u.uid) && findUnit(u.uid).side === k).sort((a,b)=>usum(b)-usum(a))[0];
            go = !!t; break;
          case "drainSoul": case "drainLife": go = def.cost <= 1 || p.soul <= 8 || p.soulBroken; break;
          case "healLife": case "cauterize": go = s.life <= START_LIFE - fx.n; break;
          case "healSoul": go = !s.soulBroken && s.soul <= START_SOUL - fx.n; break;
          case "draw": go = s.hand.length <= 3 && (!fx.payLife || s.life > fx.payLife + 4) && (!fx.paySoul || s.soul > fx.paySoul + 2 || s.soulBroken); break;
          case "aoe": {
            const dim = dimFor(fromDead);
            go = p[dim].filter(u => u.hp <= fx.n).length - s[dim].filter(u => u.hp <= fx.n).length >= 2;
            break;
          }
          case "shift":
            t = ts.filter(u => findUnit(u.uid) && findUnit(u.uid).side === k &&
              (fromDead ? lsum(u.cardId) - dsum(u.cardId) : dsum(u.cardId) - lsum(u.cardId)) >= 3)[0];
            go = !!t; break;
          case "gamble": go = s.deck.length > 0; break;
          case "dispel": t = ts[0]; go = !!t; break;
          /* --- Hex & Relic: hexes --- */
          case "freeze": t = ts.filter(u => !u.exhausted && usum(u) >= 5).sort((a,b)=>usum(b)-usum(a))[0]; go = !!t; break;
          case "freezeAll": {
            const dim = dimFor(fromDead);
            go = p[dim].filter(u => !u.exhausted).length >= 2; break;
          }
          case "blight": t = ts.filter(u => u.hp >= 3).sort((a,b)=>b.hp-a.hp)[0]; go = !!t; break;
          case "weaken": t = ts.filter(u => u.atk >= 3).sort((a,b)=>b.atk-a.atk)[0]; go = !!t; break;
          case "hollow": t = ts.filter(u => DEFS[u.cardId].ability || DEFS[u.cardId].ranged || DEFS[u.cardId].harvest || DEFS[u.cardId].lifesteal || DEFS[u.cardId].power).sort((a,b)=>usum(b)-usum(a))[0]; go = !!t; break;
          case "shackle": t = ts.filter(u => u.atk >= 3 && !(u.st && u.st.noHero)).sort((a,b)=>b.atk-a.atk)[0]; go = !!t; break;
          case "markdoom": t = ts.filter(u => usum(u) >= 7 && !(u.st && u.st.doom != null)).sort((a,b)=>usum(b)-usum(a))[0]; go = !!t; break;
          case "transform": t = ts.filter(u => usum(u) >= 6).sort((a,b)=>usum(b)-usum(a))[0]; go = !!t; break;
          case "betray": {
            const dim = dimFor(fromDead);
            t = p[dim].length >= 2 ? ts.filter(u => atkOf(u, p) >= 2).sort((a,b)=>atkOf(b,p)-atkOf(a,p))[0] : null;
            go = !!t; break;
          }
          case "bounce": t = ts.filter(u => usum(u) >= 6).sort((a,b)=>usum(b)-usum(a))[0]; go = !!t; break;
          /* --- Hex & Relic: charms on own units --- */
          case "grant": t = ts.filter(u => !(u.st && u.st[fx.what]) && usum(u) >= 5).sort((a,b)=>usum(b)-usum(a))[0]; go = !!t; break;
          case "fortify": t = ts.filter(u => !(u.st && u.st.guard)).sort((a,b)=>usum(b)-usum(a))[0]; go = !!t; break;
          case "ready": t = ts.filter(u => u.exhausted && atkOf(u, s) >= 3)[0]; go = !!t; break;
          case "massReady": {
            const dim = dimFor(fromDead);
            go = s[dim].filter(u => u.exhausted && atkOf(u, s) > 0).length >= 3; break;
          }
          /* --- envelope-pushers --- */
          case "invert": t = ts.filter(u => findUnit(u.uid).side === k ? u.hp - u.atk >= 2 : u.atk - u.hp >= 2).sort((a,b)=>usum(b)-usum(a))[0]; go = !!t; break;
          case "clone": t = ts.sort((a,b)=>usum(b)-usum(a))[0]; go = !!t && usum(t) >= 6; break;
          case "swap": {
            const dim = dimFor(fromDead);
            const mine = [...s[dim]].sort((a,b)=>usum(a)-usum(b))[0];
            t = mine ? ts.filter(u => usum(u) - usum(mine) >= 4).sort((a,b)=>usum(b)-usum(a))[0] : null;
            go = !!t; break;
          }
          case "equalize": {
            const dim = dimFor(fromDead);
            const mySum = s[dim].reduce((n,u)=>n+usum(u),0), foeSum = p[dim].reduce((n,u)=>n+usum(u),0);
            go = foeSum - mySum >= 8; break;
          }
          case "stealDeadHand": go = p.deadHand.length > 0 && s.deadHand.length < MAX_HAND; break;
        }
        if(go && (!face.target || t)){
          castSpell(k, fromDead, i, t ? {uid:t.uid} : null);
          return true;
        }
      }
    }
    return false;
  };
  return tryNoTarget("surge", fromDead => fromDead ? s.deadHand.length > 1 : s.hand.length > 1)
    || trySpell("dispel", ts => ts[0]) // any enemy situation is worth unraveling
    || trySpell("smite", ts => ts.filter(u => findUnit(u.uid).side === foe(k) && u.hp <= 3 && usum(u) >= 5).sort((a,b)=>usum(b)-usum(a))[0])
    || trySpell("banish", ts => ts.filter(u => findUnit(u.uid).side === foe(k) && usum(u) >= 7).sort((a,b)=>usum(b)-usum(a))[0])
    || trySpell("haunt", (ts, fromDead) => ts.filter(u => findUnit(u.uid).side === k && atkOf(u, s) >= 3 && (fromDead || u.hp <= 2)).sort((a,b)=>atkOf(b,s)-atkOf(a,s))[0])
    || tryNoTarget("darkpact", fromDead => s.hand.length <= 3 && (fromDead ? (s.soulBroken ? s.life > 10 : s.soul > 6) : s.life > 10))
    || tryNoTarget("mend", fromDead => fromDead ? (!s.soulBroken && s.soul <= START_SOUL - 4) : s.life <= START_LIFE - 4)
    || tryNoTarget("soultap", () => !p.soulBroken && p.soul <= 8 || p.soulBroken)
    || tryFxSpells()
    || tryNoTarget("requiem", fromDead => {
         const dim = dimFor(fromDead);
         const enemyHit = p[dim].filter(u => u.hp <= 2).length, ownHit = s[dim].filter(u => u.hp <= 2).length;
         return enemyHit - ownHit >= 2;
       })
    || trySpell("cull", (ts, fromDead) => fromDead
         ? (s.dead.length >= MAX_FIELD ? [...ts].sort((a,b)=>usum(a)-usum(b))[0] : null)
         : ts.filter(u => dsum(u.cardId) - lsum(u.cardId) >= 3 && s.dead.length < MAX_FIELD)[0]);
}

async function scriptedAttacks(k = "ai"){
  const s = S(k), p = S(foe(k));
  for(const dim of ["living","dead"]){
    if(state.winner) break;
    const heroHp = dim === "living" ? p.life : (p.soulBroken ? p.life : p.soul);
    const ready = () => s[dim].filter(u => !u.exhausted && atkOf(u,s) > 0);
    while(ready().length && !state.winner){
      const u = ready()[0];
      const guards = guardsOf(foe(k), dim);
      const pool = guards.length ? guards : p[dim]; // Guards must fall first
      const shackled = !!(u.st && u.st.noHero);
      if(shackled && !pool.length){ u.exhausted = true; continue; } // nothing it may strike
      const allFace = !guards.length && !shackled && ready().filter(x => !(x.st && x.st.noHero)).reduce((n,x)=>n+atkOf(x,s),0) >= heroHp;
      let targetUid = null;
      if(!allFace){
        const pow = atkOf(u,s), isRanged = unitRanged(u);
        const freeKills = pool.filter(t => pow >= t.hp && (isRanged || atkOf(t,p) < u.hp)).sort((a,b)=>usum(b)-usum(a));
        const trades = pool.filter(t => pow >= t.hp && usum(t) >= usum(u)).sort((a,b)=>usum(b)-usum(a));
        if(freeKills.length) targetUid = freeKills[0].uid;
        else if(isRanged && pool.length) targetUid = pool.sort((a,b)=>usum(b)-usum(a))[0].uid; // free chip damage
        else if(trades.length) targetUid = trades[0].uid;
        else if(guards.length) targetUid = guards.sort((a,b)=>a.hp-b.hp)[0].uid; // grind the weakest Guard
        else if(shackled) targetUid = pool.sort((a,b)=>usum(a)-usum(b))[0].uid; // must hit SOMETHING
      }
      await FX.attackAnim(u.uid, targetUid);
      attack(u.uid, targetUid);
      FX.render(); await FX.pause(950); // slow enough to actually read each strike
    }
  }
}

/* charged unit powers: fire whenever they're worth it */
function scriptedUnitPowers(k = "ai"){
  const s = S(k), p = S(foe(k));
  for(const dim of ["living","dead"]){
    for(const u of [...s[dim]]){
      if(!canUseUnitPower(k, u.uid)) continue;
      const pw = DEFS[u.cardId].power;
      const go = pw.kind === "boltFoe" ? true
        : pw.kind === "drainSoul" ? true
        : pw.kind === "draw" ? s.hand.length < MAX_HAND - 1
        : pw.kind === "stormFoes" ? (p.living.length + p.dead.length >= 2)
        : pw.kind === "rallyAllies" ? s[dim].length >= 3
        : false;
      if(go && useUnitPower(k, u.uid)) return true;
    }
  }
  return false;
}

async function aiTurnScripted(k = "ai"){
  await FX.pause(700);
  if(scriptedSacrifice(k)){ FX.render(); await FX.pause(1000); }
  // Maelis wants her Transfuse essence BEFORE spending on plays
  if(S(k).hero === "maelis" && scriptedPower(k)){ FX.render(); await FX.pause(900); }
  while(!state.winner && scriptedPlayOnce(k)){ FX.render(); await FX.pause(1050); }
  while(!state.winner && scriptedPower(k)){ FX.render(); await FX.pause(900); }
  while(!state.winner && scriptedUnitPowers(k)){ FX.render(); await FX.pause(900); }
  await scriptedAttacks(k);
  // finishers that only make sense AFTER swinging (Second Sunrise, Quicksilver)
  if(!state.winner && scriptedPlayOnce(k)){
    FX.render(); await FX.pause(900);
    await scriptedAttacks(k);
  }
}

/* ---- LLM opponent (local Ollama) ----
   Each step the model gets the rules, full state, recent history, and an
   enumerated list of legal actions; it picks one by id. Illegal is impossible. */
const LLM_RULES = `You are playing DEAD ERA, a two-dimension card game, as "ai" against "player".
RULES: Two boards: living and dead. Only Life 0 loses the game. Soul 0 = that player's soul SHATTERS permanently and enemy DEAD units attack their Life directly (huge advantage).
Each turn: you may sacrifice 1 hand card OR one of your units on the board (+1 max essence up to 10; a hand card or living unit's card goes to your dead hand). Living-hand cards cost Essence (refills to max essence each turn). DEAD-hand cards cost DEAD ENERGY: every point of essence you spend on living plays becomes dead energy this same turn (spend 3 living → 3 dead energy to use). Dead energy resets to 0 each turn, so spend living essence FIRST, then make your dead plays. Cards that newly arrive in your dead hand are FRESH: they cannot be played until your next turn. When a unit or situation dies in the living dimension, its card goes to its owner's DEAD HAND — nothing enters the dead board for free; you must pay dead energy to deploy it (it then uses its dead face/stats). Attacker strikes first: if the defender would die, it does not strike back. Units attack once per turn; only same-dimension targets or the enemy hero; Guards must be attacked first. Living attacks hit Life; dead attacks hit Soul (or Life after shatter).
Your champion channels 1 Energy per turn and can spend it on a HERO POWER (offered as a legal action when affordable) — powers can be used multiple times a turn if you banked enough channel.
STRATEGY HINTS: sacrificing units with better dead stats is deployment, not loss. Racing Soul damage to shatter early is strong. Trades where your unit kills without dying are free value. Don't hoard channel forever.`;

function llmStateSummary(){
  const sideView = k => {
    const s = S(k);
    return {
      life: s.life, soul: s.soul, soulShattered: s.soulBroken,
      essence: s.essence, maxEssence: s.maxEss, deadEnergy: s.deadEss, deckCount: s.deck.length,
      livingField: s.living.map(u => ({uid:u.uid, name:unitName(u), atk:atkOf(u,s), hp:u.hp, canAttack:!u.exhausted})),
      deadField: s.dead.map(u => ({uid:u.uid, name:unitName(u), atk:atkOf(u,s), hp:u.hp, canAttack:!u.exhausted})),
      situations: {living: s.sits.living.map(x=>DEFS[x.cardId].name), dead: s.sits.dead.map(x=>faceOf(x.cardId,true).name)},
    };
  };
  const me = sideView("ai");
  me.hand = S("ai").hand.map((id,i) => ({index:i, name:DEFS[id].name, cost:DEFS[id].cost, type:DEFS[id].type, text:DEFS[id].text}));
  me.deadHand = S("ai").deadHand.map((id,i) => ({index:i, name:faceOf(id,true).name, costsDeadEnergy:DEFS[id].cost, type:DEFS[id].type, text:faceOf(id,true).text, playableThisTurn: deadReady(S("ai"), i)}));
  const en = sideView("player");
  en.handCount = S("player").hand.length; en.deadHandCount = S("player").deadHand.length;
  const champView = k => {
    const h = HEROES[S(k).hero];
    return {name: h.name, passive: h.passive, power: h.power.name+" (cost "+h.power.cost+" channel): "+h.power.text, channel: S(k).channel};
  };
  me.champion = champView("ai");
  en.champion = champView("player");
  return {you: me, enemy: en, recentEvents: state.log.slice(-14).map(e => e.msg)};
}

function llmLegalActions(){
  const s = state.ai, acts = [];
  if(!s.sacrificed){
    s.hand.forEach((id,i) => acts.push({do:{action:"sacrifice", handIndex:i}, desc:"Sacrifice "+DEFS[id].name+" (+1 essence, it joins your dead hand)"}));
    for(const dim of ["living","dead"]) s[dim].forEach(u =>
      acts.push({do:{action:"sacrifice_unit", uid:u.uid}, desc:"Sacrifice your unit "+unitName(u)+" ("+atkOf(u,s)+"/"+u.hp+", "+dim+") — +1 essence"+(dim === "living" && !DEFS[u.cardId].token ? ", its card falls to your dead hand" : "")}));
    acts.push({do:{action:"skip_sacrifice"}, desc:"Skip sacrificing this turn"});
  }
  const addPlays = (hand, fromDead) => hand.forEach((id,i) => {
    const def = DEFS[id], cost = def.blood || def.cost;
    if(fromDead && !deadReady(s, i)) return; // still settling in the dead hand
    if(def.blood ? !canPayBlood(s, def, fromDead) || (!fromDead && s.life <= def.blood + 3) : def.cost > poolOf(s, fromDead)) return;
    const where = fromDead ? "dead" : "living";   // which HAND the card is in
    const fieldDim = dimFor(fromDead);             // which FIELD it would land on (merged-aware)
    const cap = state.merged ? MERGED_FIELD_CAP : MAX_FIELD;
    const asSituation = def.type === "situation" || (def.type === "unit" && fromDead && def.deadForm === "situation");
    if(def.type === "unit" && !asSituation && s[fieldDim].length < cap)
      acts.push({do:{action:"play", hand:where, index:i}, desc:"Play "+faceOf(id,fromDead).name+" into the "+(state.merged ? "one" : fieldDim)+" field ("+(def.blood ? "bloodprice "+def.blood : "cost "+cost)+")"});
    if(asSituation && s.sits[fieldDim].length < MAX_SITS && !s.sits[fieldDim].some(x => x.cardId === id))
      acts.push({do:{action:"play", hand:where, index:i}, desc:"Set situation "+faceOf(id,fromDead).name+" ("+faceOf(id,fromDead).text+")"});
    if(def.type === "spell"){
      const face = faceOf(id, fromDead);
      if(!face.target)
        acts.push({do:{action:"cast", hand:where, index:i, targetUid:null}, desc:"Cast "+face.name+" ("+face.text+")"});
      else validTargets("ai", id, fromDead).forEach(t => {
        const isSit = t.hp === undefined; // situation target
        const desc = isSit
          ? "Cast "+face.name+" to destroy enemy situation "+faceOf(t.cardId, t.dim === "dead").name
          : "Cast "+face.name+" on "+unitName(t)+" ("+t.atk+"/"+t.hp+", "+(findUnit(t.uid).side==="ai"?"yours":"enemy")+")";
        acts.push({do:{action:"cast", hand:where, index:i, targetUid:t.uid}, desc});
      });
    }
  });
  addPlays(s.hand, false); addPlays(s.deadHand, true);
  if(canUsePower("ai")){
    const pw = HEROES[s.hero].power;
    if(pw.targeted){
      powerTargets("ai").forEach(t => acts.push({do:{action:"power", targetUid:t.uid},
        desc:"Hero power "+pw.name+" on "+unitName(t)+" ("+t.atk+"/"+t.hp+", "+t.dim+"): "+pw.text}));
    } else {
      acts.push({do:{action:"power"}, desc:"Hero power "+pw.name+" (spends "+pw.cost+" channel): "+pw.text});
    }
  }
  for(const dim of ["living","dead"]) s[dim].forEach(u => {
    if(canUseUnitPower("ai", u.uid)){
      const pw = DEFS[u.cardId].power;
      acts.push({do:{action:"unitpower", uid:u.uid}, desc:unitName(u)+"'s charged power "+pw.name+": "+pw.text});
    }
  });
  for(const dim of ["living","dead"]){
    const guards = guardsOf("player", dim);
    s[dim].filter(u => !u.exhausted && atkOf(u,s) > 0).forEach(u => {
      const pool = guards.length ? guards : state.player[dim];
      pool.forEach(t => acts.push({do:{action:"attack", attackerUid:u.uid, targetUid:t.uid},
        desc:unitName(u)+" ("+atkOf(u,s)+"/"+u.hp+") attacks "+unitName(t)+" ("+atkOf(t,state.player)+"/"+t.hp+") in the "+dim+(guards.length ? " (Guard)" : "")}));
      if(!guards.length && !(u.st && u.st.noHero)){
        const heroDesc = dim === "living" ? "enemy Life" : (state.player.soulBroken ? "enemy Life THROUGH THE TORN VEIL" : "enemy Soul");
        acts.push({do:{action:"attack", attackerUid:u.uid, targetUid:null}, desc:unitName(u)+" ("+atkOf(u,s)+"/"+u.hp+") attacks "+heroDesc+" for "+atkOf(u,s)});
      }
    });
  }
  acts.push({do:{action:"end_turn"}, desc:"End your turn"});
  return acts;
}

async function llmPick(actions){
  const body = {
    model: AI_CFG.model, stream: false, format: "json",
    options: {temperature: 0.4},
    messages: [
      {role:"system", content: LLM_RULES + "\nRespond ONLY with JSON: {\"choice\": <number>, \"why\": \"<short reason>\"}."},
      {role:"user", content: "GAME STATE:\n" + JSON.stringify(llmStateSummary()) +
        "\n\nLEGAL ACTIONS (pick one by number):\n" +
        actions.map((a,i) => i + ": " + a.desc).join("\n")},
    ],
  };
  const res = await fetch(AI_CFG.url, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)});
  if(!res.ok) throw new Error("Ollama HTTP " + res.status);
  const data = await res.json();
  const parsed = JSON.parse(data.message.content);
  const n = Number(parsed.choice);
  if(!Number.isInteger(n) || n < 0 || n >= actions.length) throw new Error("invalid choice " + parsed.choice);
  return {action: actions[n], why: String(parsed.why || "")};
}

function llmExecute(a){
  const d = a.do;
  if(d.action === "sacrifice") return sacrifice("ai", d.handIndex);
  if(d.action === "sacrifice_unit") return sacrificeUnit("ai", d.uid);
  if(d.action === "skip_sacrifice"){ log("AI forgoes the sacrifice.","a"); forgoSacrifice("ai"); return true; }
  if(d.action === "play") return playCard("ai", d.index, d.hand === "dead");
  if(d.action === "cast") return castSpell("ai", d.hand === "dead", d.index, {uid:d.targetUid});
  if(d.action === "power") return usePower("ai", d.targetUid != null ? {uid:d.targetUid} : null);
  if(d.action === "unitpower") return useUnitPower("ai", d.uid);
  if(d.action === "attack") return true; // handled with animation by caller
  return false;
}

async function aiTurnLLM(){
  let failures = 0;
  for(let step = 0; step < AI_CFG.maxActionsPerTurn && !state.winner; step++){
    const actions = llmLegalActions();
    if(actions.length === 1) break; // only end_turn left
    let pick;
    try { pick = await llmPick(actions); }
    catch(err){
      failures++;
      log("LLM opponent hiccup ("+(err && err.message || err)+")"+(failures >= 2 ? " — falling back to scripted play." : ", retrying."),"s");
      if(failures >= 2){ await aiTurnScripted(); return; }
      continue;
    }
    failures = 0;
    if(pick.why) log("AI thinks: "+pick.why.slice(0,120),"a");
    if(pick.action.do.action === "end_turn") break;
    if(pick.action.do.action === "attack"){
      await FX.attackAnim(pick.action.do.attackerUid, pick.action.do.targetUid);
      attack(pick.action.do.attackerUid, pick.action.do.targetUid);
    } else {
      llmExecute(pick.action);
    }
    sweepDeaths();
    FX.render(); await FX.pause(300);
  }
}
