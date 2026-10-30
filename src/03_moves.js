/* ============ move list (Tekken notation) ============
   level: h high, m mid, l low, sm special-mid (hits crouchers, blockable either way)
   frames: startup (first active frame), active, recovery. hitstun/blockstun define advantage. */
function M(o) { return Object.assign({ active: 2, reach: 0.95, radius: 0.42, height: 1.3, pushback: 0.22, hitstop: 5, sound: 'light', k: 0.5 }, o); }
const BASE_MOVES = {
  '1':   M({ name: 'Jab', anim: 'jab', startup: 10, recovery: 10, dmg: 7, level: 'h', height: 1.55, hitstun: 18, blockstun: 11, chain: { '2': '1,2' } }),
  '1,2': M({ name: 'One-Two', anim: 'straight', startup: 11, recovery: 14, dmg: 11, level: 'h', height: 1.55, hitstun: 22, blockstun: 12, chain: { '1': '1,2,1', '3': '1,2,3', '4': '1,2,4' } }),
  '1,2,1': M({ name: 'One-Two-Hook', anim: 'jab', startup: 12, recovery: 16, dmg: 14, level: 'm', height: 1.3, hitstun: 26, blockstun: 12, pushback: 0.35, counterKD: true }),
  '1,2,3': M({ name: 'Double Punch Kick', anim: 'frontKick', startup: 14, active: 3, recovery: 20, dmg: 17, level: 'm', reach: 1.1, hitstun: 28, blockstun: 14, pushback: 0.5, knockdown: true, sound: 'heavy' }),
  '1,2,4': M({ name: 'Double Punch High Kick', anim: 'roundhouse', startup: 16, active: 3, recovery: 22, dmg: 20, level: 'h', height: 1.55, reach: 1.15, hitstun: 30, blockstun: 14, pushback: 0.5, knockdown: true, sound: 'heavy' }),
  '2':   M({ name: 'Straight', anim: 'straight', startup: 12, recovery: 15, dmg: 12, level: 'h', height: 1.55, hitstun: 20, blockstun: 11, chain: { '1': '2,1' } }),
  '2,1': M({ name: 'Straight Jab', anim: 'jab', startup: 11, recovery: 14, dmg: 10, level: 'h', height: 1.55, hitstun: 20, blockstun: 10 }),
  '3':   M({ name: 'Front Kick', anim: 'frontKick', startup: 14, active: 3, recovery: 19, dmg: 15, level: 'm', reach: 1.1, hitstun: 24, blockstun: 13, pushback: 0.38, chain: { '4': '3,4' } }),
  '3,4': M({ name: 'Kick Combo', anim: 'roundhouse', startup: 16, active: 3, recovery: 22, dmg: 19, level: 'h', height: 1.55, reach: 1.15, hitstun: 30, blockstun: 14, pushback: 0.5, knockdown: true, sound: 'heavy' }),
  '4':   M({ name: 'Roundhouse', anim: 'roundhouse', startup: 16, active: 3, recovery: 21, dmg: 18, level: 'h', height: 1.55, reach: 1.15, hitstun: 26, blockstun: 13, pushback: 0.4, counterKD: true, sound: 'heavy' }),
  'f+2': M({ name: 'Elbow Strike', anim: 'elbow', startup: 14, recovery: 17, dmg: 17, level: 'm', reach: 0.95, hitstun: 26, blockstun: 12, pushback: 0.3, wallSplat: true, sound: 'heavy', lunge: 0.25 }),
  'b+2': M({ homing: true, name: 'Spinning Backfist', anim: 'backfist', startup: 17, active: 3, recovery: 20, dmg: 22, level: 'h', height: 1.5, reach: 1.1, hitstun: 32, blockstun: 12, pushback: 0.6, knockdown: true, wallSplat: true, sound: 'heavy' }),
  'd/f+2': M({ name: 'Rising Uppercut', anim: 'uppercut', startup: 15, active: 3, recovery: 19, dmg: 13, level: 'm', height: 1.2, reach: 0.9, hitstun: 20, blockstun: 12, launch: 0.094, sound: 'heavy' }),
  'd/f+4': M({ name: 'Hop Kick', anim: 'hopkick', startup: 18, active: 4, recovery: 22, dmg: 20, level: 'm', height: 1.4, reach: 1.05, hitstun: 20, blockstun: 14, launch: 0.1, sound: 'heavy', lunge: 0.3, hop: true }),
  'd+1': M({ name: 'Crouch Jab', anim: 'crouchJab', startup: 10, recovery: 10, dmg: 6, level: 'sm', height: 0.9, reach: 0.85, hitstun: 15, blockstun: 10, crouching: true }),
  'd+3': M({ name: 'Low Kick', anim: 'lowKick', startup: 13, active: 3, recovery: 16, dmg: 9, level: 'l', height: 0.35, reach: 1.1, hitstun: 18, blockstun: 10, crouching: true, hitsGrounded: true }),
  'd+4': M({ homing: true, name: 'Sweep', anim: 'sweep', startup: 19, active: 4, recovery: 24, dmg: 14, level: 'l', height: 0.3, reach: 1.25, hitstun: 24, blockstun: 10, crouching: true, counterKD: true, hitsGrounded: true, sound: 'heavy' }),
  'b+4': M({ name: 'Spinning Back Kick', anim: 'spinKick', startup: 21, active: 4, recovery: 24, dmg: 28, level: 'h', height: 1.5, reach: 1.2, hitstun: 34, blockstun: 14, pushback: 0.8, knockdown: true, wallSplat: true, sound: 'heavy', hitstop: 8 }),
  'f,f+2': M({ engager: true, name: 'Dash Straight', anim: 'dashPunch', startup: 17, active: 3, recovery: 22, dmg: 22, level: 'm', reach: 1.0, hitstun: 30, blockstun: 12, pushback: 0.9, knockdown: true, wallSplat: true, sound: 'heavy', lunge: 0.8, hitstop: 7 }),
  'f,f+3': M({ name: 'Running Knee', anim: 'knee', startup: 18, active: 4, recovery: 24, dmg: 20, level: 'm', reach: 0.95, hitstun: 24, blockstun: 14, launch: 0.096, sound: 'heavy', lunge: 0.7, hop: true }),
  '1+2': M({ homing: true, name: 'Double Palm', anim: 'doublePalm', startup: 18, active: 3, recovery: 22, dmg: 23, level: 'm', reach: 1.0, hitstun: 30, blockstun: 14, pushback: 1.0, knockdown: true, wallSplat: true, sound: 'heavy', lunge: 0.2, hitstop: 7 }),
  'ws+2': M({ name: 'Rising Uppercut', anim: 'wsUpper', startup: 13, active: 3, recovery: 18, dmg: 12, level: 'm', height: 1.2, reach: 0.9, hitstun: 20, blockstun: 12, launch: 0.092, sound: 'heavy' }),
  'ws+4': M({ name: 'Rising Kick', anim: 'wsKick', startup: 12, active: 3, recovery: 17, dmg: 14, level: 'm', reach: 1.05, hitstun: 22, blockstun: 12, pushback: 0.35 }),
  'u+3': M({ name: 'Jump Kick', anim: 'jumpKick', startup: 7, active: 6, recovery: 12, dmg: 15, level: 'm', reach: 1.05, hitstun: 24, blockstun: 12, pushback: 0.4, air: true }),
  'u+4': M({ name: 'Jump Kick', anim: 'jumpKick', startup: 7, active: 6, recovery: 12, dmg: 16, level: 'm', reach: 1.05, hitstun: 26, blockstun: 12, pushback: 0.45, air: true, knockdown: true }),
  'gr+3': M({ name: 'Low Getup Kick', anim: 'getupKickLow', startup: 13, active: 4, recovery: 30, dmg: 12, level: 'l', height: 0.3, reach: 1.15, hitstun: 20, blockstun: 10, grounded: true }),
  'gr+4': M({ name: 'Mid Getup Kick', anim: 'getupKickMid', startup: 14, active: 4, recovery: 30, dmg: 18, level: 'm', reach: 1.1, hitstun: 26, blockstun: 14, pushback: 0.5, knockdown: true, grounded: true, sound: 'heavy' }),
  '1+3': M({ name: 'Shoulder Throw', anim: 'grabWhiff', startup: 12, active: 2, recovery: 20, dmg: 32, level: 'throw', reach: 0.95, throw: true, sound: 'heavy' }),
  '2+4': M({ name: 'Hip Toss', anim: 'grabWhiff', startup: 12, active: 2, recovery: 20, dmg: 35, level: 'throw', reach: 0.95, throw: true, sound: 'heavy' }),
  'HB': M({ name: 'Heat Burst', anim: 'heatBurst', startup: 16, active: 3, recovery: 26, dmg: 12, level: 'm', reach: 1.3, homing: true, hitstun: 30, blockstun: 20, pushback: 1.1, knockdown: true, wallSplat: true, armor: [0, 16], heatBurst: true, sound: 'heavy', hitstop: 9 }),
  'HS': M({ name: 'Heat Smash', anim: 'heatSmash', startup: 16, active: 4, recovery: 30, dmg: 38, level: 'm', reach: 1.2, homing: true, hitstun: 30, blockstun: 18, pushback: 1.1, knockdown: true, wallSplat: true, wallBreak: true, armor: [0, 16], heatSmash: true, sound: 'heavy', hitstop: 12, lunge: 0.55 }),
  'f+1+2': M({ name: 'Power Crush', anim: 'powerCrush', startup: 17, active: 3, recovery: 24, dmg: 22, level: 'm', reach: 1.0, hitstun: 30, blockstun: 12, pushback: 0.8, knockdown: true, wallSplat: true, armor: [3, 17], powerCrush: true, sound: 'heavy', lunge: 0.4, hitstop: 8 }),
  'f+4': M({ name: 'Tornado Kick', anim: 'tornadoKick', startup: 13, active: 4, recovery: 20, dmg: 16, level: 'm', reach: 1.1, homing: true, hitstun: 24, blockstun: 12, pushback: 0.4, screw: true, sound: 'heavy' }),
  'RA': M({ homing: true, name: 'Rage Art', anim: 'rageArt', startup: 20, active: 4, recovery: 40, dmg: 55, level: 'm', reach: 1.05, hitstun: 30, blockstun: 16, rageArt: true, armor: [0, 20], sound: 'heavy', lunge: 0.5, hitstop: 10 }),
};
/* per-character signature moves: distinct animations and names */
const SIGNATURES = {
  axe:   { cmd: 'b+3', m: M({ name: 'Axe Kick', anim: 'axeKick', startup: 19, active: 4, recovery: 22, dmg: 24, level: 'm', reach: 1.0, hitstun: 30, blockstun: 14, pushback: 0.4, knockdown: true, hitsGrounded: true, sound: 'heavy', hitstop: 7 }) },
  hammer:{ cmd: 'b+1', m: M({ name: 'Iron Hammer', anim: 'hammer', startup: 20, active: 4, recovery: 24, dmg: 27, level: 'm', reach: 0.95, hitstun: 32, blockstun: 14, pushback: 0.5, knockdown: true, hitsGrounded: true, armor: [6, 16], sound: 'heavy', hitstop: 8 }) },
  spinSweep:{ cmd: 'b+3', m: M({ homing: true, name: 'Meia Lua', anim: 'spinSweep', startup: 18, active: 5, recovery: 26, dmg: 20, level: 'l', height: 0.3, reach: 1.3, hitstun: 30, blockstun: 12, knockdown: true, hitsGrounded: true, sound: 'heavy' }) },
  liver: { cmd: 'b+1', m: M({ name: 'Liver Shot', anim: 'bodyHook', startup: 15, active: 3, recovery: 18, dmg: 22, level: 'm', height: 1.1, reach: 0.85, hitstun: 44, blockstun: 12, crumple: true, counterKD: true, sound: 'heavy', hitstop: 8 }) },
  flurry:{ cmd: 'b+1', m: M({ name: 'Crane Flurry', anim: 'palm', startup: 11, recovery: 10, dmg: 8, level: 'm', reach: 0.95, hitstun: 20, blockstun: 11, chain: { '1': 'flurry2' } }), extra: { 'flurry2': M({ name: 'Crane Flurry 2', anim: 'palm2', startup: 9, recovery: 10, dmg: 8, level: 'm', reach: 0.95, hitstun: 20, blockstun: 11, chain: { '1': 'flurry3' } }), 'flurry3': M({ name: 'Crane Flurry 3', anim: 'doublePalm', startup: 12, active: 3, recovery: 20, dmg: 16, level: 'm', reach: 1.0, hitstun: 28, blockstun: 12, pushback: 0.9, knockdown: true, wallSplat: true, sound: 'heavy' }) } },
  flyKnee:{ cmd: 'b+3', m: M({ name: 'Flying Knee', anim: 'knee', startup: 17, active: 4, recovery: 24, dmg: 24, level: 'm', reach: 1.0, hitstun: 24, blockstun: 14, launch: 0.098, sound: 'heavy', lunge: 0.9, hop: true, hitstop: 7 }) },
};

