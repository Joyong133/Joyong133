// Settings and best records, saved in this browser.
const KEY = 'fairy-runners-v1';

const DEFAULTS = {
  char: 'harang',
  mode: 'speed',
  diff: 'normal',
  map: 0,
  music: true,
  sfx: true,
  quality: null,
  records: {},
};

let data = null;

function load() {
  if (data) return data;
  data = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(data, JSON.parse(raw));
  } catch (e) {
    /* storage unavailable */
  }
  data.records ||= {};
  return data;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    /* ignore */
  }
}

export const store = {
  get(k) {
    return load()[k];
  },
  set(k, v) {
    load()[k] = v;
    save();
  },
  record(mapId) {
    return load().records[mapId] || null;
  },
  // Returns true when this is a new best time.
  submit(mapId, time, rank) {
    const d = load();
    const r = d.records[mapId] || {};
    let best = false;
    if (time && (!r.time || time < r.time)) {
      r.time = time;
      best = true;
    }
    if (rank && (!r.rank || rank < r.rank)) r.rank = rank;
    r.plays = (r.plays || 0) + 1;
    d.records[mapId] = r;
    save();
    return best;
  },
};
