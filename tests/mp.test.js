// DEAD ERA — multiplayer server smoke test.
// Boots server/server.js on an ephemeral port, drives two WebSocket clients
// through create → join-by-link → hero select → mulligan → turns → rejoin.
// Run with: npm run test:mp
const { spawn } = require("child_process");
const path = require("path");
const WebSocket = require("ws");

const PORT = 8971;
const ROOT = path.resolve(__dirname, "..");

let passed = 0, failed = 0;
function ok(cond, name){
  if(cond) passed++;
  else { failed++; console.error("  FAIL:", name); }
}
function eq(a, b, name){ ok(a === b, name + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

/* a tiny client: buffers messages, lets the test await the next one of a type */
function client(){
  const ws = new WebSocket("ws://127.0.0.1:" + PORT);
  const buf = [];
  const waiters = [];
  ws.on("message", raw => {
    const msg = JSON.parse(raw);
    const i = waiters.findIndex(w => w.type === msg.t);
    if(i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else buf.push(msg);
  });
  return {
    ws,
    send: m => ws.send(JSON.stringify(m)),
    open: () => new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); }),
    next(type, timeout = 4000){
      const i = buf.findIndex(m => m.t === type);
      if(i >= 0) return Promise.resolve(buf.splice(i, 1)[0]);
      return new Promise((resolve, reject) => {
        const w = {type, resolve};
        waiters.push(w);
        setTimeout(() => {
          const j = waiters.indexOf(w);
          if(j >= 0){ waiters.splice(j, 1); reject(new Error("timeout waiting for '" + type + "'")); }
        }, timeout);
      });
    },
    drain(type){ for(let i = buf.length - 1; i >= 0; i--) if(buf[i].t === type) buf.splice(i, 1); },
  };
}

