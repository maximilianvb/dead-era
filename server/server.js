"use strict";
/* ============ DEAD ERA multiplayer server ============
   - serves the static game (index.html, js/, css/, art/)
   - WebSocket rooms: create a room, share the link (?room=CODE), a friend joins
   - server-authoritative: the rules engine (js/game.js, untouched) runs here,
     once per room, via server/mp.js orchestration. Clients send actions and
     render the redacted, perspective-swapped state they get back.
   - random decks only, in-memory rooms, no accounts, no database. */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const ROOT = path.resolve(__dirname, "..");
const PORT = process.env.PORT || 8123;

/* ---------- engine factory: one isolated engine instance per room ---------- */
const ENGINE_FILES = ["js/cards.js", "js/game.js", "js/sets/veilbound.js", "js/sets/hexrelic.js", "server/mp.js"];

/* The engine logs with "You"/"AI" — patch the few perspective-baked strings to
   use player names (NAMES is injected per room). Warn loudly if game.js drifts. */
const NAME_PATCHES = [
  [`const who = k => k === "player" ? "You" : "AI";`,
   `const who = k => NAMES[k];`],
  [`const poss = k => k === "player" ? "your" : "the AI's";`,
   `const poss = k => NAMES[k] + "'s";`],
  [`const Poss = k => k === "player" ? "Your" : "The AI's";`,
   `const Poss = k => NAMES[k] + "'s";`],
  [`log(who(k) === "You" ? "Lifesteal feeds you "+n+"." : "Lifesteal feeds the AI "+n+".","s");`,
   `log("Lifesteal feeds "+who(k)+" "+n+".","s");`],
  [`log("💀 "+(k === "player" ? "Your Soul is SHATTERED" : "The AI's Soul is SHATTERED")+"! The veil tears apart.","s");`,
   `log("💀 "+who(k)+"'s Soul is SHATTERED! The veil tears apart.","s");`],
  [`log("Martyr: "+(k === "player" ? "you" : "the AI")+" drew a card.","s");`,
   `log("Martyr: "+who(k)+" drew a card.","s");`],
  [`log(unitName(u)+"'s "+pw.name+": "+(k === "player" ? "you draw" : "the AI draws")+" "+pw.n+".","s");`,
   `log(unitName(u)+"'s "+pw.name+": "+who(k)+" draws "+pw.n+".","s");`],
  [`log(HEROES.alder.name+" mends "+(k === "player" ? "your" : "his")+" wounds: +1 Life.","s");`,
   `log(HEROES.alder.name+" mends "+poss(k)+" wounds: +1 Life.","s");`],
];

function buildEngineFactory(){
  let src = ENGINE_FILES
    .map(f => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/"use strict";/g, ""))
    .join("\n;\n");
  for(const [from, to] of NAME_PATCHES){
    if(!src.includes(from)){ console.warn("[engine] name patch not found (log texts may say You/AI):", from.slice(0, 60)); continue; }
    src = src.split(from).join(to);
  }
  return new Function("NAMES", '"use strict";\n' + src + "\n;return __mp;");
}
const engineFactory = buildEngineFactory();

/* ---------- rooms ---------- */
const rooms = new Map();       // code -> room
const MAX_ROOMS = 500;
const SEATS = ["player", "ai"]; // internal engine keys: creator = "player" (goes first)

function roomCode(){
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let c;
  do { c = Array.from({length:5}, () => abc[crypto.randomInt(abc.length)]).join(""); }
  while(rooms.has(c));
  return c;
}

