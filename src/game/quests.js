// Quest chains: Knight Ellen on floor 1, rancher Hanna and tamer Mii on
// floor 2. Kill quests count monster kills, collect quests count items.
export const CHAINS = {
  ellen: {
    giver: '엘렌',
    quests: [
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
        offer: '미궁 탑으로 가는 길의 폐허 광장에 필드 보스 “보어 킹”이 자리를 잡았어. 소드 스킬 없이는 힘들 거야. 트리거를 길게 눌러 검에 빛이 모이면 크게 휘둘러!',
        progressLine: '보어 킹은 돌진할 때 멈추지 않아. 옆으로 피하고 돌진이 끝난 틈을 노려!',
        doneLine: '정말로 보어 킹을 쓰러뜨렸어?! 대장장이 브로크가 그 어금니로 새 검을 벼려 줬어. 받아!',
      },
      {
        id: 'q4',
        title: '층 보스: 코볼트 로드',
        desc: '미궁 탑 최상층의 보스 방에서 코볼트 로드를 쓰러뜨리세요. HP가 줄면 부하를 부르고, 마지막엔 무기를 바꿔 듭니다. 쓰러뜨리면 제2층으로 가는 계단이 열립니다.',
        target: 'koboldLord',
        need: 1,
        reward: { exp: 2000, col: 2500, potions: 5 },
        offer: '이제 때가 됐어. 필드 북서쪽의 미궁 탑 꼭대기에 이 층의 주인, 코볼트 로드가 있어. 녀석을 쓰러뜨려야 제2층으로 올라갈 수 있지. 도끼는 머리 위로 크게 들어 올렸다가 내려찍어. 바닥이 붉게 빛나면 그 자리를 벗어나!',
        progressLine: '코볼트 로드는 HP가 30% 아래로 떨어지면 무기를 바꿔 들고 훨씬 빨라져. 방심하지 마!',
        doneLine: '…해냈구나. 제1층이 공략됐어! 부유성 전체에 네 이름이 알려질 거야. 광장의 전이문으로 이제 제2층도 오갈 수 있어.',
      },
    ],
  },
  hanna: {
    giver: '한나',
    quests: [
      {
        id: 'f2q1',
        title: '날뛰는 오록스',
        desc: '메사리아 남쪽 초원의 트렘블 오록스 6마리를 진정시키세요(처치). 오록스는 한참 머리를 낮췄다가 곧게 돌진합니다.',
        target: 'bull',
        need: 6,
        reward: { exp: 900, col: 900, hipotions: 3 },
        offer: '어머, 모험가님이구나! 난 목장을 하는 한나야. 요즘 야생 오록스들이 목장 울타리를 들이받고 난리야. 6마리만 혼내 줄래? 오록스는 머리를 낮추면 곧 돌진하니까 옆으로 피해!',
        progressLine: '돌진이 끝나면 한동안 숨을 고르거든. 그 틈에 옆구리를 노려!',
        doneLine: '고마워! 덕분에 소들이 편히 풀을 뜯겠어. 우리 목장 우유로 만든 포션이야.',
      },
      {
        id: 'f2q2',
        title: '바람 말벌 퇴치',
        desc: '메사 절벽 주변을 맴도는 윈드 와스프 6마리를 처치하세요. 공중에서 원을 그리다 급강하합니다. 강하 직전에 검을 대면 튕겨낼 수 있습니다.',
        target: 'wasp',
        need: 6,
        reward: { exp: 1200, col: 1200, crystals: 2 },
        offer: '큰일이야. 서쪽 메사들 사이에 윈드 와스프 무리가 둥지를 틀었어. 꿀벌들이 다 도망갔지 뭐야. 공중에서 빙빙 돌다가 갑자기 내리꽂으니까 조심해!',
        progressLine: '말벌이 높이 떠오르면 곧 내리꽂는 신호야. 검을 앞으로 세워!',
        doneLine: '대단해! 이건 전이 결정이야. 위험할 때 쓰면 마을로 바로 돌아올 수 있어.',
      },
      {
        id: 'f2q3',
        title: '필드 보스: 타우러스 제너럴',
        desc: '남서쪽 협곡의 투기장에 황소 머리의 거인 타우러스 제너럴이 있습니다. 거대한 망치로 땅을 내리치니 바닥의 붉은 원을 피하세요.',
        target: 'taurus',
        need: 1,
        reward: { exp: 4000, col: 5000, sword: 'terra' },
        offer: '마지막 부탁이야. 남서쪽 협곡 투기장에 사는 타우러스 제너럴이 오록스들을 몰고 다녀. 망치로 땅을 내리치면 충격파가 퍼지니까 바닥에 붉은 원이 보이면 무조건 벗어나!',
        progressLine: 'HP가 절반 아래가 되면 녀석이 광분해. 망치를 휘두르는 방향을 잘 봐!',
        doneLine: '믿을 수가 없어… 정말 해냈구나! 이 검은 대장장이 가렛이 메사의 심장석으로 만든 거야. 받아 줘!',
      },
    ],
  },
  mii: {
    giver: '미이',
    quests: [
      {
        id: 'pet',
        title: '작은 용의 알',
        desc: '제2층의 메사 기슭에서 푸르게 빛나는 바람꽃 3송이를 모아 조련사 미이에게 가져가세요. [A]/E 로 채집합니다.',
        target: 'windFlower',
        collect: true,
        need: 3,
        reward: { exp: 300, col: 200, pet: true },
        offer: '안녕! 난 몬스터 조련사 미이야. 이 알… 곧 깨어날 것 같은데 바람꽃 향기가 있어야 부화한대. 메사 절벽 아래에 피는 푸른 바람꽃 3송이만 찾아 줄래?',
        progressLine: '바람꽃은 메사 절벽 바로 아래에 피어 있어. 푸르게 반짝이니까 금방 보일 거야!',
        doneLine: '와아, 알이 움직여! …태어났다! 이 아이, 너를 엄마로 생각하나 봐. 이름은 “큐루”라고 하자. 잘 부탁해!',
      },
    ],
  },
};