const ROSTER = [
  { id: 'kazuma', name: 'Kazuma', full: 'Kazuma Hayashi', country: 'Japan', style: 'Shotokan Karate', skin: '#c48d64', hair: '#15110e', hairStyle: 'short', eyes: '#2b1a10', outfit: 'gi', top: '#eef0f4', pants: '#eef0f4', belt: '#111', headband: '#b8232a', height: 1.0, build: { shoulder: 0.2, chest: 0.19, arm: 0.065, leg: 0.09 },
    speed: 1.0, power: 1.0, hp: 100, weight: 1.0, sig: 'axe', win: 'win2', idle: 'still', introPose: 'bow', rageName: 'Thousand Fists', color: '#f1ece2',
    tweak: { 'd/f+2': { name: 'Rising Dragon', dmg: 14 }, '4': { name: 'Mawashi Geri' }, '3': { name: 'Mae Geri' }, 'b+4': { name: 'Ushiro Geri' } } },
  { id: 'viktor', name: 'Viktor', full: 'Viktor Volkov', country: 'Russia', style: 'Combat Sambo', skin: '#e8c3a3', hair: '#5a4632', hairStyle: 'buzz', eyes: '#3a5a7a', outfit: 'tank', top: '#2b2f38', pants: '#6a2a2a', shoes: '#222', height: 1.06, build: { shoulder: 0.24, chest: 0.22, arm: 0.078, leg: 0.1 },
    speed: 0.9, power: 1.18, hp: 112, weight: 1.25, sig: 'hammer', win: 'win4', idle: 'heavy', introPose: 'flex', rageName: 'Siberian Crush', color: '#6a2a2a',
    tweak: { '1+3': { name: 'Suplex', dmg: 38 }, '2+4': { name: 'Bear Slam', dmg: 40 }, 'f,f+2': { name: 'Tank Charge', dmg: 26 }, 'b+2': { name: 'Hammer Swing' } } },
  { id: 'lena', female: true, name: 'Lena', full: 'Lena Marchetti', country: 'Italy', style: 'Capoeira', skin: '#c99068', hair: '#2a1a12', hairStyle: 'ponytail', eyes: '#3a2a1a', outfit: 'tank', top: '#e9c84a', pants: '#f3f0ea', shoes: '#f3f0ea', height: 0.95, build: { shoulder: 0.18, chest: 0.165, arm: 0.055, leg: 0.08 },
    speed: 1.15, power: 0.9, hp: 92, weight: 0.85, sig: 'spinSweep', win: 'win3', idle: 'ginga', introPose: 'win3', rageName: 'Ginga Storm', color: '#e9c84a',
    tweak: { '4': { name: 'Armada', dmg: 19 }, 'b+4': { name: 'Meia Lua de Compasso', dmg: 26, startup: 19 }, 'd+4': { name: 'Rasteira' }, 'd/f+4': { name: 'Bênção Launcher' } } },
  { id: 'marcus', name: 'Marcus', full: 'Marcus Cole', country: 'USA', style: 'Boxing', skin: '#6b4327', hair: '#0f0c0a', hairStyle: 'bald', eyes: '#2a1a10', outfit: 'trunks', top: '#6b4327', pants: '#1f2a66', shoes: '#e8e8e8', gloves: '#c8202a', height: 1.03, build: { shoulder: 0.23, chest: 0.21, arm: 0.075, leg: 0.095 },
    speed: 1.05, power: 1.1, hp: 104, weight: 1.1, sig: 'liver', win: 'win1', idle: 'bounce', introPose: 'gloveTap', rageName: 'Twelve-Round Finisher', color: '#c8202a',
    tweak: { '1': { name: 'Jab', dmg: 8, startup: 9 }, '2': { name: 'Cross', dmg: 14 }, '1,2': { name: 'One-Two', dmg: 13 }, 'f+2': { name: 'Overhand Right', dmg: 20 }, 'b+2': { name: 'Haymaker', dmg: 26 }, '3': { name: 'Push Kick', dmg: 11 }, '4': { name: 'Step Kick', dmg: 13 }, 'd/f+2': { name: 'Uppercut', dmg: 15 } } },
  { id: 'mei', female: true, name: 'Mei', full: 'Mei Lin', country: 'China', style: 'Wushu', skin: '#efcfae', hair: '#0e0b0a', hairStyle: 'bun', eyes: '#1a1210', outfit: 'jacket', top: '#b8232a', pants: '#15151a', belt: '#e8b84a', shoes: '#15151a', height: 0.93, build: { shoulder: 0.175, chest: 0.16, arm: 0.052, leg: 0.078 },
    speed: 1.2, power: 0.85, hp: 90, weight: 0.8, sig: 'flurry', win: 'win3', idle: 'flow', introPose: 'palmSalute', rageName: 'Phoenix Rising', color: '#b8232a',
    tweak: { 'd/f+2': { name: 'Cloud Uppercut' }, 'b+4': { name: 'Whirlwind Kick', startup: 19 }, '1+2': { name: 'Double Palm Strike' }, 'd+4': { name: 'Lotus Sweep' } } },
  { id: 'rafael', name: 'Rafael', full: 'Rafael Santos', country: 'Brazil', style: 'Muay Thai', skin: '#a86a44', hair: '#1a110c', hairStyle: 'swept', eyes: '#2a1a10', outfit: 'shirtless', top: '#a86a44', pants: '#1b6b4a', shoes: '#a86a44', headband: '#e8b84a', height: 1.0, build: { shoulder: 0.21, chest: 0.2, arm: 0.07, leg: 0.095 },
    speed: 1.0, power: 1.08, hp: 100, weight: 1.05, sig: 'flyKnee', win: 'win4', idle: 'muay', introPose: 'wai', rageName: 'Clinch of Fire', color: '#1b6b4a',
    tweak: { '3': { name: 'Teep', dmg: 16 }, '4': { name: 'Thai Kick', dmg: 21 }, 'f+2': { name: 'Horizontal Elbow', dmg: 19 }, 'f,f+3': { name: 'Khao Loi', dmg: 22 }, 'b+4': { name: 'Spinning Elbow Kick' } } },
  { id: 'kurogane', name: 'Kurogane', full: 'Kurogane Mk-IX', country: 'Unknown', style: 'Iron Fist Prototype', boss: true, skin: '#a8b0bc', skinMetal: true, eyeGlow: true, hair: '#20232a', hairStyle: 'mohawk', eyes: '#ff2a10', outfit: 'shirtless', top: '#a8b0bc', pants: '#202329', shoes: '#0c0d10', gloves: '#2a2e36', height: 1.1, build: { shoulder: 0.25, chest: 0.23, arm: 0.08, leg: 0.105 },
    speed: 1.0, power: 1.15, hp: 128, weight: 1.35, sig: 'hammer', win: 'win4', idle: 'robot', introPose: 'flex', rageName: 'Core Meltdown', color: '#ff2a10',
    tweak: { '1+2': { name: 'Piston Palms' }, 'b+4': { name: 'Turbine Kick' }, 'f,f+2': { name: 'Rocket Fist', dmg: 25 }, 'd/f+2': { name: 'Hydraulic Upper' } } },
];
function buildMoveset(def) {
  const ms = {};
  for (const k in BASE_MOVES) ms[k] = Object.assign({}, BASE_MOVES[k], { id: k });
  const sig = SIGNATURES[def.sig]; ms[sig.cmd] = Object.assign({}, sig.m, { id: sig.cmd, signature: true, engager: true }); if (sig.extra) for (const k in sig.extra) ms[k] = Object.assign({}, sig.extra[k], { id: k });
  if (def.tweak) for (const k in def.tweak) if (ms[k]) Object.assign(ms[k], def.tweak[k]);
  ms['RA'].name = def.rageName;
  for (const k in ms) { const m = ms[k]; m.total = m.startup + m.active + m.recovery; m.dmg = Math.round(m.dmg * def.power); m.chainAt = m.startup + m.active + 2; }
  return ms;
}
