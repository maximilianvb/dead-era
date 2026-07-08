"use strict";
/* ============ MULTIPLAYER CLIENT ============
   No accounts, no login: create a room, share the link (?room=CODE), play.
   The server is authoritative — it runs the same rules engine (js/game.js)
   once per room. This file swaps the engine's mutating functions for
   "send the action to the server" stubs and renders the state the server
   sends back (already redacted + perspective-swapped, so `state.player`
   is always YOU and the whole existing UI works untouched). */

const NET = {
  ws: null, mp: false, code: null, token: null,
  queue: Promise.resolve(), joining: false, retryTimer: null,
};

/* ---------- lobby overlay ---------- */
function ensureLobby(){
  if($("mpLobby")) return;
  const el = document.createElement("div");
  el.id = "mpLobby";
  el.innerHTML =
    `<div class="mp-box">
       <div class="mp-title">PLAY A FRIEND</div>
       <div class="mp-body" id="mpBody"></div>
     </div>`;
  document.body.appendChild(el);
}
function lobbyShow(html){
  ensureLobby();
  $("mpBody").innerHTML = html;
  $("mpLobby").classList.add("show");
}
function lobbyHide(){ if($("mpLobby")) $("mpLobby").classList.remove("show"); }

function mpShowLobby(){
  $("mainMenu").classList.remove("show");
  lobbyShow(
    `<div class="mp-sub">Create a game and send the link to a friend.<br>No account needed — the link IS the invite. Both players get a fresh random deck.</div>
     <button class="mm-btn mm-primary" onclick="mpCreate()">Create Game Link</button>
     <button class="mm-btn mm-minor" onclick="lobbyHide();showMainMenu()">Back</button>`);
}

function mpLinkFor(code){ return location.origin + location.pathname + "?room=" + code; }

function lobbyShowLink(code){
  const link = mpLinkFor(code);
  lobbyShow(
    `<div class="mp-sub">Send this link to your friend — the game starts the moment they open it.</div>
     <div class="mp-link" id="mpLink">${link}</div>
     <button class="mm-btn mm-primary" onclick="mpCopyLink()">Copy Link</button>
     <div class="mp-wait">⏳ waiting for your friend to join…</div>
     <button class="mm-btn mm-minor" onclick="location.href=location.pathname">Cancel</button>`);
}

function mpCopyLink(){
  const text = $("mpLink") ? $("mpLink").textContent : mpLinkFor(NET.code);
  const done = () => hint("Link copied — paste it to your friend!");
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
  else {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch(e){}
    ta.remove();
  }
}

/* ---------- connection ---------- */
function mpConnect(onOpen){
  if(!location.host){
    lobbyShow(`<div class="mp-sub">Multiplayer needs the game served by its server.<br>Run <b>npm start</b> locally, or use the deployed link.</div>
      <button class="mm-btn mm-minor" onclick="lobbyHide();showMainMenu()">Back</button>`);
    return;
  }
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(proto + "//" + location.host);
  NET.ws = ws;
  ws.onopen = () => { if(onOpen) onOpen(ws); };
  ws.onmessage = ev => {
    let msg; try { msg = JSON.parse(ev.data); } catch(e){ return; }
    NET.queue = NET.queue.then(() => mpHandle(msg)).catch(err => console.error(err));
  };
  ws.onclose = () => {
    if(!NET.mp) return; // never got into a game — leave whatever the lobby shows
    showBanner("Connection lost — reconnecting…");
    clearTimeout(NET.retryTimer);
    NET.retryTimer = setTimeout(() => {
      mpConnect(w => w.send(JSON.stringify({t:"join", code: NET.code, token: NET.token})));
    }, 2000);
  };
}

function mpSend(a){
  if(NET.ws && NET.ws.readyState === WebSocket.OPEN) NET.ws.send(JSON.stringify({t:"action", a}));
}

function mpCreate(){
  lobbyShow(`<div class="mp-wait">Creating room…</div>`);
  mpEnterMode();
  mpConnect(ws => ws.send(JSON.stringify({t:"create"})));
}

function mpJoinFromLink(code){
  NET.joining = true;
  $("mainMenu").classList.remove("show");
  lobbyShow(`<div class="mp-wait">Joining room ${code}…</div>`);
  mpEnterMode();
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem("deadera-mp") || "null"); } catch(e){}
  const token = saved && saved.code === code ? saved.token : undefined;
  mpConnect(ws => ws.send(JSON.stringify({t:"join", code, token})));
}

