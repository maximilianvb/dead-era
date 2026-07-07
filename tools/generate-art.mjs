#!/usr/bin/env node
/* DEAD ERA art generator.
   For every card it renders TWO images: the living face and the dead ("crossed
   over") face, via a local ComfyUI API (default http://127.0.0.1:8188) using an
   SDXL-turbo class checkpoint. Optionally enriches prompts with a local Ollama
   model first. Ollama itself cannot generate images — ComfyUI does.

   Usage:
     node tools/generate-art.mjs                 # generate everything missing
     node tools/generate-art.mjs --force         # regenerate all
     node tools/generate-art.mjs --only smite    # one card
     node tools/generate-art.mjs --no-llm        # skip Ollama prompt enrichment
     node tools/generate-art.mjs --prompts-only  # just write art/prompts.json

   Outputs: art/<cardId>_<living|dead>.png + art/manifest.js + art/prompts.json */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FINAL_DIR = path.join(ROOT, "art");
/* --staged: render outside the repo, publish everything in one go at the end
   (so a live-server watching the repo doesn't reload during generation). */
const STAGED = process.argv.includes("--staged");
const ART_DIR = STAGED ? (process.env.ART_STAGING || "I:\\dead-era-ai\\art-staging") : FINAL_DIR;
const COMFY = process.env.COMFY_URL || "http://127.0.0.1:8188";
const OLLAMA = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = argVal("--model") || "qwen2.5:14b";
const CHECKPOINT = argVal("--checkpoint") || "DreamShaperXL_Turbo_v2_1.safetensors";
const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const NO_LLM = args.includes("--no-llm");
const PROMPTS_ONLY = args.includes("--prompts-only");
const ONLY = argVal("--only");

function argVal(name){
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i+1] : null;
}

const STYLE_LIVING = "dark fantasy trading card game illustration, painterly oil style, dramatic torchlight, rich muted colors, detailed, centered subject, gloomy ancient forest atmosphere, no text";
const STYLE_DEAD = "dark fantasy trading card game illustration, spectral undead variant, eerie violet and pale cyan palette, ghostly rim light, decayed and haunting, drifting mist of the netherworld, no text";
const NEGATIVE = "text, letters, watermark, logo, frame, border, signature, ui, blurry, low quality, deformed hands, extra limbs, jpeg artifacts";

