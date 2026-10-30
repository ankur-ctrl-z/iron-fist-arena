/* ============ procedural texture generation ============ */
function hash2(x, y, s) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295; }
function noise2(x, y, p, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const m = v => ((v % p) + p) % p;
  const a = hash2(m(xi), m(yi), s), b = hash2(m(xi + 1), m(yi), s), c = hash2(m(xi), m(yi + 1), s), d = hash2(m(xi + 1), m(yi + 1), s);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct, p, s) { let v = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { v += a * noise2(x * f, y * f, p * f, s + i * 17); n += a; a *= 0.5; f *= 2; } return v / n; }
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }

/* builds color + normal + roughness maps from a per-pixel function returning [r,g,b,height,rough] */
function surface(N, fn, opts) {
  opts = opts || {};
  const cc = canvas(N), rc = canvas(N), nc = canvas(N);
  const cx = cc.getContext('2d'), rx = rc.getContext('2d'), nx = nc.getContext('2d');
  const ci = cx.createImageData(N, N), ri = rx.createImageData(N, N), ni = nx.createImageData(N, N);
  const H = new Float32Array(N * N); const out = [0, 0, 0, 0, 0];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    fn(x / N, y / N, out, x, y); const i = (y * N + x), j = i * 4;
    ci.data[j] = clamp(out[0], 0, 255); ci.data[j + 1] = clamp(out[1], 0, 255); ci.data[j + 2] = clamp(out[2], 0, 255); ci.data[j + 3] = 255;
    H[i] = out[3]; const r = clamp(out[4] * 255, 0, 255); ri.data[j] = r; ri.data[j + 1] = r; ri.data[j + 2] = r; ri.data[j + 3] = 255;
  }
  const str = opts.bump || 2.0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const l = H[y * N + ((x - 1 + N) % N)], r = H[y * N + ((x + 1) % N)], u = H[((y - 1 + N) % N) * N + x], d = H[((y + 1) % N) * N + x];
    let dx = (l - r) * str, dy = (u - d) * str, dz = 1; const len = Math.hypot(dx, dy, dz); dx /= len; dy /= len; dz /= len;
    const j = (y * N + x) * 4; ni.data[j] = (dx * 0.5 + 0.5) * 255; ni.data[j + 1] = (dy * 0.5 + 0.5) * 255; ni.data[j + 2] = (dz * 0.5 + 0.5) * 255; ni.data[j + 3] = 255;
  }
  cx.putImageData(ci, 0, 0); rx.putImageData(ri, 0, 0); nx.putImageData(ni, 0, 0);
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t; };
  return { map: mk(cc, true), normalMap: mk(nc), roughnessMap: mk(rc), canvas: cc };
}

const TEX = {
  wood(N, tint) {
    tint = tint || [150, 98, 58];
    const rows = 8;
    return surface(N, (u, v, o) => {
      const row = Math.floor(v * rows), rv = v * rows - row;
      const off = hash2(row, 3, 9) * 0.7; const seg = Math.floor((u + off) * 2), su = (u + off) * 2 - seg;
      const pk = hash2(row, seg, 4);
      const grain = fbm(u * 3 + pk * 10, v * rows * 0.5 + row * 3.1, 4, 64, 11);
      const ring = Math.sin((u * 40 + grain * 10 + pk * 30)) * 0.5 + 0.5;
      const k = 0.72 + pk * 0.3 + grain * 0.25 - ring * 0.06;
      const seam = (rv < 0.025 || rv > 0.975 || su < 0.006 || su > 0.994) ? 0.45 : 1;
      o[0] = tint[0] * k * seam; o[1] = tint[1] * k * seam; o[2] = tint[2] * k * seam;
      o[3] = seam < 1 ? 0 : 0.6 + grain * 0.4 - ring * 0.05; o[4] = 0.26 + grain * 0.22 + (1 - seam) * 0.35;
    }, { bump: 3 });
  },
  concrete(N) {
    return surface(N, (u, v, o, x, y) => {
      const n = fbm(u * 8, v * 8, 5, 8, 1), st = fbm(u * 2, v * 2, 3, 2, 5), sp = hash2(x, y, 7);
      let g = 118 + n * 60 - st * 40 + (sp > 0.985 ? -30 : 0);
      // painted safety lines
      const line = (Math.abs(u - 0.5) < 0.006) || (Math.abs(v - 0.08) < 0.01) || (Math.abs(v - 0.92) < 0.01);
      if (line && fbm(u * 30, v * 30, 2, 30, 3) > 0.35) { o[0] = 196 + n * 30; o[1] = 156 + n * 20; o[2] = 40; o[3] = 0.6; o[4] = 0.55; return; }
      o[0] = g * 1.0; o[1] = g * 0.99; o[2] = g * 0.96; o[3] = n * 0.8 + sp * 0.1; o[4] = 0.78 + n * 0.15 - st * 0.25;
    }, { bump: 2.5 });
  },
  asphalt(N) {
    return surface(N, (u, v, o, x, y) => {
      const n = fbm(u * 6, v * 6, 4, 6, 21), sp = hash2(x, y, 3), pud = fbm(u * 3 + 7, v * 3, 4, 3, 8);
      const wet = smooth(clamp((pud - 0.52) * 9, 0, 1));
      let g = 44 + n * 26 + sp * 22 - wet * 18;
      o[0] = g * 0.95; o[1] = g * 0.97; o[2] = g * 1.05; o[3] = (1 - wet) * (sp * 0.5 + n * 0.5); o[4] = lerp(0.55 + sp * 0.3, 0.03, wet);
    }, { bump: 2 });
  },
  stone(N) {
    const t = 4;
    return surface(N, (u, v, o) => {
      const row = Math.floor(v * t), off = (row % 2) * 0.5; const col = Math.floor(u * t + off);
      const fu = u * t + off - col, fv = v * t - row; const pk = hash2(col, row, 31);
      const n = fbm(u * 10, v * 10, 5, 10, 2), m = fbm(u * 3, v * 3, 3, 3, 6);
      const e = Math.min(fu, 1 - fu, fv, 1 - fv); const grout = e < 0.025;
      const bev = smooth(clamp(e / 0.06, 0, 1));
      let g = 150 + pk * 35 + n * 40 - m * 20;
      if (grout) { o[0] = 70; o[1] = 66; o[2] = 60; o[3] = 0; o[4] = 0.95; return; }
      const moss = clamp((m - 0.58) * 4, 0, 1) * (1 - bev * 0.6);
      o[0] = lerp(g * 1.02, 80, moss); o[1] = lerp(g * 0.97, 96, moss); o[2] = lerp(g * 0.9, 60, moss); o[3] = bev * 0.7 + n * 0.3; o[4] = 0.72 + n * 0.2;
    }, { bump: 4 });
  },
  metal(N) {
    return surface(N, (u, v, o) => {
      const rib = Math.sin(u * Math.PI * 2 * 16) * 0.5 + 0.5; const n = fbm(u * 6, v * 6, 4, 6, 41); const rust = clamp((fbm(u * 4 + 3, v * 4, 4, 4, 13) - 0.55) * 4 + (v > 0.8 ? (v - 0.8) * 3 : 0), 0, 1);
      const g = 92 + rib * 30 + n * 20;
      o[0] = lerp(g * 0.82, 120, rust); o[1] = lerp(g * 0.92, 66, rust); o[2] = lerp(g * 1.02, 36, rust); o[3] = rib; o[4] = lerp(0.45 + n * 0.2, 0.9, rust);
    }, { bump: 5 });
  },
  plaster(N, tint) {
    tint = tint || [190, 180, 160];
    return surface(N, (u, v, o) => { const n = fbm(u * 6, v * 6, 5, 6, 61); const k = 0.85 + n * 0.25; o[0] = tint[0] * k; o[1] = tint[1] * k; o[2] = tint[2] * k; o[3] = n; o[4] = 0.9; }, { bump: 1.5 });
  },
};
/* misc canvas textures */
function glowTex(inner, outer) {
  const c = canvas(128), x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner || 'rgba(255,255,255,1)'); g.addColorStop(0.25, inner || 'rgba(255,255,255,0.8)'); g.addColorStop(1, outer || 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}