function cleanName(x, fallback){
  const n = String(x || "").replace(/[<>&"']/g, "").trim().slice(0, 16);
  return n || fallback;
}

function makeRoom(creatorName){
  const names = {player: cleanName(creatorName, "Player 1"), ai: "Player 2"};
  const room = {
    code: roomCode(),
    names,
    engine: engineFactory(names),
    seats: {player: null, ai: null},   // {ws, token}
    started: false,
    rematch: {player: false, ai: false},
    touched: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

const send = (ws, msg) => { if(ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };

/* map internal side keys to a viewer's perspective, and hide their opponent's draws */
const mapK = (seatK, k) => (seatK === "player" || !k) ? k : (k === "player" ? "ai" : k === "ai" ? "player" : k);
function mapEventsFor(seatK, events){
  return events.map(e => {
    const c = Object.assign({}, e);
    if(c.k) c.k = mapK(seatK, c.k);
    if(c.by) c.by = mapK(seatK, c.by);
    if(c.ref && c.ref.hero) c.ref = Object.assign({}, c.ref, {hero: mapK(seatK, c.ref.hero)});
    if(c.fn === "draw" && c.k === "ai") c.cardId = null;
    return c;
  });
}

function broadcast(room, events){
  for(const seatK of SEATS){
    const seat = room.seats[seatK];
    if(!seat || !seat.ws) continue;
    send(seat.ws, {t:"state", state: room.engine.viewFor(seatK), events: mapEventsFor(seatK, events || [])});
  }
}

function seatOf(room, ws){
  for(const seatK of SEATS){
    if(room.seats[seatK] && room.seats[seatK].ws === ws) return seatK;
  }
  return null;
}

function attach(room, seatK, ws, token){
  room.seats[seatK] = {ws, token};
  ws._room = room;
  room.touched = Date.now();
}

function handleMessage(ws, raw){
  let msg;
  try { msg = JSON.parse(raw); } catch(e){ return; }
  if(!msg || typeof msg !== "object") return;

  if(msg.t === "create"){
    if(ws._room) return;
    if(rooms.size >= MAX_ROOMS){ send(ws, {t:"error", msg:"Server is full — try again later."}); return; }
    const room = makeRoom(msg.name);
    const token = crypto.randomBytes(12).toString("hex");
    attach(room, "player", ws, token);
    send(ws, {t:"room", code: room.code, token, waiting: true});
    return;
  }

  if(msg.t === "join"){
    if(ws._room) return;
    const room = rooms.get(String(msg.code || "").toUpperCase());
    if(!room){ send(ws, {t:"error", msg:"That room doesn't exist (or expired)."}); return; }
    /* rejoin: a token puts you back in your old seat, even into a full room */
    if(msg.token){
      for(const seatK of SEATS){
        const seat = room.seats[seatK];
        if(seat && seat.token === msg.token){
          if(seat.ws && seat.ws !== ws){ try { seat.ws.close(); } catch(e){} }
          attach(room, seatK, ws, seat.token);
          send(ws, {t:"room", code: room.code, token: seat.token, waiting: !room.started});
          if(room.started) send(ws, {t:"state", state: room.engine.viewFor(seatK), events: []});
          const other = room.seats[seatK === "player" ? "ai" : "player"];
          if(other) send(other.ws, {t:"opp", online: true});
          return;
        }
      }
    }
    const free = SEATS.find(s => !room.seats[s]);
    if(!free){ send(ws, {t:"error", msg:"That room is already full."}); return; }
    const token = crypto.randomBytes(12).toString("hex");
    room.names[free] = cleanName(msg.name, free === "player" ? "Player 1" : "Player 2");
    attach(room, free, ws, token);
    send(ws, {t:"room", code: room.code, token, waiting: false});
    if(!room.started && room.seats.player && room.seats.ai){
      room.started = true;
      room.engine.newGame();
      room.engine.takeEvents();
      broadcast(room, []);
    } else if(room.started){
      send(ws, {t:"state", state: room.engine.viewFor(free), events: []});
    }
    return;
  }

  const room = ws._room;
  if(!room) return;
  const seatK = seatOf(room, ws);
  if(!seatK) return;
  room.touched = Date.now();

  if(msg.t === "action" && msg.a){
    if(msg.a.action === "rematch"){
      if(!room.started || !room.engine.state || !room.engine.state.winner) return;
      room.rematch[seatK] = true;
      const other = seatK === "player" ? "ai" : "player";
      if(room.rematch[other]){
        room.rematch = {player: false, ai: false};
        room.engine.newGame();
        room.engine.takeEvents();
        broadcast(room, []);
      } else {
        send(ws, {t:"rematchWait"});
        if(room.seats[other]) send(room.seats[other].ws, {t:"rematchOffer"});
      }
      return;
    }
    if(!room.started) return;
    const ok = room.engine.action(seatK, msg.a);
    const events = room.engine.takeEvents();
    if(ok !== false){
      broadcast(room, events);
    } else {
      /* rejected: resync just this client with the authoritative state */
      send(ws, {t:"state", state: room.engine.viewFor(seatK), events: []});
    }
    return;
  }
}

/* ---------- websocket server ---------- */
const server = http.createServer(serveStatic);
const wss = new WebSocketServer({server, maxPayload: 64 * 1024});

wss.on("connection", ws => {
  ws._alive = true;
  ws.on("pong", () => { ws._alive = true; });
  ws.on("message", raw => { try { handleMessage(ws, raw); } catch(err){ console.error("msg error:", err); } });
  ws.on("close", () => {
    const room = ws._room;
    if(!room) return;
    const seatK = seatOf(room, ws);
    if(seatK){
      room.seats[seatK].ws = null;
      const other = room.seats[seatK === "player" ? "ai" : "player"];
      if(other && other.ws) send(other.ws, {t:"opp", online: false});
    }
  });
});

setInterval(() => {
  wss.clients.forEach(ws => {
    if(!ws._alive) return ws.terminate();
    ws._alive = false;
    ws.ping();
  });
}, 30000).unref();

/* rooms with nobody connected for 30 min are reclaimed */
setInterval(() => {
  const now = Date.now();
  for(const [code, room] of rooms){
    const empty = SEATS.every(s => !room.seats[s] || !room.seats[s].ws);
    if(empty && now - room.touched > 30 * 60 * 1000) rooms.delete(code);
  }
}, 60000).unref();

/* ---------- static files ---------- */
const MIME = {
  ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".css":"text/css; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg",
  ".svg":"image/svg+xml", ".json":"application/json", ".ico":"image/x-icon",
  ".woff2":"font/woff2", ".md":"text/plain; charset=utf-8",
};
const ALLOWED_DIRS = ["js", "css", "art"];

function serveStatic(req, res){
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch(e){ res.writeHead(400); res.end(); return; }
  if(urlPath === "/favicon.ico"){ res.writeHead(204); res.end(); return; }
  if(urlPath === "/" || urlPath === "/index.html") urlPath = "/index.html";
  else if(!ALLOWED_DIRS.some(d => urlPath.startsWith("/" + d + "/"))){ res.writeHead(404); res.end("not found"); return; }
  const file = path.join(ROOT, urlPath);
  if(!file.startsWith(ROOT + path.sep) || urlPath.includes("..")){ res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if(err){ res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": urlPath.startsWith("/art/") ? "public, max-age=86400" : "no-cache",
    });
    res.end(data);
  });
}

server.listen(PORT, () => console.log("Dead Era server on :" + PORT));
