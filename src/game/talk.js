// What every NPC says. Dialog trees are plain functions: each line offers up
// to four choices, and choices call back into the game (shops, quests,
// mini-games, the smith's anvil, the card table…).
import { ITEMS } from './inventory.js';
import { SWORDS } from './sword.js';

export const ENH_RATE = [100, 100, 90, 80, 70, 60, 50, 40, 30, 25];
export const ENH_MAX = 10;

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = () => ({ v: 1 + Math.floor(Math.random() * 13), s: SUITS[Math.floor(Math.random() * 4)] });
const cardName = (c) => `${c.s} ${RANKS[c.v]}`;

const RUMORS = [
  '보어 킹은 쓰러뜨려도 90초쯤 지나면 폐허 광장에 다시 나타난대. 어금니는 대장장이가 비싸게 쳐 주지.',
  '거울 호수엔 “호수의 주인”이라는 거대한 물고기가 산다더라. 낚싯대를 뒤로 힘껏 당기면서 릴을 미친 듯이 감아야 한대.',
  '코볼트 로드는 체력이 30% 아래로 떨어지면 도끼와 방패를 버리고 곡도를 뽑는대. 그때부터 훨씬 빨라지니 조심해.',
  '보스가 망치나 도끼를 머리 위로 치켜들면 바닥에 붉은 원이 생겨. 그 원 밖으로 피하면 충격파를 안 맞아. PC라면 점프로 넘을 수도 있고.',
  '제2층 메사 절벽 아래엔 푸르게 빛나는 “바람꽃”이 핀대. 조련사 미이가 그걸 찾고 있다던데.',
  '제2층 명물 트렘블 쇼트케이크를 먹으면 한동안 공격력이 오른대. 상인 벨라가 팔고 있어.',
  '대장장이에게 몬스터 재료를 가져가면 검을 강화해 줘. +3까지는 거의 실패가 없지만 그 뒤로는 운이야.',
  '전이 결정을 쓰면 싸우다가도 곧장 마을 전이문으로 돌아올 수 있어. 비싸지만 목숨값이지.',
  '늑대가 몸을 낮추는 순간 검을 앞으로 세우면 튕겨낼 수 있어. 그게 패링이야.',
  '메뉴의 “지도” 탭을 열면 퀘스트 표시(!)와 전이문 위치가 다 나와. 길 잃지 말라고.',
];

export function talk(game, npc) {
  const T = TALK[npc.id];
  if (T) T(game, npc);
  else game.say(npc, '…….', [{ label: '…' }]);
}

// generic quest-giver flow for a chain
function questTalk(game, npc, chain, allDoneLine) {
  const qs = game.quests;
  if (qs.allDone(chain)) return game.say(npc, allDoneLine, [{ label: '알겠어' }]);
  const q = qs.q(chain);
  if (q.requires && !q.requires(game)) return game.say(npc, q.lockedLine, [{ label: '알겠어' }]);
  if (!qs.active(chain)) {
    return game.say(npc, q.offer, [
      { label: '수락한다', action: () => game.acceptQuest(chain) },
      { label: '나중에' },
    ]);
  }
  if (qs.done(chain)) return game.say(npc, q.doneLine, [{ label: '보상 받기', action: () => game.completeQuest(chain) }]);
  game.say(npc, `${q.progressLine}  (${qs.progress(chain)} / ${q.need})`, [{ label: '다녀올게' }]);
}

function lootValue(game, kinds) {
  let col = 0, n = 0;
  for (const k of kinds) for (const id of game.inv.ofKind(k)) { col += ITEMS[id].sell * game.inv.count(id); n += game.inv.count(id); }
  return { col, n };
}

function shopTalk(game, npc, greeting, wares) {
  const loot = lootValue(game, ['mat', 'fish']);
  const p = game.player;
  game.say(npc, `${greeting}  (소지금 ${p.col} Col)`, [
    { label: '물건 사기', action: () => buyMenu(game, npc, wares) },
    { label: loot.n ? `전리품 판매 (+${loot.col})` : '전리품 판매', action: () => game.sellLoot(['mat', 'fish']) },
    { label: '괜찮아요' },
  ]);
}

function buyMenu(game, npc, wares) {
  game.say(npc, `무엇을 드릴까요?  (소지금 ${game.player.col} Col)\n` + wares.map((w) => `· ${ITEMS[w.id].name}${w.n > 1 ? ` ×${w.n}` : ''} — ${w.price} Col  (${ITEMS[w.id].short})`).join('\n'), [
    ...wares.map((w) => ({ label: `${ITEMS[w.id].name}${w.n > 1 ? ` ×${w.n}` : ''} (${w.price})`, action: () => { game.buy(w.id, w.n, w.price); buyMenu(game, npc, wares); } })),
    { label: '그만' },
  ]);
}

