// Items: consumables, monster materials, fish and key items, plus the bag.
export const ITEMS = {
  potion: { name: '회복 포션', kind: 'use', short: 'HP 120 회복', desc: 'HP를 120 회복합니다.', sell: 10 },
  hipotion: { name: '하이 포션', kind: 'use', short: 'HP 350 회복', desc: 'HP를 350 회복합니다.', sell: 30 },
  crystal: { name: '전이 결정', kind: 'use', short: '마을 전이문으로 귀환', desc: '현재 층 마을의 전이문으로 즉시 이동합니다. (전투 중에도 사용 가능)', sell: 40 },
  cake: { name: '트렘블 쇼트케이크', kind: 'use', short: '3분간 공격력 +20%', desc: '3분 동안 공격력 +20%. 입에서 사르르 녹는 제2층 명물.', sell: 20 },
  candy: { name: '꿀사탕', kind: 'use', short: 'HP 60 회복', desc: 'HP를 60 회복합니다. 꼬마 핀이 준 달콤한 사탕.', sell: 2 },

  boarHide: { name: '멧돼지 가죽', kind: 'mat', enh: 1, sell: 12 },
  wolfFang: { name: '늑대 송곳니', kind: 'mat', enh: 1, sell: 20 },
  boarTusk: { name: '보어 킹의 어금니', kind: 'mat', enh: 6, sell: 250 },
  koboldScrap: { name: '코볼트 철편', kind: 'mat', enh: 2, sell: 35 },
  bullHorn: { name: '오록스의 뿔', kind: 'mat', enh: 2, sell: 45 },
  waspSting: { name: '와스프 독침', kind: 'mat', enh: 3, sell: 50 },
  taurusHorn: { name: '타우러스의 뿔', kind: 'mat', enh: 12, sell: 800 },

  fish_minnow: { name: '피라미', kind: 'fish', sell: 6 },
  fish_trout: { name: '송어', kind: 'fish', sell: 18 },
  fish_carp: { name: '잉어', kind: 'fish', sell: 32 },
  fish_rainbow: { name: '무지개송어', kind: 'fish', sell: 70 },
  fish_gold: { name: '황금 잉어', kind: 'fish', sell: 260 },
  fish_lord: { name: '호수의 주인', kind: 'fish', sell: 1500 },
  fish_mesa: { name: '메사 곤들매기', kind: 'fish', sell: 40 },
  fish_cat: { name: '붉은 메기', kind: 'fish', sell: 60 },
  fish_crystal: { name: '수정 빙어', kind: 'fish', sell: 140 },
  fish_dragon: { name: '폭포의 용어', kind: 'fish', sell: 1800 },

  windFlower: { name: '바람꽃', kind: 'key', desc: '제2층 메사 기슭에서만 피는 푸른 꽃. 조련사 미이가 찾고 있다.' },
  lordCoat: { name: '군주의 망토', kind: 'key', desc: '코볼트 로드가 남긴 붉은 망토. 소지하면 최대 HP +60.' },
  rod: { name: '낚싯대', kind: 'key', desc: '낚시꾼 토마에게 받은 낚싯대. 낚시터에서 사용할 수 있다.' },
};

export class Inventory {
  constructor(saved) {
    this.items = { ...(saved || {}) };
  }
  count(id) {
    return this.items[id] || 0;
  }
  has(id) {
    return this.count(id) > 0;
  }
  add(id, n = 1) {
    this.items[id] = this.count(id) + n;
  }
  remove(id, n = 1) {
    if (this.count(id) < n) return false;
    this.items[id] -= n;
    if (this.items[id] <= 0) delete this.items[id];
    return true;
  }
  ofKind(kind) {
    return Object.keys(this.items).filter((id) => ITEMS[id] && ITEMS[id].kind === kind && this.items[id] > 0);
  }
  // enhancement material points
  enhPoints() {
    let p = 0;
    for (const id of this.ofKind('mat')) p += ITEMS[id].enh * this.items[id];
    return p;
  }
  // spend the cheapest materials first until `need` points are paid
  spendEnh(need) {
    const ids = this.ofKind('mat').sort((a, b) => ITEMS[a].enh - ITEMS[b].enh);
    let paid = 0;
    for (const id of ids) {
      while (paid < need && this.count(id) > 0) {
        this.remove(id);
        paid += ITEMS[id].enh;
      }
    }
    return paid >= need;
  }
  // sell every material + fish; returns { col, n }
  sellLoot() {
    let col = 0, n = 0;
    for (const id of [...this.ofKind('mat'), ...this.ofKind('fish')]) {
      col += ITEMS[id].sell * this.items[id];
      n += this.items[id];
      delete this.items[id];
    }
    return { col, n };
  }
  toJSON() {
    return this.items;
  }
}
