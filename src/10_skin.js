/* ============ skinned character bodies (Mixamo rigs driven by the procedural skeleton) ============ */
const SKIN = { ready: false, src: {} };
function loadSkinModels(done) {
  if (!THREE.GLTFLoader || !window.IFA_MODELS) { done(); return; }
  const loader = new THREE.GLTFLoader(); const keys = Object.keys(IFA_MODELS); let left = keys.length;
  const fin = () => { if (--left === 0) { SKIN.ready = Object.keys(SKIN.src).length > 0; done(); } };
  for (const k of keys) {
    try {
      const s = atob(IFA_MODELS[k]); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      loader.parse(u8.buffer, '', g => { SKIN.src[k] = g.scene; fin(); }, e => { console.warn('model', k, e); fin(); });
    } catch (e) { console.warn(e); fin(); }
  }
}
const BONE_MAP = {
  Hips: 'hips', Spine: 'spine', Spine1: 'spine', Spine2: 'chest', Neck: 'neck', Head: 'neck',
  LeftShoulder: 'chest', LeftArm: 'lSh', LeftForeArm: 'lEl', LeftHand: 'lEl',
  RightShoulder: 'chest', RightArm: 'rSh', RightForeArm: 'rEl', RightHand: 'rEl',
  LeftUpLeg: 'lHip', LeftLeg: 'lKnee', LeftFoot: 'lAnk', LeftToeBase: 'lAnk',
  RightUpLeg: 'rHip', RightLeg: 'rKnee', RightFoot: 'rAnk', RightToeBase: 'rAnk',
};
const bname = b => b.name.replace(/^mixamorig:?/, '');
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _p = new THREE.Vector3();

