/* ============ CPU opponent ============ */
const AIP = [
  { react: 24, block: 0.28, low: 0.15, side: 0.04, punish: 0.12, combo: 0.25, aggr: 0.3, brk: 0.08, gap: [22, 46], wake: 0.3 },
  { react: 15, block: 0.55, low: 0.4, side: 0.12, punish: 0.5, combo: 0.65, aggr: 0.45, brk: 0.35, gap: [10, 26], wake: 0.55 },
  { react: 9, block: 0.8, low: 0.68, side: 0.22, punish: 0.88, combo: 0.95, aggr: 0.58, brk: 0.7, gap: [4, 14], wake: 0.8 },
  { react: 7, block: 0.9, low: 0.8, side: 0.25, punish: 0.95, combo: 1, aggr: 0.62, brk: 0.85, gap: [3, 10], wake: 0.9 }, // boss
];
class AI {
  constructor(f, level, mode) { this.f = f; this.lv = level; this.mode = mode || 'cpu'; this.plan = []; this.defSerial = -1; this.cool = 30; this.breakSerial = -1; this.wakeAt = -1; this.lastSeen = null; }
  out(dir, b) { return { dir: dir || 5, b: b || {} }; }
  hold(dir, n) { for (let i = 0; i < n; i++) this.plan.push(this.out(dir)); }
  press(btn, dir) { const b = {}; if (btn === '1+3') { b['1'] = b['3'] = true; } else if (btn === '1+2') { b['1'] = b['2'] = true; } else if (btn === '2+4') { b['2'] = b['4'] = true; } else b[btn] = true; this.plan.push(this.out(dir || 5, b)); }
  cmd(c) {
    // translate a move command into an input plan
    const map = { 'f+2': ['2', 6], 'b+1': ['1', 4], 'b+2': ['2', 4], 'b+3': ['3', 4], 'b+4': ['4', 4], 'd/f+2': ['2', 3], 'd/f+4': ['4', 3], 'd+1': ['1', 2], 'd+3': ['3', 2], 'd+4': ['4', 2] };
    if (c === 'f,f+2' || c === 'f,f+3') { this.plan.push(this.out(6), this.out(6), this.out(5), this.out(5)); this.press(c.slice(-1), 6); return; }
    if (c === 'f+1+2') { this.plan.push(this.out(6, { '1': true, '2': true })); return; }
    if (c === 'HEAT') { this.plan.push(this.out(5, { heat: true })); return; }
    if (c === 'f+4') { this.press('4', 6); return; }
    if (c === 'ws+2' || c === 'ws+4') { this.hold(2, 8); this.plan.push(this.out(5)); this.press(c.slice(-1), 5); return; }
    if (map[c]) { this.press(map[c][0], map[c][1]); return; }
    this.press(c, 5);
  }
  string(first, rest, p) { this.cmd(first); for (const r of rest) { if (Math.random() > p) break; this.hold(5, 7); this.press(r, 5); } }
  think() {
    const f = this.f, o = f.opp, P = AIP[this.lv], g = f.game;
    if (this.mode !== 'cpu') return this.dummy();
    if (g.roundOver || (g.phase !== 'fight' && g.mode !== 'demo')) { this.plan.length = 0; return this.out(5); }
    // throw escape
    if (f.state === 'thrown') { if (this.breakSerial !== o.moveSerial) { this.breakSerial = o.moveSerial; this.breakOk = Math.random() < P.brk; this.breakAt = 5 + ((Math.random() * 8) | 0); } this.plan.length = 0; if (this.breakOk && f.tf === this.breakAt) { const b = {}; b[f.breakBtn] = true; return this.out(5, b); } return this.out(5); }
    // wake-up
    if (f.state === 'grounded') {
      this.plan.length = 0;
      if (this.wakeAt < 0) this.wakeAt = 14 + ((Math.random() * (40 - P.wake * 25)) | 0);
      if (f.sf >= this.wakeAt) { this.wakeAt = -1; const r = Math.random(); const dist = f.distTo(o);
        if (r < 0.25 * P.wake && dist < 1.5) return this.out(5, { [Math.random() < 0.5 ? '3' : '4']: true });
        if (r < 0.55) return this.out(4); if (r < 0.75) return this.out(5, { ssu: Math.random() < 0.5, ssd: true }); return this.out(6); }
      return this.out(5);
    }
    if (this.plan.length) return this.plan.shift();
    const dist = f.distTo(o);
    // defend against an incoming attack
    if (o.state === 'attack' && o.moveSerial !== this.defSerial && o.mf >= Math.min(P.react, o.move.startup - 2) * (0.7 + Math.random() * 0.5) && f.canAct()) {
      this.defSerial = o.moveSerial; const m = o.move;
      if (dist < m.reach * o.scale + 0.9 + (m.lunge || 0) && o.mf < m.startup + m.active) {
        const left = m.startup + m.active - o.mf; const r = Math.random();
        if (m.throw) { if (r < P.block * 0.5) { this.hold(2, left + 6); return this.plan.shift(); } }
        else if (r < P.block) {
          if (m.level === 'l') { if (this.lv >= 1 && Math.random() < P.low * 0.35 && left > 2) { this.hold(5, Math.max(0, left - 5)); this.hold(3, 10); } else if (Math.random() < P.low) { this.hold(1, left + 8); } else this.hold(4, left + 4); }
          else if (m.level === 'h' && Math.random() < 0.35) { this.hold(2, left + 6); if (Math.random() < P.punish) { this.plan.push(this.out(5)); this.press(Math.random() < 0.6 ? '2' : '4', 5); } }
          else this.hold(4, left + m.recovery * 0.3 + 4);
          return this.plan.shift();
        } else if (r < P.block + P.side && !m.homing && left > 6) { this.plan.push(this.out(5, Math.random() < 0.5 ? { ssu: true } : { ssd: true })); this.hold(5, 10); return this.plan.shift(); }
        else if (m.level !== 'l' && Math.random() < 0.12 * P.aggr && dist < 1.2 && left > 6) { this.cmd('f+1+2'); return this.plan.shift(); }
        else if (Math.random() < 0.15 * P.aggr && dist < 1.0) { this.press('1'); return this.plan.shift(); }
      }
    }
    if (!f.canAct()) { // while stunned, hold guard (better AIs keep blocking)
      if (f.state === 'blockstun') return this.out(f.blockType === 'crouch' ? 1 : 4);
      return this.out(Math.random() < P.block ? 4 : 5);
    }
    // whiff/block punish
    if (o.state === 'attack' && o.mf > o.move.startup + o.move.active && dist < 1.4) {
      const rem = o.remaining();
      if (rem >= 12 && this.lastPun !== o.moveSerial) { this.lastPun = o.moveSerial; if (Math.random() < P.punish) {
        if (rem >= 16 && dist < 1.05) { this.cmd(f.crouch ? 'ws+2' : 'd/f+2'); }
        else if (dist < 1.0) this.string('1', ['2', Math.random() < 0.5 ? '3' : '4'], 0.9); else this.cmd('4');
        return this.plan.shift(); } }
    }
    // juggle follow-up
    if ((o.state === 'air' || o.state === 'wallsplat') && !o.ko) {
      if (Math.random() < P.combo) {
        if (dist > 1.25) { this.hold(6, 2); return this.plan.shift(); }
        if (o.juggle === 2 && !o.screwUsed && o.state === 'air' && Math.random() < 0.6) { this.cmd('f+4'); }
        else if (o.state === 'wallsplat' && f.heatActive && Math.random() < 0.5) { this.cmd('HEAT'); }
        else if (o.state === 'wallsplat' || o.juggle >= 3) { this.cmd(pick(['b+4', '1+2', 'f+2', '4'])); }
        else if (o.juggle === 1 && o.vy > 0) { this.hold(5, 4); this.string('1', ['2'], 1); }
        else this.cmd(pick(['1', '2', 'd+1', 'f+2']));
        return this.plan.shift();
      }
      this.cool = 10;
    }
    // grounded opponent
    if (o.state === 'grounded' && dist < 1.4 && Math.random() < 0.08 * P.aggr) { this.cmd(pick(['d+3', 'd+4'].concat(f.def.sig === 'axe' || f.def.sig === 'hammer' ? ['b+' + (f.def.sig === 'axe' ? '3' : '1')] : []))); return this.plan.shift(); }
    // rage art when low
    if (f.rage && !f.rageUsed && dist < 1.15 && o.state === 'attack' && o.mf < o.move.startup && Math.random() < 0.03 * (this.lv + 1)) { this.plan.push(this.out(5, { ra: true })); return this.plan.shift(); }
    if (f.heatAvail && !f.heatActive && dist < 1.25 && Math.random() < 0.004 * (this.lv + 1)) { this.cmd('HEAT'); return this.plan.shift(); }
    if (f.heatActive && dist < 1.15 && f.heatT < 420 && Math.random() < 0.012 * (this.lv + 1)) { this.cmd('HEAT'); return this.plan.shift(); }
    if (this.cool-- > 0) {
      // footsies between decisions
      if (dist > 1.8) return this.out(6);
      if (this.footsie && this.footsie.t-- > 0) return this.out(this.footsie.d);
      return this.out(dist < 0.9 ? 4 : 5);
    }
    this.cool = P.gap[0] + ((Math.random() * (P.gap[1] - P.gap[0])) | 0);
    const r = Math.random();
    if (dist > 2.6) { if (r < 0.5) this.hold(6, 2), this.hold(5, 2), this.hold(6, 14); else this.hold(6, 24); return this.plan.shift(); }
    if (dist > 1.55) {
      if (r < P.aggr * 0.5) this.cmd(pick(['f,f+2', 'f,f+3', 'd/f+4']));
      else if (r < 0.65) this.hold(6, 16);
      else if (r < 0.8) { this.plan.push(this.out(5, Math.random() < 0.5 ? { ssu: true } : { ssd: true })); this.hold(5, 8); }
      else this.footsie = { d: 4, t: 14 };
      return this.plan.length ? this.plan.shift() : this.out(5);
    }
    if (r < P.aggr + (o.state === 'blockstun' ? 0.25 : 0)) {
      const close = dist < 1.05;
      const sig = SIGNATURES[f.def.sig].cmd;
      const pool = close ? ['1', '1', '2', 'd+1', 'f+2', 'd+3', '1+3', 'd/f+2', sig, '1+2', '3', 'd+4'] : ['3', '4', 'b+4', 'd+4', 'd/f+4', 'b+2', sig, '3'];
      const c = pick(pool);
      if (c === '1') this.string('1', ['2', pick(['1', '3', '4'])], 0.75 + this.lv * 0.08);
      else if (c === '3') this.string('3', ['4'], 0.5);
      else if (c === sig && f.def.sig === 'flurry') this.string('b+1', ['1', '1'], 0.85);
      else this.cmd(c);
    } else if (r < P.aggr + 0.2) { this.hold(4, 12 + ((Math.random() * 16) | 0)); }
    else if (r < P.aggr + 0.3) { this.plan.push(this.out(4), this.out(5), this.out(4)); this.hold(5, 10); }
    else if (r < P.aggr + 0.4) { this.plan.push(this.out(5, Math.random() < 0.5 ? { ssu: true } : { ssd: true })); this.hold(5, 6); }
    else this.hold(2, 10);
    return this.plan.length ? this.plan.shift() : this.out(5);
  }
  dummy() {
    const f = this.f, m = this.mode;
    if (f.state === 'grounded') return this.out(f.sf > 30 ? 8 : 5);
    if (m === 'stand') return this.out(5);
    if (m === 'crouch') return this.out(2);
    if (m === 'jump') return this.out(f.state === 'idle' && f.sf > 20 ? 8 : 5);
    if (m === 'guard') { const o = f.opp; if (o.state === 'attack' && (o.move.level === 'l' || (o.move.level === 'h' && false))) return this.out(1); if (f.state === 'blockstun' && f.blockType === 'crouch') return this.out(1); return this.out(5); }
    return this.out(5);
  }
}
