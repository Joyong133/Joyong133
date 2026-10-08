// In-race HUD (DOM overlay): rank, timer, progress bar, boost gauge,
// item slot, standings, countdown and pop-up messages.
import { ITEMS } from '../game/items.js';

export function fmtTime(t) {
  if (t === null || t === undefined) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const c = Math.floor((t * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

const DOT_COLORS = ['#ffd23f', '#ff8a8a', '#7fd4ff', '#9be07b', '#ffb36b', '#d9a3ff', '#ff9ad5', '#ffffff'];

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="hud-tl">
        <div class="rank"><b>1</b><span class="of">/8</span><span class="wi">위</span></div>
        <div class="mapname"></div>
      </div>
      <div class="hud-tc">
        <div class="timer">00:00.00</div>
        <div class="timeleft hidden"></div>
        <div class="prog"><div class="track"></div><div class="flag">🏁</div></div>
      </div>
      <ol class="board"></ol>
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
      <div class="banner"><div class="b-sub"></div><div class="b-name"></div></div>
      <div class="speedlines"></div>
      <div class="flash"></div>
      <div class="finish-banner"></div>
    `;
    const q = (s) => root.querySelector(s);
    this.el = {
      rank: q('.rank b'),
      of: q('.rank .of'),
      rankBox: q('.rank'),
      mapname: q('.mapname'),
      timer: q('.timer'),
      timeleft: q('.timeleft'),
      track: q('.prog .track'),
      prog: q('.prog'),
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
      speed: q('.speedlines'),
      flash: q('.flash'),
      finish: q('.finish-banner'),
    };
    this.last = {};
  }

  setup(race) {
    const el = this.el;
    this.race = race;
    this.root.classList.remove('hidden');
    this.root.classList.toggle('solo', race.mode === 'time');
    this.root.classList.toggle('items', race.mode === 'item');
    el.mapname.textContent = race.map.name;
    el.of.textContent = `/${race.runners.length}`;
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
    for (const cp of race.course.checkpoints.slice(1)) {
      const t = document.createElement('div');
      t.className = 'tick';
      t.style.left = `${(cp.s / race.course.goalS) * 100}%`;
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
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
    this.itemGot(null);
    this.last = {};
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
    const goal = race.course.goalS;
    race.runners.forEach((r, i) => {
      const f = Math.max(0, Math.min(1, r.s / goal));
      this.dots[i].style.left = `${(f * 100).toFixed(2)}%`;
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
}
