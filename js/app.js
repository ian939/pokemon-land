/* 포켓몬 땅따먹기 — 화면 (rules.js 의 엔진을 쓴다) */
import * as A from "./audio.js?v=2026-11-08a";

const R = window.Rules, C = window.Cpu, LINES = window.Lines.LINES;
const QS = new URLSearchParams(location.search);
const TEST = QS.has("test");
const SP = QS.has("fast") ? 0.03 : 1;
const $ = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => [...el.querySelectorAll(q)];
const wait = (ms) => new Promise((r) => setTimeout(r, ms * SP));
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const sprite = (p, anim) => `assets/sprites/${R.POKE[p].dex}.${anim ? "gif" : "png"}`;

// ---------- 저장 ----------
const Store = {
  get(k, d) { try { const v = localStorage.getItem("ttang:" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem("ttang:" + k); else localStorage.setItem("ttang:" + k, JSON.stringify(v)); } catch (e) {} },
};

// ---------- 소리 ----------
let muted = Store.get("muted", false);
A.setMuted(muted);
const say = (id) => { if (LINES[id]) A.play(`assets/voice/${id}.mp3`); };
const sfx = (k) => A.sfx(k);
document.addEventListener("pointerdown", () => A.unlock(), { capture: true });
A.audioState.onBlocked = () => {
  if ($(".sound-btn")) return;
  const b = document.createElement("button");
  b.className = "btn sound-btn";
  b.textContent = "🔊 눌러서 소리 켜기";
  b.onclick = () => { A.unlock(); b.remove(); };
  document.body.appendChild(b);
};
const voiceList = Object.keys(LINES).map((k) => `assets/voice/${k}.mp3`);

// ---------- 알림·창 ----------
let toastTimer = 0;
function toast(msg, ms = 1800) {
  const t = $("#toast");
  t.innerHTML = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms * Math.max(SP, 0.3));
}
function modal(html, cls = "") {
  const d = document.createElement("div");
  d.className = "modal " + cls;
  d.innerHTML = `<div class="box">${html}</div>`;
  $("#layer").appendChild(d);
  return d;
}
function pick(d) {
  return new Promise((res) => d.addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) { sfx("tap"); res(b.dataset.v); } }));
}
const closeModals = () => ($("#layer").innerHTML = "");

// =====================================================================
// 처음 화면
// =====================================================================
const MODES = { friend: "👫 친구랑", easy: "🤖 컴퓨터 쉬움", normal: "🤖 컴퓨터 보통" };
let setup = Store.get("setup", { mode: "friend", size: 10, pokes: ["pikachu", "squirtle"] });

function renderTitle() {
  closeModals();
  G = null;
  const saved = Store.get("save", null);
  const mb = "aaa...aaa...aa..b.a...bb....bb...bbb".split("").map((c) => `<i class="${c === "a" ? "a" : c === "b" ? "b" : ""}"></i>`).join("");
  $("#app").innerHTML = `<div class="title screen-title">
    <div class="hero"><img src="${sprite(setup.pokes[0], true)}" alt=""><span class="vs">VS</span><img src="${sprite(setup.pokes[1], true)}" alt=""></div>
    <h1>포켓몬 땅따먹기</h1>
    <div class="mini-board">${mb}</div>
    <div class="opts">
      <div class="row"><span class="lab">상대</span>${Object.entries(MODES).map(([k, v]) => `<button class="btn ${setup.mode === k ? "on" : ""}" data-mode="${k}">${v}</button>`).join("")}</div>
      <div class="row"><span class="lab">판</span>
        <button class="btn ${setup.size === 10 ? "on" : ""}" data-size="10">10×10 보통</button>
        <button class="btn ${setup.size === 8 ? "on" : ""}" data-size="8">8×8 빨리</button></div>
    </div>
    <div class="acts">
      ${saved ? `<button class="btn big go" data-a="resume">▶ 이어 하기</button>` : ""}
      <button class="btn big primary" data-a="new">${saved ? "새로 하기" : "▶ 시작!"}</button>
      <button class="btn big" data-a="help">📖 규칙</button>
    </div>
    <div class="foot">v${APP_VERSION}<span id="updFoot" class="upd"></span></div>
  </div>`;
  $("#app").onclick = (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    sfx("tap");
    if (b.dataset.mode) { setup.mode = b.dataset.mode; Store.set("setup", setup); renderTitle(); }
    else if (b.dataset.size) { setup.size = +b.dataset.size; Store.set("setup", setup); renderTitle(); }
    else if (b.dataset.a === "help") showHelp();
    else if (b.dataset.a === "resume") resumeGame(saved);
    else if (b.dataset.a === "new") renderPick(0, []);
  };
  A.preload(voiceList.slice(0, 20));
  checkUpdate();
  if (Update.ver) showUpdate();
}