/* ---------- server messages ---------- */
async function mpHandle(msg){
  if(msg.t === "room"){
    NET.code = msg.code; NET.token = msg.token;
    try { sessionStorage.setItem("deadera-mp", JSON.stringify({code: msg.code, token: msg.token})); } catch(e){}
    try { history.replaceState(null, "", location.pathname + "?room=" + msg.code); } catch(e){}
    if(msg.waiting) lobbyShowLink(msg.code);
    return;
  }
  if(msg.t === "error"){
    lobbyShow(`<div class="mp-sub">⚠ ${msg.msg}</div>
      <button class="mm-btn mm-primary" onclick="location.href=location.pathname">Back to Menu</button>`);
    return;
  }
  if(msg.t === "opp"){
    showBanner(msg.online ? "Your friend is back!" : "Your friend disconnected…");
    if(!msg.online) hint("Waiting for them to reconnect — the game is saved.");
    return;
  }
  if(msg.t === "rematchWait"){ hint("Rematch requested — waiting for your friend…"); return; }
  if(msg.t === "rematchOffer"){ showBanner("REMATCH?"); hint("Your friend wants a rematch — click Play Again to accept."); return; }
  if(msg.t === "state") await mpApplyState(msg);
}

async function mpApplyState(msg){
  NET.mp = true;
  const first = !state;
  const events = msg.events || [];
  /* opponent attack animations play on the OLD board, before the new state lands */
  if(!first){
    for(const e of events){
      if(e.fn === "attack" && e.by !== "player"){
        uiBusy = true;
        try { await FX.attackAnim(e.attackerUid, e.targetUid); } catch(err){}
      }
    }
  }
  uiBusy = false;
  state = msg.state;
  if(!first){
    for(const e of events){
      if(e.fn === "damage") FX.damage(e.ref, e.amount);
      else if(e.fn === "draw") FX.draw(e.k, e.cardId);
      else if(e.fn === "crossOver") FX.crossOver(e.k, e.cardId, e.uid);
      else if(e.fn === "playedCard") FX.playedCard(e.k, e.cardId, e.fromDead, e.kind);
      else if(e.fn === "banner") FX.banner(e.text);
      else if(e.fn === "shatter") FX.shatter(e.k);
      else if(e.fn === "turnBanner") FX.banner(e.k === "player" ? "Your Turn" : "Enemy's Turn");
    }
  }
  lobbyHide();
  $("mainMenu").classList.remove("show");
  $("metaScreen").classList.remove("show");
  render();
  if(state.phase === "heroWait") hint("Champion chosen — waiting for your friend…");
  else if(state.phase === "mulliganWait") hint("Mulligan locked in — waiting for your friend…");
  else if(first) FX.banner("MATCH FOUND");
}

/* ---------- take over the engine's mutating functions ---------- */
let mpModeOn = false;
function mpEnterMode(){
  if(mpModeOn) return;
  mpModeOn = true;

  window.chooseHero      = id => mpSend({action:"chooseHero", hero:id});
  window.confirmMulligan = indices => mpSend({action:"mulligan", indices: indices || []});
  window.sacrifice       = (k, idx) => { mpSend({action:"sacrifice", idx}); return true; };
  window.sacrificeUnit   = (k, uid) => { mpSend({action:"sacrificeUnit", uid}); return true; };
  window.skipSacrifice   = () => {
    if(state && state.mode && state.mode.type === "sacrificePrompt") state.mode = null;
    mpSend({action:"skipSacrifice"});
  };
  window.playCard        = (k, idx, fromDead) => { mpSend({action:"play", idx, fromDead:!!fromDead}); return true; };
  window.castSpell       = (k, fromDead, idx, target) => { mpSend({action:"cast", fromDead:!!fromDead, idx, target: target || null}); return true; };
  window.attack          = (attackerUid, targetUid) => { mpSend({action:"attack", attackerUid, targetUid: targetUid == null ? null : targetUid}); };
  window.usePower        = (k, target) => { mpSend({action:"power", target: target || null}); return true; };
  window.useUnitPower    = (k, uid) => { mpSend({action:"unitPower", uid}); return true; };
  window.playerEndTurn   = () => mpSend({action:"endTurn"});
  window.uiNewGame       = () => { mpSend({action:"rematch"}); hint("Rematch requested — waiting for your friend…"); };
  window.newGame         = () => {};

  /* menu buttons that would start a local game now leave the match instead */
  window.menuPlay = window.menuPlayRandom = () => {
    if(confirm("Leave this multiplayer match?")) location.href = location.pathname;
  };
}

/* ---------- boot: a ?room=CODE link auto-joins ---------- */
(function(){
  const code = new URLSearchParams(location.search).get("room");
  if(code) mpJoinFromLink(code.toUpperCase());
})();