function blobShadowTex() { const c = canvas(128), x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,0.7)'); g.addColorStop(0.5, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); }
function textTex(text, font, color, w, h, glow) {
  const c = canvas(w, h), x = c.getContext('2d'); x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, w, h);
  x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; if (glow) { x.shadowColor = color; x.shadowBlur = 18; }
  x.fillStyle = color; x.fillText(text, w / 2, h / 2); if (glow) x.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
function windowsTex(seed, lit) {
  const c = canvas(128, 256), x = c.getContext('2d'); x.fillStyle = '#05060a'; x.fillRect(0, 0, 128, 256);
  for (let r = 0; r < 32; r++) for (let q = 0; q < 8; q++) { const h = hash2(q, r, seed); if (h < lit) { const w = hash2(q, r, seed + 1); x.fillStyle = w > 0.7 ? '#ffd9a0' : w > 0.35 ? '#ffc070' : '#a8d0ff'; x.globalAlpha = 0.45 + w * 0.55; x.fillRect(q * 16 + 3, r * 8 + 2, 10, 5); } }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

const sideKey = (ax, az) => ax > 0 ? 'x+' : ax < 0 ? 'x-' : az > 0 ? 'z+' : 'z-';
/* gradient sky dome */
function skyDome(top, mid, bot, radius) {
  const geo = new THREE.SphereGeometry(radius || 120, 32, 16);
  const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: lin(top) }, mid: { value: lin(mid) }, bot: { value: lin(bot) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h=vP.y; vec3 c = h>0.0 ? mix(mid, top, pow(clamp(h,0.0,1.0),0.6)) : mix(mid, bot, pow(clamp(-h*3.0,0.0,1.0),0.5)); gl_FragColor=vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <encodings_fragment>\n}' });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -10; return m;
}

/* ============ stages ============ */
const STAGES = [
  { id: 'dojo', name: 'Hayashi Dojo', sub: 'Kyoto · dusk', exposure: 1.05 },
  { id: 'warehouse', name: 'Dock 9 Warehouse', sub: 'Rotterdam · 2 AM', exposure: 1.1 },
  { id: 'rooftop', name: 'Neon Rooftop', sub: 'Hong Kong · rain', exposure: 1.2 },
  { id: 'temple', name: 'Mountain Temple', sub: 'Sichuan · sunset', exposure: 1.0 },
];

