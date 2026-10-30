/* ============ procedural humanoid rig ============ */
const JOINTS = ['hips','spine','chest','neck','lSh','lEl','rSh','rEl','lHip','lKnee','rHip','rKnee','lAnk','rAnk'];
const HIPS_Y = 0.98;

function lin(c) { return new THREE.Color(c).convertSRGBToLinear(); }
function stdMat(color, rough, metal, extra) {
  return new THREE.MeshStandardMaterial(Object.assign({ color: lin(color), roughness: rough, metalness: metal || 0 }, extra || {}));
}
function shadowed(m) { m.castShadow = true; m.receiveShadow = true; return m; }

/* organic limb: lathe profile [[t along length, radius factor]], hangs down -y from the joint */
function lathe(len, r, prof, seg) {
  const pts = []; const P = prof.slice().reverse();
  pts.push(new THREE.Vector2(0.0001, -len * P[0][0] - r * 0.25));
  for (const [t, k] of P) pts.push(new THREE.Vector2(r * k, -len * t));
  pts.push(new THREE.Vector2(0.0001, r * 0.25));
  return new THREE.LatheGeometry(pts, seg || 18);
}
const PROF = {
  upperArm: [[0, 0.95], [0.12, 1.0], [0.38, 1.12], [0.62, 1.0], [0.88, 0.8], [1, 0.74]],
  foreArm: [[0, 0.82], [0.2, 0.98], [0.42, 0.9], [0.8, 0.64], [1, 0.56]],
  thigh: [[0, 1.05], [0.15, 1.12], [0.45, 1.02], [0.8, 0.8], [1, 0.72]],
  calf: [[0, 0.74], [0.22, 0.9], [0.4, 0.84], [0.75, 0.56], [1, 0.46]],
};
function limbSeg(r, len, prof, mat, parent, pos, zs) {
  const g = new THREE.Group(); g.position.set(pos[0], pos[1], pos[2]); parent.add(g);
  const m = shadowed(new THREE.Mesh(lathe(len, r, prof), mat)); if (zs) m.scale.z = zs; g.add(m);
  const j = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r * prof[prof.length - 1][1] * 1.02, 14, 10), mat)); j.position.y = -len; g.add(j);
  return g;
}
let CLOTH = null;
function clothNormal() {
  if (CLOTH) return CLOTH;
  CLOTH = surface(128, (u, v, o, x, y) => { const w = (Math.sin(x * Math.PI / 2) * Math.sin(y * Math.PI / 2)); const n = fbm(u * 8, v * 8, 3, 8, 91); o[0] = o[1] = o[2] = 200; o[3] = w * 0.25 + n * 0.6; o[4] = 0.9; }, { bump: 1.5 }).normalMap;
  CLOTH.repeat.set(6, 6); return CLOTH;
}
class FighterModel {
  constructor(def) {
    this.def = def;
    const root = new THREE.Group(); this.root = root; this.dangles = []; this.lids = [];
    const scaleG = new THREE.Group(); scaleG.scale.setScalar(def.height || 1); root.add(scaleG); this.scaleG = scaleG;
    const J = this.joints = {};
    const b = def.build || {};
    const sh = b.shoulder || 0.2, chestR = b.chest || 0.19, armR = b.arm || 0.065, legR = b.leg || 0.09;
    const skin = this.skin = def.skinMetal ? stdMat(def.skin, 0.26, 0.9, { envMapIntensity: 2.2 }) : stdMat(def.skin, 0.55, 0);
    const topMat = stdMat(def.top, def.topRough || 0.85, 0);
    const pantsMat = stdMat(def.pants, 0.9, 0);
    const shoeMat = stdMat(def.shoes || '#1a1a1a', 0.6, 0.1);
    const hairMat = stdMat(def.hair, 0.75, 0);
    const gloveMat = def.gloves ? stdMat(def.gloves, 0.45, 0.05) : null;
    const dark = stdMat('#1a1410', 0.5, 0);
    const outfit = def.outfit || 'gi';
    const torsoMat = outfit === 'shirtless' ? skin : topMat;
    const sleeveMat = (outfit === 'gi' || outfit === 'jacket') ? topMat : skin;
    const foreMat = outfit === 'gi' ? topMat : skin;
    const shinMat = outfit === 'trunks' ? skin : pantsMat;
    const handMat = gloveMat || skin;

    const cn = clothNormal();
    const topMat2 = topMat.clone(); topMat2.side = THREE.DoubleSide; const pantsMat2 = pantsMat.clone(); pantsMat2.side = THREE.DoubleSide;
    for (const m of [topMat, pantsMat, topMat2, pantsMat2]) { m.normalMap = cn; m.normalScale = new THREE.Vector2(0.6, 0.6); }
    skin.emissive = lin(def.skin).multiplyScalar(def.skinMetal ? 0 : 0.035);
    // hips / pelvis
    const hips = new THREE.Group(); hips.position.y = HIPS_Y; scaleG.add(hips); J.hips = hips;
    const pelvis = shadowed(new THREE.Mesh(lathe(0.2, 0.17, [[0, 0.9], [0.4, 1.0], [0.8, 0.85], [1, 0.5]], 20), pantsMat)); pelvis.position.y = 0.1; pelvis.scale.set(1.08, 1, 0.78); hips.add(pelvis);
    if (outfit === 'gi' || outfit === 'jacket') { const belt = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.05, 24, 1, true), stdMat(def.belt || '#111', 0.7, 0))); belt.position.y = 0.09; belt.scale.z = 0.8; hips.add(belt);
      if (outfit === 'gi') { for (const sx of [-1, 1]) { const tail = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.012), belt.material)); this.dangle(hips, [sx * 0.035, 0.08, 0.135], tail, 0.2, -0.05, sx * 0.15, 0.1); } } }
    if (outfit === 'trunks') { const band = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.06, 24, 1, true), stdMat('#f2f2f2', 0.6))); band.position.y = 0.1; band.scale.z = 0.8; hips.add(band); }
    // abdomen (spine joint)
    const spine = new THREE.Group(); spine.position.y = 0.1; hips.add(spine); J.spine = spine;
    const abd = shadowed(new THREE.Mesh(lathe(0.3, chestR, [[0, 0.86], [0.5, 0.8], [1, 0.84]], 20), torsoMat)); abd.rotation.x = Math.PI; abd.position.y = 0; abd.scale.set(1, 1, 0.72); spine.add(abd);
    // chest (shaped ribcage, shoulders, traps)
    const chest = new THREE.Group(); chest.position.y = 0.28; spine.add(chest); J.chest = chest;
    const chestM = shadowed(new THREE.Mesh(lathe(0.36, chestR, [[0, 0.84], [0.25, 0.98], [0.55, 1.06], [0.78, 1.02], [0.92, 0.75], [1, 0.38]], 22), torsoMat)); chestM.rotation.x = Math.PI; chestM.scale.set(1.08, 1, 0.66); chest.add(chestM);
    const traps = shadowed(new THREE.Mesh(new THREE.SphereGeometry(chestR * 0.62, 16, 10), torsoMat)); traps.scale.set(1.7, 0.55, 0.9); traps.position.set(0, 0.31, -0.02); chest.add(traps);
    if (outfit === 'shirtless' || outfit === 'trunks') {
      for (const sx of [-1, 1]) { const pec = shadowed(new THREE.Mesh(new THREE.SphereGeometry(chestR * 0.46, 14, 10), skin)); pec.scale.set(1.15, 0.72, 0.42); pec.position.set(sx * chestR * 0.45, 0.2, chestR * 0.56); chest.add(pec); }
      for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { const ab = new THREE.Mesh(new THREE.SphereGeometry(0.034, 10, 8), skin); ab.scale.set(1.1, 0.8, 0.45); ab.position.set(sx * 0.038, 0.05 + i * 0.075, chestR * 0.62); spine.add(ab); }
    }
    if (def.female) { pelvis.scale.set(1.2, 1, 0.84); for (const sx of [-1, 1]) { const bu = shadowed(new THREE.Mesh(new THREE.SphereGeometry(chestR * 0.34, 16, 12), outfit === 'tank' || outfit === 'jacket' ? topMat : skin)); bu.scale.set(1.1, 0.85, 0.42); bu.position.set(sx * chestR * 0.4, 0.18, chestR * 0.5); chest.add(bu); } chestM.scale.x = 1.0; }
    if (outfit === 'tank') { const tank = shadowed(new THREE.Mesh(lathe(0.32, chestR * 1.03, [[0, 0.86], [0.3, 0.99], [0.6, 1.05], [0.85, 1.0], [1, 0.9]], 22), topMat)); tank.rotation.x = Math.PI; tank.scale.set(1.08, 1, 0.68); chest.add(tank); const tAbd = shadowed(new THREE.Mesh(lathe(0.3, chestR * 1.03, [[0, 0.86], [0.5, 0.81], [1, 0.85]], 20), topMat)); tAbd.rotation.x = Math.PI; tAbd.scale.set(1, 1, 0.73); spine.add(tAbd); }
    if (outfit === 'gi') { const lap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.012), stdMat('#d8d2c6', 0.9)); for (const sx of [-1, 1]) { const l = lap.clone(); l.position.set(sx * 0.045, 0.2, chestR * 0.665); l.rotation.z = -sx * 0.4; chest.add(l); } const vn = new THREE.Mesh(new THREE.CircleGeometry(0.045, 3), skin); vn.position.set(0, 0.27, chestR * 0.655 + 0.002); vn.rotation.z = -Math.PI / 2; vn.scale.set(1.9, 1.0, 1); chest.add(vn); }
    if (outfit === 'jacket') { const coll = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.07, 16, 1, true), topMat)); coll.position.y = 0.34; chest.add(coll); for (let i = 0; i < 4; i++) { const k = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), stdMat(def.belt || '#e8b84a', 0.3, 0.8)); k.position.set(0.02, 0.05 + i * 0.07, chestR * 0.69); chest.add(k); } }
    // neck + head
    const neck = new THREE.Group(); neck.position.y = 0.33; chest.add(neck); J.neck = neck;
    const neckM = shadowed(new THREE.Mesh(lathe(0.12, 0.058, [[0, 1.0], [0.5, 0.92], [1, 1.12]]), skin)); neckM.rotation.x = Math.PI; neckM.position.y = -0.02; neck.add(neckM);
    const head = new THREE.Group(); head.position.y = 0.1; neck.add(head); this.head = head;
    // skull + face: a jaw lathe under a cranium
    const skull = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.112, 28, 20), skin)); skull.scale.set(0.9, 1.0, 1.04); skull.position.set(0, 0.12, -0.008); head.add(skull);
    const face = shadowed(new THREE.Mesh(lathe(0.13, 0.098, [[0, 0.92], [0.35, 0.95], [0.7, 0.8], [0.92, 0.55], [1, 0.32]], 24), skin)); face.position.set(0, 0.125, 0.012); face.scale.set(0.9, 1, 0.98); head.add(face);
    const chin = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), skin)); chin.scale.set(1.25, 0.7, 0.8); chin.position.set(0, 0.018, 0.068); head.add(chin);
    const browR = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 10), skin); browR.rotation.z = Math.PI / 2; browR.position.set(0, 0.148, 0.092); head.add(browR);
    // face
    const eyeW = def.eyeGlow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.4, 0.15) }) : stdMat('#ece6dc', 0.25, 0); const iris = def.eyeGlow ? eyeW : stdMat(def.eyes || '#2a1a0c', 0.15, 0.1);
    for (const sx of [-1, 1]) {
      const sock = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), stdMat(def.skin, 0.7)); sock.material.color.multiplyScalar(0.6); sock.scale.set(1.3, 0.8, 0.5); sock.position.set(sx * 0.037, 0.126, 0.086); head.add(sock);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 12, 10), eyeW); e.position.set(sx * 0.037, 0.124, 0.088); head.add(e);
      const i = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 10, 8), iris); i.position.set(sx * 0.037, 0.124, 0.1005); head.add(i);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), skin); lid.position.copy(e.position); lid.rotation.x = 0.35; head.add(lid); this.lids.push(lid);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.014), hairMat); brow.position.set(sx * 0.039, 0.148, 0.1); brow.rotation.z = sx * -0.12; head.add(brow);
      const ear = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), skin)); ear.scale.set(0.42, 1, 0.75); ear.position.set(sx * 0.1, 0.112, -0.005); head.add(ear);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), skin); cheek.scale.set(1, 0.7, 0.5); cheek.position.set(sx * 0.05, 0.095, 0.07); head.add(cheek);
    }
    const nose = shadowed(new THREE.Mesh(lathe(0.05, 0.014, [[0, 0.5], [0.6, 0.9], [1, 1.3]], 10), skin)); nose.position.set(0, 0.135, 0.103); nose.rotation.x = -0.18; head.add(nose);
    const nostr = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), skin); nostr.scale.set(1.3, 0.75, 0.9); nostr.position.set(0, 0.083, 0.106); head.add(nostr);
    const lipM = stdMat(def.lips || '#9a5a4e', 0.45, 0);
    const lipU = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 8), lipM); lipU.scale.set(1.45, 0.3, 0.45); lipU.position.set(0, 0.058, 0.094); head.add(lipU);
    const lipL = lipU.clone(); lipL.scale.set(1.3, 0.36, 0.45); lipL.position.set(0, 0.049, 0.091); head.add(lipL);
    if (def.beard) { const bd = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), hairMat)); bd.scale.set(1.15, 0.9, 1.05); bd.position.set(0, 0.06, 0.03); head.add(bd); }
    this.addHair(head, def.hairStyle || 'short', hairMat);
    if (def.headband) { const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.104, 0.028, 24, 1, true), stdMat(def.headband, 0.8, 0)); hb.position.set(0, 0.178, -0.005); hb.scale.set(0.93, 1, 1.07); head.add(hb); for (const k of [0, 1]) { const tail = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.2, 0.006), hb.material); this.dangle(head, [0.01 + k * 0.02, 0.178, -0.115], tail, 0.2, 0.5, 0.15 + k * 0.12, 0.09); } }

    // arms
    for (const side of ['l', 'r']) {
      const sx = side === 'l' ? 1 : -1;
      const shG = limbSeg(armR, 0.29, PROF.upperArm, sleeveMat, chest, [sx * sh, 0.27, 0], 0.92); J[side + 'Sh'] = shG;
      const delt = shadowed(new THREE.Mesh(new THREE.SphereGeometry(armR * 1.38, 14, 12), sleeveMat)); delt.scale.set(1, 0.95, 1.05); delt.position.set(sx * 0.008, -0.01, 0); shG.add(delt);
      if (outfit === 'gi') { const cuff = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(armR * 1.05, armR * 1.25, 0.12, 16, 1, true), topMat2)); cuff.position.y = -0.24; shG.add(cuff); }
      const elG = limbSeg(armR * 0.9, 0.26, PROF.foreArm, foreMat, shG, [0, -0.29, 0]); J[side + 'El'] = elG;
      if (outfit === 'gi') { const sl = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(armR * 1.0, armR * 1.12, 0.16, 16, 1, true), topMat2)); sl.position.y = -0.07; elG.add(sl); for (const c of elG.children) if (c.isMesh && c !== sl) c.material = skin; }
      const hand = new THREE.Group(); hand.position.y = -0.26; elG.add(hand); this[side + 'Hand'] = hand;
      if (gloveMat) { const gl = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.072, 16, 12), gloveMat)); gl.scale.set(0.9, 1.08, 1.12); gl.position.set(0, -0.045, 0.01); hand.add(gl); const cuffG = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.08, 14), gloveMat)); cuffG.position.y = 0.01; hand.add(cuffG); }
      else {
        const fist = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.046, 16, 12), handMat)); fist.scale.set(0.95, 1.12, 1.05); fist.position.set(0, -0.05, 0.004); hand.add(fist);
        const fingers = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.078, 12), handMat)); fingers.rotation.z = Math.PI / 2; fingers.position.set(0, -0.078, 0.022); hand.add(fingers);
        const thumb = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), handMat)); thumb.scale.set(1, 1.6, 1); thumb.position.set(sx * -0.032, -0.06, 0.03); thumb.rotation.z = sx * 0.5; hand.add(thumb);
        if (def.wraps) { const wr = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.06, 12), stdMat(def.wraps, 0.85))); wr.position.y = 0.0; hand.add(wr); }
      }
    }
    // legs
    for (const side of ['l', 'r']) {
      const sx = side === 'l' ? 1 : -1;
      const baggy = outfit === 'gi' || outfit === 'jacket' ? 1.18 : 1;
      const hipG = limbSeg(legR * baggy, 0.44, PROF.thigh, pantsMat, hips, [sx * 0.095, -0.02, 0], 0.95); J[side + 'Hip'] = hipG;
      const kneeG = limbSeg(legR * (outfit === 'trunks' ? 0.92 : baggy), 0.43, outfit === 'trunks' ? PROF.calf : (baggy > 1 ? [[0, 0.78], [0.3, 0.82], [0.7, 0.72], [1, 0.62]] : PROF.calf), shinMat, hipG, [0, -0.44, 0]); J[side + 'Knee'] = kneeG;
      if (outfit === 'trunks') { const tr = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(legR * 1.2, legR * 1.32, 0.24, 16, 1, true), pantsMat2)); tr.position.y = -0.09; hipG.add(tr); }
      const ank = new THREE.Group(); ank.position.y = -0.43; kneeG.add(ank); J[side + 'Ank'] = ank; this[side + 'Foot'] = ank;
      const footMat = outfit === 'gi' ? skin : shoeMat;
      const foot = shadowed(new THREE.Mesh(lathe(0.22, 0.05, [[0, 0.75], [0.3, 1.0], [0.75, 1.0], [1, 0.75]], 14), footMat)); foot.rotation.x = -Math.PI / 2; foot.position.set(0, -0.042, -0.05); foot.scale.set(1.05, 1, 0.75); ank.add(foot);
      const toe = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), footMat)); toe.scale.set(1.05, 0.62, 1.15); toe.position.set(0, -0.05, 0.17); ank.add(toe);
      if (outfit !== 'gi' && outfit !== 'trunks') { const sole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.3), stdMat('#e8e4dc', 0.8)); sole.position.set(0, -0.078, 0.06); ank.add(sole); }
      if (outfit === 'trunks') { const sh = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.14, 12), shoeMat)); sh.position.y = -0.02; ank.add(sh); }
    }
    // rage glow light
    this.rageLight = new THREE.PointLight(0xff2a10, 0, 3.5, 2); this.rageLight.position.set(0, 1.1, 0); root.add(this.rageLight);
    this.cur = {}; for (const j of JOINTS) this.cur[j] = [0, 0, 0]; this.curHy = 0;
    this.setPose(STANCE, 1);
    // swap the primitive body for a skinned character when the models are loaded
    const look = typeof lookFor === 'function' ? lookFor(def) : null;
    if (look) { try { root.updateMatrixWorld(true); const hide = []; root.traverse(o => { if (o.isMesh) hide.push(o); }); this.body = new SkinBody(this, look); for (const o of hide) o.visible = false; this.body.update(); } catch (e) { console.warn('skin body failed', e); this.body = null; } }
  }
  addHair(head, style, mat) {
    const cap = (theta, y, s) => { const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 16, 0, Math.PI * 2, 0, theta), mat)); m.position.set(0, y + 0.015, -0.012); m.rotation.x = -0.42; m.scale.set(s[0] * 0.98, s[1], s[2] * 1.02); head.add(m); return m; };
    if (style === 'bald') return;
    if (style === 'buzz') { cap(Math.PI * 0.5, 0.1, [0.92, 1.1, 1]); return; }
    if (style === 'short') { cap(Math.PI * 0.58, 0.1, [0.95, 1.12, 1.02]); return; }
    if (style === 'swept') { const c = cap(Math.PI * 0.62, 0.105, [0.98, 1.15, 1.06]); c.rotation.x = -0.25; return; }
    if (style === 'ponytail') { cap(Math.PI * 0.6, 0.1, [0.95, 1.12, 1.02]); const t = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.012, 0.34, 10), mat)); this.dangle(head, [0, 0.17, -0.11], t, 0.34, 0.45, 0, 0.07); const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat); knot.position.set(0, 0.17, -0.1); head.add(knot); return; }
    if (style === 'long') { cap(Math.PI * 0.85, 0.1, [0.98, 1.2, 1.05]); const back = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.07, 0.3, 12, 1, true), mat)); back.position.set(0, -0.05, -0.04); head.add(back); return; }
    if (style === 'mohawk') { cap(Math.PI * 0.4, 0.1, [0.9, 1.05, 1]); const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.22), mat)); m.position.set(0, 0.235, -0.01); head.add(m); return; }
    if (style === 'bun') { cap(Math.PI * 0.58, 0.1, [0.95, 1.12, 1.02]); const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), mat); knot.position.set(0, 0.2, -0.06); head.add(knot); return; }
    cap(Math.PI * 0.58, 0.1, [0.95, 1.12, 1.02]);
  }
  /* move joints toward a pose. k = smoothing per frame (1 = snap) */
  setPose(pose, k) {
    for (const j of JOINTS) {
      const t = pose[j] || ZERO3, c = this.cur[j];
      c[0] += wrapDeg(t[0] - c[0]) * k; c[1] += wrapDeg(t[1] - c[1]) * k; c[2] += wrapDeg(t[2] - c[2]) * k;
      this.joints[j].rotation.set(rad(c[0]), rad(c[1]), rad(c[2]));
    }
    this.curHy += ((pose.hy || 0) - this.curHy) * k;
    this.joints.hips.position.y = HIPS_Y + this.curHy;
    if (pose.hx !== undefined) this.joints.hips.position.z += ((pose.hx || 0) - this.joints.hips.position.z) * k; else this.joints.hips.position.z *= (1 - k);
  }
  setRage(on, t, heat) {
    if (!this.baseEm) this.baseEm = this.skin.emissive.clone();
    this.rageLight.intensity = on ? 1.2 + Math.sin(t * 0.25) * 0.5 : heat ? 1.6 + Math.sin(t * 0.4) * 0.6 : 0;
    this.rageLight.color.setRGB(heat && !on ? 1 : 1, heat && !on ? 0.45 : 0.16, heat && !on ? 0.1 : 0.06);
    if (on) { const e = 0.35 + Math.sin(t * 0.25) * 0.15; this.skin.emissive.setRGB(e, e * 0.15, 0); }
    else if (heat) { const e = 0.12 + Math.sin(t * 0.4) * 0.05; this.skin.emissive.setRGB(e * 1.2, e * 0.55, e * 0.15); }
    else this.skin.emissive.copy(this.baseEm);
    if (this.body) this.body.setEmissive(on || heat ? this.skin.emissive : null);
  }
  /* a swinging piece (hair, cloth tail) hung from a pivot */
  dangle(parent, pos, mesh, len, bx, bz, stiff) { const piv = new THREE.Group(); piv.position.set(pos[0], pos[1], pos[2]); parent.add(piv); mesh.position.y = -len / 2; piv.add(mesh); this.dangles.push({ piv, rx: bx, rz: bz || 0, vx: 0, vz: 0, bx, bz: bz || 0, k: stiff || 0.1, last: null }); return piv; }
  updateSecondary(face) {
    const c = Math.cos(face), s = Math.sin(face);
    for (const d of this.dangles) {
      const wp = d.piv.getWorldPosition(new THREE.Vector3());
      if (d.last) { const vx = wp.x - d.last.x, vy = wp.y - d.last.y, vz = wp.z - d.last.z; const lx = vx * c - vz * s, lz = vx * s + vz * c;
        const tx = clamp(d.bx + lz * 22 - vy * 14, -1.4, 2.2), tz = clamp(d.bz - lx * 22, -1.3, 1.3);
        d.vx += (tx - d.rx) * d.k; d.vz += (tz - d.rz) * d.k; d.vx *= 0.84; d.vz *= 0.84; d.rx += d.vx; d.rz += d.vz; }
      d.last = wp; d.piv.rotation.set(d.rx, 0, d.rz);
    }
  }
  setBlink(a) { for (const l of this.lids) l.rotation.x = 0.35 + a * 1.15; }
  worldPos(group, out) { return group.getWorldPosition(out || new THREE.Vector3()); }
}
const ZERO3 = [0, 0, 0];

