// node tools/test-rules.js — 규칙 엔진 시험
const R = require("../js/rules.js");
const C = require("../js/cpu.js");
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log("✗", m); } };
const throws = (f, m) => { try { f(); ok(false, m + " (안 막힘)"); } catch (e) { ok(true, m); } };
const at = (s, r, c) => r * s.size + c;
// 예전 시험들은 모서리에 1칸씩 깔린 판에서 한다 (지금 규칙은 빈 판에서 시작)
const corners = (s) => { const n = s.size; s.owner[(n - 1) * n] = 0; s.owner[n - 1] = 1; s.players[0].home = (n - 1) * n; s.players[1].home = n - 1; return s; };
// 옛 시험은 더한 규칙(둘러싸기·뒤집기·씨앗)을 끄고 — 새 규칙은 아래 따로 시험
const OLD = { wrap: false, flip: false, seed: false };
const g0 = () => corners(R.newGame({ size: 10, pokes: ["pikachu", "squirtle"], seed: 7, rules: OLD }));
const g = () => { const s = g0(); s.turns = 1; return s; }; // 첫 차례 절반 규칙을 뺀 판

// 시작: 빈 판, 첫 덩어리는 어디든 — 상대 바로 옆도
let s = R.newGame({ size: 10, pokes: ["pikachu", "squirtle"], seed: 7, rules: OLD }); s.bonus.fill(null);
ok(s.owner.every((o) => o === R.EMPTY), "빈 판에서 시작");
ok(R.canAdd({ ...s, need: 3 }, 0, [], at(s, 4, 4)), "첫 칸은 어디든");
throws(() => R.useCard(s, 0, [at(s, 4, 4)]), "맨 첫 차례엔 카드 못 씀");
R.roll(s, 6);
ok(s.need === 1 && s.die === 1, "선공 첫 차례 1칸");
R.place(s, [at(s, 4, 4)]);
s.turn = 0; s.phase = "roll"; R.roll(s, 2); R.place(s, [at(s, 4, 5), at(s, 5, 5)]); // 덩어리 키워 두기
ok(s.players[0].home === at(s, 4, 4), "첫 칸 = 집");
R.roll(s, 2);
ok(s.need === 2, "후공 첫 차례 2 → 2칸");
{ const x = R.newGame({ size: 10, pokes: ["pikachu", "squirtle"], seed: 7 }); x.bonus.fill(null); R.roll(x); R.place(x, [at(x, 4, 4)]); R.roll(x, 6);
  ok(x.need === 3 && x.log.at(-1).second, "후공 첫 차례 6 → 3칸까지"); R.place(x, [at(x, 3, 4), at(x, 3, 5), at(x, 3, 6)]); R.roll(x, 5); ok(x.need === 5, "그다음부턴 주사위 그대로"); }
throws(() => R.place(s, [at(s, 4, 4), at(s, 3, 4)]), "남의 칸 위엔 못 놓음");
R.place(s, [at(s, 3, 4), at(s, 3, 5)]); // 피카츄 바로 위에서 막기
ok(s.owner[at(s, 3, 4)] === 1 && s.players[1].home === at(s, 3, 4), "상대 바로 옆에 첫 덩어리");
R.roll(s, 2);
throws(() => R.place(s, [at(s, 0, 0), at(s, 0, 1)]), "땅이 생긴 뒤엔 붙여야 함");
s = g0();
ok(s.players[0].cards[0].effect === "steal" && s.players[1].cards[0].effect === "plus2", "전용 카드");
const bon = s.bonus.map((b, i) => [b, i]).filter((x) => x[0]);
ok(bon.length === 6, "보너스 6칸");
ok(bon.every(([b, i]) => s.bonus[R.mirror(10, i)] === b), "보너스 점대칭");

