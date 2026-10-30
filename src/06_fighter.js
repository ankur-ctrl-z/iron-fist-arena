/* ============ fighter ============ */
const LIMB = { jab: 'lHand', crouchJab: 'lHand', palm2: 'lHand', bodyHook: 'lHand', straight: 'rHand', uppercut: 'rHand', wsUpper: 'rHand', dashPunch: 'rHand', elbow: 'rElbow', backfist: 'rHand', palm: 'rHand', hammer: 'rHand', doublePalm: 'rHand', frontKick: 'lFoot', lowKick: 'lFoot', roundhouse: 'rFoot', hopkick: 'rFoot', sweep: 'rFoot', spinKick: 'rFoot', wsKick: 'rFoot', axeKick: 'rFoot', jumpKick: 'rFoot', getupKickLow: 'rFoot', getupKickMid: 'rFoot', spinSweep: 'rFoot', knee: 'rKnee', rageArt: 'rFoot', grabWhiff: 'rHand' };
const GRAVITY = 0.0058;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
let SERIAL = 0;

class Fighter {
  constructor(def, idx, game) {
    this.def = def; this.idx = idx; this.game = game;
    this.moves = buildMoveset(def); this.model = new FighterModel(def);
    this.scale = def.height || 1; this.maxHp = def.hp; this.wins = 0;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.neutralGuards = true; this.noGuard = false; this.frame = 0;
    this.trail = new Trail(game.scene, idx === 0 ? lin('#8ac8ff').multiplyScalar(1.6) : lin('#ffa08a').multiplyScalar(1.6));
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: game.blobTex, transparent: true, depthWrite: false, opacity: 0.9 }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.renderOrder = 1;
    this.sc = game.scene; this.sc.add(this.model.root, this.shadow);
    this.reset(0, 0, 0);
  }
  dispose() { this.sc.remove(this.model.root, this.shadow, this.trail.mesh); }
  reset(x, z, face) {
    this.pos.set(x, 0, z); this.vel.set(0, 0, 0); this.y = 0; this.vy = 0;
    this.hp = this.maxHp; this.state = 'idle'; this.sf = 0; this.crouch = false;
    this.move = null; this.mf = 0; this.hitDone = false; this.queued = null; this.stun = 0;
    this.face = face; this.lockFace = face; this.juggle = 0; this.comboHits = 0; this.comboDmg = 0; this.splatted = false; this.flying = false; this.ko = false;
    this.rage = false; this.rageUsed = false; this.invuln = 0; this.upF = 0; this.downF = 0; this.lastFwdTap = -99; this.lastBackTap = -99; this.prevDir = 5; this.lastDir = 5; this.wsWindow = 0; this.pressedInDown = false;
    this.heatAvail = true; this.heatActive = false; this.heatT = 0; this.rec = 0; this.screw = false; this.screwUsed = false; this.lastDf = -99; this.blinkT = 60 + Math.random() * 200; this.hitVar = 1; this.heatDash = 0; this.cancelToDash = false; this.lastHitMove = null; this.idlePhase = Math.random() * 6;
    this.target = null; this.thrower = null; this.tf = 0; this.breakBtn = null; this.moveSerial = 0; this.blockType = null; this.landed = false; this.wasBlocked = false; this.attackerCombo = null;
    this.hitPose = 'hitMid'; this.ssDir = 0; this.dashF = 0; this.walkPhase = 0; this.lastHitBy = null; this.pendingSs = null;
    this.model.setPose(STANCE, 1); this.syncModel();
  }
  get opp() { return this.game.fighters[1 - this.idx]; }
  fwd(out) { return (out || _v).set(Math.sin(this.face), 0, Math.cos(this.face)); }
  distTo(o) { return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }
  angleTo(o) { return Math.atan2(o.pos.x - this.pos.x, o.pos.z - this.pos.z); }
  isCrouching() { return this.state === 'crouch' || (this.state === 'blockstun' && this.blockType === 'crouch') || (this.state === 'attack' && this.move.crouching && this.mf >= 2) || (this.state === 'hitstun' && this.crouch); }
  isAirborne() { return this.y > 0.12; }
  canAct() { const s = this.state; return s === 'idle' || s === 'crouch' || (s === 'dash' && this.sf > 3) || (s === 'backdash' && this.sf > 12) || (s === 'sidestep' && this.sf > 9) || (s === 'land' && this.sf > 3); }
  guardType() {
    if (this.noGuard) return null;
    if (this.state === 'blockstun') return this.blockType;
    if (!(this.state === 'idle' || this.state === 'crouch' || (this.state === 'backdash' && this.sf > 8) || this.state === 'land')) return null;
    const d = this.lastDir;
    if (this.isCrouching()) return (d === 1 || d === 2) ? 'crouch' : null;
    if (d === 4 || d === 7 || d === 1) return 'stand';
    if (d === 5 && this.neutralGuards) return 'stand';
    return null;
  }

  /* ---------- per-frame logic ---------- */
  step(inp) {
    const g = this.game, o = this.opp; this.frame++; this.sf++;
    if (this.invuln > 0) this.invuln--;
    if (this.wsWindow > 0) this.wsWindow--;
    const d = inp.dir, b = inp.b || {};
    this.lastDir = d;
    const up = d >= 7, down = d <= 3, pUp = this.prevDir >= 7, pDown = this.prevDir <= 3;
    let dashTrig = false, bdashTrig = false, ss = b.ssu ? 1 : b.ssd ? -1 : 0, jumpTrig = 0;
    if (d === 6 && this.prevDir !== 6) { if (this.frame - this.lastFwdTap < 15) dashTrig = true; this.lastFwdTap = this.frame; }
    if (d === 4 && this.prevDir !== 4) { if (this.frame - this.lastBackTap < 15) bdashTrig = true; this.lastBackTap = this.frame; }
    if (up && !pUp) this.upF = 0; if (up) { this.upF++; if (this.upF === 5) jumpTrig = d === 9 ? 1 : d === 7 ? -1 : 0.001; }
    if (!up && pUp && this.upF < 5) ss = 1;
    if (down && !pDown) { this.downF = 0; this.pressedInDown = false; } if (down) this.downF++;
    if (!down && pDown) { if (this.downF < 6 && !this.pressedInDown && d === 5) ss = -1; if (this.downF >= 6) this.wsWindow = 10; }
    if (d === 3 && this.prevDir !== 3) this.lastDf = this.frame;
    this.prevDir = d;
    let btn = null;
    const p1 = b['1'], p2 = b['2'], p3 = b['3'], p4 = b['4'];
    if (b.ra) btn = 'RA'; else if (b.heat || (p2 && p3)) btn = 'HEAT'; else if (b.thr || (p1 && p3)) btn = '1+3'; else if (p2 && p4) btn = '2+4'; else if (p1 && p2) btn = '1+2'; else if (p3 && p4) btn = '4';
    else btn = p1 ? '1' : p2 ? '2' : p3 ? '3' : p4 ? '4' : null;
    if (btn && down) this.pressedInDown = true;
    if (btn === 'RA' && !(this.rage && !this.rageUsed)) btn = null;
    if (btn === 'HEAT') btn = this.heatActive ? 'HS' : this.heatAvail ? 'HB' : null;
    if (btn === '1+2' && (d === 6 || d === 9)) btn = 'f+1+2';
    // heat timer
    if (this.heatActive && this.state !== 'thrown' && !this.game.roundOver) { this.heatT--; if (this.heatT <= 0) this.endHeat(); }
    if (btn) this.buf = { btn, d, f: this.frame };
    else if (this.buf && this.frame - this.buf.f <= 9 && this.canAct()) { btn = this.buf.btn; }

    const st = this.state;
    // ----- throws in progress
    if (st === 'throwing') return this.stepThrowing();
    if (st === 'thrown') { if (this.tf <= 16 && btn && (btn === this.breakBtn || btn.indexOf(this.breakBtn) >= 0)) this.thrower.breakThrow(); this.physics(); return; }

    // ----- attack in progress
    if (st === 'attack') {
      const m = this.move; this.mf++;
      if (btn && this.mf <= 3 && (btn.length >= 3 || btn === 'HB' || btn === 'HS') && this.mf > 0) { const id = btn; if (this.moves[id] && this.move.id.length === 1) { this.startMove(id); this.physics(); return; } }
      if (this.cancelToDash && this.mf >= m.startup + m.active + 2) { this.cancelToDash = false; this.toState('dash'); this.physics(); return; }
      if (btn && m.chain && m.chain[btn] && this.mf >= 3) this.queued = m.chain[btn];
      if (this.queued && this.mf >= m.chainAt) { const q = this.queued; this.queued = null; this.startMove(q); this.physics(); return; }
      const lg = m.lunge || (m.air || m.grounded || m.throw ? 0 : 0.1);
      if (lg && this.mf <= m.startup) { this.fwd(); this.vel.x = _v.x * lg / m.startup * 1.4; this.vel.z = _v.z * lg / m.startup * 1.4; }
      if (m.homing && this.mf < m.startup - 2) this.trackFace(0.25);
      else if (this.mf < 4) this.trackFace(0.3);
      if (this.mf === Math.max(1, m.startup - 4)) Audio.whoosh(m.sound === 'heavy');
      if (m.air) { if (this.y <= 0 && this.vy <= 0 && this.mf > 3) { this.toState('land'); this.game.fx.dust(this.pos, 4); } }
      else if (this.mf >= m.total) this.toState(m.crouching && down ? 'crouch' : 'idle');
      this.physics(); return;
    }

    // ----- reaction states
    if (st === 'hitstun' || st === 'blockstun') { this.stun--; if (this.stun <= 0) this.toState(down ? 'crouch' : 'idle'); this.trackFace(0.2); this.physics(); return; }
    if (st === 'air') { this.physics(); return; }
    if (st === 'wallsplat') { this.vel.set(0, 0, 0); if (this.sf > 30) this.y = Math.max(0, this.y - 0.004); if (this.sf > 56) { this.toState('air'); this.vy = 0; } this.physics(); return; }
    if (st === 'crumple') { if (this.sf > 64) { this.toState('grounded'); this.game.fx.dust(this.pos, 6); Audio.thud(); } this.physics(); return; }
    if (st === 'ko') { this.physics(); return; }
    if (st === 'grounded') {
      if (this.sf >= 14 && !g.roundOver) {
        if (btn === '3' || btn === '4') { this.startMove(btn === '3' ? 'gr+3' : 'gr+4'); this.physics(); return; }
        if (d === 6 || d === 8 || d === 9 || d === 3) { this.toState('getup'); this.invuln = 14; }
        else if (d === 4 || d === 7 || d === 1) { this.toState('backroll'); this.invuln = 16; }
        else if (ss) { this.toState('sideroll'); this.ssDir = ss; this.invuln = 14; }
      }
      if (this.sf >= 75 && !g.roundOver) { this.toState('getup'); this.invuln = 14; }
      this.physics(); return;
    }
    if (st === 'getup') { if (this.sf >= 30) this.toState('idle'); this.trackFace(0.15); this.physics(); return; }
    if (st === 'backroll') { this.fwd(); this.vel.x = -_v.x * 0.05; this.vel.z = -_v.z * 0.05; if (this.sf >= 24) this.toState('crouch'); this.physics(); return; }
    if (st === 'sideroll') { this.lateral(this.ssDir, 0.055); if (this.sf >= 18) this.toState('getup'), this.sf = 14; this.physics(); return; }
    if (st === 'intro' || st === 'win' || st === 'lose') { this.physics(); return; }

    // ----- free states: idle / crouch / dash / backdash / sidestep / jump / land
    if (st === 'jump') {
      if (btn && btn !== 'RA' && this.y > 0.05) { const id = (btn === '3' || btn === '1') ? 'u+3' : 'u+4'; this.startMove(id); this.physics(); return; }
      if (this.y <= 0 && this.vy <= 0 && this.sf > 4) { this.toState('land'); this.game.fx.dust(this.pos, 4); Audio.step(); }
      this.physics(); return;
    }
    if (st === 'prejump') { if (this.sf >= 4) { this.toState('jump'); this.vy = 0.088; this.y = 0.01; this.fwd(); const h = this.jumpH * 0.045; this.vel.x = _v.x * h; this.vel.z = _v.z * h; } this.physics(); return; }
    if (st === 'land' && this.sf >= 6) this.toState('idle');
    if (this.canAct()) {
      const dashing = dashTrig || this.state === 'dash' || (this.frame - this.dashEnd < 6);
      if (btn) {
        const id = this.resolveCmd(btn, d, { dash: dashing && !down, ws: this.wsWindow > 0 && !down });
        if (id && this.moves[id]) { this.buf = null; this.startMove(id); this.physics(); return; }
      }
      if (ss && this.state !== 'sidestep') { this.toState('sidestep'); this.ssDir = ss; this.physics(); return; }
      if (dashTrig && this.state !== 'dash') { this.toState('dash'); Audio.step(); this.physics(); return; }
      if (bdashTrig && this.state !== 'backdash') { this.toState('backdash'); Audio.step(); this.physics(); return; }
      if (jumpTrig && (this.state === 'idle' || this.state === 'land' || this.state === 'crouch')) { this.toState('prejump'); this.jumpH = jumpTrig === 0.001 ? 0 : jumpTrig; this.physics(); return; }
    }
    const S2 = this.state;
    if (S2 === 'dash') {
      if (d === 6 && this.sf > 14 && this.sf < 60) { this.run = true; } // holding forward keeps the dash running a bit
      const sp = (this.sf < 18 ? lerp(0.12, 0.04, this.sf / 18) : (d === 6 && this.sf < 50 ? 0.06 : 0)) * this.def.speed * (this.heatDash > 0 ? 1.8 : 1); if (this.heatDash > 0) { this.heatDash--; if ((this.sf & 1) === 0) this.game.fx.aura(this.pos, new THREE.Color(2.4, 1.0, 0.25)); }
      this.fwd(); this.vel.x = _v.x * sp; this.vel.z = _v.z * sp; this.trackFace(0.3);
      if (this.sf >= 18 && !(d === 6 && this.sf < 50)) { this.dashEnd = this.frame; this.toState('idle'); }
      if (this.distTo(this.opp) < 0.78 * this.scale) { this.dashEnd = this.frame; this.toState('idle'); }
    } else if (S2 === 'backdash') {
      const sp = lerp(0.11, 0.01, clamp(this.sf / 22, 0, 1)) * this.def.speed; this.fwd(); this.vel.x = -_v.x * sp; this.vel.z = -_v.z * sp;
      if (this.sf >= 22) this.toState('idle');
    } else if (S2 === 'sidestep') {
      this.lateral(this.ssDir, lerp(0.075, 0.02, this.sf / 18) * this.def.speed);
      if (this.sf >= 18) this.toState('idle');
      if (this.sf > 4 && this.sf < 12 && ss === this.ssDir && !this.ssWalk) this.ssWalk = true;
    } else if (S2 === 'idle' || S2 === 'crouch' || S2 === 'land') {
      if (down && S2 !== 'crouch') this.toState('crouch');
      else if (!down && S2 === 'crouch') this.toState('idle');
      this.trackFace(0.35);
      if (this.state === 'idle' && (d === 6 || d === 4)) {
        const sp = (d === 6 ? 0.034 : -0.028) * this.def.speed; this.fwd(); this.vel.x = _v.x * sp; this.vel.z = _v.z * sp; this.walkPhase += d === 6 ? 0.18 : -0.16;
        if (Math.abs(Math.sin(this.walkPhase)) < 0.09 && this.sf % 6 === 0) Audio.step();
      } else { this.vel.x *= 0.6; this.vel.z *= 0.6; }
    }
    this.physics();
  }
  lateral(dir, sp) {
    // circle around the opponent; dir 1 = away from camera
    const o = this.opp; const gx = this.game.camFwd.x, gz = this.game.camFwd.z;
    let lx = Math.cos(this.face), lz = -Math.sin(this.face); if (lx * gx + lz * gz < 0) { lx = -lx; lz = -lz; }
    const r = this.distTo(o); this.pos.x += lx * sp * dir; this.pos.z += lz * sp * dir;
    const nr = this.distTo(o); if (nr > 0.01) { this.pos.x = o.pos.x + (this.pos.x - o.pos.x) * r / nr; this.pos.z = o.pos.z + (this.pos.z - o.pos.z) * r / nr; }
    this.vel.x = 0; this.vel.z = 0; this.trackFace(0.5);
  }
  trackFace(k) { const a = this.angleTo(this.opp); this.face += wrapDeg((a - this.face) * 180 / Math.PI) * Math.PI / 180 * k; }
  toState(s) { this.state = s; this.sf = 0; if (s !== 'attack') { this.move = null; } if (s === 'idle' || s === 'crouch') { this.crouch = s === 'crouch'; } if (s === 'sidestep') this.ssWalk = false; }
  resolveCmd(btn, d, ctx) {
    if (btn === 'RA') return 'RA';
    if (btn === '1+3' || btn === '2+4' || btn === '1+2' || btn === 'f+1+2' || btn === 'HB' || btn === 'HS') return btn;
    if (ctx.dash) { if (btn === '2') return 'f,f+2'; if (btn === '3') return 'f,f+3'; }
    if (ctx.ws) { if (btn === '2') return 'ws+2'; if (btn === '4') return 'ws+4'; }
    if (d === 3) { if (btn === '2') return 'd/f+2'; if (btn === '4') return 'd/f+4'; if (btn === '1') return 'd+1'; if (btn === '3') return 'd+3'; }
    if (d === 2 || d === 1) { if (btn === '1' || btn === '2') return 'd+1'; if (btn === '3') return 'd+3'; if (btn === '4') return 'd+4'; }
    if (d === 6 || d === 9) { if (btn === '2') return 'f+2'; if (btn === '4') return 'f+4'; }
    if (d === 4 || d === 7) { const k = 'b+' + btn; if (this.moves[k]) return k; }
    return btn;
  }
  startMove(id) {
    const m = this.moves[id]; if (!m) return; this.buf = null;
    const wasAir = this.state === 'jump' || (this.move && this.move.air);
    this.toState('attack'); this.move = m; this.mf = 0; this.hitDone = false; this.queued = null; this.moveSerial = ++SERIAL; this.landed = false; this.wasBlocked = false;
    this.crouch = !!m.crouching;
    if (!m.air && !wasAir) { this.vel.x *= 0.3; this.vel.z *= 0.3; }
    if (m.hop) { this.vy = 0; }
    if (m.rageArt) { this.rage = false; this.rageUsed = true; this.game.onRageArt(this); }
    if (m.heatBurst) { this.activateHeat(true); this.game.onHeatBurst(this); }
    if (m.heatSmash) { this.heatActive = false; this.heatT = 0; this.game.onHeatSmash(this); }
    if (m.powerCrush) this.game.callout(m.name.toUpperCase(), this.idx);
    this.game.onMoveStart(this, m);
  }
  activeNow() { const m = this.move; return this.state === 'attack' && !this.hitDone && this.mf >= m.startup && this.mf < m.startup + m.active; }
  remaining() { return this.move ? Math.max(0, this.move.total - this.mf) : 0; }

  /* ---------- throws ---------- */
  grab(victim, m) {
    this.state = 'throwing'; this.tf = 0; this.target = victim; this.throwMove = m; this.hitDone = true;
    victim.state = 'thrown'; victim.sf = 0; victim.tf = 0; victim.thrower = this; victim.breakBtn = m.id === '2+4' ? '2' : '1'; victim.move = null;
    victim.face = this.face + Math.PI; Audio.throwGrab(); this.game.onThrow(this, victim);
  }
  breakThrow() {
    const v = this.target; this.game.callout('THROW BREAK'); Audio.block();
    for (const f of [this, v]) { f.toState('blockstun'); f.stun = 18; f.blockType = 'stand'; f.fwd(); f.vel.x = -_v.x * 0.09; f.vel.z = -_v.z * 0.09; }
    v.thrower = null; this.target = null; this.game.fx.hit(_v2.copy(this.pos).lerp(v.pos, 0.5).setY(1.3), 0.5, true);
  }
  stepThrowing() {
    const v = this.target; this.tf++; v.tf = this.tf; this.sf++;
    this.fwd(); const reach = 0.72 * this.scale;
    v.pos.x = this.pos.x + _v.x * reach; v.pos.z = this.pos.z + _v.z * reach; v.face = this.face + Math.PI;
    const t = this.tf;
    v.y = t < 10 ? 0 : t < 34 ? lerp(0, 0.55, smooth((t - 10) / 24)) : t < 44 ? lerp(0.55, 0, (t - 34) / 10) : 0;
    if (t === 44) {
      const m = this.throwMove; let dmg = Math.round(m.dmg * (this.rage ? 1.1 : 1)); v.applyDamage(dmg, this); this.game.onHit(this, v, m, false, v.pos.clone().setY(0.4), dmg);
      this.game.fx.dust(v.pos, 14); Audio.thud(); Audio.hit(1.4); this.game.shake(0.35);
    }
    if (t >= 72) { this.toState('idle'); v.thrower = null; this.target = null; if (v.hp <= 0) { v.toState('ko'); v.ko = true; } else { v.toState('grounded'); v.sf = 18; } v.comboHits = 0; v.comboDmg = 0; }
    this.vel.set(0, 0, 0); this.syncModel(); return;
  }

  /* ---------- receiving hits ---------- */
  applyDamage(dmg, att) {
    this.hp = Math.max(this.game.mode === 'training' ? 1 : 0, this.hp - dmg); this.comboHits++; this.comboDmg += dmg; this.lastHitBy = att;
    att.comboShow = { hits: this.comboHits, dmg: this.comboDmg, t: 100 };
    if (!this.rageUsed && this.hp > 0 && this.hp <= this.maxHp * 0.25 && !this.rage) { this.rage = true; Audio.rage(); this.game.onRage(this); }
  }
  takeHit(att, m, counter) {
    const wasJuggle = this.state === 'air' || this.state === 'wallsplat' || this.state === 'crumple';
    const wasGround = this.state === 'grounded' || this.state === 'backroll' || this.state === 'sideroll';
    let dmg = m.dmg;
    if (wasJuggle) dmg *= Math.max(0.3, 1 - 0.14 * this.juggle);
    else if (this.comboHits > 0) dmg *= Math.max(0.5, 1 - 0.1 * this.comboHits);
    if (wasGround) dmg *= 0.55;
    if (counter) dmg *= 1.2;
    if (att.rage) dmg *= 1.1;
    if (att.heatActive) dmg *= 1.1;
    dmg = Math.max(1, Math.round(dmg));
    this.applyDamage(dmg, att); this.lastHitMove = m; this.hitVar = Math.random() < 0.5 ? -1 : 1;
    this.rec = Math.min(this.maxHp - this.hp, Math.round(this.rec * 0.6 + dmg * 0.28)); att.regain(dmg * 0.45);
    att.landed = true;
    this.face = att.face + Math.PI; this.move = null; this.queued = null;
    const away = _v2.set(this.pos.x - att.pos.x, 0, this.pos.z - att.pos.z); const L = away.length() || 1; away.multiplyScalar(1 / L);
    const push = (k) => { this.vel.x = away.x * k; this.vel.z = away.z * k; };
    if (this.hp <= 0) { this.state = 'air'; this.sf = 0; this.ko = true; this.vy = Math.max(this.vy, 0.062); this.y = Math.max(this.y, 0.05); push(0.075); this.flying = true; return dmg; }
    if (wasJuggle || wasGround) {
      this.state = 'air'; this.sf = 0; this.juggle++;
      if (wasGround) { this.vy = 0.035; this.y = Math.max(this.y, 0.02); push(0.03); }
      else if (m.screw && !this.screwUsed) { this.screw = true; this.screwUsed = true; this.vy = 0.026; push(0.05); this.game.callout('TORNADO'); }
      else if (m.launch) { this.vy = m.launch * 0.6; push(0.01); }
      else if (m.knockdown || m.wallSplat || m.rageArt) { this.vy = 0.042; push(0.085 + m.pushback * 0.05); this.flying = true; }
      else { this.vy = Math.max(0.03, 0.058 - this.juggle * 0.005); push(0.012); }
      if (this.state === 'air' && this.y < 0.05) this.y = 0.05;
      return dmg;
    }
    this.juggle = 0;
    if (m.launch) { this.state = 'air'; this.sf = 0; this.vy = m.launch; this.y = 0.05; this.juggle = 1; push(0.006); this.flying = false; }
    else if (m.crumple && counter) { this.state = 'crumple'; this.sf = 0; push(0.01); this.game.callout('CRUMPLE'); }
    else if (m.knockdown || (counter && m.counterKD) || m.rageArt || this.isAirborne()) { this.state = 'air'; this.sf = 0; this.vy = m.level === 'l' ? 0.032 : 0.048; this.y = Math.max(this.y, 0.05); push(m.level === 'l' ? 0.03 : 0.07 + m.pushback * 0.04); this.flying = true; this.juggle = 1; if (m.level === 'l') this.sweepFall = true; }
    else { this.state = 'hitstun'; this.sf = 0; this.stun = m.hitstun + (counter ? 8 : 0); this.crouch = this.isCrouching() && m.level !== 'h'; this.hitPose = m.level === 'h' ? 'hitHigh' : m.level === 'l' ? 'hitLow' : 'hitMid'; push(m.pushback * 0.14); this.hitWallSplat = !!m.wallSplat; }
    return dmg;
  }
  blockHit(att, m) {
    this.blockType = this.guardType() || 'stand'; this.state = 'blockstun'; this.sf = 0; this.stun = m.blockstun; this.move = null;
    const away = _v2.set(this.pos.x - att.pos.x, 0, this.pos.z - att.pos.z).normalize();
    this.vel.x = away.x * m.pushback * 0.13; this.vel.z = away.z * m.pushback * 0.13; att.wasBlocked = true;
    att.vel.x -= away.x * 0.02; att.vel.z -= away.z * 0.02;
    if (att.heatActive && this.hp > 1) { const chip = Math.max(1, Math.round(m.dmg * 0.15)); this.hp = Math.max(1, this.hp - chip); this.rec = Math.min(this.maxHp - this.hp, this.rec + chip); }
    att.regain(m.dmg * 0.15);
  }
  regain(n) { const r = Math.min(this.rec, Math.round(n)); if (r > 0 && this.hp > 0) { this.hp += r; this.rec -= r; } }
  activateHeat(burst) { this.heatActive = true; this.heatAvail = false; this.heatT = 600; this.regain(burst ? 12 : 6); }
  endHeat() { this.heatActive = false; this.heatT = 0; }

  /* ---------- physics ---------- */
  physics() {
    const g = this.game;
    this.pos.x += this.vel.x; this.pos.z += this.vel.z;
    const airState = this.state === 'air' || this.state === 'jump' || (this.state === 'attack' && this.move.air);
    if (airState || this.y > 0) {
      if (this.state !== 'wallsplat' && this.state !== 'thrown') { const grav = this.state === 'air' ? 0.0042 + this.juggle * 0.0004 : GRAVITY; this.vy -= grav; this.y += this.vy; }
      if (this.y <= 0) {
        this.y = 0;
        if (this.state === 'air') {
          if (this.screw && !this.ko) { this.screw = false; this.vy = 0.05; this.juggle = Math.max(1, this.juggle - 1); g.fx.dust(this.pos, 10); Audio.thud(); g.shake(0.2); }
          else if (this.vy < -0.05 && !this.bounced && !this.ko && this.juggle < 2) { this.vy = 0.035; this.bounced = true; g.fx.dust(this.pos, 6); Audio.thud(); g.shake(0.12); }
          else { this.vy = 0; this.bounced = false; this.flying = false; this.sweepFall = false; g.fx.dust(this.pos, 10); Audio.thud(); g.shake(0.18); if (this.ko) { this.toState('ko'); g.onKOLand(this); } else this.toState('grounded'); }
        } else this.vy = 0;
      }
    }
    if (!airState) { this.vel.x *= 0.82; this.vel.z *= 0.82; } else { const fr = this.state === 'air' ? (this.flying || this.ko ? 0.95 : 0.9) : 0.985; this.vel.x *= fr; this.vel.z *= fr; }
    if (this.state === 'hitstun' || this.state === 'blockstun') { this.vel.x *= 0.92; this.vel.z *= 0.92; }
    const wall = g.stage.clamp(this.pos, 0.3 * this.scale);
    const flyingIn = ((this.state === 'air' && this.flying) || (this.state === 'hitstun' && this.hitWallSplat)) && Math.hypot(this.vel.x, this.vel.z) > 0.025;
    if (wall && flyingIn && g.stage.canBreak(wall) && (this.splatted || (this.lastHitMove && this.lastHitMove.wallBreak))) {
      g.onWallBreak(this, wall);
    } else if (wall && flyingIn && !this.splatted && !this.ko) {
      this.toState('wallsplat'); this.splatted = true; this.y = clamp(this.y, 0.0, 0.5); this.vy = 0; this.juggle = Math.max(1, this.juggle);
      g.callout('WALL SPLAT'); g.fx.dust(this.pos, 8); Audio.thud(); g.shake(0.3); g.camKick(0.5);
    }
    if (this.state === 'idle' || this.state === 'crouch') { if (this.comboHits) { this.comboHits = 0; this.comboDmg = 0; } this.splatted = false; this.juggle = 0; this.hitWallSplat = false; this.screwUsed = false; this.screw = false; }
    this.syncModel();
  }
  syncModel() {
    const r = this.model.root; r.position.set(this.pos.x, this.y, this.pos.z); r.rotation.y = this.face;
    this.shadow.position.set(this.pos.x, 0.012, this.pos.z); const s = 1 / (1 + this.y * 1.2); this.shadow.scale.setScalar((this.state === 'grounded' || this.state === 'ko' ? 1.5 : 1) * s); this.shadow.material.opacity = 0.85 * s;
  }

  /* ---------- visual pose (runs every logic frame) ---------- */
  animate(t) {
    const md = this.model; const st = this.state; let pose = STANCE, k = 0.25;
    if (st === 'attack') { pose = sampleAnim(ANIMS[this.move.anim], this.mf); k = this.mf < 3 ? 0.5 : 0.85; }
    else if (st === 'throwing') { pose = sampleAnim(ANIMS.throwA, this.tf); k = 0.6; }
    else if (st === 'thrown') { pose = sampleAnim(ANIMS.throwD, this.tf); k = 0.5; }
    else if (st === 'idle' || st === 'land') {
      pose = idlePose(this.def.idle, t, this.idlePhase + this.idx, this.hp < this.maxHp * 0.3);
      if (Math.abs(this.vel.x) + Math.abs(this.vel.z) > 0.01) { const w = this.walkPhase; pose = Object.assign({}, pose, { lHip: [-14 - Math.sin(w) * 14, 0, 6], rHip: [8 + Math.sin(w) * 14, 0, -6], lKnee: [18 + Math.max(0, Math.cos(w)) * 22, 0, 0], rKnee: [14 + Math.max(0, -Math.cos(w)) * 22, 0, 0], hy: STANCE.hy - Math.abs(Math.sin(w)) * 0.025 }); }
      if (st === 'land') { pose = POSES.crouch; k = 0.4; }
    }
    else if (st === 'crouch') pose = POSES.crouch, k = 0.35;
    else if (st === 'prejump') pose = POSES.crouch, k = 0.5;
    else if (st === 'jump') pose = POSES.jump, k = 0.3;
    else if (st === 'dash') pose = POSES.dash, k = 0.3;
    else if (st === 'backdash') pose = POSES.backdash, k = 0.3;
    else if (st === 'sidestep') pose = POSES.sidestep, k = 0.3;
    else if (st === 'hitstun') {
      pose = this.sf < this.stun * 0.6 + 4 ? POSES[this.hitPose] : STANCE; if (this.crouch) pose = POSES.hitLow; k = this.sf < 3 ? 0.7 : 0.2;
      if (pose !== STANCE) { const v = this.hitVar, q = Object.assign({}, pose); q.chest = [pose.chest[0], pose.chest[1] + v * 18, pose.chest[2] + v * 6]; q.neck = [pose.neck[0], pose.neck[1] + v * 22, pose.neck[2] - v * 14]; q.spine = [pose.spine[0], pose.spine[1] + v * 8, pose.spine[2]]; pose = q; }
    }
    else if (st === 'blockstun') { pose = this.blockType === 'crouch' ? POSES.blockLow : POSES.block; k = 0.6; }
    else if (st === 'air') { pose = this.sweepFall ? POSES.falling : this.vy > 0.01 ? POSES.launched : POSES.falling; k = 0.25; }
    else if (st === 'wallsplat') { pose = POSES.wall; k = 0.5; }
    else if (st === 'crumple') { pose = this.sf < 20 ? POSES.stagger : this.sf < 46 ? POSES.ko1 : POSES.lying; k = 0.12; }
    else if (st === 'grounded' || st === 'ko') { pose = POSES.lying; k = 0.25; }
    else if (st === 'getup') { pose = sampleAnim(ANIMS.getup, this.sf); k = 0.5; }
    else if (st === 'backroll') { pose = sampleAnim(ANIMS.backroll, this.sf); k = 0.5; }
    else if (st === 'sideroll') { pose = POSES.lying; k = 0.3; }
    else if (st === 'intro') {
      const it = this.game.introT - (this.idx ? 100 : 0); const tp = POSES[this.def.introPose] || POSES.intro;
      pose = this.game.introT >= 200 ? STANCE : it < 22 ? POSES.intro : it < 85 ? tp : STANCE; k = it < 85 ? 0.09 : 0.12;
    }
    else if (st === 'win') { pose = this.sf < 20 ? STANCE : POSES[this.def.win]; k = 0.08; }
    else if (st === 'lose') { pose = POSES.hitMid; k = 0.08; }
    md.setPose(pose, k);
    // lying body spin when side rolling
    md.joints.hips.rotation.y += st === 'sideroll' ? this.sf * 0.35 * this.ssDir : 0;
    if (st === 'air' && this.screw) md.joints.hips.rotation.y += this.sf * 0.55;
    md.setRage(this.rage, t, this.heatActive);
    // eyes: blink, squint when hurt, shut when down
    this.blinkT--; let lid = 0; if (this.blinkT < 0) { lid = 1; if (this.blinkT < -6) this.blinkT = 90 + Math.random() * 220; }
    if (st === 'hitstun' || st === 'air' || st === 'crumple' || st === 'thrown') lid = 0.75; if (st === 'ko' || (st === 'lose')) lid = 1;
    md.setBlink(lid);
    md.root.updateMatrixWorld(true); if (md.body) md.body.update(); else md.updateSecondary(this.face);
    if (this.heatActive && (t | 0) % 2 === 0) this.game.fx.aura(this.pos, new THREE.Color(2.6, 0.9, 0.2));
    // limb trail
    let on = false, A = null, B = null;
    if (st === 'attack' && this.move.anim && LIMB[this.move.anim]) {
      const m = this.move; on = this.mf >= m.startup - 4 && this.mf <= m.startup + m.active + 2;
      if (on) { const lp = this.limbPoints(LIMB[this.move.anim]); A = lp[0]; B = lp[1]; }
    }
    if (on) { md.root.updateMatrixWorld(true); this.trail.push(A.getWorldPosition(_v), B.getWorldPosition(new THREE.Vector3()), true); }
    else this.trail.push(null, null, false);
    if (this.rage && (t | 0) % 3 === 0) this.game.fx.aura(this.pos, new THREE.Color(2.4, 0.3, 0.1));
  }
  limbPoints(n) {
    const j = this.model.joints, md = this.model;
    if (n === 'lHand') return [j.lEl, md.lHand]; if (n === 'rHand') return [j.rEl, md.rHand];
    if (n === 'lFoot') return [j.lKnee, md.lFoot]; if (n === 'rFoot') return [j.rKnee, md.rFoot];
    if (n === 'rKnee') return [j.rHip, j.rKnee]; if (n === 'rElbow') return [j.rSh, j.rEl];
    return [j.rEl, md.rHand];
  }
  strikePoint(out) {
    const n = this.move && LIMB[this.move.anim]; const lp = this.limbPoints(n || 'rHand'); this.model.root.updateMatrixWorld(true); return lp[1].getWorldPosition(out || new THREE.Vector3());
  }
}