function smithTalk(game, npc, line) {
  const p = game.player;
  const def = SWORDS[p.swordId];
  game.say(npc, `${line}\n지금 검: ${def.name}${p.swordPlus ? ` +${p.swordPlus}` : ''}`, [
    { label: '검 강화', action: () => enhanceMenu(game, npc) },
    { label: '재료 판매', action: () => game.sellLoot(['mat']) },
    { label: '고마워' },
  ]);
}

function enhanceMenu(game, npc) {
  const p = game.player;
  const L = p.swordPlus;
  if (L >= ENH_MAX) return game.say(npc, `+${ENH_MAX}! 더 이상은 내 솜씨로도 무리야. 이 정도면 전설의 검이지.`, [{ label: '고마워' }]);
  const col = 150 * (L + 1);
  const pts = 2 * (L + 1);
  const have = game.inv.enhPoints();
  const rate = ENH_RATE[L];
  const can = p.col >= col && have >= pts;
  game.say(
    npc,
    `+${L} → +${L + 1} 강화  ·  성공률 ${rate}%\n필요: ${col} Col, 재료 ${pts}pt  (보유 ${p.col} Col · 재료 ${have}pt)\n재료 포인트: 가죽/송곳니 1 · 코볼트 철편/오록스 뿔 2 · 와스프 독침 3 · 보스 재료는 그 이상.\n실패하면 재료와 Col만 사라지고 검은 무사해.`,
    [
      { label: can ? `강화한다 (${rate}%)` : '재료/Col 부족', action: () => (can ? game.enhanceSword(npc, col, pts, rate) : game.audio.play('deny')) },
      { label: '그만둘래' },
    ]
  );
}

function cards(game, npc) {
  const p = game.player;
  const bet = (n) => () => {
    if (p.col < n) {
      game.audio.play('deny');
      return game.say(npc, `${n} Col도 없으면서 카드판에 앉으려고? 하하, 사냥이나 하고 와.`, [{ label: '…알겠어' }]);
    }
    p.col -= n;
    game.audio.play('coin', { vol: 0.5 });
    round(n, 0, card());
  };
  const round = (pot, streak, cur) => {
    const opts = [
      { label: '하이 ▲', action: () => guess(pot, streak, cur, 1) },
      { label: '로우 ▼', action: () => guess(pot, streak, cur, -1) },
    ];
    if (streak > 0) opts.push({ label: `현금화 (${pot})`, action: () => cashOut(pot, streak) });
    else opts.push({ label: '그만 (몰수)', action: () => game.say(npc, '겁쟁이군. 판돈은 내가 챙기지.', [{ label: '쳇' }]) });
    game.say(npc, `현재 카드  【 ${cardName(cur)} 】\n다음 카드가 더 높을까, 낮을까?\n걸린 돈 ${pot} Col  ·  ${streak}연승 (맞히면 ×2, 같은 숫자면 한 장 더)`, opts);
  };
  const guess = (pot, streak, cur, dir) => {
    let next = card();
    while (next.v === cur.v) next = card();
    const win = dir > 0 ? next.v > cur.v : next.v < cur.v;
    game.audio.play('click', { vol: 0.6, rate: 0.8 });
    if (win) {
      pot *= 2;
      streak++;
      game.audio.play('coin', { vol: 0.7 });
      if (streak >= 6) return cashOut(pot, streak, `【 ${cardName(cur)} 】 → 【 ${cardName(next)} 】 6연승이라고?! 판을 접어야겠군. `);
      game.say(npc, `【 ${cardName(cur)} 】 → 【 ${cardName(next)} 】  적중!\n걸린 돈이 ${pot} Col로 불었어. 계속할 텐가?`, [
        { label: '계속', action: () => round(pot, streak, next) },
        { label: `현금화 (${pot})`, action: () => cashOut(pot, streak) },
      ]);
    } else {
      game.audio.play('deny');
      game.say(npc, `【 ${cardName(cur)} 】 → 【 ${cardName(next)} 】  아쉽군! 판돈 ${pot} Col은 내 거야.`, [
        { label: '한 판 더', action: () => cards(game, npc) },
        { label: '그만할래' },
      ]);
    }
  };
  const cashOut = (pot, streak, pre = '') => {
    p.col += pot;
    const rec = game.records;
    rec.cardStreak = Math.max(rec.cardStreak || 0, streak);
    game.audio.play(streak >= 3 ? 'quest' : 'coin', { vol: 0.8 });
    game.toasts.push(`+${pot} Col`, `하이 & 로우 ${streak}연승`, '#f0a020');
    game.save();
    game.say(npc, `${pre}좋아, ${pot} Col 받아 가. 운이 좋은걸?`, [
      { label: '한 판 더', action: () => cards(game, npc) },
      { label: '그만할래' },
    ]);
  };
  game.say(npc, `하이 & 로우 한 판 어때? 다음 카드가 높을지 낮을지 맞히면 판돈이 두 배씩 불어나. 최대 6연승!  (소지금 ${p.col} Col)`, [
    { label: '10 Col', action: bet(10) },
    { label: '50 Col', action: bet(50) },
    { label: '200 Col', action: bet(200) },
    { label: '안 할래' },
  ]);
}

