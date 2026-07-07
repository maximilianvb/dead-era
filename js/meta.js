"use strict";
/* ============ META-GAME: collection, packs, deck builder, foils ============
   Persisted in localStorage. Wired into the engine via the META hooks. */

const RARITIES = {
  common:    {label:"Common",    color:"#9aa0b0", weight:60},
  rare:      {label:"Rare",      color:"#4f8fd0", weight:26},
  epic:      {label:"Epic",      color:"#a05ad8", weight:10},
  legendary: {label:"Legendary", color:"#e8a020", weight:4},
};
const PACK_SIZE = 5, FOIL_CHANCE = 0.09, START_PACKS = 5, DECK_SIZE = 40, MAX_COPIES = 2;
const COLLECTIBLE = Object.keys(DEFS).filter(id => !DEFS[id].token);

/* ---------- persistence ---------- */
let meta = loadMeta();
function loadMeta(){
  let m = null;
  try {
    const raw = localStorage.getItem("deadera-meta");
    if(raw) m = JSON.parse(raw);
  } catch(e){}
  if(!m){
    const cards = {};
    DECKLIST.forEach(id => { cards[id] = cards[id] || {n:0, f:0}; cards[id].n++; });
    m = {cards, packs:START_PACKS, deck:null, foils:[], wins:0};
  }
  // migration: new expansion cards appear in old collections (1 free copy each)
  COLLECTIBLE.forEach(id => { m.cards[id] = m.cards[id] || {n:1, f:0}; });
  return m;
}
function saveMeta(){
  try { localStorage.setItem("deadera-meta", JSON.stringify(meta)); } catch(e){}
}

/* ---------- engine hooks ---------- */
META.playerDeck = () => (meta.deck && meta.deck.length === DECK_SIZE) ? meta.deck : null;
META.onVictory = () => {
  meta.wins++; meta.packs++;
  saveMeta();
  setTimeout(() => FX.banner("+1 Card Pack!"), 1600);
};
function metaFoilSet(){ return new Set(meta.foils); }
function metaRefreshHeader(){
  const pb = document.getElementById("packsBtn");
  if(pb) pb.textContent = "Packs (" + meta.packs + ")";
}

/* ---------- pack opening ---------- */
function rollRarity(){
  const total = Object.values(RARITIES).reduce((n,r) => n + r.weight, 0);
  let roll = Math.random() * total;
  for(const [key, r] of Object.entries(RARITIES)){ roll -= r.weight; if(roll <= 0) return key; }
  return "common";
}
function rollPack(){
  return Array.from({length: PACK_SIZE}, () => {
    const rarity = rollRarity();
    const pool = COLLECTIBLE.filter(id => DEFS[id].rarity === rarity);
    return {id: pool[Math.floor(Math.random()*pool.length)], foil: Math.random() < FOIL_CHANCE};
  });
}

function openPacksScreen(){
  const sc = document.getElementById("metaScreen");
  sc.classList.add("show");
  sc.innerHTML =
    `<div class="ms-head"><h2>Card Packs</h2>
       <span class="ms-sub">${meta.packs} unopened · win games to earn more</span>
       <span class="spacer"></span><button onclick="closeMetaScreen()">Back</button></div>
     <div class="packstage" id="packStage">
       ${meta.packs > 0
         ? `<div class="pack" id="packObj" onclick="ripPack()"><div class="packglow"></div><span>DEAD ERA</span><em>click to tear open</em></div>`
         : `<div class="ms-empty">No packs left. Win a game to earn one.</div>`}
     </div>`;
}
function ripPack(){
  if(meta.packs <= 0) return;
  meta.packs--;
  const pulls = rollPack();
  pulls.forEach(p => {
    const c = meta.cards[p.id] = meta.cards[p.id] || {n:0, f:0};
    if(p.foil) c.f++; else c.n++;
  });
  saveMeta(); metaRefreshHeader();
  const stage = document.getElementById("packStage");
  stage.innerHTML = `<div class="packrow">` + pulls.map((p,i) => {
    const def = DEFS[p.id];
    return `<div class="pcard-flip" style="animation-delay:${i*0.12}s" onclick="this.classList.add('flipped')">
      <div class="pcard-inner">
        <div class="pcard-back"><span>✦</span></div>
        <div class="pcard-front ${p.foil ? "foil" : ""} r-${def.rarity}">
          <div class="pc-rarity" style="color:${RARITIES[def.rarity].color}">${RARITIES[def.rarity].label}${p.foil ? " · FOIL" : ""}</div>
          <div class="pc-name">${def.name}</div>
          <div class="pc-art">${artFor(p.id, false)}</div>
          <div class="pc-text">${def.text}</div>
          <div class="holo"></div>
        </div>
      </div>
    </div>`;
  }).join("") + `</div>
  <div class="ms-actions">
    <button onclick="document.querySelectorAll('.pcard-flip').forEach(e=>e.classList.add('flipped'))">Flip All</button>
    ${meta.packs > 0 ? `<button onclick="openPacksScreen();ripPack()">Open Another (${meta.packs})</button>` : ""}
  </div>`;
}