/* contact test from attacker A's current active move against B */
function checkContact(A, B) {
  if (!A.activeNow()) return null;
  const m = A.move; if (B.invuln > 0 || B.state === 'thrown' || B.state === 'throwing' || B.state === 'ko' || B.state === 'getup' && B.sf < 14) return null;
  const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, dist = Math.hypot(dx, dz);
  const reach = m.reach * A.scale + 0.28 * B.scale;
  if (dist > reach) return null;
  if (dist > 0.45) { const c = (Math.sin(A.face) * dx + Math.cos(A.face) * dz) / dist; if (c < (m.homing ? 0.35 : 0.8)) return null; }
  if (B.state === 'sidestep' && B.sf > 3 && B.sf < 16 && !m.homing) return null;
  if (m.throw) {
    if (B.isCrouching() || B.isAirborne() || ['air', 'grounded', 'backroll', 'sideroll', 'wallsplat', 'crumple'].includes(B.state)) return null;
    return { type: 'throw' };
  }
  const grounded = B.state === 'grounded' || B.state === 'backroll' || B.state === 'sideroll';
  if (grounded) return m.hitsGrounded ? { type: 'hit', counter: false } : null;
  const juggle = B.state === 'air' || B.state === 'wallsplat' || B.state === 'crumple';
  if (juggle) { if (m.level === 'l' && B.y > 0.45) return null; if (B.y > 1.6) return null; return { type: 'hit', counter: false }; }
  if (B.isAirborne() || (B.state === 'attack' && B.move.hop && B.mf >= 4 && B.mf < B.move.startup + B.move.active)) { if (m.level === 'l') return null; }
  if (B.isCrouching() && m.level === 'h') return null;
  // armor (rage art / iron hammer)
  if (B.state === 'attack' && B.move.armor && B.mf >= B.move.armor[0] && B.mf <= B.move.armor[1] && !(B.move.powerCrush && m.level === 'l')) return { type: 'armor' };
  if (m.level === 'l' && B.canAct() && B.lastDir === 3 && B.frame - B.lastDf <= 8) return { type: 'parry' };
  const gt = B.guardType();
  const blocked = gt && ((m.level === 'sm') || ((m.level === 'h' || m.level === 'm') && gt === 'stand') || (m.level === 'l' && gt === 'crouch'));
  if (blocked) return { type: 'block' };
  const counter = B.state === 'attack' && B.mf < B.move.startup + B.move.active;
  return { type: 'hit', counter };
}