function showHelp() {
  const d = modal(`<h2>📖 이렇게 놀아요</h2>
    <ul class="help">
      <li><span>🎲</span><span>주사위를 굴려요. 나온 숫자만큼 <b>이어진 칸</b>을 골라 <b>내 땅에 붙여요</b>. (옆으로·위아래로만, 대각선은 안 돼요)</span></li>
      <li><span>👆</span><span>내 땅 옆 빛나는 칸부터 손가락으로 쭉 그으면 돼요. 한 칸씩 톡톡 눌러도 돼요. 고른 칸을 다시 누르면 빠져요.</span></li>
      <li><span>🚧</span><span>상대가 넓어질 길을 먼저 막아요! 붙일 곳이 없으면 차례가 넘어가요.</span></li>
      <li><span><span class="ball"></span></span><span><b>포켓볼</b>: 주사위 한 번 더! &nbsp; ⭐ <b>별</b>: 끝날 때 +2점 &nbsp; 🎁 <b>상자</b>: 기술 카드</span></li>
      <li><span>🃏</span><span><b>기술 카드</b>는 주사위 굴리기 전에 한 장 써요. 🎲다시 굴리기 · ➕2칸 더 · ⚡상대 칸 빼앗기 · 🪨바위 세우기</span></li>
      <li><span>🏆</span><span>둘 다 더 붙일 곳이 없으면 끝! <b>가장 크게 이어진 내 땅 칸 수 + 별</b>이 많으면 이겨요.</span></li>
      <li><span>⚖️</span><span>먼저 하는 사람은 첫 차례에 주사위 숫자의 <b>반만</b> 붙여요.</span></li>
    </ul>
    <div class="row"><button class="btn big primary" data-v="ok">알겠어요!</button></div>`);
  pick(d).then(() => d.remove());
}

// =====================================================================
// 포켓몬 고르기
// =====================================================================
function renderPick(slot, chosen) {
  const vsCpu = setup.mode !== "friend";
  const who = slot === 0 ? (vsCpu ? "지온이" : "1P") : "2P";
  $("#app").innerHTML = `<div class="pick">
    <button class="menu-btn" data-a="back">◀</button>
    <h2><span class="who">${who}</span>포켓몬을 골라요!</h2>
    <div class="poke-grid">${R.POKEMON.map((p) => `<button class="poke-card ${chosen.includes(p.id) ? "taken" : ""}" data-p="${p.id}" style="--pc:${p.color}">
      <span class="sw"></span><img src="${sprite(p.id)}" alt=""><b>${p.name}</b><small>${R.EFFECTS[p.effect].icon} ${p.move}</small></button>`).join("")}</div>
  </div>`;
  if (slot === 0) say("choose");
  $("#app").onclick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    sfx("tap");
    if (b.dataset.a === "back") return renderTitle();
    const id = b.dataset.p;
    say("name-" + id);
    const next = chosen.concat(id);
    if (slot === 0 && vsCpu) {
      $("#app").onclick = null;
      b.style.background = "var(--hi)";
      await wait(700);
      const rest = R.POKEMON.filter((p) => p.id !== id);
      const cpu = rest[(Math.random() * rest.length) | 0].id;
      $(`[data-p="${cpu}"]`).style.background = "#cfe7ff";
      toast(`🤖 컴퓨터는 <b>${R.POKE[cpu].name}</b>!`);
      await wait(1100);
      startGame([id, cpu]);
    } else if (slot === 0) renderPick(1, next);
    else startGame(next);
  };
}

// =====================================================================
// 게임
// =====================================================================
let G = null; // { s, ui, first }

function startGame(pokes, first) {
  setup.pokes = pokes;
  Store.set("setup", setup);
  const cpu = setup.mode === "friend" ? [null, null] : [null, setup.mode];
  const seed = QS.has("seed") ? +QS.get("seed") : undefined;
  const s = R.newGame({ size: setup.size, pokes, cpu, seed, first: first || 0 });
  G = { s, first: first || 0, ui: freshUi(), seen: 0 };
  renderGame();
  say("go");
  setTimeout(() => startTurn(), 900 * SP);
}
function resumeGame(saved) {
  const s = saved.s;
  s.rand = R.rng((s.seed ^ (s.log.length * 2654435761)) >>> 0);
  G = { s, first: saved.first || 0, ui: freshUi(), seen: s.log.length };
  renderGame();
  startTurn();
}
function save() {
  if (!G || TEST) return;
  if (G.s.phase === "over") return Store.set("save", null);
  const { rand, ...rest } = G.s;
  Store.set("save", { s: rest, first: G.first, setup });
}
const freshUi = () => ({ sel: [], card: null, targets: [], busy: false, rolling: false, drag: null });