class SkinBody {
  constructor(model, def) {
    this.model = model; this.def = def;
    const src = SKIN.src[def.skinModel];
    const obj = this.obj = THREE.SkeletonUtils.clone(src);
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    this.bones = []; obj.traverse(o => { if (o.isBone) this.bones.push(o); });
    this.byName = {}; for (const b of this.bones) this.byName[bname(b)] = b;
    model.root.add(obj);
    // face the same way as the driver (+z): the left arm must sit on +x
    obj.updateMatrixWorld(true);
    if (this.byName.LeftArm.getWorldPosition(new THREE.Vector3()).x < this.byName.RightArm.getWorldPosition(new THREE.Vector3()).x) { obj.rotation.y += Math.PI; obj.updateMatrixWorld(true); }
    if (def.hideMesh) this.obj.traverse(o => { if (o.isMesh && def.hideMesh.test(o.name)) o.visible = false; });
    if (def.shape) this.shape(def.shape);
    if (def.recolor && RECOLOR[def.recolor]) this.recolor(RECOLOR[def.recolor]);
    if (def.paint) this.paint(def);
    if (def.headFrom) this.mountHead(def);
    this.dress(def);
    // scale so hip height matches the driver
    obj.updateMatrixWorld(true); const hipsW = this.byName.Hips.getWorldPosition(new THREE.Vector3()).y - model.root.position.y;
    const want = HIPS_Y * (def.height || 1); obj.scale.multiplyScalar(want / hipsW); obj.updateMatrixWorld(true);
    // calibrate against a T-posed driver
    const saved = {}; for (const j of JOINTS) saved[j] = model.joints[j].rotation.clone(); const sHy = model.joints.hips.position.y, sHz = model.joints.hips.position.z;
    for (const j of JOINTS) model.joints[j].rotation.set(0, 0, 0);
    model.joints.hips.position.set(0, HIPS_Y, 0); model.root.updateMatrixWorld(true);
    const limbs = [['lSh', 'LeftArm', 'LeftForeArm'], ['lEl', 'LeftForeArm', 'LeftHand'], ['rSh', 'RightArm', 'RightForeArm'], ['rEl', 'RightForeArm', 'RightHand'], ['lHip', 'LeftUpLeg', 'LeftLeg'], ['lKnee', 'LeftLeg', 'LeftFoot'], ['rHip', 'RightUpLeg', 'RightLeg'], ['rKnee', 'RightLeg', 'RightFoot']];
    for (const [j, a, b] of limbs) {
      const d = this.byName[b].getWorldPosition(new THREE.Vector3()).sub(this.byName[a].getWorldPosition(new THREE.Vector3())).normalize();
      const jt = model.joints[j]; const pq = jt.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); d.applyQuaternion(pq);
      jt.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d); jt.updateMatrixWorld(true);
    }
    model.root.updateMatrixWorld(true);
    this.links = [];
    for (const b of this.bones) {
      const n = bname(b), dj = BONE_MAP[n];
      const bw = b.getWorldQuaternion(new THREE.Quaternion());
      if (dj) { const dw = model.joints[dj].getWorldQuaternion(new THREE.Quaternion()); this.links.push({ b, d: model.joints[dj], off: dw.invert().multiply(bw), hips: n === 'Hips' }); }
      else this.links.push({ b, bind: b.quaternion.clone(), curl: /Hand(Index|Middle|Ring|Pinky)[123]$/.test(n) ? 1 : /HandThumb[123]$/.test(n) ? 0.5 : 0, thumb: /Thumb/.test(n), side: n.startsWith('Left') ? 1 : -1 });
    }
    this.hipsOff = this.byName.Hips.getWorldPosition(new THREE.Vector3()).sub(model.joints.hips.getWorldPosition(new THREE.Vector3()));
    this.hipsOff.applyQuaternion(model.root.getWorldQuaternion(new THREE.Quaternion()).invert());
    for (const j of JOINTS) model.joints[j].rotation.copy(saved[j]); model.joints.hips.position.y = sHy; model.joints.hips.position.z = sHz;
    model.root.updateMatrixWorld(true);
    this.fist = 1;
  }
  /* repaint a neutral body with an outfit, using bone weights to find body regions */
  paint(def) {
    const P = def.paint; const C = k => lin(P[k] || '#ff00ff');
    const meshes = collectSkinned(this.obj); let minY = 1e9, maxY = -1e9; const v = new THREE.Vector3();
    for (const mesh of meshes) { const pos = mesh.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); } }
    for (const mesh of meshes) {
      const g = mesh.geometry = mesh.geometry.clone(); const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const bones = mesh.skeleton.bones, inv = mesh.skeleton.boneInverses;
      const bp = bones.map((b, i) => new THREE.Vector3().applyMatrix4(new THREE.Matrix4().copy(inv[i]).invert()));
      const names = bones.map(bname);
      const childOf = bones.map(b => { const c = b.children.find(x => x.isBone); return c ? bones.indexOf(c) : -1; });
      const H = maxY - minY, ny = y => (y - minY) / H;
      const hipsY = ny(bp[names.indexOf('Hips')].y), neckY = ny(bp[names.indexOf('Neck')].y), kneeY = ny(bp[names.indexOf('LeftLeg')].y);
      const waistY = hipsY + 0.045;
      const col = new Float32Array(pos.count * 3), reg = new Uint8Array(pos.count);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.bindMatrix);
        const ws = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)], is = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)]; let best = 0, bw = -1; for (let k = 0; k < 4; k++) if (ws[k] > bw) { bw = ws[k]; best = is[k]; }
        const n = names[best]; const c = childOf[best];
        let t = 0; if (c >= 0) { const a = bp[best], d = bp[c].clone().sub(a); t = clamp(v.clone().sub(a).dot(d) / d.lengthSq(), 0, 1); }
        const y = ny(v.y), x = Math.abs(v.x) / H, front = v.z > bp[names.indexOf('Hips')].z;
        const region = outfitRegion(def.outfit, { n, t, y, x, front, hipsY, neckY, kneeY, waistY });
        reg[i] = region === 'skin' ? 0 : 1; if (def.headFrom && /Head|HeadTop|Eye/.test(n) && y > neckY + 0.03) reg[i] = 9;
        const cc = region === 'skin' ? lin(def.skin) : C(region); col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      // split triangles into skin and cloth groups so each gets its own material
      const idx = g.index ? g.index.array : Array.from({ length: pos.count }, (_, k) => k), sk = [], cl = [];
      for (let f = 0; f < idx.length; f += 3) { const a = idx[f], b = idx[f + 1], c2 = idx[f + 2]; if (reg[a] === 9 || reg[b] === 9 || reg[c2] === 9) continue; ((reg[a] + reg[b] + reg[c2]) >= 2 ? cl : sk).push(a, b, c2); }
      g.setIndex(sk.concat(cl)); g.clearGroups(); g.addGroup(0, sk.length, 0); g.addGroup(sk.length, cl.length, 1);
      const skinM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: def.skinMetal ? 0.25 : 0.5, metalness: def.skinMetal ? 0.85 : 0, skinning: true });
      const clothM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, skinning: true, normalMap: clothNormal(), normalScale: new THREE.Vector2(0.5, 0.5) });
      if (!g.attributes.uv) clothM.normalMap = null;
      mesh.material = [skinM, clothM]; this.skinMat = skinM;
    }
  }
  /* reshape the body by scaling bones; children are counter-scaled so only the intended part grows */
  shape(sh) {
    const B = this.byName; const comp = (child, S) => { const R = new THREE.Matrix4().makeRotationFromQuaternion(child.quaternion); const D = new THREE.Matrix4().makeScale(1 / S.x, 1 / S.y, 1 / S.z); const M = new THREE.Matrix4().copy(R).transpose().multiply(D).multiply(R).elements; child.scale.set(child.scale.x * M[0], child.scale.y * M[5], child.scale.z * M[10]); };
    const sc = (name, v, kids) => { const b = B[name]; if (!b) return; b.scale.multiply(v); for (const k of b.children) if (k.isBone && (!kids || kids.test(bname(k)))) comp(k, v); };
    if (sh.chest) sc('Spine2', new THREE.Vector3(sh.chest, 1, sh.chest * 0.92));
    if (sh.waist) sc('Spine', new THREE.Vector3(sh.waist, 1, sh.waist));
    if (sh.hips) sc('Hips', new THREE.Vector3(sh.hips, 1, 1));
    for (const s of ['Left', 'Right']) {
      if (sh.arms) { sc(s + 'Arm', new THREE.Vector3(sh.arms, 1, sh.arms), /^$/); sc(s + 'Hand', new THREE.Vector3(1 / sh.arms, 1, 1 / sh.arms)); }
      if (sh.legs) { sc(s + 'UpLeg', new THREE.Vector3(sh.legs, 1, sh.legs), /^$/); sc(s + 'Foot', new THREE.Vector3(1 / sh.legs, 1, 1 / sh.legs)); }
      if (sh.delts && B[s + 'Shoulder']) B[s + 'Shoulder'].scale.multiplyScalar(sh.delts);
    }
    if (sh.neck && B.Neck) B.Neck.scale.multiply(new THREE.Vector3(sh.neck, 1, sh.neck));
    this.obj.updateMatrixWorld(true);
  }
  /* graft a textured head from another rig onto this body's head bone */
  mountHead(def) {
    const src = THREE.SkeletonUtils.clone(SKIN.src[def.headFrom]); src.updateMatrixWorld(true);
    const sb = {}; src.traverse(o => { if (o.isBone) sb[bname(o)] = o; });
    if (sb.LeftArm.getWorldPosition(new THREE.Vector3()).x < sb.RightArm.getWorldPosition(new THREE.Vector3()).x) { src.rotation.y += Math.PI; src.updateMatrixWorld(true); }
    const hb = sb.Head, hp = hb.getWorldPosition(new THREE.Vector3()), htp = sb.HeadTop_End.getWorldPosition(new THREE.Vector3());
    const myH = this.byName.Head; this.obj.updateMatrixWorld(true); const mp = myH.getWorldPosition(new THREE.Vector3()), mtp = this.byName.HeadTop_End.getWorldPosition(new THREE.Vector3());
    const k = mp.distanceTo(mtp) / hp.distanceTo(htp) * (def.headScale || 1);
    const inv = new THREE.Matrix4().copy(myH.matrixWorld).invert(); const lift = new THREE.Vector3(0, (def.headLift || 0) * mp.distanceTo(mtp), 0);
    const tint = def.skinTint ? lin(def.skinTint) : null; const keep = def.beard ? /Head|Eye|Teeth|Beard/ : /Head$|Eye|Teeth/;
    const v = new THREE.Vector3(), n = new THREE.Vector3(); const head = new THREE.Group(); myH.add(head); this.headGroup = head;
    src.traverse(o => {
      if (!o.isSkinnedMesh || !keep.test(o.name) || /Headwear/.test(o.name)) return;
      const g0 = o.geometry, g = new THREE.BufferGeometry(); const P = g0.attributes.position, N = g0.attributes.normal; const pos = new Float32Array(P.count * 3), nor = new Float32Array(P.count * 3);
      const M = o.matrixWorld, NM = new THREE.Matrix3().getNormalMatrix(M), IR = new THREE.Matrix3().getNormalMatrix(inv);
      for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(M).sub(hp).multiplyScalar(k).add(mp).add(lift).applyMatrix4(inv); pos.set([v.x, v.y, v.z], i * 3); n.fromBufferAttribute(N, i).applyMatrix3(NM).applyMatrix3(IR).normalize(); nor.set([n.x, n.y, n.z], i * 3); }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); if (g0.attributes.uv) g.setAttribute('uv', g0.attributes.uv); if (g0.index) g.setIndex(g0.index);
      const m = o.material.clone(); m.skinning = false; m.morphTargets = false; m.morphNormals = false;
      if (tint && /Head|Body/.test(o.name)) { const base = lin('#d9a58c'); m.color = new THREE.Color(Math.min(1.25, tint.r / base.r), Math.min(1.25, tint.g / base.g), Math.min(1.25, tint.b / base.b)); }
      if (/Head/.test(o.name)) { m.roughness = 0.55; this.headMat = m; }
      const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true; head.add(mesh);
    });
    this.headSize = mp.distanceTo(mtp);
    if (def.hairStyle && def.hairStyle !== 'bald') this.growHair(def);
  }
  /* short hair as a shell offset from the scalp of the grafted head */
  growHair(def) {
    const headMesh = this.headGroup.children.find(m => m.material === this.headMat); if (!headMesh) return;
    const g = headMesh.geometry, P = g.attributes.position, N = g.attributes.normal; let minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
    for (let i = 0; i < P.count; i++) { minY = Math.min(minY, P.getY(i)); maxY = Math.max(maxY, P.getY(i)); minZ = Math.min(minZ, P.getZ(i)); maxZ = Math.max(maxZ, P.getZ(i)); }
    const H = maxY - minY, D = maxZ - minZ; const st = def.hairStyle;
    const thick = (st === 'buzz' ? 0.012 : st === 'mohawk' ? 0.01 : 0.032) * H;
    const front = minY + H * (st === 'buzz' ? 0.8 : 0.76), back = minY + H * (st === 'long' || st === 'ponytail' || st === 'bun' ? 0.3 : 0.5);
    const pos = [], nor = [], keepIdx = new Int32Array(P.count).fill(-1); let k = 0; const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); n.fromBufferAttribute(N, i); const fz = clamp((v.z - minZ) / D, 0, 1); const line = lerp(back, front, smooth(clamp((fz - 0.35) / 0.45, 0, 1)));
      if (v.y < line || n.y < -0.4) continue; if (st === 'mohawk' && Math.abs(v.x) > H * 0.07) continue;
      const lift = thick * smooth(clamp((v.y - line) / (H * 0.06), 0, 1)) * (st === 'mohawk' ? 4 : 1);
      keepIdx[i] = k++; pos.push(v.x + n.x * lift, v.y + n.y * lift, v.z + n.z * lift); nor.push(n.x, n.y, n.z);
    }
    const idx = g.index.array, tri = []; for (let f = 0; f < idx.length; f += 3) { const a = keepIdx[idx[f]], b = keepIdx[idx[f + 1]], c = keepIdx[idx[f + 2]]; if (a >= 0 && b >= 0 && c >= 0) tri.push(a, b, c); }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); hg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); hg.setIndex(tri);
    const hm = new THREE.MeshStandardMaterial({ color: lin(def.hair), roughness: 0.75, metalness: 0, normalMap: hairNormal(), normalScale: new THREE.Vector2(1.2, 1.2) });
    if (!hg.attributes.uv) { const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(Math.atan2(pos[i], pos[i + 2]) * 2, pos[i + 1] * 30); hg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); }
    const mesh = new THREE.Mesh(hg, hm); mesh.castShadow = true; this.headGroup.add(mesh);
    if (st === 'ponytail' || st === 'bun') { const t = new THREE.Mesh(st === 'bun' ? new THREE.SphereGeometry(H * 0.12, 14, 10) : new THREE.CylinderGeometry(H * 0.07, H * 0.025, H * 0.9, 12), hm); t.position.set(0, minY + H * (st === 'bun' ? 0.95 : 0.55), minZ - H * 0.05); if (st !== 'bun') t.rotation.x = 0.35; this.headGroup.add(t); }
  }
  dress(def) {
    this.obj.updateMatrixWorld(true);
    if (def.gloves) for (const sd of ['Left', 'Right']) {
      const h = this.byName[sd + 'Hand'], m1 = this.byName[sd + 'HandMiddle1']; if (!h || !m1) continue;
      const hp = h.getWorldPosition(new THREE.Vector3()), mp = m1.getWorldPosition(new THREE.Vector3()); const len = hp.distanceTo(mp);
      const c = hp.clone().lerp(mp, 1.05); const wsc = h.getWorldScale(new THREE.Vector3());
      const gl = new THREE.Mesh(new THREE.SphereGeometry(1, 22, 16), new THREE.MeshStandardMaterial({ color: lin(def.gloves), roughness: 0.32, metalness: 0.05 }));
      gl.position.copy(h.worldToLocal(c)); gl.scale.set(len * 0.95 / wsc.x, len * 1.15 / wsc.y, len * 1.05 / wsc.z); gl.castShadow = true; h.add(gl);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.05, 1, 18), new THREE.MeshStandardMaterial({ color: lin('#f0f0f0'), roughness: 0.6 })); cuff.position.copy(h.worldToLocal(hp.clone().lerp(mp, 0.1))); cuff.scale.set(len * 0.62 / wsc.x, len * 0.6 / wsc.y, len * 0.62 / wsc.z); h.add(cuff);
    }
    if (def.eyeGlow) for (const sd of ['Left', 'Right']) {
      const e = this.byName[sd + 'Eye']; if (!e) continue; const wsc = e.getWorldScale(new THREE.Vector3()); const r = 0.018;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 0.5, 0.15) })); m.scale.set(r / wsc.x, r * 0.55 / wsc.y, r / wsc.z);
      const wp = e.getWorldPosition(new THREE.Vector3()); wp.z += 0.035; m.position.copy(e.worldToLocal(wp)); e.add(m);
    }
  }
  /* repaint a textured model's albedo (used to give one body several looks) */
  recolor(scheme) {
    collectSkinned(this.obj).forEach(mesh => {
      const m = mesh.material; if (!m.map || !m.map.image) return;
      const img = m.map.image; const cv = canvas(img.width, img.height); const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      const id = x.getImageData(0, 0, cv.width, cv.height), d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx, sat = mx ? (mx - mn) / mx : 0;
        let h = 0; if (mx !== mn) { h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h /= 6; if (h < 0) h += 1; }
        const out = scheme(h, sat, v, r, g, b); if (out) { d[i] = out[0] * 255; d[i + 1] = out[1] * 255; d[i + 2] = out[2] * 255; }
      }
      x.putImageData(id, 0, 0); const t = new THREE.CanvasTexture(cv); t.flipY = m.map.flipY; t.encoding = THREE.sRGBEncoding; t.wrapS = m.map.wrapS; t.wrapT = m.map.wrapT;
      const nm = m.clone(); nm.map = t; nm.skinning = true; mesh.material = nm;
    });
  }
  setEmissive(c) {
    if (!this.mats) { this.mats = []; this.obj.traverse(o => { if (o.isMesh && o.visible) for (const m of [].concat(o.material)) if (m.emissive) this.mats.push([m, m.emissive.clone()]); }); if (this.headGroup) this.headGroup.traverse(o => { if (o.isMesh && o.material.emissive) this.mats.push([o.material, o.material.emissive.clone()]); }); }
    for (const [m, base] of this.mats) m.emissive.copy(c ? base.clone().add(c) : base);
  }
  /* copy the driver pose onto the skinned bones */
  update() {
    const rootQ = this.model.root.getWorldQuaternion(_q2);
    for (const L of this.links) {
      const b = L.b, par = b.parent;
      if (L.d) {
        L.d.getWorldQuaternion(_q).multiply(L.off);
        const pq = par.getWorldQuaternion(new THREE.Quaternion()).invert(); b.quaternion.copy(pq.multiply(_q));
        if (L.hips) { L.d.getWorldPosition(_p); _p.add(this.hipsOff.clone().applyQuaternion(rootQ)); par.worldToLocal(_p); b.position.copy(_p); }
      } else if (L.curl) {
        b.quaternion.copy(L.bind); if (L.thumb) _q.setFromAxisAngle(SKIN.thumbAxis || (SKIN.thumbAxis = new THREE.Vector3(0, 0, 1)), this.fist * L.curl * (SKIN.thumbSign || -1) * L.side); else _q.setFromAxisAngle(SKIN.curlAxis || (SKIN.curlAxis = new THREE.Vector3(0, 0, 1)), this.fist * L.curl * 1.35); b.quaternion.multiply(_q);
      }
      b.updateWorldMatrix(false, false);
    }
  }
}