// 주사위·놓기
s = g0(); s.bonus.fill(null);
R.roll(s, 5);
ok(s.need === 1 && s.log[0].first, "선공 첫 차례 1칸");
s = g(); s.bonus.fill(null); s.turns = 1;
R.roll(s, 3);
ok(s.need === 3 && s.phase === "place", "주사위 3 → 3칸");
throws(() => R.place(s, [at(s, 8, 0), at(s, 7, 0)]), "개수 모자람");
throws(() => R.place(s, [at(s, 8, 0), at(s, 7, 0), at(s, 5, 0)]), "끊긴 덩어리");
throws(() => R.place(s, [at(s, 5, 5), at(s, 5, 6), at(s, 5, 7)]), "내 땅에 안 닿음");
throws(() => R.place(s, [at(s, 9, 0), at(s, 8, 0), at(s, 7, 0)]), "이미 내 칸 포함");
// canAdd: 첫 칸은 땅 옆, 다음은 고른 칸 옆
ok(R.canAdd(s, 0, [], at(s, 8, 0)) && !R.canAdd(s, 0, [], at(s, 7, 0)), "첫 칸은 땅 옆");
ok(R.canAdd(s, 0, [at(s, 8, 0)], at(s, 7, 0)) && !R.canAdd(s, 0, [at(s, 8, 0)], at(s, 9, 1)), "다음 칸은 고른 칸 옆만");
R.place(s, [at(s, 8, 0), at(s, 7, 0), at(s, 8, 1)]);
ok(s.turn === 1 && s.phase === "roll" && R.cellsOf(s, 0).length === 4, "놓고 차례 넘김");
ok(R.validGroup(s, 1, [at(s, 1, 9), at(s, 0, 8)]) === false, "need 0 일 때 어떤 덩어리도 무효");

// 보너스
s = g(); s.bonus.fill(null);
s.bonus[at(s, 8, 0)] = "ball"; s.bonus[at(s, 8, 1)] = "star"; s.bonus[at(s, 9, 1)] = "box";
R.roll(s, 3); R.place(s, [at(s, 8, 0), at(s, 8, 1), at(s, 9, 1)]);
ok(s.turn === 0, "포켓볼 → 한 번 더");
ok(s.players[0].stars === 1 && s.players[0].cards.length === 2, "별 +1, 상자 카드");
s.bonus[at(s, 9, 2)] = "box"; R.roll(s, 1); R.place(s, [at(s, 9, 2)]);
ok(s.players[0].stars === 2 && s.players[0].cards.length === 2 && s.turn === 1, "카드 꽉 차면 상자 = 별");

// 자리가 모자라면 그만큼만, 0이면 넘김
s = g(); s.bonus.fill(null);
s.owner[at(s, 7, 0)] = R.ROCK; s.owner[at(s, 8, 1)] = R.ROCK; s.owner[at(s, 9, 2)] = R.ROCK; // 1P 갇힘: 빈 칸 (8,0),(9,1) 두 덩어리 1칸씩
R.roll(s, 5);
ok(s.need === 1, "자리 1칸뿐 → 1칸만");
R.place(s, [at(s, 8, 0)]);
ok(s.turn === 1, "넘어감");
R.roll(s, 2); R.place(s, [at(s, 1, 9), at(s, 2, 9)]);
ok(s.turn === 0, "1P 차례 (9,1) 남음");
R.roll(s, 4); R.place(s, [at(s, 9, 1)]);
// 이제 1P 붙일 곳 0 → 2P 차례 계속
R.roll(s, 1); R.place(s, [at(s, 3, 9)]);
ok(s.turn === 1 && s.log.some((e) => e.type === "pass"), "막힌 사람 넘김");

// 카드
s = g(); s.bonus.fill(null);
R.roll(s, 1); R.place(s, [at(s, 8, 0)]);
s.turn = 1; // 2P +2
R.useCard(s, 0);
throws(() => R.useCard(s, 0), "한 차례 1장");
R.roll(s, 3);
ok(s.need === 5, "+2칸");
R.place(s, [at(s, 1, 9), at(s, 2, 9), at(s, 3, 9), at(s, 4, 9), at(s, 5, 9)]);
// 빼앗기: 1P 땅 옆 2P 칸
s.owner[at(s, 7, 0)] = 1;
s.turn = 0;
ok(R.stealTargets(s, 0).includes(at(s, 7, 0)) && !R.stealTargets(s, 0).includes(at(s, 0, 9)), "빼앗기 대상");
throws(() => R.useCard(s, 0, [at(s, 0, 9)]), "시작 칸은 못 뺏음");
R.useCard(s, 0, [at(s, 7, 0)]);
ok(s.owner[at(s, 7, 0)] === 0 && s.players[0].cards.length === 0, "빼앗음");
throws(() => R.useCard(s, 0, []), "카드 없음");
// 바위
s = corners(R.newGame({ size: 8, pokes: ["bulbasaur", "eevee"], seed: 3, rules: OLD })); s.turns = 1;
const empt = R.wallTargets(s);
throws(() => R.useCard(s, 0, [empt[0]]), "바위 2칸 필요");
R.useCard(s, 0, [empt[0], empt[1]]);
ok(s.owner[empt[0]] === R.ROCK && s.owner[empt[1]] === R.ROCK, "바위 놓음");
// 다시 굴리기
s.turn = 1; s.card = null; R.useCard(s, 0); R.roll(s, [2, 5]);
ok(s.die === 5, "다시 굴리기 큰 쪽");

