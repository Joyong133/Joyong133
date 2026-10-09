// In-race HUD (DOM overlay): rank, lap counter, timer, progress bar,
// minimap, boost gauge, item slot, standings, countdown and pop-up messages.
import { ITEMS } from '../game/items.js';

export function fmtTime(t) {
  if (t === null || t === undefined) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

export const DOT_COLORS = ['#ffd23f', '#ff8a8a', '#7fd4ff', '#9be07b', '#ffb36b', '#d9a3ff', '#ff9ad5', '#ffffff'];

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-tl">
        <div class="rank"><b>1</b><span class="of">/8</span><span class="wi">위</span></div>
        <div class="lap-pill"><span class="lp-label">LAP</span> <b class="lp-n">1</b><span class="lp-of">/3</span></div>
        <div class="mapname"></div>
      </div>
      <div class="hud-tc">
        <div class="timer">00:00.00</div>
        <div class="timeleft hidden"></div>
        <div class="prog"><div class="track"></div><div class="flag">🏁</div></div>
        <div class="laptime"></div>
      </div>
      <div class="hud-tr">
        <canvas class="minimap" width="200" height="200"></canvas>
        <ol class="board"></ol>
      </div>
      <div class="hud-bl">
        <div class="gauge"><div class="cell"><i></i></div><div class="cell"><i></i></div></div>
        <div class="gauge-label">부스터 <kbd>Shift</kbd></div>
      </div>
      <div class="hud-br">
        <div class="item-slot"><span class="icon"></span></div>
        <div class="item-label">아이템 <kbd>Z</kbd></div>
      </div>
      <div class="count"></div>
      <div class="msgs"></div>
      <div class="banner"><div class="b-sub"></div><div class="b-name"></div><div class="b-laps"></div></div>
      <div class="speedlines"></div>
      <div class="flash"></div>
      <div class="finish-banner"></div>
    `;
    const q = (s) => root.querySelector(s);
    this.el = {
      rank: q('.rank b'),
      of: q('.rank .of'),
      rankBox: q('.rank'),
      lapPill: q('.lap-pill'),
      lapN: q('.lp-n'),
      lapOf: q('.lp-of'),
      mapname: q('.mapname'),
      timer: q('.timer'),
      timeleft: q('.timeleft'),
      laptime: q('.laptime'),
      track: q('.prog .track'),
      prog: q('.prog'),
      minimap: q('.minimap'),
      board: q('.board'),
      cells: [...root.querySelectorAll('.gauge .cell i')],
      gauge: q('.gauge'),
      itemBox: q('.hud-br'),
      itemSlot: q('.item-slot'),
      itemIcon: q('.item-slot .icon'),
      count: q('.count'),
      msgs: q('.msgs'),
      banner: q('.banner'),
      bSub: q('.banner .b-sub'),
      bName: q('.banner .b-name'),
      bLaps: q('.banner .b-laps'),
      speed: q('.speedlines'),
      flash: q('.flash'),
      finish: q('.finish-banner'),
    };
    this.last = {};
  }

  setup(race) {
    const el = this.el;
    this.race = race;
    this.root.classList.remove('hidden', 'ceremony');
    this.root.classList.toggle('solo', race.mode === 'time');
    this.root.classList.toggle('items', race.mode === 'item');
    el.mapname.textContent = race.map.name;
    el.of.textContent = `/${race.runners.length}`;
    el.lapN.textContent = '1';
    el.lapOf.textContent = `/${race.laps}`;
    el.laptime.textContent = '';
    el.track.innerHTML = '';
    el.finish.className = 'finish-banner';
    el.finish.textContent = '';
    el.count.className = 'count';
    el.msgs.innerHTML = '';
    this.dots = race.runners.map((r, i) => {
      const d = document.createElement('div');
      d.className = `dot${r.isPlayer ? ' me' : ''}`;
      d.style.background = r.isPlayer ? '#ffe14a' : DOT_COLORS[i % DOT_COLORS.length];
      el.track.appendChild(d);
      return d;
    });
    for (let k = 1; k < race.laps; k++) {
      const t = document.createElement('div');
      t.className = 'tick lap';
      t.style.left = `${(k / race.laps) * 100}%`;
      el.track.appendChild(t);
    }
    el.board.innerHTML = '';
    this.rows = race.runners.map((r, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<i style="background:${r.isPlayer ? '#ffe14a' : DOT_COLORS[i % DOT_COLORS.length]}"></i><span>${r.name}${r.isPlayer ? ' (나)' : ''}</span>`;
      if (r.isPlayer) li.classList.add('me');
      return li;
    });
    el.bSub.textContent = race.map.sub;
    el.bName.textContent = race.map.name;
    el.bLaps.textContent = `${race.laps}바퀴`;
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    this.itemGot(null);
    this.buildMinimap(race);
    this.last = {};
  }

  // Pre-draw the track outline; runner dots are drawn on top each frame.
  buildMinimap(race) {
    const P = race.course.path;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const p of P) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z);
      z1 = Math.max(z1, p.z);
    }
    const S = 200;
    const pad = 16;
    const sc = (S - pad * 2) / Math.max(x1 - x0, z1 - z0, 1);
    const ox = pad + ((S - pad * 2) - (x1 - x0) * sc) / 2;
    const oz = pad + ((S - pad * 2) - (z1 - z0) * sc) / 2;
    // view from above with +z up: screen x = (x1 - x) so the map isn't mirrored
    this.mm = { sc, map: (x, z) => [ox + (x1 - x) * sc, oz + (z1 - z) * sc] };
    const base = document.createElement('canvas');
    base.width = base.height = S;
    const g = base.getContext('2d');
    const line = (w, col) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineJoin = g.lineCap = 'round';
      g.beginPath();
      P.forEach((p, i) => {
        const [x, y] = this.mm.map(p.x, p.z);
        if (i === 0 || p.gap !== P[i - 1]?.gap) {
          if (i > 0) g.stroke();
          g.beginPath();
          g.setLineDash(p.gap ? [3, 4] : []);
          g.moveTo(x, y);
        } else g.lineTo(x, y);
      });
      g.stroke();
      g.setLineDash([]);
    };
    line(9, 'rgba(40,24,70,0.65)');
    line(5, 'rgba(255,255,255,0.95)');
    // checkered start/finish marker
    const lp = race.course.pointAt(race.lineS);
    const [lx, ly] = this.mm.map(lp.x, lp.z);
    g.fillStyle = '#1d1d24';
    g.fillRect(lx - 5, ly - 5, 10, 10);
    g.fillStyle = '#fff';
    g.fillRect(lx - 5, ly - 5, 5, 5);
    g.fillRect(lx, ly, 5, 5);
    this.mmBase = base;
  }

  drawMinimap(race) {
    const cv = this.el.minimap;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 200, 200);
    g.drawImage(this.mmBase, 0, 0);
    if (race.ghost) {
      const [x, y] = this.mm.map(race.ghost.pos.x, race.ghost.pos.z);
      g.fillStyle = 'rgba(159, 232, 255, 0.85)';
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, 4.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    const order = race.runners.slice().reverse();
    for (const r of order) {
      if (r.gone) continue;
      const [x, y] = this.mm.map(r.pos.x, r.pos.z);
      const i = race.runners.indexOf(r);
      if (r.isPlayer) {
        g.save();
        g.translate(x, y);
        g.rotate(Math.PI - r.heading);
        g.fillStyle = '#ffe14a';
        g.strokeStyle = '#3a2a5c';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(0, -8);
        g.lineTo(6, 6);
        g.lineTo(-6, 6);
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      } else {
        g.fillStyle = DOT_COLORS[i % DOT_COLORS.length];
        g.strokeStyle = '#3a2a5c';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, 4.5, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
    }
  }

  hide() {
    this.root.classList.add('hidden');
  }

  update(race) {
    const el = this.el;
    const p = race.player;
    const L = this.last;
    const rank = p.rank || 1;
    if (L.rank !== rank) {
      L.rank = rank;
      el.rank.textContent = rank;
      el.rankBox.classList.remove('pop');
      void el.rankBox.offsetWidth;
      el.rankBox.classList.add('pop');
    }
    const lapNow = Math.max(1, Math.min(race.laps, Math.floor(Math.max(0, p.d) / race.L) + 1));
    if (L.lap !== lapNow) {
      L.lap = lapNow;
      el.lapN.textContent = lapNow;
      el.lapPill.classList.toggle('final', lapNow === race.laps && race.laps > 1);
    }
    const t = race.state === 'run' || race.state === 'finish' || race.state === 'end' ? (p.finished ? p.finishTime : race.clock) : 0;
    const ts = fmtTime(t);
    if (L.ts !== ts) {
      L.ts = ts;
      el.timer.textContent = ts;
    }
    const left = race.timeLeft();
    const lt = left === null ? '' : `남은 시간 ${Math.ceil(left)}초`;
    if (L.lt !== lt) {
      L.lt = lt;
      el.timeleft.textContent = lt;
      el.timeleft.classList.toggle('hidden', !lt);
    }
    const total = race.total;
    race.runners.forEach((r, i) => {
      const f = Math.max(0, Math.min(1, r.d / total));
      this.dots[i].style.left = `${(f * 100).toFixed(2)}%`;
      this.dots[i].style.display = r.gone ? 'none' : '';
    });
    // standings (refresh a few times a second)
    if (!L.bt || race.t - L.bt > 0.25) {
      L.bt = race.t;
      const order = race.order || race.runners;
      const key = order.map((r) => r.idx).join(',');
      if (key !== L.board) {
        L.board = key;
        el.board.replaceChildren(...order.map((r) => this.rows[race.runners.indexOf(r)]));
      }
    }
    if (!L.mt || race.t - L.mt > 1 / 20) {
      L.mt = race.t;
      this.drawMinimap(race);
    }
    const g = p.gauge;
    const gk = Math.round(g);
    if (L.g !== gk) {
      L.g = gk;
      el.cells[0].style.width = `${Math.min(100, (g / 50) * 100)}%`;
      el.cells[1].style.width = `${Math.max(0, Math.min(100, ((g - 50) / 50) * 100))}%`;
      el.gauge.classList.toggle('ready', g >= 50);
    }
    const sp = p.boostT > 0;
    if (L.sp !== sp) {
      L.sp = sp;
      el.speed.classList.toggle('on', sp);
    }
  }

  lap(n, total, lapTime) {
    const el = this.el;
    el.lapPill.classList.remove('pop');
    void el.lapPill.offsetWidth;
    el.lapPill.classList.add('pop');
    el.laptime.textContent = `${n - 1}바퀴 기록 ${fmtTime(lapTime)}`;
    el.laptime.classList.remove('show');
    void el.laptime.offsetWidth;
    el.laptime.classList.add('show');
  }

  countdown(text) {
    const el = this.el.count;
    el.textContent = text;
    el.className = 'count';
    void el.offsetWidth;
    el.className = `count show${text === 'GO!' ? ' go' : ''}`;
  }

  message(text, kind = '') {
    if (!text) return;
    const m = document.createElement('div');
    m.className = `msg ${kind}`;
    m.textContent = text;
    this.el.msgs.appendChild(m);
    while (this.el.msgs.children.length > 3) this.el.msgs.firstChild.remove();
    setTimeout(() => m.remove(), 1500);
  }

  flash(color = '#ffffff', dur = 0.35) {
    const f = this.el.flash;
    f.style.background = color;
    f.style.transition = 'none';
    f.style.opacity = '0.75';
    void f.offsetWidth;
    f.style.transition = `opacity ${dur}s ease-out`;
    f.style.opacity = '0';
  }

  itemGot(item) {
    const el = this.el;
    el.itemIcon.textContent = item ? ITEMS[item].icon : '';
    el.itemSlot.classList.toggle('has', !!item);
    el.itemSlot.title = item ? ITEMS[item].name : '';
    if (item) {
      el.itemSlot.classList.remove('spin');
      void el.itemSlot.offsetWidth;
      el.itemSlot.classList.add('spin');
    }
  }

  finish(text, place) {
    const f = this.el.finish;
    f.textContent = text;
    f.className = `finish-banner show${place === 1 ? ' gold' : ''}`;
  }

  clearFinish() {
    this.el.finish.className = 'finish-banner';
  }

  // award ceremony: hide the race widgets, flash to the podium
  ceremony() {
    this.clearFinish();
    this.root.classList.add('ceremony');
    this.flash('#ffffff', 0.5);
  }
}