function collectSkinned(o) { const a = []; o.traverse(x => { if (x.isSkinnedMesh) a.push(x); }); return a; }
/* which outfit piece covers a point on the body */
function outfitRegion(outfit, q) {
  const { n, t, y, x, front, waistY, neckY, kneeY } = q;
  const head = /Head|Neck|Eye/.test(n), hand = /Hand/.test(n), foot = /Foot|Toe/.test(n), fore = /ForeArm/.test(n), upper = /Arm$/.test(n) && !fore, shoulder = /Shoulder/.test(n);
  const torso = /Spine|Hips/.test(n), thigh = /UpLeg/.test(n), shin = /Leg$/.test(n) && !thigh;
  const belt = (torso || thigh) && Math.abs(y - waistY) < 0.013;
  if (head) return y > neckY + 0.012 || !(outfit === 'gi' || outfit === 'jacket') ? 'skin' : 'top';
  if (outfit === 'gi') {
    if (hand || foot) return 'skin'; if (fore) return t > 0.5 ? 'skin' : 'top'; if (belt) return 'belt';
    if (torso && front && y > neckY - 0.085 && x < (y - (neckY - 0.085)) * 0.55) return 'skin';
    if (shin) return t > 0.88 ? 'skin' : 'pants'; if (thigh || (torso && y < waistY)) return 'pants'; return 'top';
  }
  if (outfit === 'tank') {
    if (hand || fore || upper) return 'skin'; if (foot) return 'shoes'; if (shoulder) return x > 0.075 ? 'skin' : 'top';
    if (torso && y > neckY - 0.035) return 'skin'; if (torso && y >= waistY) return 'top'; if (belt) return 'belt'; return shin && t > 0.9 ? 'shoes' : 'pants';
  }
  if (outfit === 'trunks') {
    if (hand) return 'gloves'; if (foot || (shin && t > 0.78)) return 'shoes';
    if (torso && y >= waistY + 0.01) return 'skin'; if (torso && y >= waistY - 0.015) return 'band';
    if (torso || (thigh && t < 0.42)) return 'pants'; return 'skin';
  }
  if (outfit === 'shirtless') {
    if (hand || fore || upper || shoulder || head) return shin ? 'pants' : 'skin'; if (foot) return 'skin';
    if (torso && y >= waistY + 0.01) return 'skin'; if (torso && y >= waistY - 0.012) return 'belt'; if (shin && t > 0.86) return 'wraps'; return 'pants';
  }
  if (outfit === 'jacket') {
    if (hand) return 'skin'; if (foot) return 'shoes'; if (belt) return 'belt'; if (fore && t > 0.82) return 'trim';
    if (torso && front && x < 0.008 && y > waistY) return 'trim';
    if (torso && y >= waistY || upper || fore || shoulder) return 'top'; return 'pants';
  }
  return 'top';
}