const isCpu = (p) => !!G.s.players[p].cpu;
const human = () => G && !isCpu(G.s.turn) && !G.ui.busy;

function cellSize() {
  const n = G.s.size, W = innerWidth, H = innerHeight, chrome = 24 + 32;
  let avail;
  if (W >= H) {
    const pw = Math.min(250, Math.max(170, W * 0.2));
    avail = Math.min(H - chrome, W - 2 * pw - 24 - chrome);
  } else avail = Math.min(W - chrome, H - 2 * 170 - 24 - chrome);
  return Math.max(30, Math.floor(avail / n));
}

function renderGame() {
  const s = G.s, n = s.size;
  const P = s.players.map((p) => R.POKE[p.poke]);
  document.documentElement.style.setProperty("--c0", P[0].color);
  document.documentElement.style.setProperty("--d0", P[0].dark);
  document.documentElement.style.setProperty("--c1", P[1].color);
  document.documentElement.style.setProperty("--d1", P[1].dark);
  let cells = "";
  for (let i = 0; i < n * n; i++) cells += `<div class="cell ${((i / n | 0) + i % n) % 2 ? "alt" : ""}" data-i="${i}"><span class="ico"></span></div>`;
  const panel = (p) => `<section class="panel p${p}" style="--pc:${P[p].color};--pd:${P[p].dark};--pcs:${P[p].color}aa">
      <div class="who"><img class="face" src="${sprite(s.players[p].poke)}" alt=""><span class="name">${P[p].name}</span>
        <span class="tag">${isCpu(p) ? "🤖 컴퓨터" : setup.mode === "friend" ? (p === 0 ? "1P" : "2P") : "지온이"}</span></div>
      <div class="score"></div>
      <div class="cards"></div>
      <div class="act"></div>
    </section>`;
  $("#app").innerHTML = `<div class="game ${setup.mode === "friend" ? "f2f" : ""}">
    <button class="menu-btn" data-a="menu">☰</button>
    ${panel(0)}
    <div class="boardwrap"><div class="board" style="grid-template-columns:repeat(${n}, var(--cell))">${cells}
      <img class="mon m0" src="${sprite(s.players[0].poke)}" alt=""><img class="mon m1" src="${sprite(s.players[1].poke)}" alt=""></div></div>
    ${panel(1)}
  </div>`;
  G.mon = [s.players[0].home, s.players[1].home];
  fit();
  bindBoard();
  $("#app").onclick = onClick;
  update();
}
function fit() {
  if (!G || !$(".board")) return;
  $(".board").style.setProperty("--cell", cellSize() + "px");
  placeMons(false);
}
addEventListener("resize", () => fit());

function cellXY(i) {
  const cs = cellSize(), n = G.s.size;
  return { x: (i % n) * cs + cs / 2, y: ((i / n) | 0) * cs + cs / 2, cs };
}
function placeMons(hop) {
  [0, 1].forEach((p) => {
    const m = $(".mon.m" + p);
    if (!m) return;
    const { x, y, cs } = cellXY(G.mon[p]);
    m.style.left = x - cs * 0.675 + "px";
    m.style.top = y - cs * 0.85 + "px";
    m.src = sprite(G.s.players[p].poke, G.s.turn === p && G.s.phase !== "over");
    if (hop) { m.classList.remove("hop"); void m.offsetWidth; m.classList.add("hop"); }
  });
}
function floatText(i, text) {
  const { x, y } = cellXY(i);
  const f = document.createElement("div");
  f.className = "float";
  f.style.left = x + "px";
  f.style.top = y + "px";
  f.innerHTML = text;
  $(".board").appendChild(f);
  setTimeout(() => f.remove(), 1400);
}

