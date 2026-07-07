"use strict";
/* ============ UI: rendering, input, animation ============ */

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let uiBusy = false;              // blocks input during animations
let prevSnaps = new Map();       // "u<uid>" -> {rect, html, dim} from last render
let pendingFloats = [];          // {ref, amount} queued by FX.damage

/* ---------- FX implementations ---------- */
FX.render = () => render();
FX.pause = ms => sleep(ms);
FX.hint = msg => hint(msg);
FX.banner = text => showBanner(text);
FX.damage = (ref, amount) => pendingFloats.push({ref, amount});
FX.shatter = k => {
  const flash = document.createElement("div");
  flash.className = "veilflash";
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 1400);
  showBanner("THE VEIL TEARS", true);
};
FX.attackAnim = async (attackerUid, targetUid) => {
  const aEl = document.querySelector(`[data-uid="${attackerUid}"]`);
  if(!aEl) return;
  let tEl = null;
  if(targetUid != null){
    tEl = document.querySelector(`[data-uid="${targetUid}"]`);
  } else {
    const f = findUnit(attackerUid);
    if(f) tEl = $("chip-" + foe(f.side) + "-" + f.dim);
  }
  if(!tEl) return;
  const a = aEl.getBoundingClientRect(), t = tEl.getBoundingClientRect();
  const dx = (t.left + t.width/2) - (a.left + a.width/2);
  const dy = (t.top + t.height/2) - (a.top + a.height/2);
  const p = aEl.cloneNode(true);
  p.classList.add("puppet");
  Object.assign(p.style, {left:a.left+"px", top:a.top+"px", width:a.width+"px", height:a.height+"px"});
  document.body.appendChild(p);
  aEl.style.visibility = "hidden";
  await p.animate(
    [{transform:"none"},{transform:`translate(${dx*0.05}px,${dy*0.05}px) scale(1.05)`,offset:.3},{transform:`translate(${dx*0.78}px,${dy*0.78}px) scale(1.08) `}],
    {duration:260, easing:"cubic-bezier(.45,0,.9,.6)"}).finished;
  tEl.classList.add("hit");
  shakeBoard();
  setTimeout(() => tEl.classList.remove("hit"), 420);
  await p.animate(
    [{transform:`translate(${dx*0.78}px,${dy*0.78}px) scale(1.08)`},{transform:"none"}],
    {duration:230, easing:"ease-out"}).finished;
  p.remove();
  aEl.style.visibility = "";
};

function shakeBoard(){
  const b = $("table");
  b.classList.remove("boardshake"); void b.offsetWidth;
  b.classList.add("boardshake");
}

/* ---------- small widgets ---------- */
let hintTimer = null;
function hint(msg){
  const h = $("hint");
  h.textContent = msg;
  h.classList.toggle("show", !!msg);
  clearTimeout(hintTimer);
  if(msg) hintTimer = setTimeout(() => h.classList.remove("show"), 3000);
}

let bannerTimer = null;
function showBanner(text, big){
  const b = $("banner");
  b.textContent = text;
  b.classList.toggle("big", !!big);
  b.classList.remove("show"); void b.offsetWidth;
  b.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove("show"), big ? 2400 : 1500);
}

function floatDamage(rect, amount){
  if(!rect) return;
  const d = document.createElement("div");
  d.className = "dmgfloat";
  d.textContent = "-" + amount;
  d.style.left = (rect.left + rect.width/2) + "px";
  d.style.top = (rect.top + rect.height*0.28) + "px";
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 1100);
}