/* ============ poses (degrees) ============ */
const STANCE = {
  hy: -0.05, hips: [0, -30, 0], spine: [6, 8, 0], chest: [3, 6, 0], neck: [-3, 16, 0],
  lSh: [-42, -12, -14], lEl: [-118, 0, 0], rSh: [-32, 6, 14], rEl: [-122, 0, 0],
  lHip: [-14, 0, 6], lKnee: [18, 0, 0], lAnk: [-4, 0, 0], rHip: [8, 0, -6], rKnee: [14, 0, 0], rAnk: [-22, 0, 0],
};
const P = (o) => Object.assign({}, STANCE, o);   // full pose from overrides
const POSES = {
  stance: STANCE,
  crouch: P({ hy: -0.5, hips: [14, -30, 0], spine: [16, 8, 0], neck: [-12, 16, 0], lHip: [-92, 0, 12], lKnee: [116, 0, 0], lAnk: [-24, 0, 0], rHip: [-90, 0, -14], rKnee: [118, 0, 0], rAnk: [-28, 0, 0], lSh: [-38, -10, -10], lEl: [-120, 0, 0], rSh: [-30, 5, 10], rEl: [-125, 0, 0] }),
  block: P({ hy: -0.08, spine: [10, 8, 0], neck: [-8, 16, 0], lSh: [-62, -8, -30], lEl: [-125, 0, 0], rSh: [-55, 6, 34], rEl: [-130, 0, 0] }),
  blockLow: P({ hy: -0.5, hips: [14, -30, 0], spine: [16, 8, 0], lHip: [-92, 0, 12], lKnee: [116, 0, 0], lAnk: [-24, 0, 0], rHip: [-90, 0, -14], rKnee: [118, 0, 0], rAnk: [-28, 0, 0], lSh: [-30, -8, -22], lEl: [-70, 0, 0], rSh: [-24, 6, 26], rEl: [-75, 0, 0] }),
  jump: P({ hy: 0, lHip: [-55, 0, 6], lKnee: [70, 0, 0], rHip: [-45, 0, -6], rKnee: [80, 0, 0], lSh: [-70, -10, -10], rSh: [-60, 6, 10], spine: [-4, 8, 0] }),
  hitHigh: P({ hy: -0.03, spine: [-14, 8, 0], chest: [-10, 6, 0], neck: [26, 10, -8], lSh: [-30, -12, -10], rSh: [-20, 6, 20], lEl: [-80, 0, 0], rEl: [-90, 0, 0], lHip: [-10, 0, 6], rHip: [16, 0, -6], rKnee: [20, 0, 0] }),
  hitMid: P({ hy: -0.14, spine: [34, 8, 0], chest: [12, 6, 0], neck: [-22, 16, 0], lSh: [-40, -12, -20], lEl: [-100, 0, 0], rSh: [-50, 6, 30], rEl: [-110, 0, 0], lHip: [-30, 0, 6], lKnee: [40, 0, 0], rHip: [-10, 0, -6], rKnee: [38, 0, 0], rAnk: [-28, 0, 0] }),
  hitLow: P({ hy: -0.22, spine: [20, 8, 0], neck: [-10, 16, 0], lHip: [-40, 0, 14], lKnee: [62, 0, 0], lAnk: [-20, 0, 0], rHip: [-20, 0, -10], rKnee: [52, 0, 0], rAnk: [-30, 0, 0], lSh: [-20, -12, -6], rSh: [-12, 6, 10], lEl: [-70, 0, 0], rEl: [-80, 0, 0] }),
  stagger: P({ hy: -0.08, spine: [-20, 8, 0], neck: [30, 12, 0], lSh: [-50, -10, 40], rSh: [-45, 6, -40], lEl: [-60, 0, 0], rEl: [-60, 0, 0], lHip: [-6, 0, 10], rHip: [20, 0, -10], rKnee: [30, 0, 0] }),
  launched: P({ hy: 0, hips: [-30, -10, 0], spine: [-30, 0, 0], chest: [-16, 0, 0], neck: [20, 0, 0], lSh: [-20, -10, 85], rSh: [-15, 6, -85], lEl: [-40, 0, 0], rEl: [-40, 0, 0], lHip: [-50, 0, 14], lKnee: [40, 0, 0], rHip: [-25, 0, -14], rKnee: [65, 0, 0] }),
  falling: P({ hy: 0, hips: [-60, 0, 0], spine: [-10, 0, 0], neck: [30, 0, 0], lSh: [-40, -10, 70], rSh: [-30, 6, -70], lEl: [-30, 0, 0], rEl: [-30, 0, 0], lHip: [-30, 0, 12], lKnee: [30, 0, 0], rHip: [-15, 0, -12], rKnee: [45, 0, 0] }),
  lying: P({ hy: -(HIPS_Y - 0.19), hips: [-86, 0, 0], spine: [14, 0, 0], chest: [6, 0, 0], neck: [20, 0, 0], lSh: [-14, 0, 62], rSh: [-12, 0, -62], lEl: [-22, 0, 0], rEl: [-26, 0, 0], lHip: [-12, 0, 10], lKnee: [22, 0, 0], lAnk: [-10, 0, 0], rHip: [4, 0, -10], rKnee: [34, 0, 0], rAnk: [-14, 0, 0] }),
  wall: P({ hy: -0.04, spine: [-12, 0, 0], neck: [14, 0, 0], lSh: [-30, 0, 78], rSh: [-30, 0, -78], lEl: [-40, 0, 0], rEl: [-40, 0, 0], lHip: [-20, 0, 16], lKnee: [26, 0, 0], rHip: [-20, 0, -16], rKnee: [26, 0, 0] }),
  win1: P({ hy: -0.02, hips: [0, -10, 0], spine: [-6, 0, 0], neck: [-10, 0, 0], lSh: [-168, 0, 18], lEl: [-20, 0, 0], rSh: [-20, 0, -26], rEl: [-40, 0, 0], lHip: [-6, 0, 8], lKnee: [8, 0, 0], lAnk: [-2, 0, 0], rHip: [-6, 0, -8], rKnee: [8, 0, 0], rAnk: [-2, 0, 0] }),
  win2: P({ hy: -0.1, hips: [0, 0, 0], spine: [46, 0, 0], neck: [-6, 0, 0], lSh: [-10, 0, 4], lEl: [-8, 0, 0], rSh: [-10, 0, -4], rEl: [-8, 0, 0], lHip: [-20, 0, 4], lKnee: [26, 0, 0], lAnk: [-6, 0, 0], rHip: [-20, 0, -4], rKnee: [26, 0, 0], rAnk: [-6, 0, 0] }),
  win3: P({ hy: -0.06, hips: [0, -40, 0], spine: [-4, 10, 0], neck: [0, 30, 0], lSh: [-110, -40, -30], lEl: [-130, 0, 0], rSh: [-70, 0, 40], rEl: [-120, 0, 0], lHip: [-20, 0, 10], lKnee: [20, 0, 0], rHip: [10, 0, -10], rKnee: [16, 0, 0], rAnk: [-26, 0, 0] }),
  win4: P({ hy: -0.04, hips: [0, 0, 0], spine: [-10, 0, 0], neck: [-14, 0, 0], lSh: [-150, 0, 50], rSh: [-150, 0, -50], lEl: [-30, 0, 0], rEl: [-30, 0, 0], lHip: [-4, 0, 14], rHip: [-4, 0, -14], lKnee: [6, 0, 0], rKnee: [6, 0, 0], lAnk: [-2, 0, 0], rAnk: [-2, 0, 0] }),
  intro: P({ hy: -0.03, hips: [0, -10, 0], spine: [2, 0, 0], neck: [-2, 6, 0], lSh: [-10, 0, 8], lEl: [-20, 0, 0], rSh: [-10, 0, -8], rEl: [-20, 0, 0], lHip: [-4, 0, 8], lKnee: [6, 0, 0], lAnk: [0, 0, 0], rHip: [-4, 0, -8], rKnee: [6, 0, 0], rAnk: [0, 0, 0] }),
  dash: P({ hy: -0.1, spine: [18, 8, 0], neck: [-14, 16, 0], lHip: [-50, 0, 6], lKnee: [40, 0, 0], rHip: [30, 0, -6], rKnee: [30, 0, 0], rAnk: [-50, 0, 0] }),
  backdash: P({ hy: -0.06, spine: [-10, 8, 0], neck: [6, 16, 0], lHip: [10, 0, 6], lKnee: [30, 0, 0], rHip: [-30, 0, -6], rKnee: [50, 0, 0], lAnk: [-30, 0, 0] }),
  sidestep: P({ hy: -0.12, lHip: [-20, 0, 34], lKnee: [30, 0, 0], rHip: [0, 0, -34], rKnee: [30, 0, 0], lAnk: [-10, 0, 0], rAnk: [-20, 0, 0] }),
  grab: P({ hy: -0.08, spine: [14, 0, 0], chest: [6, 0, 0], neck: [-12, 0, 0], hips: [0, -8, 0], lSh: [-78, -8, -22], lEl: [-40, 0, 0], rSh: [-78, 8, 22], rEl: [-40, 0, 0], lHip: [-30, 0, 6], lKnee: [30, 0, 0], rHip: [16, 0, -6], rKnee: [18, 0, 0], rAnk: [-30, 0, 0] }),
  grabbed: P({ hy: -0.04, spine: [10, 0, 0], neck: [10, 0, 0], hips: [0, 0, 0], lSh: [-40, 0, 40], rSh: [-40, 0, -40], lEl: [-90, 0, 0], rEl: [-90, 0, 0], lHip: [-10, 0, 10], rHip: [-10, 0, -10], lKnee: [10, 0, 0], rKnee: [10, 0, 0] }),
  lift: P({ hy: 0.1, hips: [-110, 0, 0], spine: [-10, 0, 0], neck: [20, 0, 0], lSh: [-60, 0, 70], rSh: [-60, 0, -70], lEl: [-60, 0, 0], rEl: [-60, 0, 0], lHip: [-20, 0, 12], rHip: [-20, 0, -12], lKnee: [40, 0, 0], rKnee: [40, 0, 0] }),
  slam: P({ hy: -0.1, hips: [0, -60, 0], spine: [40, 0, 0], neck: [-10, 0, 0], lSh: [-20, 0, -10], rSh: [-20, 0, 10], lEl: [-20, 0, 0], rEl: [-20, 0, 0], lHip: [-60, 0, 6], lKnee: [70, 0, 0], rHip: [-20, 0, -6], rKnee: [60, 0, 0], rAnk: [-40, 0, 0] }),
  ko1: P({ hy: -0.3, hips: [-40, 0, 0], spine: [-10, 0, 0], neck: [30, 0, 0], lSh: [-30, 0, 60], rSh: [-30, 0, -60], lEl: [-30, 0, 0], rEl: [-30, 0, 0], lHip: [-40, 0, 12], lKnee: [70, 0, 0], rHip: [-30, 0, -12], rKnee: [70, 0, 0] }),
};
/* keyframe animation: frames [{t, p}], p is a full pose */
function anim(frames, opts) { return Object.assign({ frames: frames.map(f => ({ t: f[0], p: P(f[1]) })) }, opts || {}); }
function sampleAnim(a, f) {
  const fr = a.frames; if (a.loop) f = f % fr[fr.length - 1].t;
  if (f <= fr[0].t) return fr[0].p;
  if (f >= fr[fr.length - 1].t) return fr[fr.length - 1].p;
  let i = 0; while (fr[i + 1].t <= f) i++;
  const a0 = fr[i], a1 = fr[i + 1]; const u = (a.ease || smooth)((f - a0.t) / (a1.t - a0.t));
  return lerpPose(a0.p, a1.p, u);
}
const _lp = {}; for (const j of JOINTS) _lp[j] = [0, 0, 0];
function lerpPose(a, b, u) {
  for (const j of JOINTS) { const x = a[j] || ZERO3, y = b[j] || ZERO3, o = _lp[j]; o[0] = x[0] + (y[0] - x[0]) * u; o[1] = x[1] + (y[1] - x[1]) * u; o[2] = x[2] + (y[2] - x[2]) * u; }
  _lp.hy = (a.hy || 0) + ((b.hy || 0) - (a.hy || 0)) * u; _lp.hx = (a.hx || 0) + ((b.hx || 0) - (a.hx || 0)) * u;
  return _lp;
}

