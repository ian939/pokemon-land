// node tools/test-rules.js — 규칙 엔진 시험
const R = require("../js/rules.js");
const C = require("../js/cpu.js");
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.log("✗", m); } };
const throws = (f, m) => { try { f(); ok(false, m + " (안 막힘)"); } catch (e) { ok(true, m); } };
const at = (s, r, c) => r * s.size + c;
// 예전 시험들은 모서리에 1칸씩 깔린 판에서 한다 (지금 규칙은 빈 판에서 시작)
const corners = (s) => { const n = s.size; s.owner[(n - 1) * n] = 0; s.owner[n - 1] = 1; s.players[0].home = (n - 1) * n; s.players[1].home = n - 1; return s; };
const g0 = () => corners(R.newGame({ size: 10, pokes: ["pikachu", "squirtle"], seed: 7 }));
const g = () => { const s = g0(); s.turns = 1; return s; }; // 첫 차례 절반 규칙을 뺀 판

// 시작: 빈 판, 첫 덩어리는 어디든 — 상대 바로 옆도
let s = R.newGame({ size: 10, pokes: ["pikachu", "squirtle"], seed: 7 }); s.bonus.fill(null);
ok(s.owner.every((o) => o === R.EMPTY), "빈 판에서 시작");
ok(R.canAdd({ ...s, need: 3 }, 0, [], at(s, 4, 4)), "첫 칸은 어디든");
throws(() => R.useCard(s, 0, [at(s, 4, 4)]), "맨 첫 차례엔 카드 못 씀");
R.roll(s, 6);
ok(s.need === 1 && s.die === 1, "선공 첫 차례 1칸");
R.place(s, [at(s, 4, 4)]);
s.turn = 0; s.phase = "roll"; R.roll(s, 2); R.place(s, [at(s, 4, 5), at(s, 5, 5)]); // 덩어리 키워 두기
ok(s.players[0].home === at(s, 4, 4), "첫 칸 = 집");
R.roll(s, 2);
ok(s.need === 2, "후공 첫 차례는 그대로");
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
s = corners(R.newGame({ size: 8, pokes: ["bulbasaur", "eevee"], seed: 3 })); s.turns = 1;
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

// 끝까지: 컴퓨터끼리 여러 판 — 오류 없이 끝나고 판이 다 차거나 둘 다 막힘
for (let seed = 1; seed <= 40; seed++) {
  const st = R.newGame({ size: seed % 2 ? 10 : 8, pokes: ["gengar", "snorlax"], seed, cpu: ["normal", "easy"] });
  const rand = R.rng(seed * 99);
  let guard = 0;
  while (st.phase !== "over" && guard++ < 500) {
    const lv = st.players[st.turn].cpu;
    const c = C.chooseCard(st, lv, rand);
    if (c) R.useCard(st, c.k, c.targets);
    const e = R.roll(st);
    if (e.stuck) continue;
    R.place(st, C.choosePlace(st, lv, rand));
  }
  ok(st.phase === "over", "끝남 seed " + seed);
  ok(R.maxAttach(st, 0) === 0 && R.maxAttach(st, 1) === 0, "끝 = 둘 다 막힘 seed " + seed);
}

console.log(bad ? `✗ ${bad}/${n} 실패` : `✓ ${n}개 통과`);
process.exit(bad ? 1 : 0);