/* Subject per face — the dead face is the card's creepy counterpart. */
const SUBJECTS = {
  peasant:     {l:"a ragged medieval peasant militiaman gripping a pitchfork, determined and afraid",
                d:"a skeletal peasant clawing up out of grave soil, broken pitchfork beside it, wisps of soul-light"},
  gravrat:     {l:"a large grey rat with one red eye crouched on a mossy gravestone",
                d:"an undead skeletal rat with exposed spine and glowing red eye"},
  hound:       {l:"a fierce war hound mid-leap, charging with bared teeth",
                d:"a translucent spectral barrow hound with glowing blue eyes, trailing ghost-mist"},
  shambler:    {l:"a half-buried human skeleton stirring in forest earth, one bony arm reaching out of the grave",
                d:"a risen skeleton warrior standing tall and complete, red points of light in its eye sockets"},
  priest:      {l:"a humble village priest in rough white robes holding a wooden staff, soft holy glow",
                d:"a heretic shade — a dark hooded phantom of a corrupted priest, two faint blue eyes in a black cowl"},
  collector:   {l:"a grim gravedigger at night with a worn shovel and a heavy corpse sack over his shoulder",
                d:"an animate burlap grave-sack creature stitched together with bones, two orange glowing eyes"},
  flameblade:  {l:"a battered knight raising a sword wreathed in living flame, firelight on dented armor",
                d:"an ashen knight with an extinguished smoking sword, cracked grey armor, one last ember at the blade's tip"},
  plague:      {l:"a plague cultist wreathed in sickly green miasma and flies, wearing a rotting skull mask",
                d:"a hollow ribcage wraith leaking luminous green miasma, no flesh, floating"},
  warden:      {l:"a stern cloaked warden holding up a lantern of glowing blue soul-light",
                d:"a spectral warden of souls whose violet lantern holds tiny screaming faces of trapped spirits"},
  wraithcaller:{l:"a purple-robed summoner with raised arms, small glowing spirits circling overhead",
                d:"a wraith lord crowned in tarnished gold, tattered robes fraying into mist, commanding a host of spirits"},
  ghoul:       {l:"a hunched grey ghoul with burning orange eyes lurking in darkness, long claws",
                d:"a charred cinder wretch, blackened cracked skin glowing from within with embers"},
  deathknight: {l:"an armored death knight with a horned helm and burning red visor slit, massive pauldrons",
                d:"a dread revenant — spectral armored giant lit by violet ghost-fire, horned helm, half-transparent"},
  spirit:      {l:"a small glowing pale-blue wisp spirit with a trailing tail, eerie and almost cute",
                d:"a small glowing pale-blue wisp spirit with a trailing tail, eerie and almost cute"},
  cull:        {l:"a ritual sacrificial dagger pointing down over a dark stone altar, a single drop of blood",
                d:"a human soul ascending in a column of serene golden light from a dark battlefield"},
  smite:       {l:"a massive forked golden lightning bolt striking down from black storm clouds",
                d:"three glowing violet spectral claw slashes rending through darkness"},
  resurrection:{l:"a radiant figure rising from an open grave, golden light rays bursting upward, awe",
                d:"a radiant figure rising from an open grave, golden light rays bursting upward, seen from the ghostly other side"},
  tome:        {l:"an ancient open tome on a lectern, golden runes glowing above its pages",
                d:"a black grimoire bound in cracked dark leather, purple runes glowing, wisps seeping from its pages"},
  grove:       {l:"a serene sacred grove, one great sunlit ancient tree with golden leaves",
                d:"a weeping burial barrow mound in cold mist, a single blue wisp hovering above it"},
  /* Expansion: Tolls of the Veil */
  gravedigger: {l:"a gravedigger's shovel standing in fresh grave soil beside a dim lantern at dusk",
                d:"a spectral grave mound, unearthed pale bones, a single wisp hovering over the digger's shovel"},
  pallbearer:  {l:"a hooded pallbearer carrying a heavy wooden coffin through churchyard mist",
                d:"a coffin floating upright wrapped in pale blue ghost-light, its lid slightly open"},
  ratcatcher:  {l:"a medieval ratcatcher with a cage on a pole, rats scurrying around his boots",
                d:"a shadowy vermin shade dissolving at the edges into a swarm of spectral rats with red eyes"},
  sentinel:    {l:"a massive kite shield planted before a crypt door, gold cross emblem, torchlight",
                d:"a ghostly cracked tower shield glowing with violet runes, guarding a sepulcher in the dark"},
  bonegolem:   {l:"a hulking golem assembled from grave-iron, chains and armor scraps, ember eyes",
                d:"a colossus of fused human bones, pale blue soul-light burning between its joints"},
  ferryman:    {l:"a hooded ferryman poling a narrow wooden boat across a black glass river",
                d:"the ferryman as a ghost of golden lantern-light, boat of mist, coins glinting in the water"},
  banish:      {l:"a golden ring portal swallowing a warrior into a starless void, robes whipping inward",
                d:"a jagged violet tear ripped through the fabric of a dark netherworld sky"},
  soultap:     {l:"an open pale hand drawing threads of violet soul-light up from below",
                d:"a spectral hand reaching through a torn veil, drawing red drops of life upward"},
  requiem:     {l:"a great bronze funeral bell mid-toll, golden sound waves rippling through gloom",
                d:"a black spectral bell tolling rings of violet shockwave in an endless dark"},
  siphon:      {l:"a glowing heart cradled by green threads of light drawing in from fallen soldiers",
                d:"a marble skull drinking in ribbons of violet soul-light from the mist"},
  /* Expansion II: Rites & Ruin */
  dispel:      {l:"a glowing golden knot of magical threads being pulled apart by unseen hands",
                d:"a violet blade of light severing a ribbon of spectral energy in darkness"},
  darkpact:    {l:"a quill signing a black parchment contract, one drop of blood as the seal",
                d:"a skeletal hand signing a glowing violet contract in a void"},
  surge:       {l:"a surging orb of bright blue arcane energy crackling above an open palm",
                d:"a surging orb of violet grave-energy crackling above a bone altar"},
  mend:        {l:"warm golden healing light descending in rays onto an open wound, serene",
                d:"ghostly threads of pale light stitching a cracked translucent soul back together"},
  haunt:       {l:"a dying soldier making one last heroic charge, wreathed in golden battle-light",
                d:"a spirit releasing a final devastating wail, shockwaves of violet sound"},
  warbanner:   {l:"a tall crimson war banner with a gold sigil planted on a battlefield at dawn",
                d:"a standard made of lashed bones and pale cloth planted in grave soil, wisps circling"},
  font:        {l:"a small stone fountain flowing with luminous blue essence in a mossy clearing",
                d:"a cracked stone font overflowing with glowing violet rot and mist"},
  ward:        {l:"a protective circle of animated thorny vines glowing faintly green",
                d:"a circle of pale howling faces forming a spectral barrier"},
  /* Units that cross over as omens */
  candlemaid:  {l:"a young maiden in grey robes shielding a small candle flame with her hand, hopeful",
                d:"a lone candle with a pale blue flame burning in a dark shrine, wax pale as bone"},
  drummer:     {l:"a war drummer mid-strike on a great battle drum, torn banners behind him",
                d:"a black war drum beating itself in darkness, violet shockwave rings radiating"},
  lamplighter: {l:"a lamplighter with a long brass pole lighting a street lantern at foggy dusk",
                d:"a sickly green-violet corpse light hovering over a black marsh, dampening all around it"},
  /* Champions — living portrait + shattered/dead face. */
  h_alder:     {l:"portrait of a noble paladin knight, leaf-emblazoned shield, gold-trimmed armor, kind stern face",
                d:"portrait of the same paladin as a pale spectral ghost knight, hollow glowing blue eyes, translucent armor"},
  h_morwen:    {l:"portrait of a pale queen in black mourning dress with an obsidian crown, regal and cold",
                d:"portrait of a skeletal lich queen, glowing violet crown, tattered royal shroud, terrifying majesty"},
  h_vex:       {l:"portrait of a hooded reaper with faint golden eyes, great scythe over the shoulder",
                d:"portrait of a scythe-wielding wraith made of violet mist, pale blue eyes, crown of smoke"},
  h_brann:     {l:"portrait of a weathered old king wearing a crown of embers, ash dusted in his beard",
                d:"portrait of an ash-white king with cracked skin glowing from within with embers, hollow orange eyes"},
};

