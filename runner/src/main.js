import { App } from './app.js';

const app = new App();
window.__app = app;

// ?race=3&mode=item&auto  → jump straight into a race (handy for testing)
const q = new URLSearchParams(location.search);
if (q.has('race')) {
  app.startRace({
    mapIdx: Math.max(0, Math.min(9, (+q.get('race') || 1) - 1)),
    charId: q.get('char') || 'harang',
    mode: q.get('mode') || 'speed',
    diff: q.get('diff') || 'normal',
    auto: q.has('auto'),
  });
}