async function main(){
  const server = spawn(process.execPath, [path.join(ROOT, "server", "server.js")],
    {env: {...process.env, PORT: String(PORT)}, stdio: ["ignore", "pipe", "inherit"]});
  await new Promise((res, rej) => {
    server.stdout.on("data", d => { if(String(d).includes("Dead Era server")) res(); });
    server.on("exit", c => rej(new Error("server died: " + c)));
    setTimeout(() => rej(new Error("server didn't boot")), 8000);
  });

  try {
    /* ---- create + join ---- */
    const A = client(); await A.open();
    A.send({t:"create"});
    const roomA = await A.next("room");
    ok(/^[A-Z2-9]{5}$/.test(roomA.code), "room code shape");
    ok(roomA.waiting === true, "creator waits for a friend");
    ok(!!roomA.token, "creator got a rejoin token");

    const B = client(); await B.open();
    B.send({t:"join", code: roomA.code});
    const roomB = await B.next("room");
    eq(roomB.waiting, false, "joiner starts the game");

    let stA = (await A.next("state")).state;
    let stB = (await B.next("state")).state;
    eq(stA.phase, "heroSelect", "game opens on hero select");
    const HAND0 = stA.player.hand.length; // opening-hand size is a live balance knob
    ok(HAND0 >= 5, "A sees a full opening hand (" + HAND0 + ")");
    ok(stA.player.hand.every(c => typeof c === "string"), "A's own hand is visible");
    ok(stA.ai.hand.every(c => c === null), "A can't see B's hand");
    ok(stA.player.deck.every(c => c === null), "deck contents are hidden");
    ok(stB.player.hand.every(c => typeof c === "string"), "B sees own hand under perspective swap");
    ok(stA.player.deck.length + stA.player.hand.length === 40, "random deck: 40 cards dealt");

    /* ---- hero select (both sides, perspective-checked) ---- */
    A.send({t:"action", a:{action:"chooseHero", hero:"vex"}});
    stA = (await A.next("state")).state;
    eq(stA.phase, "heroWait", "A waits after picking");
    eq(stA.player.hero, "vex", "A sees own hero");
    stB = (await B.next("state")).state;
    eq(stB.ai.hero, "vex", "B sees A's hero as the enemy");
    B.send({t:"action", a:{action:"chooseHero", hero:"morwen"}});
    stA = (await A.next("state")).state; stB = (await B.next("state")).state;
    eq(stA.phase, "mulligan", "both picked → mulligan");
    eq(stB.player.hero, "morwen", "B's own hero right under swap");

    /* ---- mulligan ---- */
    B.send({t:"action", a:{action:"mulligan", indices:[0,1]}});
    stB = (await B.next("state")).state;
    eq(stB.phase, "mulliganWait", "B waits after mulligan");
    eq(stB.player.hand.length, HAND0, "mulligan keeps the hand size");
    await A.next("state"); // A hears about B's mulligan
    A.send({t:"action", a:{action:"mulligan", indices:[]}});
    stA = (await A.next("state")).state; stB = (await B.next("state")).state;
    eq(stA.phase, "play", "both mulliganed → play");
    eq(stA.turn, "player", "creator goes first (own perspective)");
    eq(stB.turn, "ai", "joiner sees enemy turn");
    ok(stA.mode && stA.mode.type === "sacrificePrompt", "active player gets the sacrifice prompt");
    ok(!stB.mode, "waiting player sees no prompt");

    /* ---- a real turn: sacrifice, play if affordable, end ---- */
    A.send({t:"action", a:{action:"sacrifice", idx:0}});
    stA = (await A.next("state")).state; stB = (await B.next("state")).state;
    eq(stA.player.maxEss, 1, "sacrifice raised essence");
    eq(stA.player.deadHand.length, 1, "sacrifice fed the dead hand");
    ok(stB.ai.deadHand.every(c => c === null), "B can't read A's dead hand");

    /* illegal action from the wrong side: server refuses and resyncs only B */
    B.send({t:"action", a:{action:"endTurn"}});
    stB = (await B.next("state")).state;
    eq(stB.turn, "ai", "B can't end A's turn");

    A.send({t:"action", a:{action:"endTurn"}});
    stA = (await A.next("state")).state; stB = (await B.next("state")).state;
    eq(stB.turn, "player", "turn passed to B");
    eq(stB.player.hand.length, HAND0 + 1, "B drew a card on turn start");
    ok(stB.mode && stB.mode.type === "sacrificePrompt", "B gets the sacrifice prompt");

    B.send({t:"action", a:{action:"skipSacrifice"}});
    await B.next("state"); await A.next("state");
    B.send({t:"action", a:{action:"endTurn"}});
    stA = (await A.next("state")).state; stB = (await B.next("state")).state;
    eq(stA.round, 2, "round advanced when the turn came back");
    eq(stA.turn, "player", "back to A");

    /* ---- try to play every hand card; the server must never wedge, and a
       legal play (2 essence after the round-2 sacrifice) should land ---- */
    A.send({t:"action", a:{action:"sacrifice", idx:0}});
    stA = (await A.next("state")).state; A.drain("state");
    let played = false;
    for(let i = 0; i < stA.player.hand.length && !played; i++){
      A.send({t:"action", a:{action:"play", idx:i}});
      const ns = (await A.next("state")).state;
      if(ns.player.living.length > 0 || ns.player.sits.living.length > 0){ played = true; stA = ns; }
    }
    ok(true, "play attempts didn't wedge the server" + (played ? " (a card hit the field)" : ""));

    /* ---- rejoin with token: B drops and comes back into its seat ---- */
    const oppGone = A.next("opp");
    B.ws.close();
    ok((await oppGone).online === false, "A told that B went offline");
    const B2 = client(); await B2.open();
    B2.send({t:"join", code: roomA.code, token: roomB.token});
    const re = await B2.next("room");
    eq(re.code, roomA.code, "token rejoin lands in the same room");
    const stB2 = (await B2.next("state")).state;
    eq(stB2.player.hero, "morwen", "rejoined into the SAME seat with same hero");
    ok((await A.next("opp")).online === true, "A told that B is back");

    /* room full for strangers */
    const C = client(); await C.open();
    C.send({t:"join", code: roomA.code});
    ok(!!(await C.next("error")), "third wheel is rejected");

    console.log(`\nmp smoke: ${passed} passed, ${failed} failed`);
  } finally {
    server.kill();
  }
  process.exit(failed ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