let HAIRN = null;
function hairNormal() {
  if (HAIRN) return HAIRN;
  HAIRN = surface(128, (u, v, o, x, y) => { const st = Math.sin(u * Math.PI * 2 * 40 + fbm(u * 4, v * 4, 3, 4, 3) * 8) * 0.5 + 0.5; o[0] = o[1] = o[2] = 128; o[3] = st * 0.8 + hash2(x, y, 4) * 0.2; o[4] = 0.8; }, { bump: 3 }).normalMap; HAIRN.repeat.set(2, 2); return HAIRN;
}

/* texture recolor schemes: return [r,g,b] in 0..1, or null to keep the pixel */
const RECOLOR = {
  mei(h, s, v) {
    if ((h < 0.035 || h > 0.95) && s > 0.62 && v > 0.42) return [v * 0.78, v * 0.06, v * 0.08];          // red outfit -> crimson
    if (h > 0.1 && h < 0.2 && s > 0.4 && v > 0.4) { const k = 0.08 + v * 0.1; return [k, k, k * 1.1]; }   // yellow pants -> black
    if (h > 0.45 && h < 0.58 && s > 0.35) return [0.85 * v + 0.1, 0.65 * v + 0.05, 0.2 * v];              // cyan trims -> gold
    if (h >= 0.01 && h < 0.11 && s > 0.2 && s < 0.85 && v > 0.07 && v < 0.75) { const k = Math.min(1.25, 0.45 + v * 1.25); return [Math.min(1, 0.94 * k), Math.min(1, 0.78 * k), Math.min(1, 0.66 * k)]; } // skin -> lighter
    return null;
  },
};

