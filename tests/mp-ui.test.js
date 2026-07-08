// Multiplayer UI test: boots server/server.js, then drives TWO headless-Edge
// pages through the real link-invite flow: create link → friend opens link →
// hero select → mulligan → sacrifice → turn passing. Asserts zero JS errors.
// Run with: node tests/mp-ui.test.js
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const EDGE = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
              "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(p => fs.existsSync(p));
const PORT = 8972;
const ROOT = path.resolve(__dirname, "..");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0, failures = [];
const ok = (cond, name) => { checks++; if(!cond) failures.push(name); console.log((cond ? "  ok  " : "  FAIL") + " " + name); };

/* puppeteer's mouse click hangs on CDP scrollIntoView for these fullscreen
   overlays over http — dispatch real DOM clicks instead */
const click = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  if(!el) throw new Error("no element: " + s);
  el.click();
}, sel);

async function waitFor(page, fn, what, timeout = 6000){
  const t0 = Date.now();
  while(Date.now() - t0 < timeout){
    if(await page.evaluate(fn)) return true;
    await sleep(120);
  }
  throw new Error("timeout waiting for: " + what);
}

(async () => {
  const server = spawn(process.execPath, [path.join(ROOT, "server", "server.js")],
    {env: {...process.env, PORT: String(PORT)}, stdio: ["ignore", "pipe", "inherit"]});
  await new Promise((res, rej) => {
    server.stdout.on("data", d => { if(String(d).includes("Dead Era server")) res(); });
    setTimeout(() => rej(new Error("server didn't boot")), 8000);
  });

  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({executablePath: EDGE, headless: "new",
    args:["--disable-gpu","--window-size=1720,1050"]});
  const errors = {A: [], B: []};
  const newPage = async who => {
    const p = await browser.newPage();
    await p.setViewport({width:1720, height:1050});
    p.on("pageerror", e => errors[who].push("pageerror: " + e.message));
    p.on("console", m => { if(m.type() === "error") errors[who].push("console: " + m.text()); });
    return p;
  };

  try {
    /* ---- A creates a game link from the main menu ---- */
    const A = await newPage("A");
    await A.goto(`http://127.0.0.1:${PORT}/`, {waitUntil:"load"});
    await sleep(500);
    await A.$$eval("#mainMenu .mm-btn", els => els.find(e => e.textContent.includes("Play a Friend")).click());
    await waitFor(A, () => document.querySelector("#mpLobby.show"), "lobby open");
    ok(true, "Play a Friend opens the lobby");
    await A.$$eval("#mpLobby .mm-btn", els => els.find(e => e.textContent.includes("Create Game Link")).click());
    await waitFor(A, () => document.querySelector("#mpLink"), "invite link");
    const link = await A.$eval("#mpLink", el => el.textContent);
    ok(/\?room=[A-Z2-9]{5}$/.test(link), "invite link has a room code (" + link + ")");
    ok(await A.evaluate(() => location.search.includes("room=")), "creator URL updated for refresh-rejoin");

    /* ---- B opens the link: the game starts for both ---- */
    const B = await newPage("B");
    await B.goto(link, {waitUntil:"load"});
    await waitFor(A, () => document.querySelector("#heroSelect.show"), "A hero select");
    await waitFor(B, () => document.querySelector("#heroSelect.show"), "B hero select");
    ok(true, "both players reach hero select when the link is opened");
    ok(await A.evaluate(() => !document.querySelector("#mpLobby.show") && !document.querySelector("#mainMenu.show")), "menus closed once matched");

    /* ---- hero select on both sides ---- */
    await A.evaluate(() => document.querySelectorAll(".hero-card")[2].click()); // Vex
    await waitFor(A, () => state && state.phase === "heroWait", "A heroWait");
    ok(true, "A picked a champion and waits");
    await B.evaluate(() => document.querySelectorAll(".hero-card")[1].click()); // Morwen
    await waitFor(A, () => state && state.phase === "mulligan", "A mulligan");
    await waitFor(B, () => state && state.phase === "mulligan", "B mulligan");
    ok(await A.evaluate(() => state.ai.hero === "morwen"), "A sees B's champion as the enemy");
    ok(await B.evaluate(() => state.ai.hero === "vex"), "B sees A's champion as the enemy");

    /* ---- mulligan: A exchanges one card, B keeps all ---- */
    await click(A, ".mg-card"); await sleep(150);
    await click(A, "#mgConfirm");
    await waitFor(A, () => state && state.phase === "mulliganWait", "A mulliganWait");
    await click(B, "#mgConfirm");
    await waitFor(A, () => state && state.phase === "play", "A play phase");
    await waitFor(B, () => state && state.phase === "play", "B play phase");
    ok(await A.evaluate(() => state.turn === "player" && state.mode && state.mode.type === "sacrificePrompt"),
      "creator's turn with sacrifice prompt");
    ok(await B.evaluate(() => state.turn === "ai" && !state.mode), "joiner sees enemy turn, no prompt");
    ok(await B.evaluate(() => state.player.hand.every(c => typeof c === "string")), "B sees own cards");
    ok(await B.evaluate(() => state.ai.hand.every(c => c === null)), "B cannot see A's cards");

    /* ---- A sacrifices; B watches the count change ---- */
    await click(A, "#pHand .card.sacmode");
    await waitFor(A, () => state.player.maxEss === 1, "A essence after sacrifice");
    await waitFor(B, () => state.ai.deadHand.length === 1, "B sees A's dead hand grow");
    ok(true, "sacrifice propagates to both boards");
    ok(await B.evaluate(() => document.querySelector("#logbox").textContent.includes("Player 1 sacrificed")),
      "log speaks in player names, not You/AI");

    /* ---- pass the turn: B sacrifices via click, ends turn back ---- */
    const bHand0 = await B.evaluate(() => state.player.hand.length);
    await click(A, "#endBtn");
    await waitFor(B, () => state.turn === "player" && state.mode && state.mode.type === "sacrificePrompt", "B's turn");
    ok(await B.evaluate(n => state.player.hand.length === n + 1, bHand0), "B drew a turn-start card");
    await click(B, "#pHand .card.sacmode");
    await waitFor(B, () => state.player.maxEss === 1, "B sacrificed");
    /* B plays an affordable unit if one exists — through the real click path */
    const bPlayed = await B.evaluate(() => {
      const s = state.player;
      const i = s.hand.findIndex(id => DEFS[id] && DEFS[id].type === "unit" && !DEFS[id].blood && DEFS[id].cost <= s.essence);
      if(i < 0) return "none-affordable";
      clickHandCard(false, i);
      return "clicked";
    });
    if(bPlayed === "clicked"){
      await waitFor(B, () => state.player.living.length === 1, "B's unit on field");
      await waitFor(A, () => state.ai.living.length === 1, "A sees B's unit");
      ok(true, "playing a unit propagates to both boards");
    } else ok(true, "no affordable unit turn 1 (" + bPlayed + ")");
    await click(B, "#endBtn");
    await waitFor(A, () => state.turn === "player" && state.round === 2, "round 2 for A");
    ok(true, "full turn cycle: round 2 begins for the creator");

    /* ---- refresh-rejoin: B reloads mid-game and lands back in the seat ---- */
    await B.reload({waitUntil:"load"});
    await waitFor(B, () => typeof state !== "undefined" && state && state.phase === "play" && state.player.hero === "morwen", "B rejoined");
    ok(true, "reloading the page rejoins the same seat mid-game");

    ok(errors.A.length === 0, "no JS errors on A" + (errors.A.length ? ": " + errors.A[0] : ""));
    ok(errors.B.length === 0, "no JS errors on B" + (errors.B.length ? ": " + errors.B[0] : ""));
  } catch(err){
    failures.push(String(err.message || err));
    console.error("  FAIL " + err.message);
    console.error("  errors A:", errors.A, "errors B:", errors.B);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\nmp-ui: ${checks - failures.length}/${checks} ok${failures.length ? " — FAILURES: " + failures.join(" | ") : ""}`);
  process.exit(failures.length ? 1 : 0);
})();
