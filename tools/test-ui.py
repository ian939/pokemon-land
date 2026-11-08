"""화면 시험 — 로컬 서버로 띄워 iPad 크기에서 실제로 눌러 본다. 스크린샷은 tools/shots/ (git 제외)

    py tools/test-ui.py
"""
import http.server, pathlib, socketserver, sys, threading, functools
from playwright.sync_api import sync_playwright

for s in (sys.stdout, sys.stderr):
    s.reconfigure(encoding="utf-8")
ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / "tools" / "shots"
SHOTS.mkdir(exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
H = functools.partial(Quiet, directory=str(ROOT))
srv = socketserver.TCPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_address[1]}/index.html"
fails = []
def ok(c, m):
    print(("✓ " if c else "✗ ") + m)
    if not c: fails.append(m)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    for name, vw, vh in [("land", 1180, 820), ("port", 820, 1180), ("small", 1024, 768)]:
        pg = b.new_page(viewport={"width": vw, "height": vh}, has_touch=True)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: m.type == "error" and errs.append(m.text))
        pg.goto(URL + "?test&fast&seed=5")
        pg.wait_for_selector(".title")
        if name == "land": pg.screenshot(path=str(SHOTS / "1-title.png"))
        # 친구랑 → 포켓몬 둘 고르기
        pg.click('[data-mode="friend"]'); pg.click('[data-a="new"]')
        pg.click('[data-p="pikachu"]'); pg.click('[data-p="charmander"]')
        pg.wait_for_selector(".board")
        pg.wait_for_function("__T.G && __T.G.s.phase==='roll' && !__T.G.ui.busy")
        cs = pg.evaluate("parseInt(getComputedStyle(document.querySelector('.board')).getPropertyValue('--cell'))")
        ok(cs >= 44, f"[{name}] 칸 크기 {cs}px ≥ 44")
        over = pg.evaluate("document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('.panel,.boardwrap')].some(e=>{const r=e.getBoundingClientRect();return r.right>innerWidth+1||r.bottom>innerHeight+1||r.left<-1||r.top<-1})")
        ok(not over, f"[{name}] 화면 밖으로 안 넘침")
        def center(i):
            return pg.evaluate(f"(()=>{{const b=document.querySelector('.cell[data-i=\"{i}\"]').getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]}})()")
        def roll6():
            pg.evaluate("(()=>{const r=__T.G.s.rand;__T.G.s.rand=()=>0.95;setTimeout(()=>__T.G.s.rand=r,3000)})()")
            pg.click('[data-a="roll"]')
            pg.wait_for_function("__T.G.s.phase==='place' && !__T.G.ui.busy")
        n = pg.evaluate("__T.G.s.size")
        ok(pg.evaluate("__T.G.s.owner.every(o=>o<0)"), f"[{name}] 빈 판에서 시작")
        # 1P 첫 차례 = 1칸, 판 가운데 아무 데나
        roll6()
        ok(pg.evaluate("__T.G.s.need") == 1, f"[{name}] 선공 첫 차례 1칸")
        mid = (n // 2) * n + n // 2
        x, y = center(mid); pg.mouse.click(x, y)
        pg.click('[data-a="place"]')
        pg.wait_for_function("__T.G.s.turn===1 && !__T.G.ui.busy")
        ok(pg.evaluate(f"__T.G.s.owner[{mid}]") == 0, f"[{name}] 첫 땅을 가운데에")
        # 2P: 6 → 1P 바로 위에서 가로로 쭉 그어 막기 (모자라면 아래 줄로)
        roll6()
        need = pg.evaluate("__T.G.s.need")
        r0 = n // 2 - 1
        path = [r0 * n + c for c in range(n // 2 - 2, n // 2 - 2 + need)]
        x, y = center(path[0]); pg.mouse.move(x, y); pg.mouse.down()
        for i in path[1:]:
            x, y = center(i); pg.mouse.move(x, y, steps=4)
        pg.mouse.up()
        sel = pg.evaluate("__T.G.ui.sel")
        ok(sel == path, f"[{name}] 상대 옆에 끌어서 {need}칸 고르기 {sel}")
        x, y = center(path[-1]); pg.mouse.click(x, y)
        ok(pg.evaluate("__T.G.ui.sel.length") == need - 1, f"[{name}] 고른 칸 톡 → 빠짐")
        pg.mouse.click(x, y)
        ok(pg.is_enabled('[data-a="place"]'), f"[{name}] 놓기 버튼 켜짐")
        pg.screenshot(path=str(SHOTS / f"2-select-{name}.png"))
        pg.click('[data-a="place"]')
        pg.wait_for_function("__T.G.s.turn===0 && !__T.G.ui.busy")
        ok(pg.evaluate("__T.R.cellsOf(__T.G.s,1).length") == need, f"[{name}] 놓기 → 1P 차례")
        # 남은 판은 자동으로 끝까지 (엔진 직접 + 화면 함수)
        pg.evaluate("""async()=>{const C=window.Cpu,R=__T.R;let g=0;
          while(__T.G.s.phase!=='over'&&g++<400){const s=__T.G.s;
            await __T.doRoll(); if(s.phase!=='place') continue;
            const sel=C.choosePlace(s,'normal',Math.random); await __T.doPlace(sel);}}""")
        pg.wait_for_selector(".end", timeout=20000)
        pg.wait_for_timeout(400)
        pg.screenshot(path=str(SHOTS / f"3-end-{name}.png"))
        ok(pg.evaluate("__T.G.s.phase") == "over", f"[{name}] 끝까지 감")
        ok(not errs, f"[{name}] 오류 없음 {errs[:3]}")
        pg.close()

    # 더한 규칙: 첫 땅 금지 칸 · 🌱 씨앗 · 🔄 끼우기 · 🏠 둘러싸기
    pg = b.new_page(viewport={"width": 1180, "height": 820}, has_touch=True)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL + "?test&fast&seed=5")
    pg.click('[data-mode="friend"]'); pg.click('[data-a="new"]')
    pg.click('[data-p="pikachu"]'); pg.click('[data-p="charmander"]')
    pg.wait_for_function("__T.G && __T.G.s.phase==='roll' && !__T.G.ui.busy")
    def center(i):
        return pg.evaluate(f"(()=>{{const b=document.querySelector('.cell[data-i=\"{i}\"]').getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]}})()")
    pg.click('[data-a="roll"]')
    pg.wait_for_function("__T.G.s.phase==='place' && !__T.G.ui.busy")
    banned = pg.evaluate("__T.G.s.bonus.findIndex(b=>b==='box'||b==='ball')")
    ok(pg.evaluate(f"document.querySelector('.cell[data-i=\"{banned}\"]').classList.contains('ban')"), "첫 땅: 상자·포켓볼 칸 흐리게")
    x, y = center(banned); pg.mouse.click(x, y)
    ok(pg.evaluate("__T.G.ui.sel.length") == 0, "첫 땅: 상자·포켓볼 칸 안 골라짐")
    # 판을 직접 꾸민다: 1P 왼쪽 위, 2P 오른쪽 아래 + 끼우기·둘러싸기 자리
    pg.evaluate("""(()=>{const s=__T.G.s,n=s.size,at=(r,c)=>r*n+c;s.bonus.fill(null);s.owner.fill(-1);
      [[0,1],[1,0],[5,0],[6,0],[6,1]].forEach(([r,c])=>s.owner[at(r,c)]=0);
      [[5,1],[5,2],[9,9],[8,9]].forEach(([r,c])=>s.owner[at(r,c)]=1);
      s.players[0].home=at(6,0);s.players[1].home=at(9,9);s.bonus[at(0,0)]='star';
      s.turn=0;s.turns=4;s.phase='roll';__T.G.ui.sel=[];})()""")
    pg.evaluate("(()=>{const r=__T.G.s.rand;__T.G.s.rand=()=>0.95;setTimeout(()=>__T.G.s.rand=r,3000)})()")
    pg.evaluate("__T.doRoll()")
    pg.wait_for_function("__T.G.s.phase==='place' && !__T.G.ui.busy")
    ok(pg.evaluate("[__T.G.s.need,__T.G.s.seedNeed]") == [6, 3], "주사위 6 → 붙이기 6 · 씨앗 3")
    # 씨앗: 가운데에 4칸 그으면 3칸에서 멈춤
    path = [44, 45, 46, 47]
    x, y = center(path[0]); pg.mouse.move(x, y); pg.mouse.down()
    for i in path[1:]:
        x, y = center(i); pg.mouse.move(x, y, steps=4)
    pg.mouse.up()
    ok(pg.evaluate("__T.G.ui.sel") == [44, 45, 46], "씨앗은 3칸까지만 그어짐")
    ok(pg.evaluate("document.querySelector('.cell[data-i=\"44\"]').classList.contains('seedsel')"), "씨앗 칸 표시")
    ok(pg.is_enabled('[data-a="place"]'), "씨앗 3칸 → 놓기 켜짐")
    pg.screenshot(path=str(SHOTS / "5-seed.png"))
    pg.click('[data-a="clear"]')
    # 끼우기: (6,1)(6,2)(6,3) 이 내 땅일 때 (5,3) 을 놓으면 (5,0) 과 사이의 (5,1)(5,2) 가 뒤집힘
    pg.evaluate("__T.G.s.owner[62]=0; __T.G.s.owner[63]=0; __T.G.s.need=1; __T.G.s.seedNeed=1")
    pg.evaluate("__T.doPlace([53])")
    pg.wait_for_function("__T.G.s.turn===1 && !__T.G.ui.busy", timeout=20000)
    ok(pg.evaluate("[__T.G.s.owner[51],__T.G.s.owner[52]]") == [0, 0], "끼운 2칸 뒤집힘")
    pg.screenshot(path=str(SHOTS / "6-flip.png"))
    pg.evaluate("__T.G.s.turn=0; __T.G.s.phase='place'; __T.G.s.need=1; __T.G.s.seedNeed=1")
    pg.evaluate("__T.doPlace([11])")
    pg.wait_for_function("__T.G.s.turn===1 && !__T.G.ui.busy", timeout=20000)
    ok(pg.evaluate("__T.G.s.owner[0]") == 0 and pg.evaluate("__T.G.s.players[0].stars") == 1, "모서리 둘러싸 차지 + 별")
    pg.screenshot(path=str(SHOTS / "7-wrap.png"))
    ok(not errs, f"[새 규칙] 오류 없음 {errs[:3]}")
    pg.close()

    # 컴퓨터 상대 + 카드
    pg = b.new_page(viewport={"width": 1180, "height": 820}, has_touch=True)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL + "?test&fast&seed=9")
    pg.click('[data-mode="normal"]'); pg.click('[data-a="new"]'); pg.click('[data-p="squirtle"]')
    pg.wait_for_selector(".board")
    pg.wait_for_function("__T.G && __T.G.s.phase==='roll' && __T.G.s.turn===0 && !__T.G.ui.busy")
    ok(pg.is_disabled('[data-card="0"]'), "맨 첫 차례엔 카드 못 누름")
    pg.click('[data-a="roll"]')
    pg.wait_for_function("__T.G.s.phase==='place' && !__T.G.ui.busy")
    pg.evaluate("__T.doPlace([44])")
    pg.wait_for_function("__T.G.s.turn===0 && __T.G.s.turns>=2 && __T.G.s.phase==='roll' && !__T.G.ui.busy", timeout=20000)
    ok(pg.evaluate("__T.R.cellsOf(__T.G.s,1).length") >= 1, "컴퓨터가 첫 땅을 놓음")
    # 둘째 차례: +2 카드
    pg.click('[data-card="0"]'); pg.click('[data-a="useCard"]')
    pg.wait_for_function("__T.G.s.card==='plus2' && !__T.G.ui.busy")
    pg.click('[data-a="roll"]')
    pg.wait_for_function("__T.G.s.phase==='place' && !__T.G.ui.busy")
    ok(pg.evaluate("__T.G.s.need") == pg.evaluate("Math.min(__T.G.s.die+2, __T.R.maxAttach(__T.G.s,0))"), "+2 카드")
    pg.evaluate("__T.doPlace(window.Cpu.choosePlace(__T.G.s,'normal',Math.random))")
    pg.wait_for_function("__T.G.s.turn===0 && __T.G.s.turns>=4 && !__T.G.ui.busy", timeout=20000)
    pg.screenshot(path=str(SHOTS / "4-vs-cpu.png"))
    ok(not errs, f"[cpu] 오류 없음 {errs[:3]}")
    b.close()
srv.shutdown()
print("✗ 실패 %d" % len(fails) if fails else "✓ 화면 시험 통과")
sys.exit(1 if fails else 0)