const M_SHAPE = { chest: 1.16, waist: 1.08, hips: 0.82, arms: 1.15, legs: 0.9, neck: 0.95 };
const LOOKS = {
  kazuma: { skinModel: 'xbot', headFrom: 'rpm', hairStyle: 'short', shape: M_SHAPE },
  viktor: { skinModel: 'xbot', headFrom: 'rpm', hairStyle: 'buzz', beard: true, headScale: 1.42, shape: { chest: 1.26, waist: 1.18, hips: 0.86, arms: 1.25, legs: 0.98, neck: 1.05 } },
  lena: { skinModel: 'michelle' },
  marcus: { skinModel: 'xbot', headFrom: 'rpm', hairStyle: 'bald', gloves: '#c8202a', shape: { chest: 1.2, waist: 1.06, hips: 0.8, arms: 1.18, legs: 0.9, neck: 1.0 } },
  mei: { skinModel: 'michelle', recolor: 'mei' },
  rafael: { skinModel: 'xbot', headFrom: 'rpm', hairStyle: 'short', shape: M_SHAPE },
  kurogane: { skinModel: 'xbot', eyeGlow: true, shape: { chest: 1.24, waist: 1.12, hips: 0.86, arms: 1.22, legs: 1.0 } },
};
function lookFor(def) {
  const L = LOOKS[def.id]; if (!L || !SKIN.ready || !SKIN.src[L.skinModel]) return null;
  const o = Object.assign({}, def, { headScale: 1.45, headLift: -0.1, skinTint: def.skin, gloves: null }, L);
  if (L.skinModel === 'xbot') o.paint = { top: def.top, pants: def.pants, belt: def.belt || '#151515', shoes: def.shoes || '#222', gloves: def.gloves || '#c22', band: '#eeeeee', wraps: '#e6dccb', trim: def.belt || '#e8b84a' };
  if (L.headFrom && !SKIN.src[L.headFrom]) { o.headFrom = null; }
  return o;
}
