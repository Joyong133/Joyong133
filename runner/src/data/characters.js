// Playable runners. Stats are 1–5: spd 최고 속도, acc 가속, jmp 점프, pow 힘(밀치기/버티기), ctl 컨트롤(공중·빙판 조작).
export const CHARACTERS = [
  {
    id: 'harang',
    name: '하랑',
    title: '씩씩한 모험가',
    desc: '빨간 모자를 쓴 동네 대장. 모든 능력이 고르게 좋아서 처음 달리기에 딱 맞아요.',
    stats: { spd: 3, acc: 3, jmp: 3, pow: 3, ctl: 3 },
    colors: { skin: 0xffdcc2, hair: 0x4a2c1a, top: 0x3d7be0, bottom: 0x2b3550, shoes: 0xe84a3c, accent: 0xe83f3f },
    hair: 'short',
    hat: 'cap',
  },
  {
    id: 'bori',
    name: '보리',
    title: '깡충 토끼 소녀',
    desc: '토끼 귀 머리띠가 트레이드마크. 출발이 엄청 빠르고 점프도 가뿐해요.',
    stats: { spd: 3, acc: 5, jmp: 4, pow: 1, ctl: 3 },
    colors: { skin: 0xffe0cc, hair: 0xf2b24a, top: 0xff8fb8, bottom: 0xffffff, shoes: 0xff6f9a, accent: 0xffffff },
    hair: 'twin',
    hat: 'bunny',
  },
  {
    id: 'gomdol',
    name: '곰돌',
    title: '든든한 곰 탐험대',
    desc: '곰 모자를 눌러쓴 힘센 친구. 부딪혀도 잘 밀리지 않고 장애물도 잘 버텨요.',
    stats: { spd: 3, acc: 2, jmp: 2, pow: 5, ctl: 3 },
    colors: { skin: 0xf5cfa8, hair: 0x3a2414, top: 0x6fae3e, bottom: 0x5b3b22, shoes: 0x3b2a1e, accent: 0x9a6a3f },
    hair: 'short',
    hat: 'bear',
    tail: 'bear',
    scale: 1.1,
  },
  {
    id: 'luna',
    name: '루나',
    title: '별빛 꼬마 마법사',
    desc: '별 모자를 쓴 견습 마법사. 최고 속도는 최강이지만 방향 전환이 조금 서툴러요.',
    stats: { spd: 5, acc: 2, jmp: 3, pow: 2, ctl: 2 },
    colors: { skin: 0xffe2d0, hair: 0xb08cff, top: 0x4b3a9e, bottom: 0x2e2366, shoes: 0x2e2366, accent: 0xffd84a },
    hair: 'long',
    hat: 'witch',
  },
  {
    id: 'nabi',
    name: '나비',
    title: '날쌘 고양이 소녀',
    desc: '고양이처럼 가볍게 뛰어올라요. 점프와 공중 조작이 뛰어난 대신 힘이 약해요.',
    stats: { spd: 2, acc: 4, jmp: 5, pow: 1, ctl: 5 },
    colors: { skin: 0xffe4d2, hair: 0x2c2c38, top: 0xffd23f, bottom: 0x2c2c38, shoes: 0xffffff, accent: 0x2c2c38 },
    hair: 'bob',
    hat: 'cat',
    tail: 'cat',
  },
  {
    id: 'bolt',
    name: '볼트',
    title: '태엽 로봇',
    desc: '태엽을 감으면 끝까지 달리는 로봇. 빠르고 묵직하지만 점프가 낮아요.',
    stats: { spd: 4, acc: 2, jmp: 1, pow: 4, ctl: 3 },
    colors: { skin: 0xc9d3e0, hair: 0x8a97ab, top: 0x9fb2c9, bottom: 0x6b7a90, shoes: 0x4a5568, accent: 0x38e0ff },
    hair: 'none',
    hat: 'robot',
    robot: true,
  },
  {
    id: 'pipi',
    name: '피피',
    title: '나무 인형 소년',
    desc: '요정의 마법으로 움직이는 나무 인형. 몸이 가벼워 조작이 정교해요.',
    stats: { spd: 3, acc: 3, jmp: 3, pow: 2, ctl: 5 },
    colors: { skin: 0xe2b07a, hair: 0x6b3f1e, top: 0xe8483c, bottom: 0xf2d04a, shoes: 0x6b3f1e, accent: 0x3a8f4a },
    hair: 'short',
    hat: 'puppet',
    nose: true,
  },
  {
    id: 'ari',
    name: '아리',
    title: '여우 꼬리 소녀',
    desc: '복슬복슬 꼬리를 흔들며 달리는 여우 소녀. 속도와 가속이 모두 좋아요.',
    stats: { spd: 4, acc: 4, jmp: 3, pow: 2, ctl: 2 },
    colors: { skin: 0xffe1cf, hair: 0xff8a3c, top: 0xffffff, bottom: 0xd94a3a, shoes: 0x3a2a2a, accent: 0xff8a3c },
    hair: 'long',
    hat: 'fox',
    tail: 'fox',
  },
];

export const STAT_LABELS = {
  spd: '속도',
  acc: '가속',
  jmp: '점프',
  pow: '힘',
  ctl: '컨트롤',
};

// Turn 1–5 stats into physics numbers.
export function physicsFor(ch) {
  const s = ch.stats;
  return {
    maxSpeed: 10.3 + 0.42 * s.spd,
    accel: 15 + 4.2 * s.acc,
    jumpV: 10.6 + 0.42 * s.jmp,
    mass: 0.7 + 0.18 * s.pow,
    knockMul: 1.22 - 0.08 * s.pow,
    airCtl: 0.42 + 0.1 * s.ctl,
    grip: 0.75 + 0.1 * s.ctl,
    turn: 9 + 1.6 * s.ctl,
  };
}

export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
