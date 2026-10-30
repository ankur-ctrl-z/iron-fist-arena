/* ============ visual effects ============ */
class FX {
  constructor(scene) {
    this.scene = scene; this.parts = []; this.time = 0;
    this.sparkTex = glowTex('rgba(255,255,255,1)', 'rgba(255,200,120,0)');
    this.smokeTex = (() => { const c = canvas(128), x = c.getContext('2d'); for (let i = 0; i < 16; i++) { const g = x.createRadialGradient(64 + rnd(-20, 20), 64 + rnd(-20, 20), 0, 64, 64, 60); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); } return new THREE.CanvasTexture(c); })();
    this.pool = []; const n = [80, 160, 240][SETTINGS.quality];
    for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; scene.add(s); this.pool.push({ s, life: 0 }); }
    // streak lines
    this.nStreak = 64; const g = new THREE.BufferGeometry(); this.streakPos = new Float32Array(this.nStreak * 6); this.streakCol = new Float32Array(this.nStreak * 6);
    g.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.streakCol, 3));
    this.streaks = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); this.streaks.frustumCulled = false; scene.add(this.streaks);
    this.streakData = []; for (let i = 0; i < this.nStreak; i++) this.streakData.push({ life: 0 });
    // impact light
    this.flashLight = new THREE.PointLight(0xffd8a0, 0, 5, 2); scene.add(this.flashLight);
    // shockwave rings
    this.rings = []; for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.visible = false; scene.add(m); this.rings.push({ m, life: 0 }); }
  }
  get() { for (const p of this.pool) if (p.life <= 0) return p; return this.pool[(Math.random() * this.pool.length) | 0]; }
  emit(pos, o) {
    const p = this.get(); p.s.visible = true; p.s.position.copy(pos); p.life = p.max = o.life || 20; p.vel = o.vel ? o.vel.clone() : new THREE.Vector3(); p.g = o.g || 0; p.s0 = o.s0 || 0.3; p.s1 = o.s1 || 0; p.drag = o.drag || 0.92;
    p.s.material.map = o.smoke ? this.smokeTex : this.sparkTex; p.s.material.blending = o.smoke ? THREE.NormalBlending : THREE.AdditiveBlending; p.s.material.color.copy(o.color || new THREE.Color(1, 1, 1)); p.a0 = o.a || 1; p.s.material.opacity = p.a0; p.s.material.rotation = rnd(0, 6.28); p.s.scale.setScalar(p.s0);
  }
  hit(pos, power, block, counter) {
    const q = SETTINGS.quality; const n = Math.round((block ? 8 : 14 + power * 10) * [0.5, 0.8, 1][q]);
    const base = block ? new THREE.Color(0.5, 0.8, 2.4) : counter ? new THREE.Color(3, 0.7, 0.3) : new THREE.Color(3, 2.1, 0.9);
    this.emit(pos, { life: 7, s0: block ? 0.7 : 0.9 + power * 0.5, s1: 0.1, color: base.clone().multiplyScalar(1.4) });
    this.emit(pos, { life: 4, s0: 0.35, s1: 1.4 + power, color: new THREE.Color(3, 3, 3), a: 0.6 });
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(0.03, 0.11) * (0.7 + power * 0.4)); this.emit(pos, { life: rnd(10, 22), vel: v, g: 0.003, s0: rnd(0.04, 0.09), s1: 0, color: base, drag: 0.9 }); }
    for (let i = 0; i < (block ? 5 : 10); i++) this.streak(pos, base, 0.25 + power * 0.25);
    this.flashLight.position.copy(pos); this.flashLight.color.copy(base).multiplyScalar(0.33); this.flashLight.intensity = block ? 1.2 : 2.2 + power * 1.5;
    if (!block && power > 0.8) this.ring(pos, base, 0.08, 0.45 + power * 0.25, false);
  }
  streak(pos, col, len) {
    for (const s of this.streakData) if (s.life <= 0) { s.life = s.max = rnd(5, 9); s.p = pos.clone(); s.d = new THREE.Vector3(rnd(-1, 1), rnd(-0.7, 1), rnd(-1, 1)).normalize(); s.len = len * rnd(0.6, 1.3); s.c = col; return; }
  }
  ring(pos, col, s0, s1, flat) { for (const r of this.rings) if (r.life <= 0) { r.life = r.max = 16; r.s0 = s0; r.s1 = s1; r.m.position.copy(pos); r.m.visible = true; r.m.material.color.copy(col); r.flat = flat; r.m.rotation.set(flat ? -Math.PI / 2 : 0, 0, 0); return; } }
  dust(pos, amount) {
    const n = Math.round((amount || 8) * [0.4, 0.7, 1][SETTINGS.quality]);
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.28); const v = new THREE.Vector3(Math.cos(a), rnd(0.05, 0.4), Math.sin(a)).multiplyScalar(rnd(0.015, 0.04)); this.emit(new THREE.Vector3(pos.x + Math.cos(a) * 0.2, 0.1, pos.z + Math.sin(a) * 0.2), { smoke: true, life: rnd(30, 50), vel: v, s0: rnd(0.3, 0.5), s1: rnd(1.0, 1.6), color: new THREE.Color(0.75, 0.7, 0.65), a: 0.55, drag: 0.94 }); }
    this.ring(new THREE.Vector3(pos.x, 0.03, pos.z), new THREE.Color(0.6, 0.55, 0.5), 0.2, 1.6, true);
  }
  aura(pos, col) { const v = new THREE.Vector3(rnd(-0.01, 0.01), rnd(0.02, 0.04), rnd(-0.01, 0.01)); this.emit(new THREE.Vector3(pos.x + rnd(-0.3, 0.3), rnd(0.1, 1.6), pos.z + rnd(-0.3, 0.3)), { life: rnd(20, 35), vel: v, s0: rnd(0.12, 0.25), s1: 0, color: col, drag: 0.98, a: 0.8 }); }
  update() {
    for (const p of this.pool) { if (p.life <= 0) continue; p.life--; const k = 1 - p.life / p.max; p.vel.y -= p.g; p.vel.multiplyScalar(p.drag); p.s.position.add(p.vel); p.s.scale.setScalar(lerp(p.s0, p.s1, easeOut(k)) + 0.001); p.s.material.opacity = p.a0 * (1 - k); if (p.life <= 0) p.s.visible = false; }
    const P = this.streakPos, C = this.streakCol; let i = 0;
    for (const s of this.streakData) { if (s.life > 0) { s.life--; const k = 1 - s.life / s.max; const a = s.p.clone().addScaledVector(s.d, s.len * (0.2 + k)), b = s.p.clone().addScaledVector(s.d, s.len * (0.2 + k) + s.len * (1 - k) * 0.8); P.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); const f = 1 - k; C.set([s.c.r * f, s.c.g * f, s.c.b * f, 0, 0, 0], i * 6); } else { P.fill(0, i * 6, i * 6 + 6); C.fill(0, i * 6, i * 6 + 6); } i++; }
    this.streaks.geometry.attributes.position.needsUpdate = true; this.streaks.geometry.attributes.color.needsUpdate = true;
    this.flashLight.intensity *= 0.7;
    for (const r of this.rings) { if (r.life <= 0) continue; r.life--; const k = 1 - r.life / r.max; r.m.scale.setScalar(lerp(r.s0, r.s1, easeOut(k))); r.m.material.opacity = (1 - k) * (r.flat ? 0.5 : 0.35); if (!r.flat && this.cam) r.m.quaternion.copy(this.cam.quaternion); if (r.life <= 0) r.m.visible = false; }
  }
}

