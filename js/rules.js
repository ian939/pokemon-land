/* 포켓몬 땅따먹기 — 규칙 엔진 (화면 없음, Node 에서 시험)
 *
 * 판: size×size 칸. owner[i] = -1 빈 칸 · 0/1 플레이어 · ROCK 바위
 * 한 차례: (카드 1장 쓰기) → 주사위 → 이어진 빈 칸 need 개를 한 덩어리로 골라 내 땅에 붙인다.
 * 연결은 상하좌우만. 점수 = 가장 큰 내 땅 덩어리 + 별 ×2.
 */
(function (root, factory) {
  const R = factory();
  if (typeof module === "object" && module.exports) module.exports = R;
  else root.Rules = R;
})(typeof self !== "undefined" ? self : this, function () {
  const EMPTY = -1, ROCK = 9;
  const STAR_POINTS = 2;
  const MAX_CARDS = 2;

  // 기술 카드 효과 4가지
  const EFFECTS = {
    reroll: { icon: "🎲", short: "다시 굴리기", text: "주사위를 두 번 굴려 큰 숫자!" },
    plus2: { icon: "➕", short: "+2칸", text: "이번에 2칸 더 붙여요" },
    steal: { icon: "⚡", short: "빼앗기", text: "내 땅 옆 상대 칸 1개를 가져와요" },
    wall: { icon: "🪨", short: "바위 세우기", text: "빈 칸 2개에 바위를 놓아 막아요" },
  };

  // 포켓몬 9마리 — 색은 땅 색, move 는 전용 기술 카드
  const POKEMON = [
    { id: "pikachu", dex: 25, name: "피카츄", en: "Pikachu", color: "#f7c62f", dark: "#a8820a", move: "10만볼트", effect: "steal" },
    { id: "bulbasaur", dex: 1, name: "이상해씨", en: "Bulbasaur", color: "#4cbf7a", dark: "#23794a", move: "덩굴채찍", effect: "wall" },
    { id: "charmander", dex: 4, name: "파이리", en: "Charmander", color: "#ff8a3d", dark: "#b8501a", move: "불꽃세례", effect: "plus2" },
    { id: "squirtle", dex: 7, name: "꼬부기", en: "Squirtle", color: "#47a6f0", dark: "#1f64a8", move: "물대포", effect: "plus2" },
    { id: "eevee", dex: 133, name: "이브이", en: "Eevee", color: "#b98552", dark: "#76502b", move: "전광석화", effect: "reroll" },
    { id: "jigglypuff", dex: 39, name: "푸린", en: "Jigglypuff", color: "#ff8fc8", dark: "#c0407f", move: "노래하기", effect: "reroll" },
    { id: "gengar", dex: 94, name: "팬텀", en: "Gengar", color: "#9a6be0", dark: "#5d3a9c", move: "섀도볼", effect: "steal" },
    { id: "snorlax", dex: 143, name: "잠만보", en: "Snorlax", color: "#3f6f8f", dark: "#21415a", move: "잠자기", effect: "wall" },
    { id: "charizard", dex: 6, name: "리자몽", en: "Charizard", color: "#e94e3c", dark: "#9c2518", move: "화염방사", effect: "plus2" },
  ];
  const POKE = Object.fromEntries(POKEMON.map((p) => [p.id, p]));

  // ---------- 무작위 (시드 가능) ----------
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- 판 ----------
  function nbrs(size, i) {
    const r = (i / size) | 0, c = i % size, out = [];
    if (r > 0) out.push(i - size);
    if (r < size - 1) out.push(i + size);
    if (c > 0) out.push(i - 1);
    if (c < size - 1) out.push(i + 1);
    return out;
  }
  const startCell = (size, p) => (p === 0 ? (size - 1) * size : size - 1); // 1P 왼쪽 아래, 2P 오른쪽 위
  const mirror = (size, i) => size * size - 1 - i; // 가운데 기준 점대칭 (두 시작 칸이 서로 맞바뀜)

  // 보너스 칸: 가운데 띠에 점대칭으로 3쌍 (포켓볼·별·상자)
  function placeBonus(size, rand) {
    const bonus = new Array(size * size).fill(null);
    const kinds = ["ball", "star", "box"];
    const s0 = startCell(size, 0), s1 = startCell(size, 1);
    const dist = (a, b) => Math.abs(((a / size) | 0) - ((b / size) | 0)) + Math.abs((a % size) - (b % size));
    const ok = (i) => {
      const m = mirror(size, i);
      if (m === i || bonus[i] || bonus[m]) return false;
      if (dist(i, s0) < 4 || dist(i, s1) < 4 || dist(m, s0) < 4 || dist(m, s1) < 4) return false;
      for (let j = 0; j < bonus.length; j++) if (bonus[j] && (dist(i, j) < 2 || dist(m, j) < 2)) return false;
      return true;
    };
    for (const k of kinds) {
      for (let t = 0; t < 500; t++) {
        const i = (rand() * size * size) | 0;
        if (ok(i)) { bonus[i] = k; bonus[mirror(size, i)] = k; break; }
      }
    }
    return bonus;
  }

  /** 새 판. opt = { size, pokes:[id,id], cpu:[null|'easy'|'normal', ...], seed, first } */
  function newGame(opt) {
    const size = opt.size || 10;
    const seed = opt.seed != null ? opt.seed : (Math.random() * 1e9) | 0;
    const rand = rng(seed);
    const owner = new Array(size * size).fill(EMPTY);
    const s = {
      size, seed, owner,
      bonus: placeBonus(size, rand),
      players: [0, 1].map((p) => ({
        poke: opt.pokes[p],
        cpu: (opt.cpu && opt.cpu[p]) || null,
        cards: [{ effect: POKE[opt.pokes[p]].effect, name: POKE[opt.pokes[p]].move, own: true }],
        stars: 0,
        home: startCell(size, p),
      })),
      turn: opt.first || 0,
      phase: "roll", // roll → place → (roll 또는 다음 사람) … over
      die: 0, dice: [], need: 0,
      card: null, // 이번 차례에 쓴 카드 효과
      extra: false, // 포켓볼 먹음 → 한 번 더
      turns: 0,
      log: [],
      rand,
    };
    owner[startCell(size, 0)] = 0;
    owner[startCell(size, 1)] = 1;
    return s;
  }

  // ---------- 판단 ----------
  function cellsOf(s, p) {
    const out = [];
    for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === p) out.push(i);
    return out;
  }
  /** 내 땅에 닿은 빈 칸 */
  function frontier(s, p) {
    const set = new Set();
    for (let i = 0; i < s.owner.length; i++) {
      if (s.owner[i] !== p) continue;
      for (const j of nbrs(s.size, i)) if (s.owner[j] === EMPTY) set.add(j);
    }
    return [...set];
  }
  /** 이어진 빈 칸 덩어리 하나 (start 부터) */
  function emptyRegion(s, start) {
    const seen = new Set([start]), q = [start];
    while (q.length) {
      const i = q.pop();
      for (const j of nbrs(s.size, i)) if (!seen.has(j) && s.owner[j] === EMPTY) { seen.add(j); q.push(j); }
    }
    return seen;
  }
  /** 한 번에 붙일 수 있는 가장 큰 덩어리 크기 (내 땅에 닿은 빈 칸 덩어리 중 가장 큰 것) */
  function maxAttach(s, p) {
    let best = 0;
    const done = new Set();
    for (const f of frontier(s, p)) {
      if (done.has(f)) continue;
      const reg = emptyRegion(s, f);
      reg.forEach((i) => done.add(i));
      best = Math.max(best, reg.size);
    }
    return best;
  }
  /** 같은 주인 칸 덩어리들의 크기 중 가장 큰 것 */
  function largestBlob(s, p) {
    const seen = new Set();
    let best = 0, bestCells = [];
    for (let i = 0; i < s.owner.length; i++) {
      if (s.owner[i] !== p || seen.has(i)) continue;
      const blob = [i], q = [i];
      seen.add(i);
      while (q.length) {
        const k = q.pop();
        for (const j of nbrs(s.size, k)) if (!seen.has(j) && s.owner[j] === p) { seen.add(j); q.push(j); blob.push(j); }
      }
      if (blob.length > best) { best = blob.length; bestCells = blob; }
    }
    return { size: best, cells: bestCells };
  }
  function score(s, p) {
    const b = largestBlob(s, p);
    return { land: b.size, stars: s.players[p].stars, total: b.size + s.players[p].stars * STAR_POINTS, cells: b.cells };
  }

  /** 지금 고른 칸들에 i 를 더할 수 있나 — 첫 칸은 내 땅 옆, 그다음은 고른 칸 옆 */
  function canAdd(s, p, sel, i) {
    if (s.owner[i] !== EMPTY || sel.includes(i) || sel.length >= s.need) return false;
    const touch = sel.length === 0 ? (j) => s.owner[j] === p : (j) => sel.includes(j);
    return nbrs(s.size, i).some(touch);
  }
  /** 다 고른 덩어리가 맞는지 (순서 상관 없이 판정) */
  function validGroup(s, p, sel) {
    if (sel.length !== s.need || new Set(sel).size !== sel.length) return false;
    if (!sel.every((i) => s.owner[i] === EMPTY)) return false;
    if (!sel.some((i) => nbrs(s.size, i).some((j) => s.owner[j] === p))) return false;
    const set = new Set(sel), seen = new Set([sel[0]]), q = [sel[0]];
    while (q.length) {
      const k = q.pop();
      for (const j of nbrs(s.size, k)) if (set.has(j) && !seen.has(j)) { seen.add(j); q.push(j); }
    }
    return seen.size === sel.length;
  }
  /** 빼앗을 수 있는 상대 칸: 내 땅 옆, 상대 시작 칸 아님 */
  function stealTargets(s, p) {
    const o = 1 - p, out = [];
    for (let i = 0; i < s.owner.length; i++) {
      if (s.owner[i] !== o || i === s.players[o].home) continue;
      if (nbrs(s.size, i).some((j) => s.owner[j] === p)) out.push(i);
    }
    return out;
  }
  /** 바위를 놓을 수 있는 칸: 빈 칸, 보너스 아님 */
  function wallTargets(s) {
    const out = [];
    for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === EMPTY && !s.bonus[i]) out.push(i);
    return out;
  }
  const isOver = (s) => s.phase === "over";

  // ---------- 행동 (틀리면 Error) ----------
  function must(c, m) { if (!c) throw new Error(m); }
  const ev = (s, e) => { s.log.push(e); return e; };

  /** 카드 쓰기 (주사위 전에만, 차례마다 1장). steal/wall 은 대상 칸까지 함께 준다. */
  function useCard(s, k, targets) {
    const p = s.turn, pl = s.players[p];
    must(s.phase === "roll", "주사위 전에만 카드를 써요");
    must(!s.card, "카드는 한 차례에 1장");
    const card = pl.cards[k];
    must(card, "카드 없음");
    if (card.effect === "steal") {
      const t = targets && targets[0];
      must(stealTargets(s, p).includes(t), "빼앗을 수 없는 칸");
      s.owner[t] = p;
    } else if (card.effect === "wall") {
      const ok = wallTargets(s);
      must(targets && targets.length === Math.min(2, ok.length) && new Set(targets).size === targets.length && targets.every((t) => ok.includes(t)), "바위 칸이 맞지 않아요");
      targets.forEach((t) => (s.owner[t] = ROCK));
    }
    pl.cards.splice(k, 1);
    s.card = card.effect;
    return ev(s, { type: "card", p, card, targets: targets || [] });
  }

  /** 주사위. force = 시험용 숫자 (reroll 이면 [a,b]) */
  function roll(s, force) {
    const p = s.turn;
    must(s.phase === "roll", "지금은 주사위 차례가 아니에요");
    const d = () => 1 + ((s.rand() * 6) | 0);
    s.dice = s.card === "reroll" ? (Array.isArray(force) ? force : [force || d(), d()]) : [Array.isArray(force) ? force[0] : force || d()];
    s.die = Math.max(...s.dice);
    let want = s.die + (s.card === "plus2" ? 2 : 0);
    // 먼저 하는 사람은 첫 차례에 절반만 (올림) — 시뮬레이션상 선공 61% → 48%
    const half = s.turns === 0;
    if (half) want = Math.ceil(want / 2);
    const room = maxAttach(s, p);
    s.need = Math.min(want, room);
    s.phase = "place";
    const e = ev(s, { type: "roll", p, dice: s.dice.slice(), die: s.die, want, need: s.need, half });
    if (s.need === 0) { e.stuck = true; endTurn(s); }
    return e;
  }

  /** 고른 덩어리 놓기 */
  function place(s, sel) {
    const p = s.turn, pl = s.players[p];
    must(s.phase === "place", "지금은 놓는 차례가 아니에요");
    must(validGroup(s, p, sel), "이어진 " + s.need + "칸을 내 땅에 붙여야 해요");
    const got = [];
    for (const i of sel) {
      s.owner[i] = p;
      const b = s.bonus[i];
      if (!b) continue;
      s.bonus[i] = null;
      if (b === "ball") { s.extra = true; got.push({ kind: "ball", cell: i }); }
      else if (b === "star") { pl.stars++; got.push({ kind: "star", cell: i }); }
      else if (b === "box") {
        if (pl.cards.length < MAX_CARDS) {
          const keys = Object.keys(EFFECTS), eff = keys[(s.rand() * keys.length) | 0];
          const card = { effect: eff, name: EFFECTS[eff].short, own: false };
          pl.cards.push(card);
          got.push({ kind: "box", cell: i, card });
        } else { pl.stars++; got.push({ kind: "box-star", cell: i }); }
      }
    }
    const e = ev(s, { type: "place", p, cells: sel.slice(), got });
    endTurn(s);
    return e;
  }

  function endTurn(s) {
    s.turns++;
    const again = s.extra;
    s.extra = false;
    s.card = null;
    s.need = 0;
    if (!again) s.turn = 1 - s.turn;
    s.phase = "roll";
    checkOver(s);
  }
  /** 다음 차례 시작 전 확인: 둘 다 붙일 곳이 없으면 끝. 지금 사람만 막혔으면 넘김(카드가 없을 때). */
  function checkOver(s) {
    const a0 = maxAttach(s, 0), a1 = maxAttach(s, 1);
    if (a0 === 0 && a1 === 0) return finish(s);
    const p = s.turn;
    if ((p === 0 ? a0 : a1) === 0 && !s.players[p].cards.some((c) => c.effect === "steal" && stealTargets(s, p).length)) {
      ev(s, { type: "pass", p });
      s.turn = 1 - p;
    }
  }
  function finish(s) {
    s.phase = "over";
    const sc = [score(s, 0), score(s, 1)];
    s.result = { scores: sc, winner: sc[0].total === sc[1].total ? -1 : sc[0].total > sc[1].total ? 0 : 1 };
    ev(s, { type: "over", result: s.result });
  }

  return {
    EMPTY, ROCK, STAR_POINTS, MAX_CARDS, EFFECTS, POKEMON, POKE,
    rng, nbrs, startCell, mirror, newGame, cellsOf, frontier, emptyRegion, maxAttach, largestBlob, score,
    canAdd, validGroup, stealTargets, wallTargets, isOver, useCard, roll, place,
  };
});
