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
  ok((await page.$$(".hero-card")).length === 8, "eight champions offered");
  await page.click(".hero-card:nth-child(2)"); // Morwen
  await sleep(400);
  ok(await page.evaluate(() => state.player.hero === "morwen" && state.phase === "mulligan"), "hero chosen → mulligan phase");

  // mulligan: toggle a card, untoggle it, keep all
  ok(await page.$eval("#mulligan", el => el.classList.contains("show")), "mulligan screen shown");
  ok((await page.$$(".mg-card")).length === 7, "mulligan shows the 7 opening cards");
  await page.click(".mg-card"); await sleep(120);
  ok(await page.$eval(".mg-card", el => el.classList.contains("toss")), "clicking marks a card for exchange");
  await page.click(".mg-card"); await sleep(120);
  ok(await page.$eval(".mg-card", el => !el.classList.contains("toss")), "clicking again keeps it");
  await page.click("#mgConfirm");
  await sleep(400);
  ok(await page.evaluate(() => state.phase === "play"), "confirming the mulligan starts the game");
  ok(await page.evaluate(() => state.mode && state.mode.type === "sacrificePrompt"), "sacrifice prompt active");
  ok(await page.$eval("#powerBtn", el => el.style.display !== "none" && el.textContent.includes("Beckon")), "hero power button shows Morwen's power");

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

  // play from dead hand with dead energy (fresh arrivals are locked for a turn)
  const deadPlayed = await page.evaluate(() => {
    const s = state.player;
    const settled = s.deadHand.length - s.deadFresh; // cooldown: only settled cards play
    const i = s.deadHand.findIndex((id, j) => j < settled && DEFS[id].type === "unit" && DEFS[id].cost <= s.deadEss);
    if(i < 0) return "none";
    const before = s.dead.length;
    clickHandCard(true, i);
    return s.dead.length === before + 1 ? "played" : "failed";
  });
  ok(deadPlayed !== "failed", "dead-hand play with dead energy works (" + deadPlayed + ")");
  // the freshly sacrificed card must refuse to play this turn
  const coolLocked = await page.evaluate(() => {
    const s = state.player;
    if(!s.deadFresh) return "no-fresh-card";
    const i = s.deadHand.length - 1;
    s.deadEss = 9; render();
    const before = s.dead.length + s.living.length + s.sits.dead.length + s.sits.living.length;
    clickHandCard(true, i);
    return (s.dead.length + s.living.length + s.sits.dead.length + s.sits.living.length) === before ? "locked" : "leaked";
  });
  ok(coolLocked !== "leaked", "fresh dead-hand card is locked this turn (" + coolLocked + ")");

  // end turn → AI turn runs with animations → back to player
  await page.click("#endBtn");
  const back = await page.waitForFunction(() => state.turn === "player" && state.round === 2, {timeout: 45000}).catch(() => null);
  ok(!!back, "AI turn completes and returns to player (round 2)");

  // hero power: bank channel, click the button, Beckon fills the dead hand
  const powered = await page.evaluate(() => {
    skipSacrifice(); // powers are locked until the sacrifice prompt is resolved
    state.player.channel = 5; render();
    const before = state.player.deadHand.length;
    uiHeroPower();
    return state.player.deadHand.length === before + 1 && state.player.channel === 2;
  });
  ok(powered, "hero power button fires Beckon the Grave (mills 1, spends 3 channel)");

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

  // random deck match: both sides get fresh well-formed 40-card decks
  await page.evaluate(() => showMainMenu());
  await sleep(150);
  await page.click(".mm-btn[onclick='menuPlayRandom()']");
  await sleep(300);
  ok(await page.$eval("#heroSelect", el => el.classList.contains("show")), "random match: hero select shows");
  await page.click(".hero-card:nth-child(1)");
  await sleep(300);
  await page.click("#mgConfirm");
  await sleep(400);
  const rand = await page.evaluate(() => ({
    p: state.player.deck.length + state.player.hand.length + state.player.deadHand.length,
    a: state.ai.deck.length + state.ai.hand.length + state.ai.deadHand.length,
  }));
  ok(rand.p === 40 && rand.a === 40, "random match: both decks are 40 cards (got " + rand.p + "/" + rand.a + ")");

  ok(errors.length === 0, "zero JS errors during the whole session" + (errors.length ? " → " + errors.slice(0,3).join(" | ") : ""));
  await browser.close();
  console.log(`\nUI TEST: ${checks - failures.length}/${checks} passed`);
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error("UI TEST CRASH:", e.message); process.exit(1); });