/* swept ribbon behind a striking limb */
class Trail {
  constructor(scene, color) {
    this.n = 12; this.pts = []; const g = new THREE.BufferGeometry(); this.pos = new Float32Array(this.n * 2 * 3); this.col = new Float32Array(this.n * 2 * 3);
    const idx = []; for (let i = 0; i < this.n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); this.mesh.frustumCulled = false; scene.add(this.mesh);
    this.color = color; this.active = false;
  }
  push(a, b, on) {
    this.pts.unshift(on ? [a.clone(), b.clone()] : null); if (this.pts.length > this.n) this.pts.pop();
    let last = null;
    for (let i = 0; i < this.n; i++) {
      let p = this.pts[i]; if (!p) p = last; if (!p) { this.pos.fill(0, i * 6, i * 6 + 6); this.col.fill(0, i * 6, i * 6 + 6); continue; }
      last = this.pts[i] ? p : last;
      const f = this.pts[i] ? Math.pow(1 - i / this.n, 1.6) : 0; const c = this.color;
      this.pos.set([p[0].x, p[0].y, p[0].z, p[1].x, p[1].y, p[1].z], i * 6); this.col.set([c.r * f * 0.15, c.g * f * 0.15, c.b * f * 0.15, c.r * f, c.g * f, c.b * f], i * 6);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
