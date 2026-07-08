"use strict";
/* ============ MULTIPLAYER ORCHESTRATION (server-side only) ============
   This file is concatenated AFTER js/cards.js + js/game.js + the sets inside
   a factory function (see server/server.js). It drives the side-parametric
   engine for two human players: internal side "player" = the room creator,
   internal side "ai" = the joiner. Each viewer gets a perspective-swapped,
   redacted copy of the state, so the existing UI works unchanged. */

/* ---- FX capture: engine effects become a broadcastable event list ---- */
let __events = [];
FX.damage    = (ref, amount) => __events.push({fn:"damage", ref, amount});
FX.draw      = (k, cardId) => __events.push({fn:"draw", k, cardId});
FX.crossOver = (k, cardId, uid) => __events.push({fn:"crossOver", k, cardId, uid});
FX.playedCard= (k, cardId, fromDead, kind) => __events.push({fn:"playedCard", k, cardId, fromDead:!!fromDead, kind});
FX.banner    = text => __events.push({fn:"banner", text});
FX.shatter   = k => __events.push({fn:"shatter", k});
function mpTakeEvents(){ const e = __events; __events = []; return e; }

/* ---- game flow ---- */
function mpNewGame(){
  /* delegate to the engine's newGame so state shape, opening-hand size and
     future balance changes stay in sync; multiplayer is random decks only */
  const saved = META.playerDeck;
  META.playerDeck = () => randomDeck();
  newGame();
  META.playerDeck = saved;
  state.ai.hero = null;          // both seats are humans — everyone picks
  state.phase = "heroSelect";
  state.log = [];
  state.mp = {mulliganed:{player:false, ai:false}};
  __events = []; // opening draws are covered by the initial full-state render
  log("A new age begins. "+NAMES.player+" goes first (no draw on turn 1).","s");
}

function mpChooseHero(k, id){
  if(!state || state.phase !== "heroSelect" || !HEROES[id] || S(k).hero) return false;
  S(k).hero = id;
  log(who(k)+" champions "+HEROES[id].name+" "+HEROES[id].title+".","s");
  if(state.player.hero && state.ai.hero) state.phase = "mulligan";
  return true;
}

function mpMulligan(k, indices){
  if(!state || state.phase !== "mulligan" || state.mp.mulliganed[k]) return false;
  doMulligan(k, indices || []);
  state.mp.mulliganed[k] = true;
  if(state.mp.mulliganed.player && state.mp.mulliganed.ai){
    state.phase = "play";
    mpBeginTurn("player");
  }
  return true;
}

function mpBeginTurn(k){
  state.turn = k;
  startTurn(k);
  __events.push({fn:"turnBanner", k});
  if(state.winner){ state.mode = null; return; }
  if(S(k).hand.length) state.mode = {type:"sacrificePrompt"};
  else { forgoSacrifice(k); state.mode = null; }
}

function mpEndTurn(k){
  if(state.turn !== k || state.phase !== "play" || state.winner) return false;
  if(state.mode && state.mode.type === "sacrificePrompt"){
    log(who(k)+" forgoes the sacrifice this turn.");
    forgoSacrifice(k);
  }
  state.mode = null;
  const next = foe(k);
  if(next === "player"){ state.round++; log("— Round "+state.round+" —","s"); }
  mpBeginTurn(next);
  return true;
}

function mpSkipSacrifice(k){
  if(state.turn !== k || state.winner || !(state.mode && state.mode.type === "sacrificePrompt")) return false;
  state.mode = null;
  log(who(k)+" forgoes the sacrifice this turn.");
  forgoSacrifice(k);
  return true;
}

function mpSacrifice(k, idx){
  if(state.turn !== k || state.winner || !(state.mode && state.mode.type === "sacrificePrompt")) return false;
  if(!sacrifice(k, idx)) return false;
  state.mode = null;
  return true;
}

function mpSacrificeUnit(k, uid){
  if(state.turn !== k || state.winner || !(state.mode && state.mode.type === "sacrificePrompt")) return false;
  if(typeof sacrificeUnit !== "function" || !sacrificeUnit(k, uid)) return false;
  state.mode = null;
  sweepDeaths(); // Brann's burn can have consequences
  return true;
}

/* actions allowed only on your turn, outside the sacrifice prompt */
function mpMainPhase(k){
  return state && state.phase === "play" && state.turn === k && !state.winner
      && !(state.mode && state.mode.type === "sacrificePrompt");
}

