"""영어 음성을 Microsoft Edge TTS 로 미리 녹음한다 (아이 목소리 en-US-AnaNeural).

    py -m pip install edge-tts
    py tools/gen-voice.py         # 없는 것만
    py tools/gen-voice.py --all   # 전부 다시

문장은 js/lines.js 의 LINES — 파일 이름 = assets/voice/<id>.mp3 . 안 쓰는 mp3 는 지운다.
"""
import asyncio, json, pathlib, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "voice"
VOICE = "en-US-AnaNeural"


async def main():
    import edge_tts
    r = subprocess.run(["node", "-e", "console.log(JSON.stringify(require('./js/lines.js').LINES))"], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    lines = json.loads(r.stdout)
    OUT.mkdir(parents=True, exist_ok=True)
    allp = "--all" in sys.argv
    for k, text in lines.items():
        f = OUT / f"{k}.mp3"
        if f.exists() and not allp:
            continue
        await edge_tts.Communicate(text, VOICE, rate="-10%").save(str(f))
        print("녹음", k, text)
    for f in OUT.glob("*.mp3"):
        if f.stem not in lines:
            f.unlink()
            print("지움", f.name)


asyncio.run(main())