class Stage {
  constructor(game, id) {
    this.game = game; this.id = id; this.def = STAGES.find(s => s.id === id);
    const scene = this.scene = new THREE.Scene();
    this.walls = []; this.updaters = []; this.bound = 5.6; this.square = true; this.hasWalls = true; this.debris = []; this.outer = null; this.debrisMats = [];
    this.q = SETTINGS.quality;
    this['build_' + id]();
    this.sb = { 'x+': this.bound, 'x-': this.bound, 'z+': this.bound, 'z-': this.bound };
    this.updaters.push(() => this.updateDebris());
    this.buildEnv();
  }
  add(o) { this.scene.add(o); return o; }
  mesh(geo, mat, x, y, z, cast, recv) { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = cast !== false; m.receiveShadow = recv !== false; this.scene.add(m); return m; }
  keyLight(color, intensity, pos, size) {
    const d = new THREE.DirectionalLight(lin(color), intensity); d.position.set(pos[0], pos[1], pos[2]); d.castShadow = true;
    const ms = [1024, 2048, 2048][this.q]; d.shadow.mapSize.set(ms, ms); const s = size || 9; Object.assign(d.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 60 });
    d.shadow.bias = -0.0004; d.shadow.normalBias = 0.02; d.shadow.radius = 3; this.scene.add(d); this.scene.add(d.target); this.key = d; return d;
  }
  floor(surf, size, rep, extra) {
    surf.map.repeat.set(rep, rep); surf.normalMap.repeat.set(rep, rep); surf.roughnessMap.repeat.set(rep, rep);
    const mat = new THREE.MeshStandardMaterial(Object.assign({ map: surf.map, normalMap: surf.normalMap, roughnessMap: surf.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.8, 0.8) }, extra || {}));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat); m.rotation.x = -Math.PI / 2; m.receiveShadow = true; this.scene.add(m); this.floorMesh = m; return m;
  }
  /* wall group: visible only while the camera is on the arena side of it */
  wallGroup(nx, nz, d, breakable) { const g = new THREE.Group(); this.scene.add(g); this.walls.push({ g, nx, nz, d, side: sideKey(-nx, -nz), breakable: !!breakable, broken: false }); return g; }
  canBreak(side) { return this.square && this.walls.some(w => w.side === side && w.breakable && !w.broken); }
  /* smash a wall: hide it, push the arena edge out to the next wall, throw debris */
  breakWall(side, at, dir) {
    for (const w of this.walls) if (w.side === side && w.breakable) { w.broken = true; w.g.visible = false; }
    if (this.outer) this.sb[side] = this.outer;
    const mats = this.debrisMats.length ? this.debrisMats : [stdMat('#777', 0.8)];
    const n = [14, 26, 40][this.q];
    for (let i = 0; i < n; i++) {
      const sz = rnd(0.08, 0.35); const geo = Math.random() < 0.7 ? new THREE.BoxGeometry(sz, sz * rnd(0.2, 1.4), sz * rnd(0.1, 0.9)) : new THREE.PlaneGeometry(sz * 1.5, sz);
      const m = new THREE.Mesh(geo, pick(mats)); m.castShadow = true; m.position.set(at.x + rnd(-0.9, 0.9), rnd(0.2, 2.2), at.z + rnd(-0.9, 0.9));
      const sp = rnd(0.05, 0.16); this.scene.add(m);
      this.debris.push({ m, v: new THREE.Vector3(dir.x * sp + rnd(-0.04, 0.04), rnd(0.02, 0.11), dir.z * sp + rnd(-0.04, 0.04)), r: new THREE.Vector3(rnd(-0.3, 0.3), rnd(-0.3, 0.3), rnd(-0.3, 0.3)), life: 900 });
    }
  }
  updateDebris() {
    for (let i = this.debris.length - 1; i >= 0; i--) { const d = this.debris[i]; d.life--; d.v.y -= 0.006; d.m.position.add(d.v); d.m.rotation.x += d.r.x; d.m.rotation.y += d.r.y; d.m.rotation.z += d.r.z;
      if (d.m.position.y < 0.04) { d.m.position.y = 0.04; d.v.y *= -0.35; d.v.x *= 0.7; d.v.z *= 0.7; d.r.multiplyScalar(0.6); }
      if (d.life < 60) d.m.position.y -= 0.002; if (d.life <= 0) { this.scene.remove(d.m); d.m.geometry.dispose(); this.debris.splice(i, 1); } }
  }
  buildEnv() {
    // image-based lighting from a simplified copy of the stage's light layout
    const r = this.game.renderer; const pm = new THREE.PMREMGenerator(r);
    const env = new THREE.Scene(); env.add(skyDome(this.envTop, this.envMid, this.envBot, 50));
    for (const p of (this.envPanels || [])) { const m = new THREE.Mesh(new THREE.PlaneGeometry(p[3], p[4]), new THREE.MeshBasicMaterial({ color: lin(p[5]).multiplyScalar(p[6] || 3), side: THREE.DoubleSide })); m.position.set(p[0], p[1], p[2]); m.lookAt(0, 1, 0); env.add(m); }
    const rt = pm.fromScene(env, 0.03); this.scene.environment = rt.texture; pm.dispose();
  }
  update(t, cam) {
    for (const w of this.walls) { const side = cam.position.x * w.nx + cam.position.z * w.nz + w.d; w.g.visible = !w.broken && side > 0.15; }
    for (const u of this.updaters) u(t, cam);
  }
  /* clamp a fighter inside the arena; returns true if it touched a wall */
  clamp(p, r) {
    const b = this.bound - r; let hit = false; const sb = this.sb || {};
    if (this.square) {
      const bx1 = (sb['x+'] || this.bound) - r, bx0 = (sb['x-'] || this.bound) - r, bz1 = (sb['z+'] || this.bound) - r, bz0 = (sb['z-'] || this.bound) - r;
      if (p.x > bx1) { p.x = bx1; hit = 'x+'; } if (p.x < -bx0) { p.x = -bx0; hit = 'x-'; }
      if (p.z > bz1) { p.z = bz1; hit = 'z+'; } if (p.z < -bz0) { p.z = -bz0; hit = 'z-'; }
    } else { const l = Math.hypot(p.x, p.z); if (l > b) { p.x *= b / l; p.z *= b / l; hit = 'r'; } }
    return this.hasWalls ? hit : false;
  }

  /* ---------- Hayashi Dojo ---------- */
  build_dojo() {
    const s = this.scene; this.bound = 5.85; const W = 6.0;
    s.fog = new THREE.Fog(lin('#1c120c'), 12, 34);
    this.envTop = '#2a1a10'; this.envMid = '#7a4a26'; this.envBot = '#2a1a10';
    this.envPanels = [[-8, 2, 0, 4, 3, '#ffb070', 4], [8, 2, 0, 4, 3, '#ffb070', 3], [0, 2, -8, 8, 3, '#ffcf90', 4], [0, 6, 0, 6, 6, '#ffd8a8', 1.2]];
    this.rimColor = '#ffd2a0'; this.rimI = 0.8; s.background = lin('#120c08'); s.add(skyDome('#141c34', '#b8683a', '#1a0e08', 90)); this.outer = 9.2;
    const N = [256, 512, 1024][this.q];
    this.floor(TEX.wood(N, [132, 86, 52]), 14, 4, { envMapIntensity: 1.0 });
    s.add(new THREE.HemisphereLight(lin('#ffd2a0'), lin('#2a1608'), 0.22));
    this.keyLight('#ffb26a', 2.6, [-6, 7, 3.5], 11);
    const fill = new THREE.DirectionalLight(lin('#8aa8d8'), 0.9); fill.position.set(5, 4, -6); s.add(fill);
    // walls with shoji panels
    const darkWood = stdMat('#3a2416', 0.6, 0); const midWood = stdMat('#5a3a22', 0.55, 0);
    const shojiC = canvas(256, 256), sx = shojiC.getContext('2d'); sx.fillStyle = '#f6e2c0'; sx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 400; i++) { sx.fillStyle = `rgba(160,110,60,${Math.random() * 0.04})`; sx.fillRect(Math.random() * 256, Math.random() * 256, 30, 2); }
    sx.fillStyle = '#2a1a10'; for (let i = 0; i <= 4; i++) { sx.fillRect(i * 64 - 3, 0, 6, 256); sx.fillRect(0, i * 64 - 3, 256, 6); }
    const shojiT = new THREE.CanvasTexture(shojiC); shojiT.encoding = THREE.sRGBEncoding;
    const shojiM = new THREE.MeshStandardMaterial({ map: shojiT, emissiveMap: shojiT, emissive: lin('#ffa050').multiplyScalar(0.55), roughness: 0.9 });
    const plaster = TEX.plaster(256, [196, 178, 150]); const plasterM = new THREE.MeshStandardMaterial({ map: plaster.map, normalMap: plaster.normalMap, roughness: 0.95 });
    const sides = [[1, 0, 0], [-1, 0, Math.PI], [0, 1, -Math.PI / 2], [0, -1, Math.PI / 2]];
    for (const [ax, az, rot] of sides) {
      const g = this.wallGroup(-ax, -az, W, true);
      const wall = new THREE.Group(); wall.rotation.y = rot + Math.PI / 2; wall.position.set(ax * W, 0, az * W); g.add(wall);
      const wains = new THREE.Mesh(new THREE.BoxGeometry(12, 1.0, 0.12), midWood); wains.position.set(0, 0.5, 0); wains.receiveShadow = true; wall.add(wains);
      for (let i = -2; i <= 2; i++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.2), (i === 0 && ax === 0 && az === -1) ? plasterM : shojiM); p.position.set(i * 2.4, 2.15, -0.02); p.rotation.y = Math.PI; wall.add(p);
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4, 0.22), darkWood); post.position.set(i * 2.4 + 1.2, 2, -0.02); post.castShadow = true; post.receiveShadow = true; wall.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.3, 0.3), darkWood); beam.position.set(0, 3.35, 0); wall.add(beam);
      const upper = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.6), plasterM); upper.position.set(0, 4.3, 0.02); upper.rotation.y = Math.PI; wall.add(upper);
      if (ax === 0 && az === -1) { // calligraphy scroll on the back wall
        const sc = canvas(128, 384), x = sc.getContext('2d'); x.fillStyle = '#efe6d2'; x.fillRect(0, 0, 128, 384); x.fillStyle = '#7a1a14'; x.fillRect(0, 0, 128, 18); x.fillRect(0, 366, 128, 18);
        x.fillStyle = '#111'; x.font = 'bold 110px serif'; x.textAlign = 'center'; x.fillText('武', 64, 150); x.fillText('道', 64, 290);
        const st = new THREE.CanvasTexture(sc); st.encoding = THREE.sRGBEncoding;
        const scroll = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.0), new THREE.MeshStandardMaterial({ map: st, roughness: 0.9 })); scroll.position.set(0, 2.1, -0.06); scroll.rotation.y = Math.PI; wall.add(scroll);
      }
    }
    // ceiling
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), stdMat('#2a1a10', 0.9)); ceil.rotation.x = Math.PI / 2; ceil.position.y = 5.1; s.add(ceil);
    for (let i = -2; i <= 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 0.25), darkWood); b.position.set(0, 4.95, i * 2.4); s.add(b); }
    // paper lanterns
    const lanM = new THREE.MeshStandardMaterial({ color: lin('#ffe2b8'), emissive: lin('#ffa040').multiplyScalar(2.2), roughness: 0.8 });
    for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), lanM); l.scale.y = 1.3; l.position.set(x, 3.6, z); s.add(l);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2), darkWood); cord.position.set(x, 4.5, z); s.add(cord);
      if (this.q > 0) { const pl = new THREE.PointLight(lin('#ff9a40'), 0.55, 7, 2); pl.position.set(x, 3.4, z); s.add(pl); }
    }
    // taiko drum and weapon rack in corners
    const drum = new THREE.Group(); drum.position.set(-5.2, 0, -5.2); s.add(drum);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.7, 24), stdMat('#6a2a16', 0.5)); body.rotation.z = Math.PI / 2; body.position.y = 0.9; body.castShadow = true; drum.add(body);
    for (const sx2 of [-1, 1]) { const h = new THREE.Mesh(new THREE.CircleGeometry(0.49, 24), stdMat('#e8dcc0', 0.7)); h.rotation.y = sx2 * Math.PI / 2; h.position.set(sx2 * 0.351, 0.9, 0); drum.add(h); }
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.5), darkWood); stand.position.y = 0.27; drum.add(stand);
    const rack = new THREE.Group(); rack.position.set(5.3, 0, -5.3); rack.rotation.y = -Math.PI / 4; s.add(rack);
    for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8), midWood); st.position.set(-0.4 + i * 0.2, 0.95, 0); st.rotation.z = 0.08; st.castShadow = true; rack.add(st); }
    const rb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.2), darkWood); rb.position.y = 1.5; rack.add(rb);
    this.debrisMats = [shojiM, darkWood, midWood];
    this.buildGarden(darkWood);
    this.addMotes('#ffcf90', 260);
  }

  /* ---------- Dock 9 Warehouse ---------- */
  build_warehouse() {
    const s = this.scene; this.bound = 5.95; const W = 5.95;
    s.fog = new THREE.FogExp2(lin('#0c1016'), 0.035); s.background = lin('#06080c'); this.rimColor = '#8fb0ff'; this.rimI = 1.2;
    this.envTop = '#0a0c12'; this.envMid = '#2a3240'; this.envBot = '#0c0c0e';
    this.envPanels = [[-3, 7, -2, 1.5, 1.5, '#ffd08a', 6], [3, 7, 2, 1.5, 1.5, '#ffd08a', 6], [0, 3, -10, 10, 4, '#4a6a9a', 1.2]];
    const N = [256, 512, 1024][this.q];
    this.floor(TEX.concrete(N), 16, 3, { envMapIntensity: 0.6 });
    s.add(new THREE.HemisphereLight(lin('#8aa0c0'), lin('#1a1612'), 0.28));
    this.keyLight('#ffd6a0', 1.6, [2, 9, 3], 8);
    const rim = new THREE.DirectionalLight(lin('#6a8cff'), 0.5); rim.position.set(-6, 4, -8); s.add(rim);
    const met = TEX.metal(256); met.map.repeat.set(3, 1); met.normalMap.repeat.set(3, 1); met.roughnessMap.repeat.set(3, 1);
    const metM = new THREE.MeshStandardMaterial({ map: met.map, normalMap: met.normalMap, roughnessMap: met.roughnessMap, metalness: 0.6, roughness: 1 });
    const crateS = TEX.wood(256, [150, 112, 70]); const crateM = new THREE.MeshStandardMaterial({ map: crateS.map, normalMap: crateS.normalMap, roughness: 0.85 });
    const conc = TEX.concrete(256); const concM = new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughness: 0.9 });
    const drumM = stdMat('#1f4a7a', 0.45, 0.5), drumM2 = stdMat('#8a2a1a', 0.5, 0.5);
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    sides.forEach(([ax, az], k) => {
      const g = this.wallGroup(-ax, -az, W + 0.75);
      const rot = Math.atan2(ax, az);
      const wall = new THREE.Group(); wall.position.set(ax * (W + 0.9), 0, az * (W + 0.9)); wall.rotation.y = rot; g.add(wall);
      const cg = this.wallGroup(-ax, -az, W + 0.05, true); const cw = new THREE.Group(); cw.position.copy(wall.position); cw.rotation.y = rot; cg.add(cw);
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), metM); panel.position.y = 4; panel.rotation.y = Math.PI; panel.receiveShadow = true; wall.add(panel);
      const base = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 0.3), concM); base.position.set(0, 0.6, -0.1); base.receiveShadow = true; wall.add(base);
      // crates / drums lining the wall: the actual splat surface
      for (let i = -3; i <= 3; i++) {
        const h = hash2(i, k, 77);
        if (h < 0.55) { const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.85), crateM); c.position.set(i * 1.9 + (h - 0.3), 0.7, -0.45); c.rotation.y = (h - 0.3) * 0.2; c.castShadow = true; c.receiveShadow = true; cw.add(c);
          if (h < 0.25) { const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.8), crateM); c2.position.set(i * 1.9, 1.95, -0.45); c2.rotation.y = 0.3; c2.castShadow = true; cw.add(c2); } }
        else { for (let j = 0; j < 2; j++) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 18), h > 0.8 ? drumM2 : drumM); d.position.set(i * 1.9 - 0.35 + j * 0.68, 0.45, -0.4); d.castShadow = true; d.receiveShadow = true; cw.add(d); } }
      }
    });
    this.outer = W + 0.62; this.debrisMats = [crateM, drumM, drumM2];
    // hanging industrial lamps with light cones
    const shadeM = stdMat('#2a2e34', 0.4, 0.7); const bulbM = new THREE.MeshBasicMaterial({ color: lin('#fff0c8').multiplyScalar(6) });
    const coneMat = new THREE.MeshBasicMaterial({ color: lin('#ffcf80'), transparent: true, opacity: 0.022, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, z] of [[-2.6, -1.6], [2.6, 1.6], [-2.6, 3.2], [2.6, -3.2]]) {
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.35, 20, 1, true), shadeM); shade.position.set(x, 5.2, z); s.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), bulbM); bulb.position.set(x, 5.05, z); s.add(bulb);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3), shadeM); cord.position.set(x, 6.8, z); s.add(cord);
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 2.4, 5, 24, 1, true), coneMat); cone.position.set(x, 2.55, z); s.add(cone);
      if (this.q > 0) { const sp = new THREE.SpotLight(lin('#ffd08a'), 1.1, 12, 0.7, 0.6, 1.5); sp.position.set(x, 5, z); sp.target.position.set(x, 0, z); s.add(sp, sp.target); }
    }
    // ceiling trusses
    const trussM = stdMat('#20242a', 0.6, 0.6);
    for (let i = -3; i <= 3; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 0.2), trussM); t.position.set(0, 7.5, i * 2.2); s.add(t); }
    // forklift-like silhouette pallets outside reach
    this.addMotes('#cfd8ff', 340);
  }

  /* ---------- Neon Rooftop ---------- */
  build_rooftop() {
    const s = this.scene; this.bound = 5.72; const W = 5.75;
    s.fog = new THREE.FogExp2(lin('#120a1e'), 0.012); this.rimColor = '#ff6ac8'; this.rimI = 1.3;
    this.envTop = '#05040c'; this.envMid = '#2a1438'; this.envBot = '#0a0610';
    this.envPanels = [[-8, 3, -6, 4, 1.4, '#ff2a8a', 6], [8, 2.5, 5, 4, 1.2, '#20e0ff', 6], [0, 2, -12, 10, 2, '#ff8a30', 2], [6, 5, -8, 3, 2, '#7a40ff', 4]];
    s.add(skyDome('#04030a', '#3a1a46', '#120818', 140));
    const N = [256, 512, 1024][this.q];
    this.floor(TEX.asphalt(N), 14, 3, { envMapIntensity: 1.4 });
    s.add(new THREE.HemisphereLight(lin('#5a4a9a'), lin('#0a0610'), 0.35));
    this.keyLight('#b0c4ff', 0.9, [4, 10, 6], 8);
    // neon point lights that tint the fighters
    const neon = [['#ff2a8a', -6, 2.6, -5.5], ['#20e0ff', 6, 2.6, 4.5], ['#ff8a30', 5, 2.2, -5.6]];
    for (const [c, x, y, z] of neon) { const pl = new THREE.PointLight(lin(c), 1.6, 12, 2); pl.position.set(x, y, z); s.add(pl); }
    // parapet walls with rail
    const conc = TEX.concrete(256); const concM = new THREE.MeshStandardMaterial({ map: conc.map, normalMap: conc.normalMap, roughness: 0.85, color: lin('#9a9aa8') });
    const railM = stdMat('#8a8e96', 0.35, 0.85);
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    sides.forEach(([ax, az]) => {
      const g = this.wallGroup(-ax, -az, W);
      const rot = Math.atan2(ax, az);
      const wall = new THREE.Group(); wall.position.set(ax * (W + 0.15), 0, az * (W + 0.15)); wall.rotation.y = rot; g.add(wall);
      const par = new THREE.Mesh(new THREE.BoxGeometry(12, 1.05, 0.3), concM); par.position.y = 0.52; par.castShadow = true; par.receiveShadow = true; wall.add(par);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(12.1, 0.08, 0.4), concM); cap.position.y = 1.08; wall.add(cap);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 12), railM); rail.rotation.z = Math.PI / 2; rail.position.y = 1.55; wall.add(rail);
      for (let i = -5; i <= 5; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5), railM); p.position.set(i * 1.1, 1.32, 0); wall.add(p); }
    });
    // rooftop props outside the arena
    const acM = stdMat('#a0a4aa', 0.5, 0.6);
    for (const [x, z, r] of [[-7.5, -2, 0], [7.4, 2.5, 0.4], [-2, -7.6, 1.2]]) { const ac = this.mesh(new THREE.BoxGeometry(1.4, 1.0, 1.0), acM, x, 0.5, z); ac.rotation.y = r; const fan = this.mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 20), stdMat('#30343a', 0.5, 0.5), x, 1.03, z); this.updaters.push(t => fan.rotation.y = t * 0.3); }
    const tower = new THREE.Group(); tower.position.set(-7, 0, -7); s.add(tower);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 24), stdMat('#5a3a2a', 0.8, 0.1)); tank.position.y = 4.2; tank.castShadow = true; tower.add(tank);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4, 0.8, 24), stdMat('#3a2a22', 0.8)); roof.position.y = 5.7; tower.add(roof);
    for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.1), railM); leg.position.set(x, 1.55, z); tower.add(leg); }
    // neon signs
    const signs = [['RAMEN 拉麵', '#ff2a8a', -6.2, 3.6, -6.4, 0.5, 3.6, 0.9], ['HOTEL', '#20e0ff', 6.7, 3.4, 5.0, -Math.PI / 2 - 0.3, 3.0, 0.9], ['鐵拳', '#ff8a30', 5.2, 4.2, -6.6, -0.3, 2.2, 1.0]];
    for (const [t, c, x, y, z, ry, w, h] of signs) {
      const tex = textTex(t, 'bold 84px "Barlow Condensed", Impact, sans-serif', c, 512, 160, true);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h * w / 3.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(3, 3, 3), depthWrite: false, fog: false }));
      m.position.set(x, y, z); m.rotation.y = ry; s.add(m);
      const back = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, h * w / 3.2 * 1.1, 0.08), stdMat('#111', 0.5, 0.6)); back.position.copy(m.position); back.rotation.y = ry; back.translateZ(-0.06); s.add(back);
      this.updaters.push(tt => { m.material.color.setScalar((Math.sin(tt * 0.9 + x) > -0.97 ? 3 : 0.4) * (0.92 + Math.sin(tt * 3.1 + y) * 0.08)); });
    }
    // skyline
    const bG = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * Math.PI * 2 + hash2(i, 1, 5) * 0.08, r = 26 + hash2(i, 2, 5) * 44; const w = 4 + hash2(i, 3, 5) * 7, h = 12 + hash2(i, 4, 5) * 50;
      const tex = windowsTex(i, 0.35 + hash2(i, 5, 5) * 0.3); tex.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(h / 12)));
      const m = new THREE.Mesh(bG, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.4, 1.4, 1.4) }));
      m.scale.set(w, h, w); m.position.set(Math.cos(a) * r, h / 2 - 14, Math.sin(a) * r); m.rotation.y = -a; s.add(m);
      if (i % 9 === 0) { const bl = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 0.4, 0.2) })); bl.position.set(m.position.x, h - 14 + 1, m.position.z); s.add(bl); this.updaters.push(t => bl.visible = Math.sin(t * 0.15 + i) > 0.3); }
    }
    this.addRain();
  }

  /* ---------- Mountain Temple ---------- */
  build_temple() {
    const s = this.scene; this.bound = 8.5; this.square = false; this.hasWalls = false; this.rimColor = '#ffc890'; this.rimI = 1.1;
    s.fog = new THREE.Fog(lin('#d49a70'), 20, 110);
    this.envTop = '#4a6aa8'; this.envMid = '#ffb27a'; this.envBot = '#4a3428';
    this.envPanels = [[-30, 6, -20, 20, 10, '#ffc890', 6]];
    s.add(skyDome('#3a5a9a', '#ffb27a', '#6a4a38', 160));
    const sun = new THREE.Mesh(new THREE.CircleGeometry(6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 2.6), fog: false })); sun.position.set(-90, 14, -70); sun.lookAt(0, 0, 0); s.add(sun);
    const N = [256, 512, 1024][this.q];
    this.floor(TEX.stone(N), 22, 5, { envMapIntensity: 0.7 });
    const disk = new THREE.Mesh(new THREE.CircleGeometry(60, 48), stdMat('#5a4632', 1)); disk.rotation.x = -Math.PI / 2; disk.position.y = -0.02; disk.receiveShadow = true; s.add(disk);
    s.add(new THREE.HemisphereLight(lin('#9ab8ff'), lin('#5a3a22'), 0.55));
    this.keyLight('#ffc08a', 2.8, [-9, 5, -6], 10);
    // mountains
    const mm = stdMat('#4a5a7a', 1);
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = 70 + hash2(i, 0, 3) * 30, h = 18 + hash2(i, 1, 3) * 30; const m = new THREE.Mesh(new THREE.ConeGeometry(16 + hash2(i, 2, 3) * 14, h, 7), mm); m.position.set(Math.cos(a) * r, h / 2 - 6, Math.sin(a) * r); m.rotation.y = i; s.add(m); }
    // temple hall at the back
    const hall = new THREE.Group(); hall.position.set(0, 0, -14); s.add(hall);
    const redM = stdMat('#8a1f14', 0.6), roofM = stdMat('#2a2a30', 0.5, 0.3), baseM = stdMat('#9a8a78', 0.9), goldM = stdMat('#c89a3a', 0.35, 0.8);
    const base = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 7), baseM); base.position.y = 0.5; base.castShadow = true; base.receiveShadow = true; hall.add(base);
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, 0.6), baseM); st.position.set(0, 0.125 + i * 0.25, 3.8 - i * 0.3); st.receiveShadow = true; hall.add(st); }
    for (let i = -3; i <= 3; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 4, 16), redM); c.position.set(i * 2, 3, 3); c.castShadow = true; hall.add(c); }
    const wallH = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 0.3), stdMat('#6a2a1a', 0.8)); wallH.position.set(0, 3, 1); hall.add(wallH);
    const r1 = new THREE.Mesh(new THREE.CylinderGeometry(5, 9.5, 2.2, 4, 1), roofM); r1.rotation.y = Math.PI / 4; r1.scale.set(1, 1, 0.55); r1.position.y = 6.1; r1.castShadow = true; hall.add(r1);
    const r2 = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 5.5, 1.6, 4, 1), roofM); r2.rotation.y = Math.PI / 4; r2.scale.set(1, 1, 0.55); r2.position.y = 7.9; r2.castShadow = true; hall.add(r2);
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), goldM); fin.position.y = 8.9; hall.add(fin);
    const plaqueT = textTex('天下一', 'bold 100px serif', '#e8c060', 384, 128, false);
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.73), new THREE.MeshStandardMaterial({ map: plaqueT, color: lin('#ffffff'), emissive: lin('#3a2a10'), roughness: 0.5 }));
    const pb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 0.1), stdMat('#1a1008', 0.6)); pb.position.set(0, 4.6, 3.12); hall.add(pb); plaque.position.set(0, 4.6, 3.18); hall.add(plaque);
    // stone lanterns ring
    const stoneM = stdMat('#8a8478', 0.95);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2 + 0.39, r = 10.5; const g = new THREE.Group(); g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); s.add(g);
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 1.1, 8), stoneM); p1.position.y = 0.55; p1.castShadow = true; g.add(p1);
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), stoneM); p2.position.y = 1.32; g.add(p2);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.62), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.8) })); glow.position.y = 1.32; g.add(glow);
      const p3 = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.4, 4), stoneM); p3.position.y = 1.75; p3.rotation.y = Math.PI / 4; p3.castShadow = true; g.add(p3);
    }
    // cherry trees
    const trunkM = stdMat('#3a2418', 0.9), blossomM = stdMat('#f2a8c0', 0.8, 0, { emissive: lin('#3a1018') });
    for (const [x, z, sc] of [[-11, -6, 1.1], [12, -5, 1.0], [-9, 9, 0.9], [11, 8, 1.2]]) {
      const tg = new THREE.Group(); tg.position.set(x, 0, z); tg.scale.setScalar(sc); s.add(tg);
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 3, 8), trunkM); tr.position.y = 1.5; tr.rotation.z = 0.12; tr.castShadow = true; tg.add(tr);
      for (let k = 0; k < 14; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8 + hash2(k, x | 0, 2) * 0.6, 1), blossomM); b.position.set((hash2(k, 1, z | 0) - 0.5) * 3.2, 3 + hash2(k, 2, 4) * 1.6, (hash2(k, 3, 6) - 0.5) * 3.2); b.castShadow = true; tg.add(b); }
    }
    this.addPetals();
  }

  /* dojo exterior, revealed when a wall is broken */
  buildGarden(wood) {
    const s = this.scene;
    const gr = surface(256, (u, v, o, x, y) => { const n = fbm(u * 10, v * 10, 4, 10, 71), sp = hash2(x, y, 9); o[0] = 46 + n * 40 + sp * 20; o[1] = 62 + n * 46 + sp * 20; o[2] = 34 + n * 20; o[3] = n; o[4] = 0.95; }, { bump: 2 });
    gr.map.repeat.set(10, 10); gr.normalMap.repeat.set(10, 10);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: gr.map, normalMap: gr.normalMap, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; ground.receiveShadow = true; s.add(ground);
    const veranda = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.12, 14.6), wood); veranda.position.y = -0.07; veranda.receiveShadow = true; s.add(veranda);
    const rockM = stdMat('#6a665e', 0.95), bamM = stdMat('#6a7a3a', 0.6), lanM = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.2, 0.8) });
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, r = 7.6 + hash2(i, 2, 8) * 1.2; const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + hash2(i, 1, 8) * 0.3, 0), rockM); rk.position.set(Math.cos(a) * r, 0.1, Math.sin(a) * r); rk.scale.y = 0.6; rk.castShadow = true; s.add(rk); }
    const F = 9.5; const post = new THREE.CylinderGeometry(0.045, 0.05, 2.2, 8);
    [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ax, az]) => {
      const g = this.wallGroup(-ax, -az, F - 0.1); const n = 150; const inst = new THREE.InstancedMesh(post, bamM, n); const o = new THREE.Object3D();
      for (let i = 0; i < n; i++) { const t = -9.5 + i * (19 / n); o.position.set(ax ? ax * F : t, 1.1 + hash2(i, ax + 3, az + 3) * 0.1, az ? az * F : t); o.rotation.set(0, 0, 0); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); }
      inst.castShadow = true; g.add(inst);
      for (const h of [0.5, 1.6]) { const tie = new THREE.Mesh(new THREE.BoxGeometry(ax ? 0.06 : 19, 0.05, ax ? 19 : 0.06), wood); tie.position.set(ax * (F - 0.07), h, az * (F - 0.07)); g.add(tie); }
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), lanM); l.position.set(ax ? ax * (F - 0.6) : 3, 0.5, az ? az * (F - 0.6) : -3); g.add(l);
      if (this.q === 2) { const pl = new THREE.PointLight(lin('#ff9a40'), 0.4, 5, 2); pl.position.copy(l.position); g.add(pl); }
    });
  }
  /* ---------- ambient particles ---------- */
  addMotes(color, n) {
    n = Math.round(n * [0.4, 0.8, 1][this.q]);
    const g = new THREE.BufferGeometry(), p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { p[i * 3] = rnd(-6, 6); p[i * 3 + 1] = rnd(0.2, 5); p[i * 3 + 2] = rnd(-6, 6); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ color: lin(color), size: 0.03, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, map: glowTex() }));
    this.scene.add(m);
    this.updaters.push(t => { const a = g.attributes.position.array; for (let i = 0; i < n; i++) { a[i * 3 + 1] += Math.sin(t * 0.01 + i) * 0.0015 + 0.0006; a[i * 3] += Math.cos(t * 0.008 + i * 1.3) * 0.001; if (a[i * 3 + 1] > 5) a[i * 3 + 1] = 0.2; } g.attributes.position.needsUpdate = true; });
  }
  addRain() {
    const n = [700, 1400, 2200][this.q]; const g = new THREE.BufferGeometry(), p = new Float32Array(n * 6);
    const reset = (i, top) => { const x = rnd(-12, 12), z = rnd(-12, 12), y = top ? rnd(8, 14) : rnd(0, 14); p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z; p[i * 6 + 3] = x + 0.02; p[i * 6 + 4] = y - 0.35; p[i * 6 + 5] = z + 0.01; };
    for (let i = 0; i < n; i++) reset(i, false);
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: lin('#9ab0d8'), transparent: true, opacity: 0.35, depthWrite: false }));
    lines.frustumCulled = false; this.scene.add(lines);
    const flash = new THREE.HemisphereLight(lin('#c8d8ff'), lin('#202030'), 0); this.scene.add(flash); let fl = 0;
    this.updaters.push(t => {
      for (let i = 0; i < n; i++) { p[i * 6 + 1] -= 0.26; p[i * 6 + 4] -= 0.26; p[i * 6] += 0.01; p[i * 6 + 3] += 0.01; if (p[i * 6 + 4] < 0) reset(i, true); }
      g.attributes.position.needsUpdate = true;
      if (fl <= 0 && Math.random() < 0.0012) fl = 18; if (fl > 0) { fl--; flash.intensity = (fl % 6 > 2 ? 2.2 : 0.4) * (fl / 18); } else flash.intensity = 0;
    });
  }
  addPetals() {
    const n = [60, 140, 220][this.q]; const geo = new THREE.PlaneGeometry(0.06, 0.04); const mat = new THREE.MeshStandardMaterial({ color: lin('#ffc0d4'), side: THREE.DoubleSide, roughness: 0.7, emissive: lin('#401018') });
    const inst = new THREE.InstancedMesh(geo, mat, n); this.scene.add(inst); const st = [];
    for (let i = 0; i < n; i++) st.push({ x: rnd(-12, 12), y: rnd(0, 7), z: rnd(-12, 12), r: rnd(0, 6), s: rnd(0.004, 0.009) });
    const o = new THREE.Object3D();
    this.updaters.push(t => { for (let i = 0; i < n; i++) { const q = st[i]; q.y -= q.s; q.x += Math.sin(t * 0.02 + i) * 0.01 + 0.006; q.z += Math.cos(t * 0.017 + i) * 0.006; q.r += 0.04; if (q.y < 0.02) { q.y = 7; q.x = rnd(-12, 12); q.z = rnd(-12, 12); } o.position.set(q.x, q.y, q.z); o.rotation.set(q.r, q.r * 0.7, q.r * 0.3); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); } inst.instanceMatrix.needsUpdate = true; });
  }
}
