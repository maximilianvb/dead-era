"use strict";
/* ============ CARD DEFINITIONS ============
   Design law: every card works in both dimensions.
   Units have a living face and a dead counterpart (deadName + d stats).
   Spells and situations flip to their deadFace when in the dead hand. */

const DEFS = {
  peasant:    {rarity:"common", name:"Peasant Levy",     deadName:"Restless Levy",   cost:1, type:"unit", l:[2,1], d:[1,1], text:"They were promised land."},
  gravrat:    {rarity:"common", name:"Grave Rat",        deadName:"Bone Rat",        cost:1, type:"unit", l:[1,1], d:[2,2], text:"Better off dead."},
  hound:      {rarity:"common", name:"Charging Hound",   deadName:"Barrow Hound",    cost:2, type:"unit", l:[2,1], d:[1,1], ability:"haste", text:"Haste: attacks immediately, in either dimension."},
  shambler:   {rarity:"common", name:"Bone Shambler",    deadName:"Risen Shambler",  cost:2, type:"unit", l:[1,2], d:[3,3], text:"Yearns for the other side."},
  priest:     {rarity:"common", name:"Village Priest",   deadName:"Heretic Shade",   cost:2, type:"unit", l:[1,3], d:[1,1], ability:"heal2", text:"On play: restore 2 Life — or 2 Soul if played dead."},
  collector:  {rarity:"common", name:"Corpse Collector", deadName:"Grave Servant",   cost:2, type:"unit", l:[2,2], d:[2,2], ability:"martyr", text:"Martyr: draw a card when you sacrifice this."},
  flameblade: {rarity:"epic", name:"Flameblade Knight",deadName:"Ashen Knight",    cost:3, type:"unit", l:[3,3], d:[1,1], ability:"undying", text:"Undying: when this dies, it returns to that dimension's hand instead of passing on."},
  plague:     {rarity:"rare", name:"Plague Bearer",    deadName:"Hollow Bearer",   cost:3, type:"unit", l:[2,3], d:[2,2], ability:"plague", text:"On death: deal 1 damage to all enemy units in its dimension."},
  warden:     {rarity:"rare", name:"Soul Warden",      deadName:"Warden of Souls", cost:3, type:"unit", l:[3,4], d:[2,3], text:"Keeps the count of the crossing."},
  wraithcaller:{rarity:"epic", name:"Wraith Caller",   deadName:"Wraith Lord",     cost:4, type:"unit", l:[2,4], d:[3,3], ability:"spirit", text:"On play: put a 2/2 Spirit into the OTHER dimension's field."},
  ghoul:      {rarity:"epic", name:"Ember Ghoul",      deadName:"Cinder Wretch",   cost:4, type:"unit", l:[4,3], d:[4,2], text:"Still smoulders."},
  deathknight:{rarity:"legendary", name:"Death Knight",     deadName:"Dread Revenant",  cost:5, type:"unit", l:[4,5], d:[5,5], text:"Terrible in any world."},
  spirit:     {name:"Spirit",           deadName:"Spirit",          cost:0, type:"unit", l:[2,2], d:[2,2], token:true, text:"Token."},
  rat:        {name:"Rat",              deadName:"Rotting Rat",     cost:0, type:"unit", l:[1,1], d:[1,1], token:true, text:"Token."},

  /* --- Expansion: Tolls of the Veil --- */
  gravedigger:{rarity:"common", name:"Gravedigger",     deadName:"Barrow Digger",   cost:2, type:"unit", l:[2,2], d:[2,1], ability:"digger", text:"On play: put the top card of your deck into your dead hand."},
  pallbearer: {rarity:"common", name:"Pallbearer",      deadName:"Casket Wight",    cost:2, type:"unit", l:[1,4], d:[1,3], ability:"guard", text:"Guard: enemies in its dimension must attack this first."},
  ratcatcher: {rarity:"common", name:"Ratcatcher",      deadName:"Vermin Shade",    cost:3, type:"unit", l:[2,3], d:[2,2], ability:"rats", text:"On play: summon a 1/1 Rat in the same dimension."},
  sentinel:   {rarity:"rare",   name:"Cryptshield Sentinel", deadName:"Sepulcher Warden", cost:3, type:"unit", l:[1,5], d:[2,4], ability:"guard", text:"Guard: enemies in its dimension must attack this first."},
  bonegolem:  {rarity:"rare",   name:"Grave-Iron Golem",deadName:"Bone Colossus",   cost:4, type:"unit", l:[2,3], d:[5,4], text:"Assembled from what the war left behind."},
  ferryman:   {rarity:"legendary", name:"The Ferryman", deadName:"The Toll Collector", cost:6, type:"unit", l:[4,6], d:[6,6], ability:"ferry", text:"On play: draw a card and put the top card of your deck into your dead hand."},

  banish:     {rarity:"epic", name:"Banish",            cost:3, type:"spell", target:"anyLiving", text:"Remove a living unit from existence. It does NOT cross over.",
               deadFace:{name:"Void Rend", target:"anyDead", text:"Remove a dead unit from existence. Nothing returns — not even the Undying."}},
  soultap:    {rarity:"rare", name:"Soul Tap",          cost:2, type:"spell", text:"Drain 2 Soul from the enemy (Life if their Soul is shattered).",
               deadFace:{name:"Life Tap", text:"Reach through the veil: drain 2 Life from the enemy."}},
  requiem:    {rarity:"rare", name:"Requiem",           cost:3, type:"spell", text:"Deal 2 damage to ALL living units — yours too.",
               deadFace:{name:"Dirge", text:"Deal 2 damage to ALL dead units — yours too."}},
  siphon:     {rarity:"epic", name:"Soul Siphon",       deadName:"Grave Toll", cost:2, type:"situation",
               text:"Whenever one of your living units dies, restore 1 Life.",
               sitFx:{kind:"onLivingDeathLife", n:1},
               deadFace:{name:"Grave Toll", text:"Whenever one of your dead units is destroyed, the enemy loses 1 Soul (Life if shattered).", sitFx:{kind:"onDeadDestroyDrain", n:1}}},

  /* --- Expansion II: Rites & Ruin (spell/situation-focused) --- */
  /* Units whose dead face is a SITUATION: they die and settle over the dead dimension as an omen. */
  candlemaid: {rarity:"common", name:"Candle Maiden", deadName:"Vigil Flame", cost:2, type:"unit", l:[1,3], d:[1,1], deadForm:"situation",
               text:"Its dead face is a situation — deploy it from your dead hand as an omen.",
               deadFace:{name:"Vigil Flame", text:"At the start of your turn, restore 1 Soul (1 Life if shattered).", sitFx:{kind:"turnSoul", n:1}}},
  drummer:    {rarity:"rare", name:"War Drummer", deadName:"Dirge Drums", cost:3, type:"unit", l:[2,3], d:[1,1], deadForm:"situation",
               text:"Its dead face is a situation — deploy it from your dead hand as an omen.",
               deadFace:{name:"Dirge Drums", text:"Your dead units have +1 ATK.", sitFx:{kind:"deadAtk", n:1}}},
  lamplighter:{rarity:"epic", name:"Lamplighter", deadName:"Corpse Light", cost:4, type:"unit", l:[3,4], d:[1,1], deadForm:"situation",
               text:"Its dead face is a situation — deploy it from your dead hand as an omen.",
               deadFace:{name:"Corpse Light", text:"Enemy dead units have −1 ATK.", sitFx:{kind:"foeDeadAtk", n:-1}}},

  dispel:     {rarity:"rare", name:"Unravel", cost:2, type:"spell", target:"situationLiving",
               text:"Destroy an enemy situation over the living dimension.",
               deadFace:{name:"Sever", target:"situationDead", text:"Destroy an enemy situation over the dead dimension."}},
  darkpact:   {rarity:"rare", name:"Dark Pact", cost:1, type:"spell",
               text:"Draw 2 cards. Lose 2 Life.",
               deadFace:{name:"Death Pact", text:"Draw 2 cards. Lose 2 Soul (Life if shattered)."}},
  surge:      {rarity:"common", name:"Essence Surge", cost:0, type:"spell",
               text:"Gain 2 Essence this turn.",
               deadFace:{name:"Grave Surge", text:"Gain 2 dead energy this turn."}},
  mend:       {rarity:"rare", name:"Mending Light", cost:2, type:"spell",
               text:"Restore 4 Life.",
               deadFace:{name:"Soul Stitch", text:"Restore 4 Soul — or 4 Life if your Soul is shattered."}},
  haunt:      {rarity:"epic", name:"Final Charge", cost:3, type:"spell", target:"friendlyLiving",
               text:"Destroy a friendly living unit; it deals its ATK to the enemy's Life as it falls.",
               deadFace:{name:"Last Wail", target:"friendlyDeadAny", text:"Release a friendly dead unit; it deals its ATK to the enemy's Soul (Life if shattered)."}},
  warbanner:  {rarity:"rare", name:"War Banner", deadName:"Bone Standard", cost:3, type:"situation",
               text:"Your living units have +1 ATK.", sitFx:{kind:"livingAtk", n:1},
               deadFace:{name:"Bone Standard", text:"Your units enter the dead field with +1 HP.", sitFx:{kind:"enterDeadHp", n:1}}},
  font:       {rarity:"common", name:"Essence Font", deadName:"Font of Rot", cost:2, type:"situation",
               text:"At the start of your turn, gain 1 extra Essence (that turn).", sitFx:{kind:"turnEss", n:1},
               deadFace:{name:"Font of Rot", text:"At the start of your turn, gain 1 dead energy.", sitFx:{kind:"turnDeadEss", n:1}}},
  ward:       {rarity:"rare", name:"Thorn Ward", deadName:"Wailing Ward", cost:2, type:"situation",
               text:"Enemy units that attack your hero in the living dimension take 1 damage.", sitFx:{kind:"ward", n:1},
               deadFace:{name:"Wailing Ward", text:"Enemy units that attack your hero in the dead dimension take 1 damage.", sitFx:{kind:"ward", n:1}}},

  cull:       {rarity:"rare", name:"Cull the Weak",    cost:1, type:"spell", target:"friendlyLiving", text:"Destroy a friendly living unit (its card joins your dead hand). Draw a card.",
               deadFace:{name:"Enlighten", target:"friendlyDeadAny", text:"Release a friendly dead unit — it passes on forever. Draw a card."}},
  smite:      {rarity:"rare", name:"Smite",            cost:2, type:"spell", target:"anyLiving",      text:"Deal 3 damage to any living unit.",
               deadFace:{name:"Soul Rend", target:"anyDead", text:"Deal 3 damage to any dead unit."}},
  resurrection:{rarity:"epic", name:"Resurrection",    cost:3, type:"spell", target:"friendlyDead",   text:"Return a friendly dead unit to your living field. Works from either hand."},

  /* Situations: persistent passives over one dimension (Shadow Era-style support cards). */
  tome:       {rarity:"legendary", name:"Tome of Knowledge", deadName:"Tome of the Damned", cost:3, type:"situation",
               text:"At the start of your turn, draw an extra card.", sitFx:{kind:"turnDraw", n:1},
               deadFace:{name:"Tome of the Damned", text:"Your dead units have +1 ATK.", sitFx:{kind:"deadAtk", n:1}}},
  grove:      {rarity:"epic", name:"Sanctuary Grove",   deadName:"Weeping Barrow",     cost:2, type:"situation",
               text:"At the start of your turn, restore 1 Life.", sitFx:{kind:"turnLife", n:1},
               deadFace:{name:"Weeping Barrow", text:"At the start of your turn, the enemy loses 1 Soul (1 Life if their Soul is shattered).", sitFx:{kind:"turnDrain", n:1}}},
};

