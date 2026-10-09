// The ten circuits. Each `build(b)` script lays the track out segment by
// segment with the CourseBuilder API (see world/builder.js) and ends back on
// the start line: two straights marked { flex: 'a' } / { flex: 'b' } are
// sized automatically so the loop closes, and { rise: 'close' } levels it.
//   curve(deg > 0 = right), curveRamp(deg, r, rise), ramp(len, rise), gap(len), jumpPad(gapLen)
//   stones / movers / discs / tiles — platform sections
//   spinBars / hammers / pushers / rollers / crushers / bumpers / doors / wind / meteors
//   options: { w, surface, rails, stars: 'line'|'wave'|'zig', items, boost: [fractions], cp }
export const MAPS = [
  {
    id: 'meadow',
    theme: 'meadow',
    name: '동화 초원',
    sub: '첫 번째 이야기',
    desc: '풍차가 도는 초원 위 나무 다리 길. 점프와 회전 막대로 몸을 풀어요.',
    level: 1,
    laps: 3,
    build(b) {
      b.start();
      b.straight(20, { stars: 'line', boost: [0.6] });
      b.gap(3.5);
      b.straight(14, { cp: true });
      b.spinBars(28, 2, { speed: 1.3 });
      b.curve(90, 20, { stars: 'wave' });
      b.straight(14, { items: true });
      b.jumpPad(10);
      b.straight(14);
      b.bumpers(30, 4);
      b.curve(90, 20);
      b.ramp(14, 3);
      b.stones(4, { size: 3.4, gap: 2.2, amp: 1.8 });
      b.straight(12, { cp: true, items: true });
      b.ramp(12, -3);
      b.straight(20, { flex: 'a', rise: 'close', stars: 'zig' });
      b.curve(90, 20, { stars: 'wave' });
      b.hammers(24, 2, { speed: 1.6 });
      b.straight(12);
      b.straight(30, { flex: 'b', boost: [0.4] });
      b.curve(90, 20);
      b.close();
    },
  },
  {
    id: 'candy',
    theme: 'candy',
    name: '과자 숲',
    sub: '헨젤과 그레텔',
    desc: '초콜릿 강 위로 이어진 사탕 길. 통통 튀는 젤리와 굴러오는 케이크를 조심!',
    level: 2,
    laps: 3,
    build(b) {
      b.start();
      b.straight(20, { stars: 'line' });
      b.jelly(20);
      b.straight(10, { items: true });
      b.spinBars(24, 2, { speed: 1.6 });
      b.curve(90, 20, { stars: 'wave' });
      b.rollers(30, 4, { interval: 1.6 });
      b.straight(10, { cp: true });
      b.conveyor(22, -4);
      b.gap(4);
      b.straight(10);
      b.curveRamp(90, 20, -4);
      b.stones(5, { round: true, size: 3.2, gap: 2.4, amp: 2.0 });
      b.straight(12, { cp: true, items: true });
      b.doors({ n: 4, fake: 2 });
      b.straight(30, { flex: 'a', rise: 'close', stars: 'line', boost: [0.5] });
      b.curve(90, 20);
      b.hammers(24, 2, { speed: 1.7 });
      b.jumpPad(12);
      b.straight(12, { items: true });
      b.jelly(14);
      b.straight(14, { flex: 'b' });
      b.curve(90, 20, { stars: 'wave' });
      b.close();
    },
  },
  {
    id: 'wonder',
    theme: 'wonder',
    name: '이상한 나라 체스판',
    sub: '앨리스의 꿈',
    desc: '하늘에 뜬 체스판 길. 카드 병정이 밀어내고, 진짜 문을 골라야 지나갈 수 있어요.',
    level: 3,
    laps: 3,
    build(b) {
      b.start();
      b.straight(16, { stars: 'line' });
      b.pushers(30, 4);
      b.straight(10, { items: true, cp: true });
      b.curve(90, 18, { stars: 'wave' });
      b.discs(3, { r: 3.6, speed: 1.0 });
      b.straight(8);
      b.doors({ n: 5, fake: 3 });
      b.stones(4, { size: 2.8, gap: 2.4, amp: 1.8 });
      b.curve(90, 18);
      b.tiles(22);
      b.straight(10, { items: true, cp: true });
      b.stairs(4, 0.6, 2.4);
      b.straight(8);
      b.straight(24, { flex: 'a', stars: 'wave' });
      b.curve(90, 18);
      b.spinBars(26, 2, { speed: 2.0 });
      b.ramp(12, -2.4);
      b.hammers(22, 2, { speed: 1.9 });
      b.straight(12, { flex: 'b', rise: 'close', boost: [0.5] });
      b.curve(90, 18);
      b.close();
    },
  },
  {
    id: 'beanstalk',
    theme: 'beanstalk',
    name: '콩나무 하늘길',
    sub: '잭과 콩나무',
    desc: '구름 위로 쭉쭉 올라가는 덩굴 길. 떠다니는 구름 발판과 돌풍을 넘어 거인의 성으로!',
    level: 3,
    laps: 3,
    build(b) {
      b.start();
      b.straight(14, { stars: 'line' });
      b.wind(28, { force: 11, period: 4 });
      b.straight(10, { items: true });
      b.curveRamp(90, 22, 5, { rails: true, stars: 'line' });
      b.straight(6);
      b.movers(4, { axis: 'x', amp: 2.4, period: 3.6, look: 'cloud' });
      b.straight(12, { cp: true, items: true });
      b.spinBars(22, 2, { speed: 1.8 });
      b.straight(10);
      b.curveRamp(90, 22, 5, { rails: true });
      b.straight(6);
      b.stones(5, { size: 3.2, gap: 2.4, amp: 1.8, rise: 0.4 });
      b.straight(10, { cp: true });
      b.straight(24, { flex: 'a', stars: 'zig' });
      b.curveRamp(90, 22, -6, { rails: true, stars: 'wave' });
      b.straight(6);
      b.movers(4, { axis: 'y', amp: 1.3, period: 2.8, look: 'cloud' });
      b.straight(10, { cp: true, items: true });
      b.straight(12, { flex: 'b', rise: 'close', boost: [0.5] });
      b.curveRamp(90, 22, -6, { rails: true });
      b.close();
    },
  },
  {
    id: 'sea',
    theme: 'sea',
    name: '인어의 바닷속',
    sub: '인어공주',
    desc: '몸이 둥실 떠오르는 바닷속 길. 해류에 휩쓸리지 않게 조심하고 조개 발판을 건너요.',
    level: 4,
    laps: 2,
    build(b) {
      b.start();
      b.straight(20, { stars: 'wave' });
      b.wind(36, { force: 10, period: 5, rails: true });
      b.movers(4, { axis: 'y', amp: 1.5, period: 3.0 });
      b.straight(12, { cp: true, items: true });
      b.curve(90, 22);
      b.discs(3, { r: 3.8, speed: 1.2 });
      b.straight(10);
      b.spinBars(28, 2, { speed: 1.5 });
      b.straight(8);
      b.jumpPad(14, { power: 12 });
      b.straight(12, { cp: true });
      b.curve(90, 22);
      b.rollers(32, 4, { interval: 1.4 });
      b.straight(10, { items: true });
      b.stones(5, { round: true, size: 3.2, gap: 2.6, amp: 2.0 });
      b.ramp(10, -4);
      b.straight(28, { flex: 'a', rise: 'close', stars: 'line' });
      b.curve(90, 22);
      b.pushers(30, 3);
      b.movers(3, { axis: 'x', amp: 2.8, period: 3.2 });
      b.straight(12, { items: true });
      b.hammers(26, 2, { speed: 1.6 });
      b.straight(14, { flex: 'b', boost: [0.5] });
      b.curve(90, 22, { stars: 'wave' });
      b.close();
    },
  },
  {
    id: 'snow',
    theme: 'snow',
    name: '눈의 여왕 얼음성',
    sub: '눈의 여왕',
    desc: '미끄러운 빙판과 굴러오는 눈덩이! 난간 없는 얼음길에서 미끄러지지 않게 조심해요.',
    level: 4,
    laps: 2,
    build(b) {
      b.start();
      b.straight(16, { stars: 'line' });
      b.ice(26, { stars: 'line', rails: true });
      b.straight(10, { cp: true, items: true });
      b.rollers(34, 5, { interval: 1.4 });
      b.curve(90, 22, { surface: 'ice', rails: true });
      b.straight(6);
      b.tiles(22);
      b.straight(10, { cp: true });
      b.pushers(28, 3);
      b.movers(4, { axis: 'x', amp: 2.6, period: 3.4 });
      b.straight(8);
      b.curveRamp(90, 22, -5, { surface: 'ice', rails: true });
      b.straight(12, { items: true, cp: true });
      b.ice(22);
      b.spinBars(26, 2, { speed: 1.8 });
      b.stairs(4, 0.5, 2.4);
      b.ramp(10, -2);
      b.straight(24, { flex: 'a', rise: 'close' });
      b.curve(90, 22);
      b.straight(10);
      b.jumpPad(14);
      b.straight(14, { cp: true });
      b.hammers(28, 2, { speed: 1.8 });
      b.ice(20, { stars: 'wave', rails: true });
      b.straight(16, { flex: 'b', boost: [0.5] });
      b.curve(90, 22, { surface: 'ice', rails: true });
      b.close();
    },
  },
  {
    id: 'oz',
    theme: 'oz',
    name: '오즈의 노란 벽돌길',
    sub: '오즈의 마법사',
    desc: '회오리바람이 부는 노란 벽돌길을 따라 에메랄드 성으로. 좁은 다리에서 떨어지면 양귀비 꽃밭으로 쿨쿨!',
    level: 5,
    laps: 2,
    build(b) {
      b.start();
      b.straight(18, { stars: 'line' });
      b.wind(36, { force: 14, period: 3.2 });
      b.straight(10, { items: true, cp: true });
      b.straight(26, { w: 3.4, stars: 'line' });
      b.straight(8);
      b.curve(90, 18);
      b.doors({ n: 4, fake: 2 });
      b.straight(10, { cp: true });
      b.stones(6, { size: 2.8, gap: 2.6, amp: 1.8 });
      b.straight(10, { items: true });
      b.crushers(32, 2);
      b.straight(6);
      b.curve(90, 18);
      b.movers(4, { axis: 'x', amp: 3, period: 2.8 });
      b.straight(12, { cp: true });
      b.tiles(24);
      b.spinBars(26, 2, { speed: 2.2 });
      b.straight(28, { flex: 'a', rise: 'close', stars: 'zig' });
      b.curve(90, 18);
      b.wind(30, { dir: 1, force: 8, w: 6 });
      b.straight(8);
      b.jumpPad(12);
      b.straight(14, { items: true });
      b.hammers(24, 3, { speed: 2.0 });
      b.straight(16, { flex: 'b', boost: [0.5] });
      b.curve(90, 18, { stars: 'wave' });
      b.close();
    },
  },
  {
    id: 'clock',
    theme: 'clock',
    name: '자정의 시계탑',
    sub: '신데렐라',
    desc: '열두 시 종이 울리기 전에! 톱니바퀴와 시계추, 쿵쿵 블록이 가득한 밤의 시계탑.',
    level: 6,
    laps: 2,
    build(b) {
      b.start();
      b.straight(14, { stars: 'line' });
      b.stairs(5, 0.6, 2.2);
      b.straight(8);
      b.discs(4, { r: 3.4, speed: 1.4 });
      b.straight(12, { cp: true, items: true });
      b.curve(90, 16);
      b.hammers(32, 3, { speed: 2.2 });
      b.conveyor(24, -5);
      b.straight(10, { cp: true });
      b.doors({ n: 5, fake: 3 });
      b.pushers(26, 4);
      b.curveRamp(90, 18, -3);
      b.crushers(30, 2);
      b.movers(4, { axis: 'x', amp: 2.4, period: 2.6 });
      b.straight(12, { items: true, cp: true });
      b.straight(30, { flex: 'a', stars: 'wave' });
      b.curve(90, 16);
      b.stones(5, { size: 2.8, gap: 2.6, amp: 1.8, rise: 0.4 });
      b.ramp(10, -2);
      b.spinBars(30, 3, { speed: 2.2 });
      b.tiles(22);
      b.straight(12, { flex: 'b', rise: 'close', boost: [0.5] });
      b.curve(90, 16);
      b.close();
    },
  },
  {
    id: 'desert',
    theme: 'desert',
    name: '사막의 램프 궁전',
    sub: '알라딘과 요술 램프',
    desc: '발이 푹푹 빠지는 모래밭과 하늘을 나는 양탄자. 모래 폭풍을 뚫고 램프 궁전으로!',
    level: 6,
    laps: 2,
    build(b) {
      b.start();
      b.straight(16, { stars: 'line' });
      b.sand(22);
      b.movers(4, { axis: 'x', amp: 3, period: 3, look: 'carpet' });
      b.straight(12, { cp: true, items: true });
      b.curve(90, 20);
      b.pushers(30, 4);
      b.straight(8, { cp: true });
      b.doors({ n: 4, fake: 2 });
      b.straight(10, { items: true });
      b.spinBars(26, 2, { speed: 2.3 });
      b.stones(5, { round: true, size: 3, gap: 2.6, amp: 1.8 });
      b.curve(90, 20);
      b.rollers(30, 4, { interval: 1.3 });
      b.straight(10, { cp: true });
      b.jumpPad(12, { dy: -4 });
      b.straight(12);
      b.sand(14);
      b.straight(16, { flex: 'a', rise: 'close', stars: 'line' });
      b.curve(90, 20);
      b.crushers(26, 2);
      b.movers(4, { axis: 'y', amp: 1.4, period: 2.6, look: 'carpet' });
      b.straight(10, { items: true });
      b.wind(24, { force: 13, period: 3 });
      b.straight(30, { flex: 'b', boost: [0.5] });
      b.curve(90, 20);
      b.close();
    },
  },
  {
    id: 'volcano',
    theme: 'volcano',
    name: '용의 화산',
    sub: '용과 용사',
    desc: '하늘에서 불덩이가 떨어지고 발판이 무너지는 마지막 이야기. 용의 문까지 달려라!',
    level: 7,
    laps: 2,
    build(b) {
      b.start();
      b.straight(16, { stars: 'line' });
      b.meteors(36, { interval: 0.8, rails: true });
      b.tiles(26);
      b.straight(12, { cp: true, items: true });
      b.straight(8);
      b.jumpPad(16, { power: 16 });
      b.straight(10);
      b.curve(90, 20);
      b.rollers(34, 6, { interval: 1.4 });
      b.straight(10, { cp: true });
      b.stones(6, { size: 2.8, gap: 2.8, amp: 1.8 });
      b.straight(8);
      b.hammers(28, 3, { speed: 2.3 });
      b.curveRamp(90, 20, -6);
      b.meteors(30, { interval: 0.6 });
      b.movers(4, { axis: 'x', amp: 3, period: 2.6 });
      b.straight(12, { cp: true, items: true });
      b.spinBars(28, 3, { speed: 2.4 });
      b.straight(24, { flex: 'a', rise: 'close' });
      b.curve(90, 20);
      b.crushers(28, 2);
      b.straight(24, { w: 3.4 });
      b.straight(8, { cp: true });
      b.discs(3, { r: 3.4, speed: 1.6 });
      b.straight(10, { items: true });
      b.straight(20, { flex: 'b', boost: [0.5] });
      b.curve(90, 20);
      b.close();
    },
  },
];