/* ============ attack animations (frame numbers at 60fps) ============ */
const S = STANCE;
const ANIMS = {
  jab: anim([[0, S], [5, { lSh: [-88, -6, -22], lEl: [-6, 0, 0], chest: [4, -26, 0], hips: [0, -20, 0], spine: [8, 0, 0], neck: [-3, 10, 0] }], [9, { lSh: [-92, -4, -24], lEl: [-2, 0, 0], chest: [4, -30, 0], hips: [0, -18, 0], spine: [9, 0, 0], neck: [-3, 8, 0] }], [22, S]]),
  straight: anim([[0, S], [4, { rSh: [-50, 10, 24], rEl: [-110, 0, 0], chest: [4, 0, 0], hips: [0, -30, 0] }], [11, { rSh: [-96, 8, 20], rEl: [-4, 0, 0], chest: [6, 44, 0], hips: [0, 0, 0], spine: [10, 10, 0], neck: [-3, -20, 0], rHip: [20, 0, -6], rAnk: [-40, 0, 0] }], [14, { rSh: [-96, 8, 20], rEl: [-2, 0, 0], chest: [6, 44, 0], hips: [0, 0, 0], spine: [10, 10, 0], neck: [-3, -20, 0], rHip: [20, 0, -6], rAnk: [-40, 0, 0] }], [27, S]]),
  frontKick: anim([[0, S], [7, { lHip: [-85, 0, 6], lKnee: [105, 0, 0], lAnk: [10, 0, 0], spine: [-6, 8, 0], hy: -0.06, rKnee: [16, 0, 0], rAnk: [-22, 0, 0], lSh: [-30, -12, -14], rSh: [-45, 6, 24] }], [13, { lHip: [-92, 0, 2], lKnee: [4, 0, 0], lAnk: [-22, 0, 0], spine: [-12, 8, 0], chest: [-4, 6, 0], hy: -0.04, rKnee: [12, 0, 0], rAnk: [-22, 0, 0], lSh: [-20, -12, -14], rSh: [-50, 6, 26] }], [17, { lHip: [-90, 0, 2], lKnee: [8, 0, 0], lAnk: [-22, 0, 0], spine: [-12, 8, 0], chest: [-4, 6, 0], hy: -0.04, rKnee: [12, 0, 0], rAnk: [-22, 0, 0], lSh: [-20, -12, -14], rSh: [-50, 6, 26] }], [23, { lHip: [-70, 0, 6], lKnee: [100, 0, 0], spine: [-4, 8, 0], hy: -0.06 }], [34, S]]),
  roundhouse: anim([[0, S], [8, { rHip: [-40, 0, -70], rKnee: [112, 0, 0], hips: [0, -60, 0], chest: [0, -24, 0], spine: [-6, 0, 0], hy: -0.08, lKnee: [22, 0, 0], lAnk: [-10, 0, 0], lSh: [-60, -12, -24], rSh: [-30, 6, 60] }], [15, { rHip: [-88, 0, -62], rKnee: [8, 0, 0], rAnk: [-10, 0, 0], hips: [0, -100, 0], chest: [-4, -36, 0], spine: [-10, 0, 0], hy: -0.06, lKnee: [18, 0, 0], lAnk: [-6, 0, 0], lSh: [-70, -12, -30], rSh: [-30, 6, 70] }], [19, { rHip: [-84, 0, -64], rKnee: [14, 0, 0], rAnk: [-10, 0, 0], hips: [0, -108, 0], chest: [-4, -36, 0], spine: [-10, 0, 0], hy: -0.06, lKnee: [18, 0, 0], lSh: [-70, -12, -30], rSh: [-30, 6, 70] }], [27, { rHip: [-40, 0, -50], rKnee: [100, 0, 0], hips: [0, -70, 0], hy: -0.1 }], [38, S]]),
  uppercut: anim([[0, S], [6, { hy: -0.22, spine: [22, 8, 0], chest: [8, 20, 0], hips: [0, -20, 0], rSh: [-10, 10, 30], rEl: [-120, 0, 0], lKnee: [50, 0, 0], rKnee: [50, 0, 0], lHip: [-40, 0, 6], rHip: [-30, 0, -6], lAnk: [-10, 0, 0], rAnk: [-20, 0, 0] }], [13, { hy: 0.02, spine: [-10, 8, 0], chest: [-8, 34, 0], hips: [0, -5, 0], neck: [-6, -10, 0], rSh: [-130, 20, 14], rEl: [-55, 0, 0], lSh: [-40, -12, -14], lKnee: [10, 0, 0], rKnee: [10, 0, 0], lHip: [-10, 0, 6], rHip: [-4, 0, -6], rAnk: [-40, 0, 0], lAnk: [-20, 0, 0] }], [17, { hy: 0.0, spine: [-10, 8, 0], chest: [-8, 34, 0], hips: [0, -5, 0], neck: [-6, -10, 0], rSh: [-134, 20, 14], rEl: [-50, 0, 0], lSh: [-40, -12, -14], lKnee: [12, 0, 0], rKnee: [12, 0, 0], lHip: [-10, 0, 6], rHip: [-4, 0, -6], rAnk: [-40, 0, 0], lAnk: [-20, 0, 0] }], [32, S]]),
  hopkick: anim([[0, S], [5, { hy: -0.28, spine: [20, 8, 0], lHip: [-60, 0, 6], lKnee: [80, 0, 0], rHip: [-50, 0, -6], rKnee: [80, 0, 0], lAnk: [-20, 0, 0], rAnk: [-30, 0, 0] }], [12, { hy: 0.42, spine: [-16, 8, 0], chest: [-6, 10, 0], neck: [6, 10, 0], rHip: [-112, 0, -4], rKnee: [6, 0, 0], rAnk: [-20, 0, 0], lHip: [-50, 0, 10], lKnee: [96, 0, 0], lAnk: [-30, 0, 0], lSh: [-30, -12, -20], rSh: [-60, 6, 40] }], [18, { hy: 0.32, spine: [-16, 8, 0], chest: [-6, 10, 0], rHip: [-104, 0, -4], rKnee: [16, 0, 0], rAnk: [-20, 0, 0], lHip: [-50, 0, 10], lKnee: [96, 0, 0], lSh: [-30, -12, -20], rSh: [-60, 6, 40] }], [26, { hy: -0.16, spine: [14, 8, 0], lHip: [-50, 0, 6], lKnee: [60, 0, 0], rHip: [-40, 0, -6], rKnee: [60, 0, 0], lAnk: [-10, 0, 0], rAnk: [-20, 0, 0] }], [40, S]]),
  lowKick: anim([[0, POSES.crouch], [5, { hy: -0.42, hips: [14, -30, 0], spine: [16, 8, 0], lHip: [-60, 0, 12], lKnee: [100, 0, 0], rHip: [-90, 0, -14], rKnee: [118, 0, 0], rAnk: [-28, 0, 0] }], [10, { hy: -0.44, hips: [10, -40, 0], spine: [20, 8, 0], lHip: [-58, 0, 4], lKnee: [2, 0, 0], lAnk: [-10, 0, 0], rHip: [-95, 0, -14], rKnee: [122, 0, 0], rAnk: [-28, 0, 0] }], [14, { hy: -0.44, hips: [10, -40, 0], spine: [20, 8, 0], lHip: [-56, 0, 4], lKnee: [6, 0, 0], lAnk: [-10, 0, 0], rHip: [-95, 0, -14], rKnee: [122, 0, 0], rAnk: [-28, 0, 0] }], [20, { hy: -0.46, hips: [14, -30, 0], lHip: [-80, 0, 12], lKnee: [100, 0, 0], rHip: [-90, 0, -14], rKnee: [118, 0, 0] }], [30, POSES.crouch]]),
  sweep: anim([[0, POSES.crouch], [6, { hy: -0.5, hips: [16, 20, 0], spine: [20, 0, 0], chest: [4, -20, 0], rHip: [-70, 0, -60], rKnee: [16, 0, 0], rAnk: [-10, 0, 0], lHip: [-100, 0, 14], lKnee: [124, 0, 0], lAnk: [-28, 0, 0], lSh: [-60, -12, -40], rSh: [-30, 6, 30] }], [13, { hy: -0.52, hips: [16, -110, 0], spine: [24, 0, 0], chest: [4, -20, 0], rHip: [-78, 0, -56], rKnee: [4, 0, 0], rAnk: [-10, 0, 0], lHip: [-104, 0, 14], lKnee: [126, 0, 0], lAnk: [-28, 0, 0], lSh: [-70, -12, -40], rSh: [-30, 6, 30] }], [18, { hy: -0.52, hips: [16, -140, 0], spine: [24, 0, 0], chest: [4, -20, 0], rHip: [-78, 0, -56], rKnee: [8, 0, 0], rAnk: [-10, 0, 0], lHip: [-104, 0, 14], lKnee: [126, 0, 0], lAnk: [-28, 0, 0] }], [28, { hy: -0.48, hips: [14, -300, 0], rHip: [-90, 0, -20], rKnee: [100, 0, 0], lHip: [-96, 0, 14], lKnee: [120, 0, 0] }], [38, Object.assign({}, POSES.crouch, { hips: [14, -390, 0] })]]),
  spinKick: anim([[0, S], [8, { hips: [0, -120, 0], chest: [4, -30, 0], spine: [4, 0, 0], neck: [0, 60, 0], hy: -0.08, rHip: [-20, 0, -30], rKnee: [100, 0, 0], lKnee: [24, 0, 0], lAnk: [-10, 0, 0], lSh: [-70, -12, -30], rSh: [-50, 6, 50] }], [17, { hips: [0, -210, 0], chest: [-6, -20, 0], spine: [-14, 0, 0], neck: [10, 50, 0], hy: -0.06, rHip: [-96, 0, -8], rKnee: [4, 0, 0], rAnk: [-20, 0, 0], lKnee: [18, 0, 0], lAnk: [-6, 0, 0], lSh: [-60, -12, -30], rSh: [-60, 6, 50] }], [22, { hips: [0, -226, 0], chest: [-6, -20, 0], spine: [-14, 0, 0], neck: [10, 50, 0], hy: -0.06, rHip: [-92, 0, -8], rKnee: [10, 0, 0], rAnk: [-20, 0, 0], lKnee: [18, 0, 0], lSh: [-60, -12, -30], rSh: [-60, 6, 50] }], [32, { hips: [0, -320, 0], hy: -0.1, rHip: [-30, 0, -20], rKnee: [80, 0, 0] }], [46, Object.assign({}, S, { hips: [0, -390, 0] })]]),
  dashPunch: anim([[0, S], [6, { hy: -0.12, spine: [20, 8, 0], chest: [6, 0, 0], rSh: [-30, 10, 30], rEl: [-120, 0, 0], lHip: [-50, 0, 6], lKnee: [50, 0, 0], rHip: [20, 0, -6], rKnee: [20, 0, 0], rAnk: [-40, 0, 0] }], [15, { hy: -0.1, spine: [18, 10, 0], chest: [6, 46, 0], hips: [0, 4, 0], neck: [-8, -24, 0], rSh: [-100, 10, 16], rEl: [-2, 0, 0], lSh: [-30, -12, -10], lEl: [-110, 0, 0], lHip: [-60, 0, 6], lKnee: [44, 0, 0], rHip: [30, 0, -6], rKnee: [16, 0, 0], rAnk: [-46, 0, 0], lAnk: [-4, 0, 0] }], [19, { hy: -0.1, spine: [18, 10, 0], chest: [6, 46, 0], hips: [0, 4, 0], neck: [-8, -24, 0], rSh: [-100, 10, 16], rEl: [-2, 0, 0], lHip: [-60, 0, 6], lKnee: [44, 0, 0], rHip: [30, 0, -6], rKnee: [16, 0, 0], rAnk: [-46, 0, 0] }], [36, S]]),
  elbow: anim([[0, S], [6, { rSh: [-60, 20, 40], rEl: [-150, 0, 0], chest: [4, -10, 0], hips: [0, -40, 0] }], [13, { rSh: [-100, 10, 36], rEl: [-152, 0, 0], chest: [8, 44, 0], hips: [0, 0, 0], spine: [12, 10, 0], neck: [-4, -20, 0], lHip: [-30, 0, 6], lKnee: [30, 0, 0], rHip: [20, 0, -6], rAnk: [-40, 0, 0], hy: -0.1 }], [17, { rSh: [-100, 10, 36], rEl: [-150, 0, 0], chest: [8, 44, 0], hips: [0, 0, 0], spine: [12, 10, 0], neck: [-4, -20, 0], lHip: [-30, 0, 6], lKnee: [30, 0, 0], rHip: [20, 0, -6], rAnk: [-40, 0, 0], hy: -0.1 }], [30, S]]),
  backfist: anim([[0, S], [8, { hips: [0, -130, 0], chest: [0, -20, 0], neck: [0, 60, 0], rSh: [-70, 0, 0], rEl: [-110, 0, 0], lSh: [-60, -12, -30], hy: -0.08, rKnee: [24, 0, 0], rAnk: [-30, 0, 0] }], [16, { hips: [0, -250, 0], chest: [-6, -10, 0], spine: [4, 0, 0], neck: [0, 40, 0], rSh: [-92, 0, -40], rEl: [-6, 0, 0], lSh: [-60, -12, -30], hy: -0.06, lKnee: [20, 0, 0], rKnee: [20, 0, 0], rAnk: [-20, 0, 0], lAnk: [-10, 0, 0] }], [20, { hips: [0, -270, 0], chest: [-6, -10, 0], spine: [4, 0, 0], neck: [0, 40, 0], rSh: [-92, 0, -40], rEl: [-6, 0, 0], lSh: [-60, -12, -30], hy: -0.06, lKnee: [20, 0, 0], rKnee: [20, 0, 0] }], [40, Object.assign({}, S, { hips: [0, -390, 0] })]]),
  knee: anim([[0, S], [6, { hy: -0.16, spine: [16, 8, 0], lHip: [-40, 0, 6], lKnee: [50, 0, 0], rHip: [10, 0, -6], rKnee: [30, 0, 0], rAnk: [-40, 0, 0] }], [14, { hy: 0.3, spine: [-10, 8, 0], chest: [-6, 6, 0], neck: [4, 16, 0], rHip: [-120, 0, -6], rKnee: [130, 0, 0], rAnk: [-20, 0, 0], lHip: [-30, 0, 10], lKnee: [70, 0, 0], lAnk: [-30, 0, 0], lSh: [-80, -12, -20], lEl: [-80, 0, 0], rSh: [-70, 6, 20], rEl: [-90, 0, 0] }], [19, { hy: 0.24, spine: [-10, 8, 0], chest: [-6, 6, 0], rHip: [-118, 0, -6], rKnee: [130, 0, 0], lHip: [-30, 0, 10], lKnee: [70, 0, 0], lSh: [-80, -12, -20], lEl: [-80, 0, 0], rSh: [-70, 6, 20], rEl: [-90, 0, 0] }], [28, { hy: -0.16, spine: [14, 8, 0], lHip: [-50, 0, 6], lKnee: [60, 0, 0], rHip: [-40, 0, -6], rKnee: [60, 0, 0], lAnk: [-10, 0, 0], rAnk: [-20, 0, 0] }], [42, S]]),
  jumpKick: anim([[0, POSES.jump], [5, { hy: 0, spine: [-14, 8, 0], chest: [-6, 10, 0], rHip: [-96, 0, -4], rKnee: [6, 0, 0], rAnk: [-20, 0, 0], lHip: [-50, 0, 10], lKnee: [100, 0, 0], lSh: [-40, -12, -20], rSh: [-70, 6, 40] }], [12, { hy: 0, spine: [-14, 8, 0], chest: [-6, 10, 0], rHip: [-92, 0, -4], rKnee: [12, 0, 0], rAnk: [-20, 0, 0], lHip: [-50, 0, 10], lKnee: [100, 0, 0], lSh: [-40, -12, -20], rSh: [-70, 6, 40] }], [24, POSES.jump]]),
  crouchJab: anim([[0, POSES.crouch], [5, Object.assign({}, POSES.crouch, { lSh: [-70, -6, -20], lEl: [-4, 0, 0], chest: [10, -26, 0], spine: [24, 8, 0] })], [9, Object.assign({}, POSES.crouch, { lSh: [-74, -4, -22], lEl: [-2, 0, 0], chest: [10, -30, 0], spine: [24, 8, 0] })], [22, POSES.crouch]]),
  wsUpper: anim([[0, POSES.crouch], [10, { hy: 0.04, spine: [-8, 8, 0], chest: [-8, 36, 0], hips: [0, -5, 0], neck: [-6, -10, 0], rSh: [-136, 20, 14], rEl: [-50, 0, 0], lSh: [-40, -12, -14], lKnee: [8, 0, 0], rKnee: [8, 0, 0], lHip: [-8, 0, 6], rHip: [-2, 0, -6], rAnk: [-40, 0, 0], lAnk: [-20, 0, 0] }], [14, { hy: 0.02, spine: [-8, 8, 0], chest: [-8, 36, 0], hips: [0, -5, 0], neck: [-6, -10, 0], rSh: [-138, 20, 14], rEl: [-48, 0, 0], lKnee: [10, 0, 0], rKnee: [10, 0, 0], lHip: [-8, 0, 6], rHip: [-2, 0, -6], rAnk: [-40, 0, 0], lAnk: [-20, 0, 0] }], [30, S]]),
  wsKick: anim([[0, POSES.crouch], [9, { hy: -0.06, spine: [-10, 8, 0], rHip: [-98, 0, -2], rKnee: [6, 0, 0], rAnk: [-22, 0, 0], lKnee: [20, 0, 0], lAnk: [-10, 0, 0], lSh: [-40, -12, -14], rSh: [-30, 6, 30] }], [13, { hy: -0.06, spine: [-10, 8, 0], rHip: [-94, 0, -2], rKnee: [10, 0, 0], rAnk: [-22, 0, 0], lKnee: [20, 0, 0], lSh: [-40, -12, -14], rSh: [-30, 6, 30] }], [30, S]]),
  doublePalm: anim([[0, S], [8, { hy: -0.1, spine: [-6, 0, 0], hips: [0, -10, 0], lSh: [-30, -10, -16], rSh: [-30, 10, 16], lEl: [-130, 0, 0], rEl: [-130, 0, 0], lHip: [-30, 0, 6], lKnee: [30, 0, 0], rHip: [14, 0, -6], rKnee: [20, 0, 0], rAnk: [-34, 0, 0] }], [16, { hy: -0.12, spine: [20, 0, 0], chest: [6, 0, 0], hips: [0, 0, 0], neck: [-10, 0, 0], lSh: [-96, -10, -14], rSh: [-96, 10, 14], lEl: [-4, 0, 0], rEl: [-4, 0, 0], lHip: [-50, 0, 6], lKnee: [40, 0, 0], rHip: [26, 0, -6], rKnee: [16, 0, 0], rAnk: [-44, 0, 0] }], [20, { hy: -0.12, spine: [20, 0, 0], chest: [6, 0, 0], hips: [0, 0, 0], neck: [-10, 0, 0], lSh: [-96, -10, -14], rSh: [-96, 10, 14], lEl: [-4, 0, 0], rEl: [-4, 0, 0], lHip: [-50, 0, 6], lKnee: [40, 0, 0], rHip: [26, 0, -6], rKnee: [16, 0, 0], rAnk: [-44, 0, 0] }], [40, S]]),
  axeKick: anim([[0, S], [10, { hy: -0.04, spine: [-10, 8, 0], chest: [-6, 6, 0], neck: [8, 16, 0], rHip: [-150, 0, -8], rKnee: [10, 0, 0], rAnk: [-10, 0, 0], lKnee: [14, 0, 0], lAnk: [-4, 0, 0], lSh: [-50, -12, -20], rSh: [-20, 6, 30] }], [17, { hy: -0.14, spine: [24, 8, 0], chest: [8, 6, 0], neck: [-16, 16, 0], rHip: [-60, 0, -8], rKnee: [8, 0, 0], rAnk: [10, 0, 0], lKnee: [30, 0, 0], lHip: [-30, 0, 6], lAnk: [-4, 0, 0], lSh: [-30, -12, -20], rSh: [-10, 6, 30] }], [21, { hy: -0.16, spine: [26, 8, 0], chest: [8, 6, 0], neck: [-16, 16, 0], rHip: [-50, 0, -8], rKnee: [8, 0, 0], rAnk: [10, 0, 0], lKnee: [32, 0, 0], lHip: [-30, 0, 6], lSh: [-30, -12, -20], rSh: [-10, 6, 30] }], [40, S]]),
  hammer: anim([[0, S], [10, { hy: 0.0, spine: [-16, 0, 0], chest: [-10, 0, 0], neck: [10, 0, 0], hips: [0, -10, 0], lSh: [-170, 0, 10], rSh: [-170, 0, -10], lEl: [-40, 0, 0], rEl: [-40, 0, 0], lHip: [-20, 0, 8], rHip: [10, 0, -8], lKnee: [16, 0, 0], rKnee: [20, 0, 0], rAnk: [-30, 0, 0] }], [17, { hy: -0.2, spine: [36, 0, 0], chest: [12, 0, 0], neck: [-20, 0, 0], hips: [0, -4, 0], lSh: [-80, 0, 4], rSh: [-80, 0, -4], lEl: [-30, 0, 0], rEl: [-30, 0, 0], lHip: [-60, 0, 8], rHip: [-10, 0, -8], lKnee: [60, 0, 0], rKnee: [50, 0, 0], lAnk: [0, 0, 0], rAnk: [-40, 0, 0] }], [21, { hy: -0.2, spine: [36, 0, 0], chest: [12, 0, 0], neck: [-20, 0, 0], hips: [0, -4, 0], lSh: [-76, 0, 4], rSh: [-76, 0, -4], lEl: [-30, 0, 0], rEl: [-30, 0, 0], lHip: [-60, 0, 8], rHip: [-10, 0, -8], lKnee: [60, 0, 0], rKnee: [50, 0, 0], rAnk: [-40, 0, 0] }], [44, S]]),
  bodyHook: anim([[0, S], [7, { hy: -0.2, spine: [14, 8, 0], chest: [6, -20, 0], hips: [0, -50, 0], lSh: [-20, -20, -40], lEl: [-120, 0, 0], lKnee: [40, 0, 0], rKnee: [40, 0, 0], lHip: [-36, 0, 6], rHip: [-20, 0, -6], lAnk: [-4, 0, 0], rAnk: [-20, 0, 0] }], [13, { hy: -0.16, spine: [12, 8, 0], chest: [6, 40, 0], hips: [0, 0, 0], neck: [-4, -20, 0], lSh: [-80, -60, -10], lEl: [-95, 0, 0], lKnee: [30, 0, 0], rKnee: [30, 0, 0], lHip: [-30, 0, 6], rHip: [-10, 0, -6], lAnk: [0, 0, 0], rAnk: [-20, 0, 0] }], [17, { hy: -0.16, spine: [12, 8, 0], chest: [6, 44, 0], hips: [0, 0, 0], neck: [-4, -20, 0], lSh: [-80, -64, -10], lEl: [-92, 0, 0], lKnee: [30, 0, 0], rKnee: [30, 0, 0], lHip: [-30, 0, 6], rHip: [-10, 0, -6], rAnk: [-20, 0, 0] }], [34, S]]),
  palm: anim([[0, S], [4, { rSh: [-30, 10, 20], rEl: [-130, 0, 0] }], [8, { rSh: [-92, 8, 10], rEl: [-10, 0, 0], chest: [6, 30, 0], hips: [0, -10, 0], spine: [8, 8, 0] }], [11, { rSh: [-92, 8, 10], rEl: [-8, 0, 0], chest: [6, 30, 0], hips: [0, -10, 0], spine: [8, 8, 0] }], [20, S]]),
  palm2: anim([[0, S], [4, { lSh: [-30, -10, -20], lEl: [-130, 0, 0] }], [8, { lSh: [-92, -8, -10], lEl: [-10, 0, 0], chest: [6, -30, 0], hips: [0, -40, 0], spine: [8, 8, 0] }], [11, { lSh: [-92, -8, -10], lEl: [-8, 0, 0], chest: [6, -30, 0], hips: [0, -40, 0], spine: [8, 8, 0] }], [20, S]]),
  spinSweep: anim([[0, S], [6, { hy: -0.4, hips: [20, -60, 0], spine: [30, 0, 0], neck: [-20, 20, 0], lHip: [-100, 0, 14], lKnee: [124, 0, 0], lAnk: [-28, 0, 0], rHip: [-60, 0, -40], rKnee: [60, 0, 0], lSh: [-80, -12, -40], lEl: [-40, 0, 0], rSh: [-40, 6, 40] }], [14, { hy: -0.5, hips: [20, -200, 0], spine: [30, 0, 0], neck: [-20, 20, 0], lHip: [-104, 0, 14], lKnee: [126, 0, 0], lAnk: [-28, 0, 0], rHip: [-80, 0, -60], rKnee: [4, 0, 0], rAnk: [-10, 0, 0], lSh: [-90, -12, -40], lEl: [-20, 0, 0], rSh: [-40, 6, 40] }], [20, { hy: -0.5, hips: [20, -260, 0], spine: [30, 0, 0], lHip: [-104, 0, 14], lKnee: [126, 0, 0], lAnk: [-28, 0, 0], rHip: [-80, 0, -60], rKnee: [8, 0, 0], rAnk: [-10, 0, 0], lSh: [-90, -12, -40], lEl: [-20, 0, 0] }], [30, { hy: -0.4, hips: [16, -340, 0], lHip: [-90, 0, 12], lKnee: [110, 0, 0], rHip: [-70, 0, -20], rKnee: [90, 0, 0] }], [44, Object.assign({}, S, { hips: [0, -390, 0] })]]),
  getup: anim([[0, POSES.lying], [14, Object.assign({}, POSES.crouch, { hy: -0.5, hips: [40, -30, 0], spine: [30, 8, 0] })], [30, S]]),
  getupKickLow: anim([[0, POSES.lying], [6, Object.assign({}, POSES.lying, { hy: -(HIPS_Y - 0.28), hips: [-70, 0, 0], rHip: [-40, 0, -10], rKnee: [90, 0, 0], lHip: [-30, 0, 10], lKnee: [60, 0, 0] })], [12, Object.assign({}, POSES.lying, { hy: -(HIPS_Y - 0.3), hips: [-60, 0, 0], spine: [30, 0, 0], rHip: [-30, 0, -6], rKnee: [2, 0, 0], rAnk: [-20, 0, 0], lHip: [-60, 0, 10], lKnee: [100, 0, 0] })], [17, Object.assign({}, POSES.lying, { hy: -(HIPS_Y - 0.3), hips: [-60, 0, 0], spine: [30, 0, 0], rHip: [-30, 0, -6], rKnee: [6, 0, 0], lHip: [-60, 0, 10], lKnee: [100, 0, 0] })], [30, Object.assign({}, POSES.crouch, { hy: -0.5, hips: [40, -30, 0] })], [44, S]]),
  getupKickMid: anim([[0, POSES.lying], [6, Object.assign({}, POSES.lying, { hy: -(HIPS_Y - 0.3), hips: [-60, 0, 0], spine: [20, 0, 0], lHip: [-20, 0, 10], lKnee: [60, 0, 0], rHip: [-40, 0, -10], rKnee: [100, 0, 0] })], [13, Object.assign({}, POSES.lying, { hy: -(HIPS_Y - 0.5), hips: [-30, 0, 0], spine: [20, 0, 0], neck: [0, 0, 0], rHip: [-96, 0, -6], rKnee: [2, 0, 0], rAnk: [-20, 0, 0], lHip: [-70, 0, 10], lKnee: [110, 0, 0], lSh: [-20, 0, 60], rSh: [-20, 0, -60] })], [18, Object.assign({}, POSES.lying, { hy: -(HIPS_Y - 0.5), hips: [-30, 0, 0], spine: [20, 0, 0], rHip: [-92, 0, -6], rKnee: [6, 0, 0], lHip: [-70, 0, 10], lKnee: [110, 0, 0], lSh: [-20, 0, 60], rSh: [-20, 0, -60] })], [32, Object.assign({}, POSES.crouch, { hy: -0.5, hips: [40, -30, 0] })], [46, S]]),
  throwA: anim([[0, S], [10, POSES.grab], [22, Object.assign({}, POSES.grab, { hips: [0, -40, 0], spine: [-10, 0, 0], lSh: [-130, -8, -20], rSh: [-130, 8, 20], lEl: [-50, 0, 0], rEl: [-50, 0, 0] })], [34, Object.assign({}, POSES.grab, { hips: [0, -160, 0], spine: [20, 0, 0], lSh: [-150, 0, -10], rSh: [-150, 0, 10], lEl: [-30, 0, 0], rEl: [-30, 0, 0] })], [44, Object.assign({}, POSES.slam, { hips: [0, -230, 0] })], [50, Object.assign({}, POSES.slam, { hips: [0, -240, 0] })], [72, Object.assign({}, S, { hips: [0, -390, 0] })]]),
  throwD: anim([[0, S], [10, POSES.grabbed], [22, Object.assign({}, POSES.grabbed, { hy: 0.2, hips: [-40, 0, 0] })], [34, POSES.lift], [44, Object.assign({}, POSES.lying, { hy: -(HIPS_Y - 0.5), hips: [-120, 0, 0] })], [50, POSES.lying], [72, POSES.lying]]),
  rageArt: anim([[0, S], [10, { hy: -0.12, spine: [20, 8, 0], chest: [6, -10, 0], hips: [0, -40, 0], rSh: [-50, 20, 40], rEl: [-150, 0, 0], lHip: [-50, 0, 6], lKnee: [50, 0, 0], rHip: [20, 0, -6], rAnk: [-40, 0, 0] }], [20, { rSh: [-100, 10, 36], rEl: [-152, 0, 0], chest: [8, 44, 0], hips: [0, 0, 0], spine: [12, 10, 0], neck: [-4, -20, 0], lHip: [-40, 0, 6], lKnee: [30, 0, 0], rHip: [20, 0, -6], rAnk: [-40, 0, 0], hy: -0.1 }], [34, { hy: 0.26, spine: [-10, 8, 0], chest: [-6, 6, 0], rHip: [-120, 0, -6], rKnee: [130, 0, 0], lHip: [-30, 0, 10], lKnee: [70, 0, 0], lSh: [-80, -12, -20], lEl: [-80, 0, 0], rSh: [-70, 6, 20], rEl: [-90, 0, 0] }], [48, { hy: -0.1, hips: [0, -120, 0], chest: [4, -30, 0], neck: [0, 60, 0], rHip: [-20, 0, -30], rKnee: [100, 0, 0], lKnee: [24, 0, 0], lSh: [-70, -12, -30], rSh: [-50, 6, 50] }], [62, { hy: -0.04, hips: [0, -230, 0], chest: [-6, -20, 0], spine: [-14, 0, 0], neck: [10, 50, 0], rHip: [-96, 0, -8], rKnee: [4, 0, 0], rAnk: [-20, 0, 0], lKnee: [18, 0, 0], lSh: [-60, -12, -30], rSh: [-60, 6, 50] }], [70, { hy: -0.04, hips: [0, -240, 0], chest: [-6, -20, 0], spine: [-14, 0, 0], neck: [10, 50, 0], rHip: [-92, 0, -8], rKnee: [10, 0, 0], lKnee: [18, 0, 0], lSh: [-60, -12, -30], rSh: [-60, 6, 50] }], [96, Object.assign({}, S, { hips: [0, -390, 0] })]]),
};