async function ollamaEnrich(base, deadFace){
  const res = await fetch(OLLAMA + "/api/generate", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({model: MODEL, stream:false, options:{temperature:.8},
      prompt: `Rewrite this into ONE vivid image-generation prompt line (max 60 words), keeping the subject identical, adding concrete visual detail about lighting, texture and mood. ${deadFace ? "It is the undead/spectral 'dead dimension' version — emphasize eerie, ghostly, decayed." : ""} No preamble, output only the prompt line.\n\nSubject: ${base}`}),
  });
  if(!res.ok) throw new Error("ollama HTTP " + res.status);
  const data = await res.json();
  const line = (data.response || "").trim().split("\n")[0].replace(/^["']|["']$/g, "");
  return line.length > 20 ? line : base;
}

function comfyWorkflow(prompt, seed){
  return {
    "1": {class_type:"CheckpointLoaderSimple", inputs:{ckpt_name: CHECKPOINT}},
    "2": {class_type:"CLIPTextEncode", inputs:{clip:["1",1], text: prompt}},
    "3": {class_type:"CLIPTextEncode", inputs:{clip:["1",1], text: NEGATIVE}},
    "4": {class_type:"EmptyLatentImage", inputs:{width:768, height:512, batch_size:1}},
    "5": {class_type:"KSampler", inputs:{model:["1",0], positive:["2",0], negative:["3",0], latent_image:["4",0],
          seed, steps:7, cfg:2, sampler_name:"dpmpp_sde", scheduler:"karras", denoise:1}},
    "6": {class_type:"VAEDecode", inputs:{samples:["5",0], vae:["1",2]}},
    "7": {class_type:"SaveImage", inputs:{images:["6",0], filename_prefix:"deadera"}},
  };
}

async function comfyGenerate(prompt, seed){
  const q = await fetch(COMFY + "/prompt", {method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({prompt: comfyWorkflow(prompt, seed)})});
  if(!q.ok) throw new Error("ComfyUI queue failed: HTTP " + q.status + " " + (await q.text()).slice(0,300));
  const {prompt_id} = await q.json();
  for(let i = 0; i < 240; i++){
    await new Promise(r => setTimeout(r, 1000));
    const h = await (await fetch(COMFY + "/history/" + prompt_id)).json();
    const entry = h[prompt_id];
    if(!entry) continue;
    if(entry.status && entry.status.status_str === "error") throw new Error("ComfyUI error: " + JSON.stringify(entry.status.messages).slice(0,300));
    const out = entry.outputs && entry.outputs["7"];
    if(out && out.images && out.images.length){
      const img = out.images[0];
      const bin = await fetch(COMFY + "/view?filename=" + encodeURIComponent(img.filename) +
        "&subfolder=" + encodeURIComponent(img.subfolder || "") + "&type=" + (img.type || "output"));
      return Buffer.from(await bin.arrayBuffer());
    }
  }
  throw new Error("ComfyUI timeout");
}

async function alive(url){
  try { const r = await fetch(url, {signal: AbortSignal.timeout(3000)}); return r.ok; } catch { return false; }
}

/* Expansion sets carry their own art prompts (def.art = {l, d}) — merge them in. */
function loadSetSubjects(){
  const setsDir = path.join(ROOT, "js", "sets");
  if(!fs.existsSync(setsDir)) return;
  for(const f of fs.readdirSync(setsDir).filter(x => x.endsWith(".js"))){
    try {
      const src = fs.readFileSync(path.join(setsDir, f), "utf8").replace(/"use strict";/, "");
      const setObj = new Function("DEFS", src + "\n;return typeof VEILBOUND !== 'undefined' ? VEILBOUND : {};")({});
      let n = 0;
      for(const [id, def] of Object.entries(setObj)){
        if(def.art && def.art.l){ SUBJECTS[id] = {l: def.art.l, d: def.art.d || def.art.l}; n++; }
      }
      console.log(`loaded ${n} art subjects from js/sets/${f}`);
    } catch(e){ console.log(`could not load subjects from ${f}: ${e.message}`); }
  }
}

(async () => {
  fs.mkdirSync(ART_DIR, {recursive:true});
  fs.mkdirSync(FINAL_DIR, {recursive:true});
  loadSetSubjects();
  const comfyUp = await alive(COMFY + "/system_stats");
  const ollamaUp = !NO_LLM && await alive(OLLAMA + "/api/tags");
  console.log(`ComfyUI at ${COMFY}: ${comfyUp ? "UP" : "NOT RUNNING"} · Ollama prompt enrichment: ${ollamaUp ? "ON ("+MODEL+")" : "off"}${STAGED ? " · STAGED to " + ART_DIR : ""}`);
  if(!comfyUp && !PROMPTS_ONLY){
    console.log("ComfyUI is not reachable — writing prompts only. Start ComfyUI and re-run to render images.");
  }

  const prompts = {};
  const manifest = {};
  // preserve previously published art in the manifest
  for(const f of fs.existsSync(FINAL_DIR) ? fs.readdirSync(FINAL_DIR) : []){
    if(f.endsWith(".png")) manifest[f.replace(/\.png$/, "")] = 1;
  }

  let seed = 421337;
  for(const [id, faces] of Object.entries(SUBJECTS)){
    if(ONLY && id !== ONLY) continue;
    for(const face of ["living","dead"]){
      const key = `${id}_${face}`;
      const dead = face === "dead";
      let prompt = (dead ? faces.d : faces.l) + ", " + (dead ? STYLE_DEAD : STYLE_LIVING);
      if(ollamaUp){
        try {
          const enriched = await ollamaEnrich(dead ? faces.d : faces.l, dead);
          prompt = enriched + ", " + (dead ? STYLE_DEAD : STYLE_LIVING);
        } catch(e){ console.log(`  (ollama enrich failed for ${key}: ${e.message} — using base prompt)`); }
      }
      prompts[key] = prompt;
      const file = path.join(ART_DIR, key + ".png");
      if(PROMPTS_ONLY || !comfyUp) continue;
      if((fs.existsSync(file) || fs.existsSync(path.join(FINAL_DIR, key + ".png"))) && !FORCE){
        manifest[key] = 1; console.log(`  skip ${key} (exists)`); continue;
      }
      process.stdout.write(`  rendering ${key} ... `);
      try {
        const png = await comfyGenerate(prompt, seed++);
        fs.writeFileSync(file, png);
        manifest[key] = 1;
        console.log("ok (" + Math.round(png.length/1024) + " KB)");
      } catch(e){ console.log("FAILED: " + e.message); }
    }
  }

  if(STAGED){ // publish everything in one burst, then a single manifest update
    let copied = 0;
    for(const f of fs.readdirSync(ART_DIR).filter(x => x.endsWith(".png"))){
      const dst = path.join(FINAL_DIR, f);
      if(!fs.existsSync(dst)){ fs.copyFileSync(path.join(ART_DIR, f), dst); copied++; }
      manifest[f.replace(/\.png$/, "")] = 1;
    }
    console.log(`published ${copied} staged images to art/`);
  }
  fs.writeFileSync(path.join(FINAL_DIR, "prompts.json"), JSON.stringify(prompts, null, 2));
  fs.writeFileSync(path.join(FINAL_DIR, "manifest.js"),
    "window.ART_MANIFEST = " + JSON.stringify(manifest) + ";\n");
  console.log(`Done. ${Object.keys(manifest).length} images in manifest, prompts.json written.`);
})();
