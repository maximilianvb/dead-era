// UI interaction test: drives the real game in headless Edge via puppeteer-core.
// Run with: npm install, then: npm run test:ui
const fs = require("fs");
const path = require("path");

const EDGE = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
              "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(p => fs.existsSync(p));
const URL = "file:///" + path.resolve(__dirname, "..", "index.html").replace(/\\/g, "/");
const sleep = ms => new Promise(r => setTimeout(r, ms));
let checks = 0, failures = [];
const ok = (cond, name) => { checks++; if(!cond) failures.push(name); console.log((cond ? "  ok  " : "  FAIL") + " " + name); };

(async () => {
  const puppeteer = (await import("puppeteer-core")).default;
  const browser = await puppeteer.launch({executablePath: EDGE, headless: "new",
    args:["--disable-gpu","--window-size=1720,1050","--allow-file-access-from-files"]});
  const page = await browser.newPage();
  await page.setViewport({width:1720, height:1050});
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if(m.type() === "error") errors.push("console: " + m.text()); });

  await page.goto(URL, {waitUntil:"load"});
  await sleep(600);

  // main menu → play
  ok(await page.$eval("#mainMenu", el => el.classList.contains("show")), "main menu shown on boot");
  await page.click(".mm-btn.mm-primary");
  await sleep(300);
  ok(await page.$eval("#heroSelect", el => el.classList.contains("show")), "hero select shown after Play");
  await page.click(".hero-card:nth-child(2)"); // Morwen
  await sleep(400);
  ok(await page.evaluate(() => state.player.hero === "morwen" && state.phase === "play"), "hero chosen");
  ok(await page.evaluate(() => state.mode && state.mode.type === "sacrificePrompt"), "sacrifice prompt active");

  // sacrifice via click
  const deadHandBefore = await page.evaluate(() => state.player.deadHand.length);
  await page.click("#pHand .card.sacmode");
  await sleep(300);
  ok(await page.evaluate(n => state.player.deadHand.length === n + 1, deadHandBefore), "clicking a card sacrifices it");
  ok(await page.evaluate(() => state.player.maxEss === 1 && state.player.deadEss === 0), "essence 1 / dead energy 0 after first sacrifice");
  ok(await page.$eval("#mainMenu", el => !el.classList.contains("show")), "menu hidden during play");

  // play a living card if affordable
  const played = await page.evaluate(() => {
    const s = state.player;
    const i = s.hand.findIndex(id => DEFS[id].type === "unit" && DEFS[id].cost <= s.essence);
    if(i < 0) return "none-affordable";
    const before = s.living.length;
    clickHandCard(false, i);
    return s.living.length === before + 1 ? "played" : "failed";
  });
  ok(played !== "failed", "playing an affordable unit works (" + played + ")");

  // play from dead hand with dead energy
  const deadPlayed = await page.evaluate(() => {
    const s = state.player;
    const i = s.deadHand.findIndex(id => DEFS[id].type === "unit" && DEFS[id].cost <= s.deadEss);
    if(i < 0) return "none";
    const before = s.dead.length;
    clickHandCard(true, i);
    return s.dead.length === before + 1 ? "played" : "failed";
  });
  ok(deadPlayed !== "failed", "dead-hand play with dead energy works (" + deadPlayed + ")");

  // end turn → AI turn runs with animations → back to player
  await page.click("#endBtn");
  const back = await page.waitForFunction(() => state.turn === "player" && state.round === 2, {timeout: 45000}).catch(() => null);
  ok(!!back, "AI turn completes and returns to player (round 2)");

  // hover preview appears over a hand card
  await page.hover("#pHand .card");
  await sleep(200);
  ok(await page.$eval("#preview", el => el.classList.contains("show")), "hover preview shows");

  // packs screen: open, rip, flip
  await page.click("#packsBtn");
  await sleep(250);
  const packs = await page.evaluate(() => meta.packs);
  await page.click("#packObj");
  await sleep(500);
  ok(await page.evaluate(p => meta.packs === p - 1, packs), "ripping a pack decrements pack count");
  ok((await page.$$(".pcard-flip")).length === 5, "pack reveals 5 cards");
  await page.evaluate(() => document.querySelectorAll(".pcard-flip").forEach(e => e.classList.add("flipped")));
  await sleep(300);
  await page.evaluate(() => closeMetaScreen());

  // builder: add/remove/save flow
  await page.click("header button[onclick='openBuilderScreen()']");
  await sleep(250);
  ok(await page.$eval("#metaScreen", el => el.classList.contains("show")), "builder opens");
  const deckState = await page.evaluate(() => {
    resetDraftDeck();
    builderRemove(draftDeck[0]);
    const after = draftDeck.length;
    return {after};
  });
  ok(deckState.after === 39, "builder remove works (40-card decks)");
  ok(await page.evaluate(() => document.querySelector(".savedeck").disabled), "save disabled at 39 cards");
  await page.evaluate(() => closeMetaScreen());

  // menu → continue keeps the running game
  await page.evaluate(() => showMainMenu());
  await sleep(150);
  ok(await page.$eval("#mmContinue", el => el.style.display !== "none"), "Continue offered for a running game");
  await page.click("#mmContinue");
  await sleep(150);
  ok(await page.evaluate(() => state.round >= 2), "continue preserves the game");

  ok(errors.length === 0, "zero JS errors during the whole session" + (errors.length ? " → " + errors.slice(0,3).join(" | ") : ""));
  await browser.close();
  console.log(`\nUI TEST: ${checks - failures.length}/${checks} passed`);
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error("UI TEST CRASH:", e.message); process.exit(1); });
