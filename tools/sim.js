// node tools/sim.js [판수] — 컴퓨터끼리: 선공 승률, 한 판 차례 수, 쉬움 vs 보통
const R = require("../js/rules.js");
const C = require("../js/cpu.js");
const N = +process.argv[2] || 400;

function play(size, lv, seed) {
  const s = R.newGame({ size, pokes: ["pikachu", "eevee"], seed, cpu: lv });
  // 카드 효과 차이를 빼려고 둘 다 같은 종류 시작 카드
  s.players[1].cards = [{ ...s.players[0].cards[0] }];
  const rand = R.rng(seed * 31 + 7);
  let guard = 0;
  while (s.phase !== "over" && guard++ < 600) {
    const l = s.players[s.turn].cpu;
    const c = C.chooseCard(s, l, rand);
    if (c) R.useCard(s, c.k, c.targets);
    if (s.phase === "over") break; // 카드로 둘러싸서 판이 다 찼다
    if (R.roll(s).stuck) continue;
    R.place(s, C.choosePlace(s, l, rand));
  }
  const kidTurns = s.log.filter((e) => e.type === "roll" && e.p === 0).length;
  return { w: s.result.winner, turns: s.turns, kidTurns, sc: s.result.scores.map((x) => x.total) };
}

for (const size of [10, 8]) {
  for (const lv of [["normal", "normal"], ["easy", "easy"], ["easy", "normal"], ["normal", "easy"]]) {
    let w = [0, 0, 0], t = 0, kt = 0, margin = 0;
    for (let i = 1; i <= N; i++) {
      const r = play(size, lv, i);
      w[r.w === -1 ? 2 : r.w]++; t += r.turns; kt += r.kidTurns; margin += Math.abs(r.sc[0] - r.sc[1]);
    }
    console.log(`${size}×${size} ${lv.join(" vs ")}: 1P(선공) ${(w[0] / N * 100).toFixed(0)}% · 2P ${(w[1] / N * 100).toFixed(0)}% · 비김 ${(w[2] / N * 100).toFixed(0)}% | 1P 주사위 평균 ${(kt / N).toFixed(1)}번 · 점수 차 ${(margin / N).toFixed(1)}`);
  }
}
