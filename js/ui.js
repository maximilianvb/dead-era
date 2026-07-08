"use strict";
/* ============ UI: rendering, input, animation ============ */

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let uiBusy = false;              // blocks input during animations
let prevSnaps = new Map();       // "u<uid>" -> {rect, html, dim} from last render
let pendingFloats = [];          // {ref, amount} queued by FX.damage
let pendingDraws = [];           // {k, cardId} queued by FX.draw
let pendingCross = [];           // {k, cardId, uid} queued by FX.crossOver

/* ---------- FX implementations ---------- */
FX.render = () => render();
FX.pause = ms => sleep(ms);
FX.hint = msg => hint(msg);
FX.banner = text => showBanner(text);
FX.damage = (ref, amount) => pendingFloats.push({ref, amount});
FX.draw = (k, cardId) => pendingDraws.push({k, cardId});
FX.crossOver = (k, cardId, uid) => pendingCross.push({k, cardId, uid});
FX.playedCard = (k, cardId, fromDead, kind) => { if(k === "ai") aiReveal(cardId, fromDead, kind); };

/* The enemy's play is shown as a big card sliding in from their side of the table. */
function aiReveal(cardId, fromDead, kind){
  const face = faceOf(cardId, fromDead), def = DEFS[cardId];
  const dispName = (def.type === "unit" && fromDead && def.deadName) ? def.deadName : face.name;
  const el = document.createElement("div");
  el.className = "aireveal" + (fromDead ? " rv-dead" : "");
  el.innerHTML =
    `<div class="rv-label">${kind === "sacrifice" ? "ENEMY SACRIFICES" : kind === "cast" ? "ENEMY CASTS" : "ENEMY PLAYS"}</div>
     <div class="rv-card${fromDead ? " cdead" : ""}">
       <div class="rv-cost${def.blood ? " blood" : ""}">${def.blood || def.cost}</div>
       <div class="rv-name">${dispName}</div>
       <div class="rv-art">${artFor(cardId, fromDead)}</div>
       <div class="rv-text">${face.text}</div>
     </div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}
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
  const deadFaced = u.dim === "dead" || !!u.deadFace;
  el.className = "unit " + (deadFaced ? "isdead" : "isliving");
  el.dataset.uid = u.uid;
  el.dataset.pvCard = u.cardId;
  el.dataset.pvDead = deadFaced ? "1" : "0";
  if(u.hp < u.maxHp) el.classList.add("hurt");
  const m = state.mode;
  if(side === "player"){
    if(u.exhausted) el.classList.add("exhausted");
    else if(state.turn === "player") el.classList.add("ready");
    if(m && m.type === "attack" && m.uid === u.uid) el.classList.add("selected");
    if(m && m.type === "sacrificePrompt") el.classList.add("sacmode");
  }
  if(m && state.turn === "player"){
    if(m.type === "spell" && validTargets("player", m.cardId, m.fromDead).some(x => x.uid === u.uid)) el.classList.add("targetable");
    if(m.type === "power" && side === "player" && powerTargets("player").some(x => x.uid === u.uid)) el.classList.add("targetable");
    if(m.type === "attack" && side === "ai" && u.dim === m.dim){
      const gs = guardsOf("ai", m.dim);
      if(!gs.length || unitGuard(u)) el.classList.add("targetable");
    }
  }
  /* hex/charm status badges — the board tells you everything */
  const b = [];
  if(u.st){
    if(u.st.frozen > 0) b.push(`<span title="Frozen: won't wake for ${u.st.frozen} more turn(s)">❄${u.st.frozen}</span>`);
    if(u.st.blight) b.push(`<span title="Blight: takes ${u.st.blight} at its owner's turn start, forever">🦠${u.st.blight}</span>`);
    if(u.st.doom != null) b.push(`<span title="Reaper's mark: dies in ${u.st.doom} turn(s)">💀${u.st.doom}</span>`);
    if(u.st.hollow) b.push(`<span title="Hollowed: all abilities silenced">🚫</span>`);
    if(u.st.noHero) b.push(`<span title="Shackled: cannot attack heroes">⛓</span>`);
    if(u.st.guard) b.push(`<span title="Guard (granted)">🛡</span>`);
    if(u.st.ranged) b.push(`<span title="Ranged (granted): no retaliation">🏹</span>`);
    if(u.st.lifesteal) b.push(`<span title="Lifesteal (granted)">🩸</span>`);
    if(u.st.doubleStrike) b.push(`<span title="Twin Strike: attacks twice per turn">⚔²</span>`);
  }
  if(def.lifesteal && !(u.st && u.st.hollow)) b.push(`<span title="Lifesteal">🩸</span>`);
  if(def.ranged && !(u.st && u.st.hollow)) b.push(`<span title="Ranged: no retaliation">🏹</span>`);
  /* powered units: charge pips + activate button when full */
  let powerBtn = "";
  if(def.power && u.pw != null){
    const chargeable = side === "player" && canUseUnitPower("player", u.uid) && state.turn === "player";
    powerBtn = `<div class="upower${chargeable ? " up-ready" : ""}" data-up="${u.uid}"
      title="${def.power.name}: ${def.power.text}${chargeable ? " — CLICK TO UNLEASH" : ""}">⚡${u.pw}/${def.power.cost} ${def.power.name}</div>`;
  }
  const sideObj = S(side);
  el.innerHTML =
    `<div class="uname">${unitName(u)}</div>
     <div class="uart">${artFor(u.cardId, deadFaced)}</div>
     ${b.length ? `<div class="ustatus">${b.join("")}</div>` : ""}
     ${powerBtn || (def.ability ? `<div class="utag">${def.text.split(":")[0]}</div>` : "")}
     <div class="ustats"><span class="uatk">${I_ATK}${atkOf(u, sideObj)}</span><span class="uhp">${I_HP}${u.hp}</span></div>`;
  el.onclick = () => clickUnit(u.uid);
  const upEl = el.querySelector(".upower.up-ready");
  if(upEl) upEl.onclick = ev => { ev.stopPropagation(); uiUnitPower(u.uid); };
  return el;
}

function uiUnitPower(uid){
  if(uiBusy || !state || state.turn !== "player" || state.winner) return;
  if(state.mode && state.mode.type === "sacrificePrompt"){ hint("Resolve the sacrifice first."); return; }
  if(useUnitPower("player", uid)) render();
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
  const cost = def.blood || def.cost;
  const fresh = fromDead && idx >= s.deadHand.length - (s.deadFresh || 0); // settles next turn
  const affordable = state.turn === "player" && !fresh && (def.blood
    ? (fromDead ? true : s.life > def.blood)
    : def.cost <= (fromDead ? s.deadEss : s.essence));
  if(fresh) el.classList.add("unplayable","cooling");
  else if(m && m.type === "sacrificePrompt" && !fromDead) el.classList.add("sacmode");
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
    `<div class="cost${def.blood ? " blood" : ""}" title="${def.blood ? "Bloodprice: pays " + def.blood + " " + (fromDead ? "Soul" : "Life") : "costs " + cost + (fromDead ? " dead energy" : " essence")}">${cost}</div>
     <div class="cname">${dispName}</div>
     <div class="cart">${artFor(cardId, fromDead)}</div>
     <div class="ctype">${typeLabel}${def.type === "unit" ? (fromDead ? " · DEAD FACE" : "") : (def.deadFace && fromDead ? " · DEAD FACE" : "")}</div>
     <div class="ctext">${face.text}</div>
     ${stats}
     ${fresh ? `<div class="coolbadge" title="Freshly fallen — playable next turn">⏳ settling</div>` : ""}
     ${fromDead ? `<div class="deadfx"><span>☠</span></div>` : ""}`;
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
  const fx = face.sitFx;
  let counter = "";
  if(fx && fx.kind === "doom") counter = `<div class="sp-count doom">🔔 ${sit.n || 0} / ${fx.n}</div>`;
  else if(fx && fx.charges != null) counter = `<div class="sp-count">${sit.c != null ? sit.c : fx.charges} turns left</div>`;
  el.innerHTML = `<div class="sp-name">${face.name}</div><div class="sp-art">${artFor(sit.cardId, dead)}</div>${counter}<div class="sp-tag">SITUATION</div>`;
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
  const channel = dim === "living" && s.hero ? `<div class="chipchannel" title="channeled energy">⚡${s.channel}</div>` : "";
  el.innerHTML = `${face}<div class="chipicon">${icon}</div><div class="chipval">${val}</div><div class="chiplabel">${label}</div>${channel}`;
  el.title = h ? `${h.name} ${h.title} — ${h.passive}${h.power ? `\n⚡ ${h.power.name} (${h.power.cost}): ${h.power.text}` : ""}` : "";
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
    hs.innerHTML = `<div class="hs-title">Choose Your Champion</div>
      <div class="hs-sub">Every champion channels ⚡1 per turn — bank it and unleash their power.</div>
      <div class="hs-row">` +
      Object.entries(HEROES).map(([id,h]) =>
        `<div class="hero-card" data-hero="${id}">
           <div class="hc-name">${h.name}</div>
           <div class="hc-title">${h.title}</div>
           <div class="hc-art">${artFor("h_"+id, false)}</div>
           <div class="hc-deadface">${artFor("h_"+id, true)}<span>dead face</span></div>
           <div class="hc-passive">${h.passive}</div>
           <div class="hc-power"><b>⚡${h.power.cost} ${h.power.name}</b> — ${h.power.text}</div>
         </div>`).join("") + `</div>`;
    hs.querySelectorAll(".hero-card").forEach(el =>
      el.onclick = () => { chooseHero(el.dataset.hero); render(); });
    hs.dataset.built = "1";
  }
  hs.classList.add("show");
}

/* ---------- mulligan ---------- */
let mulliganToss = new Set();
function renderMulligan(){
  const mg = $("mulligan");
  const showIt = state && state.phase === "mulligan" && state.player.hero;
  mg.classList.toggle("show", !!showIt);
  if(!showIt){ mg.innerHTML = ""; mulliganToss = new Set(); return; }
  mg.innerHTML = `<div class="mg-title">Opening Hand</div>
    <div class="mg-sub">Click the cards you don't want — they'll be exchanged for new draws. One chance.</div>
    <div class="mg-row">` +
    state.player.hand.map((id, i) => {
      const def = DEFS[id];
      return `<div class="mg-card${mulliganToss.has(i) ? " toss" : ""}" data-mg="${i}" data-pv-card="${id}" data-pv-dead="0">
        <div class="cc-cost">${def.blood || def.cost}</div>
        <div class="mg-name">${def.name}</div>
        <div class="mg-art">${artFor(id, false)}</div>
        <div class="mg-tag">${mulliganToss.has(i) ? "✕ EXCHANGE" : "KEEP"}</div>
      </div>`;
    }).join("") + `</div>
    <button class="mm-btn mm-primary" id="mgConfirm">${mulliganToss.size ? "Exchange " + mulliganToss.size + " & Begin" : "Keep All & Begin"}</button>`;
  mg.querySelectorAll(".mg-card").forEach(el => el.onclick = () => {
    const i = +el.dataset.mg;
    if(mulliganToss.has(i)) mulliganToss.delete(i); else mulliganToss.add(i);
    renderMulligan();
  });
  $("mgConfirm").onclick = () => {
    const idx = [...mulliganToss];
    mulliganToss = new Set();
    confirmMulligan(idx);
    render();
  };
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

  /* after the tear, the dimensions collapse into ONE battlefield */
  $("table").classList.toggle("merged", !!state.merged);
  document.querySelector(".dim.living h2").textContent = state.merged ? "THE ONE FIELD" : "Living Dimension";

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

  const pw = p.hero ? HEROES[p.hero].power : null;
  const pb = $("powerBtn");
  if(pw){
    pb.style.display = "";
    pb.innerHTML = `⚡ ${pw.name} <span class="pw-charge">${p.channel}/${pw.cost}</span>`;
    pb.title = pw.text;
    pb.disabled = !canUsePower("player");
    pb.classList.toggle("pw-ready", canUsePower("player"));
    pb.classList.toggle("pw-armed", !!(state.mode && state.mode.type === "power"));
  } else pb.style.display = "none";

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
  renderMulligan();
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
  const crossed = new Set(pendingCross.map(c => "u" + c.uid));
  for(const [key, old] of prevSnaps){
    if(!newSnaps.has(key) && !crossed.has(key)){
      const g = document.createElement("div");
      g.className = "ghost " + (old.dim === "dead" ? "ghost-ash" : "ghost-soul");
      g.innerHTML = old.html;
      Object.assign(g.style, {left:old.rect.left+"px", top:old.rect.top+"px", width:old.rect.width+"px", height:old.rect.height+"px"});
      document.body.appendChild(g);
      setTimeout(() => g.remove(), 900);
    }
  }

  /* cross-over: the dying card visibly flips to its dead face and slides into the dead hand */
  pendingCross.forEach((c, i) => {
    const snap = prevSnaps.get("u" + c.uid);
    const rect = snap ? snap.rect : null;
    setTimeout(() => animateCrossOver(c, rect), i * 220);
  });
  pendingCross = [];

  /* draws: cards visibly leave the deck and land in the hand */
  const pDraws = pendingDraws.filter(d => d.k === "player");
  const handEl = $("pHand");
  pDraws.forEach((d, i) => {
    const target = handEl.children[handEl.children.length - pDraws.length + i];
    setTimeout(() => animateDraw(d.cardId, target), i * 160);
  });
  pendingDraws.filter(d => d.k === "ai").forEach((d, i) => setTimeout(() => animateAiDraw(), i * 160));
  pendingDraws = [];

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

/* A drawn card flies out of the deck, flipping face-up as it lands in the hand. */
function animateDraw(cardId, targetEl){
  const deckEl = $("pDeckDisp");
  if(!deckEl) return;
  const from = deckEl.getBoundingClientRect();
  let to = null;
  if(targetEl && targetEl.isConnected){
    to = targetEl.getBoundingClientRect();
    targetEl.style.visibility = "hidden";
  } else {
    const h = $("pHand").getBoundingClientRect();
    to = {left: h.left + h.width/2 - 89, top: h.top + 4, width: 178, height: 274};
  }
  const g = document.createElement("div");
  g.className = "drawghost";
  g.innerHTML = `<div class="dg-inner">
      <div class="dg-face dg-back"><span>✦</span></div>
      <div class="dg-face dg-front">
        <div class="dg-name">${DEFS[cardId].name}</div>
        <div class="dg-art">${artFor(cardId, false)}</div>
      </div></div>`;
  Object.assign(g.style, {left:to.left+"px", top:to.top+"px", width:to.width+"px", height:to.height+"px"});
  document.body.appendChild(g);
  const dx = from.left - to.left, dy = from.top - to.top;
  g.querySelector(".dg-inner").animate(
    [{transform:"rotateY(180deg)"},{transform:"rotateY(180deg)", offset:.35},{transform:"rotateY(0deg)"}],
    {duration:560, easing:"ease-in-out", fill:"forwards"});
  g.animate([
    {transform:`translate(${dx}px,${dy}px) scale(.24)`, opacity:.35},
    {transform:`translate(${dx*0.4}px,${dy*0.4}px) scale(.85)`, opacity:1, offset:.5},
    {transform:"none", opacity:1},
  ], {duration:560, easing:"cubic-bezier(.3,.8,.4,1)"}).finished.then(() => {
    g.remove();
    if(targetEl && targetEl.isConnected){
      targetEl.style.visibility = "";
      targetEl.classList.add("justdrawn");
      setTimeout(() => targetEl.classList.remove("justdrawn"), 800);
    }
  }).catch(() => g.remove());
}

/* The enemy's draw: a face-down card slips out of their deck at the top of the table. */
function animateAiDraw(){
  const src = $("aiInfo");
  const r = src ? src.getBoundingClientRect() : {left: window.innerWidth/2, top: 8, width: 120, height: 20};
  const g = document.createElement("div");
  g.className = "drawghost aidraw";
  g.innerHTML = `<div class="dg-face dg-back"><span>✦</span></div>`;
  Object.assign(g.style, {left:(r.left + r.width/2 - 31)+"px", top:(r.top + 30)+"px", width:"62px", height:"94px"});
  document.body.appendChild(g);
  g.animate([
    {transform:"translateY(-20px) scale(.55) rotate(-6deg)", opacity:0},
    {transform:"translateY(4px) scale(1)", opacity:1, offset:.4},
    {transform:"translateY(30px) scale(.9) rotate(4deg)", opacity:0},
  ], {duration:850, easing:"ease-out"}).finished.then(() => g.remove()).catch(() => g.remove());
}

/* THE money moment: a fallen card flips from its living face to its dead face,
   then slides into its owner's dead hand. */
function animateCrossOver(c, rect){
  if(!rect){
    const row = $("row-" + (c.k === "player" ? "p" : "ai") + "-living");
    if(!row) return;
    const r = row.getBoundingClientRect();
    rect = {left: r.left + r.width/2 - 66, top: r.top + 8, width: 132, height: 194};
  }
  const destEl = c.k === "player" ? $("pDeadHand") : $("aiInfo");
  if(!destEl) return;
  const dr = destEl.getBoundingClientRect();
  const def = DEFS[c.cardId];
  const deadFace = faceOf(c.cardId, true);
  const deadDisp = (def.type === "unit" && def.deadName) ? def.deadName : deadFace.name;
  const g = document.createElement("div");
  g.className = "crossflip";
  Object.assign(g.style, {left:rect.left+"px", top:rect.top+"px", width:rect.width+"px", height:rect.height+"px"});
  g.innerHTML = `<div class="cf-inner">
      <div class="cf-face cf-living"><div class="cf-name">${def.name}</div><div class="cf-art">${artFor(c.cardId, false)}</div></div>
      <div class="cf-face cf-dead"><div class="cf-name">${deadDisp}</div><div class="cf-art">${artFor(c.cardId, true)}</div><span class="cf-skull">☠</span></div>
    </div>`;
  document.body.appendChild(g);
  g.querySelector(".cf-inner").animate(
    [{transform:"rotateY(0deg)"},{transform:"rotateY(180deg)"}],
    {duration:560, easing:"ease-in-out", fill:"forwards"});
  g.animate(
    [{transform:"translateY(0) scale(1)", filter:"none"},
     {transform:"translateY(-30px) scale(1.14)", filter:"drop-shadow(0 0 18px rgba(150,110,240,.8))"}],
    {duration:560, easing:"ease-out", fill:"forwards"}
  ).finished.then(() => {
    const dx = (dr.left + dr.width/2) - (rect.left + rect.width/2);
    const dy = (dr.top + dr.height/2) - (rect.top + rect.height/2);
    return g.animate(
      [{transform:"translateY(-30px) scale(1.14)", opacity:1},
       {transform:`translate(${dx}px,${dy - 30}px) scale(.22)`, opacity:0}],
      {duration:500, delay:340, easing:"cubic-bezier(.5,0,.8,.4)", fill:"forwards"}).finished;
  }).then(() => g.remove()).catch(() => g.remove());
}

/* ---------- input ---------- */
function clickHandCard(fromDead, idx){
  if(uiBusy || state.turn !== "player" || state.winner) return;
  const s = state.player;
  const hand = fromDead ? s.deadHand : s.hand;
  const cardId = hand[idx], face = faceOf(cardId, fromDead);
  const m0 = state.mode;
  if(m0 && m0.type === "sacrificePrompt"){
    if(fromDead){ hint("Sacrifice a living-hand card or one of your units on the field — or skip."); return; }
    sacrifice("player", idx);
    state.mode = null; hint("");
    render(); return;
  }
  if(m0 && m0.type === "spell" && m0.fromDead === fromDead && m0.idx === idx){
    state.mode = null; hint(""); render(); return; // click pending spell again = cancel
  }
  if(fromDead && idx >= s.deadHand.length - (s.deadFresh || 0)){
    hint("Freshly fallen — this card settles into the dead hand and can be played next turn.");
    return;
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
  if(m && m.type === "sacrificePrompt"){
    if(f.side === "player"){
      sacrificeUnit("player", uid);
      state.mode = null; hint("");
      render();
    } else hint("Sacrifice one of YOUR cards or units — or skip.");
    return;
  }
  if(m && m.type === "power"){
    if(f.side === "player" && powerTargets("player").some(x => x.uid === uid)){
      usePower("player", {uid});
      state.mode = null; hint("");
    }
    render(); return;
  }
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
      if(gs.length && !unitGuard(f.unit)){ hint("A Guard stands in the way — break it first."); return; }
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

function uiHeroPower(){
  if(uiBusy || !state || state.turn !== "player" || state.winner) return;
  if(state.mode && state.mode.type === "sacrificePrompt"){ hint("Resolve the sacrifice first — pick a hand card or skip."); return; }
  if(state.mode && state.mode.type === "power"){ state.mode = null; hint(""); render(); return; } // cancel
  if(!canUsePower("player")){ hint("Not enough channel yet — your hero banks ⚡1 every turn."); return; }
  const pw = HEROES[state.player.hero].power;
  if(pw.targeted){
    if(!powerTargets("player").length){ hint("No valid unit — the other side must have room."); return; }
    state.mode = {type:"power"};
    hint(pw.name + ": choose one of your units to step through the veil.");
  } else {
    usePower("player");
  }
  render();
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
function menuPlay(){ window.randomMatch = false; $("mainMenu").classList.remove("show"); newGame(); render(); }
function menuPlayRandom(){
  window.randomMatch = true;
  $("mainMenu").classList.remove("show");
  newGame(); render();
  hint("Random Deck Match: you and the AI each drew a fresh, well-curved random deck.");
}
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
    `<div class="pv-cost${def.blood ? " blood" : ""}">${def.blood || def.cost}</div>
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
if(location.hash === "#packs"){ chooseHero("alder"); confirmMulligan([]); openPacksScreen(); }
if(location.hash === "#builder"){ chooseHero("alder"); confirmMulligan([]); openBuilderScreen(); }
if(location.hash === "#demo"){
  // Seeded mid-game board for visual/design iteration.
  chooseHero("vex"); confirmMulligan([]);
  const p = state.player, a = state.ai;
  a.hero = "morwen";
  ["flameblade","warden","hound","hx_pyro"].forEach(id => p.living.push(makeUnit(id,"living")));
  ["shambler","gravrat"].forEach(id => p.dead.push(makeUnit(id,"dead")));
  ["deathknight","priest","hx_countess"].forEach(id => a.living.push(makeUnit(id,"living")));
  ["ghoul","spirit","plague"].forEach(id => a.dead.push(makeUnit(id,"dead")));
  p.living.forEach(u => u.exhausted = false);
  p.dead.forEach(u => u.exhausted = false);
  // showcase hex/charm statuses + a charged unit power
  stOf(p.living[0]).lifesteal = true;                       // 🩸 granted
  stOf(p.living[1]).guard = true;                           // 🛡 granted
  p.living[3].pw = 2;                                       // Firebolt ready
  stOf(a.living[0]).frozen = 2;  a.living[0].exhausted = true; // ❄ frozen Death Knight
  stOf(a.living[1]).blight = 1;                             // 🦠 blighted priest
  stOf(a.dead[0]).doom = 2;                                 // 💀 marked ghoul
  stOf(a.dead[2]).noHero = true;                            // ⛓ shackled
  p.sits.living.push({uid:++uidSeq, cardId:"tome", dim:"living"});
  p.sits.living.push({uid:++uidSeq, cardId:"hx_nettles", dim:"living"});
  p.sits.living.push({uid:++uidSeq, cardId:"warbanner", dim:"living"});
  a.sits.dead.push({uid:++uidSeq, cardId:"grove", dim:"dead"});
  p.deadHand.push("shambler","smite","hx_frost");
  a.soul = 6; p.soul = 11; p.life = 19; a.life = 21;
  p.maxEss = 5; p.essence = 3; p.deadEss = 2; p.sacrificed = true; p.channel = 4;
  state.round = 6; state.mode = null;
}
render();