/* ---------- element builders ---------- */
const I_ATK = `<svg class="ic" viewBox="0 0 12 12"><path d="M2.2 9.8L8.4 3.6M8.4 3.6L10.2 1.8l.4 1.6-1.8 1.8M4.4 7.6l-1.8.6-.8 1.8 1.8-.8.6-1.8" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const I_HP = `<svg class="ic" viewBox="0 0 12 12"><path d="M6 10.2C2.2 7.4 1 5.4 2.4 3.8 3.6 2.5 5.3 2.9 6 4.2c.7-1.3 2.4-1.7 3.6-.4C11 5.4 9.8 7.4 6 10.2Z" fill="currentColor"/></svg>`;
function unitEl(u, side){
  const def = DEFS[u.cardId], el = document.createElement("div");
  el.className = "unit " + (u.dim === "dead" ? "isdead" : "isliving");
  el.dataset.uid = u.uid;
  el.dataset.pvCard = u.cardId;
  el.dataset.pvDead = u.dim === "dead" ? "1" : "0";
  if(u.hp < u.maxHp) el.classList.add("hurt");
  const m = state.mode;
  if(side === "player"){
    if(u.exhausted) el.classList.add("exhausted");
    else if(state.turn === "player") el.classList.add("ready");
    if(m && m.type === "attack" && m.uid === u.uid) el.classList.add("selected");
  }
  if(m && state.turn === "player"){
    if(m.type === "spell" && validTargets("player", m.cardId, m.fromDead).some(x => x.uid === u.uid)) el.classList.add("targetable");
    if(m.type === "attack" && side === "ai" && u.dim === m.dim){
      const gs = guardsOf("ai", m.dim);
      if(!gs.length || DEFS[u.cardId].ability === "guard") el.classList.add("targetable");
    }
  }
  const sideObj = S(side);
  el.innerHTML =
    `<div class="uname">${unitName(u)}</div>
     <div class="uart">${artFor(u.cardId, u.dim === "dead")}</div>
     ${def.ability ? `<div class="utag">${def.text.split(":")[0]}</div>` : ""}
     <div class="ustats"><span class="uatk">${I_ATK}${atkOf(u, sideObj)}</span><span class="uhp">${I_HP}${u.hp}</span></div>`;
  el.onclick = () => clickUnit(u.uid);
  return el;
}

function cardEl(cardId, idx, fromDead){
  const def = DEFS[cardId], face = faceOf(cardId, fromDead);
  const el = document.createElement("div");
  el.className = "card " + (fromDead ? "cdead" : "cliving");
  el.dataset.pvCard = cardId;
  el.dataset.pvDead = fromDead ? "1" : "0";
  if(def.rarity) el.classList.add("r-" + def.rarity);
  if(window.metaFoilSet && metaFoilSet().has(cardId)) el.classList.add("foil");
  const s = state.player, m = state.mode;
  const cost = def.cost;
  const affordable = cost <= (fromDead ? s.deadEss : s.essence) && state.turn === "player";
  if(m && m.type === "sacrificePrompt" && !fromDead) el.classList.add("sacmode");
  else if(m && m.type === "spell" && m.fromDead === fromDead && m.idx === idx) el.classList.add("pendingcast");
  else if(affordable && !(m && m.type === "sacrificePrompt")) el.classList.add("playable");
  else el.classList.add("unplayable");
  const omen = def.type === "unit" && def.deadForm === "situation";
  const dispName = (def.type === "unit" && fromDead && def.deadName) ? def.deadName : face.name;
  const typeLabel = def.type === "unit" ? (omen && fromDead ? "SITUATION" : "UNIT") : def.type === "spell" ? "SPELL" : "SITUATION";
  const stats = def.type === "unit"
    ? (omen
        ? `<div class="cstats"><span class="cs-liv">${I_ATK}${def.l[0]} ${I_HP}${def.l[1]}</span><span class="cs-sep">→</span><span class="cs-ded">OMEN</span></div>`
        : `<div class="cstats"><span class="cs-liv">${I_ATK}${def.l[0]} ${I_HP}${def.l[1]}</span><span class="cs-sep">✦</span><span class="cs-ded">${I_ATK}${def.d[0]} ${I_HP}${def.d[1]}</span></div>`)
    : `<div class="cstats one">${typeLabel}</div>`;
  el.innerHTML =
    `<div class="cost">${cost}</div>
     <div class="cname">${dispName}</div>
     <div class="cart">${artFor(cardId, fromDead)}</div>
     <div class="ctype">${typeLabel}${def.type === "unit" ? (fromDead ? " · DEAD FACE" : "") : (def.deadFace && fromDead ? " · DEAD FACE" : "")}</div>
     <div class="ctext">${face.text}</div>
     ${stats}`;
  el.onclick = () => clickHandCard(fromDead, idx);
  return el;
}

/* Situations lie on the battlefield behind the units, like enchantments on the table. */
function sitPlate(sit){
  const dead = sit.dim === "dead";
  const face = faceOf(sit.cardId, dead);
  const el = document.createElement("div");
  el.className = "sitplate";
  el.dataset.uid = sit.uid;
  el.dataset.pvCard = sit.cardId;
  el.dataset.pvDead = dead ? "1" : "0";
  const m = state.mode;
  if(m && m.type === "spell" && state.turn === "player" &&
     validTargets("player", m.cardId, m.fromDead).some(t => t.uid === sit.uid)) el.classList.add("targetable");
  el.innerHTML = `<div class="sp-name">${face.name}</div><div class="sp-art">${artFor(sit.cardId, dead)}</div><div class="sp-tag">SITUATION</div>`;
  el.onclick = () => clickSit(sit.uid);
  return el;
}

function clickSit(uid){
  if(uiBusy || state.turn !== "player" || state.winner) return;
  const m = state.mode;
  if(m && m.type === "spell" && validTargets("player", m.cardId, m.fromDead).some(t => t.uid === uid)){
    castSpell("player", m.fromDead, m.idx, {uid});
    state.mode = null; hint("");
    render();
  }
}

function heroChip(id, ownerK, dim){
  const el = $(id), s = S(ownerK);
  const broken = s.soulBroken;
  const h = s.hero ? HEROES[s.hero] : null;
  let val, icon, label;
  if(dim === "living"){ val = s.life; icon = "♥"; label = h ? h.name : (ownerK === "ai" ? "Enemy Life" : "Your Life"); }
  else if(broken){ val = s.life; icon = "💔"; label = (h ? h.name : "Soul") + " — SHATTERED"; }
  else { val = s.soul; icon = "☠"; label = (h ? h.name + "'s" : "") + " Soul"; }
  const face = s.hero ? `<div class="chipface">${artFor("h_"+s.hero, dim === "dead")}</div>` : "";
  el.innerHTML = `${face}<div class="chipicon">${icon}</div><div class="chipval">${val}</div><div class="chiplabel">${label}</div>`;
  el.title = h ? `${h.name} ${h.title} — ${h.passive}` : "";
  el.classList.toggle("broken", dim === "dead" && broken);
  const m = state.mode;
  const targetable = ownerK === "ai" && m && m.type === "attack" && m.dim === dim && state.turn === "player"
    && !guardsOf("ai", dim).length;
  el.classList.toggle("targetable", !!targetable);
  el.onclick = ownerK === "ai" ? (() => clickEnemyHero(dim)) : null;
}

function renderHeroSelect(){
  const hs = $("heroSelect");
  if(!state || state.phase !== "heroSelect"){ hs.classList.remove("show"); return; }
  if(!hs.dataset.built){
    hs.innerHTML = `<div class="hs-title">Choose Your Champion</div><div class="hs-row">` +
      Object.entries(HEROES).map(([id,h]) =>
        `<div class="hero-card" data-hero="${id}">
           <div class="hc-name">${h.name}</div>
           <div class="hc-title">${h.title}</div>
           <div class="hc-art">${artFor("h_"+id, false)}</div>
           <div class="hc-deadface">${artFor("h_"+id, true)}<span>dead face</span></div>
           <div class="hc-passive">${h.passive}</div>
         </div>`).join("") + `</div>`;
    hs.querySelectorAll(".hero-card").forEach(el =>
      el.onclick = () => { chooseHero(el.dataset.hero); render(); });
    hs.dataset.built = "1";
  }
  hs.classList.add("show");
}

/* ---------- main render ---------- */
function render(){
  if(!state) return;
  const p = state.player, a = state.ai;

  $("turnInfo").textContent = "Round " + state.round + " — " + (state.turn === "player" ? "your turn" : "enemy's turn");
  $("aiInfo").textContent = `enemy hand ${a.hand.length} · dead hand ${a.deadHand.length} · deck ${a.deck.length}`;
  $("aiModeBtn").textContent = AI_CFG.mode === "llm" ? "AI: LLM (" + AI_CFG.model + ")" : "AI: Scripted";

  heroChip("chip-ai-living", "ai", "living");
  heroChip("chip-p-living", "player", "living");
  heroChip("chip-ai-dead", "ai", "dead");
  heroChip("chip-p-dead", "player", "dead");

  $("veil").classList.toggle("torn", p.soulBroken || a.soulBroken);

  const rows = {
    "row-ai-living":[a.living,"ai",a.sits.living], "row-p-living":[p.living,"player",p.sits.living],
    "row-ai-dead":[a.dead,"ai",a.sits.dead], "row-p-dead":[p.dead,"player",p.sits.dead],
  };
  for(const [rid,[units,side,sits]] of Object.entries(rows)){
    const row = $(rid); row.innerHTML = "";
    const layer = document.createElement("div");
    layer.className = "sitlayer";
    sits.forEach(x => layer.appendChild(sitPlate(x)));
    row.appendChild(layer);
    units.forEach(u => row.appendChild(unitEl(u, side)));
  }

  const ph = $("pHand"); ph.innerHTML = "";
  p.hand.forEach((c,i) => ph.appendChild(cardEl(c,i,false)));
  const pdh = $("pDeadHand"); pdh.innerHTML = "";
  p.deadHand.forEach((c,i) => pdh.appendChild(cardEl(c,i,true)));

  $("essDisp").textContent = p.essence;
  $("essMax").textContent = "of " + p.maxEss;
  $("deadEssDisp").textContent = p.deadEss;
  $("deadEssMax").textContent = "crossed over";
  $("pDeckDisp").textContent = p.deck.length;

  const sacBtn = $("sacBtn");
  const prompting = !!(state.mode && state.mode.type === "sacrificePrompt");
  sacBtn.disabled = !prompting || state.turn !== "player" || !!state.winner;
  sacBtn.textContent = prompting ? "Skip Sacrifice" : (p.sacrificed ? "Sacrifice Done" : "Sacrifice");
  sacBtn.classList.toggle("armed", prompting);
  $("endBtn").disabled = state.turn !== "player" || !!state.winner;

  const lb = $("logbox");
  lb.innerHTML = state.log.slice(-70).map(e => `<div class="l-${e.cls}">${e.msg}</div>`).join("");
  lb.scrollTop = lb.scrollHeight;

  renderHeroSelect();
  if(window.metaRefreshHeader) metaRefreshHeader();

  const ov = $("overlay");
  if(state.winner){
    $("ovTitle").textContent = state.winner;
    $("ovTitle").style.color = state.winner === "VICTORY" ? "var(--living-hi)" : "var(--blood)";
    $("ovWhy").textContent = state.winWhy || "";
    ov.classList.add("show");
  } else ov.classList.remove("show");

  animatePostRender();
}

/* Spawn / death / movement animations, and damage-float flushing. */
function animatePostRender(){
  const newSnaps = new Map();
  document.querySelectorAll(".unit[data-uid]").forEach(el => {
    const key = "u" + el.dataset.uid;
    const rect = el.getBoundingClientRect();
    newSnaps.set(key, {rect, html: el.outerHTML, dim: el.classList.contains("isdead") ? "dead" : "living", el});
  });

  for(const [key, snap] of newSnaps){
    const old = prevSnaps.get(key);
    if(!old){
      snap.el.classList.add(snap.dim === "dead" ? "spawn-dead" : "spawn-living");
    } else {
      const dx = old.rect.left - snap.rect.left, dy = old.rect.top - snap.rect.top;
      if(Math.abs(dx) > 6 || Math.abs(dy) > 6){
        snap.el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:"none"}], {duration:300, easing:"ease-out"});
      }
    }
  }
  for(const [key, old] of prevSnaps){
    if(!newSnaps.has(key)){
      const g = document.createElement("div");
      g.className = "ghost " + (old.dim === "dead" ? "ghost-ash" : "ghost-soul");
      g.innerHTML = old.html;
      Object.assign(g.style, {left:old.rect.left+"px", top:old.rect.top+"px", width:old.rect.width+"px", height:old.rect.height+"px"});
      document.body.appendChild(g);
      setTimeout(() => g.remove(), 900);
    }
  }

  for(const f of pendingFloats){
    let rect = null;
    if(f.ref.uid != null){
      const snap = newSnaps.get("u"+f.ref.uid) || prevSnaps.get("u"+f.ref.uid);
      if(snap) rect = snap.rect;
    } else if(f.ref.hero){
      const el = $("chip-" + f.ref.hero + "-" + f.ref.dim);
      if(el) rect = el.getBoundingClientRect();
    }
    floatDamage(rect, f.amount);
  }
  pendingFloats = [];
  prevSnaps = newSnaps;
}

/* ---------- input ---------- */
function clickHandCard(fromDead, idx){
  if(uiBusy || state.turn !== "player" || state.winner) return;
  const s = state.player;
  const hand = fromDead ? s.deadHand : s.hand;
  const cardId = hand[idx], face = faceOf(cardId, fromDead);
  const m0 = state.mode;
  if(m0 && m0.type === "sacrificePrompt"){
    if(fromDead){ hint("Sacrifices come from your living hand — pick one there, or skip."); return; }
    sacrifice("player", idx);
    state.mode = null; hint("");
    render(); return;
  }
  if(m0 && m0.type === "spell" && m0.fromDead === fromDead && m0.idx === idx){
    state.mode = null; hint(""); render(); return; // click pending spell again = cancel
  }
  if(face.cost > (fromDead ? s.deadEss : s.essence)){
    hint("Not enough "+(fromDead ? "dead energy" : "essence")+" ("+face.cost+" needed).");
    return;
  }
  if(face.type === "unit" || face.type === "situation"){
    const asSituation = face.type === "situation" || (fromDead && DEFS[cardId].deadForm === "situation");
    if(!playCard("player", idx, fromDead)){
      const zone = fromDead ? "dead" : "living";
      if(asSituation && state.player.sits[zone].some(x => x.cardId === cardId))
        hint("Only one "+face.name+" can be active per dimension.");
      else if(asSituation)
        hint("Situation slots are full there (max "+MAX_SITS+").");
      else
        hint("The "+zone+" field is full.");
      return;
    }
    state.mode = null;
  } else if(!face.target){ // targetless spell — cast immediately
    castSpell("player", fromDead, idx, null);
    state.mode = null;
  } else {
    const targets = validTargets("player", cardId, fromDead);
    if(!targets.length){ hint("No valid target for "+face.name+"."); return; }
    state.mode = {type:"spell", fromDead, idx, cardId};
    hint(face.name+": choose a target.");
  }
  render();
}

async function clickUnit(uid){
  if(uiBusy || state.turn !== "player" || state.winner) return;
  const f = findUnit(uid);
  if(!f) return;
  const m = state.mode;
  if(m && m.type === "sacrificePrompt"){ hint("Resolve the sacrifice first — pick a hand card or skip."); return; }
  if(m && m.type === "spell"){
    if(validTargets("player", m.cardId, m.fromDead).some(u => u.uid === uid)){
      castSpell("player", m.fromDead, m.idx, {uid});
      state.mode = null; hint("");
    }
    render(); return;
  }
  if(m && m.type === "attack"){
    if(f.side === "ai" && f.dim === m.dim){
      const gs = guardsOf("ai", m.dim);
      if(gs.length && DEFS[f.unit.cardId].ability !== "guard"){ hint("A Guard stands in the way — break it first."); return; }
      state.mode = null; hint("");
      uiBusy = true;
      await FX.attackAnim(m.uid, uid);
      attack(m.uid, uid);
      render();
      uiBusy = false;
      return;
    }
  }
  if(f.side === "player" && !f.unit.exhausted){
    state.mode = {type:"attack", uid, dim:f.dim};
    hint("Choose a target in the "+f.dim+" dimension — a unit or the enemy hero.");
  } else if(f.side === "player" && f.unit.exhausted){
    hint("That unit is exhausted.");
  }
  render();
}

async function clickEnemyHero(dim){
  if(uiBusy) return;
  const m = state.mode;
  if(state.turn !== "player" || state.winner || !m || m.type !== "attack" || m.dim !== dim) return;
  if(guardsOf("ai", dim).length){ hint("A Guard protects their hero in this dimension."); return; }
  const attackerUid = m.uid;
  state.mode = null; hint("");
  uiBusy = true;
  await FX.attackAnim(attackerUid, null);
  attack(attackerUid, null);
  render();
  uiBusy = false;
}

function uiSkipSacrifice(){ if(!uiBusy) { skipSacrifice(); render(); } }
function uiEndTurn(){ if(!uiBusy) { playerEndTurn(); } }
function uiNewGame(){ newGame(); render(); }
function toggleAiMode(){
  AI_CFG.mode = AI_CFG.mode === "llm" ? "scripted" : "llm";
  try { localStorage.setItem("deadera-ai-mode", AI_CFG.mode); } catch(e){}
  if(AI_CFG.mode === "llm") hint("LLM opponent needs Ollama running and the game served from localhost (tools/serve.ps1). Falls back to scripted if unreachable.");
  if(state) render();
  if($("mainMenu").classList.contains("show")) showMainMenu();
}

/* ---------- main menu ---------- */
function showMainMenu(){
  const mm = $("mainMenu");
  mm.classList.add("show");
  $("mmContinue").style.display = (state && !state.winner && state.phase === "play") ? "" : "none";
  $("mmAiBtn").textContent = AI_CFG.mode === "llm" ? "AI: LLM (" + AI_CFG.model + ")" : "AI: Scripted";
  if(typeof meta !== "undefined"){
    const owned = Object.values(meta.cards).reduce((n,c) => n + c.n + c.f, 0);
    $("mmStats").textContent = `${meta.wins} wins · ${meta.packs} unopened packs · ${owned} cards owned`;
  }
}
function menuPlay(){ $("mainMenu").classList.remove("show"); newGame(); render(); }
function menuContinue(){ $("mainMenu").classList.remove("show"); render(); }
function menuCollection(){ $("mainMenu").classList.remove("show"); openBuilderScreen(); }
function menuPacks(){ $("mainMenu").classList.remove("show"); openPacksScreen(); }

document.addEventListener("keydown", e => {
  if(e.key === "Escape" && state && state.mode && state.mode.type !== "sacrificePrompt"){
    state.mode = null; hint(""); render();
  }
});

/* ---------- hover preview ---------- */
const preview = () => $("preview");
function placePreviewOver(el){
  const pv = preview(), r = el.getBoundingClientRect();
  pv.style.visibility = "hidden";
  pv.classList.add("show");
  const pw = pv.offsetWidth, ph = pv.offsetHeight, gap = 10;
  let left = r.left + r.width/2 - pw/2;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  let top = r.top - ph - gap;               // prefer above the hovered card
  if(top < 52) top = Math.min(r.bottom + gap, window.innerHeight - ph - 8); // else below
  pv.style.left = left + "px";
  pv.style.top = top + "px";
  pv.style.visibility = "";
}

document.addEventListener("mouseover", e => {
  const t = e.target.closest && e.target.closest("[data-pv-card]");
  if(!t){ preview().classList.remove("show"); return; }
  const cardId = t.dataset.pvCard, dead = t.dataset.pvDead === "1";
  const def = DEFS[cardId], face = faceOf(cardId, dead);
  const dispName = (def.type === "unit" && dead && def.deadName) ? def.deadName : face.name;
  const otherLine = def.type === "unit"
    ? (def.deadForm === "situation"
        ? (dead ? `Living face: ${def.name} — ${def.l[0]}/${def.l[1]} unit` : `Dead face: ${def.deadFace.name} (situation) — ${def.deadFace.text}`)
        : dead ? `Living face: ${def.name} — ${def.l[0]}/${def.l[1]}` : `Dead counterpart: ${def.deadName} — ${def.d[0]}/${def.d[1]}`)
    : (def.deadFace ? (dead ? `Living face: ${def.name} — ${def.text}` : `Dead face: ${def.deadFace.name} — ${def.deadFace.text}`) : "Same on both sides of the veil.");
  preview().innerHTML =
    `<div class="pv-cost">${dead ? 0 : def.cost}</div>
     <div class="pv-name">${dispName}</div>
     <div class="pv-art">${artFor(cardId, dead)}</div>
     <div class="pv-type">${def.type.toUpperCase()}${dead ? " · DEAD FACE" : ""}</div>
     <div class="pv-text">${face.text}</div>
     ${def.type === "unit" ? `<div class="pv-stats"><span class="cs-liv">${I_ATK}${def.l[0]} ${I_HP}${def.l[1]} living</span> <span class="cs-ded">${I_ATK}${def.d[0]} ${I_HP}${def.d[1]} dead</span></div>` : ""}
     <div class="pv-other">${otherLine}</div>`;
  preview().classList.toggle("pv-dead", dead);
  placePreviewOver(t);
});

/* ---------- boot ---------- */
try { AI_CFG.mode = localStorage.getItem("deadera-ai-mode") || "scripted"; } catch(e){}
if(!["#demo","#packs","#builder"].includes(location.hash)) showMainMenu();
else newGame();
if(location.hash === "#packs"){ chooseHero("alder"); openPacksScreen(); }
if(location.hash === "#builder"){ chooseHero("alder"); openBuilderScreen(); }
if(location.hash === "#demo"){
  // Seeded mid-game board for visual/design iteration.
  chooseHero("vex");
  const p = state.player, a = state.ai;
  a.hero = "morwen";
  ["flameblade","warden","hound"].forEach(id => p.living.push(makeUnit(id,"living")));
  ["shambler","gravrat"].forEach(id => p.dead.push(makeUnit(id,"dead")));
  ["deathknight","priest"].forEach(id => a.living.push(makeUnit(id,"living")));
  ["ghoul","spirit","plague"].forEach(id => a.dead.push(makeUnit(id,"dead")));
  p.living.forEach(u => u.exhausted = false);
  p.dead.forEach(u => u.exhausted = false);
  p.sits.living.push({uid:++uidSeq, cardId:"tome", dim:"living"});
  a.sits.dead.push({uid:++uidSeq, cardId:"grove", dim:"dead"});
  p.deadHand.push("shambler","smite");
  a.soul = 6; p.soul = 11; p.life = 19; a.life = 21;
  p.maxEss = 5; p.essence = 3; p.deadEss = 2; p.sacrificed = true;
  state.round = 6; state.mode = null;
}
render();