function mpPlay(k, idx, fromDead){
  if(!mpMainPhase(k)) return false;
  const hand = fromDead ? S(k).deadHand : S(k).hand;
  if(!(idx >= 0 && idx < hand.length)) return false;
  return playCard(k, idx, !!fromDead);
}

function mpCast(k, fromDead, idx, target){
  if(!mpMainPhase(k)) return false;
  const hand = fromDead ? S(k).deadHand : S(k).hand;
  if(!(idx >= 0 && idx < hand.length)) return false;
  const id = hand[idx], def = DEFS[id];
  if(!def || def.type !== "spell") return false;
  const face = faceOf(id, !!fromDead);
  if(face.target){
    if(!target || target.uid == null) return false;
    if(!validTargets(k, id, !!fromDead).some(t => t.uid === target.uid)) return false;
  } else {
    target = null;
  }
  return castSpell(k, !!fromDead, idx, target);
}

function mpAttack(k, attackerUid, targetUid){
  if(!mpMainPhase(k)) return false;
  const f = findUnit(attackerUid);
  if(!f || f.side !== k || f.unit.exhausted) return false;
  const gs = guardsOf(foe(k), f.dim);
  if(targetUid == null){
    if(gs.length || (f.unit.st && f.unit.st.noHero)) return false;
    targetUid = null;
  } else {
    const t = findUnit(targetUid);
    if(!t || t.side !== foe(k) || t.dim !== f.dim) return false;
    if(gs.length && !unitGuard(t.unit)) return false;
  }
  __events.push({fn:"attack", attackerUid, targetUid, by:k});
  attack(attackerUid, targetUid);
  return true;
}

function mpPower(k, target){
  if(!mpMainPhase(k)) return false;
  return usePower(k, target && target.uid != null ? {uid:target.uid} : null);
}

function mpUnitPower(k, uid){
  if(!mpMainPhase(k)) return false;
  return useUnitPower(k, uid);
}

function mpAction(k, a){
  if(!state || !a) return false;
  switch(a.action){
    case "chooseHero":    return mpChooseHero(k, a.hero);
    case "mulligan":      return mpMulligan(k, a.indices);
    case "sacrifice":     return mpSacrifice(k, a.idx);
    case "sacrificeUnit": return mpSacrificeUnit(k, a.uid);
    case "skipSacrifice": return mpSkipSacrifice(k);
    case "play":          return mpPlay(k, a.idx, !!a.fromDead);
    case "cast":          return mpCast(k, !!a.fromDead, a.idx, a.target);
    case "attack":        return mpAttack(k, a.attackerUid, a.targetUid == null ? null : a.targetUid);
    case "power":         return mpPower(k, a.target);
    case "unitPower":     return mpUnitPower(k, a.uid);
    case "endTurn":       return mpEndTurn(k);
    default: return false;
  }
}

/* ---- per-viewer serialization: redact hidden info, swap perspective ---- */
function mpViewFor(seatK){
  const st = JSON.parse(JSON.stringify(state));
  delete st.mp;
  st.player.deck = st.player.deck.map(() => null);
  st.ai.deck = st.ai.deck.map(() => null);
  const opp = foe(seatK);
  st[opp].hand = st[opp].hand.map(() => null);
  st[opp].deadHand = st[opp].deadHand.map(() => null);
  if(st.mode && state.turn !== seatK) st.mode = null;
  if(st.phase === "heroSelect" && st[seatK].hero) st.phase = "heroWait";
  if(st.phase === "mulligan" && state.mp.mulliganed[seatK]) st.phase = "mulliganWait";
  if(seatK === "ai"){
    const t = st.player; st.player = st.ai; st.ai = t;
    st.turn = st.turn === "player" ? "ai" : "player";
    st.log.forEach(e => { if(e.cls === "p") e.cls = "a"; else if(e.cls === "a") e.cls = "p"; });
    if(st.winner) st.winner = st.winner === "VICTORY" ? "DEFEAT" : "VICTORY";
  }
  if(st.winner){
    const loser = st.winner === "VICTORY" ? st.ai : st.player;
    st.winWhy = st.winner === "VICTORY"
      ? (loser.soulBroken ? "With their Soul shattered, the dead dragged them down. Total conquest." : "You extinguished the enemy's Life.")
      : (loser.soulBroken ? "Your shattered Soul let the dead pour through. Nothing remains." : "Your Life was extinguished.");
  }
  return st;
}

/* the factory in server.js returns this object */
const __mp = {
  newGame: mpNewGame,
  action: mpAction,
  viewFor: mpViewFor,
  takeEvents: mpTakeEvents,
  get state(){ return state; },
};