// ---------- 판 그리기 ----------
function update() {
  const s = G.s, ui = G.ui, n = s.size, p = s.turn;
  const placing = s.phase === "place" && !isCpu(p) && !ui.busy;
  const can = new Set();
  if (placing && ui.sel.length < s.need) {
    for (let i = 0; i < s.owner.length; i++) if (R.canAdd(s, p, ui.sel, i)) can.add(i);
  }
  let targets = new Set();
  if (ui.card != null && !isCpu(p)) {
    const eff = s.players[p].cards[ui.card].effect;
    if (eff === "steal") targets = new Set(R.stealTargets(s, p));
    if (eff === "wall") targets = new Set(R.wallTargets(s));
  }
  const done = ui.sel.length === s.need && s.need > 0 && R.validGroup(s, p, ui.sel);
  const cells = $$(".board .cell");
  cells.forEach((el, i) => {
    const o = s.owner[i];
    const cl = el.classList;
    cl.toggle("o0", o === 0);
    cl.toggle("o1", o === 1);
    cl.toggle("rock", o === R.ROCK);
    cl.toggle("bonus", !!s.bonus[i]);
    cl.toggle("can", can.has(i));
    const si = ui.sel.indexOf(i);
    cl.toggle("sel", si >= 0);
    cl.toggle("done", si >= 0 && done);
    cl.toggle("target", targets.has(i) && !ui.targets.includes(i) && s.owner[i] !== R.EMPTY); // 빼앗기만 표시 (바위는 빈 칸 전부라 표시 안 함)
    cl.toggle("picked", ui.targets.includes(i));
    el.style.setProperty("--pcs", si >= 0 ? `var(--c${p})` : "");
    el.style.setProperty("--pd", `var(--d${p})`);
    // 같은 주인끼리 붙여서 한 덩어리처럼
    if (o === 0 || o === 1) {
      const r = (i / n) | 0, c = i % n;
      const t = r > 0 && s.owner[i - n] === o, b = r < n - 1 && s.owner[i + n] === o;
      const l = c > 0 && s.owner[i - 1] === o, rr = c < n - 1 && s.owner[i + 1] === o;
      el.style.setProperty("--it", t ? "0" : "2px"); el.style.setProperty("--ib", b ? "0" : "2px");
      el.style.setProperty("--il", l ? "0" : "2px"); el.style.setProperty("--ir", rr ? "0" : "2px");
      el.style.setProperty("--rtl", t || l ? "0" : "9px"); el.style.setProperty("--rtr", t || rr ? "0" : "9px");
      el.style.setProperty("--rbl", b || l ? "0" : "9px"); el.style.setProperty("--rbr", b || rr ? "0" : "9px");
    }
    const ico = el.firstElementChild;
    const want = o === R.ROCK ? "🪨" : s.bonus[i] === "ball" ? "ball" : s.bonus[i] === "star" ? "⭐" : s.bonus[i] === "box" ? "🎁" : "";
    if (ico.dataset.k !== want) {
      ico.dataset.k = want;
      ico.innerHTML = want === "ball" ? `<span class="ball"></span>` : want;
    }
    let num = el.querySelector(".num");
    if (si >= 0) {
      if (!num) { num = document.createElement("span"); num.className = "num"; el.appendChild(num); }
      num.textContent = si + 1;
    } else if (num) num.remove();
  });
  [0, 1].forEach(renderPanel);
}

function pips(v, cls = "") {
  const on = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[v] || [];
  return `<div class="die ${cls}">${Array.from({ length: 9 }, (_, k) => `<i class="${on.includes(k) ? "on" : ""}"></i>`).join("")}</div>`;
}

