// Quest chain given by Knight Ellen in the plaza.
export const QUESTS = [
  {
    id: 'q1',
    title: '첫 번째 사냥',
    desc: '남쪽 초원의 와일드 보어 5마리를 처치하세요. 광장의 전이문에 들어가면 초원 전초기지로 바로 이동할 수 있습니다.',
    target: 'boar',
    need: 5,
    reward: { exp: 150, col: 300, potions: 3 },
    offer: '어서 와, 신입 검사. 부유성 제1층에 온 걸 환영해! 요즘 남쪽 초원의 멧돼지들이 사나워져서 상인들이 곤란해하고 있어. 와일드 보어 5마리를 처치해 줄 수 있겠어?',
    progressLine: '아직 멧돼지가 남아 있어. 검은 실제로 힘껏 휘둘러야 제대로 들어가!',
    doneLine: '해냈구나! 검 다루는 솜씨가 제법인걸. 약속한 보수야.',
  },
  {
    id: 'q2',
    title: '늑대 무리 소탕',
    desc: '남동쪽 숲에 출몰하는 그레이 울프 5마리를 처치하세요. 늑대는 빠르게 달려드니 공격 직전 검으로 막아(패링) 보세요.',
    target: 'wolf',
    need: 5,
    reward: { exp: 400, col: 600, potions: 3 },
    offer: '다음은 조금 위험해. 남동쪽 숲에 그레이 울프 무리가 나타났어. 녀석들은 몸을 낮췄다가 순식간에 달려들어. 타이밍 맞춰 검을 대면 튕겨낼 수 있을 거야.',
    progressLine: '늑대는 달려들기 직전에 몸을 낮춰. 그 순간을 노려!',
    doneLine: '대단해! 이제 마을 사람들도 숲길을 다닐 수 있겠어.',
  },
  {
    id: 'q3',
    title: '필드 보스: 보어 킹',
    desc: '미궁 탑으로 향하는 길목의 폐허 광장에 거대한 보어 킹이 나타났습니다. 쓰러뜨리고 어금니를 가져오세요.',
    target: 'boss',
    need: 1,
    reward: { exp: 1200, col: 2000, sword: 'azure' },
    offer: '마지막 부탁이야. 미궁 탑으로 가는 길의 폐허 광장에 필드 보스 “보어 킹”이 자리를 잡았어. 소드 스킬 없이는 힘들 거야. 트리거를 길게 눌러 검에 빛이 모이면 크게 휘둘러!',
    progressLine: '보어 킹은 돌진할 때 멈추지 않아. 옆으로 피하고 돌진이 끝난 틈을 노려!',
    doneLine: '정말로 보어 킹을 쓰러뜨렸어?! 대장장이 브로크가 그 어금니로 새 검을 벼려 줬어. 받아!',
  },
];

export class QuestLog {
  constructor(saved) {
    this.idx = saved?.idx ?? 0;
    this.active = saved?.active ?? false;
    this.progress = saved?.progress ?? 0;
  }
  get current() {
    return QUESTS[this.idx] || null;
  }
  get allDone() {
    return this.idx >= QUESTS.length;
  }
  get done() {
    return this.active && this.current && this.progress >= this.current.need;
  }
  accept() {
    this.active = true;
    this.progress = 0;
  }
  onKill(typeId) {
    if (!this.active || !this.current) return false;
    if (this.current.target !== typeId || this.progress >= this.current.need) return false;
    this.progress++;
    return true;
  }
  complete() {
    const q = this.current;
    this.idx++;
    this.active = false;
    this.progress = 0;
    return q;
  }
  hudText() {
    const q = this.current;
    if (!q || !this.active) return '';
    if (this.done) return `${q.title} — 완료! 엘렌에게 보고`;
    return `${q.title}  ${this.progress} / ${q.need}`;
  }
  summary() {
    const q = this.current;
    if (!q || !this.active) return null;
    return {
      title: q.title,
      desc: q.desc,
      progress: this.progress,
      need: q.need,
      done: this.done,
      progressText: `진행도  ${this.progress} / ${q.need}`,
    };
  }
  toJSON() {
    return { idx: this.idx, active: this.active, progress: this.progress };
  }
}
