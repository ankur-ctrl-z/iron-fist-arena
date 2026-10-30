/* ============ input ============ */
const BIND = {
  p1: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], '1': ['KeyR'], '2': ['KeyT'], '3': ['KeyF'], '4': ['KeyG'], thr: ['KeyY'], ra: ['KeyH'], heat: ['KeyV'], ssu: ['KeyQ'], ssd: ['KeyE'] },
  p2: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], '1': ['Numpad4', 'KeyI'], '2': ['Numpad5', 'KeyO'], '3': ['Numpad1', 'KeyK'], '4': ['Numpad2', 'KeyL'], thr: ['Numpad6', 'KeyP'], ra: ['Numpad3', 'Semicolon'], heat: ['Numpad8', 'KeyN'], ssu: ['Numpad7', 'KeyU'], ssd: ['Numpad9', 'KeyJ'] },
};
const KEYNAME = c => c.replace('Key', '').replace('Numpad', 'Num ').replace('Arrow', '').replace('Semicolon', ';');
const Input = {
  down: new Set(), pressed: new Set(), pads: [{}, {}], padPrev: [{}, {}], touch: { l: 0, r: 0, u: 0, d: 0, press: {} }, touchHeld: {},
  init() {
    addEventListener('keydown', e => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code); this.down.add(e.code); Audio.init(); Audio.resume();
      Game.onKey(e);
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    // touch controls
    const stick = $('stick'), knob = $('knob'); let sid = null;
    const setStick = (cx, cy) => { const r = stick.getBoundingClientRect(); let dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2); const L = Math.hypot(dx, dy), mx = 50; if (L > mx) { dx *= mx / L; dy *= mx / L; } knob.style.transform = `translate(${dx}px,${dy}px)`; const t = 18; this.touch.l = dx < -t; this.touch.r = dx > t; this.touch.u = dy < -t * 1.4; this.touch.d = dy > t * 1.4; };
    stick.addEventListener('pointerdown', e => { sid = e.pointerId; stick.setPointerCapture(sid); setStick(e.clientX, e.clientY); Audio.init(); Audio.resume(); });
    stick.addEventListener('pointermove', e => { if (e.pointerId === sid) setStick(e.clientX, e.clientY); });
    const end = e => { if (e.pointerId !== sid) return; sid = null; knob.style.transform = ''; this.touch.l = this.touch.r = this.touch.u = this.touch.d = false; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    document.querySelectorAll('#touch [data-b]').forEach(btn => {
      btn.addEventListener('pointerdown', e => { e.preventDefault(); Audio.init(); Audio.resume(); const b = btn.dataset.b; if (Game.replay) { Game.replay.i = Game.replay.frames.length; return; } if (b === 'pause') { Game.togglePause(); return; } this.touch.press[b] = true; });
    });
  },
  pollPads() {
    const gp = navigator.getGamepads ? navigator.getGamepads() : []; let k = 0;
    for (let i = 0; i < gp.length && k < 2; i++) { const p = gp[i]; if (!p || !p.connected) continue;
      const B = j => !!(p.buttons[j] && p.buttons[j].pressed); const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const cur = { up: B(12) || ay < -0.5, down: B(13) || ay > 0.5, left: B(14) || ax < -0.5, right: B(15) || ax > 0.5, '1': B(2), '2': B(3), '3': B(0), '4': B(1), thr: B(5), ra: B(7), heat: B(4), ssd: B(6), sel: B(8), start: B(9) };
      const prev = this.padPrev[k] || {}; const press = {}; for (const key in cur) if (cur[key] && !prev[key]) press[key] = true;
      this.pads[k] = { cur, press }; this.padPrev[k] = cur; if (press.start) Game.togglePause(); if (press.sel) Game.toggleSpecial(k); if (Object.keys(press).length) Game.onPad(k, press); k++; }
    for (; k < 2; k++) this.pads[k] = null;
  },
  /* screen-space state for a player: {l,r,u,d,press:{}} */
  screen(player, solo) {
    const sets = solo ? [BIND.p1, BIND.p2] : [player === 0 ? BIND.p1 : BIND.p2];
    const held = n => sets.some(s => s[n].some(c => this.down.has(c)));
    const hit = n => sets.some(s => s[n].some(c => this.pressed.has(c)));
    const st = { l: held('left'), r: held('right'), u: held('up'), d: held('down'), press: {} };
    for (const n of ['1', '2', '3', '4', 'thr', 'ra', 'heat', 'ssu', 'ssd']) if (hit(n)) st.press[n] = true;
    const pad = this.pads[solo ? 0 : player] || (solo ? this.pads[1] : null);
    if (pad) { st.l = st.l || pad.cur.left; st.r = st.r || pad.cur.right; st.u = st.u || pad.cur.up; st.d = st.d || pad.cur.down; for (const n in pad.press) st.press[n] = true; }
    if (player === 0) { const t = this.touch; st.l = st.l || t.l; st.r = st.r || t.r; st.u = st.u || t.u; st.d = st.d || t.d; for (const n in t.press) { if (n === '1+2') { st.press['1'] = st.press['2'] = true; } else st.press[n] = true; } }
    return st;
  },
  endFrame() { this.pressed.clear(); this.touch.press = {}; for (const p of this.pads) if (p) p.press = {}; },
};
function toRel(sc, oppRight) {
  let h = (sc.r ? 1 : 0) - (sc.l ? 1 : 0); if (!oppRight) h = -h; const v = (sc.u ? 1 : 0) - (sc.d ? 1 : 0);
  return 5 + h + v * 3;
}
const DIRGLYPH = { 1: '↙', 2: '↓', 3: '↘', 4: '←', 5: '·', 6: '→', 7: '↖', 8: '↑', 9: '↗' };