function renderPanel(p) {
  const s = G.s, ui = G.ui, pl = s.players[p];
  const el = $(".panel.p" + p);
  if (!el) return;
  const now = s.turn === p && s.phase !== "over";
  el.classList.toggle("now", now);
  const sc = R.score(s, p);
  $(".score", el).innerHTML = `<span class="land"><i></i>${sc.land}칸</span>${pl.stars ? `<span>⭐×${pl.stars}</span>` : ""}`;
  // 카드
  const mine = now && !isCpu(p) && !ui.busy && s.phase === "roll" && !s.card;
  let cards = pl.cards.map((c, k) => {
    const e = R.EFFECTS[c.effect];
    return `<button class="card ${c.own ? "own" : ""} ${mine && ui.card == null ? "usable" : ""} ${ui.card === k && now ? "active" : ""}" data-card="${k}" ${mine ? "" : "disabled"}>
      <span class="ic">${e.icon}</span><span class="nm">${esc(c.name)}</span><span>${c.own ? e.short : ""}</span></button>`;
  }).join("");
  for (let k = pl.cards.length; k < R.MAX_CARDS; k++) cards += `<span class="card slot"></span>`;
  $(".cards", el).innerHTML = cards;
  // 행동 칸
  const act = $(".act", el);
  if (!now) { act.innerHTML = ""; return; }
  if (isCpu(p)) {
    act.innerHTML = ui.diceHtml || `<div class="hint">🤖 생각 중…</div>`;
    return;
  }
  if (ui.rolling || ui.busy) { act.innerHTML = ui.diceHtml || ""; return; }
  if (s.phase === "roll") {
    if (ui.card != null) {
      const c = pl.cards[ui.card], e = R.EFFECTS[c.effect];
      const needT = c.effect === "steal" ? 1 : c.effect === "wall" ? Math.min(2, R.wallTargets(s).length) : 0;
      const ready = ui.targets.length === needT;
      const hint = c.effect === "steal" ? "빼앗을 칸(빨간 테두리)을 눌러요" : c.effect === "wall" ? `바위를 놓을 빈 칸 2개를 눌러요 (${ui.targets.length}/2)` : e.text;
      act.innerHTML = `<div class="hint"><b>${e.icon} ${esc(c.name)}</b><br>${hint}</div>
        <div class="dice-row"><button class="btn go" data-a="useCard" ${ready ? "" : "disabled"}>쓰기</button><button class="btn" data-a="cancelCard">취소</button></div>`;
    } else {
      act.innerHTML = `<button class="dice-btn ready" data-a="roll">${pips(5)}<span class="lbl">주사위 굴리기!</span></button>`;
    }
    return;
  }
  if (s.phase === "place") {
    const full = ui.sel.length === s.need;
    act.innerHTML = `${ui.diceHtml || ""}
      <div class="count">${ui.sel.length} <small>/ ${s.need}</small></div>
      <div class="hint">${full ? "좋아요! <b>놓기</b>를 눌러요" : ui.sel.length ? "이어서 더 골라요" : "빛나는 칸부터 쭉 그어요"}</div>
      <div class="dice-row"><button class="btn go big" data-a="place" ${full ? "" : "disabled"}>놓기</button>
      <button class="btn" data-a="clear" ${ui.sel.length ? "" : "disabled"}>↺</button></div>`;
  }
}

// ---------- 누르기 ----------
async function onClick(e) {
  const b = e.target.closest("button");
  if (!b || !G) return;
  if (b.dataset.a === "menu") { sfx("tap"); return showMenu(); }
  if (!human()) return;
  const s = G.s, ui = G.ui;
  if (b.dataset.card != null) {
    sfx("tap");
    const k = +b.dataset.card, c = s.players[s.turn].cards[k];
    if (c.effect === "steal" && !R.stealTargets(s, s.turn).length) return toast("⚡ 지금은 빼앗을 칸이 없어요 (상대 땅이 내 땅 옆에 있어야 해요)");
    ui.card = ui.card === k ? null : k;
    ui.targets = [];
    return update();
  }
  switch (b.dataset.a) {
    case "cancelCard": sfx("tap"); ui.card = null; ui.targets = []; return update();
    case "useCard": return useCard();
    case "roll": return doRoll();
    case "clear": sfx("tap"); ui.sel = []; return update();
    case "place": return doPlace(ui.sel.slice());
  }
}

function bindBoard() {
  const board = $(".board");
  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const c = el && el.closest(".cell");
    return c && board.contains(c) ? +c.dataset.i : -1;
  };
  board.addEventListener("pointerdown", (e) => {
    if (!human()) return;
    e.preventDefault();
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    const s = G.s, ui = G.ui;
    if (s.phase === "roll" && ui.card != null) return tapTarget(i);
    if (s.phase !== "place") {
      if (s.phase === "roll") { flash(i); toast("🎲 먼저 주사위를 굴려요!", 1200); }
      return;
    }
    try { board.setPointerCapture(e.pointerId); } catch (x) {}
    const k = ui.sel.indexOf(i);
    ui.drag = { start: i, last: i, moved: false, removeAt: k };
    if (k < 0) addCell(i, true);
  });
  board.addEventListener("pointermove", (e) => {
    const ui = G && G.ui;
    if (!ui || !ui.drag || !human()) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0 || i === ui.drag.last) return;
    ui.drag.last = i;
    if (!ui.drag.moved) {
      ui.drag.moved = true;
      // 고른 칸에서 시작한 끌기 = 거기서부터 이어 그리기
      if (ui.drag.removeAt >= 0) ui.sel.length = ui.drag.removeAt + 1;
    }
    const sel = ui.sel;
    if (sel.length >= 2 && sel[sel.length - 2] === i) { sel.pop(); sfx("tap"); return update(); } // 되돌아가면 지움
    addCell(i, false);
  });
  const up = () => {
    const ui = G && G.ui;
    if (!ui || !ui.drag) return;
    const d = ui.drag;
    ui.drag = null;
    if (!d.moved && d.removeAt >= 0) { ui.sel.length = d.removeAt; sfx("tap"); update(); } // 고른 칸 톡 = 거기부터 빼기
  };
  board.addEventListener("pointerup", up);
  board.addEventListener("pointercancel", up);
}
function flash(i) {
  const el = $(`.cell[data-i="${i}"]`);
  if (!el) return;
  el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
}
function addCell(i, loud) {
  const s = G.s, ui = G.ui;
  if (R.canAdd(s, s.turn, ui.sel, i)) {
    ui.sel.push(i);
    sfx("tap");
    update();
    const el = $(`.cell[data-i="${i}"]`);
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
  } else if (loud) {
    flash(i);
    if (s.owner[i] === R.EMPTY && ui.sel.length < s.need) toast(ui.sel.length ? "고른 칸 바로 옆에 이어서 골라요" : "내 땅 바로 옆(빛나는 칸)부터 골라요", 1400);
  }
}
function tapTarget(i) {
  const s = G.s, ui = G.ui, c = s.players[s.turn].cards[ui.card];
  const ok = c.effect === "steal" ? R.stealTargets(s, s.turn) : c.effect === "wall" ? R.wallTargets(s) : [];
  if (!ok.includes(i)) return flash(i);
  sfx("tap");
  const k = ui.targets.indexOf(i);
  if (k >= 0) ui.targets.splice(k, 1);
  else if (c.effect === "steal") ui.targets = [i];
  else if (ui.targets.length < 2) ui.targets.push(i);
  update();
}