/* corrected spinning / sweeping motions (hip yaw sign verified against limb direction) */
Object.assign(ANIMS, {
  roundhouse: anim([[0, S], [8, { rHip: [-40, 0, -70], rKnee: [112, 0, 0], hips: [0, 20, 0], chest: [0, -24, 0], spine: [-6, 0, 0], neck: [4, -10, 0], hy: -0.08, lKnee: [22, 0, 0], lAnk: [-10, 0, 0], lSh: [-60, -12, -24], rSh: [-30, 6, 60] }], [15, { rHip: [-88, 0, -62], rKnee: [8, 0, 0], rAnk: [-10, 0, 0], hips: [0, 80, 0], chest: [-4, -36, 0], spine: [-10, 0, 0], neck: [6, -40, 0], hy: -0.06, lKnee: [18, 0, 0], lAnk: [-6, 0, 0], lSh: [-70, -12, -30], rSh: [-30, 6, 70] }], [19, { rHip: [-84, 0, -64], rKnee: [14, 0, 0], rAnk: [-10, 0, 0], hips: [0, 88, 0], chest: [-4, -36, 0], spine: [-10, 0, 0], neck: [6, -44, 0], hy: -0.06, lKnee: [18, 0, 0], lSh: [-70, -12, -30], rSh: [-30, 6, 70] }], [27, { rHip: [-40, 0, -50], rKnee: [100, 0, 0], hips: [0, 30, 0], neck: [0, -10, 0], hy: -0.1 }], [38, S]]),
  spinKick: anim([[0, S], [8, { hips: [0, -120, 0], neck: [0, 60, 0], hy: -0.08, rHip: [20, 0, -10], rKnee: [90, 0, 0], lKnee: [24, 0, 0], lAnk: [-10, 0, 0], lSh: [-70, -12, -30], rSh: [-50, 6, 50] }], [17, { hips: [0, -192, 0], spine: [28, 0, 0], chest: [6, 0, 0], neck: [-20, -60, 0], hy: -0.06, rHip: [78, 0, -6], rKnee: [6, 0, 0], rAnk: [30, 0, 0], lKnee: [18, 0, 0], lAnk: [-6, 0, 0], lSh: [-60, -12, -30], rSh: [-30, 6, 50] }], [22, { hips: [0, -196, 0], spine: [28, 0, 0], chest: [6, 0, 0], neck: [-20, -60, 0], hy: -0.06, rHip: [76, 0, -6], rKnee: [8, 0, 0], rAnk: [30, 0, 0], lKnee: [18, 0, 0], lSh: [-60, -12, -30], rSh: [-30, 6, 50] }], [32, { hips: [0, -300, 0], hy: -0.1, rHip: [20, 0, -20], rKnee: [80, 0, 0] }], [46, Object.assign({}, S, { hips: [0, -390, 0] })]]),
  backfist: anim([[0, S], [8, { hips: [0, -170, 0], chest: [0, -20, 0], neck: [0, 60, 0], rSh: [-70, 0, 0], rEl: [-110, 0, 0], lSh: [-60, -12, -30], hy: -0.08, rKnee: [24, 0, 0], rAnk: [-30, 0, 0] }], [16, { hips: [0, -310, 0], chest: [-6, -10, 0], spine: [4, 0, 0], neck: [0, -20, 0], rSh: [-92, 0, -40], rEl: [-6, 0, 0], lSh: [-60, -12, -30], hy: -0.06, lKnee: [20, 0, 0], rKnee: [20, 0, 0], rAnk: [-20, 0, 0], lAnk: [-10, 0, 0] }], [20, { hips: [0, -322, 0], chest: [-6, -10, 0], spine: [4, 0, 0], neck: [0, -20, 0], rSh: [-92, 0, -40], rEl: [-6, 0, 0], lSh: [-60, -12, -30], hy: -0.06, lKnee: [20, 0, 0], rKnee: [20, 0, 0] }], [40, Object.assign({}, S, { hips: [0, -390, 0] })]]),
  sweep: anim([[0, POSES.crouch], [6, Object.assign({}, POSES.crouch, { hy: -0.5, hips: [16, -40, 0], spine: [20, 0, 0], chest: [4, 10, 0], rHip: [-70, 0, -60], rKnee: [16, 0, 0], rAnk: [-10, 0, 0], lHip: [-100, 0, 14], lKnee: [124, 0, 0], lAnk: [-28, 0, 0], lSh: [-60, -12, -40], rSh: [-30, 6, 30] })], [13, Object.assign({}, POSES.crouch, { hy: -0.52, hips: [16, 50, 0], spine: [24, 0, 0], chest: [4, -20, 0], neck: [-10, -20, 0], rHip: [-78, 0, -56], rKnee: [4, 0, 0], rAnk: [-10, 0, 0], lHip: [-104, 0, 14], lKnee: [126, 0, 0], lAnk: [-28, 0, 0], lSh: [-70, -12, -40], rSh: [-30, 6, 30] })], [18, Object.assign({}, POSES.crouch, { hy: -0.52, hips: [16, 78, 0], spine: [24, 0, 0], chest: [4, -20, 0], neck: [-10, -30, 0], rHip: [-78, 0, -56], rKnee: [8, 0, 0], rAnk: [-10, 0, 0], lHip: [-104, 0, 14], lKnee: [126, 0, 0], lAnk: [-28, 0, 0] })], [28, Object.assign({}, POSES.crouch, { hy: -0.48, hips: [14, 20, 0], rHip: [-90, 0, -20], rKnee: [100, 0, 0] })], [38, POSES.crouch]]),
  spinSweep: anim([[0, S], [6, Object.assign({}, POSES.crouch, { hy: -0.42, hips: [20, -60, 0], spine: [30, 0, 0], neck: [-20, 20, 0], rHip: [-60, 0, -40], rKnee: [60, 0, 0], lSh: [-80, -12, -40], lEl: [-40, 0, 0], rSh: [-40, 6, 40] })], [14, Object.assign({}, POSES.crouch, { hy: -0.5, hips: [20, 50, 0], spine: [30, 0, 0], neck: [-20, -30, 0], lHip: [-104, 0, 14], lKnee: [126, 0, 0], lAnk: [-28, 0, 0], rHip: [-80, 0, -60], rKnee: [4, 0, 0], rAnk: [-10, 0, 0], lSh: [-90, -12, -40], lEl: [-20, 0, 0], rSh: [-40, 6, 40] })], [20, Object.assign({}, POSES.crouch, { hy: -0.5, hips: [20, 84, 0], spine: [30, 0, 0], neck: [-20, -40, 0], lHip: [-104, 0, 14], lKnee: [126, 0, 0], lAnk: [-28, 0, 0], rHip: [-80, 0, -60], rKnee: [8, 0, 0], rAnk: [-10, 0, 0], lSh: [-90, -12, -40], lEl: [-20, 0, 0] })], [30, Object.assign({}, POSES.crouch, { hy: -0.4, hips: [16, 200, 0], rHip: [-70, 0, -20], rKnee: [90, 0, 0] })], [44, Object.assign({}, S, { hips: [0, 330, 0] })]]),
  grabWhiff: anim([[0, S], [10, POSES.grab], [16, POSES.grab], [34, S]]),
  throwA: anim([[0, S], [10, POSES.grab], [22, Object.assign({}, POSES.grab, { spine: [-6, 0, 0], lSh: [-140, -8, -20], rSh: [-140, 8, 20], lEl: [-50, 0, 0], rEl: [-50, 0, 0], hy: -0.04 })], [34, Object.assign({}, POSES.grab, { spine: [-18, 0, 0], chest: [-8, 0, 0], neck: [10, 0, 0], lSh: [-165, 0, -10], rSh: [-165, 0, 10], lEl: [-30, 0, 0], rEl: [-30, 0, 0], hy: 0 })], [44, POSES.slam], [50, POSES.slam], [72, S]]),
  throwD: anim([[0, POSES.grabbed], [10, POSES.grabbed], [22, Object.assign({}, POSES.grabbed, { hips: [-40, 0, 0], lHip: [-40, 0, 10], rHip: [-30, 0, -10] })], [34, POSES.lift], [44, POSES.lying], [72, POSES.lying]]),
});
ANIMS.rageArt = anim([[0, S], [10, { hy: -0.12, spine: [20, 8, 0], chest: [6, -10, 0], hips: [0, -40, 0], rSh: [-50, 20, 40], rEl: [-150, 0, 0], lHip: [-50, 0, 6], lKnee: [50, 0, 0], rHip: [20, 0, -6], rAnk: [-40, 0, 0] }], [20, { rSh: [-100, 10, 36], rEl: [-152, 0, 0], chest: [8, 44, 0], hips: [0, 0, 0], spine: [12, 10, 0], neck: [-4, -20, 0], lHip: [-40, 0, 6], lKnee: [30, 0, 0], rHip: [20, 0, -6], rAnk: [-40, 0, 0], hy: -0.1 }], [34, { hy: 0.26, spine: [-10, 8, 0], chest: [-6, 6, 0], rHip: [-120, 0, -6], rKnee: [130, 0, 0], lHip: [-30, 0, 10], lKnee: [70, 0, 0], lSh: [-80, -12, -20], lEl: [-80, 0, 0], rSh: [-70, 6, 20], rEl: [-90, 0, 0] }], [48, { hy: -0.1, hips: [0, -120, 0], neck: [0, 60, 0], rHip: [20, 0, -10], rKnee: [90, 0, 0], lKnee: [24, 0, 0], lSh: [-70, -12, -30], rSh: [-50, 6, 50] }], [62, { hy: -0.06, hips: [0, -192, 0], spine: [28, 0, 0], chest: [6, 0, 0], neck: [-20, -60, 0], rHip: [78, 0, -6], rKnee: [6, 0, 0], rAnk: [30, 0, 0], lKnee: [18, 0, 0], lSh: [-60, -12, -30], rSh: [-30, 6, 50] }], [70, { hy: -0.06, hips: [0, -196, 0], spine: [28, 0, 0], chest: [6, 0, 0], neck: [-20, -60, 0], rHip: [76, 0, -6], rKnee: [8, 0, 0], rAnk: [30, 0, 0], lKnee: [18, 0, 0], lSh: [-60, -12, -30], rSh: [-30, 6, 50] }], [96, Object.assign({}, S, { hips: [0, -390, 0] })]]);
ANIMS.backroll = anim([[0, POSES.lying], [8, Object.assign({}, POSES.lying, { hips: [-140, 0, 0], lHip: [-110, 0, 10], rHip: [-110, 0, -10], lKnee: [120, 0, 0], rKnee: [120, 0, 0] })], [16, Object.assign({}, POSES.crouch, { hips: [60, -30, 0] })], [24, POSES.crouch]]);

