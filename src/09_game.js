/* ============ final grading shader ============ */
const FinalShader = {
  uniforms: { tDiffuse: { value: null }, exposure: { value: 1 }, vignette: { value: 0.55 }, time: { value: 0 }, aberr: { value: 0 }, desat: { value: 0 }, flash: { value: 0 }, tint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float exposure, vignette, time, aberr, desat, flash; uniform vec3 tint; varying vec2 vUv;
    vec3 aces(vec3 x){ const float a=2.51,b=0.03,c=2.43,d=0.59,e=0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e),0.0,1.0); }
    void main(){ vec2 uv=vUv; vec2 dc=uv-0.5; vec3 col;
      if(aberr>0.0){ col.r=texture2D(tDiffuse,uv+dc*aberr).r; col.g=texture2D(tDiffuse,uv).g; col.b=texture2D(tDiffuse,uv-dc*aberr).b; } else col=texture2D(tDiffuse,uv).rgb;
      col *= exposure*0.75*tint; col = aces(col);
      float l = dot(col, vec3(0.299,0.587,0.114)); col = mix(col, vec3(l), desat);
      col = pow(col, vec3(1.0/2.2));
      float v = smoothstep(0.95, 0.3, length(dc*vec2(1.0,0.75))); col *= mix(1.0, v, vignette);
      float n = fract(sin(dot(uv*(time+1.0), vec2(12.9898,78.233)))*43758.5453); col += (n-0.5)*0.022;
      col = mix(col, vec3(1.0), flash);
      gl_FragColor = vec4(col,1.0); }`,
};

const MODES = { arcade: 'Arcade', versus: 'Versus', training: 'Training', demo: 'Demo' };
const DUMMY = [['stand', 'Stand'], ['crouch', 'Crouch'], ['guard', 'Guard all'], ['jump', 'Jump'], ['cpu', 'CPU fights back']];

const Game = {
  phase: 'boot', paused: false, frame: 0, timeScale: 1, slowT: 0, hitstop: 0, shakeAmt: 0, acc: 0, last: 0, rt: 0,
  init() {
    if (typeof THREE === 'undefined') { $('loader').textContent = 'The 3D engine could not load. Check your connection and reload.'; return; }
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.physicallyCorrectLights = false;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 400);
    this.camFwd = new THREE.Vector3(0, 0, -1); this.camSide = new THREE.Vector3(0, 0, 1); this.look = new THREE.Vector3(0, 1, 0);
    this.blobTex = blobShadowTex();
    this.applyQuality();
    addEventListener('resize', () => this.resize()); this.resize();
    Input.init(); this.bindUI(); this.buildShowcase(); this.resize();
    this.startDemo();
    $('loader').hidden = true;
    this.showScreen('title');
    requestAnimationFrame(t => this.loop(t));
  },
  applyQuality() {
    const r = this.renderer, q = SETTINGS.quality;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, [1, 1.5, 2][q]));
    r.shadowMap.type = q === 0 ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    this.post = null;
    if (q > 0 && THREE.EffectComposer && THREE.UnrealBloomPass && THREE.RenderPass && THREE.ShaderPass) {
      try {
        r.toneMapping = THREE.NoToneMapping; r.outputEncoding = THREE.LinearEncoding;
        const w2 = r.capabilities.isWebGL2; const pars = { type: w2 ? THREE.HalfFloatType : THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
        let rt; if (w2 && THREE.WebGLMultisampleRenderTarget) { rt = new THREE.WebGLMultisampleRenderTarget(4, 4, pars); rt.samples = q === 2 ? 4 : 2; } else rt = new THREE.WebGLRenderTarget(4, 4, pars);
        const c = new THREE.EffectComposer(r, rt);
        this.renderPass = new THREE.RenderPass(new THREE.Scene(), this.camera); c.addPass(this.renderPass);
        this.bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.5, 1.7); c.addPass(this.bloom);
        this.finalPass = new THREE.ShaderPass(FinalShader); c.addPass(this.finalPass);
        this.post = c;
      } catch (e) { console.warn('post-processing disabled', e); this.post = null; }
    }
    if (!this.post) { r.toneMapping = THREE.ACESFilmicToneMapping; r.outputEncoding = THREE.sRGBEncoding; }
    this.resize();
  },
  resize() {
    if (!this.renderer) return; const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.fov = w / h < 1 ? 58 : 36; this.camera.updateProjectionMatrix();
    if (this.post) { this.post.setPixelRatio(this.renderer.getPixelRatio()); this.post.setSize(w, h); }
    if (this.showCam) { this.showCam.aspect = w / h; this.showCam.fov = w / h < 1 ? 52 : 34; this.showCam.updateProjectionMatrix(); this.showCam.position.z = w / h < 1 ? 6.4 : 5.6; }
  },
  get scene() { return this.stage.scene; },

  /* ---------- stage / match setup ---------- */
  addRim() {
    const r = new THREE.DirectionalLight(lin(this.stage.rimColor || '#bcd0ff'), this.stage.rimI || 0.9); r.position.set(0, 3, -4); this.stage.scene.add(r, r.target); this.rimLight = r;
  },
  loadStage(id, force) {
    if (!force && this.stage && this.stage.id === id && this.stage.q === SETTINGS.quality) return;
    if (this.fighters) { for (const f of this.fighters) f.dispose(); this.fighters = null; }
    if (this.stage) disposeScene(this.stage.scene);
    this.stage = new Stage(this, id); this.fx = new FX(this.stage.scene); this.fx.cam = this.camera; this.addRim();
  },
  setupMatch(mode, d1, d2, stageId, opts) {
    opts = opts || {};
    this.mode = mode; this.loadStage(stageId);
    if (this.fighters) for (const f of this.fighters) f.dispose();
    this.fighters = [new Fighter(d1, 0, this), new Fighter(d2, 1, this)];
    const solo = mode !== 'versus';
    this.ctrl = [null, null]; this.ai = [null, null];
    if (mode === 'demo') { this.ai = [new AI(this.fighters[0], 1), new AI(this.fighters[1], 1)]; }
    else {
      this.ctrl[0] = this.humanCtrl(0, solo);
      if (mode === 'versus') this.ctrl[1] = this.humanCtrl(1, false);
      else if (mode === 'training') this.ai[1] = new AI(this.fighters[1], SETTINGS.difficulty, this.dummyMode || 'stand');
      else this.ai[1] = new AI(this.fighters[1], opts.boss ? 3 : SETTINGS.difficulty);
    }
    for (let i = 0; i < 2; i++) if (this.ai[i]) { this.fighters[i].neutralGuards = false; }
    this.applyDummy();
    this.round = 1; this.roundsToWin = mode === 'training' || mode === 'demo' ? 99 : SETTINGS.roundsToWin;
    this.camSide.set(0, 0, 1); this.startRound(true);
  },
  humanCtrl(i, solo) { return () => { const sc = Input.screen(i, solo); const f = this.fighters[i], o = f.opp; const right = (o.pos.x - f.pos.x) * -this.camFwd.z + (o.pos.z - f.pos.z) * this.camFwd.x > 0; const r = { dir: toRel(sc, right), b: sc.press }; return SETTINGS['special' + (i + 1)] ? specialStyle(r, f, o) : r; }; },
  applyDummy() { if (this.mode !== 'training') return; const f = this.fighters[1]; const m = this.dummyMode || 'stand'; f.noGuard = m === 'stand' || m === 'crouch' || m === 'jump'; f.neutralGuards = m === 'guard'; if (this.ai[1]) this.ai[1].mode = m; },
  startRound(first) {
    const [a, b] = this.fighters; const sx = this.camSide.z >= 0 ? 1 : -1;
    a.reset(-1.45 * sx, 0, Math.PI / 2 * sx); b.reset(1.45 * sx, 0, -Math.PI / 2 * sx);
    this.camSide.set(0, 0, 1); this.look.set(0, 1, 0);
    this.roundOver = false; this.koT = 0; this.timer = SETTINGS.roundTime || 0; this.timerF = 0; this.hitstop = 0; this.timeScale = 1; this.slowT = 0; this.flashV = 0; this.desatV = 0; this.aberrV = 0;
    this.hudReset(); this.recBuf = []; this.fxLog = []; this.replay = null; this.replayed = false; this.endWhy = null; this.kick = 0; $('letterbox').hidden = true; $('hud').style.visibility = ''; this.nameCard(null);
    if (this.mode === 'demo') { this.phase = 'fight'; this.cine = null; this.timer = 0; return; }
    if (this.mode === 'training') { this.phase = 'fight'; this.cine = null; this.timer = 0; $('hud').hidden = false; this.updateTouch(); return; }
    $('hud').hidden = false;
    a.state = b.state = 'intro';
    this.phase = 'intro'; this.introT = first ? 0 : 200; this.cine = { type: 'intro' };
    this.updateTouch();
    if (first) { Audio.startMusic('fight'); if (this.mode === 'arcade' && this.arcade) this.announce(this.arcade.stage === this.arcade.list.length - 1 ? 'Final stage' : `Stage ${this.arcade.stage + 1}`, `vs ${b.def.name} · ${this.stage.def.name}`, false, 700); else this.announce(this.stage.def.name, this.stage.def.sub, false, 700); }
  },
  startDemo() {
    const pool = ROSTER.filter(r => !r.boss); const a = pick(pool); let b = pick(pool); while (b === a) b = pick(pool);
    this.setupMatch('demo', a, b, this.stage ? this.stage.id : pick(STAGES).id);
    $('hud').hidden = true; if (Audio.sfxGain) Audio.sfxGain.gain.value = 0.25;
  },

  /* ---------- main loop ---------- */
  loop(t) {
    requestAnimationFrame(tt => this.loop(tt));
    const dt = Math.min(0.1, (t - (this.last || t)) / 1000); this.last = t; this.rt += dt;
    Input.pollPads();
    if (this.phase === 'select' || this.phase === 'stageSelect') { this.renderShowcase(dt); Input.endFrame(); return; }
    if (!this.paused && this.fighters) {
      this.acc += dt * 60 * this.timeScale; let n = 0;
      while (this.acc >= 1 && n < 5) { this.step(); this.acc -= 1; n++; Input.endFrame(); }
      if (this.slowT > 0) { this.slowT -= dt * 60; if (this.slowT <= 0) this.timeScale = 1; }
    } else Input.endFrame();
    this.updateCamera(dt);
    this.stage.update(this.frame, this.camera);
    this.render();
  },
  render() {
    const q = this.finalPass;
    this.flashV *= 0.85; this.aberrV *= 0.88;
    if (this.post) {
      this.renderPass.scene = this.stage.scene; this.renderPass.camera = this.camera;
      q.uniforms.exposure.value = this.stage.def.exposure; q.uniforms.time.value = (this.rt % 10); q.uniforms.flash.value = this.flashV; q.uniforms.aberr.value = this.aberrV;
      q.uniforms.desat.value = lerp(q.uniforms.desat.value, this.desatV, 0.08);
      this.post.render();
    } else { this.renderer.toneMappingExposure = this.stage.def.exposure; this.renderer.render(this.stage.scene, this.camera); $('flash').style.opacity = this.flashV; }
  },
  step() {
    this.frame++;
    const F = this.fighters;
    if (this.replay) return this.stepReplay();
    if (this.phase === 'intro') { this.introT++; if (this.introT === 44) this.nameCard(F[0], false); else if (this.introT === 96) this.nameCard(null); else if (this.introT === 106) this.nameCard(F[1], true); else if (this.introT === 192) this.nameCard(null); if (this.introT === 200) this.announceRound(); if (this.introT >= 300) { this.phase = 'fight'; this.cine = null; for (const f of F) f.toState('idle'); this.announce('Fight!', '', true, 700); Audio.say('Fight!'); } for (const f of F) { f.sf++; f.animate(this.frame); } this.fx.update(); this.updateHud(); return; }
    if (this.hitstop > 0) { this.hitstop--; this.fx.update(); return; }
    // inputs
    const inp = [0, 1].map(i => this.ctrl[i] ? this.ctrl[i]() : this.ai[i] ? this.ai[i].think() : { dir: 5, b: {} });
    if (this.roundOver) { inp[0] = inp[1] = { dir: 5, b: {} }; }
    if (this.mode === 'training') this.recordInput(inp[0]);
    F[0].step(inp[0]); F[1].step(inp[1]);
    const c0 = checkContact(F[0], F[1]), c1 = checkContact(F[1], F[0]);
    // a strike beats a throw that lands on the same frame
    if (c0 && c1 && c0.type === 'throw' && c1.type === 'hit') this.applyContact(F[1], F[0], c1);
    else if (c0 && c1 && c1.type === 'throw' && c0.type === 'hit') this.applyContact(F[0], F[1], c0);
    else { if (c0) this.applyContact(F[0], F[1], c0); if (c1 && F[1].state === 'attack') this.applyContact(F[1], F[0], c1); }
    this.separate();
    for (const f of F) f.animate(this.frame);
    this.record();
    this.fx.update();
    this.checkRound();
    this.updateHud();
  },
  applyContact(A, B, c) {
    const m = A.move; A.hitDone = true; const pt = A.strikePoint();
    if (c.type === 'throw') { A.grab(B, m); return; }
    if (c.type === 'armor') { const dmg = Math.round(m.dmg * 0.6); B.applyDamage(dmg, A); B.rec = Math.min(B.maxHp - B.hp, B.rec + dmg); this.fx.hit(pt, 0.7, false); this.recFx(pt, 0.7, false, false); Audio.hit(0.9); this.hitstop = 6; this.callout(B.move.powerCrush ? 'POWER CRUSH' : (B.move.heatBurst || B.move.heatSmash) ? 'HEAT ARMOR' : 'ARMOR'); this.camKick(0.3); return; }
    if (c.type === 'parry') {
      A.state = 'air'; A.sf = 0; A.vy = 0.05; A.y = 0.05; A.juggle = 1; A.move = null; A.flying = false; A.face = B.face + Math.PI;
      const ax = A.pos.x - B.pos.x, az = A.pos.z - B.pos.z, L = Math.hypot(ax, az) || 1; A.vel.set(ax / L * 0.02, 0, az / L * 0.02); B.toState('idle');
      this.fx.hit(pt, 0.9, true); this.recFx(pt, 0.9, true, false); Audio.parry(); this.hitstop = 10; this.callout('LOW PARRY'); this.camKick(0.45); this.flashV = 0.2; return;
    }
    if (c.type === 'block') {
      B.blockHit(A, m); this.fx.hit(pt, 0.5, true); this.recFx(pt, 0.5, true, false); Audio.block(); this.hitstop = 4; this.shake(0.04); if (m.heatBurst || m.heatSmash || m.powerCrush) this.camKick(0.3);
      if (this.mode === 'training') this.trainStat(A, m, 'block', m.blockstun - A.remaining()); return;
    }
    const dmg = B.takeHit(A, m, c.counter);
    this.onHit(A, B, m, c.counter, pt, dmg);
  },
  onHit(A, B, m, counter, pt, dmg) {
    const power = clamp(dmg / 18, 0.3, 1.8);
    this.fx.hit(pt, power, false, counter); this.recFx(pt, power, false, counter); Audio.hit(power); this.hitstop = (m.hitstop || 5) + (counter ? 3 : 0); this.shake(0.05 + power * 0.12);
    if (power > 0.8 || counter || m.launch) this.camKick(Math.min(0.8, power * 0.35 + (counter ? 0.25 : 0)));
    if (m.engager && A.heatAvail && !A.heatActive && B.hp > 0 && !this.roundOver) { A.activateHeat(false); A.cancelToDash = true; A.heatDash = 24; this.callout('HEAT ENGAGER'); Audio.heat(); this.flashV = 0.25; if (B.state === 'hitstun') B.stun += 18; else if (B.state === 'air') B.vy = Math.max(B.vy, 0.05); }
    if (m.heatSmash) { this.flashV = 0.6; this.slow(0.3, 40); this.aberrV = 0.03; this.camKick(0.9); }
    if (power > 1) this.aberrV = 0.012 * power;
    if (counter) this.callout('COUNTER HIT');
    if (m.rageArt) { this.flashV = 0.8; this.slow(0.3, 60); this.cine = { type: 'ra', t: 0, a: A, b: B }; this.aberrV = 0.03; }
    if (this.mode === 'training' && !m.throw) this.trainStat(A, m, 'hit', B.state === 'hitstun' ? B.stun - A.remaining() : null);
  },
  onMoveStart(f, m) { if (this.mode === 'training' && f.idx === 0) { $('tr-move').textContent = `${m.name}  ·  ${notation(m.id)}`; } },
  onThrow(a, v) { if (this.mode === 'training') this.trainStat(a, a.throwMove, 'throw', null); },
  onRage(f) { if (this.mode !== 'demo') this.callout(`${f.def.name.toUpperCase()} · RAGE`); },
  onRageArt(f) { this.flashV = 0.5; this.callout(f.moves.RA.name.toUpperCase()); this.slow(0.5, 24); },
  onHeatBurst(f) { this.callout('HEAT BURST'); Audio.heat(); this.flashV = 0.35; this.aberrV = 0.025; this.slow(0.35, 26); this.cine = { type: 'heat', f, t: 0 }; this.fx.ring(f.pos.clone().setY(1.0), new THREE.Color(2.5, 1.0, 0.3), 0.2, 2.4, false); this.fx.ring(new THREE.Vector3(f.pos.x, 0.03, f.pos.z), new THREE.Color(2.5, 1.0, 0.3), 0.2, 3, true); for (let i = 0; i < 24; i++) this.fx.aura(f.pos, new THREE.Color(2.8, 1.1, 0.3)); },
  onHeatSmash(f) { this.callout('HEAT SMASH'); Audio.heat(); this.flashV = 0.3; this.cine = { type: 'smash', f, t: 0 }; this.slow(0.5, 16); },
  onWallBreak(v, side) {
    const dir = new THREE.Vector3(v.vel.x, 0, v.vel.z); if (dir.lengthSq() < 1e-6) dir.set(Math.sin(v.face + Math.PI), 0, Math.cos(v.face + Math.PI)); dir.normalize();
    this.stage.breakWall(side, v.pos.clone(), dir);
    v.splatted = true; v.state = 'air'; v.sf = 0; v.flying = true; v.vy = Math.max(v.vy, 0.05); v.y = Math.max(v.y, 0.3); v.vel.x = dir.x * 0.11; v.vel.z = dir.z * 0.11;
    if (v.hp > 0) { v.applyDamage(10, v.opp); if (v.hp <= 0) v.ko = true; }
    this.callout('WALL BREAK'); Audio.crash(); this.shake(0.6); this.flashV = 0.35; this.slow(0.35, 70); this.camKick(0.7); this.fx.dust(v.pos, 20);
    this.cine = { type: 'break', v, a: v.opp, t: 0, dir };
  },
  camKick(a) { this.kick = Math.max(this.kick || 0, a); this.roll = (Math.random() < 0.5 ? -1 : 1) * a * 0.05; },
  nameCard(f, right) { const el = $('namecard'); if (!f) { el.classList.remove('show'); return; } $('nc-name').textContent = f.def.name; $('nc-sub').textContent = `${f.def.style} · ${f.def.country}`; el.classList.toggle('right', right); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); },
  toggleSpecial(k) { if (!this.fighters || this.mode === 'demo' || (k === 1 && this.mode !== 'versus')) return; const key = 'special' + (k + 1); SETTINGS[key] = !SETTINGS[key]; saveSettings(); this.callout(SETTINGS[key] ? 'SPECIAL STYLE ON' : 'SPECIAL STYLE OFF'); Audio.ui(true); },
  /* K.O. replay: the last few seconds are recorded as poses and replayed from a new angle */
  record() {
    if (this.mode === 'demo' || this.mode === 'training') return;
    const snap = { f: this.frame, d: this.fighters.map(f => { const j = f.model.joints; const r = new Float32Array(JOINTS.length * 3); JOINTS.forEach((n, i) => { const o = j[n].rotation; r[i * 3] = o.x; r[i * 3 + 1] = o.y; r[i * 3 + 2] = o.z; }); return { x: f.pos.x, z: f.pos.z, y: f.y, face: f.face, hy: j.hips.position.y, hz: j.hips.position.z, r }; }) };
    this.recBuf.push(snap); if (this.recBuf.length > 320) this.recBuf.shift();
  },
  recFx(p, pw, bl, ct) { if (this.mode === 'demo' || this.mode === 'training') return; this.fxLog.push({ f: this.frame, p: p.clone(), pw, bl, ct }); if (this.fxLog.length > 60) this.fxLog.shift(); },
  startReplay() {
    const from = this.recBuf.findIndex(s => s.f >= this.koFrame - 140); if (from < 0) return;
    const frames = this.recBuf.slice(from).filter(s => s.f <= this.koFrame + 45); if (frames.length < 30) return;
    this.replay = { frames, i: 0, lastF: frames[0].f }; $('letterbox').hidden = false; $('hud').style.visibility = 'hidden'; this.announce('', '', false, 10);
    this.cine = { type: 'replay', t: 0, a0: Math.atan2(this.camSide.x, this.camSide.z) + (Math.random() < 0.5 ? 1.3 : -1.3) }; this.timeScale = 1; this.slowT = 0; this.desatV = 0.2;
  },
  stepReplay() {
    const R = this.replay, n = R.frames.length; const cur = R.frames[Math.min(n - 1, Math.floor(R.i))];
    R.i += cur.f >= this.koFrame - 24 ? 0.22 : 0.65;
    if (R.i >= n - 1) return this.endReplay();
    const sn = R.frames[Math.floor(R.i)]; this.applySnap(sn);
    for (const e of this.fxLog) if (e.f > R.lastF && e.f <= sn.f) { this.fx.hit(e.p, e.pw, e.bl, e.ct); if (!e.bl) Audio.hit(e.pw * 0.9); if (e.pw > 0.9) this.camKick(0.5); }
    R.lastF = sn.f; this.fx.update();
  },
  applySnap(sn) { this.fighters.forEach((f, k) => { const d = sn.d[k], md = f.model, j = md.joints; md.root.position.set(d.x, d.y, d.z); md.root.rotation.y = d.face; JOINTS.forEach((nm, i) => j[nm].rotation.set(d.r[i * 3], d.r[i * 3 + 1], d.r[i * 3 + 2])); j.hips.position.y = d.hy; j.hips.position.z = d.hz; f.shadow.position.set(d.x, 0.012, d.z); md.root.updateMatrixWorld(true); if (md.body) md.body.update(); else md.updateSecondary(d.face); }); },
  endReplay() { this.replay = null; $('letterbox').hidden = true; $('hud').style.visibility = ''; this.applySnap(this.recBuf[this.recBuf.length - 1]); for (const f of this.fighters) f.syncModel(); const l = this.roundWinner ? this.roundWinner.opp : this.fighters[0]; this.cine = { type: 'ko', f: l, t: 2 }; this.desatV = 0; },
  onKOLand() {},
  slow(s, frames) { this.timeScale = s; this.slowT = frames; },
  shake(a) { if (SETTINGS.shake) this.shakeAmt = Math.max(this.shakeAmt, a); },
  separate() {
    const [a, b] = this.fighters; if (a.state === 'throwing' || b.state === 'throwing') return;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z; let d = Math.hypot(dx, dz);
    const minD = 0.74 * (a.scale + b.scale) / 2; if (Math.abs(a.y - b.y) > 1.1) return;
    if (d < minD) { let nx, nz; if (d < 1e-4) { nx = Math.sin(a.face); nz = Math.cos(a.face); d = 0; } else { nx = dx / d; nz = dz / d; }
      const o = (minD - d) / 2; a.pos.x -= nx * o; a.pos.z -= nz * o; b.pos.x += nx * o; b.pos.z += nz * o;
      for (const f of [a, b]) { if (this.stage.clamp(f.pos, 0.3 * f.scale)) { const g = f === a ? b : a; g.pos.x += (f === a ? nx : -nx) * o; g.pos.z += (f === a ? nz : -nz) * o; } f.syncModel(); } }
  },

  /* ---------- rounds ---------- */
  checkRound() {
    const [a, b] = this.fighters;
    if (this.mode === 'training') { for (const f of [a, b]) { if (f.state === 'idle' || f.state === 'crouch') { if ((f.idleT = (f.idleT || 0) + 1) > 40) { if (f.hp < f.maxHp) { f.hp = f.maxHp; f.rec = 0; f.rage = false; f.rageUsed = false; } if (!f.heatActive && !f.heatAvail && f.idleT > 90) f.heatAvail = true; } } else f.idleT = 0; if (f.hp <= 0) { f.hp = 1; } } return; }
    if (!this.roundOver && (this.phase === 'fight' || this.mode === 'demo')) {
      if (this.timer > 0 && ++this.timerF >= 60) { this.timerF = 0; this.timer--; if (this.timer === 0) return this.endRound('time'); }
      if (a.hp <= 0 || b.hp <= 0) return this.endRound('ko');
    }
    if (this.roundOver) {
      this.koT++;
      if (this.koT === 100 && this.endWhy === 'ko' && SETTINGS.replay && this.mode !== 'demo' && !this.replayed) { this.replayed = true; this.startReplay(); if (this.replay) return; }
      if (this.koT === 120) {
        const w = this.roundWinner;
        if (w) { w.toState('win'); this.cine = { type: 'win', f: w, t: 0 }; const l = w.opp; if (l.state !== 'ko' && l.state !== 'grounded') l.toState('lose'); }
        const done = this.fighters.some(f => f.wins >= this.roundsToWin);
        if (this.mode === 'demo') { this.announce('', '', false, 10); }
        else if (w) { const perfect = w.hp === w.maxHp; this.announce(perfect ? 'Perfect' : done ? `${w.def.name} wins` : `${w.def.name}`, perfect ? `${w.def.name} wins` : done ? '' : 'wins the round', false, 2200); Audio.say(perfect ? 'Perfect' : `${w.def.name} wins`); }
        else { this.announce('Draw', '', false, 2000); Audio.say('Draw'); }
      }
      if (this.koT === 330) {
        if (this.mode === 'demo') return this.startDemo();
        if (this.fighters.some(f => f.wins >= this.roundsToWin)) return this.endMatch();
        this.round++; this.startRound(false);
      }
    }
  },
  endRound(why) {
    const [a, b] = this.fighters; this.roundOver = true; this.koT = 0; this.endWhy = why; this.koFrame = this.frame;
    let w = null;
    if (why === 'ko') { if (a.hp <= 0 && b.hp <= 0) w = null; else w = a.hp <= 0 ? b : a; this.slow(0.28, 80); this.flashV = 0.6; this.desatV = 0.35; Audio.ko(); this.cine = { type: 'ko', f: w ? w.opp : a, t: 0 }; if (this.mode !== 'demo') { this.announce('K.O.', '', true, 1600); Audio.say('K.O.'); } }
    else { const ra = a.hp / a.maxHp, rb = b.hp / b.maxHp; w = Math.abs(ra - rb) < 1e-3 ? null : ra > rb ? a : b; this.announce('Time up', '', true, 1500); Audio.say('Time up'); }
    this.roundWinner = w; if (w) w.wins++;
    setTimeout(() => { this.desatV = 0; }, 2500);
  },
  endMatch() {
    const [a, b] = this.fighters; const w = a.wins > b.wins ? a : b;
    $('hud').hidden = true; this.updateTouch(true); Audio.stopMusic();
    if (this.mode === 'arcade') {
      if (w === a) { this.arcade.stage++; if (this.arcade.stage >= this.arcade.list.length) { this.showResult('Champion', a.def.full, `Cleared ${this.arcade.list.length} stages · ${['Easy', 'Medium', 'Hard'][SETTINGS.difficulty]}`, ['title', 'select']); Audio.say('Congratulations, champion'); return; }
        this.showResult('Victory', a.def.name, `Next: ${this.arcade.list[this.arcade.stage].name} · Stage ${this.arcade.stage + 1} of ${this.arcade.list.length}`, ['next', 'title']); return; }
      this.showResult('Defeat', b.def.name + ' wins', `Stage ${this.arcade.stage + 1} of ${this.arcade.list.length}`, ['retry', 'select', 'title']); return;
    }
    this.showResult(`${w.idx === 0 ? 'Player 1' : 'Player 2'} wins`, w.def.name, `${a.wins} – ${b.wins}`, ['rematch', 'select', 'title']);
  },
  announceRound() {
    const final = this.fighters.every(f => f.wins === this.roundsToWin - 1) && this.roundsToWin > 1;
    this.announce(final ? 'Final round' : `Round ${this.round}`, '', false, 1300); Audio.say(final ? 'Final round' : `Round ${this.round}`);
  },

  /* ---------- camera direction ---------- */
  updateCamera(dt) {
    const cam = this.camera; const [a, b] = this.fighters; const c = this.cine;
    const mid = new THREE.Vector3().addVectors(a.pos, b.pos).multiplyScalar(0.5);
    const ax = new THREE.Vector3(b.pos.x - a.pos.x, 0, b.pos.z - a.pos.z); const sep = ax.length(); if (sep > 1e-3) ax.multiplyScalar(1 / sep); else ax.set(1, 0, 0);
    const perp = new THREE.Vector3(-ax.z, 0, ax.x); if (perp.dot(this.camSide) < 0) perp.negate();
    let pos, look, k = 0.1;
    if (c && c.type === 'intro') {
      const t = this.introT; const f = t < 100 ? a : t < 200 ? b : null;
      if (f) { const lt = (t % 100) / 100; const ang = f.face + lerp(-0.9, 0.5, lt) * (f === a ? 1 : -1); pos = new THREE.Vector3(f.pos.x + Math.sin(ang) * lerp(2.6, 1.9, lt), lerp(0.7, 1.6, lt), f.pos.z + Math.cos(ang) * lerp(2.6, 1.9, lt)); look = new THREE.Vector3(f.pos.x, lerp(1.0, 1.55, lt), f.pos.z); k = t % 100 < 2 ? 1 : 0.2; }
    } else if (c && c.type === 'ko') {
      c.t += dt; const f = c.f; const ang = Math.atan2(this.camSide.x, this.camSide.z) + c.t * 0.35 - 0.4;
      pos = new THREE.Vector3(f.pos.x + Math.sin(ang) * 3.0, 0.9 + c.t * 0.1, f.pos.z + Math.cos(ang) * 3.0); look = new THREE.Vector3(f.pos.x, 0.5 + f.y * 0.8, f.pos.z); k = 0.06;
    } else if (c && c.type === 'win') {
      c.t += dt; const f = c.f; const fw = new THREE.Vector3(Math.sin(f.face), 0, Math.cos(f.face)); const side = new THREE.Vector3(fw.z, 0, -fw.x);
      const d = lerp(3.0, 2.2, Math.min(1, c.t / 3)); pos = new THREE.Vector3(f.pos.x + fw.x * d + side.x * 0.7, 1.45, f.pos.z + fw.z * d + side.z * 0.7); look = new THREE.Vector3(f.pos.x, 1.2 * f.scale, f.pos.z); k = 0.05;
    } else if (c && c.type === 'heat') {
      c.t += dt; const f = c.f; const base = Math.atan2(this.camSide.x, this.camSide.z); if (c.s === undefined) { const fx = Math.sin(f.face), fz = Math.cos(f.face); c.s = Math.sin(base + 0.7) * fx + Math.cos(base + 0.7) * fz > Math.sin(base - 0.7) * fx + Math.cos(base - 0.7) * fz ? 1 : -1; } const ang = base + c.s * (0.75 - c.t * 0.35); pos = new THREE.Vector3(f.pos.x + Math.sin(ang) * 2.5, 1.25, f.pos.z + Math.cos(ang) * 2.5); look = new THREE.Vector3(f.pos.x, 1.15 * f.scale, f.pos.z); k = c.t < 0.05 ? 1 : 0.15; if (c.t > 0.9) this.cine = null;
    } else if (c && c.type === 'smash') {
      c.t += dt; const f = c.f; const fw = new THREE.Vector3(Math.sin(f.face), 0, Math.cos(f.face)); pos = new THREE.Vector3(mid.x + perp.x * 2.6 - fw.x * 1.0, 0.45 + c.t * 0.4, mid.z + perp.z * 2.6 - fw.z * 1.0); look = new THREE.Vector3(mid.x, 1.0, mid.z); k = c.t < 0.05 ? 1 : 0.12; if (c.t > 1.3) this.cine = null;
    } else if (c && c.type === 'break') {
      c.t += dt; const v = c.v; pos = new THREE.Vector3(v.pos.x - c.dir.x * 4.2 + perp.x * 1.6, 1.0 + c.t * 0.3, v.pos.z - c.dir.z * 4.2 + perp.z * 1.6); look = new THREE.Vector3(v.pos.x, 0.8 + v.y * 0.6, v.pos.z); k = c.t < 0.05 ? 1 : 0.1; if (c.t > 1.7) this.cine = null;
    } else if (c && c.type === 'replay') {
      c.t += dt; const ra = a.model.root.position, rb = b.model.root.position; const cx = (ra.x + rb.x) / 2, cz = (ra.z + rb.z) / 2; const ang = c.a0 + c.t * 0.22;
      pos = new THREE.Vector3(cx + Math.sin(ang) * 3.4, 0.75 + Math.sin(c.t * 0.5) * 0.25, cz + Math.cos(ang) * 3.4); look = new THREE.Vector3(cx, 0.95, cz); k = c.t < 0.05 ? 1 : 0.08;
    } else if (c && c.type === 'ra') {
      c.t++; const A = c.a; const fw = new THREE.Vector3(Math.sin(A.face), 0, Math.cos(A.face));
      pos = new THREE.Vector3(mid.x + perp.x * 2.4 - fw.x * 0.6, 0.6, mid.z + perp.z * 2.4 - fw.z * 0.6); look = new THREE.Vector3(mid.x, 1.1, mid.z); k = c.t < 2 ? 1 : 0.1; if (c.t > 70) this.cine = null;
    }
    if (!pos) {
      this.camSide.lerp(perp, this.mode === 'demo' ? 0.03 : 0.07).normalize();
      const maxY = Math.max(a.y, b.y); const dist = clamp(sep * 0.85 + 3.2, 4.3, 8.5) * (cam.aspect < 1 ? 1.5 : 1);
      pos = new THREE.Vector3(mid.x + this.camSide.x * dist, 1.32 + maxY * 0.35 + (cam.aspect < 1 ? 0.3 : 0), mid.z + this.camSide.z * dist);
      look = new THREE.Vector3(mid.x, 0.98 + maxY * 0.3, mid.z);
      if (this.phase === 'title' || this.mode === 'demo') { const tt = this.rt * 0.15; pos.y += Math.sin(tt) * 0.3; }
      // handheld drift and impact push-in
      const kk = this.kick || 0; pos.x += Math.sin(this.rt * 0.6) * 0.06 - this.camSide.x * kk * 1.0; pos.z += Math.cos(this.rt * 0.47) * 0.06 - this.camSide.z * kk * 1.0; pos.y += Math.sin(this.rt * 0.41) * 0.035 - kk * 0.15;
      if (maxY > 0.4) { pos.y += 0.2; look.y += 0.1; }
      if (a.heatActive || b.heatActive) { pos.x -= this.camSide.x * 0.25; pos.z -= this.camSide.z * 0.25; }
    }
    cam.position.lerp(pos, Math.min(1, k * 60 * dt)); this.look.lerp(look, Math.min(1, (k + 0.04) * 60 * dt));
    if (this.shakeAmt > 0.002) { cam.position.x += rnd(-1, 1) * this.shakeAmt * 0.3; cam.position.y += rnd(-1, 1) * this.shakeAmt * 0.3; this.shakeAmt *= 0.86; }
    cam.lookAt(this.look);
    this.kick = (this.kick || 0) * Math.pow(0.9, dt * 60); if (this.kick > 0.01 && this.roll) cam.rotateZ(this.roll * this.kick / 0.5);
    this.camFwd.set(this.look.x - cam.position.x, 0, this.look.z - cam.position.z).normalize();
    if (this.rimLight) { this.rimLight.target.position.copy(this.look); this.rimLight.position.set(this.look.x + this.camFwd.x * 5, 3.2, this.look.z + this.camFwd.z * 5); }
    if (!c || c.type !== 'intro') { this.camFwd.set(-this.camSide.x, 0, -this.camSide.z); }
  },

  /* ---------- HUD ---------- */
  hudReset() {
    const [a, b] = this.fighters;
    $('name1').textContent = a.def.name; $('name2').textContent = b.def.name; $('ctry1').textContent = a.def.country; $('ctry2').textContent = b.def.country;
    for (const [i, f] of [[1, a], [2, b]]) { const w = $('wins' + i); w.innerHTML = ''; if (this.roundsToWin < 10) for (let k = 0; k < this.roundsToWin; k++) { const d = document.createElement('i'); if (k < f.wins) d.className = 'on'; w.appendChild(d); } }
    $('timer').textContent = this.timer ? this.timer : '∞'; $('trainbox').hidden = this.mode !== 'training';
    $('inputhint').textContent = this.mode === 'training' ? 'Esc: pause & dummy settings · Backspace: reset position' : '';
    this.updateHud();
  },
  updateHud() {
    if (this.mode === 'demo') return;
    const F = this.fighters;
    for (let i = 0; i < 2; i++) {
      const f = F[i], p = (f.hp / f.maxHp * 100).toFixed(1) + '%';
      $('hp' + (i + 1)).style.width = p; if (f.comboHits === 0 || f.state === 'idle') $('hp' + (i + 1) + 'g').style.width = p;
      $('hp' + (i + 1) + 'r').style.width = ((f.hp + f.rec) / f.maxHp * 100).toFixed(1) + '%';
      const hw = $('heat' + (i + 1) + 'w'); hw.classList.toggle('active', f.heatActive); hw.classList.toggle('used', !f.heatAvail && !f.heatActive); $('heat' + (i + 1)).style.width = (f.heatActive ? f.heatT / 6 : 100).toFixed(1) + '%';
      $('heattag' + (i + 1)).classList.toggle('on', f.heatActive); $('ss' + (i + 1)).classList.toggle('on', !!(SETTINGS['special' + (i + 1)] && this.ctrl[i]));
      $('hp' + (i + 1) + 'w').classList.toggle('rage', f.rage); $('rage' + (i + 1)).classList.toggle('on', f.rage && !f.rageUsed);
      const cb = $('combo' + (i + 1)); const cs = f.comboShow;
      if (cs && cs.t > 0) { cs.t--; if (cs.hits >= 2) { cb.innerHTML = `<b>${cs.hits}</b>HITS<small>${cs.dmg} damage</small>`; cb.classList.add('show'); } } else cb.classList.remove('show');
    }
    const tm = $('timer'); tm.textContent = this.timer ? this.timer : '∞'; tm.classList.toggle('low', this.timer > 0 && this.timer <= 10);
    if (this.mode === 'training') { const o = F[1]; if (o.comboHits >= 1) this.lastCombo = `Combo: ${o.comboHits} hit${o.comboHits > 1 ? 's' : ''} · ${o.comboDmg} damage`; const html = (this.trainLine || 'Attack the dummy to see frame data') + '<br>' + (this.lastCombo || ''); if (html !== this._trHtml) { this._trHtml = html; $('tr-data').innerHTML = html; } }
  },
  trainStat(A, m, kind, adv) {
    if (A.idx !== 0) return;
    const lv = { h: 'High', m: 'Mid', l: 'Low', sm: 'Mid (special)', throw: 'Throw' }[m.level];
    const advTxt = adv === null || adv === undefined ? '' : ` · ${adv >= 0 ? '+' : ''}${Math.round(adv)} on ${kind}`;
    this.trainLine = `i${m.startup} · ${lv} · ${m.dmg} dmg${advTxt}`;
  },
  recordInput(inp) {
    const btns = ['1', '2', '3', '4'].filter(k => inp.b[k]).join('+') || (inp.b.thr ? 'T' : '') || (inp.b.ra ? 'RA' : '') || (inp.b.heat ? 'H' : '');
    const key = inp.dir + btns; if (key === this.lastIn && !btns) return; this.lastIn = key;
    if (!btns && inp.dir === 5) return;
    this.hist = (this.hist || []); this.hist.push(DIRGLYPH[inp.dir] + (btns ? btns : '')); if (this.hist.length > 10) this.hist.shift();
    $('tr-hist').textContent = this.hist.join(' ');
  },
  announce(text, sub, red, ms) {
    const el = $('announce'); el.innerHTML = text ? `<div class="big${red ? ' red' : ''}">${text}${sub ? `<span class="sub">${sub}</span>` : ''}</div>` : '';
    clearTimeout(this.annT); this.annT = setTimeout(() => el.innerHTML = '', ms || 1200);
  },
  callout(t) { if (this.mode === 'demo') return; const el = $('callout'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); },
  updateTouch(hide) { const coarse = matchMedia('(pointer:coarse)').matches; $('touch').hidden = hide || !coarse || this.mode === 'demo' || this.paused; },

  /* ---------- menus ---------- */
  showScreen(name) {
    for (const s of ['title', 'select', 'pause', 'options', 'moves', 'result']) $('screen-' + s).hidden = s !== name;
    this.screen = name; const list = { title: 'title-menu', pause: 'pause-menu', result: 'result-menu' }[name];
    this.menuEl = list ? $(list) : null; if (this.menuEl) this.menuSel(0);
    if (name === 'title') { this.phase = 'title'; Audio.startMusic('menu'); }
  },
  menuSel(i) { const bs = [...this.menuEl.querySelectorAll('button')]; this.menuIdx = (i + bs.length) % bs.length; bs.forEach((b, k) => b.classList.toggle('sel', k === this.menuIdx)); },
  menuActivate() { const bs = [...this.menuEl.querySelectorAll('button')]; const b = bs[this.menuIdx]; if (b) b.click(); },
  bindUI() {
    $('title-menu').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; Audio.init(); Audio.resume(); Audio.ui(true); const act = b.dataset.act; if (act === 'options') return this.openOptions('title'); this.beginSelect(act); });
    $('pause-menu').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; Audio.ui(true); this.pauseAction(b.dataset.act); });
    $('result-menu').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; Audio.ui(true); this.resultAction(b.dataset.act); });
    $('opt-back').addEventListener('click', () => this.closeOptions());
    $('ml-back').addEventListener('click', () => { this.showScreen('pause'); });
    for (const id of ['title-menu', 'pause-menu', 'result-menu']) $(id).addEventListener('mousemove', e => { const b = e.target.closest('button'); if (b) { const bs = [...$(id).querySelectorAll('button')]; this.menuEl = $(id); this.menuSel(bs.indexOf(b)); } });
    // roster cards
    const ro = $('roster'); ro.innerHTML = '';
    ROSTER.forEach((d, i) => { const c = document.createElement('div'); c.className = 'card'; c.tabIndex = 0; c.dataset.i = i; c.innerHTML = `<div class="nm">${d.name}</div><div class="st">${d.style}</div><div class="sw" style="background:${d.color}"></div><span class="lock p1" hidden>P1</span><span class="lock p2" hidden>P2</span>`; c.addEventListener('click', () => this.cardClick(i)); ro.appendChild(c); });
    const st = $('stages'); st.innerHTML = '';
    STAGES.concat([{ id: 'random', name: 'Random', sub: '' }]).forEach((s, i) => { const b = document.createElement('button'); b.className = 'btn'; b.dataset.i = i; b.innerHTML = s.name; b.addEventListener('click', () => this.pickStage(i)); b.addEventListener('mousemove', () => { this.stageIdx = i; this.drawStages(); }); st.appendChild(b); });
  },
  onPad(k, press) {
    const map = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', '3': 'Enter', '4': 'Escape' };
    for (const n in press) if (map[n]) this.onKey({ code: map[n], pad: k, synthetic: true, preventDefault() {} });
  },
  onKey(e) {
    const c = e.code; const sc = this.screen;
    const up = c === 'ArrowUp' || c === 'KeyW', dn = c === 'ArrowDown' || c === 'KeyS', lf = c === 'ArrowLeft' || c === 'KeyA', rt = c === 'ArrowRight' || c === 'KeyD';
    const ok = c === 'Enter' || c === 'Space' || c === 'NumpadEnter', back = c === 'Escape' || c === 'Backspace';
    if (this.phase === 'select' || this.phase === 'stageSelect') return this.selectKey(e);
    if (this.replay) { this.replay.i = this.replay.frames.length; return; }
    if ((this.phase === 'fight' || this.phase === 'intro') && !this.paused) { if (c === 'KeyZ') this.toggleSpecial(0); if (c === 'Slash' || c === 'Numpad0') this.toggleSpecial(1); }
    if (sc === 'options') { if (up) this.optMove(-1); else if (dn) this.optMove(1); else if (lf) this.optChange(-1); else if (rt) this.optChange(1); else if (back || ok && this.optRow === this.optRows.length) this.closeOptions(); return; }
    if (sc === 'moves') { if (back || ok) this.showScreen('pause'); return; }
    if (this.menuEl && !$('screen-' + sc).hidden) {
      if (up) { this.menuSel(this.menuIdx - 1); Audio.ui(); } else if (dn) { this.menuSel(this.menuIdx + 1); Audio.ui(); } else if (ok) this.menuActivate();
      else if (back && sc === 'pause') this.togglePause();
      return;
    }
    if (this.phase === 'fight' || this.phase === 'intro') {
      if (c === 'Escape') this.togglePause();
      if (c === 'Backspace' && this.mode === 'training') { this.startRound(false); this.phase = 'fight'; }
    }
  },
  togglePause() {
    if (this.mode === 'demo' || !(this.phase === 'fight' || this.phase === 'intro')) return;
    if (this.screen === 'options' || this.screen === 'moves') return;
    this.paused = !this.paused; if (this.paused) { this.buildPauseMenu(); this.showScreen('pause'); } else { this.showScreen(null); }
    this.updateTouch();
  },
  buildPauseMenu() {
    const m = $('pause-menu'); const items = [['resume', 'Resume'], ['movelist', 'Move list']];
    if (this.mode === 'training') { items.push(['dummy', `Dummy<span class="hint">${(DUMMY.find(d => d[0] === (this.dummyMode || 'stand')) || DUMMY[0])[1]}</span>`], ['reset', 'Reset position']); }
    items.push(['options', 'Options'], ['select', 'Character select'], ['title', 'Quit to title']);
    m.innerHTML = items.map(([a, t]) => `<button data-act="${a}">${t}</button>`).join('');
  },
  pauseAction(a) {
    if (a === 'resume') return this.togglePause();
    if (a === 'movelist') return this.openMoves();
    if (a === 'dummy') { const i = DUMMY.findIndex(d => d[0] === (this.dummyMode || 'stand')); this.dummyMode = DUMMY[(i + 1) % DUMMY.length][0]; this.applyDummy(); const keep = this.menuIdx; this.buildPauseMenu(); this.menuEl = $('pause-menu'); this.menuSel(keep); return; }
    if (a === 'reset') { this.paused = false; this.showScreen(null); this.startRound(false); this.phase = 'fight'; return; }
    if (a === 'options') return this.openOptions('pause');
    if (a === 'select') { this.paused = false; return this.beginSelect(this.mode); }
    if (a === 'title') { this.paused = false; this.toTitle(); }
  },
  resultAction(a) {
    const [d1, d2] = this.fighters.map(f => f.def);
    if (a === 'rematch' || a === 'retry') { this.showScreen(null); this.setupMatch(this.mode, d1, d2, this.stage.id, { boss: d2.boss && this.mode === 'arcade' }); this.phase = 'intro'; return; }
    if (a === 'next') { this.showScreen(null); this.arcadeFight(); return; }
    if (a === 'select') return this.beginSelect(this.mode);
    if (a === 'title') this.toTitle();
  },
  showResult(tag, name, sub, acts) {
    $('res-tag').textContent = tag; $('res-name').textContent = name; $('res-sub').textContent = sub;
    const labels = { rematch: 'Rematch', retry: 'Continue', next: 'Next fight', select: 'Character select', title: 'Main menu' };
    $('result-menu').innerHTML = acts.map(a => `<button data-act="${a}">${labels[a]}</button>`).join('');
    this.phase = 'result'; this.showScreen('result');
  },
  toTitle() { this.showScreen(null); $('hud').hidden = true; this.updateTouch(true); this.startDemo(); this.showScreen('title'); },

  /* ---------- character select ---------- */
  beginSelect(mode) {
    this.selMode = mode; this.phase = 'select'; this.paused = false; this.showScreen('select'); $('hud').hidden = true; this.updateTouch(true);
    this.cur = [this.cur ? this.cur[0] : 0, this.cur ? this.cur[1] : 1]; this.lock = [false, mode === 'arcade']; this.selStep = 0;
    if (mode === 'training') { this.lock[1] = false; }
    $('sel-title').textContent = mode === 'arcade' ? 'Arcade · choose your fighter' : mode === 'versus' ? 'Versus · choose fighters' : 'Training · choose your fighter';
    $('sel-hint').textContent = mode === 'versus' ? 'P1: A D + R to lock · P2: ← → + Num 4 or I · Esc to go back' : 'Arrows or A D to choose · Enter to lock · Esc to go back';
    $('stages').hidden = true; $('roster').hidden = false;
    Audio.startMusic('menu'); if (Audio.sfxGain) Audio.sfxGain.gain.value = 1;
    this.drawSelect(true);
  },
  cardClick(i) {
    Audio.init(); Audio.resume();
    if (this.phase !== 'select') return;
    const p = this.selMode === 'versus' ? (this.lock[0] ? 1 : 0) : (this.selMode === 'training' && this.lock[0] ? 1 : 0);
    if (this.cur[p] === i) this.lockPick(p); else { this.cur[p] = i; Audio.ui(); this.drawSelect(true); }
  },
  selectKey(e) {
    const c = e.code; const vs = this.selMode === 'versus';
    if (this.phase === 'stageSelect') {
      const n = STAGES.length + 1;
      if (c === 'ArrowLeft' || c === 'KeyA' || c === 'ArrowUp' || c === 'KeyW') { this.stageIdx = (this.stageIdx + n - 1) % n; Audio.ui(); this.drawStages(); }
      else if (c === 'ArrowRight' || c === 'KeyD' || c === 'ArrowDown' || c === 'KeyS') { this.stageIdx = (this.stageIdx + 1) % n; Audio.ui(); this.drawStages(); }
      else if (c === 'Enter' || c === 'Space' || c === 'KeyR' || c === 'Numpad4' || c === 'KeyI') this.pickStage(this.stageIdx);
      else if (c === 'Escape' || c === 'Backspace') { this.phase = 'select'; this.lock = [false, this.selMode === 'arcade']; $('stages').hidden = true; $('roster').hidden = false; this.drawSelect(true); }
      return;
    }
    const cols = innerWidth <= 720 ? 4 : ROSTER.length; const n = ROSTER.length;
    const mv = (p, d) => { if (this.lock[p]) return; this.cur[p] = (this.cur[p] + d + n) % n; Audio.ui(); this.drawSelect(true); };
    const active = !vs && this.selMode === 'training' && this.lock[0] ? 1 : 0;
    if (vs) {
      if (c === 'KeyA') mv(0, -1); else if (c === 'KeyD') mv(0, 1); else if (c === 'KeyW') mv(0, -cols); else if (c === 'KeyS') mv(0, cols);
      else if (c === 'KeyR' || c === 'Space' || (e.pad === 0 && c === 'Enter')) this.lockPick(0);
      if (c === 'ArrowLeft' && e.pad !== 0) mv(1, -1); else if (c === 'ArrowRight' && e.pad !== 0) mv(1, 1); else if (c === 'ArrowUp' && e.pad !== 0) mv(1, -cols); else if (c === 'ArrowDown' && e.pad !== 0) mv(1, cols);
      else if (c === 'Numpad4' || c === 'KeyI' || ((c === 'Enter' || c === 'NumpadEnter') && e.pad !== 0)) this.lockPick(1);
      if (e.pad === 0 && (c === 'ArrowLeft' || c === 'ArrowRight')) mv(0, c === 'ArrowLeft' ? -1 : 1);
    } else {
      if (c === 'ArrowLeft' || c === 'KeyA') mv(active, -1); else if (c === 'ArrowRight' || c === 'KeyD') mv(active, 1); else if (c === 'ArrowUp' || c === 'KeyW') mv(active, -cols); else if (c === 'ArrowDown' || c === 'KeyS') mv(active, cols);
      else if (c === 'Enter' || c === 'Space' || c === 'KeyR' || c === 'KeyI' || c === 'NumpadEnter') this.lockPick(active);
    }
    if (c === 'Escape' || c === 'Backspace') { if (this.lock[0] && !(this.selMode === 'arcade')) { this.lock = [false, false]; this.drawSelect(true); Audio.ui(); } else this.toTitle(); }
  },
  lockPick(p) {
    if (this.lock[p]) return; this.lock[p] = true; Audio.ui(true); Audio.say(ROSTER[this.cur[p]].name); this.drawSelect(true);
    if (this.lock[0] && this.lock[1]) {
      if (this.selMode === 'arcade') return this.startArcade();
      this.phase = 'stageSelect'; this.stageIdx = this.stageIdx || 0; $('roster').hidden = true; $('stages').hidden = false; $('sel-title').textContent = 'Choose a stage'; $('sel-hint').textContent = 'Arrows to choose · Enter to fight · Esc to go back'; this.drawStages();
    }
  },
  drawStages() { [...$('stages').children].forEach((b, i) => b.classList.toggle('sel', i === this.stageIdx)); const s = STAGES[this.stageIdx]; $('sel-n1').innerHTML = `${ROSTER[this.cur[0]].name}<span class="sub">${ROSTER[this.cur[0]].style}</span>`; $('sel-n2').innerHTML = `${ROSTER[this.cur[1]].name}<span class="sub">${s ? s.name + ' · ' + s.sub : 'Random stage'}</span>`; },
  pickStage(i) {
    Audio.ui(true); const s = i >= STAGES.length ? pick(STAGES) : STAGES[i];
    this.showScreen(null); $('loader').hidden = false; $('loader').textContent = 'Loading ' + s.name;
    setTimeout(() => { this.setupMatch(this.selMode, ROSTER[this.cur[0]], ROSTER[this.cur[1]], s.id); $('loader').hidden = true; if (Audio.sfxGain) Audio.sfxGain.gain.value = 1; if (this.selMode === 'training') Audio.startMusic('fight'); }, 30);
  },
  drawSelect(rebuild) {
    const cards = [...$('roster').children];
    cards.forEach((c, i) => { c.classList.toggle('c1', this.cur[0] === i); c.classList.toggle('c2', this.cur[1] === i && (this.selMode !== 'arcade')); c.querySelector('.lock.p1').hidden = !(this.lock[0] && this.cur[0] === i); c.querySelector('.lock.p2').hidden = !(this.lock[1] && this.cur[1] === i && this.selMode !== 'arcade'); });
    const d1 = ROSTER[this.cur[0]], d2 = ROSTER[this.cur[1]];
    $('sel-n1').innerHTML = `${d1.full}<span class="sub">${d1.country} · ${d1.style}</span>`;
    $('sel-n2').innerHTML = this.selMode === 'arcade' ? `<span class="sub">CPU ladder</span>` : `${d2.full}<span class="sub">${d2.country} · ${d2.style}${this.selMode === 'training' ? ' · dummy' : ''}</span>`;
    if (rebuild) this.showcaseSet(d1, this.selMode === 'arcade' ? null : d2);
  },
  /* showcase scene for the select screen */
  buildShowcase() {
    const s = this.showScene = new THREE.Scene(); s.background = lin('#06070a'); s.fog = new THREE.Fog(lin('#06070a'), 6, 16);
    this.showCam = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 60); this.showCam.position.set(0, 1.35, 5.6); this.showCam.lookAt(0, 1.05, 0);
    const fl = new THREE.Mesh(new THREE.CircleGeometry(7, 48), new THREE.MeshStandardMaterial({ color: lin('#15171c'), roughness: 0.32, metalness: 0.4 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; s.add(fl);
    for (const [x, c] of [[-1.1, '#3aa0ff'], [1.1, '#ff4d3a']]) {
      const sp = new THREE.SpotLight(lin('#fff2e0'), 4.2, 14, 0.42, 0.55, 1.0); sp.position.set(x * 0.6, 6, 3); sp.target.position.set(x, 0.8, 0); sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); s.add(sp, sp.target);
      const rim = new THREE.PointLight(lin(c), 5, 7, 2); rim.position.set(x * 2.0, 2.0, -1.4); s.add(rim);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.6, 48), new THREE.MeshBasicMaterial({ color: lin(c).multiplyScalar(3), side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.01, 0); s.add(ring);
    }
    s.add(new THREE.HemisphereLight(lin('#9aa8c8'), lin('#141414'), 0.6)); const fill = new THREE.DirectionalLight(lin('#ffe8d6'), 1.1); fill.position.set(0, 2.2, 6); s.add(fill);
    const back = new THREE.Mesh(new THREE.CircleGeometry(4.5, 48), new THREE.MeshBasicMaterial({ map: glowTex('rgba(70,80,110,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false })); back.position.set(0, 1.6, -3); s.add(back);
    const pm = new THREE.PMREMGenerator(this.renderer); const env = new THREE.Scene(); env.add(skyDome('#101420', '#30384a', '#0a0a0c', 30));
    const pnl = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.6, 3.2), side: THREE.DoubleSide })); pnl.position.set(0, 6, 4); pnl.lookAt(0, 0, 0); env.add(pnl);
    s.environment = pm.fromScene(env, 0.04).texture; pm.dispose();
    this.showModels = [null, null];
  },
  showcaseSet(d1, d2) {
    const defs = [d1, d2];
    for (let i = 0; i < 2; i++) {
      const cur = this.showModels[i];
      if (cur && cur.def === defs[i]) continue;
      if (cur) this.showScene.remove(cur.root);
      if (!defs[i]) { this.showModels[i] = null; continue; }
      this.showCache = this.showCache || {}; const key = defs[i].id + i; const m = this.showCache[key] || (this.showCache[key] = new FighterModel(defs[i])); const sx = innerWidth / innerHeight < 1 ? 0.62 : 1.1; m.root.position.set(i ? sx : -sx, 0, 0); m.root.rotation.y = i ? -0.55 : 0.55; this.showScene.add(m.root); this.showModels[i] = m;
    }
  },
  renderShowcase(dt) {
    for (let i = 0; i < 2; i++) { const m = this.showModels[i]; if (!m) continue; const locked = this.lock && this.lock[i];
      m.setPose(locked ? POSES[m.def.win] : idlePose(m.def.idle, this.rt * 60, i, false), locked ? 0.08 : 0.15); m.root.updateMatrixWorld(true); if (m.body) m.body.update(); else { m.updateSecondary(m.root.rotation.y); m.setBlink((this.rt * 60 + i * 97) % 230 < 6 ? 1 : 0); } m.root.rotation.y = lerp(m.root.rotation.y, (i ? -0.55 : 0.55) + Math.sin(this.rt * 0.5) * 0.08 + (locked ? (i ? -0.25 : 0.25) : 0), 0.05); }
    this.showCam.position.x = Math.sin(this.rt * 0.2) * 0.25;
    this.showCam.lookAt(0, 1.05, 0);
    if (this.post) { this.renderPass.scene = this.showScene; this.renderPass.camera = this.showCam; this.finalPass.uniforms.exposure.value = 1.05; this.finalPass.uniforms.desat.value = 0; this.finalPass.uniforms.flash.value = 0; this.post.render(); }
    else { this.renderer.toneMappingExposure = 1.05; this.renderer.render(this.showScene, this.showCam); }
  },

  /* ---------- arcade ---------- */
  startArcade() {
    const me = ROSTER[this.cur[0]];
    const pool = ROSTER.filter(r => r !== me && !r.boss).sort(() => Math.random() - 0.5).slice(0, 4);
    const boss = ROSTER.find(r => r.boss); if (boss && boss !== me) pool.push(boss); else pool.push(ROSTER.find(r => r !== me && !pool.includes(r)) || pool[0]);
    this.arcade = { list: pool, stage: 0, me };
    this.arcadeFight();
  },
  arcadeFight() {
    const a = this.arcade; const opp = a.list[a.stage]; const st = opp.boss ? 'warehouse' : STAGES[(a.stage + 1) % STAGES.length].id;
    this.showScreen(null); $('loader').hidden = false; $('loader').textContent = 'Loading ' + STAGES.find(s => s.id === st).name;
    setTimeout(() => { this.setupMatch('arcade', a.me, opp, st, { boss: !!opp.boss }); $('loader').hidden = true; if (Audio.sfxGain) Audio.sfxGain.gain.value = 1; }, 30);
  },

  /* ---------- options & move list ---------- */
  openOptions(from) {
    this.optFrom = from; this.optRow = 0; this.showScreen('options'); this.menuEl = null;
    this.optRows = [
      ['CPU difficulty', 'difficulty', [[0, 'Easy'], [1, 'Medium'], [2, 'Hard']]],
      ['Rounds to win', 'roundsToWin', [[1, '1'], [2, '2'], [3, '3']]],
      ['Round timer', 'roundTime', [[30, '30'], [60, '60'], [99, '99'], [0, '∞']]],
      ['Volume', 'volume', [[0, 'Off'], [0.4, 'Low'], [0.8, 'Mid'], [1, 'High']]],
      ['Music', 'music', [[true, 'On'], [false, 'Off']]],
      ['Announcer', 'announcer', [[true, 'On'], [false, 'Off']]],
      ['Camera shake', 'shake', [[true, 'On'], [false, 'Off']]],
      ['Special Style (P1)', 'special1', [[false, 'Off'], [true, 'On']]],
      ['K.O. replays', 'replay', [[true, 'On'], [false, 'Off']]],
      ['Graphics', 'quality', [[0, 'Low'], [1, 'Medium'], [2, 'High']]],
    ];
    this.drawOptions();
    const kb = $('keys'); const row = (a, b) => `<div><span>${a}</span><kbd>${b}</kbd></div>`; const kn = arr => arr.map(KEYNAME).join(' / ');
    kb.innerHTML = `<h4>Player 1</h4>${row('Move', 'W A S D')}${row('1 Left punch', kn(BIND.p1['1']))}${row('2 Right punch', kn(BIND.p1['2']))}${row('3 Left kick', kn(BIND.p1['3']))}${row('4 Right kick', kn(BIND.p1['4']))}${row('Throw (1+3)', kn(BIND.p1.thr))}${row('Rage Art', kn(BIND.p1.ra))}${row('Heat Burst / Heat Smash (2+3)', kn(BIND.p1.heat))}${row('Sidestep up / down', 'Q / E')}${row('Special Style on / off', 'Z')}${row('Pause', 'Esc')}
      <h4>Player 2</h4>${row('Move', 'Arrow keys')}${row('1 / 2', 'Num 4 / Num 5 · I / O')}${row('3 / 4', 'Num 1 / Num 2 · K / L')}${row('Throw · Rage Art', 'Num 6 · P / Num 3 · ;')}${row('Heat (2+3)', 'Num 8 · N')}${row('Sidestep up / down', 'Num 7 / 9 · U / J')}${row('Special Style on / off', '/ · Num 0')}
      <h4>Gamepad</h4>${row('1 2 3 4', 'X Y A B')}${row('Throw · Rage Art · Heat', 'RB · RT · LB')}${row('Special Style', 'Back / Select')}
      <h4>Techniques</h4>${row('Block high / mid', 'Hold back or stand still')}${row('Block low', 'Hold down-back')}${row('Dash · Backdash', 'f,f · b,b')}${row('Sidestep', 'Tap up or down')}${row('Throw break', '1 or 2 as you are grabbed')}${row('Wake up', 'Up, back, 3 or 4 when down')}${row('Low parry', 'd/f just before a low hits')}${row('Power Crush', 'f+1+2 (absorbs highs and mids)')}${row('Heat Engager', 'Land f,f+2 or your ★ move')}${row('Tornado', 'f+4 on a juggled opponent')}${row('Wall break', 'Splat, then knock into the wall again')}`;
  },
  drawOptions() {
    $('opts').innerHTML = this.optRows.map(([label, key, vals], r) => `<div class="opt" style="${r === this.optRow ? 'color:#fff' : 'color:var(--dim)'}"><span>${r === this.optRow ? '▸ ' : ''}${label}</span><span class="val">${vals.map(([v, t]) => `<button data-r="${r}" data-v="${String(v)}" class="${SETTINGS[key] === v ? 'on' : ''}">${t}</button>`).join('')}</span></div>`).join('');
    $('opts').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { const r = +b.dataset.r; const vals = this.optRows[r][2]; const v = vals.find(x => String(x[0]) === b.dataset.v)[0]; this.optRow = r; this.setOpt(r, v); }));
  },
  optMove(d) { this.optRow = clamp(this.optRow + d, 0, this.optRows.length - 1); Audio.ui(); this.drawOptions(); },
  optChange(d) { const [, key, vals] = this.optRows[this.optRow]; let i = vals.findIndex(v => v[0] === SETTINGS[key]); i = clamp(i + d, 0, vals.length - 1); this.setOpt(this.optRow, vals[i][0]); },
  setOpt(r, v) {
    const key = this.optRows[r][1]; if (SETTINGS[key] === v) return; SETTINGS[key] = v; saveSettings(); Audio.ui(true);
    if (key === 'volume') Audio.setVolume(v);
    if (key === 'music') { if (v) Audio.startMusic(this.phase === 'title' ? 'menu' : 'fight'); else Audio.stopMusic(); }
    if (key === 'quality') { this.applyQuality(); if (this.optFrom === 'title') { this.loadStage(this.stage.id, true); this.startDemo(); } }
    if (key === 'difficulty' && this.ai[1] && this.mode === 'arcade') this.ai[1].lv = v;
    this.drawOptions();
  },
  closeOptions() { Audio.ui(); if (this.optFrom === 'pause') { this.buildPauseMenu(); this.showScreen('pause'); } else this.showScreen('title'); },
  openMoves() {
    const f = this.fighters[0]; $('ml-title').textContent = `${f.def.name} · Move list`;
    const order = ['1', '1,2', '1,2,1', '1,2,3', '1,2,4', '2', '2,1', '3', '3,4', '4', 'f+2', 'b+2', 'b+4', SIGNATURES[f.def.sig].cmd, 'd/f+2', 'd/f+4', 'f,f+2', 'f,f+3', '1+2', 'd+1', 'd+3', 'd+4', 'ws+2', 'ws+4', 'u+4', 'gr+3', 'gr+4', 'f+1+2', 'f+4', '1+3', '2+4', 'HB', 'HS', 'RA'];
    const seen = new Set(); let html = '';
    for (const id of order) { if (seen.has(id)) continue; seen.add(id); const m = f.moves[id]; if (!m) continue;
      const lv = { h: 'High', m: 'Mid', l: 'Low', sm: 'Mid', throw: 'Throw' }[m.level]; const extra = (m.engager ? ' · heat engager' : '') + (m.powerCrush ? ' · power crush' : m.screw ? ' · tornado' : m.launch ? ' · launcher' : m.knockdown ? ' · knockdown' : m.crumple ? ' · crumple on counter' : m.armor ? ' · armored' : '');
      const nt = id === flurryCmd(f) ? 'b+1,1,1' : notation(id);
      html += `<span>${nt}</span><span>${m.name}${m.signature ? ' ★' : ''}</span><span>${lv} · ${m.dmg} · i${m.startup}${extra}</span>`; }
    $('movelist').innerHTML = html; this.showScreen('moves'); this.menuEl = null;
  },
};
/* Special Style: one button per idea, the game picks the command */
function specialStyle(r, f, o) {
  const b = r.b; if (!(b['1'] || b['2'] || b['3'] || b['4'])) return r;
  const air = o.state === 'air' || o.state === 'wallsplat'; const m = f.state === 'attack' ? f.move : null;
  if (b['1'] && !b['2'] && !b['3'] && !b['4']) { if (m && m.id === '1') return { dir: 5, b: { '2': true } }; if (m && m.id === '1,2') return { dir: 5, b: { '4': true } }; return { dir: 5, b: { '1': true } }; }
  if (b['2'] && !b['1'] && !b['3'] && !b['4']) return { dir: air ? 5 : 3, b: { '2': true } };
  if (b['3'] && !b['1'] && !b['2'] && !b['4']) { f._ssLow = !f._ssLow; return { dir: 2, b: { [f._ssLow ? '3' : '4']: true } }; }
  if (b['4'] && !b['1'] && !b['2'] && !b['3']) { if (air && o.juggle >= 2 && !o.screwUsed) return { dir: 6, b: { '4': true } }; return { dir: air ? 5 : 4, b: { '4': true } }; }
  return r;
}
function flurryCmd(f) { return f.def.sig === 'flurry' ? 'b+1' : null; }
function notation(id) { return ({ 'gr+3': 'Down: 3', 'gr+4': 'Down: 4', 'ws+2': 'WS 2', 'ws+4': 'WS 4', 'u+4': 'u+3 / u+4', '1+3': '1+3', '2+4': '2+4', 'RA': 'Rage key', 'HB': '2+3', 'HS': '2+3 in Heat' })[id] || id; }
function disposeScene(s) {
  s.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap']) if (m[k]) m[k].dispose(); m.dispose(); } } });
  if (s.environment) s.environment.dispose();
}

window.addEventListener('load', () => { try { if (window.THREE) $('loader').textContent = 'Loading fighters'; (window.THREE && typeof loadSkinModels === 'function' ? loadSkinModels : f => f())(() => { try { Game.init(); } catch (e) { console.error(e); $('loader').textContent = 'Something went wrong starting the game: ' + e.message; } }); } catch (e) { console.error(e); $('loader').hidden = false; $('loader').textContent = 'Something went wrong starting the game: ' + e.message; } });