// 점수 = 가장 큰 덩어리 + 별
s = g(); s.bonus.fill(null);
[at(s, 8, 0), at(s, 7, 0), at(s, 5, 5)].forEach((i) => (s.owner[i] = 0));
s.players[0].stars = 1;
const sc = R.score(s, 0);
ok(sc.land === 3 && sc.total === 3 + R.STAR_POINTS, "가장 큰 덩어리만 셈");

// ===== 더한 규칙 (2026-11-08) =====
const ng = (o = {}) => { const x = R.newGame(Object.assign({ size: 10, pokes: ["pikachu", "squirtle"], seed: 7 }, o)); x.bonus.fill(null); x.turns = 1; return x; };
const put = (x, p, cells) => cells.forEach(([r, c]) => (x.owner[at(x, r, c)] = p));

// 첫 땅엔 🎁·⚪ 못 고름 (⭐ 은 됨)
s = ng(); s.turns = 0;
s.bonus[at(s, 4, 4)] = "box"; s.bonus[at(s, 4, 5)] = "ball"; s.bonus[at(s, 4, 6)] = "star";
R.roll(s);
ok(!R.canAdd(s, 0, [], at(s, 4, 4)) && !R.canAdd(s, 0, [], at(s, 4, 5)) && R.canAdd(s, 0, [], at(s, 4, 6)), "첫 땅: 상자·포켓볼 칸 못 고름");
throws(() => R.place(s, [at(s, 4, 5)]), "첫 땅 포켓볼 칸 놓기 막음");
R.place(s, [at(s, 4, 6)]);
ok(s.players[0].stars === 1, "첫 땅 별은 됨");
// 후공 첫 덩어리도 상자 칸 못 지나감, 첫 땅으론 둘러싸기 없음
R.roll(s, 3);
ok(!R.validGroup(s, 1, [at(s, 4, 3), at(s, 4, 4), at(s, 3, 4)]), "후공 첫 덩어리도 상자 칸 못 씀");
s = ng(); s.turns = 1; put(s, 0, [[5, 5]]);
s.bonus[at(s, 0, 0)] = "ball"; s.turn = 1; s.phase = "roll";
R.roll(s, 3); R.place(s, [at(s, 0, 1), at(s, 1, 1), at(s, 1, 0)]); // 첫 덩어리(3칸)가 모서리 포켓볼을 감쌈
ok(s.owner[at(s, 0, 0)] === R.EMPTY, "첫 땅으로는 둘러싸기 안 함");

// 🌱 씨앗: 떨어진 곳에 절반(올림)
s = ng(); put(s, 0, [[9, 0]]); put(s, 1, [[0, 9]]); s.players[0].home = at(s, 9, 0); s.players[1].home = at(s, 0, 9);
R.roll(s, 5);
ok(s.need === 5 && s.seedNeed === 3, "주사위 5 → 붙이기 5 · 씨앗 3");
ok(R.canAdd(s, 0, [], at(s, 4, 4)), "씨앗 첫 칸은 어디든");
ok(R.canAdd(s, 0, [at(s, 4, 4), at(s, 4, 5)], at(s, 4, 6)) && !R.canAdd(s, 0, [at(s, 4, 4), at(s, 4, 5), at(s, 4, 6)], at(s, 4, 7)), "씨앗은 3칸까지");
throws(() => R.place(s, [at(s, 4, 4), at(s, 4, 5)]), "씨앗 개수 모자람");
throws(() => R.place(s, [at(s, 8, 0), at(s, 7, 0), at(s, 6, 0)]), "붙이는 덩어리는 5칸이어야");
R.place(s, [at(s, 4, 4), at(s, 4, 5), at(s, 4, 6)]);
ok(s.log.at(-1).kind === "seed" && s.owner[at(s, 4, 5)] === 0, "씨앗 심음");
ok(R.score(s, 0).land === 3, "점수는 가장 큰 덩어리");
// 씨앗이 내 땅에 닿게 자라면 붙이기로 바뀌어 need 까지
s.turn = 0; s.phase = "roll"; R.roll(s, 4);
ok(R.kindOf(s, 0, [at(s, 2, 2)]) === "seed" && R.kindOf(s, 0, [at(s, 3, 4)]) === "attach", "붙이기/씨앗 판정");

