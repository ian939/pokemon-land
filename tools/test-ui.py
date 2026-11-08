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
        # 주사위 6 → 첫 차례 절반 3
        pg.evaluate("(()=>{const r=__T.G.s.rand;__T.G.s.rand=()=>0.95;setTimeout(()=>__T.G.s.rand=r,3000)})()")
        pg.click('[data-a="roll"]')
        pg.wait_for_function("__T.G.s.phase==='place' && !__T.G.ui.busy")
        need = pg.evaluate("__T.G.s.need")
        ok(need == pg.evaluate("Math.ceil(__T.G.s.die/2)"), f"[{name}] 선공 첫 차례 절반 ({need})")
        # 손가락으로 쭉 긋기: 시작 칸(왼쪽 아래) 위로
        n = pg.evaluate("__T.G.s.size")
        def center(i):
            r = pg.evaluate(f"(()=>{{const b=document.querySelector('.cell[data-i=\"{i}\"]').getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]}})()")
            return r
        path = [(n - 2 - k) * n for k in range(need)]  # 시작 칸 위로 한 줄
        x, y = center(path[0]); pg.mouse.move(x, y); pg.mouse.down()
        for i in path[1:]:
            x, y = center(i); pg.mouse.move(x, y, steps=4)
        pg.mouse.up()
        sel = pg.evaluate("__T.G.ui.sel")
        ok(sel == path, f"[{name}] 끌어서 {need}칸 고르기 {sel}")
        # 마지막 칸 톡 = 빠짐, 다시 고르기
        if need > 1:
            x, y = center(path[-1]); pg.mouse.click(x, y)
            ok(pg.evaluate("__T.G.ui.sel.length") == need - 1, f"[{name}] 고른 칸 톡 → 빠짐")
            pg.mouse.click(x, y)
        ok(pg.is_enabled('[data-a="place"]'), f"[{name}] 놓기 버튼 켜짐")
        pg.screenshot(path=str(SHOTS / f"2-select-{name}.png"))
        pg.click('[data-a="place"]')
        pg.wait_for_function("__T.G.s.turn===1 && !__T.G.ui.busy")
        ok(pg.evaluate("__T.R.cellsOf(__T.G.s,0).length") == need + 1, f"[{name}] 놓기 → 2P 차례")
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

    # 컴퓨터 상대 + 카드
    pg = b.new_page(viewport={"width": 1180, "height": 820}, has_touch=True)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(URL + "?test&fast&seed=9")
    pg.click('[data-mode="normal"]'); pg.click('[data-a="new"]'); pg.click('[data-p="squirtle"]')
    pg.wait_for_selector(".board")
    pg.wait_for_function("__T.G && __T.G.s.phase==='roll' && __T.G.s.turn===0 && !__T.G.ui.busy")
    # +2 카드 쓰기
    pg.click('[data-card="0"]'); pg.click('[data-a="useCard"]')
    pg.wait_for_function("__T.G.s.card==='plus2' && !__T.G.ui.busy")
    pg.click('[data-a="roll"]')
    pg.wait_for_function("__T.G.s.phase==='place' && !__T.G.ui.busy")
    ok(pg.evaluate("__T.G.s.need") == pg.evaluate("Math.ceil((__T.G.s.die+2)/2)"), "+2 카드 + 첫 차례 절반")
    pg.evaluate("__T.doPlace(window.Cpu.choosePlace(__T.G.s,'normal',Math.random))")
    pg.wait_for_function("__T.G.s.turn===0 && __T.G.s.turns>=2 && !__T.G.ui.busy", timeout=20000)
    ok(pg.evaluate("__T.R.cellsOf(__T.G.s,1).length") > 1, "컴퓨터가 땅을 붙임")
    pg.screenshot(path=str(SHOTS / "4-vs-cpu.png"))
    ok(not errs, f"[cpu] 오류 없음 {errs[:3]}")
    b.close()
srv.shutdown()
print("✗ 실패 %d" % len(fails) if fails else "✓ 화면 시험 통과")
sys.exit(1 if fails else 0)