export class QuestLog {
  constructor(saved) {
    this.state = {};
    for (const k of Object.keys(CHAINS)) this.state[k] = { idx: 0, active: false, progress: 0 };
    if (saved && 'idx' in saved) Object.assign(this.state.ellen, saved); // v1 save
    else if (saved) for (const k of Object.keys(saved)) if (this.state[k]) Object.assign(this.state[k], saved[k]);
    this.focus = saved?.focus || null;
    this.countItem = () => 0;
  }
  q(chain) {
    return CHAINS[chain].quests[this.state[chain].idx] || null;
  }
  allDone(chain) {
    return this.state[chain].idx >= CHAINS[chain].quests.length;
  }
  active(chain) {
    return this.state[chain].active;
  }
  progress(chain) {
    const q = this.q(chain);
    if (!q) return 0;
    return q.collect ? Math.min(q.need, this.countItem(q.target)) : this.state[chain].progress;
  }
  done(chain) {
    const q = this.q(chain);
    return this.active(chain) && q && this.progress(chain) >= q.need;
  }
  // marker for the giver: '!' offer, '?' ready to turn in
  marker(chain) {
    if (this.allDone(chain)) return null;
    if (this.done(chain)) return '?';
    return this.active(chain) ? null : '!';
  }
  accept(chain) {
    const s = this.state[chain];
    s.active = true;
    s.progress = 0;
    this.focus = chain;
  }
  // returns the chains whose progress moved
  onKill(typeId) {
    const out = [];
    for (const chain of Object.keys(CHAINS)) {
      const s = this.state[chain];
      const q = this.q(chain);
      if (!s.active || !q || q.collect || q.target !== typeId || s.progress >= q.need) continue;
      s.progress++;
      out.push(chain);
    }
    return out;
  }
  complete(chain) {
    const q = this.q(chain);
    const s = this.state[chain];
    s.idx++;
    s.active = false;
    s.progress = 0;
    if (this.focus === chain) this.focus = this.activeChains()[0] || null;
    return q;
  }
  activeChains() {
    return Object.keys(CHAINS).filter((c) => this.state[c].active && this.q(c));
  }
  hudText() {
    const chain = this.focus && this.state[this.focus].active ? this.focus : this.activeChains()[0];
    if (!chain) return '';
    const q = this.q(chain);
    if (this.done(chain)) return `${q.title} — 완료! ${CHAINS[chain].giver}에게 보고`;
    return `${q.title}  ${this.progress(chain)} / ${q.need}`;
  }
  summaries() {
    return this.activeChains().map((chain) => {
      const q = this.q(chain);
      const p = this.progress(chain);
      return { chain, giver: CHAINS[chain].giver, title: q.title, desc: q.desc, progress: p, need: q.need, done: p >= q.need, progressText: `진행도  ${p} / ${q.need}` };
    });
  }
  toJSON() {
    return { ...this.state, focus: this.focus };
  }
}