/* ---------- deck builder ---------- */
let draftDeck = null;
let builderFilter = "addable"; // "addable" | "all"
function openBuilderScreen(){
  draftDeck = [...(meta.deck || DECKLIST)];
  renderBuilder();
}
function toggleBuilderFilter(){
  builderFilter = builderFilter === "addable" ? "all" : "addable";
  renderBuilder();
}
function renderBuilder(){
  const sc = document.getElementById("metaScreen");
  sc.classList.add("show");
  const pv = document.getElementById("preview");
  if(pv) pv.classList.remove("show");
  const counts = {};
  draftDeck.forEach(id => counts[id] = (counts[id]||0) + 1);
  const deckFull = draftDeck.length >= DECK_SIZE;
  const order = COLLECTIBLE.slice().sort((a,b) => DEFS[a].cost - DEFS[b].cost || DEFS[a].name.localeCompare(DEFS[b].name));
  sc.innerHTML =
    `<div class="ms-head"><h2>Collection & Deck</h2>
       <span class="ms-sub">click a card to add it · hover for details · ✕ removes a copy · max ${MAX_COPIES} copies</span>
       <span class="spacer"></span>
       <button onclick="toggleBuilderFilter()">Showing: ${builderFilter === "addable" ? "addable" : "all cards"}</button>
       <button onclick="resetDraftDeck()">Default Deck</button>
       <button onclick="closeMetaScreen()">Back</button></div>
     <div class="builder">
       <div class="collgrid">` +
    order.map(id => {
      const def = DEFS[id], own = meta.cards[id] || {n:0, f:0};
      const owned = own.n + own.f, inDeck = counts[id] || 0;
      const canAdd = owned > 0 && inDeck < Math.min(MAX_COPIES, owned) && !deckFull;
      if(builderFilter === "addable" && !canAdd && inDeck === 0) return ""; // hide what you can't use
      const foil = own.f > 0;
      const maxedWhy = !owned ? "NOT OWNED" : deckFull ? "DECK FULL" : inDeck >= MAX_COPIES ? "MAX COPIES" : inDeck >= owned ? "ALL COPIES IN DECK" : "";
      return `<div class="ccard r-${def.rarity} ${foil && meta.foils.includes(id) ? "foil" : ""} ${owned ? "" : "unowned"} ${canAdd ? "addable" : "maxed"}"
        data-pv-card="${id}" data-pv-dead="0" onclick="builderAdd('${id}')" title="${canAdd ? "click to add to deck" : maxedWhy.toLowerCase()}">
        <div class="cc-cost">${def.cost}</div>
        <div class="cc-name" style="color:${RARITIES[def.rarity].color}">${def.name}</div>
        <div class="cc-art">${artFor(id, false)}</div>
        <div class="cc-meta">${def.type.toUpperCase()} · own ${owned}${own.f ? ` (${own.f}✦)` : ""} · in deck ${inDeck}</div>
        ${!canAdd && maxedWhy ? `<div class="cc-max">${maxedWhy}</div>` : `<div class="cc-add">+ ADD</div>`}
        ${own.f ? `<div class="cc-foilbtn ${meta.foils.includes(id) ? "on" : ""}" onclick="event.stopPropagation();toggleFoil('${id}')">FOIL ${meta.foils.includes(id) ? "ON" : "OFF"}</div>` : ""}
        <div class="holo"></div>
      </div>`;
    }).join("") +
    `</div>
     <div class="deckcol">
       <div class="deckcount ${draftDeck.length === DECK_SIZE ? "ok" : ""}">${draftDeck.length} / ${DECK_SIZE}</div>` +
    Object.entries(counts).sort((a,b) => DEFS[a[0]].cost - DEFS[b[0]].cost)
      .map(([id,n]) => `<div class="deckrow" data-pv-card="${id}" data-pv-dead="0" onclick="builderRemove('${id}')" title="remove one copy">
        <span class="dr-cost">${DEFS[id].cost}</span><span class="dr-name">${DEFS[id].name}</span><span class="dr-n">×${n}</span><span class="dr-x">✕</span>
      </div>`).join("") +
    `<button class="savedeck" ${draftDeck.length === DECK_SIZE ? "" : "disabled"} onclick="saveDraftDeck()">Save Deck</button>
     </div></div>`;
}
function builderAdd(id){
  const own = meta.cards[id] || {n:0, f:0};
  const inDeck = draftDeck.filter(x => x === id).length;
  if(own.n + own.f === 0 || inDeck >= Math.min(MAX_COPIES, own.n + own.f) || draftDeck.length >= DECK_SIZE) return;
  draftDeck.push(id); renderBuilder();
}
function builderRemove(id){
  const i = draftDeck.indexOf(id);
  if(i >= 0){ draftDeck.splice(i,1); renderBuilder(); }
}
function toggleFoil(id){
  const i = meta.foils.indexOf(id);
  if(i >= 0) meta.foils.splice(i,1); else meta.foils.push(id);
  saveMeta(); renderBuilder();
}
function resetDraftDeck(){ draftDeck = [...DECKLIST]; renderBuilder(); }
function saveDraftDeck(){
  if(draftDeck.length !== DECK_SIZE) return;
  meta.deck = [...draftDeck];
  saveMeta();
  closeMetaScreen();
  FX.banner("Deck Saved");
}
function closeMetaScreen(){
  document.getElementById("metaScreen").classList.remove("show");
  if(!state) showMainMenu();
  else render();
}

/* ---------- CS2-style foil: holographic sheen + 3D tilt following cursor ---------- */
document.addEventListener("mousemove", e => {
  const card = e.target.closest && e.target.closest(".foil");
  if(!card) return;
  const r = card.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
  card.style.setProperty("--mx", (px*100).toFixed(1));
  card.style.setProperty("--my", (py*100).toFixed(1));
  card.style.setProperty("--rx", ((py - .5) * -14).toFixed(2) + "deg");
  card.style.setProperty("--ry", ((px - .5) * 16).toFixed(2) + "deg");
  card.classList.add("foil-active");
});
document.addEventListener("mouseout", e => {
  const card = e.target.closest && e.target.closest(".foil");
  if(card && !card.contains(e.relatedTarget)){
    card.classList.remove("foil-active");
    card.style.removeProperty("--rx"); card.style.removeProperty("--ry");
  }
});

metaRefreshHeader();