/* ---------- entrance & taunt poses ---------- */
Object.assign(POSES, {
  bow: P({ hy: -0.02, hips: [0, 0, 0], spine: [34, 0, 0], chest: [8, 0, 0], neck: [6, 0, 0], lSh: [-4, 0, 6], lEl: [-8, 0, 0], rSh: [-4, 0, -6], rEl: [-8, 0, 0], lHip: [-4, 0, 3], lKnee: [6, 0, 0], lAnk: [0, 0, 0], rHip: [-4, 0, -3], rKnee: [6, 0, 0], rAnk: [0, 0, 0] }),
  flex: P({ hy: -0.06, hips: [0, 0, 0], spine: [-6, 0, 0], chest: [-4, 0, 0], neck: [-8, 0, 0], lSh: [-10, 0, 84], lEl: [-125, 0, 0], rSh: [-10, 0, -84], rEl: [-125, 0, 0], lHip: [-8, 0, 12], lKnee: [12, 0, 0], lAnk: [-2, 0, 0], rHip: [-8, 0, -12], rKnee: [12, 0, 0], rAnk: [-2, 0, 0] }),
  gloveTap: P({ hy: -0.04, hips: [0, -10, 0], spine: [12, 0, 0], neck: [-14, 0, 0], lSh: [-70, 0, -30], lEl: [-110, 0, 0], rSh: [-70, 0, 30], rEl: [-110, 0, 0], lHip: [-10, 0, 8], lKnee: [16, 0, 0], rHip: [4, 0, -8], rKnee: [16, 0, 0] }),
  palmSalute: P({ hy: -0.02, hips: [0, 0, 0], spine: [8, 0, 0], neck: [-4, 0, 0], lSh: [-58, 0, -34], lEl: [-80, 0, 0], rSh: [-58, 0, 34], rEl: [-80, 0, 0], lHip: [-2, 0, 4], lKnee: [4, 0, 0], lAnk: [0, 0, 0], rHip: [-2, 0, -4], rKnee: [4, 0, 0], rAnk: [0, 0, 0] }),
  wai: P({ hy: -0.12, hips: [0, 0, 0], spine: [16, 0, 0], neck: [10, 0, 0], lSh: [-40, 0, -40], lEl: [-120, 0, 0], rSh: [-40, 0, 40], rEl: [-120, 0, 0], lHip: [-26, 0, 8], lKnee: [40, 0, 0], lAnk: [-14, 0, 0], rHip: [-26, 0, -8], rKnee: [40, 0, 0], rAnk: [-14, 0, 0] }),
  gather: P({ hy: -0.24, hips: [0, -10, 0], spine: [26, 0, 0], chest: [8, 0, 0], neck: [-16, 0, 0], lSh: [-64, 0, -44], lEl: [-136, 0, 0], rSh: [-64, 0, 44], rEl: [-136, 0, 0], lHip: [-46, 0, 14], lKnee: [62, 0, 0], lAnk: [-16, 0, 0], rHip: [-34, 0, -14], rKnee: [56, 0, 0], rAnk: [-22, 0, 0] }),
  burst: P({ hy: 0.0, hips: [0, 0, 0], spine: [-16, 0, 0], chest: [-10, 0, 0], neck: [14, 0, 0], lSh: [-112, 0, 64], lEl: [-24, 0, 0], rSh: [-112, 0, -64], rEl: [-24, 0, 0], lHip: [-8, 0, 16], lKnee: [8, 0, 0], lAnk: [-2, 0, 0], rHip: [-8, 0, -16], rKnee: [8, 0, 0], rAnk: [-2, 0, 0] }),
});
Object.assign(ANIMS, {
  heatBurst: anim([[0, S], [8, POSES.gather], [16, POSES.burst], [26, POSES.burst], [44, S]]),
  heatSmash: anim([[0, S], [6, POSES.gather], [12, { hy: 0.18, spine: [-22, 0, 0], chest: [-10, 0, 0], neck: [14, 0, 0], hips: [0, -10, 0], lSh: [-176, 0, 12], rSh: [-176, 0, -12], lEl: [-50, 0, 0], rEl: [-50, 0, 0], lHip: [-60, 0, 10], lKnee: [80, 0, 0], rHip: [-20, 0, -10], rKnee: [60, 0, 0] }], [16, { hy: -0.26, spine: [46, 0, 0], chest: [14, 0, 0], neck: [-24, 0, 0], hips: [0, -4, 0], lSh: [-70, 0, 6], rSh: [-70, 0, -6], lEl: [-20, 0, 0], rEl: [-20, 0, 0], lHip: [-70, 0, 8], lKnee: [80, 0, 0], rHip: [-10, 0, -8], rKnee: [60, 0, 0], rAnk: [-40, 0, 0] }], [22, { hy: -0.26, spine: [46, 0, 0], chest: [14, 0, 0], neck: [-24, 0, 0], lSh: [-66, 0, 6], rSh: [-66, 0, -6], lEl: [-20, 0, 0], rEl: [-20, 0, 0], lHip: [-70, 0, 8], lKnee: [80, 0, 0], rHip: [-10, 0, -8], rKnee: [60, 0, 0], rAnk: [-40, 0, 0] }], [48, S]]),
  powerCrush: anim([[0, S], [7, { hy: -0.16, spine: [-6, 8, 0], chest: [0, -30, 0], hips: [0, -40, 0], rSh: [-30, 20, 30], rEl: [-130, 0, 0], lSh: [-60, -10, -30], lEl: [-120, 0, 0], lHip: [-20, 0, 6], lKnee: [40, 0, 0], rHip: [10, 0, -6], rKnee: [40, 0, 0] }], [17, { hy: -0.14, spine: [24, 10, 0], chest: [8, 52, 0], hips: [0, 6, 0], neck: [-10, -28, 0], rSh: [-100, 8, 14], rEl: [-4, 0, 0], lSh: [-40, -12, -30], lEl: [-120, 0, 0], lHip: [-66, 0, 6], lKnee: [50, 0, 0], rHip: [34, 0, -6], rKnee: [14, 0, 0], rAnk: [-48, 0, 0] }], [21, { hy: -0.14, spine: [24, 10, 0], chest: [8, 52, 0], hips: [0, 6, 0], neck: [-10, -28, 0], rSh: [-100, 8, 14], rEl: [-4, 0, 0], lSh: [-40, -12, -30], lEl: [-120, 0, 0], lHip: [-66, 0, 6], lKnee: [50, 0, 0], rHip: [34, 0, -6], rKnee: [14, 0, 0], rAnk: [-48, 0, 0] }], [44, S]]),
  tornadoKick: anim([[0, S], [7, { hips: [0, 150, 0], neck: [0, -60, 0], hy: 0.04, rHip: [-50, 0, -30], rKnee: [100, 0, 0], lKnee: [40, 0, 0], lHip: [-30, 0, 6], lSh: [-60, -12, -40], rSh: [-50, 6, 50] }], [15, { hips: [0, 400, 0], chest: [-4, -30, 0], spine: [-10, 0, 0], neck: [6, -30, 0], hy: 0.06, rHip: [-90, 0, -40], rKnee: [8, 0, 0], rAnk: [-10, 0, 0], lHip: [-40, 0, 10], lKnee: [70, 0, 0], lAnk: [-30, 0, 0], lSh: [-70, -12, -30], rSh: [-30, 6, 70] }], [19, { hips: [0, 412, 0], chest: [-4, -30, 0], spine: [-10, 0, 0], neck: [6, -30, 0], hy: 0.04, rHip: [-86, 0, -40], rKnee: [14, 0, 0], lHip: [-30, 0, 10], lKnee: [50, 0, 0], lSh: [-70, -12, -30], rSh: [-30, 6, 70] }], [30, { hips: [0, 520, 0], hy: -0.08, rHip: [-30, 0, -20], rKnee: [80, 0, 0] }], [44, Object.assign({}, S, { hips: [0, 690, 0] })]]),
});
/* style-specific idle motion layered on the stance: keeps fighters alive between actions */
function idlePose(style, t, phase, tired) {
  const p = {}; for (const j of JOINTS) p[j] = STANCE[j].slice(); p.hy = STANCE.hy;
  const add = (j, x, y, z) => { p[j][0] += x; p[j][1] += y || 0; p[j][2] += z || 0; };
  const b = Math.sin(t * 0.11 + phase);
  if (style === 'bounce') { const w = Math.sin(t * 0.17 + phase), a = Math.abs(w); p.hy -= a * 0.05; add('lKnee', a * 14); add('rKnee', a * 14); add('lHip', -a * 7); add('rHip', -a * 7); add('lSh', w * 6, 0, w * 4); add('rSh', -w * 6, 0, -w * 4); add('chest', 0, w * 6); add('neck', a * 4, -w * 4); }
  else if (style === 'ginga') { const w = Math.sin(t * 0.06 + phase), c = Math.cos(t * 0.06 + phase); p.hy -= 0.08 + Math.abs(c) * 0.06; add('hips', 0, w * 26); add('lHip', -10 + w * 26, 0, 6); add('rHip', -10 - w * 26, 0, -6); add('lKnee', 26 + Math.max(0, -w) * 30); add('rKnee', 26 + Math.max(0, w) * 30); add('lSh', -30 + c * 20, 0, -20 + w * 20); add('rSh', -30 - c * 20, 0, 20 + w * 20); add('lEl', 40); add('rEl', 40); add('spine', 8, -w * 12); add('neck', 0, -w * 12); }
  else if (style === 'muay') { const k = Math.max(0, Math.sin(t * 0.09 + phase)); add('lHip', -k * 24); add('lKnee', k * 36); add('lAnk', -k * 10); p.hy += -0.02 + Math.abs(b) * -0.02; add('lSh', -10, 0, 0); add('rSh', -14, 0, 0); add('lEl', -6); add('rEl', -6); add('spine', -4); }
  else if (style === 'flow') { const w = Math.sin(t * 0.05 + phase), c = Math.cos(t * 0.05 + phase); add('lSh', w * 18, 0, c * 16); add('rSh', -w * 16, 0, -c * 14); add('lEl', c * 20); add('rEl', -c * 20); add('chest', 0, w * 8); p.hy -= 0.04 + Math.abs(w) * 0.03; add('lKnee', 10); add('rKnee', 10); }
  else if (style === 'heavy') { const w = Math.sin(t * 0.045 + phase); add('spine', 2, w * 6); add('chest', 0, w * 4, w * 3); add('lSh', w * 4); add('rSh', -w * 4); p.hy -= Math.abs(w) * 0.02; }
  else if (style === 'robot') { const step = Math.floor((t + phase * 40) / 50); const r = hash2(step, 1, 3) - 0.5; add('neck', r * 10, r * 40); add('chest', 0, r * 8); p.hy -= ((t % 50) < 4 ? 0.02 : 0); add('lSh', 0, 0, r * 6); }
  else { add('chest', b * 2.5); add('neck', -b * 2); p.hy += b * 0.008; add('lSh', b * 3); add('rSh', -b * 3); }
  if (tired) { add('spine', 10); add('neck', -8); p.hy -= 0.04 + Math.abs(Math.sin(t * 0.14)) * 0.02; add('lSh', 10); add('rSh', 10); }
  return p;
}
