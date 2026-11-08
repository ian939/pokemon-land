/* 컴퓨터 상대 — easy: 아무 덩어리(보너스 좋아함) · normal: 땅 넓이 어림셈으로 고르고 길목을 막음
 * 땅 어림셈 = 빈 칸마다 누구 땅에서 더 가까운지 (같으면 0) — 막으면 상대 쪽 칸이 줄어든다.
 * 후보마다 뒤집기·둘러싸기까지 해 본 판으로 매긴다. 씨앗(떨어진 곳) 후보도 섞는다.
 */
(function (root, factory) {
  const C = factory(typeof module === "object" && module.exports ? require("./rules.js") : root.Rules);
  if (typeof module === "object" && module.exports) module.exports = C;
  else root.Cpu = C;
})(typeof self !== "undefined" ? self : this, function (R) {
  const BONUS_VAL = { ball: 4, star: 3, box: 2.5 };

  /** 한 칸에서 시작해 ok 인 칸으로 size 칸까지 무작위로 자란 덩어리 */
  function grow(s, start, size, ok, rand) {
    const sel = [start], compact = rand() < 0.5;
    while (sel.length < size) {
      const opts = [];
      for (const i of sel) for (const j of R.nbrs(s.size, i)) if (ok(j) && !sel.includes(j) && !opts.includes(j)) opts.push(j);
      if (!opts.length) break;
      let pick;
      if (compact) { // 이미 고른 칸에 많이 닿는 칸 우선 (뭉툭한 모양)
        let best = -1;
        for (const j of opts) {
          const k = R.nbrs(s.size, j).filter((x) => sel.includes(x)).length + rand() * 0.9;
          if (k > best) { best = k; pick = j; }
        }
      } else pick = opts[(rand() * opts.length) | 0];
      sel.push(pick);
    }
    return sel.length === size ? sel : null;
  }

  /** 덩어리 후보 여러 개 — 붙이기 n개 + 씨앗 ns개 */
  function candidates(s, p, n, rand, ns = 0) {
    const out = [], keys = new Set();
    const add = (sel) => {
      if (!sel) return;
      const key = sel.slice().sort((a, b) => a - b).join(",");
      if (!keys.has(key)) { keys.add(key); out.push(sel); }
    };
    const first = !R.hasLand(s, p);
    const empty = (j) => s.owner[j] === R.EMPTY && !(first && R.firstBan(s, j));
    const front = R.frontier(s, p).filter(empty);
    if (s.need && front.length) for (let t = 0; t < n * 3 && out.length < n; t++) add(grow(s, front[(rand() * front.length) | 0], s.need, empty, rand));
    if (R.hasLand(s, p) && s.seedNeed && ns) {
      const far = (j) => empty(j) && !R.nextTo(s, j, p);
      const pool = [];
      for (let i = 0; i < s.owner.length; i++) if (far(i)) pool.push(i);
      const before = out.length;
      if (pool.length) for (let t = 0; t < ns * 3 && out.length - before < ns; t++) add(grow(s, pool[(rand() * pool.length) | 0], s.seedNeed, far, rand));
    }
    return out;
  }

  /** 거리 지도: 각 빈 칸까지 p 땅에서 몇 걸음 */
  function distMap(s, p) {
    const d = new Array(s.owner.length).fill(Infinity), q = [];
    for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === p) { d[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const j of R.nbrs(s.size, i)) if (s.owner[j] === R.EMPTY && d[j] === Infinity) { d[j] = d[i] + 1; q.push(j); }
    }
    return d;
  }
  /** p 쪽에서 본 판 점수 — 땅 넓이 어림 + 가장 큰 덩어리 차이(점수는 큰 덩어리만 세니까) */
  function evalBoard(s, p) {
    const a = distMap(s, p), b = distMap(s, 1 - p);
    let v = 0;
    for (let i = 0; i < s.owner.length; i++) {
      if (s.owner[i] === p) v += 1;
      else if (s.owner[i] === 1 - p) v -= 1;
      else if (s.owner[i] === R.EMPTY) {
        if (a[i] < b[i]) v += s.bonus[i] ? 1 + BONUS_VAL[s.bonus[i]] * 0.3 : 1;
        else if (b[i] < a[i]) v -= s.bonus[i] ? 1 + BONUS_VAL[s.bonus[i]] * 0.3 : 1;
      }
    }
    return v + 0.5 * (R.largestBlob(s, p).size - R.largestBlob(s, 1 - p).size);
  }
  function withOwner(s, cells, val, fn) {
    const old = cells.map((i) => s.owner[i]);
    cells.forEach((i) => (s.owner[i] = val));
    const r = fn();
    cells.forEach((i, k) => (s.owner[i] = old[k]));
    return r;
  }
  /** 놓은 뒤(뒤집기·둘러싸기까지) 판으로 바꿔 fn */
  function withPlaced(s, p, sel, fn) {
    const old = s.owner, r = R.resolve(s, p, sel);
    s.owner = r.own;
    try { return fn(r); } finally { s.owner = old; }
  }

  /** 놓을 덩어리 고르기 */
  function choosePlace(s, level, rand) {
    const p = s.turn;
    const easy = level === "easy";
    // 쉬움: 붙일 수 없을 때만 씨앗 (가끔 장난으로)
    const cs = easy ? candidates(s, p, 25, rand, s.need === 0 || rand() < 0.15 ? 8 : 0) : candidates(s, p, 160, rand, 60);
    if (!cs.length) return null;
    const bonusOf = (sel) => sel.reduce((a, i) => a + (s.bonus[i] ? BONUS_VAL[s.bonus[i]] : 0), 0);
    if (easy) {
      const withB = cs.filter((c) => bonusOf(c) > 0);
      const pool = withB.length && rand() < 0.7 ? withB : cs;
      return pool[(rand() * pool.length) | 0];
    }
    let best = null, bv = -Infinity;
    for (const sel of cs) {
      const v = withPlaced(s, p, sel, () => evalBoard(s, p)) + bonusOf(sel) + rand() * 0.5;
      if (v > bv) { bv = v; best = sel; }
    }
    return best;
  }

  /** 주사위 전에 카드를 쓸지: { k, targets } 또는 null */
  function chooseCard(s, level, rand) {
    const p = s.turn, pl = s.players[p];
    if (!pl.cards.length || s.turns === 0) return null;
    const tries = [];
    pl.cards.forEach((c, k) => {
      if (c.effect === "steal") {
        const ts = R.stealTargets(s, p);
        if (!ts.length) return;
        let t = ts[(rand() * ts.length) | 0];
        if (level !== "easy") {
          let bv = -Infinity;
          for (const x of ts) { const v = withOwner(s, [x], p, () => evalBoard(s, p)); if (v > bv) { bv = v; t = x; } }
        }
        tries.push({ k, targets: [t], w: 1 });
      } else if (c.effect === "wall") {
        // 상대 땅 바로 옆 빈 칸 중 상대에게 가장 아픈 2칸 (쉬움은 아무 데나)
        const ok = R.wallTargets(s);
        if (!ok.length) return;
        const near = R.frontier(s, 1 - p).filter((i) => ok.includes(i));
        const pool = near.length >= 2 ? near : ok;
        let ts;
        if (level === "easy") ts = pool.slice().sort(() => rand() - 0.5).slice(0, Math.min(2, ok.length));
        else {
          const scored = pool.map((i) => ({ i, v: withOwner(s, [i], R.ROCK, () => evalBoard(s, p)) + rand() * 0.1 }));
          scored.sort((a, b) => b.v - a.v);
          ts = scored.slice(0, Math.min(2, ok.length)).map((x) => x.i);
          if (ts.length < Math.min(2, ok.length)) ts = ok.slice(0, 2);
        }
        tries.push({ k, targets: ts, w: 0.6 });
      } else if (R.maxAttach(s, p) >= 3) tries.push({ k, targets: [], w: c.effect === "plus2" ? 0.5 : 0.35 });
    });
    if (!tries.length) return null;
    const t = tries[(rand() * tries.length) | 0];
    return rand() < t.w ? t : null;
  }

  return { candidates, choosePlace, chooseCard, evalBoard };
});
