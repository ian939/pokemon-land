/* 포켓몬 땅따먹기 — 규칙 엔진 (화면 없음, Node 에서 시험)
 *
 * 판: size×size 칸. owner[i] = -1 빈 칸 · 0/1 플레이어 · ROCK 바위
 * 한 차례: (카드 1장 쓰기) → 주사위 → 이어진 빈 칸 need 개를 한 덩어리로 골라 내 땅에 붙인다.
 * 시작 칸은 없다 — 첫 덩어리는 판 어디든 (상대 바로 옆에서 막아도 된다). 2026-11-08 사용자 요청
 * 연결은 상하좌우만. 점수 = 가장 큰 내 땅 덩어리 + 별 ×2.
 * 더한 규칙: 🌱 떨어진 곳에 주사위 절반(올림)만큼 심기 · 🔄 새 칸과 내 칸 사이에 끼운 상대 칸 뒤집기
 *           · 🏠 한쪽 땅에만 닿은 작은 빈 곳은 그 사람 땅이 됨 (판 끝·바위는 벽).  판이 다 차면 끝.
 */
(function (root, factory) {
  const R = factory();
  if (typeof module === "object" && module.exports) module.exports = R;
  else root.Rules = R;
})(typeof self !== "undefined" ? self : this, function () {
  const EMPTY = -1, ROCK = 9;
  const STAR_POINTS = 2;
  const MAX_CARDS = 2;
  const SECOND_MAX = 3; // 나중에 하는 사람 첫 땅 최대 칸 수
  const CAP_FRAC = 0.12; // 둘러싸기 한도 = 판의 12% (10×10 → 12칸) — 크게 두면 둘째 차례에 상대를 가둬 판을 통째로 먹는다

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
  const mirror = (size, i) => size * size - 1 - i; // 가운데 기준 점대칭 (두 시작 칸이 서로 맞바뀜)

  // 보너스 칸: 가운데 띠에 점대칭으로 3쌍 (포켓볼·별·상자)
  function placeBonus(size, rand) {
    const bonus = new Array(size * size).fill(null);
    const kinds = ["ball", "star", "box"];
    const dist = (a, b) => Math.abs(((a / size) | 0) - ((b / size) | 0)) + Math.abs((a % size) - (b % size));
    const ok = (i) => {
      const m = mirror(size, i);
      if (m === i || bonus[i] || bonus[m]) return false;
      if (dist(i, m) < 3) return false; // 가운데에 너무 몰리지 않게
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
        home: null, // 첫 덩어리의 첫 칸 (빼앗기 못 함)
      })),
      turn: opt.first || 0,
      phase: "roll", // roll → place → (roll 또는 다음 사람) … over
      die: 0, dice: [], need: 0, seedNeed: 0,
      // 더한 규칙 (2026-11-08 사용자 요청): 둘러싸기 · 끼워 뒤집기 · 씨앗 심기. 시험에서 끌 수 있게
      rules: Object.assign({ wrap: true, flip: true, seed: true }, opt.rules),
      flipMax: opt.flipMax || 2, // 한 줄에 끼워 뒤집을 수 있는 상대 칸 수 (길면 오셀로처럼 판이 마구 뒤집힌다)
      capMax: opt.capMax || Math.round(size * size * CAP_FRAC), // 한 번에 둘러쌀 수 있는 빈 칸 수
      card: null, // 이번 차례에 쓴 카드 효과
      extra: false, // 포켓볼 먹음 → 한 번 더
      turns: 0,
      log: [],
      rand,
    };
    return s;
  }

  // ---------- 판단 ----------
  function cellsOf(s, p) {
    const out = [];
    for (let i = 0; i < s.owner.length; i++) if (s.owner[i] === p) out.push(i);
    return out;
  }
  const hasLand = (s, p) => s.owner.includes(p);
  const nextTo = (s, i, p, own = s.owner) => nbrs(s.size, i).some((j) => own[j] === p);
  /** 내 땅에 닿은 빈 칸 (땅이 아직 없으면 모든 빈 칸) */
  function frontier(s, p) {
    if (!hasLand(s, p)) return s.owner.map((o, i) => (o === EMPTY ? i : -1)).filter((i) => i >= 0);
    const set = new Set();
    for (let i = 0; i < s.owner.length; i++) {
      if (s.owner[i] !== p) continue;
      for (const j of nbrs(s.size, i)) if (s.owner[j] === EMPTY) set.add(j);
    }
    return [...set];
  }
  /** 이어진 칸 덩어리 하나 (start 부터, ok(i) 인 칸만) */
  function region(s, start, ok) {
    const seen = new Set([start]), q = [start];
    while (q.length) {
      const i = q.pop();
      for (const j of nbrs(s.size, i)) if (!seen.has(j) && ok(j)) { seen.add(j); q.push(j); }
    }
    return seen;
  }
  const emptyRegion = (s, start, own = s.owner) => region(s, start, (j) => own[j] === EMPTY);
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
  /** 씨앗으로 심을 수 있는 가장 큰 덩어리 — 내 땅에 닿지 않는 빈 칸끼리 이어진 것 */
  function maxSeed(s, p) {
    const ok = (j) => s.owner[j] === EMPTY && !nextTo(s, j, p);
    let best = 0;
    const done = new Set();
    for (let i = 0; i < s.owner.length; i++) {
      if (done.has(i) || !ok(i)) continue;
      const reg = region(s, i, ok);
      reg.forEach((k) => done.add(k));
      best = Math.max(best, reg.size);
    }
    return best;
  }
  /** 첫 땅으로 놓을 수 있는 가장 큰 덩어리 (상자·포켓볼 칸 빼고) */
  function maxFirst(s, p) {
    const ok = (j) => s.owner[j] === EMPTY && !firstBan(s, j, p);
    let best = 0;
    const done = new Set();
    for (let i = 0; i < s.owner.length; i++) {
      if (done.has(i) || !ok(i)) continue;
      const reg = region(s, i, ok);
      reg.forEach((k) => done.add(k));
      best = Math.max(best, reg.size);
    }
    return best;
  }
  /** 같은 주인 칸 덩어리들의 크기 중 가장 큰 것 */
  function largestBlob(s, p, own = s.owner) {
    const seen = new Set();
    let best = 0, bestCells = [];
    for (let i = 0; i < own.length; i++) {
      if (own[i] !== p || seen.has(i)) continue;
      const blob = [...region(s, i, (j) => own[j] === p)];
      blob.forEach((k) => seen.add(k));
      if (blob.length > best) { best = blob.length; bestCells = blob; }
    }
    return { size: best, cells: bestCells };
  }
  function score(s, p) {
    const b = largestBlob(s, p);
    return { land: b.size, stars: s.players[p].stars, total: b.size + s.players[p].stars * STAR_POINTS, cells: b.cells };
  }

  /** 고른 칸들이 놓일 방식: first(첫 땅) · attach(내 땅에 붙이기) · seed(떨어진 곳에 심기) */
  function kindOf(s, p, sel) {
    if (!hasLand(s, p)) return "first";
    return sel.some((i) => nextTo(s, i, p)) ? "attach" : "seed";
  }
  /** 그 방식이면 몇 칸을 놓아야 하나 */
  const targetOf = (s, kind) => (kind === "seed" ? s.seedNeed : s.need);
  /** 첫 땅엔 🎁 상자·⚪ 포켓볼 칸을 못 고른다 (2026-11-08 사용자 요청 — 첫 차례부터 선물 먹기 없음) */
  const firstBan = (s, i, p) => s.bonus[i] === "ball" || s.bonus[i] === "box";
  /** 지금 고른 칸들에 i 를 더할 수 있나 — 첫 칸은 아무 빈 칸, 그다음은 고른 칸 옆. 붙이면 need, 떨어지면 seedNeed 까지 */
  function canAdd(s, p, sel, i) {
    if (s.owner[i] !== EMPTY || sel.includes(i)) return false;
    if (!hasLand(s, p) && firstBan(s, i, p)) return false;
    if (sel.length && !nbrs(s.size, i).some((j) => sel.includes(j))) return false;
    const next = sel.concat(i);
    return next.length <= targetOf(s, kindOf(s, p, next));
  }
  /** 다 고른 덩어리가 맞는지 (순서 상관 없이 판정) */
  function validGroup(s, p, sel) {
    if (!sel.length || new Set(sel).size !== sel.length) return false;
    if (!sel.every((i) => s.owner[i] === EMPTY)) return false;
    if (!hasLand(s, p) && sel.some((i) => firstBan(s, i, p))) return false;
    if (sel.length !== targetOf(s, kindOf(s, p, sel))) return false;
    const set = new Set(sel);
    return region(s, sel[0], (j) => set.has(j)).size === sel.length;
  }

  /** 끼우기: 새 칸에서 가로·세로로 상대 칸이 이어지다 내 칸으로 끝나면 그 상대 칸들 (상대 집 칸이 끼면 그 줄은 안 됨) */
  function flipsFrom(s, p, cells, own) {
    const o = 1 - p, n = s.size, out = new Set();
    for (const c of cells) {
      const r0 = (c / n) | 0, c0 = c % n;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const line = [];
        let r = r0 + dr, k = c0 + dc;
        while (line.length <= s.flipMax && r >= 0 && r < n && k >= 0 && k < n && own[r * n + k] === o) { line.push(r * n + k); r += dr; k += dc; }
        if (!line.length || line.length > s.flipMax || r < 0 || r >= n || k < 0 || k >= n || own[r * n + k] !== p) continue;
        if (line.includes(s.players[o].home)) continue;
        line.forEach((i) => out.add(i));
      }
    }
    return [...out];
  }
  /** 둘러싸기: 한 사람 땅에만 닿은 빈 칸 덩어리 (판 끝·바위는 벽). 너무 크면(capMax 넘음) 안 됨. 둘 다 땅이 있어야 함 */
  function capturesOf(s, own) {
    if (!own.includes(0) || !own.includes(1)) return [];
    const out = [], done = new Set();
    for (let i = 0; i < own.length; i++) {
      if (own[i] !== EMPTY || done.has(i)) continue;
      const reg = emptyRegion(s, i, own);
      reg.forEach((k) => done.add(k));
      if (reg.size > s.capMax) continue;
      const touch = new Set();
      reg.forEach((k) => nbrs(s.size, k).forEach((j) => { if (own[j] === 0 || own[j] === 1) touch.add(own[j]); }));
      if (touch.size === 1) out.push({ p: [...touch][0], cells: [...reg] });
    }
    return out;
  }
  /** 놓으면 무슨 일이 생기나 (판은 안 바뀜) → { own, flips, caps } */
  function resolve(s, p, sel) {
    const first = !hasLand(s, p); // 첫 땅으로는 둘러싸기 없음 (보너스 칸을 감싸 먹지 않게)
    const own = s.owner.slice();
    sel.forEach((i) => (own[i] = p));
    const flips = s.rules.flip ? flipsFrom(s, p, sel, own) : [];
    flips.forEach((i) => (own[i] = p));
    const caps = s.rules.wrap && !first ? capturesOf(s, own) : [];
    caps.forEach((c) => c.cells.forEach((i) => (own[i] = c.p)));
    return { own, flips, caps };
  }
  /** 빼앗을 수 있는 상대 칸: 내 땅 옆, 상대 시작 칸 아님 */
  function stealTargets(s, p) {
    const o = 1 - p, out = [];
    for (let i = 0; i < s.owner.length; i++) {
      if (s.owner[i] !== o || i === s.players[o].home) continue;
      if (nextTo(s, i, p)) out.push(i);
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

  /** 보너스 칸을 q 가 가져감 */
  function collect(s, q, i, got) {
    const b = s.bonus[i], pl = s.players[q];
    if (!b) return;
    s.bonus[i] = null;
    if (b === "ball") {
      if (q === s.turn) { s.extra = true; got.push({ kind: "ball", cell: i, p: q }); }
      else { pl.stars++; got.push({ kind: "ball-star", cell: i, p: q }); } // 상대 차례에 둘러싸여 얻은 포켓볼은 별로
    } else if (b === "star") { pl.stars++; got.push({ kind: "star", cell: i, p: q }); }
    else if (b === "box") {
      if (pl.cards.length < MAX_CARDS) {
        const keys = Object.keys(EFFECTS), eff = keys[(s.rand() * keys.length) | 0];
        const card = { effect: eff, name: EFFECTS[eff].short, own: false };
        pl.cards.push(card);
        got.push({ kind: "box", cell: i, card, p: q });
      } else { pl.stars++; got.push({ kind: "box-star", cell: i, p: q }); }
    }
  }
  /** 지금 판에서 둘러싸인 곳을 채움 (카드 쓴 뒤) */
  function applyCaptures(s, got) {
    const caps = s.rules.wrap ? capturesOf(s, s.owner) : [];
    caps.forEach((c) => c.cells.forEach((i) => { s.owner[i] = c.p; collect(s, c.p, i, got); }));
    return caps;
  }

  /** 카드 쓰기 (주사위 전에만, 차례마다 1장). steal/wall 은 대상 칸까지 함께 준다. */
  function useCard(s, k, targets) {
    const p = s.turn, pl = s.players[p];
    must(s.phase === "roll", "주사위 전에만 카드를 써요");
    must(!s.card, "카드는 한 차례에 1장");
    must(s.turns > 0, "맨 첫 차례엔 카드를 못 써요");
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
    const got = [];
    const caps = applyCaptures(s, got);
    const e = ev(s, { type: "card", p, card, targets: targets || [], caps, got });
    if (!s.owner.includes(EMPTY)) finish(s);
    return e;
  }

  /** 주사위. force = 시험용 숫자 (reroll 이면 [a,b]) */
  function roll(s, force) {
    const p = s.turn;
    must(s.phase === "roll", "지금은 주사위 차례가 아니에요");
    const d = () => 1 + ((s.rand() * 6) | 0);
    // 먼저 하는 사람은 첫 차례에 1칸만 (주사위 = 1) — 시작이 자유라 선공이 가운데를 먼저 차지한다. (tools/sim.js)
    const first = s.turns === 0;
    if (first) force = 1;
    s.dice = s.card === "reroll" ? (Array.isArray(force) ? force : [force || d(), d()]) : [Array.isArray(force) ? force[0] : force || d()];
    s.die = Math.max(...s.dice);
    // 나중에 하는 사람 첫 땅은 3칸까지 — 큰 숫자로 상대 첫 칸 바로 옆을 감싸 길을 다 막지 못하게 (2026-11-08 사용자 요청)
    // 시뮬레이션 보통끼리 선공:후공 — 그대로 46:53 · 둘 다 1칸 56:43 · 상대 옆 금지 42:56 · 2칸까지 51:46 · 3칸까지 49:49 (600판)
    // 3칸이면 상대 첫 칸을 완전히 가두는 건 판 모서리일 때뿐 (그래도 씨앗으로 빠져나옴)
    const second = !first && !hasLand(s, p);
    let want = first ? 1 : s.die + (s.card === "plus2" ? 2 : 0);
    if (second) want = Math.min(want, SECOND_MAX);
    s.need = Math.min(want, hasLand(s, p) ? maxAttach(s, p) : maxFirst(s, p));
    // 씨앗 = 떨어진 곳에 절반(올림)만. 첫 땅이면 어디든 need 그대로
    s.seedNeed = !hasLand(s, p) ? s.need : s.rules.seed ? Math.min(Math.ceil(want / 2), maxSeed(s, p)) : 0;
    s.phase = "place";
    const e = ev(s, { type: "roll", p, dice: s.dice.slice(), die: s.die, want, need: s.need, seedNeed: s.seedNeed, first, second });
    if (s.need === 0 && s.seedNeed === 0) { e.stuck = true; endTurn(s); }
    return e;
  }

  /** 고른 덩어리 놓기 → 끼운 상대 칸 뒤집기 → 둘러싼 빈 칸 채우기 */
  function place(s, sel) {
    const p = s.turn, pl = s.players[p];
    must(s.phase === "place", "지금은 놓는 차례가 아니에요");
    const kind = kindOf(s, p, sel);
    must(validGroup(s, p, sel), kind === "seed" ? `떨어진 곳엔 이어진 ${s.seedNeed}칸을 심어요` : `이어진 ${s.need}칸을 내 땅에 붙여야 해요`);
    const got = [];
    if (pl.home == null) pl.home = sel[0];
    const r = resolve(s, p, sel);
    for (const i of sel) { s.owner[i] = p; collect(s, p, i, got); }
    r.flips.forEach((i) => (s.owner[i] = p));
    r.caps.forEach((c) => c.cells.forEach((i) => { s.owner[i] = c.p; collect(s, c.p, i, got); }));
    const e = ev(s, { type: "place", p, kind, cells: sel.slice(), flips: r.flips, caps: r.caps, got });
    endTurn(s);
    return e;
  }

  function endTurn(s) {
    s.turns++;
    const again = s.extra;
    s.extra = false;
    s.card = null;
    s.need = 0;
    s.seedNeed = 0;
    if (!again) s.turn = 1 - s.turn;
    s.phase = "roll";
    checkOver(s);
  }
  /** 다음 차례 시작 전: 빈 칸이 없거나 둘 다 놓을 곳이 없으면 끝. 지금 사람만 막혔으면 넘김. */
  function canMove(s, p) {
    if (maxAttach(s, p) > 0) return true;
    return s.rules.seed && hasLand(s, p) && maxSeed(s, p) > 0;
  }
  function checkOver(s) {
    if (!s.owner.includes(EMPTY)) return finish(s);
    const m0 = canMove(s, 0), m1 = canMove(s, 1);
    if (!m0 && !m1) return finish(s);
    const p = s.turn;
    if (!(p === 0 ? m0 : m1) && !s.players[p].cards.some((c) => c.effect === "steal" && stealTargets(s, p).length)) {
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
    EMPTY, ROCK, STAR_POINTS, SECOND_MAX, MAX_CARDS, EFFECTS, POKEMON, POKE,
    rng, nbrs, hasLand, nextTo, mirror, newGame, cellsOf, frontier, emptyRegion, maxAttach, maxSeed, largestBlob, score,
    kindOf, targetOf, firstBan, canAdd, validGroup, flipsFrom, capturesOf, resolve, stealTargets, wallTargets, isOver, useCard, roll, place,
  };
});