// ---------- 행동 ----------
async function useCard() {
  const s = G.s, ui = G.ui, p = s.turn;
  const c = s.players[p].cards[ui.card];
  try { R.useCard(s, ui.card, ui.targets.slice()); } catch (e) { return toast(e.message); }
  const targets = ui.targets.slice();
  ui.card = null; ui.targets = []; ui.busy = true;
  sfx("star");
  await showCardUse(p, c, targets);
  ui.busy = false;
  update();
  save();
}
async function showCardUse(p, c, targets) {
  const e = R.EFFECTS[c.effect];
  toast(`${e.icon} <b>${esc(c.name)}</b>! ${e.text}`, 2200);
  if (c.effect === "steal") { say("steal"); targets.forEach((i) => floatText(i, "⚡")); }
  if (c.effect === "wall") { say("wall"); targets.forEach((i) => floatText(i, "🪨")); }
  update();
  targets.forEach((i) => { const el = $(`.cell[data-i="${i}"]`); el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop"); });
  if (c.effect === "steal") checkMonCell();
  await wait(900);
}
function checkMonCell() {
  [0, 1].forEach((p) => { if (G.s.owner[G.mon[p]] !== p) G.mon[p] = G.s.players[p].home; });
  placeMons(true);
}

async function doRoll(force) {
  const s = G.s, ui = G.ui, p = s.turn;
  if (s.phase !== "roll") return;
  ui.busy = true; ui.rolling = true;
  const two = s.card === "reroll";
  for (let t = 0; t < 7; t++) {
    ui.diceHtml = `<div class="dice-row">${pips(1 + ((Math.random() * 6) | 0), "rolling")}${two ? pips(1 + ((Math.random() * 6) | 0), "rolling") : ""}</div>`;
    renderPanel(p);
    sfx("tap");
    await wait(85);
  }
  const ev = R.roll(s, force);
  const d = ev.dice;
  ui.diceHtml = `<div class="dice-row">${d.map((v) => pips(v, d.length > 1 && v < ev.die ? "dim" : "")).join("")}</div>`;
  ui.rolling = false;
  G.seen = s.log.length;
  if (ev.stuck) {
    say("room");
    toast(`😵 붙일 칸이 없어요! 차례가 넘어가요`);
    renderPanel(p);
    await wait(1600);
    ui.busy = false; ui.diceHtml = "";
    return afterTurn();
  }
  say("n" + Math.min(8, ev.need));
  if (ev.half) toast(`⚖️ 먼저 하는 사람은 첫 차례에 반만! <b>${ev.die} → ${ev.need}칸</b>`, 2600);
  else if (ev.want > ev.die) toast(`➕ ${ev.die} + 2 = <b>${ev.want}칸</b>!`, 2000);
  if (ev.need < ev.want && !ev.half) toast(`이어진 빈 칸이 <b>${ev.need}칸</b>뿐이라 ${ev.need}칸만 붙여요`, 2600);
  ui.sel = [];
  ui.busy = false;
  update();
}

async function doPlace(sel) {
  const s = G.s, ui = G.ui, p = s.turn;
  if (!R.validGroup(s, p, sel)) return toast("이어진 칸을 내 땅에 붙여야 해요");
  ui.busy = true;
  const ev = R.place(s, sel);
  G.seen = s.log.length;
  ui.sel = [];
  sfx("stamp");
  // 칸이 차례로 톡톡 생긴다
  const owner = s.owner.slice();
  sel.forEach((i) => (s.owner[i] = R.EMPTY));
  for (const i of sel) {
    s.owner[i] = owner[i];
    update();
    const el = $(`.cell[data-i="${i}"]`);
    el.classList.remove("pop"); void el.offsetWidth; el.classList.add("pop");
    await wait(90);
  }
  G.mon[p] = sel[sel.length - 1];
  placeMons(true);
  for (const g of ev.got) {
    if (g.kind === "ball") { say("again"); sfx("star"); floatText(g.cell, "한 번 더!"); toast("⚪ 포켓볼! <b>주사위 한 번 더!</b>", 2000); }
    else if (g.kind === "star" || g.kind === "box-star") { say("star"); sfx("star"); floatText(g.cell, "⭐ +2"); toast(g.kind === "star" ? "⭐ 별! 끝날 때 <b>+2점</b>" : "🎁 카드가 꽉 차서 ⭐ 별로 바꿨어요!", 2000); }
    else if (g.kind === "box") { say("card"); sfx("star"); floatText(g.cell, "🎁"); toast(`🎁 기술 카드! <b>${R.EFFECTS[g.card.effect].icon} ${R.EFFECTS[g.card.effect].short}</b>`, 2200); }
    await wait(1000);
  }
  await wait(250);
  ui.busy = false;
  ui.diceHtml = "";
  afterTurn();
}

function afterTurn() {
  const s = G.s;
  const fresh = s.log.slice(G.seen);
  G.seen = s.log.length;
  save();
  const pass = fresh.find((e) => e.type === "pass");
  if (pass && s.phase !== "over") toast(`😵 ${R.POKE[s.players[pass.p].poke].name}는 더 붙일 곳이 없어서 넘어가요`, 2200);
  startTurn(!!pass);
}

let turnToken = 0;
async function startTurn(delay) {
  const s = G.s, my = ++turnToken;
  G.ui.sel = []; G.ui.card = null; G.ui.targets = [];
  update();
  placeMons(false);
  if (s.phase === "over") return endGame();
  if (delay) await wait(1400);
  if (my !== turnToken || !G) return;
  say("turn-" + s.players[s.turn].poke);
  if (isCpu(s.turn)) cpuTurn(my);
}

async function cpuTurn(my) {
  const s = G.s, ui = G.ui, p = s.turn, lv = s.players[p].cpu;
  const rand = Math.random;
  ui.busy = true; update();
  await wait(1100);
  if (my !== turnToken) return;
  const c = C.chooseCard(s, lv, rand);
  if (c) {
    const card = s.players[p].cards[c.k];
    R.useCard(s, c.k, c.targets);
    await showCardUse(p, card, c.targets);
    await wait(500);
  }
  ui.busy = false;
  await doRoll();
  if (my !== turnToken || s.phase !== "place" || s.turn !== p) return; // 막혀서 넘어갔으면 끝
  ui.busy = true; // 컴퓨터 차례 동안은 사람 손 막기
  renderPanel(p);
  await wait(700);
  if (my !== turnToken) return;
  const sel = C.choosePlace(s, lv, rand);
  // 한 칸씩 고르는 모습을 보여 준다
  for (const i of sel) {
    ui.sel.push(i);
    update();
    sfx("tap");
    await wait(260);
  }
  await wait(400);
  if (my !== turnToken) return;
  ui.busy = false;
  await doPlace(sel);
}

// ---------- 끝 ----------
async function endGame() {
  const s = G.s, res = s.result;
  Store.set("save", null);
  placeMons(false);
  // 가장 큰 덩어리만 남기고 흐리게
  const keep = new Set([...res.scores[0].cells, ...res.scores[1].cells]);
  $$(".board .cell").forEach((el, i) => el.classList.toggle("dimmed", (s.owner[i] === 0 || s.owner[i] === 1) && !keep.has(i)));
  await wait(1300);
  const w = res.winner;
  const side = (p) => {
    const sc = res.scores[p], P = R.POKE[s.players[p].poke];
    return `<div class="side ${w === p ? "win" : ""}" style="--pc:${P.color}">
      <div class="crown">${w === p ? "👑" : ""}</div><img src="${sprite(P.id, w === p)}" alt="">
      <b>${P.name}</b><div class="line">땅 <b class="cnt" data-to="${sc.land}">0</b>칸${sc.stars ? ` + ⭐${sc.stars}×${R.STAR_POINTS}` : ""}</div>
      <div class="total" data-to="${sc.total}">0</div></div>`;
  };
  const msg = w === -1 ? "비겼어요! 🤝" : `${R.POKE[s.players[w].poke].name} 승리!`;
  const d = modal(`<h2>🏁 땅따먹기 끝!</h2><div class="vs">${side(0)}${side(1)}</div>
    <div class="msg">${msg}</div>
    <div class="row"><button class="btn big primary" data-v="again">🔄 한 판 더</button><button class="btn big" data-v="home">🏠 처음으로</button></div>`, "end");
  // 숫자 올라가기
  const nums = $$("[data-to]", d);
  const max = Math.max(...nums.map((x) => +x.dataset.to));
  for (let k = 0; k <= max; k++) {
    nums.forEach((x) => (x.textContent = Math.min(k, +x.dataset.to)));
    if (k % 3 === 0) sfx("tap");
    await wait(Math.max(12, 600 / max));
  }
  if (w === -1) say("tie");
  else { say("win-" + s.players[w].poke); sfx("right"); confetti(R.POKE[s.players[w].poke].color); }
  const v = await pick(d);
  d.remove();
  if (v === "home") return renderTitle();
  const first = setup.mode === "friend" ? 1 - G.first : 0; // 친구랑이면 번갈아 먼저
  startGame(s.players.map((x) => x.poke), first);
}
function confetti(color) {
  const cs = [color, "#ffd84a", "#ff6b9a", "#5bd0ff", "#7ee08f"];
  for (let k = 0; k < 60; k++) {
    const c = document.createElement("i");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = cs[k % cs.length];
    c.style.animationDuration = 1.8 + Math.random() * 1.8 + "s";
    c.style.animationDelay = Math.random() * 0.6 + "s";
    document.body.appendChild(c);
    setTimeout(() => c.remove(), 4500);
  }
}

// ---------- 메뉴 ----------
function showMenu() {
  const d = modal(`<h2>⏸ 잠깐 멈춤</h2>
    <div class="row"><button class="btn big primary" data-v="go">▶ 계속하기</button></div>
    <div class="row"><button class="btn" data-v="help">📖 규칙</button><button class="btn" data-v="snd">${muted ? "🔇 소리 켜기" : "🔊 소리 끄기"}</button><button class="btn" data-v="home">🏠 처음으로</button></div>
    <p style="font-size:14px;opacity:.7">처음으로 가도 이 판은 저장돼서 "이어 하기"로 돌아올 수 있어요</p>`);
  pick(d).then((v) => {
    d.remove();
    if (v === "help") showHelp();
    else if (v === "snd") { muted = !muted; Store.set("muted", muted); A.setMuted(muted); showMenu(); }
    else if (v === "home") { turnToken++; save(); renderTitle(); }
  });
}

// =====================================================================
// 새 버전 확인 (패드가 옛 파일을 붙들고 있는 문제)
// =====================================================================
const Update = { last: 0, ver: null, shown: false };
async function checkUpdate(force) {
  if (location.protocol === "file:" || !navigator.onLine || TEST) return;
  const now = Date.now();
  if (!force && now - Update.last < 60000) return;
  Update.last = now;
  try {
    const r = await fetch(location.pathname + "?v=" + now, { cache: "no-store" });
    if (r.ok) {
      const m = /APP_VERSION\s*=\s*"([^"]+)"/.exec(await r.text());
      if (m && m[1] !== APP_VERSION) Update.ver = m[1];
    }
  } catch (e) { return; }
  if (Update.ver) showUpdate();
}
function showUpdate() {
  const f = $("#updFoot");
  if (f) f.innerHTML = ` → <button class="btn" style="font-size:14px;padding:4px 10px" onclick="location.replace(location.pathname+'?v='+Date.now())">🎁 새 버전으로 바꾸기</button>`;
  if (!$(".screen-title") || Update.shown) return; // 판 중엔 방해하지 않는다
  Update.shown = true;
  const d = modal(`<h2>🎁 새 버전이 나왔어요!</h2><p>지금 <b>v${esc(APP_VERSION)}</b> → 새 버전 <b>v${esc(Update.ver)}</b></p>
    <div class="row"><button class="btn big primary" data-v="go">🔄 새 버전으로 바꾸기</button><button class="btn big" data-v="later">나중에</button></div>`);
  pick(d).then((v) => { d.remove(); if (v === "go") { save(); location.replace(location.pathname + "?v=" + Date.now()); } });
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
addEventListener("online", () => checkUpdate(true));
setInterval(() => checkUpdate(), 10 * 60000);

// 시험용 손잡이
if (TEST) window.__T = { get G() { return G; }, R, setup: (o) => Object.assign(setup, o), startGame, doRoll, doPlace, renderTitle };

renderTitle();