// 🔄 끼우기: 내 칸 · 상대 1~2칸 · 새 칸 → 뒤집힘. 3칸은 안 됨. 집 칸은 안 됨
s = ng(); put(s, 0, [[5, 0], [6, 0]]); put(s, 1, [[5, 1], [5, 2], [0, 9]]); s.players[1].home = at(s, 0, 9); s.players[0].home = at(s, 6, 0);
R.roll(s, 1); R.place(s, [at(s, 5, 3)]);
ok(s.owner[at(s, 5, 1)] === 0 && s.owner[at(s, 5, 2)] === 0, "두 칸 끼워 뒤집기");
ok(s.log.at(-1).flips.length === 2, "뒤집기 기록");
s = ng(); put(s, 0, [[5, 0], [6, 4]]); put(s, 1, [[5, 1], [5, 2], [5, 3], [0, 9]]); s.players[1].home = at(s, 0, 9);
R.roll(s, 1); R.place(s, [at(s, 5, 4)]);
ok(s.owner[at(s, 5, 2)] === 1, "세 칸 줄은 안 뒤집힘");
s = ng(); put(s, 0, [[5, 0], [6, 0]]); put(s, 1, [[5, 1], [0, 9]]); s.players[1].home = at(s, 5, 1);
R.roll(s, 1); R.place(s, [at(s, 5, 2)]);
ok(s.owner[at(s, 5, 1)] === 1, "집 칸은 안 뒤집힘");

// 🏠 둘러싸기: 한쪽 땅에만 닿은 빈 곳 (판 끝은 벽), capMax 넘으면 안 됨
s = ng(); put(s, 0, [[0, 1], [1, 0]]); put(s, 1, [[9, 9]]); s.players[0].home = at(s, 0, 1); s.players[1].home = at(s, 9, 9);
s.bonus[at(s, 0, 0)] = "star";
R.roll(s, 1); R.place(s, [at(s, 1, 1)]);
ok(s.owner[at(s, 0, 0)] === 0 && s.players[0].stars === 1, "모서리 둘러싸 차지 + 보너스");
ok(s.log.at(-1).caps.length === 1, "둘러싸기 기록");
s = ng(); for (let c = 0; c < 10; c++) s.owner[at(s, 2, c)] = 0; put(s, 1, [[9, 9]]); // 위쪽 20칸 > 12
s.owner[at(s, 2, 9)] = R.EMPTY; R.roll(s, 1); R.place(s, [at(s, 2, 9)]);
ok(s.owner[at(s, 0, 0)] === R.EMPTY, "큰 곳(20칸)은 못 둘러쌈");
// 상대 쪽만 닿게 갈라 주면 상대가 차지
s = ng(); put(s, 1, [[0, 1], [1, 0]]); put(s, 0, [[5, 5]]); s.players[1].home = at(s, 0, 1);
s.owner[at(s, 1, 1)] = R.ROCK; // 바위로 막혀 (0,0) 은 2P 땅에만 닿음 — 다음 변화 때 2P 것
R.roll(s, 1); R.place(s, [at(s, 5, 6)]);
ok(s.owner[at(s, 0, 0)] === 1, "상대 차례에 생긴 둘러싸기는 그 사람 것");

// 끝까지: 컴퓨터끼리 여러 판 — 오류 없이 끝나고 판이 다 차거나 둘 다 막힘
for (let seed = 1; seed <= 40; seed++) {
  const st = R.newGame({ size: seed % 2 ? 10 : 8, pokes: ["gengar", "snorlax"], seed, cpu: ["normal", "easy"] });
  const rand = R.rng(seed * 99);
  let guard = 0;
  while (st.phase !== "over" && guard++ < 500) {
    const lv = st.players[st.turn].cpu;
    const c = C.chooseCard(st, lv, rand);
    if (c) R.useCard(st, c.k, c.targets);
    if (st.phase === "over") break;
    const e = R.roll(st);
    if (e.stuck) continue;
    R.place(st, C.choosePlace(st, lv, rand));
  }
  ok(st.phase === "over", "끝남 seed " + seed);
  ok(!st.owner.includes(R.EMPTY) || (R.maxAttach(st, 0) === 0 && R.maxAttach(st, 1) === 0 && R.maxSeed(st, 0) === 0), "끝 = 판이 다 참 seed " + seed);
}

console.log(bad ? `✗ ${bad}/${n} 실패` : `✓ ${n}개 통과`);
process.exit(bad ? 1 : 0);