const TALK = {
  // ------------------------------------------------ floor 1
  ellen: (g, n) => questTalk(g, n, 'ellen', g.progress.floor2
    ? '제1층을 공략한 검사님! 이제 광장의 전이문에서 제2층 “메사리아”로 갈 수 있어. 위층은 몬스터가 훨씬 강하니 검을 강화하고 가!'
    : '이 층의 필드는 이제 평화로워. 남은 건 미궁 탑의 주인뿐이야.'),
  mora: (g, n) => shopTalk(g, n, '어서 오세요~ 모험에 필요한 건 다 있어요!', [
    { id: 'potion', n: 1, price: 50 },
    { id: 'potion', n: 5, price: 230 },
    { id: 'crystal', n: 1, price: 220 },
  ]),
  smith: (g, n) => smithTalk(g, n, g.player.swordId === 'starter'
    ? '초심자의 장검이군. 몬스터 재료를 가져오면 강화해 주지. 쇠는 두드릴수록 강해지는 법!'
    : '좋은 검을 쓰는군! 재료만 있으면 더 벼려 줄 수 있어.'),
  guard: (g, n) => g.say(n, '남문 밖은 몬스터 출몰 지역이야. HP가 0이 되면 광장에서 부활하지만 소지금 일부를 잃어. 성벽 안은 안전지대라 HP가 빠르게 회복돼. 북서쪽 거대한 탑이 미궁이야.', [{ label: '조심할게' }]),
  bard: (g, n) => g.say(n, '어머, 여행자님. 제 노래 한 곡 들어 보실래요? 노래를 들으면 마음도 몸도 가벼워진답니다.', [
    { label: '들려줘 (10 Col)', action: () => g.playSong(n) },
    { label: '이 세계 이야기', action: () => g.say(n, '이 부유성은 100개의 층이 겹겹이 쌓여 있대요. 층마다 미궁 탑이 있고, 그 꼭대기의 보스를 쓰러뜨려야 다음 층으로 가는 계단이 열리죠. 아무도 끝을 본 적은 없지만… 언젠가 누군가는 보겠죠?', [{ label: '멋진걸' }]) },
    { label: '괜찮아' },
  ]),
  trainer: (g, n) => g.say(n, `검술 수련장이다. 45초 동안 나타나는 수정을 베어라. 파란 수정 +100, 금색은 +300, 빨간 수정은 베면 감점! 연속으로 벨수록 점수가 오른다.  (최고 기록: ${g.records.trainBest || 0}점)`, [
    { label: '수련 시작', action: () => g.startTraining(n) },
    { label: '요령', action: () => g.say(n, g.isVR ? '팔 전체로 크게 휘둘러라. 수정은 네 몸 주변 반원 안에 나타난다. 손목만 까딱이면 안 베어져!' : '마우스로 수정을 조준하고 좌클릭! 검은 화면 가운데 아래를 가로질러 휘둘러진다. 조준이 전부다.', [{ label: '알겠습니다' }]) },
    { label: '다음에' },
  ]),
  kid: (g, n) => g.say(n, `모험가님! 나랑 술래잡기 할래? 나 엄청 빠르다? 60초 안에 날 잡으면 사탕 줄게!  (최고 기록: ${g.records.tagBest ? g.records.tagBest + '초' : '없음'})`, [
    { label: '하자!', action: () => g.startTag(n) },
    { label: '다음에' },
  ]),
  dealer: (g, n) => cards(g, n),
  broker: (g, n) => g.say(n, '정보상 로나야. 이 층에서 모르는 일은 없지. 정보 하나에 30 Col, 싸게 해 줄게.', [
    { label: '정보 사기 (30)', action: () => {
      if (g.player.col < 30) { g.audio.play('deny'); return g.say(n, '돈이 없으면 정보도 없지~', [{ label: '쳇' }]); }
      g.player.col -= 30;
      g.audio.play('coin', { vol: 0.5 });
      g.say(n, RUMORS[Math.floor(Math.random() * RUMORS.length)], [{ label: '고마워' }]);
    } },
    { label: '공짜 조언', action: () => g.say(n, g.quests.hudText() ? `지금 “${g.quests.hudText()}” 하는 중이구나? 메뉴의 지도 탭에서 목적지를 확인해 봐.` : '할 일이 없으면 광장의 엘렌한테 가 봐. 기사님은 늘 일거리를 갖고 있거든.', [{ label: '그렇구나' }]) },
    { label: '됐어' },
  ]),
  fisher: (g, n) => {
    if (!g.inv.has('rod')) {
      g.inv.add('rod');
      g.save();
      g.audio.play('quest', { vol: 0.6 });
      g.toasts.push('낚싯대 획득!', '부두 끝에서 [A] / E 로 낚시할 수 있습니다', '#2fb4c8');
      return g.say(n, '허허, 낚시에 관심 있나? 이 낚싯대를 가져가게. 부두 끝에 서서 휘둘러 던지고, 찌가 쑥 가라앉으면 바로 당기는 게야. 그다음은 릴을 힘껏 감고!', [{ label: '감사합니다' }]);
    }
    const f = lootValue(g, ['fish']);
    g.say(n, `오늘은 입질이 좀 있나? 잡은 물고기는 내가 사 주지.  (보유 물고기 ${f.n}마리)`, [
      { label: f.n ? `물고기 팔기 (+${f.col})` : '물고기 팔기', action: () => g.sellLoot(['fish']) },
      { label: '낚시 요령', action: () => g.say(n, '큰 녀석일수록 힘이 세서 릴을 빨리 감아야 해. 호수의 주인? 백 번 던지면 한 번 걸릴까 말까지. 제2층 폭포 호수엔 더 진귀한 녀석도 있다더군.', [{ label: '명심할게요' }]) },
      { label: '고마워요' },
    ]);
  },

  // ------------------------------------------------ floor 2
  fisher2: (g, n) => {
    const give = !g.inv.has('rod');
    if (give) {
      g.inv.add('rod');
      g.toasts.push('낚싯대 획득!', '부두 끝에서 [A] / E 로 낚시할 수 있습니다', '#2fb4c8');
      g.save();
    }
    const f = lootValue(g, ['fish']);
    g.say(n, `${give ? '어머, 낚싯대가 없어요? 제 여분 드릴게요! ' : ''}폭포 호수엔 붉은 메기랑 수정 빙어가 살아요. 그리고… 폭포 바로 아래엔 전설의 “폭포의 용어”가 산대요!  (보유 물고기 ${f.n}마리)`, [
      { label: f.n ? `물고기 팔기 (+${f.col})` : '물고기 팔기', action: () => g.sellLoot(['fish']) },
      { label: '고마워' },
    ]);
  },
  hanna: (g, n) => questTalk(g, n, 'hanna', '타우러스 제너럴이 사라진 뒤로 오록스들도 순해졌어. 고마워, 영웅님! 제2층의 미궁 탑은… 아직 아무도 들어가 보지 못했대.'),
  mii: (g, n) => questTalk(g, n, 'mii', '큐루는 잘 지내? 배고프면 네 어깨에서 꾸벅꾸벅 졸 거야. 메뉴 설정에서 쉬게 할 수도 있어!'),
  garrett: (g, n) => smithTalk(g, n, '메사리아의 대장장이 가렛이다. 이 고원의 돌은 단단해서 좋은 숫돌이 되지. 강화는 나한테 맡겨.'),
  bella: (g, n) => shopTalk(g, n, '메사리아 잡화점이에요! 하이 포션, 전이 결정, 그리고 명물 쇼트케이크까지!', [
    { id: 'hipotion', n: 1, price: 120 },
    { id: 'crystal', n: 1, price: 200 },
    { id: 'cake', n: 1, price: 150 },
  ]),
  tunnel: (g, n) => g.say(n, '메사리아에 온 걸 환영해. 이 도시는 거대한 메사(탁상 바위산)의 속을 파서 만들었지. 터널 밖은 고원 필드야. 오록스는 남쪽 초원, 말벌은 서쪽 메사 사이, 타우러스 제너럴은 남서쪽 협곡에 있어.', [{ label: '고마워' }]),
  sage: (g, n) => g.say(n, '…허허. 저 위로 솟은 미궁 탑이 보이나? 제2층의 탑은 아직 굳게 닫혀 있다네. 언젠가 문이 열리면… 그때는 자네의 검이 필요할 게야.', [
    { label: '폭포 이야기', action: () => g.say(n, '동쪽 메사에서 떨어지는 폭포 아래 호수에는 “폭포의 용어”라는 전설의 물고기가 산다네. 낚싯대가 있다면 한번 도전해 보게.', [{ label: '흥미롭네요' }]) },
    { label: '다음에' },
  ]),
};