/* Default 40-card deck: 22 units (4 of which become omens), 12 spells, 6 situations. */
const DECKLIST = [];
["shambler","priest","flameblade","plague","warden","wraithcaller","ghoul","deathknight","candlemaid","drummer"]
  .forEach(id => DECKLIST.push(id,id));
DECKLIST.push("hound","collector");
DECKLIST.push("cull","cull","smite","smite","soultap","soultap","dispel","dispel","darkpact","darkpact","resurrection","requiem");
DECKLIST.push("tome","tome","grove","grove","warbanner","font");

const MAX_FIELD = 6, MAX_HAND = 10, MAX_SITS = 2, START_LIFE = 25, START_SOUL = 15, ESS_CAP = 10;

/* ============ CHAMPIONS ============
   Chosen before the game; each has a passive. Every hero has a living
   portrait and a dead face (shown in the Dead Dimension plaque). */
const HEROES = {
  alder:  {name:"Ser Alder",  title:"the Lifewarden",
           passive:"At the start of your turn, restore 1 Life."},
  morwen: {name:"Morwen",     title:"the Grave Queen",
           passive:"Your units enter the dead field with +1 HP."},
  vex:    {name:"Vex",        title:"the Soul Reaper",
           passive:"Your dead units strike the enemy Soul for +1 damage."},
  brann:  {name:"Brann",      title:"the Ashen King",
           passive:"Your sacrifice also burns 1 enemy Soul (Life once shattered)."},
};

/* A card's face depends on where it sits. Living plays spend Essence;
   dead plays spend Dead Energy = ESS_CAP − your max Essence (refreshed each turn). */
const faceOf = (cardId, fromDead) => {
  const def = DEFS[cardId];
  return (fromDead && def.deadFace) ? Object.assign({}, def, def.deadFace) : def;
};
const effCost = (cardId, fromDead) => DEFS[cardId].cost;
const unitName = u => (u.dim === "dead" && DEFS[u.cardId].deadName) ? DEFS[u.cardId].deadName : DEFS[u.cardId].name;
